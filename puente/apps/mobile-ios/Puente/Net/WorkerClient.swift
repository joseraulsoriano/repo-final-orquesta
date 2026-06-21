import Foundation

struct WorkerError: LocalizedError {
    let path: String
    let status: Int
    let body: String

    var errorDescription: String? {
        "Worker \(path) → HTTP \(status): \(body.prefix(300))"
    }
}

struct FusionRequest: Encodable {
    let imageBase64: String
    let module: String
    var transcript: String?
    var continuous: Bool?
    var locale: String?
    var ragContext: String?
    var itemBuscado: String?
    var marcaPreferida: String?
    var gps: Gps?
    var sessionId: String?
    var superId: String?
    var frameId: String?

    enum CodingKeys: String, CodingKey {
        case module, transcript, continuous, locale, gps
        case imageBase64 = "image_base64"
        case ragContext = "rag_context"
        case itemBuscado = "item_buscado"
        case marcaPreferida = "marca_preferida"
        case sessionId = "session_id"
        case superId = "super_id"
        case frameId = "frame_id"
    }
}

struct FusionResponse: Decodable {
    let speech: String
    let structured: [String: AnyDecodable]
    let spatialTags: [String]
    let alert: Bool
    let module: String

    enum CodingKeys: String, CodingKey {
        case speech, structured, alert, module
        case spatialTags = "spatial_tags"
    }
}

struct RagQueryRequest: Encodable {
    let query: String
    var gps: Gps?
    var superId: String?
    var visitaNumero: Int?

    enum CodingKeys: String, CodingKey {
        case query, gps
        case superId = "super_id"
        case visitaNumero = "visita_numero"
    }
}

struct RagQueryResponse: Decodable {
    let hit: Bool
    let skipVision: Bool
    let speechHint: String
    let chunks: [RagChunk]

    enum CodingKeys: String, CodingKey {
        case hit, chunks
        case skipVision = "skip_vision"
        case speechHint = "speech_hint"
    }
}

struct RagChunk: Decodable {
    let text: String
}

struct OrchestrateRequest: Encodable {
    let transcript: String
    let intent: String
    var structured: [String: AnyEncodable]?
    let sessionState: [String: AnyEncodable]
    let userMd: String
    let memoryMd: String
    let locale: String

    enum CodingKeys: String, CodingKey {
        case transcript, intent, structured, locale
        case sessionState = "session_state"
        case userMd = "user_md"
        case memoryMd = "memory_md"
    }
}

struct OrchestrateResponse: Decodable {
    let speech: String
    let alert: Bool
    let pendingConfirm: Bool
    let sessionState: [String: AnyDecodable]

    enum CodingKeys: String, CodingKey {
        case speech, alert
        case pendingConfirm = "pending_confirm"
        case sessionState = "session_state"
    }
}

struct GuideRequest: Encodable {
    let audioTranscript: String
    let visionData: [String: AnyEncodable]
    var gps: Gps?
    var session: [String: AnyEncodable]?
    let userMd: String
    let memoryMd: String
    let locale: String

    enum CodingKeys: String, CodingKey {
        case gps, session, locale
        case audioTranscript = "audio_transcript"
        case visionData = "vision_data"
        case userMd = "user_md"
        case memoryMd = "memory_md"
    }
}

struct GuideResponse: Decodable {
    let decision: String
    let route: String?
    let speech: String
    let alert: Bool
    let nextInput: String?
    let session: String?

    enum CodingKeys: String, CodingKey {
        case decision, route, speech, alert, session
        case nextInput = "next_input"
    }
}

struct PlatformRequest: Encodable {
    let transcript: String
    let sessionId: String
    var visionData: [String: AnyEncodable]?
    var gps: Gps?
    var biometrics: [String: AnyEncodable]?
    var sessionState: [String: AnyEncodable]?
    let userMd: String
    let memoryMd: String
    let locale: String
    var activeModule: String?

    enum CodingKeys: String, CodingKey {
        case transcript, gps, biometrics, locale
        case sessionId = "session_id"
        case visionData = "vision_data"
        case sessionState = "session_state"
        case userMd = "user_md"
        case memoryMd = "memory_md"
        case activeModule = "active_module"
    }
}

struct PlatformResponse: Decodable {
    let route: String?
    let speech: String
    let delegate: String?
    let alert: Bool
    let memoryNote: String?
    let sessionState: [String: AnyDecodable]
    let historySaved: Bool

    enum CodingKeys: String, CodingKey {
        case route, speech, delegate, alert
        case memoryNote = "memory_note"
        case sessionState = "session_state"
        case historySaved = "history_saved"
    }
}

