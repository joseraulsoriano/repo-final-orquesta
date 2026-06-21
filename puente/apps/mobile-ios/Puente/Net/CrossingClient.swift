import Foundation

struct CrossingResponse: Decodable {
    let speech: String?
    let structured: [String: AnyDecodable]?
    let spatialTags: [String]?
    let alert: Bool?
    let module: String?
    let toneHz: Double?
    let skipped: Bool?
    let ok: Bool?
    let error: String?

    enum CodingKeys: String, CodingKey {
        case speech, structured, alert, module, error, ok, skipped
        case spatialTags = "spatial_tags"
        case toneHz = "tone_hz"
    }

    var hasSpeech: Bool {
        guard let speech else { return false }
        return !speech.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

/// WebSocket cliente → eyesstreelighttalk ws_bridge (Puente contract).
final class CrossingClient {
    private let wsURL: URL
    private var task: URLSessionWebSocketTask?
    private let session = URLSession(configuration: .default)

    init(wsURL: String = AppConfig.crossingWSURL) {
        guard let url = URL(string: wsURL) else {
            fatalError("Crossing WS URL inválida: \(wsURL)")
        }
        self.wsURL = url
    }

    func connect() async throws {
        disconnect()
        let t = session.webSocketTask(with: wsURL)
        task = t
        t.resume()
        try await Task.sleep(nanoseconds: 200_000_000)
    }

    func disconnect() {
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
    }

    func analyzeFrame(jpegBase64: String, sessionId: String? = nil) async throws -> CrossingResponse {
        if task == nil { try await connect() }
        guard let task else { throw URLError(.notConnectedToInternet) }

        var payload: [String: String] = ["image_base64": jpegBase64]
        if let sessionId { payload["session_id"] = sessionId }

        let data = try JSONSerialization.data(withJSONObject: payload)
        try await task.send(.data(data))

        let message = try await task.receive()
        let raw: Data
        switch message {
        case .data(let d): raw = d
        case .string(let s): raw = Data(s.utf8)
        @unknown default: throw URLError(.badServerResponse)
        }
        return try JSONDecoder().decode(CrossingResponse.self, from: raw)
    }
}
