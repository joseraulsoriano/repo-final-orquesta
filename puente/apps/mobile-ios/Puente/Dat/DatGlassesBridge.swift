import AVFoundation
import CoreLocation
import Foundation
import MWDATCore
import UIKit
#if DEBUG
import MWDATMockDevice
#endif

@MainActor
final class DatGlassesBridge: GlassesBridge {
    private let worker: WorkerClient
    private let streamSession: StreamSessionViewModel
    private let onLog: (String) -> Void
    private let onSessionSnapshot: ((DeviceSessionSnapshot) -> Void)?

    private var configured = false
    private var registrationState: RegistrationState = .unavailable
    private var registrationToken: AnyListenerToken?
    private var devicesToken: AnyListenerToken?
    private var knownDeviceIds: [DeviceIdentifier] = []
    private var selectedDeviceId: DeviceIdentifier?
    /// Señal cuando Meta AI devuelve puente://…&metaWearablesAction=register
    private var registrationDeeplinkHandled = false
    private var session: DeviceSession?
    private var datSessionStateLabel = "none"
    private var sessionStateToken: AnyListenerToken?
    private var sessionErrorToken: AnyListenerToken?
    /// Última razón reportada por DeviceSession.errorPublisher (p. ej. thermalCritical,
    /// sessionAlreadyExists, datAppOnTheGlassesUpdateRequired). Sin esto, la sesión
    /// se cae "en silencio" y solo vemos starting→stopping→stopped.
    private var lastSessionError: String?
    private var cameraPermissionLabel: String?

    private var locationManager: CLLocationManager?
    private var lastGps: Gps?
    private var useMock = false

    init(
        worker: WorkerClient,
        streamSession: StreamSessionViewModel,
        onLog: @escaping (String) -> Void = { _ in },
        onSessionSnapshot: ((DeviceSessionSnapshot) -> Void)? = nil
    ) {
        self.worker = worker
        self.streamSession = streamSession
        self.onLog = onLog
        self.onSessionSnapshot = onSessionSnapshot
    }

    func handleDeepLink(_ url: URL) async -> Bool {
        onLog("[deeplink] \(url.absoluteString)")
        do {
            let handled = try await Wearables.shared.handleUrl(url)
            onLog("[deeplink] handled=\(handled)")
            if handled, url.absoluteString.contains("metaWearablesAction=register") {
                registrationDeeplinkHandled = true
                // El SDK actualiza el estado de forma async tras handleUrl.
                try? await Task.sleep(nanoseconds: 500_000_000)
                onLog("[dat] registro post-deeplink = \(registrationState)")
            }
            return handled
        } catch {
            onLog("[deeplink:error] \(error.localizedDescription)")
            return false
        }
    }

    /// Configura el SDK Meta (listeners). No bloquea en gafas ni permisos.
    func setupSDK(useMockDevice: Bool) async throws {
        useMock = useMockDevice
        guard !configured else { return }
        onLog("[dat] configure()…")
        try Wearables.configure()
        registrationToken = Wearables.shared.addRegistrationStateListener { [weak self] state in
            Task { @MainActor in
                guard let self else { return }
                self.onLog("[dat] registro → \(state)")
                self.registrationState = state
                self.publishSnapshot()
            }
        }
        devicesToken = Wearables.shared.addDevicesListener { [weak self] devices in
            Task { @MainActor in
                self?.knownDeviceIds = devices
                self?.logDevices(prefix: "devices cambió")
                self?.publishSnapshot()
            }
        }
        configured = true
        try await Task.sleep(nanoseconds: 1_500_000_000)
        refreshRegistrationState()
        onLog("[dat] registro inicial = \(registrationState)")
        startLocation()
        publishSnapshot()
    }

