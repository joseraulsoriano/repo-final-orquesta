import Foundation

/// Enruta una sesión DAT al módulo activo (asistente / super / cruce / guía / mac).
@MainActor
final class ModuleRouter: ObservableObject {
    @Published private(set) var activeModule: PuenteModule = .asistente

    private var platformFlow: PlatformFlow?
    private var superFlow: SuperFlow?
    private var crossingFlow: CrossingFlow?
    private var guideFlow: GuideFlow?
    private var streamSession: StreamSessionViewModel?
    private var glasses: GlassesBridge?
    private var command: CommandClient?
    private var worker: WorkerClient?
    private var moduleTask: Task<Void, Never>?

    var onModuleChanged: ((PuenteModule) -> Void)?

    func configure(
        platformFlow: PlatformFlow,
        superFlow: SuperFlow,
        crossingFlow: CrossingFlow,
        guideFlow: GuideFlow,
        streamSession: StreamSessionViewModel,
        glasses: GlassesBridge,
        command: CommandClient,
        worker: WorkerClient
    ) {
        self.platformFlow = platformFlow
        self.superFlow = superFlow
        self.crossingFlow = crossingFlow
        self.guideFlow = guideFlow
        self.streamSession = streamSession
        self.glasses = glasses
        self.command = command
        self.worker = worker
        wireFrameFanOut()
    }

    func switchModule(to module: PuenteModule) async {
        guard module != activeModule else { return }
        stopCurrentModule()
        activeModule = module
        onModuleChanged?(module)
        wireFrameFanOut()
        await startActiveModule()
    }

    func startActiveModule() async {
        moduleTask?.cancel()
        moduleTask = Task { await runActiveModule() }
    }

    func stopAll() {
        moduleTask?.cancel()
        stopCurrentModule()
        streamSession?.onFrameJpeg = nil
    }

    private func stopCurrentModule() {
        platformFlow?.stopLiveMic()
        superFlow?.stopLiveMic()
        superFlow?.stopSentidoContinuo()
        crossingFlow?.stopLiveMic()
        crossingFlow?.stop()
        guideFlow?.stopLiveMic()
    }

    private func wireFrameFanOut() {
        guard let streamSession else { return }
        streamSession.frameFanOutMaxHeight = activeModule == .cruce ? 448 : 896
        if activeModule == .cruce {
            streamSession.onFrameJpeg = { [weak self] b64 in
                Task { @MainActor in
                    await self?.crossingFlow?.handleFrameJpeg(b64)
                }
            }
        } else {
            streamSession.onFrameJpeg = nil
        }
    }

    private func runActiveModule() async {
        switch activeModule {
        case .asistente:
            platformFlow?.warmUp()
            await platformFlow?.start()
        case .supermercado:
            guard let superFlow else { return }
            await superFlow.describeEntornoInicial()
            await withTaskGroup(of: Void.self) { group in
                group.addTask { await superFlow.startSentidoContinuo() }
                group.addTask { await superFlow.startLiveMic() }
            }
        case .cruce:
            guard let crossingFlow else { return }
            await withTaskGroup(of: Void.self) { group in
                group.addTask { await crossingFlow.startContinuous() }
                group.addTask { await crossingFlow.startLiveMic() }
            }
        case .guia:
            await guideFlow?.startLiveMic()
        case .mac:
            await startMacMic()
        }
    }

    /// Mic solo para comandos desktop (flow 06).
    private func startMacMic() async {
        guard let glasses, let command, let worker else { return }
        while activeModule == .mac {
            do {
                let text = try await glasses.listenOnce(isActive: { [weak self] in
                    self?.activeModule == .mac
                }, onPartial: nil)
                let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !trimmed.isEmpty else { continue }
                if let mod = moduleSwitchIntent(trimmed) {
                    await switchModule(to: mod)
                    return
                }
                let cmd = commandAfterWake(trimmed) ?? (isDesktopCommand(trimmed) ? trimmed : nil)
                guard let cmd else { continue }
                let speech = try await command.runCommand(text: cmd)
                if !speech.isEmpty {
                    let audio = try await worker.tts(text: speech)
                    try await glasses.playTts(audio)
                }
            } catch {
                try? await Task.sleep(nanoseconds: 800_000_000)
            }
        }
    }

    /// Intenta cambiar módulo desde transcript (cualquier mic activo).
    func tryHandleModuleSwitch(_ transcript: String) async -> Bool {
        guard let mod = moduleSwitchIntent(transcript) else { return false }
        await switchModule(to: mod)
        return true
    }
}
