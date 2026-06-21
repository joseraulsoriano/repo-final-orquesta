import CoreGraphics
import Foundation

@MainActor
final class SuperFlow {
    private let worker: WorkerClient
    private let command: CommandClient
    private let glasses: GlassesBridge
    private var state: SessionState
    private let userMd: String
    private let memoryMd: String
    var onState: ((PuenteSessionState) -> Void)?
    var onSpeech: ((String) -> Void)?
    var onModuleSwitch: ((PuenteModule) async -> Void)?

    private var pttActive = false
    private var continuousActive = false
    private var liveMicActive = false
    private var speaking = false
    private var initialSceneDone = false
    private var lastAmbientSpeech = ""
    private var lastAmbientSpokenAt: Date?
    private var visionInFlight = false

    /// Ambiente/saludo: TTS corto. PTT super: respuesta completa pero acotada.
    private enum SpeechMode {
        case ambient
        case interactive

        var maxChars: Int {
            switch self {
            case .ambient: return 160
            case .interactive: return 380
            }
        }
    }

    private static let sentidoIntervalNs: UInt64 = 12_000_000_000
    private static let sentidoCompactHeight: CGFloat = 448
    private static let visionFrameHeight: CGFloat = 672

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

    func announce(_ text: String) async {
        await speak(text)
    }

