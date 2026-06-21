import Foundation

/// Fases visibles mientras Puente espera registro, BT y permisos Meta.
enum DatConnectionPhase: Equatable {
    case starting
    case waitingRegistration
    case waitingDevice
    case waitingBluetooth
    case waitingCameraPermission
    case openingSession
    case ready
    case retrying

    var bannerText: String {
        switch self {
        case .starting: return "● INICIANDO Meta DAT…"
        case .waitingRegistration: return "● ESPERANDO registro en Meta AI…"
        case .waitingDevice: return "● ESPERANDO gafas en Meta AI…"
        case .waitingBluetooth: return "● ESPERANDO Bluetooth (Connected)…"
        case .waitingCameraPermission: return "● ESPERANDO permiso de cámara…"
        case .openingSession: return "● INICIANDO sesión DAT…"
        case .ready: return "● LISTO"
        case .retrying: return "● Reintentando conexión con gafas…"
        }
    }

    var hint: String {
        switch self {
        case .starting:
            return "Puente se está preparando."
        case .waitingRegistration:
            return "Toca Conectar en Meta AI y vuelve a Puente."
        case .waitingDevice:
            return "Abre Meta AI, despliega las gafas y póntelas."
        case .waitingBluetooth:
            return "Meta AI → Devices → espera estado Connected."
        case .waitingCameraPermission:
            return "Acepta el permiso de cámara de las gafas en Meta AI."
        case .openingSession:
            return "Casi listo — iniciando stream de cámara."
        case .ready:
            return "Di oye o hola ayúdame cuando quieras."
        case .retrying:
            return "Puedes abrir Meta AI (icono gafas) para acelerar."
        }
    }

    var needsMetaAI: Bool {
        switch self {
        case .waitingRegistration, .waitingDevice, .waitingBluetooth, .waitingCameraPermission, .retrying:
            return true
        default:
            return false
        }
    }
}
