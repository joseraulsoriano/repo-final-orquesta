import Foundation

/// Orquestador maestro always-on: mic continuo → /agents/platform → TTS o delegación.
@MainActor
final class PlatformFlow {
    private let worker: WorkerClient
    private let command: CommandClient
    private let glasses: GlassesBridge
    private var state: SessionState
    private let userMd: String
    private var memoryMd: String

    var onSpeech: ((String) -> Void)?
    var onState: ((PuenteSessionState) -> Void)?
    var onModuleSwitch: ((PuenteModule) async -> Void)?
    var onShopperDelegate: ((String) async throws -> Void)?
    var onRecognizeDelegate: ((String) async throws -> Void)?
    var onSessionStateSync: (([String: AnyDecodable]) -> Void)?

    private var liveMicActive = false
    private var speaking = false
    private var lastVisionStructured: [String: Any] = [:]
    private var ambientTask: Task<Void, Never>?
    private var bootGreetingDone = false

    private static let ambientIntervalNs: UInt64 = 30_000_000_000
    private static let speechMaxChars = 200

    init(
        worker: WorkerClient,
        command: CommandClient,
        glasses: GlassesBridge,
        state: SessionState,
        userMd: String,
        memoryMd: String
    ) {
        self.worker = worker
        self.command = command
        self.glasses = glasses
        self.state = state
        self.userMd = userMd
        self.memoryMd = memoryMd
    }

    func stopLiveMic() {
        liveMicActive = false
        ambientTask?.cancel()
        ambientTask = nil
    }

    func updateVision(_ structured: [String: Any]) {
        lastVisionStructured = structured
    }

    /// Precalienta GPS + token STT antes del primer turno.
    func warmUp() {
        worker.prefetchTranscribeToken()
        if let gps = glasses.gps() {
            LocationCache.prefetch(lat: gps.lat, lng: gps.lng)
        }
    }

    /// Mic siempre escuchando + contexto visual ligero en segundo plano.
    func start() async {
        guard !liveMicActive else { return }
        liveMicActive = true
        warmUp()
        startAmbientContext()
        onSpeech?("[platform] mic activo — habla cuando quieras")

        // Saludo local sin Claude (GPS cache si ya está listo).
        Task { await playBootGreetingIfNeeded() }

        while liveMicActive {
            if speaking {
                try? await Task.sleep(nanoseconds: 200_000_000)
                continue
            }
            setState(.listening)
            onSpeech?("[listening]1")
            let transcript: String
            do {
                transcript = try await glasses.listenOnce(
                    isActive: { [weak self] in
                        self?.liveMicActive == true && self?.speaking == false
                    },
                    onPartial: { [weak self] p in
                        let t = p.trimmingCharacters(in: .whitespacesAndNewlines)
                        if !t.isEmpty { self?.onSpeech?("[partial]\(t)") }
                    }
                ).trimmingCharacters(in: .whitespacesAndNewlines)
            } catch {
                onSpeech?("[platform:mic] \(error.localizedDescription)")
                try? await Task.sleep(nanoseconds: 800_000_000)
                continue
            }
            onSpeech?("[listening]0")
            guard !transcript.isEmpty else {
                setState(.connectedIdle)
                continue
            }
            if let mod = moduleSwitchIntent(transcript) {
                await onModuleSwitch?(mod)
                return
            }
            guard let command = resolvePlatformCommand(transcript) else { continue }
            onSpeech?("Tú: \(command)")
            setState(.processing)
            do {
                if try await handleFastPath(command) { continue }
                try await processTurn(command)
            } catch {
                onSpeech?("[platform:error] \(error.localizedDescription)")
            }
            setState(.connectedIdle)
        }
    }

    /// Rutas locales sin /agents/platform ni visión (latencia mínima).
    private func handleFastPath(_ transcript: String) async throws -> Bool {
        if intentOf(transcript) == .who {
            try await onRecognizeDelegate?(transcript)
            return true
        }
        if intentOf(transcript) == .whereAmI || isWhereAmIQuestion(transcript) {
            try await answerWhereAmI()
            return true
        }
        if isDesktopCommand(transcript) {
            let macSpeech = try await command.runCommand(text: transcript)
            if !macSpeech.isEmpty { await speak(macSpeech) }
            return true
        }
        return false
    }

    private func answerWhereAmI() async throws {
        onSpeech?("[platform:WHERE] GPS local")
        if let cached = LocationCache.cached() {
            await speak("Estás en \(cached).")
            refreshLocationCacheInBackground()
            return
        }
        guard let gps = glasses.gps() else {
            await speak("No tengo tu ubicación. Activa el GPS e inténtalo de nuevo.")
            return
        }
        if let lugar = await LocationHelper.whereAmI(lat: gps.lat, lng: gps.lng) {
            LocationCache.store(lugar)
            await speak("Estás en \(lugar).")
        } else {
            await speak("Tengo tu posición pero no pude leer la calle.")
        }
    }

    private func refreshLocationCacheInBackground() {
        guard let gps = glasses.gps() else { return }
        LocationCache.prefetch(lat: gps.lat, lng: gps.lng)
    }

    private func playBootGreetingIfNeeded() async {
        guard !bootGreetingDone else { return }
        bootGreetingDone = true
        // Solo si el GPS ya está cacheado — no bloquea el mic ni espera geocode.
        guard let cached = LocationCache.cached() else { return }
        await speak("Estás en \(cached). Puente listo.")
    }

