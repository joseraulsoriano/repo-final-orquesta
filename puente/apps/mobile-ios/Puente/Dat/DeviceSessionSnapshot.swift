import Foundation

struct DeviceSessionRow: Identifiable, Equatable {
    let id: String
    let name: String
    let linkState: String
    let compatibility: String
    let isSelected: Bool
}

/// Estado observable de la sesión DAT (registro, BT, stream, cámara).
struct DeviceSessionSnapshot: Equatable {
    var registrationState: String
    var devices: [DeviceSessionRow]
    var datSessionState: String
    var streamState: String
    var frameCount: Int
    var hasRecentFrame: Bool
    var cameraPermission: String?
    var useMockDevice: Bool
    var selectedDeviceId: String?
    var workerReachable: Bool
    var workerURL: String
    var commandURL: String
    var crossingWSURL: String
    var activeModule: String
    var lastUpdated: Date

    static let empty = DeviceSessionSnapshot(
        registrationState: "unavailable",
        devices: [],
        datSessionState: "none",
        streamState: "stopped",
        frameCount: 0,
        hasRecentFrame: false,
        cameraPermission: nil,
        useMockDevice: false,
        selectedDeviceId: nil,
        workerReachable: false,
        workerURL: AppConfig.workerBaseURL,
        commandURL: AppConfig.commandBaseURL,
        crossingWSURL: AppConfig.crossingWSURL,
        activeModule: PuenteModule.supermercado.displayName,
        lastUpdated: .distantPast
    )

    var isStreaming: Bool { streamState.contains("streaming") }
    var isRegistered: Bool { registrationState == "registered" }
    var hasConnectedDevice: Bool {
        devices.contains { $0.linkState == "connected" && $0.compatibility == "compatible" }
    }
}
