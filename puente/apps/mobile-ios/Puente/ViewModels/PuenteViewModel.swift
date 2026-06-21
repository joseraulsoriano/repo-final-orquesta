import Foundation

@MainActor
final class PuenteViewModel: ObservableObject {
    @Published var status = "Iniciando…"
    @Published var live = false
    @Published var glassesReady = false
    @Published var connectionPhase: DatConnectionPhase = .starting
    @Published var listening = false
    @Published var partialTranscript = ""
    @Published var said: [String] = []
    @Published var logs: [String] = []
    @Published var deviceSession = DeviceSessionSnapshot.empty
    @Published var showDeviceSessionManager = false
    @Published var activeModule: PuenteModule = .asistente
    @Published var showOnboardingDisclaimer = false

    lazy var streamSession: StreamSessionViewModel = {
        StreamSessionViewModel(onLog: { [weak self] in self?.log($0) })
    }()

    private var worker: WorkerClient?
    private var command: CommandClient?
    private var bridge: DatGlassesBridge?
    private var moduleRouter: ModuleRouter?
    private var bootTask: Task<Void, Never>?
    private var glassesTask: Task<Void, Never>?
    private var streamStarted = false
    private var flowsStarted = false
    private let sessionId = AppConfig.demoState().sessionId

    var useMockDevice = false

    func boot(initialURL: URL?) {
        bootTask?.cancel()
        bootTask = Task { await self.runBoot(initialURL: initialURL) }
    }

    func handleURL(_ url: URL) {
        Task { @MainActor in
            _ = await self.bridge?.handleDeepLink(url)
            scheduleGlassesConnection(immediate: true)
        }
    }

    func shutdown() {
        bootTask?.cancel()
        glassesTask?.cancel()
        moduleRouter?.stopAll()
        Task { await bridge?.dispose() }
    }

    func switchModule(_ module: PuenteModule) async {
        await moduleRouter?.switchModule(to: module)
    }

    func ensureCameraStreamStarted() async {
        guard glassesReady, let bridge, bridge.isDeviceSessionReady, !streamStarted else { return }
        do {
            try await bridge.startCameraStream()
            streamStarted = true
            log("[stream] StreamSessionViewModel activo")
        } catch {
            log("[stream:error] \(error.localizedDescription)")
        }
    }

    func refreshDeviceSession() async {
        await bridge?.refreshCameraPermission()
        mergeDeviceSession(bridge?.currentSnapshot())
    }

    func openMetaAI() {
        bridge?.openMetaAI()
    }

    func requestRegistration() async {
        do {
            try await bridge?.requestRegistration()
        } catch {
            log("[session:error] registro: \(error.localizedDescription)")
        }
        mergeDeviceSession(bridge?.currentSnapshot())
        scheduleGlassesConnection(immediate: true)
    }

    func refreshCameraPermission() async {
        await bridge?.refreshCameraPermission()
        mergeDeviceSession(bridge?.currentSnapshot())
        scheduleGlassesConnection(immediate: true)
    }

    func restartDeviceSession() async {
        guard let bridge else { return }
        streamStarted = false
        glassesReady = false
        flowsStarted = false
        moduleRouter?.stopAll()
        do {
            try await bridge.restartDeviceSession()
            streamStarted = true
            glassesReady = true
            connectionPhase = .ready
            status = "Listo"
            log("[session] sesión DAT + stream reiniciados")
            await startFlowsIfReady()
        } catch {
            log("[session:error] reinicio: \(error.localizedDescription)")
            scheduleGlassesConnection(immediate: true)
        }
        mergeDeviceSession(bridge.currentSnapshot())
    }

    func dismissOnboardingDisclaimer() {
        showOnboardingDisclaimer = false
        UserDefaults.standard.set(true, forKey: "puente.disclaimer.accepted")
    }

    private func mergeDeviceSession(_ snap: DeviceSessionSnapshot?) {
        guard var snap else { return }
        snap.workerReachable = workerReachable
        snap.workerURL = AppConfig.workerBaseURL
        snap.commandURL = AppConfig.commandBaseURL
        snap.crossingWSURL = AppConfig.crossingWSURL
        snap.activeModule = activeModule.displayName
        deviceSession = snap
    }

    private func log(_ s: String) {
        print(s)
        logs = Array((logs + [s]).suffix(150))
    }

