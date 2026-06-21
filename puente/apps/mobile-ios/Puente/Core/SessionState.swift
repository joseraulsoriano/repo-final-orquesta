import Foundation

enum PuenteSessionState: String {
    case disconnected = "DISCONNECTED"
    case connectedIdle = "CONNECTED_IDLE"
    case listening = "LISTENING"
    case processing = "PROCESSING"
    case speaking = "SPEAKING"
    case sentidoContinuous = "SENTIDO_CONTINUOUS"
}

struct ShoppingItem: Codable {
    var item: String
    var status: String
    var preferencia: String?
}

struct SessionState: Codable {
    var sessionId: String
    var usuarioId: String
    var superId: String
    var visitaNumero: Int
    var listaCompra: [ShoppingItem]
    var ubicacionEstimada: String?
    var itemsEnCarrito: [String]
    var turnoActual: String?
    var pendingConfirm: Bool

    enum CodingKeys: String, CodingKey {
        case sessionId = "session_id"
        case usuarioId = "usuario_id"
        case superId = "super_id"
        case visitaNumero = "visita_numero"
        case listaCompra = "lista_compra"
        case ubicacionEstimada = "ubicacion_estimada"
        case itemsEnCarrito = "items_en_carrito"
        case turnoActual = "turno_actual"
        case pendingConfirm = "pending_confirm"
    }

    func asDictionary() -> [String: AnyEncodable] {
        guard let data = try? JSONEncoder().encode(self),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return [:] }
        return obj.mapValues { AnyEncodable($0) }
    }
}

func pendientes(_ s: SessionState) -> [ShoppingItem] {
    s.listaCompra.filter { $0.status == "pending" }
}

func applyAgentState(_ s: inout SessionState, updated: [String: AnyDecodable], pending: Bool) {
    if let list = updated["lista_compra"]?.value as? [[String: Any]] {
        s.listaCompra = list.compactMap { dict in
            guard let item = dict["item"] as? String else { return nil }
            let status = dict["status"] as? String ?? "pending"
            return ShoppingItem(item: item, status: status, preferencia: dict["preferencia"] as? String)
        }
    }
    if let cart = updated["items_en_carrito"]?.value as? [String] {
        s.itemsEnCarrito = cart
    }
    if updated["ubicacion_estimada"] != nil {
        s.ubicacionEstimada = updated["ubicacion_estimada"]?.value as? String
    }
    if updated["turno_actual"] != nil {
        s.turnoActual = updated["turno_actual"]?.value as? String
    }
    s.pendingConfirm = pending
}