    /// Primer frame en streaming: describe dónde estás, qué hay y el ambiente (voz + pantalla).
    func describeEntornoInicial() async {
        guard !initialSceneDone else { return }
        setState(.processing)
        onSpeech?("Analizando lo que veo…")
        try? await Task.sleep(nanoseconds: 600_000_000)
        do {
            onSpeech?("[vision] capturando frame…")
            let frame = try await glasses.captureFrameJpegBase64(maxHeight: Self.visionFrameHeight)
            onSpeech?("[vision] frame OK (\(frame.count / 1024) KB) → Claude…")
            let fusion = try await worker.fusionDescribe(FusionRequest(
                imageBase64: frame,
                module: "sentido",
                transcript: """
                Saludo inicial breve (máximo 2 frases cortas): tipo de lugar y una invitación \
                a pedir algo por voz. Sin listas ni detalles largos.
                """,
                continuous: false,
                locale: "es-MX",
                gps: glasses.gps(),
                sessionId: state.sessionId,
                frameId: "f_init_\(Int(Date().timeIntervalSince1970 * 1000))"
            ))
            initialSceneDone = true
            lastAmbientSpeech = fusion.speech
            lastAmbientSpokenAt = Date()
            if fusion.alert { glasses.vibrate(ms: 300) }
            let speech = fusion.speech.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines)
            onSpeech?("[vision] Claude OK (\(speech.count) chars)")
            if speech.isEmpty {
                await speak("Puente en vivo. Pregúntame lo que necesites.", mode: .ambient)
            } else {
                await speak(speech, mode: .ambient)
            }
        } catch {
            onSpeech?("Error de visión: \(error.localizedDescription)")
            onSpeech?("[vision:error] \(error.localizedDescription)")
            await speak("Puente en vivo. Pregúntame lo que necesites.", mode: .ambient)
        }
        setState(.connectedIdle)
    }

    func startSentidoContinuo() async {
        guard !continuousActive else { return }
        continuousActive = true
        while continuousActive && !initialSceneDone {
            try? await Task.sleep(nanoseconds: 300_000_000)
        }
        while continuousActive {
            setState(.sentidoContinuous)
            if pttActive || speaking || visionInFlight {
                try? await Task.sleep(nanoseconds: 400_000_000)
                continue
            }
            do {
                let frame = try await glasses.captureFrameJpegBase64(maxHeight: Self.sentidoCompactHeight)
                if !continuousActive || pttActive || speaking || visionInFlight { continue }
                visionInFlight = true
                let fusion: FusionResponse
                do {
                    fusion = try await worker.fusionDescribe(FusionRequest(
                        imageBase64: frame,
                        module: "sentido",
                        continuous: true,
                        locale: "es-MX",
                        gps: glasses.gps(),
                        sessionId: state.sessionId,
                        frameId: "f_\(Int(Date().timeIntervalSince1970 * 1000))"
                    ))
                } catch {
                    visionInFlight = false
                    throw error
                }
                visionInFlight = false
                if !continuousActive || pttActive || speaking { continue }
                Task {
                    do {
                        let r = try await worker.sessionObserve([
                            "session_id": AnyEncodable(state.sessionId),
                            "type": AnyEncodable("vision"),
                            "scene": AnyEncodable(fusion.structured.mapValues { $0.value }),
                            "speech": AnyEncodable(fusion.speech),
                            "frame_id": AnyEncodable("f_\(Int(Date().timeIntervalSince1970 * 1000))"),
                        ])
                        onSpeech?("[db] vision → temp (events=\(r.events))")
                    } catch {
                        onSpeech?("[db:error] \(error.localizedDescription)")
                    }
                }
                let speech = fusion.speech.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !speech.isEmpty else { continue }

                let shouldSpeak: Bool
                if fusion.alert {
                    shouldSpeak = true
                } else if lastAmbientSpokenAt == nil {
                    shouldSpeak = true
                } else {
                    let elapsed = Date().timeIntervalSince(lastAmbientSpokenAt!)
                    let changed = speech != lastAmbientSpeech
                    shouldSpeak = changed && elapsed > 40
                }

                if shouldSpeak && continuousActive && !pttActive && !speaking {
                    lastAmbientSpeech = speech
                    lastAmbientSpokenAt = Date()
                    if fusion.alert { glasses.vibrate(ms: 300) }
                    await speak(speech, mode: .ambient)
                } else {
                    onSpeech?("[entorno] \(speech.prefix(120))")
                }
            } catch {
                visionInFlight = false
                onSpeech?("[sentido:error] \(error.localizedDescription)")
                try? await Task.sleep(nanoseconds: 2_000_000_000)
            }
            try? await Task.sleep(nanoseconds: Self.sentidoIntervalNs)
        }
        setState(.connectedIdle)
    }

    func stopSentidoContinuo() { continuousActive = false }

    func startLiveMic() async {
        guard !liveMicActive else { return }
        liveMicActive = true
        while liveMicActive {
            if speaking || pttActive {
                try? await Task.sleep(nanoseconds: 150_000_000)
                continue
            }
            let transcript: String
            onSpeech?("[listening]1")
            defer { onSpeech?("[listening]0") }
            do {
                transcript = try await glasses.listenOnce(
                    isActive: { self.liveMicActive && !self.speaking },
                    onPartial: { partial in
                        let t = partial.trimmingCharacters(in: .whitespacesAndNewlines)
                        if !t.isEmpty { self.onSpeech?("[partial]\(t)") }
                    }
                ).trimmingCharacters(in: .whitespacesAndNewlines)
            } catch {
                onSpeech?("[mic:error] \(error.localizedDescription)")
                try? await Task.sleep(nanoseconds: 800_000_000)
                continue
            }
            if transcript.isEmpty {
                try? await Task.sleep(nanoseconds: 120_000_000)
                continue
            }
            if let mod = moduleSwitchIntent(transcript) {
                await onModuleSwitch?(mod)
                return
            }
            // Wake opcional; super/desktop se aceptan directo (paridad mobile-rn).
            guard let command = resolveVoiceCommand(transcript) else {
                onSpeech?("[wake] (sin comando — prueba: «dónde está la leche» o «agrega leche a mi lista»)")
                try? await Task.sleep(nanoseconds: 200_000_000)
                continue
            }
            if speaking { continue }
            onSpeech?("Tú: \(command)")
            pttActive = true
            setState(.processing)
            do {
                try await routeTranscript(command)
            } catch {
                onSpeech?("[mic:error] \(error.localizedDescription)")
            }
            pttActive = false
        }
    }

    func stopLiveMic() { liveMicActive = false }

    /// Delegación desde PlatformFlow (orquestador → shopper).
    func handleUserTranscript(_ transcript: String) async throws {
        try await routeTranscript(transcript)
    }

    func mergeSessionState(_ updated: [String: AnyDecodable]) {
        applyAgentState(&state, updated: updated, pending: state.pendingConfirm)
    }

    private func routeTranscript(_ transcript: String) async throws {
        if isDesktopCommand(transcript) {
            onSpeech?("[super:desktop]")
            try await runDesktopCommand(transcript)
            return
        }
        let intent = intentOf(transcript)
        onSpeech?("[super:\(intent.rawValue)] \(transcript.prefix(60))")
        if state.pendingConfirm && (intent == .yes || intent == .no) {
            try await resolveConfirm(transcript)
            return
        }
        switch intent {
        case .add: try await addToList(transcript)
        case .whereAmI: try await whereAmICurrently()
        case .whereItem: try await navigate(transcript)
        case .whatIs: try await confirmProduct(transcript)
        case .whatsLeft: try await recall(transcript)
        case .who: try await recognizePeople(transcript)
        case .yes, .no: try await resolveConfirm(transcript)
        default: try await recall(transcript)
        }
    }

    private func runDesktopCommand(_ transcript: String) async throws {
        setState(.processing)
        onSpeech?("[mac] → \(AppConfig.commandBaseURL)")
        let speech = try await command.runCommand(text: transcript)
        await speak(speech)
    }

    private func addToList(_ transcript: String) async throws {
        setState(.processing)
        let item = extractItem(transcript)
        guard !item.isEmpty else {
            await speak("¿Qué quieres que agregue a tu lista?")
            return
        }
        if state.listaCompra.contains(where: { $0.item.lowercased() == item.lowercased() }) {
            await speak("\(item) ya está en tu lista.")
            return
        }
        state.listaCompra.append(ShoppingItem(item: item, status: "pending"))
        Task {
            try? await worker.sessionObserve([
                "session_id": AnyEncodable(state.sessionId),
                "type": AnyEncodable("list_add"),
                "item": AnyEncodable(item),
            ])
        }
        await speak("Listo, agregué \(item) a tu lista.")
    }

    private func whereAmICurrently() async throws {
        setState(.processing)
        onSpeech?("[super:WHERE] GPS local")
        if let cached = LocationCache.cached() {
            await speak("Estás en \(cached).")
            if let gps = glasses.gps() {
                LocationCache.prefetch(lat: gps.lat, lng: gps.lng)
            }
            return
        }
        guard let gps = glasses.gps() else {
            await speak("No tengo tu ubicación todavía. Activa el GPS y vuelve a intentar.")
            return
        }
        if let lugar = await LocationHelper.whereAmI(lat: gps.lat, lng: gps.lng) {
            LocationCache.store(lugar)
            await speak("Estás en \(lugar).")
        } else {
            await speak("Tengo tu posición pero no pude leer la calle.")
        }
    }

    private func navigate(_ transcript: String) async throws {
        setState(.processing)
        onSpeech?("[super:WHERE] rag/query…")
        let rag = try await worker.ragQuery(RagQueryRequest(
            query: transcript,
            gps: glasses.gps(),
            superId: state.superId,
            visitaNumero: state.visitaNumero
        ))
        if rag.hit && rag.skipVision {
            onSpeech?("[super:WHERE] RAG hit → TTS")
            state.ubicacionEstimada = rag.chunks.first?.text
            await speak(rag.speechHint)
            return
        }
        while visionInFlight {
            try await Task.sleep(nanoseconds: 200_000_000)
        }
        onSpeech?("[super:WHERE] fusion/sentido + orchestrate…")
        visionInFlight = true
        defer { visionInFlight = false }
        let frame = try await glasses.captureFrameJpegBase64(maxHeight: Self.visionFrameHeight)
        let fusion = try await worker.fusionDescribe(FusionRequest(
            imageBase64: frame,
            module: "sentido",
            transcript: transcript,
            ragContext: rag.hit ? rag.speechHint : nil,
            gps: glasses.gps(),
            sessionId: state.sessionId,
            superId: state.superId,
            frameId: "f_\(Int(Date().timeIntervalSince1970 * 1000))"
        ))
        try await orchestrateSpeak(
            transcript: transcript,
            intent: "WHERE",
            structured: fusion.structured.mapValues { $0.value }
        )
    }

    private func confirmProduct(_ transcript: String) async throws {
        setState(.processing)
        onSpeech?("[super:WHAT_IS] fusion/producto + orchestrate…")
        while visionInFlight {
            try await Task.sleep(nanoseconds: 200_000_000)
        }
        visionInFlight = true
        defer { visionInFlight = false }
        let target = pendientes(state).first
        let frame = try await glasses.captureFrameJpegBase64(maxHeight: Self.visionFrameHeight)
        let fusion = try await worker.fusionDescribe(FusionRequest(
            imageBase64: frame,
            module: "producto",
            transcript: transcript,
            itemBuscado: target?.item,
            marcaPreferida: target?.preferencia,
            gps: glasses.gps(),
            sessionId: state.sessionId,
            superId: state.superId,
            frameId: "f_\(Int(Date().timeIntervalSince1970 * 1000))"
        ))
        try await orchestrateSpeak(
            transcript: transcript,
            intent: "WHAT_IS",
            structured: fusion.structured.mapValues { $0.value }
        )
    }

    private func recall(_ transcript: String) async throws {
        setState(.processing)
        onSpeech?("[super:WHATS_LEFT] orchestrate…")
        try await orchestrateSpeak(transcript: transcript, intent: "WHATS_LEFT")
    }

    /// Puente Caras: frame POV vs fotos de referencia → PersonasJSON → orquestador WHO.
    func recognizePeople(_ transcript: String) async throws {
        setState(.processing)
        let contacts = ContactStore.loadContacts()
        onSpeech?("[super:WHO] \(contacts.count) contacto(s) → fusion/recognize")
        while visionInFlight {
            try await Task.sleep(nanoseconds: 200_000_000)
        }
        visionInFlight = true
        defer { visionInFlight = false }
        let frame = try await glasses.captureFrameJpegBase64(maxHeight: Self.visionFrameHeight)
        let recog = try await worker.fusionRecognize(RecognizeRequest(
            imageBase64: frame,
            contacts: contacts,
            transcript: transcript,
            locale: "es-MX"
        ))
        try? await worker.sessionObserve([
            "session_id": AnyEncodable(state.sessionId),
            "type": AnyEncodable("recognize"),
            "transcript": AnyEncodable(transcript),
            "personas": AnyEncodable(recog.structured["personas"]?.value ?? []),
        ])
        try await orchestrateSpeak(
            transcript: transcript,
            intent: "WHO",
            structured: recog.structured.mapValues { $0.value }
        )
    }

    private func resolveConfirm(_ transcript: String) async throws {
        setState(.processing)
        let intent = intentOf(transcript) == .no ? "NO" : "YES"
        try await orchestrateSpeak(transcript: transcript, intent: intent)
    }

    private func orchestrateSpeak(transcript: String, intent: String, structured: [String: Any] = [:]) async throws {
        onSpeech?("[super:orchestrate] intent=\(intent)")
        let res = try await worker.orchestrate(OrchestrateRequest(
            transcript: transcript,
            intent: intent,
            structured: structured.isEmpty ? nil : structured.mapValues { AnyEncodable($0) },
            sessionState: state.asDictionary(),
            userMd: userMd,
            memoryMd: memoryMd,
            locale: "es-MX"
        ))
        applyAgentState(&state, updated: res.sessionState, pending: res.pendingConfirm)
        if res.alert { glasses.vibrate(ms: 300) }
        await speak(res.speech)
    }

    private func speak(_ text: String, mode: SpeechMode = .interactive) async {
        let trimmed = truncateForSpeech(text, maxChars: mode.maxChars)
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
            onSpeech?("[tts] worker OK (\(audio.count) bytes) → gafas…")
            try await glasses.playTts(audio)
            onSpeech?("[tts] reproducción OK")
            worker.prefetchTranscribeToken()
        } catch {
            onSpeech?("No pude hablar: \(error.localizedDescription)")
            onSpeech?("[tts:error] \(error.localizedDescription)")
        }
        setState(.connectedIdle)
    }

    private func truncateForSpeech(_ text: String, maxChars: Int) -> String {
        var t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard t.count > maxChars else { return t }
        let prefix = String(t.prefix(maxChars))
        if let dot = prefix.lastIndex(where: { ".!?".contains($0) }) {
            t = String(prefix[...dot])
        } else if let sp = prefix.lastIndex(of: " ") {
            t = String(prefix[..<sp]) + "…"
        } else {
            t = prefix + "…"
        }
        return t.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func setState(_ s: PuenteSessionState) {
        onState?(s)
    }
}