    private var workerReachable = false

    private func wireSpeechHandler() -> (String) -> Void {
        { [weak self] t in
            guard let self else { return }
            if t == "[listening]1" {
                self.listening = true
                self.partialTranscript = ""
                return
            }
            if t == "[listening]0" {
                self.listening = false
                return
            }
            if t.hasPrefix("[partial]") {
                self.partialTranscript = String(t.dropFirst(9))
                return
            }
            if t.hasPrefix("[") {
                self.log(t)
                if t.contains(":error]") {
                    self.said = Array((self.said + [t.replacingOccurrences(of: "]", with: "").components(separatedBy: "] ").last ?? t]).suffix(12))
                }
                return
            }
            self.partialTranscript = ""
            self.said = Array((self.said + [t]).suffix(12))
        }
    }

    private func runBoot(initialURL: URL?) async {
        let worker = WorkerClient(baseURL: AppConfig.workerBaseURL)
        let command = CommandClient(baseURL: AppConfig.commandBaseURL)
        self.worker = worker
        self.command = command

        if !UserDefaults.standard.bool(forKey: "puente.disclaimer.accepted") {
            showOnboardingDisclaimer = true
        }

        streamSession.onChanged = { [weak self] in
            self?.mergeDeviceSession(self?.bridge?.currentSnapshot())
        }

        let bridge = DatGlassesBridge(
            worker: worker,
            streamSession: streamSession,
            onLog: { [weak self] in self?.log($0) },
            onSessionSnapshot: { [weak self] snap in
                self?.mergeDeviceSession(snap)
            }
        )
        self.bridge = bridge

        if let initialURL {
            _ = await bridge.handleDeepLink(initialURL)
        }

        async let workerHealth: Void = checkWorkerHealth(worker)
        do {
            try await bridge.setupSDK(useMockDevice: useMockDevice)
        } catch {
            status = "Error Meta DAT"
            said = [error.localizedDescription]
            log("[init:dat:error] \(error.localizedDescription)")
            return
        }
        await workerHealth

        live = true
        connectionPhase = .starting
        status = connectionPhase.bannerText
        mergeDeviceSession(bridge.currentSnapshot())
        let count = ContactStore.loadContacts().count
        log("[init] Puente Caras: \(count) contacto(s) cargados")
        setupFlows(worker: worker, command: command, bridge: bridge)
        scheduleGlassesConnection(immediate: true)
    }

    private func setupFlows(worker: WorkerClient, command: CommandClient, bridge: DatGlassesBridge) {
        let superFlow = SuperFlow(
            worker: worker,
            command: command,
            glasses: bridge,
            state: AppConfig.demoState(),
            userMd: AppConfig.userMd,
            memoryMd: AppConfig.memoryMd
        )
        let platformFlow = PlatformFlow(
            worker: worker,
            command: command,
            glasses: bridge,
            state: AppConfig.demoState(),
            userMd: AppConfig.userMd,
            memoryMd: AppConfig.memoryMd
        )
        platformFlow.onShopperDelegate = { transcript in
            try await superFlow.handleUserTranscript(transcript)
        }
        platformFlow.onRecognizeDelegate = { transcript in
            try await superFlow.recognizePeople(transcript)
        }
        platformFlow.onSessionStateSync = { updated in
            superFlow.mergeSessionState(updated)
        }
        let crossingFlow = CrossingFlow(
            worker: worker,
            glasses: bridge,
            crossing: CrossingClient(),
            sessionId: sessionId
        )
        let guideFlow = GuideFlow(
            worker: worker,
            glasses: bridge,
            userMd: AppConfig.userMd,
            memoryMd: AppConfig.memoryMd
        )

        let router = ModuleRouter()
        router.onModuleChanged = { [weak self] mod in
            self?.activeModule = mod
            self?.mergeDeviceSession(self?.bridge?.currentSnapshot())
            Task {
                try? await worker.sessionObserve([
                    "session_id": AnyEncodable(self?.sessionId ?? ""),
                    "type": AnyEncodable("module_switch"),
                    "module": AnyEncodable(mod.rawValue),
                ])
            }
        }

        let moduleSwitch: (PuenteModule) async -> Void = { mod in
            await router.switchModule(to: mod)
        }

        let speech = wireSpeechHandler()
        superFlow.onState = { [weak self] s in
            guard self?.glassesReady == true else { return }
            self?.status = s.rawValue
        }
        superFlow.onSpeech = speech
        superFlow.onModuleSwitch = moduleSwitch

        platformFlow.onState = { [weak self] s in
            guard self?.glassesReady == true else { return }
            self?.status = s.rawValue
        }
        platformFlow.onSpeech = speech
        platformFlow.onModuleSwitch = moduleSwitch

        crossingFlow.onState = { [weak self] s in
            guard self?.glassesReady == true else { return }
            self?.status = s.rawValue
        }
        crossingFlow.onSpeech = speech
        crossingFlow.onModuleSwitch = moduleSwitch
        crossingFlow.onVisionStructured = { [weak guideFlow] structured in
            guideFlow?.updateVision(structured)
        }

        guideFlow.onState = { [weak self] s in
            guard self?.glassesReady == true else { return }
            self?.status = s.rawValue
        }
        guideFlow.onSpeech = speech
        guideFlow.onModuleSwitch = moduleSwitch

        router.configure(
            platformFlow: platformFlow,
            superFlow: superFlow,
            crossingFlow: crossingFlow,
            guideFlow: guideFlow,
            streamSession: streamSession,
            glasses: bridge,
            command: command,
            worker: worker
        )
        moduleRouter = router
    }