    /// Intenta conectar gafas + permisos + sesión DAT. Devuelve false si falta acción del usuario (reintenta después).
    func connectGlasses(onPhase: (DatConnectionPhase) -> Void) async -> Bool {
        guard !isDeviceSessionReady else {
            onPhase(.ready)
            return true
        }

        if useMock {
            #if DEBUG
            onPhase(.starting)
            onLog("[dat] MockDeviceKit…")
            do {
                try await PuenteMockDevice.bootstrap(onLog: onLog)
                selectedDeviceId = firstEligibleDeviceId() ?? knownDeviceIds.first
                onPhase(.openingSession)
                try await openDeviceSession(deviceId: selectedDeviceId)
                guard let session else { return false }
                try await waitForSessionStarted(session)
                onPhase(.ready)
                publishSnapshot()
                return true
            } catch {
                onLog("[dat:mock:error] \(error.localizedDescription)")
                return false
            }
            #else
            return false
            #endif
        }

        onPhase(.waitingRegistration)
        await waitForRegistrationKnown(timeoutMs: 5_000)
        if registrationState != .registered {
            onLog("[dat] startRegistration() → Meta AI…")
            do {
                try await Wearables.shared.startRegistration()
            } catch {
                onLog("[dat] startRegistration error: \(error.localizedDescription)")
            }
            if !(await waitForRegisteredSoft(timeoutMs: 45_000)) {
                onLog("[dat] registro pendiente — usuario debe completar en Meta AI")
                return false
            }
        }

        onPhase(.waitingDevice)
        guard let deviceId = await waitForKnownDevice(timeoutMs: 90_000) else {
            onLog("[dat] sin dispositivos — abre Meta AI y vincula gafas")
            openMetaAIApp()
            return false
        }
        selectedDeviceId = deviceId
        publishSnapshot()

        onPhase(.waitingBluetooth)
        if !(await waitForBluetoothLinkSoft(deviceId: deviceId, timeoutMs: 120_000)) {
            return false
        }

        onPhase(.waitingCameraPermission)
        if !(await ensureCameraPermissionSoft()) {
            return false
        }

        onPhase(.openingSession)
        do {
            try await openDeviceSession(deviceId: selectedDeviceId)
            guard let session else { return false }
            try await waitForSessionStarted(session)
            onLog("[dat] Device Session ready")
            onPhase(.ready)
            publishSnapshot()
            return true
        } catch {
            onLog("[dat:session:error] \(error.localizedDescription)")
            return false
        }
    }

    /// Compat: arranque bloqueante (tests). Preferir setupSDK + connectGlasses.
    func initBridge(useMockDevice: Bool) async throws {
        try await setupSDK(useMockDevice: useMockDevice)
        let ok = await connectGlasses { _ in }
        guard ok else {
            throw NSError(domain: "Puente", code: 12, userInfo: [
                NSLocalizedDescriptionKey: "Gafas no listas — completa registro y permisos en Meta AI."
            ])
        }
    }

    /// Patrón Meta: tras sesión `.started`, arrancar stream (típicamente al montar StreamView).
    func startCameraStream() async throws {
        guard let session else {
            throw NSError(domain: "Puente", code: 13, userInfo: [NSLocalizedDescriptionKey: "Sin sesión DAT"])
        }
        streamSession.onChanged = { [weak self] in self?.publishSnapshot() }
        try await streamSession.start(on: session)
        publishSnapshot()
    }

    var isDeviceSessionReady: Bool {
        session != nil && datSessionStateLabel == "started"
    }

    // MARK: - Device session manager

    func currentSnapshot() -> DeviceSessionSnapshot {
        refreshRegistrationState()
        let devices = knownDeviceIds.compactMap { id -> DeviceSessionRow? in
            guard let device = Wearables.shared.deviceForIdentifier(id) else { return nil }
            let name = device.name.isEmpty ? "Ray-Ban Meta" : device.name
            return DeviceSessionRow(
                id: String(describing: id),
                name: name,
                linkState: String(describing: device.linkState),
                compatibility: String(describing: device.compatibility()),
                isSelected: selectedDeviceId.map { String(describing: $0) == String(describing: id) } ?? false
            )
        }
        let recent = streamSession.hasRecentFrame
        return DeviceSessionSnapshot(
            registrationState: String(describing: registrationState),
            devices: devices,
            datSessionState: datSessionStateLabel,
            streamState: streamSession.streamStateLabel,
            frameCount: streamSession.frameCount,
            hasRecentFrame: recent,
            cameraPermission: cameraPermissionLabel,
            useMockDevice: useMock,
            selectedDeviceId: selectedDeviceId.map { String(describing: $0) },
            workerReachable: false,
            workerURL: AppConfig.workerBaseURL,
            commandURL: AppConfig.commandBaseURL,
            crossingWSURL: AppConfig.crossingWSURL,
            activeModule: PuenteModule.supermercado.displayName,
            lastUpdated: Date()
        )
    }

