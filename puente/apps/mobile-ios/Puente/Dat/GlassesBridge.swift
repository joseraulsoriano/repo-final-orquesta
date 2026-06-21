import CoreGraphics
import Foundation

struct Gps: Codable, Sendable {
    let lat: Double
    let lng: Double
    var accuracyM: Double?

    enum CodingKeys: String, CodingKey {
        case lat, lng
        case accuracyM = "accuracy_m"
    }
}

protocol GlassesBridge: AnyObject {
    func initBridge(useMockDevice: Bool) async throws
    func handleDeepLink(_ url: URL) async -> Bool
    func captureFrameJpegBase64(maxHeight: CGFloat) async throws -> String
    func gps() -> Gps?
    func playTts(_ audioMp3: Data) async throws
    func vibrate(ms: Int)
    func listenOnce(isActive: @escaping () -> Bool, onPartial: ((String) -> Void)?) async throws -> String
    func isConnected() -> Bool
    func dispose() async
}

extension GlassesBridge {
    /// Resolución estándar POV (896 px alto).
    func captureFrameJpegBase64() async throws -> String {
        try await captureFrameJpegBase64(maxHeight: 896)
    }
}