struct RecognizeContactRef: Encodable {
    let name: String
    var relation: String?
    let imageBase64: String

    enum CodingKeys: String, CodingKey {
        case name, relation
        case imageBase64 = "image_base64"
    }
}

struct RecognizeRequest: Encodable {
    let imageBase64: String
    let contacts: [RecognizeContactRef]
    var transcript: String?
    var locale: String?

    enum CodingKeys: String, CodingKey {
        case contacts, transcript, locale
        case imageBase64 = "image_base64"
    }
}

struct RecognizeResponse: Decodable {
    let speech: String
    let structured: [String: AnyDecodable]
    let spatialTags: [String]
    let module: String

    enum CodingKeys: String, CodingKey {
        case speech, structured, module
        case spatialTags = "spatial_tags"
    }
}

struct AnyEncodable: Encodable {
    let value: Any
    init(_ value: Any) { self.value = value }
    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch value {
        case let v as String: try c.encode(v)
        case let v as Int: try c.encode(v)
        case let v as Double: try c.encode(v)
        case let v as Bool: try c.encode(v)
        case let v as [String: Any]: try c.encode(v.mapValues { AnyEncodable($0) })
        case let v as [Any]: try c.encode(v.map { AnyEncodable($0) })
        default: try c.encode(String(describing: value))
        }
    }
}

struct AnyDecodable: Decodable {
    let value: Any
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let v = try? c.decode(Bool.self) { value = v; return }
        if let v = try? c.decode(Int.self) { value = v; return }
        if let v = try? c.decode(Double.self) { value = v; return }
        if let v = try? c.decode(String.self) { value = v; return }
        if let v = try? c.decode([String: AnyDecodable].self) {
            value = v.mapValues { $0.value }
            return
        }
        if let v = try? c.decode([AnyDecodable].self) {
            value = v.map { $0.value }
            return
        }
        value = NSNull()
    }
}

final class WorkerClient {
    private let baseURL: URL
    private let apiKey: String
    private let session: URLSession

    private let visionSession: URLSession

    /// Cache AssemblyAI (~50 s) para ahorrar round-trip por turno de voz.
    private var cachedTranscribeToken: (token: String, expiry: Date)?

    init(baseURL: String, apiKey: String = AppConfig.workerAPIKey) {
        guard let url = URL(string: baseURL) else {
            fatalError("Worker URL inválida: \(baseURL)")
        }
        self.baseURL = url
        self.apiKey = apiKey
        let lanOnly = Self.isPrivateLAN(url)
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = 20
        cfg.timeoutIntervalForResource = 60
        cfg.waitsForConnectivity = false
        cfg.allowsCellularAccess = !lanOnly
        self.session = URLSession(configuration: cfg)
        let visionCfg = URLSessionConfiguration.default
        visionCfg.timeoutIntervalForRequest = 90
        visionCfg.timeoutIntervalForResource = 120
        visionCfg.waitsForConnectivity = false
        visionCfg.allowsCellularAccess = !lanOnly
        self.visionSession = URLSession(configuration: visionCfg)
    }

    static func isPrivateLAN(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased() else { return false }
        if host == "localhost" || host.hasSuffix(".local") { return true }
        if host.hasPrefix("192.168.") || host.hasPrefix("10.") { return true }
        if host.hasPrefix("172.") {
            let parts = host.split(separator: ".")
            if parts.count > 1, let second = Int(parts[1]), second >= 16 && second <= 31 { return true }
        }
        return false
    }

    private func headers(json: Bool = true) -> [String: String] {
        var h: [String: String] = [:]
        if json { h["Content-Type"] = "application/json" }
        if !apiKey.isEmpty { h["x-puente-key"] = apiKey }
        if baseURL.host?.contains("loca.lt") == true {
            h["Bypass-Tunnel-Reminder"] = "true"
        }
        return h
    }

    func fusionDescribe(_ req: FusionRequest) async throws -> FusionResponse {
        try await post("/fusion/describe", body: req, session: visionSession)
    }

    func fusionRecognize(_ req: RecognizeRequest) async throws -> RecognizeResponse {
        try await post("/fusion/recognize", body: req, session: visionSession)
    }

    func ragQuery(_ req: RagQueryRequest) async throws -> RagQueryResponse {
        try await post("/rag/query", body: req)
    }

    func orchestrate(_ req: OrchestrateRequest) async throws -> OrchestrateResponse {
        try await post("/agents/orchestrate", body: req)
    }

    func guide(_ req: GuideRequest) async throws -> GuideResponse {
        try await post("/agents/guide", body: req)
    }

