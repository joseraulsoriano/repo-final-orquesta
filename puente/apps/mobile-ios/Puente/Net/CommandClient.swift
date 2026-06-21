import Foundation

/// Cliente HTTP para myeyescantalk (Mac): voz→acción en POST /command.
final class CommandClient {
    private let baseURL: URL
    private let token: String
    private let session: URLSession
    private var lastCommandKey: String?
    private var lastCommandSpeech: String?
    private var lastCommandAt: Date?

    init(baseURL: String, token: String = AppConfig.commandToken) {
        guard let url = URL(string: baseURL) else {
            fatalError("Command URL inválida: \(baseURL)")
        }
        self.baseURL = url
        self.token = token
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = 90
        cfg.timeoutIntervalForResource = 120
        cfg.waitsForConnectivity = false
        cfg.allowsCellularAccess = !WorkerClient.isPrivateLAN(url)
        self.session = URLSession(configuration: cfg)
    }

    /// Envía el transcript tal cual; el agente en Mac decide la acción (Mail, etc.).
    private func headers(json: Bool) -> [String: String] {
        var h: [String: String] = [:]
        if json { h["Content-Type"] = "application/json" }
        if !token.isEmpty { h["x-command-token"] = token }
        if baseURL.host?.contains("loca.lt") == true {
            h["Bypass-Tunnel-Reminder"] = "true"
        }
        return h
    }

    func runCommand(text: String) async throws -> String {
        let key = text.lowercased()
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
        if let lastKey = lastCommandKey,
           let speech = lastCommandSpeech,
           let at = lastCommandAt,
           lastKey == key,
           Date().timeIntervalSince(at) < 30 {
            return speech
        }

        var req = URLRequest(url: baseURL.appendingPathComponent("/command"))
        req.httpMethod = "POST"
        req.allHTTPHeaderFields = headers(json: true)
        req.httpBody = try JSONEncoder().encode(["text": text])

        let (data, res) = try await session.data(for: req)
        guard let http = res as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        let body = String(data: data, encoding: .utf8) ?? ""
        guard http.statusCode == 200 else {
            throw CommandError(status: http.statusCode, body: body)
        }
        struct R: Decodable { let speech: String }
        let decoded = try JSONDecoder().decode(R.self, from: data)
        let speech = decoded.speech.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !speech.isEmpty else { throw CommandError(status: 200, body: "Respuesta vacía") }
        lastCommandKey = key
        lastCommandSpeech = speech
        lastCommandAt = Date()
        return speech
    }
}

struct CommandError: LocalizedError {
    let status: Int
    let body: String
    var errorDescription: String? {
        "Mac command HTTP \(status): \(body.prefix(200))"
    }
}
