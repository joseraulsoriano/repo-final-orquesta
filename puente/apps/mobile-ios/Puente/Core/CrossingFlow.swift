import Foundation

/// Loop de cruce peatonal: frames → eyesstreelighttalk WS → tono/vibración (inmediato) + TTS.
@MainActor
final class CrossingFlow {
    private let worker: WorkerClient
    private let glasses: GlassesBridge
    private let crossing: CrossingClient
    private let sessionId: String
    var onSpeech: ((String) -> Void)?
    var onState: ((PuenteSessionState) -> Void)?
    var onVisionStructured: (([String: Any]) -> Void)?
    var onModuleSwitch: ((PuenteModule) async -> Void)?

    private var active = false
    private var liveMicActive = false
    private var analysisInFlight = false
    private var ttsInFlight = false
    private var lastJpegSentAt: Date = .distantPast
    private var lastVerdict: String?
    private var lastSpeech: String?
    private var lastStructured: [String: Any] = [:]

    private static let frameMinInterval: TimeInterval = 0.45
    private static let maxSpeechChars = 120

    init(worker: WorkerClient, glasses: GlassesBridge, crossing: CrossingClient, sessionId: String) {
        self.worker = worker
        self.glasses = glasses
        self.crossing = crossing
        self.sessionId = sessionId
    }

    func stop() {
        active = false
        liveMicActive = false
        crossing.disconnect()
    }

    func startContinuous() async {
        guard !active else { return }
        active = true
        onSpeech?("[cruce] WS → \(AppConfig.crossingWSURL)")
        do {
            try await crossing.connect()
            onSpeech?("[cruce] loop activo — tono+vibración primero, TTS después")
        } catch {
            onSpeech?("[cruce:error] WS \(error.localizedDescription)")
        }
    }

    /// Mic en modo cruce: «¿puedo cruzar?», «modo super», etc.
    func startLiveMic() async {
        guard !liveMicActive else { return }
        liveMicActive = true
        while liveMicActive && active {
            if ttsInFlight {
                try? await Task.sleep(nanoseconds: 150_000_000)
                continue
            }
            onSpeech?("[listening]1")
            defer { onSpeech?("[listening]0") }
            do {
                let text = try await glasses.listenOnce(isActive: { [weak self] in
                    self?.liveMicActive == true && self?.active == true
                }, onPartial: { [weak self] p in
                    let t = p.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !t.isEmpty { self?.onSpeech?("[partial]\(t)") }
                }).trimmingCharacters(in: .whitespacesAndNewlines)
                guard !text.isEmpty else { continue }
                if let mod = moduleSwitchIntent(text) {
                    await onModuleSwitch?(mod)
                    return
                }
                guard let cmd = resolveCrossingVoiceCommand(text) else {
                    onSpeech?("[cruce] di «¿puedo cruzar?» o «modo super»")
                    continue
                }
                onSpeech?("Tú: \(cmd)")
                await answerMobilityQuestion(cmd)
            } catch {
                onSpeech?("[cruce:mic] \(error.localizedDescription)")
                try? await Task.sleep(nanoseconds: 800_000_000)
            }
        }
    }

    func stopLiveMic() { liveMicActive = false }

    /// Llamado desde StreamSessionViewModel (throttled ~2 fps, JPEG compacto).
    func handleFrameJpeg(_ jpegBase64: String) async {
        guard active, !analysisInFlight else { return }
        let now = Date()
        guard now.timeIntervalSince(lastJpegSentAt) >= Self.frameMinInterval else { return }
        lastJpegSentAt = now
        analysisInFlight = true
        defer { analysisInFlight = false }

        do {
            let res = try await crossing.analyzeFrame(jpegBase64: jpegBase64, sessionId: sessionId)
            if res.skipped == true { return }
            if let err = res.error {
                onSpeech?("[cruce:error] \(err)")
                return
            }
            await deliver(res)
        } catch {
            onSpeech?("[cruce:error] \(error.localizedDescription)")
        }
    }