    func openMetaAI() {
        openMetaAIApp()
        publishSnapshot()
    }

    func requestRegistration() async throws {
        onLog("[dat] startRegistration() manual…")
        try await Wearables.shared.startRegistration()
        publishSnapshot()
    }

    func refreshCameraPermission() async {
        do {
            let status = try await Wearables.shared.checkPermissionStatus(.camera)
            cameraPermissionLabel = String(describing: status)
            onLog("[dat] permiso cámara (refresh) = \(status)")
        } catch {
            cameraPermissionLabel = error.localizedDescription
            onLog("[dat] permiso cámara (refresh) error: \(error.localizedDescription)")
        }
        publishSnapshot()
    }

    func restartDeviceSession() async throws {
        onLog("[dat] reiniciando sesión DAT…")
        await streamSession.stop()
        sessionStateToken = nil
        sessionErrorToken = nil
        session?.stop()
        session = nil
        datSessionStateLabel = "restarting"

        try await openDeviceSession(deviceId: selectedDeviceId)
        guard let session else {
            throw NSError(domain: "Puente", code: 13, userInfo: [NSLocalizedDescriptionKey: "Sesión DAT nula tras reinicio"])
        }
        try await waitForSessionStarted(session)
        try await startCameraStream()
        publishSnapshot()
    }

    private func publishSnapshot() {
        onSessionSnapshot?(currentSnapshot())
    }

    private func attachSessionStateListener(_ session: DeviceSession) {
        lastSessionError = nil
        sessionStateToken = session.statePublisher.listen { [weak self] state in
            Task { @MainActor in
                self?.datSessionStateLabel = String(describing: state)
                self?.onLog("[dat] session state = \(state)")
                self?.publishSnapshot()
            }
        }
        // Razón real de los stops: el SDK la anuncia aquí, no en statePublisher.
        sessionErrorToken = session.errorPublisher.listen { [weak self] error in
            Task { @MainActor in
                let reason = error.errorDescription ?? String(describing: error)
                self?.lastSessionError = reason
                self?.onLog("[dat:session:errorPublisher] \(reason)")
                self?.publishSnapshot()
            }
        }
    }