    private func checkWorkerHealth(_ worker: WorkerClient) async {
        let workerURL = AppConfig.workerBaseURL
        log("[init] comprobando worker \(workerURL)…")
        #if !targetEnvironment(simulator)
        if workerURL.contains("localhost") {
            log("[init:warn] localhost en iPhone = el teléfono, NO tu Mac")
        }
        #endif
        do {
            let health = try await worker.healthCheck()
            workerReachable = true
            log("[init] worker OK anthropic=\(health.anthropic) stt=\(health.assemblyai) tts=\(health.elevenlabs)")
            worker.prefetchTranscribeToken()
            mergeDeviceSession(bridge?.currentSnapshot())
            if let gps = bridge?.gps() {
                LocationCache.prefetch(lat: gps.lat, lng: gps.lng)
            }
            await startFlowsIfReady()
        } catch {
            workerReachable = false
            log("[init:network] \(error.localizedDescription)")
            mergeDeviceSession(bridge?.currentSnapshot())
            if glassesReady {
                said = Array((said + [
                    "Worker no alcanzable. El stream de gafas funciona; voz/visión cuando Safari abra \(workerURL)/health"
                ]).suffix(4))
            }
        }
    }

    private func scheduleGlassesConnection(immediate: Bool) {
        glassesTask?.cancel()
        glassesTask = Task {
            if !immediate { try? await Task.sleep(nanoseconds: 5_000_000_000) }
            await glassesConnectionLoop()
        }
    }

    private func glassesConnectionLoop() async {
        guard let bridge else { return }
        while !Task.isCancelled {
            if bridge.isDeviceSessionReady {
                await markGlassesReady()
                return
            }

            connectionPhase = .starting
            status = connectionPhase.bannerText
            said = [connectionPhase.hint]

            let connected = await bridge.connectGlasses { [weak self] phase in
                guard let self else { return }
                self.connectionPhase = phase
                self.status = phase.bannerText
                self.said = [phase.hint]
                self.mergeDeviceSession(self.bridge?.currentSnapshot())
            }

            if connected {
                await markGlassesReady()
                return
            }

            connectionPhase = .retrying
            status = connectionPhase.bannerText
            said = [connectionPhase.hint]
            mergeDeviceSession(bridge.currentSnapshot())
            try? await Task.sleep(nanoseconds: 6_000_000_000)
        }
    }

    private func markGlassesReady() async {
        glassesReady = true
        connectionPhase = .ready
        status = "Listo"
        said = [DatConnectionPhase.ready.hint]
        mergeDeviceSession(bridge?.currentSnapshot())
        await ensureCameraStreamStarted()
        if let gps = bridge?.gps() {
            LocationCache.prefetch(lat: gps.lat, lng: gps.lng)
        }
        await startFlowsIfReady()
    }

    private func startFlowsIfReady() async {
        guard glassesReady, workerReachable, !flowsStarted else { return }
        flowsStarted = true
        log("[init] gafas + worker listos — arrancando módulo \(activeModule.rawValue)")
        await moduleRouter?.startActiveModule()
    }
}