    private func deliver(_ res: CrossingResponse) async {
        if let structured = res.structured {
            let map = structured.mapValues { $0.value }
            lastStructured = map
            onVisionStructured?(map)
            if let v = map["verdict"] as? String { lastVerdict = v }
        }

        let verdict = lastVerdict ?? ""
        let isAlert = res.alert == true

        // P1: alerta inmediata (<200 ms percibidos) — antes de TTS/ElevenLabs.
        if isAlert { glasses.vibrate(ms: 450) }
        if let hz = res.toneHz, hz > 0 {
            try? await AudioRouter.shared.playTone(
                hz: hz,
                durationMs: isAlert ? 480 : 240
            )
        }

        guard res.hasSpeech, let raw = res.speech else { return }
        let text = truncateCrossingSpeech(raw, verdict: verdict)
        lastSpeech = text
        onSpeech?("[cruce:\(verdict.isEmpty ? "?" : verdict)] \(text)")

        // UNSAFE/CAUTION: no bloquear análisis YOLO; TTS en paralelo.
        if isAlert || verdict == "NO_CRUZAR" || verdict.hasPrefix("PRECAU") {
            speakCrossingAsync(text)
            return
        }
        await speakCrossing(text)
    }

    private func answerMobilityQuestion(_ transcript: String) async {
        setState(.processing)
        if let speech = speechFromLastVerdict() {
            onSpeech?("[cruce:voice] \(speech)")
            await speakCrossing(speech)
            setState(.connectedIdle)
            return
        }
        onSpeech?("[cruce] sin veredicto aún — apunta al semáforo y espera unos segundos")
        await speakCrossing("Sigo analizando el cruce. Apunta al semáforo un momento.")
        setState(.connectedIdle)
    }

    private func speechFromLastVerdict() -> String? {
        switch lastVerdict {
        case "FACTIBLE_CRUZAR", "SAFE":
            return lastSpeech ?? "Puede cruzar."
        case "NO_CRUZAR", "UNSAFE":
            return lastSpeech ?? "Alto. No cruce."
        case "PRECAUCIÓN", "PRECAUCION", "CAUTION":
            return lastSpeech ?? "Precaución antes de cruzar."
        case "EVALUANDO", "UNKNOWN":
            return nil
        default:
            return nil
        }
    }

    private func speakCrossingAsync(_ text: String) {
        Task { await speakCrossing(text) }
    }

    private func speakCrossing(_ text: String) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        ttsInFlight = true
        setState(.speaking)
        defer {
            ttsInFlight = false
            setState(.connectedIdle)
        }
        do {
            let audio = try await worker.tts(text: trimmed)
            onSpeech?("[cruce:tts] \(audio.count) bytes")
            try await glasses.playTts(audio)
            worker.prefetchTranscribeToken()
        } catch {
            onSpeech?("[cruce:tts] \(error.localizedDescription)")
        }
    }

    private func truncateCrossingSpeech(_ text: String, verdict: String) -> String {
        var t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if verdict == "NO_CRUZAR" || verdict == "UNSAFE" {
            if t.count > 80 { t = String(t.prefix(80)).trimmingCharacters(in: .whitespaces) + "…" }
            return t
        }
        guard t.count > Self.maxSpeechChars else { return t }
        let prefix = String(t.prefix(Self.maxSpeechChars))
        if let dot = prefix.lastIndex(where: { ".!?".contains($0) }) {
            return String(prefix[...dot])
        }
        return prefix + "…"
    }

    private func setState(_ s: PuenteSessionState) {
        onState?(s)
    }
}

/// Comandos de voz en modo cruce (sin wake word).
func resolveCrossingVoiceCommand(_ transcript: String) -> String? {
    if let afterWake = commandAfterWake(transcript) { return afterWake }
    let trimmed = transcript.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return nil }
    if isMobilityQuestion(trimmed) { return trimmed }
    let s = trimmed.lowercased()
    if s.contains("semáforo") || s.contains("semaforo") || s.contains("cruce") { return trimmed }
    return nil
}