    func platform(_ req: PlatformRequest) async throws -> PlatformResponse {
        try await post("/agents/platform", body: req)
    }

    func sessionObserve(_ event: [String: AnyEncodable]) async throws -> (ok: Bool, events: Int) {
        struct R: Decodable { let ok: Bool; let events: Int }
        let r: R = try await post("/session/observe", body: event)
        return (r.ok, r.events)
    }

    struct WorkerHealth: Decodable {
        let ok: Bool
        let anthropic: Bool
        let assemblyai: Bool
        let elevenlabs: Bool
    }

    func healthCheck() async throws -> WorkerHealth {
        var lastError: Error?
        for attempt in 1...3 {
            do {
                return try await fetchHealth()
            } catch {
                lastError = error
                try await Task.sleep(nanoseconds: UInt64(attempt) * 500_000_000)
            }
        }
        throw lastError ?? URLError(.cannotConnectToHost)
    }

    private func fetchHealth() async throws -> WorkerHealth {
        var req = URLRequest(url: baseURL.appendingPathComponent("/health"))
        req.httpMethod = "GET"
        req.timeoutInterval = 8
        req.allHTTPHeaderFields = headers(json: false)
        let (data, res) = try await session.data(for: req)
        guard let http = res as? HTTPURLResponse, http.statusCode == 200 else {
            throw URLError(.cannotConnectToHost)
        }
        return try JSONDecoder().decode(WorkerHealth.self, from: data)
    }

    static func networkHint(baseURL: String) -> String {
        """
        iPhone no alcanza \(baseURL). El stream de gafas funciona; Claude/voz no. \
        Opción A: hotspot del Mac (iPhone → WiFi del Mac) y actualiza la IP en Secrets.xcconfig. \
        Opción B: despliega el worker (wrangler login && wrangler deploy) y pon la URL https://….workers.dev. \
        Prueba en Safari del iPhone: \(baseURL)/health
        """
    }

    func transcribeToken() async throws -> String {
        if let cached = cachedTranscribeToken, cached.expiry > Date() {
            return cached.token
        }
        var lastError: Error?
        for attempt in 1...3 {
            do {
                let token = try await fetchTranscribeToken()
                cachedTranscribeToken = (token, Date().addingTimeInterval(50))
                return token
            } catch {
                lastError = error
                try await Task.sleep(nanoseconds: UInt64(attempt) * 600_000_000)
            }
        }
        throw lastError ?? URLError(.notConnectedToInternet)
    }

    /// Precalienta token STT mientras suena TTS (siguiente turno más rápido).
    func prefetchTranscribeToken() {
        Task { [weak self] in
            _ = try? await self?.transcribeToken()
        }
    }

    private func fetchTranscribeToken() async throws -> String {
        var req = URLRequest(url: baseURL.appendingPathComponent("/transcribe-token"))
        req.httpMethod = "POST"
        req.allHTTPHeaderFields = headers(json: false)
        let (data, res) = try await session.data(for: req)
        guard let http = res as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        let text = String(data: data, encoding: .utf8) ?? ""
        guard http.statusCode == 200 else { throw WorkerError(path: "/transcribe-token", status: http.statusCode, body: text) }
        struct T: Decodable { let token: String }
        return try JSONDecoder().decode(T.self, from: data).token
    }

    func tts(text: String) async throws -> Data {
        var req = URLRequest(url: baseURL.appendingPathComponent("/tts"))
        req.httpMethod = "POST"
        req.allHTTPHeaderFields = headers()
        req.httpBody = try JSONEncoder().encode(["text": text])
        let (data, res) = try await session.data(for: req)
        guard let http = res as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        let body = String(data: data, encoding: .utf8) ?? ""
        guard http.statusCode == 200 else { throw WorkerError(path: "/tts", status: http.statusCode, body: body) }
        return data
    }

    private func post<T: Decodable, B: Encodable>(
        _ path: String,
        body: B,
        session: URLSession? = nil
    ) async throws -> T {
        let http = session ?? self.session
        var req = URLRequest(url: baseURL.appendingPathComponent(path))
        req.httpMethod = "POST"
        req.allHTTPHeaderFields = headers()
        req.httpBody = try JSONEncoder().encode(body)
        let (data, res) = try await http.data(for: req)
        guard let http = res as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        let text = String(data: data, encoding: .utf8) ?? ""
        guard http.statusCode == 200 else { throw WorkerError(path: path, status: http.statusCode, body: text) }
        return try JSONDecoder().decode(T.self, from: data)
    }
}
