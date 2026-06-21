import Foundation

/// Modo guía: mic vivo + /agents/guide con visión estructurada (cruce o fusion).
@MainActor
final class GuideFlow {
    private let worker: WorkerClient
    private let glasses: GlassesBridge
    private let userMd: String
    private let memoryMd: String
    var onSpeech: ((String) -> Void)?
    var onState: ((PuenteSessionState) -> Void)?

    private var liveMicActive = false
    private var speaking = false
    var lastVisionStructured: [String: Any] = [:]
    var onModuleSwitch: ((PuenteModule) async -> Void)?

    init(worker: WorkerClient, glasses: GlassesBridge, userMd: String, memoryMd: String) {
        self.worker = worker
        self.glasses = glasses
        self.userMd = userMd
        self.memoryMd = memoryMd
    }

    func stopLiveMic() { liveMicActive = false }

    func updateVision(_ structured: [String: Any]) {
        lastVisionStructured = structured
    }

    func startLiveMic() async {
        guard !liveMicActive else { return }
        liveMicActive = true
        onSpeech?("[guia] mic activo")
        while liveMicActive {
            if speaking {
                try? await Task.sleep(nanoseconds: 200_000_000)
                continue
            }
            setState(.listening)
            onSpeech?("[listening]1")
            do {
                let text = try await glasses.listenOnce(isActive: { [weak self] in
                    self?.liveMicActive == true && self?.speaking == false
                }, onPartial: { [weak self] p in
                    self?.onSpeech?("[partial]\(p)")
                })
                onSpeech?("[listening]0")
                let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !trimmed.isEmpty else {
                    setState(.connectedIdle)
                    continue
                }
                onSpeech?("Tú: \(trimmed)")
                if let mod = moduleSwitchIntent(trimmed) {
                    await onModuleSwitch?(mod)
                    return
                }
                try await route(trimmed)
            } catch {
                onSpeech?("[guia:error] \(error.localizedDescription)")
                try? await Task.sleep(nanoseconds: 800_000_000)
            }
            setState(.connectedIdle)
        }
    }

    private func route(_ transcript: String) async throws {
        setState(.processing)
        var visionMap = lastVisionStructured.mapValues { AnyEncodable($0) }
        if visionMap.isEmpty {
            let frame = try await glasses.captureFrameJpegBase64()
            let fusion = try await worker.fusionDescribe(FusionRequest(
                imageBase64: frame,
                module: "sentido",
                transcript: transcript,
                locale: "es-MX"
            ))
            visionMap = fusion.structured.mapValues { AnyEncodable($0.value) }
            lastVisionStructured = fusion.structured.mapValues { $0.value }
        }

        let res = try await worker.guide(GuideRequest(
            audioTranscript: transcript,
            visionData: visionMap,
            gps: glasses.gps(),
            session: ["module": AnyEncodable("guia")],
            userMd: userMd,
            memoryMd: memoryMd,
            locale: "es-MX"
        ))

        try? await worker.sessionObserve([
            "type": AnyEncodable("turn"),
            "module": AnyEncodable("guia"),
            "transcript": AnyEncodable(transcript),
            "decision": AnyEncodable(res.decision),
        ])

        if res.alert { glasses.vibrate(ms: 350) }
        await speak(res.speech)
    }

    private func speak(_ text: String) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        onSpeech?(trimmed)
        setState(.speaking)
        speaking = true
        defer { speaking = false }
        do {
            let audio = try await worker.tts(text: trimmed)
            try await glasses.playTts(audio)
        } catch {
            onSpeech?("[guia:tts] \(error.localizedDescription)")
        }
        setState(.connectedIdle)
    }

    private func setState(_ s: PuenteSessionState) {
        onState?(s)
    }
}
