import Foundation

enum AppConfig {
    static var workerBaseURL: String {
        let raw = (Bundle.main.object(forInfoDictionaryKey: "PuenteWorkerBaseURL") as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        // Xcode a veces deja literal "$(PUENTE_WORKER_BASE_URL)" si el plist no procesó xcconfig.
        if let raw, !raw.isEmpty, !raw.contains("$(") { return raw }
        #if targetEnvironment(simulator)
        return "http://localhost:8787"
        #else
        return "http://192.168.201.228:8787"
        #endif
    }

    static var workerAPIKey: String {
        (Bundle.main.object(forInfoDictionaryKey: "PuenteWorkerAPIKey") as? String) ?? ""
    }

    /// myeyescantalk en el Mac (POST /command). Mismo host que el worker, puerto 8788.
    static var commandBaseURL: String {
        let raw = (Bundle.main.object(forInfoDictionaryKey: "PuenteCommandBaseURL") as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if let raw, !raw.isEmpty, !raw.contains("$(") { return raw }
        let worker = workerBaseURL
        if worker.contains(":8787") {
            return worker.replacingOccurrences(of: ":8787", with: ":8788")
        }
        #if targetEnvironment(simulator)
        return "http://localhost:8788"
        #else
        return "http://192.168.201.228:8788"
        #endif
    }

    static var commandToken: String {
        (Bundle.main.object(forInfoDictionaryKey: "PuenteCommandToken") as? String) ?? ""
    }

    /// eyesstreelighttalk ws_bridge (YOLO cruce peatonal en LAN).
    static var crossingWSURL: String {
        let raw = (Bundle.main.object(forInfoDictionaryKey: "PuenteCrossingWSURL") as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if let raw, !raw.isEmpty, !raw.contains("$(") { return raw }
        #if targetEnvironment(simulator)
        return "ws://localhost:8765"
        #else
        return "ws://192.168.201.228:8765"
        #endif
    }

    static let userMd =
        "Nombre: José Raúl. Idioma: es-MX. La lista de compra la arma el usuario por voz durante la sesión."
    static let memoryMd = "Usuario nuevo. Sin historial de visitas todavía."

    static func demoState() -> SessionState {
        SessionState(
            sessionId: "sesion-\(Int(Date().timeIntervalSince1970 * 1000))",
            usuarioId: "jose_raul",
            superId: "mi_super",
            visitaNumero: 1,
            listaCompra: [],
            itemsEnCarrito: [],
            pendingConfirm: false
        )
    }
}

private extension String {
    var nonEmpty: String? { isEmpty ? nil : self }
}