    private func processTurn(_ transcript: String) async throws {
        var visionMap = lastVisionStructured.mapValues { AnyEncodable($0) }
        if visionMap.isEmpty, needsVisionHint(transcript) {
            if let frame = try? await glasses.captureFrameJpegBase64(maxHeight: 448) {
                if let fusion = try? await worker.fusionDescribe(FusionRequest(
                    imageBase64: frame,
                    module: "sentido",
                    transcript: transcript,
                    continuous: true,
                    locale: "es-MX",
                    sessionId: state.sessionId,
                    superId: state.superId
                )) {
                    visionMap = fusion.structured.mapValues { AnyEncodable($0.value) }
                    lastVisionStructured = fusion.structured.mapValues { $0.value }
                    try? await worker.sessionObserve([
                        "session_id": AnyEncodable(state.sessionId),
                        "type": AnyEncodable("vision"),
                        "module": AnyEncodable("asistente"),
                        "structured": AnyEncodable(lastVisionStructured),
                    ])
                }
            }
        }

        let res = try await worker.platform(PlatformRequest(
            transcript: transcript,
            sessionId: state.sessionId,
            visionData: visionMap.isEmpty ? nil : visionMap,
            gps: glasses.gps(),
            sessionState: state.asDictionary(),
            userMd: userMd,
            memoryMd: memoryMd,
            locale: "es-MX",
            activeModule: "asistente"
        ))

        onSpeech?("[platform:\(res.route ?? "general")] \(transcript.prefix(50))")

        if let note = res.memoryNote, !note.isEmpty {
            memoryMd += "\n- \(note)"
        }
        if !res.sessionState.isEmpty {
            applyAgentState(&state, updated: res.sessionState, pending: false)
            onSessionStateSync?(res.sessionState)
        }

        if res.alert { glasses.vibrate(ms: 400) }

        if let delegate = res.delegate?.lowercased(), !delegate.isEmpty {
            switch delegate {
            case "shopper":
                if !res.speech.isEmpty { await speak(res.speech) }
                try await onShopperDelegate?(transcript)
                return
            case "mac":
                if !res.speech.isEmpty { await speak(res.speech) }
                let cmd = isDesktopCommand(transcript) ? transcript : transcript
                let macSpeech = try await command.runCommand(text: cmd)
                if !macSpeech.isEmpty { await speak(macSpeech) }
                return
            case "mobility":
                if !res.speech.isEmpty { await speak(res.speech) }
                await onModuleSwitch?(.cruce)
                return
            case "recognize":
                if !res.speech.isEmpty { await speak(res.speech) }
                try await onRecognizeDelegate?(transcript)
                return
            default:
                break
            }
        }

        await speak(res.speech)
    }

    /// Primer frame al instante; luego cada ~30 s (Haiku continuo, 448 px).
    private func startAmbientContext() {
        ambientTask?.cancel()
        ambientTask = Task { [weak self] in
            var first = true
            while !Task.isCancelled {
                if !first {
                    try? await Task.sleep(nanoseconds: Self.ambientIntervalNs)
                }
                first = false
                guard let self, self.liveMicActive, !self.speaking else { continue }
                guard let frame = try? await self.glasses.captureFrameJpegBase64(maxHeight: 448) else { continue }
                guard let fusion = try? await self.worker.fusionDescribe(FusionRequest(
                    imageBase64: frame,
                    module: "sentido",
                    continuous: true,
                    locale: "es-MX",
                    sessionId: self.state.sessionId,
                    superId: self.state.superId
                )) else { continue }
                self.lastVisionStructured = fusion.structured.mapValues { $0.value }
                try? await self.worker.sessionObserve([
                    "session_id": AnyEncodable(self.state.sessionId),
                    "type": AnyEncodable("vision"),
                    "module": AnyEncodable("asistente"),
                    "ambient": AnyEncodable(true),
                ])
            }
        }
    }

    private func needsVisionHint(_ transcript: String) -> Bool {
        let s = transcript.lowercased()
        if isWhereAmIQuestion(transcript) { return false }
        return s.contains("qué ves") || s.contains("que ves") || s.contains("alrededor")
            || isMobilityQuestion(transcript)
            || isSuperVoiceCommand(transcript) || isClinicalQuestion(transcript)
    }

    private func speak(_ text: String) async {
        let trimmed = truncateForSpeech(text, maxChars: Self.speechMaxChars)
        guard !trimmed.isEmpty else { return }
        if trimmed.count < text.count {
            onSpeech?("[tts:trim] \(text.count)→\(trimmed.count) chars")
        }
        onSpeech?(trimmed)
        setState(.speaking)
        speaking = true
        defer { speaking = false }
        do {
            let audio = try await worker.tts(text: trimmed)
            try await glasses.playTts(audio)
            worker.prefetchTranscribeToken()
        } catch {
            onSpeech?("[platform:tts] \(error.localizedDescription)")
        }
    }

    private func truncateForSpeech(_ text: String, maxChars: Int) -> String {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard t.count > maxChars else { return t }
        let cut = t.index(t.startIndex, offsetBy: maxChars)
        var slice = String(t[..<cut])
        if let last = slice.lastIndex(of: ".") {
            slice = String(slice[...last])
        } else if let last = slice.lastIndex(of: " ") {
            slice = String(slice[..<last]) + "…"
        }
        return slice.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func setState(_ s: PuenteSessionState) {
        onState?(s)
    }
}