    private func waitForSessionStarted(_ session: DeviceSession, timeoutMs: Int = 20_000) async throws {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            var token: AnyListenerToken?
            var finished = false

            token = session.statePublisher.listen { [weak self] state in
                Task { @MainActor in
                    self?.onLog("[dat] session state = \(state)")
                    guard !finished else { return }
                    if state == .started {
                        finished = true
                        token = nil
                        cont.resume()
                    } else if state == .stopped {
                        finished = true
                        token = nil
                        let reason = self?.lastSessionError ?? "sin detalle (errorPublisher no emitió)"
                        cont.resume(throwing: NSError(
                            domain: "Puente",
                            code: 14,
                            userInfo: [NSLocalizedDescriptionKey: "Sesión DAT se detuvo antes de arrancar: \(reason)"]
                        ))
                    }
                }
            }

            Task { @MainActor in
                try await Task.sleep(nanoseconds: UInt64(timeoutMs) * 1_000_000)
                guard !finished else { return }
                finished = true
                token = nil
                cont.resume(throwing: NSError(
                    domain: "Puente",
                    code: 15,
                    userInfo: [NSLocalizedDescriptionKey: "Timeout esperando session.state=started"]
                ))
            }
        }
    }

    func captureFrameJpegBase64(maxHeight: CGFloat) async throws -> String {
        try await streamSession.captureFrameJpegBase64(maxHeight: maxHeight)
    }

    func gps() -> Gps? { lastGps }

    private var ttsPlayer: AVAudioPlayer?

    func playTts(_ audioMp3: Data) async throws {
        try await AudioRouter.shared.configurePlaybackRoute()
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("tts_\(UUID().uuidString).mp3")
        try audioMp3.write(to: url)
        let player = try AVAudioPlayer(contentsOf: url)
        ttsPlayer = player
        player.volume = 1.0
        guard player.prepareToPlay(), player.play() else {
            throw NSError(domain: "Puente", code: 40, userInfo: [
                NSLocalizedDescriptionKey: "AVAudioPlayer no pudo iniciar TTS"
            ])
        }
        onLog("[tts] reproduciendo \(audioMp3.count) bytes, \(String(format: "%.1f", player.duration))s, a2dp=\(AudioRouter.shared.hasA2DPOutput())")
        AudioRouter.shared.logRoute(prefix: "[tts:play]")
        let started = Date()
        while player.isPlaying, Date().timeIntervalSince(started) < 90 {
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        if player.isPlaying {
            player.stop()
            onLog("[tts:warn] timeout reproducción")
        }
        ttsPlayer = nil
        try? FileManager.default.removeItem(at: url)
        try? await Task.sleep(nanoseconds: 250_000_000)
        try? await AudioRouter.shared.ensureHFP()
        AudioRouter.shared.logRoute(prefix: "[tts:post-hfp]")
    }

    func vibrate(ms: Int) {
        let generator = UIImpactFeedbackGenerator(style: .heavy)
        generator.impactOccurred()
        if ms > 200 {
            DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(ms / 2)) {
                generator.impactOccurred()
            }
        }
    }

    func listenOnce(isActive: @escaping () -> Bool, onPartial: ((String) -> Void)? = nil) async throws -> String {
        onLog("[stt] token worker (\(AppConfig.workerBaseURL))…")
        let token: String
        do {
            token = try await worker.transcribeToken()
            onLog("[stt] token OK")
        } catch {
            let msg = error.localizedDescription
            if msg.contains("timed out") || msg.contains("offline") || (error as NSError).code == NSURLErrorTimedOut {
                throw NSError(domain: "Puente", code: 30, userInfo: [
                    NSLocalizedDescriptionKey: WorkerClient.networkHint(baseURL: AppConfig.workerBaseURL)
                ])
            }
            throw error
        }
        let stt = AssemblyAiStt()
        stt.onPartial = onPartial
        try await stt.connect(token: token)
        onLog("[stt] WS abierto")

        let usingGlassesMic = await AudioRouter.shared.ensureHFPOrPhoneMic()
        onLog("[stt] mic=\(usingGlassesMic ? "gafas HFP" : "iPhone")")
        AudioRouter.shared.logRoute(prefix: "[stt]")

        var chunks = 0
        _ = try AudioRouter.shared.startCapture { buffer in
            guard let pcm = PCM16Converter.toMono16k(buffer) else { return }
            chunks += 1
            stt.sendPCM(pcm)
        }
        onLog("[stt] grabando…")

        let started = Date()
        let maxSeconds: TimeInterval = 12
        while !stt.endOfTurn && !stt.failed && Date().timeIntervalSince(started) < maxSeconds {
            if !isActive() { stt.forceEndpoint() }
            try await Task.sleep(nanoseconds: 80_000_000)
        }

        AudioRouter.shared.stopCapture()
        let text = stt.terminate().trimmingCharacters(in: .whitespacesAndNewlines)
        onLog("[stt] fin chunks=\(chunks) \"\(text.isEmpty ? "(vacío)" : text)\"")
        if text.isEmpty {
            AudioRouter.shared.logRoute(prefix: "[stt:vacío]")
            if chunks == 0 {
                onLog("[stt:warn] mic sin audio — ¿ruta HFP de las gafas?")
            }
        }
        return text
    }

    func isConnected() -> Bool { session != nil }

    func dispose() async {
        registrationToken = nil
        devicesToken = nil
        locationManager?.stopUpdatingLocation()
        sessionStateToken = nil
        sessionErrorToken = nil
        await streamSession.stop()
        session?.stop()
        session = nil
        datSessionStateLabel = "stopped"
        publishSnapshot()
    }

    // MARK: - Private

    private func refreshRegistrationState() {
        registrationState = Wearables.shared.registrationState
    }

    /// Meta exige gafas conectadas antes de check/request de permiso cámara (PermissionError 1 = noDeviceWithConnection).
    private func ensureCameraPermissionSoft() async -> Bool {
        do {
            try await ensureCameraPermission()
            return true
        } catch {
            onLog("[dat] permiso cámara falló: \(error.localizedDescription)")
            return false
        }
    }

    private func ensureCameraPermission() async throws {
        var lastError: Error?
        for attempt in 1...6 {
            do {
                let existing = try await Wearables.shared.checkPermissionStatus(.camera)
                if existing == .granted {
                    onLog("[dat] permiso cámara ya concedido")
                    cameraPermissionLabel = "granted"
                    publishSnapshot()
                    return
                }
                let cam = try await Wearables.shared.requestPermission(.camera)
                onLog("[dat] permiso cámara = \(cam)")
                cameraPermissionLabel = String(describing: cam)
                publishSnapshot()
                guard cam == .granted else {
                    throw NSError(domain: "Puente", code: 1, userInfo: [
                        NSLocalizedDescriptionKey: "Permiso cámara denegado en Meta AI"
                    ])
                }
                return
            } catch {
                lastError = error
                let msg = Self.permissionErrorMessage(error)
                onLog("[dat] permiso cámara intento \(attempt)/6: \(msg)")
                logDevices(prefix: "permiso reintento")
                if Self.isRetryablePermissionError(error), attempt < 6 {
                    if let id = selectedDeviceId ?? knownDeviceIds.first {
                        onLog("[dat] permiso: reintentando tras esperar BT…")
                        try? await waitForBluetoothLink(deviceId: id, timeoutMs: 25_000)
                    } else if attempt == 2 {
                        openMetaAIApp()
                    }
                    try await Task.sleep(nanoseconds: UInt64(attempt) * 1_500_000_000)
                    continue
                }
                throw NSError(domain: "Puente", code: 1, userInfo: [
                    NSLocalizedDescriptionKey: msg
                ])
            }
        }
        throw lastError ?? NSError(domain: "Puente", code: 1, userInfo: [
            NSLocalizedDescriptionKey: "No se pudo obtener permiso de cámara"
        ])
    }

    private static func isRetryablePermissionError(_ error: Error) -> Bool {
        let ns = error as NSError
        guard ns.domain.contains("PermissionError") else { return false }
        return ns.code == 0 || ns.code == 1 || ns.code == 2 // noDevice, noDeviceWithConnection, connectionError
    }

    private static func permissionErrorMessage(_ error: Error) -> String {
        let ns = error as NSError
        guard ns.domain.contains("PermissionError") else {
            return error.localizedDescription
        }
        switch ns.code {
        case 0:
            return "Meta no ve gafas. Ábrelas, despliégalas, póntelas y verifica en Meta AI."
        case 1:
            return "Gafas sin conexión BT (link=disconnected). Abre Meta AI y espera connected."
        case 2:
            return "Error de conexión con las gafas. Reintenta en Meta AI."
        case 3:
            return "Meta AI no instalada."
        default:
            return error.localizedDescription
        }
    }

    /// El listener puede tardar; leemos también Wearables.shared.registrationState.
    private func waitForRegistrationKnown(timeoutMs: Int) async {
        let start = Date()
        while Date().timeIntervalSince(start) * 1000 < Double(timeoutMs) {
            refreshRegistrationState()
            if registrationState != .unavailable { return }
            try? await Task.sleep(nanoseconds: 300_000_000)
        }
    }

    private func waitForRegisteredSoft(timeoutMs: Int) async -> Bool {
        let start = Date()
        registrationDeeplinkHandled = false
        while Date().timeIntervalSince(start) * 1000 < Double(timeoutMs) {
            refreshRegistrationState()
            if registrationState == .registered {
                onLog("[dat] registro OK")
                return true
            }
            if registrationDeeplinkHandled {
                try? await Task.sleep(nanoseconds: 800_000_000)
                refreshRegistrationState()
                if registrationState == .registered {
                    onLog("[dat] registro OK (tras deeplink)")
                    return true
                }
            }
            try? await Task.sleep(nanoseconds: 300_000_000)
        }
        onLog("[dat] registro timeout, estado=\(registrationState)")
        return registrationState == .registered
    }

    private func waitForRegistered(timeoutMs: Int) async throws {
        guard await waitForRegisteredSoft(timeoutMs: timeoutMs) else {
            throw NSError(
                domain: "Puente",
                code: 10,
                userInfo: [NSLocalizedDescriptionKey:
                    "Registro no completó (estado=\(registrationState)). ¿Tocaste Conectar en Meta AI?"]
            )
        }
    }

    /// Espera a que Meta AI liste al menos un dispositivo (no exige link=connected).
    private func waitForKnownDevice(timeoutMs: Int) async -> DeviceIdentifier? {
        let start = Date()
        while Date().timeIntervalSince(start) * 1000 < Double(timeoutMs) {
            if let first = knownDeviceIds.first {
                onLog("[dat] dispositivo en Meta AI: \(first)")
                logDevices(prefix: "dispositivo")
                return first
            }
            logDevices(prefix: "esperando dispositivo")
            try? await Task.sleep(nanoseconds: 600_000_000)
        }
        logDevices(prefix: "sin dispositivo aún")
        return knownDeviceIds.first
    }

    /// El SDK exige link=connected antes de requestPermission(.camera) (PermissionError 1).
    private func waitForBluetoothLinkSoft(deviceId: DeviceIdentifier, timeoutMs: Int) async -> Bool {
        if isBluetoothReady(deviceId) {
            logDevices(prefix: "BT ok")
            return true
        }
        do {
            try await waitForBluetoothLink(deviceId: deviceId, timeoutMs: timeoutMs)
            return true
        } catch {
            onLog("[dat] BT timeout: \(error.localizedDescription)")
            return false
        }
    }

    private func waitForBluetoothLink(deviceId: DeviceIdentifier, timeoutMs: Int) async throws {
        if isBluetoothReady(deviceId) {
            logDevices(prefix: "BT ok")
            return
        }

        onLog("[dat] BT disconnected — abriendo Meta AI (tab Devices → Connected)")
        openMetaAIApp()

        var linkToken: AnyListenerToken?
        var compatToken: AnyListenerToken?
        var sawConnected = false
        if let device = Wearables.shared.deviceForIdentifier(deviceId) {
            linkToken = device.addLinkStateListener { [weak self] state in
                Task { @MainActor in
                    self?.onLog("[dat] link → \(state)")
                    if state == .connected { sawConnected = true }
                }
            }
            compatToken = device.addCompatibilityListener { [weak self] compat in
                Task { @MainActor in
                    self?.onLog("[dat] compat → \(compat)")
                    if compat == .deviceUpdateRequired {
                        self?.onLog("[dat:warn] firmware bajo — actualiza gafas en Meta AI (v125+)")
                    } else if compat == .undefined {
                        self?.onLog("[dat:hint] compat=undefined: instala app DAT en gafas (Meta AI → App connections)")
                    }
                }
            }
        }

        let start = Date()
        var lastMetaOpen = start
        while Date().timeIntervalSince(start) * 1000 < Double(timeoutMs) {
            if isBluetoothReady(deviceId) || sawConnected {
                onLog("[dat] BT connected")
                logDevices(prefix: "BT ok")
                linkToken = nil
                compatToken = nil
                return
            }
            logDevices(prefix: "esperando BT")
            if Date().timeIntervalSince(lastMetaOpen) > 12 {
                lastMetaOpen = Date()
                onLog("[dat] Meta AI: despliega gafas, póntelas, espera Connected")
                openMetaAIApp()
            }
            try await Task.sleep(nanoseconds: 800_000_000)
        }

        linkToken = nil
        compatToken = nil
        logDevices(prefix: "timeout BT")
        throw NSError(domain: "Puente", code: 12, userInfo: [
            NSLocalizedDescriptionKey:
                "Bluetooth no conectó. Meta AI → Devices → Connected. " +
                "Si compat=undefined, instala la app DAT en las gafas (Developer Mode → App connections)."
        ])
    }

    private func isBluetoothReady(_ deviceId: DeviceIdentifier) -> Bool {
        Wearables.shared.deviceForIdentifier(deviceId)?.linkState == .connected
    }

    private func openMetaAIApp() {
        onLog("[dat] abriendo Meta AI — conecta las gafas y vuelve a Puente")
        guard let url = URL(string: "fb-viewapp://") else { return }
        UIApplication.shared.open(url, options: [:], completionHandler: nil)
    }

    /// Abre sesión DAT. El error `noEligibleDevice` lo lanza el **SDK Meta** (MWDATCore),
    /// no Puente ni el Worker — suele pasar si AutoDeviceSelector no elige bien: usamos ID fijo.
    private func openDeviceSession(deviceId: DeviceIdentifier?) async throws {
        let selector: any DeviceSelector
        if let deviceId {
            onLog("[dat] createSession() SpecificDeviceSelector(\(deviceId))…")
            selector = SpecificDeviceSelector(device: deviceId)
        } else {
            onLog("[dat] createSession() AutoDeviceSelector…")
            selector = AutoDeviceSelector(wearables: Wearables.shared)
        }

        var lastError: Error?
        var openedMetaAI = false
        for attempt in 1...8 {
            session?.stop()
            session = nil
            do {
                session = try Wearables.shared.createSession(deviceSelector: selector)
                attachSessionStateListener(session!)
                try session?.start()
                onLog("[dat] sesión DAT abierta (intento \(attempt))")
                publishSnapshot()
                return
            } catch {
                lastError = error
                onLog("[dat] intento \(attempt)/8: \(error.localizedDescription)")
                logDevices(prefix: "reintento")
                if !openedMetaAI, attempt == 3, firstEligibleDeviceId() == nil {
                    openedMetaAI = true
                    openMetaAIApp()
                }
                try await Task.sleep(nanoseconds: 2_000_000_000)
            }
        }
        logDevices(prefix: "createSession agotado")
        throw NSError(
            domain: "Puente",
            code: 11,
            userInfo: [NSLocalizedDescriptionKey:
                "SDK Meta: noEligibleDevice (\((lastError as NSError?)?.localizedDescription ?? "?")). " +
                "Cierra sesión en Meta AI (Hey Meta), desregistra otra app DAT, " +
                "reabre Meta AI con gafas conectadas y vuelve a Puente."]
        )
    }

    private func firstEligibleDeviceId() -> DeviceIdentifier? {
        knownDeviceIds.first { id in
            guard let device = Wearables.shared.deviceForIdentifier(id) else { return false }
            return device.linkState == .connected && device.compatibility() == .compatible
        }
    }

    private func logDevices(prefix: String) {
        if knownDeviceIds.isEmpty {
            onLog("[dat] \(prefix): sin dispositivos en Meta AI")
            return
        }
        for id in knownDeviceIds {
            guard let device = Wearables.shared.deviceForIdentifier(id) else { continue }
            let label = device.name.isEmpty ? id : "\(device.name) \(id)"
            onLog("[dat] \(prefix): \(label) link=\(device.linkState) compat=\(device.compatibility())")
        }
    }

    private func startLocation() {
        let mgr = CLLocationManager()
        mgr.requestWhenInUseAuthorization()
        mgr.startUpdatingLocation()
        locationManager = mgr
        if let loc = mgr.location {
            lastGps = Gps(lat: loc.coordinate.latitude, lng: loc.coordinate.longitude, accuracyM: loc.horizontalAccuracy)
        }
    }
}

#if DEBUG
enum PuenteMockDevice {
    @MainActor
    static func bootstrap(onLog: (String) -> Void) async throws {
        let config = MockDeviceKitConfig(
            initiallyRegistered: true,
            initialPermissionsGranted: true
        )
        MockDeviceKit.shared.enable(config: config)
        let device = MockDeviceKit.shared.pairRaybanMeta()
        try device.powerOn()
        try device.unfold()
        try device.don()
        await device.services.camera.setCameraFeed(cameraFacing: .back)
        onLog("[dat] mock device \(device.deviceIdentifier) listo")
    }
}
#endif
