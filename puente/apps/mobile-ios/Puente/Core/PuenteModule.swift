import Foundation

/// Módulo activo de la plataforma Puente (una sesión DAT, un módulo a la vez).
enum PuenteModule: String, CaseIterable, Identifiable {
    case asistente
    case supermercado
    case cruce
    case guia
    case mac

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .asistente: return "Puente"
        case .supermercado: return "Super"
        case .cruce: return "Cruce"
        case .guia: return "Guía"
        case .mac: return "Mac"
        }
    }

    var bannerHint: String {
        switch self {
        case .asistente: return "Asistente — ansiedad, compras, cruce, correo…"
        case .supermercado: return "Modo super — di oye o hola ayúdame"
        case .cruce: return "Modo cruce — di «¿puedo cruzar?» o apunta al semáforo"
        case .guia: return "Modo guía — navegación asistida"
        case .mac: return "Modo Mac — di oye abre mi correo"
        }
    }
}

/// Detecta cambio de módulo por voz.
func moduleSwitchIntent(_ transcript: String) -> PuenteModule? {
    let s = transcript.lowercased()
    if s.contains("modo puente") || s.contains("modo asistente") || s.contains("modo principal") {
        return .asistente
    }
    if s.contains("modo cruce") || s.contains("cruce peatonal") || s.contains("cruzar") && s.contains("modo") {
        return .cruce
    }
    if s.contains("modo super") || s.contains("modo compras") || s.contains("supermercado") {
        return .supermercado
    }
    if s.contains("modo guía") || s.contains("modo guia") || s.contains("modo navegación") || s.contains("modo navegacion") {
        return .guia
    }
    if s.contains("modo mac") || s.contains("modo computadora") {
        return .mac
    }
    return nil
}

func isMobilityQuestion(_ transcript: String) -> Bool {
    let s = transcript.lowercased()
    return s.contains("cruzar") || s.contains("calle") || s.contains("semáforo") || s.contains("semaforo")
        || s.contains("puedo cruzar") || s.contains("tráfico") || s.contains("trafico")
        || s.contains("dónde voy") || s.contains("donde voy") || s.contains("naveg")
}
