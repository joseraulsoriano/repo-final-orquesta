import AVFoundation
import Foundation

enum AudioRouterError: LocalizedError {
    case micDenied
    case hfpUnavailable

    var errorDescription: String? {
        switch self {
        case .micDenied: return "Permiso de micrófono denegado"
        case .hfpUnavailable: return "Ruta HFP de las gafas no disponible"
        }
    }
}

/// A2DP para TTS (alta calidad) y HFP para captura del mic de las gafas.
/// Orden Meta: configurar HFP antes de arrancar el stream DAT si ambos conviven.
final class AudioRouter {
    static let shared = AudioRouter()

    private let session = AVAudioSession.sharedInstance()
    private var engine: AVAudioEngine?
    private var tapInstalled = false

    private init() {}

    func configurePlayback() throws {
        try configureA2DPPlayback()
    }

    /// TTS a las gafas: A2DP (alta calidad). HFP y A2DP son mutuamente excluyentes en Meta.
    /// No usar setActive(false): rompe el stream DAT y devuelve OSStatus -50 (paramErr).
    func configureA2DPPlayback() throws {
        try session.setCategory(.playback, mode: .spokenAudio, options: [.allowBluetoothA2DP])
        try session.setActive(true)
    }

    /// Fallback TTS por altavoces HFP de las gafas (misma ruta que el mic, sin cambio A2DP).
    func configureHFPPlayback() throws {
        try session.setCategory(
            .playAndRecord,
            mode: .voiceChat,
            options: [.allowBluetoothHFP, .duckOthers, .interruptSpokenAudioAndMixWithOthers]
        )
        try session.setActive(true)
        if let hfp = session.availableInputs?.first(where: { $0.portType == .bluetoothHFP }) {
            try session.setPreferredInput(hfp)
        }
        try session.overrideOutputAudioPort(.none)
    }

    func configureHFP() async throws {
        let granted = await withCheckedContinuation { (cont: CheckedContinuation<Bool, Never>) in
            session.requestRecordPermission { cont.resume(returning: $0) }
        }
        guard granted else { throw AudioRouterError.micDenied }

        if session.currentRoute.inputs.contains(where: { $0.portType == .bluetoothHFP }) {
            logRoute(prefix: "[audio:hfp:reuse]")
            return
        }

        try session.setCategory(.playAndRecord, mode: .default, options: [.allowBluetoothHFP])
        try session.setActive(true)

        if let hfp = session.availableInputs?.first(where: { $0.portType == .bluetoothHFP }) {
            try session.setPreferredInput(hfp)
        }

        try await Task.sleep(nanoseconds: 2_000_000_000)

        logRoute(prefix: "[audio:hfp]")
        let hasHFP = session.currentRoute.inputs.contains { $0.portType == .bluetoothHFP }
        guard hasHFP else { throw AudioRouterError.hfpUnavailable }
    }

    /// Reusa HFP si ya está activo; si no, intenta configurarlo (puede fallar tras TTS/A2DP).
    @discardableResult
    func ensureHFP() async throws -> Bool {
        if session.currentRoute.inputs.contains(where: { $0.portType == .bluetoothHFP }) {
            return true
        }
        do {
            try await configureHFP()
            return true
        } catch {
            logRoute(prefix: "[audio:hfp:fail]")
            throw error
        }
    }

    func ensureHFPOrPhoneMic() async -> Bool {
        do {
            return try await ensureHFP()
        } catch {
            print("[audio] HFP no disponible, mic del iPhone (\(error.localizedDescription))")
            do {
                try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetooth])
                try session.setActive(true)
            } catch {
                print("[audio] fallback mic iPhone falló: \(error.localizedDescription)")
            }
            return false
        }
    }

    func startCapture(onBuffer: @escaping (AVAudioPCMBuffer) -> Void) throws -> AVAudioEngine {
        let audioEngine = AVAudioEngine()
        let input = audioEngine.inputNode
        let format = input.inputFormat(forBus: 0)
        input.installTap(onBus: 0, bufferSize: 4096, format: format) { buffer, _ in
            onBuffer(buffer)
        }
        audioEngine.prepare()
        try audioEngine.start()
        engine = audioEngine
        tapInstalled = true
        return audioEngine
    }

    func stopCapture() {
        guard let engine else { return }
        if tapInstalled {
            engine.inputNode.removeTap(onBus: 0)
            tapInstalled = false
        }
        engine.stop()
        self.engine = nil
        // No desactivar AVAudioSession: rompe el stream DAT y la ruta HFP de las gafas.
    }

    /// Detiene captura STT antes de TTS. No desactivar AVAudioSession (DAT sigue activo).
    func prepareForPlayback() {
        stopCapture()
    }

    /// A2DP si el BT enruta; si no, HFP (altavoces gafas en perfil manos libres).
    func configurePlaybackRoute() async throws {
        prepareForPlayback()
        try await Task.sleep(nanoseconds: 200_000_000)
        do {
            try configureA2DPPlayback()
            try await Task.sleep(nanoseconds: 450_000_000)
            if hasA2DPOutput() {
                logRoute(prefix: "[tts:a2dp]")
                return
            }
        } catch {
            print("[audio] A2DP falló (\(error.localizedDescription)), fallback HFP")
        }
        try configureHFPPlayback()
        try await Task.sleep(nanoseconds: 300_000_000)
        logRoute(prefix: "[tts:hfp-fallback]")
    }

    func logRoute(prefix: String) {
        let inputs = session.currentRoute.inputs.map { "\($0.portType.rawValue):\($0.portName)" }
        let outputs = session.currentRoute.outputs.map { "\($0.portType.rawValue):\($0.portName)" }
        print("\(prefix) in=[\(inputs.joined(separator: ", "))] out=[\(outputs.joined(separator: ", "))]")
    }

    func hasA2DPOutput() -> Bool {
        session.currentRoute.outputs.contains { $0.portType == .bluetoothA2DP }
    }

    /// Tonos PCM por veredicto de cruce (440/800/1200 Hz). Async para no bloquear MainActor.
    func playTone(hz: Double, durationMs: Int) async throws {
        let sampleRate = 44_100.0
        let frameCount = AVAudioFrameCount(Double(durationMs) / 1000.0 * sampleRate)
        guard let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1),
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else { return }
        buffer.frameLength = frameCount
        let theta = 2.0 * Double.pi * hz / sampleRate
        if let channel = buffer.floatChannelData?[0] {
            for i in 0..<Int(frameCount) {
                channel[i] = Float(sin(theta * Double(i)) * 0.35)
            }
        }
        let engine = AVAudioEngine()
        let player = AVAudioPlayerNode()
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: format)
        try engine.start()
        player.scheduleBuffer(buffer, at: nil, options: .interrupts) {}
        player.play()
        try await Task.sleep(nanoseconds: UInt64((Double(durationMs) / 1000.0 + 0.08) * 1_000_000_000))
        player.stop()
        engine.stop()
    }
}
