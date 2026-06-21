import Foundation
import MWDATCamera
import MWDATCore
import UIKit

/// ViewModel del stream de cámara DAT (patrón Meta: tras Device Session ready).
/// 1.1 Start stream · 1.2 Listen frames · 1.3 Handle codec/state/errors.
@MainActor
final class StreamSessionViewModel: ObservableObject {
    @Published private(set) var previewImage: UIImage?
    @Published private(set) var streamStateLabel = "stopped"
    @Published private(set) var frameLabel = ""
    @Published private(set) var frameCount = 0

    var onChanged: (() -> Void)?
    /// Fan-out JPEG base64 al módulo activo (p. ej. cruce ~2 fps).
    var onFrameJpeg: ((String) -> Void)?
    /// Resolución fan-out: cruce usa 448 px para menos decode/YOLO en Mac.
    var frameFanOutMaxHeight: CGFloat = 896

    private let onLog: (String) -> Void
    private var lastFrameFanOutAt: Date = .distantPast
    private var stream: MWDATCamera.Stream?
    private var streamState: StreamState = .stopped
    private var stateToken: AnyListenerToken?
    private var frameToken: AnyListenerToken?
    private var latestStreamImage: UIImage?
    private var latestStreamImageAt: Date?
    private var hevcDecoder: HEVCDecoder?
    private var isCapturingPhoto = false
    private var started = false
    private var startInFlight: Task<Void, Error>?

    init(onLog: @escaping (String) -> Void = { _ in }) {
        self.onLog = onLog
    }

    var isStreaming: Bool { streamState == .streaming }

    var hasRecentFrame: Bool {
        guard let at = latestStreamImageAt, latestStreamImage != nil else { return false }
        return Date().timeIntervalSince(at) < 3
    }

    /// Arranca addStream + listeners + stream.start() sobre sesión DAT ya en `.started`.
    func start(on session: DeviceSession) async throws {
        if started {
            onLog("[stream] ya activo (\(streamStateLabel))")
            return
        }
        if let startInFlight {
            try await startInFlight.value
            return
        }
        let task = Task<Void, Error> { @MainActor in
            onLog("[stream] setup StreamSessionViewModel…")
            try await attachCameraStream(to: session)
            started = true
            notifyChanged()
        }
        startInFlight = task
        defer { startInFlight = nil }
        try await task.value
    }

    func stop() async {
        stateToken = nil
        frameToken = nil
        hevcDecoder?.invalidate()
        hevcDecoder = nil
        latestStreamImage = nil
        latestStreamImageAt = nil
        previewImage = nil
        frameCount = 0
        streamState = .stopped
        streamStateLabel = "stopped"
        frameLabel = ""
        started = false
        startInFlight?.cancel()
        startInFlight = nil
        await stream?.stop()
        stream = nil
        notifyChanged()
    }

    func captureFrameJpegBase64(maxHeight: CGFloat = 896) async throws -> String {
        if streamState != .streaming {
            onLog("[stream] esperando streaming (actual=\(streamStateLabel))…")
            try await waitForStreaming(timeoutMs: 8_000)
        }
        if await waitForRecentFrame(timeoutMs: 4_000), let image = latestStreamImage {
            onLog("[stream] frame en vivo (#\(frameCount)) h=\(Int(maxHeight))")
            return try jpegBase64(from: image, maxHeight: maxHeight)
        }
        onLog("[stream] capturePhoto (buffer=\(frameCount))…")
        let photo = try await capturePhotoOnce()
        guard let image = UIImage(data: photo.data) else {
            throw NSError(domain: "Puente", code: 3, userInfo: [NSLocalizedDescriptionKey: "Foto inválida"])
        }
        return try jpegBase64(from: image, maxHeight: maxHeight)
    }

    // MARK: - Private

    private func attachCameraStream(to session: DeviceSession) async throws {
        // fps bajos a propósito: menos frames que decodificar/enviar = menos lag.
        // (El fan-out al worker ya va aparte limitado a ~2 fps en fanOutFrameIfNeeded.)
        let configs: [(VideoCodec, StreamingResolution, UInt)] = [
            (.hvc1, .medium, 7),
            (.hvc1, .low, 8),
            (.raw, .medium, 7),
            (.raw, .low, 8),
        ]
        var lastError: String?

        for (index, triple) in configs.enumerated() {
            let (codec, resolution, fps) = triple
            let config = StreamConfiguration(videoCodec: codec, resolution: resolution, frameRate: fps)
            onLog("[stream] addStream() codec=\(codec) res=\(resolution) fps=\(fps)…")
            do {
                guard let stream = try session.addStream(config: config) else {
                    lastError = "addStream devolvió nil"
                    onLog("[stream] addStream nil (config \(index + 1))")
                    try await Task.sleep(nanoseconds: 1_000_000_000)
                    continue
                }
                self.stream = stream
                hevcDecoder = codec == .hvc1 ? HEVCDecoder() : nil
                frameCount = 0

                stateToken = stream.statePublisher.listen { [weak self] state in
                    Task { @MainActor in
                        guard let self else { return }
                        self.streamState = state
                        self.streamStateLabel = String(describing: state)
                        self.onLog("[stream] state = \(state)")
                        self.notifyChanged()
                    }
                }
                frameToken = stream.videoFramePublisher.listen { [weak self] frame in
                    Task { @MainActor in self?.ingestVideoFrame(frame) }
                }
                try await AudioRouter.shared.configureHFP()
                await stream.start()
                try await waitForStreaming(timeoutMs: 10_000)
                _ = await waitForRecentFrame(timeoutMs: 8_000)
                onLog("[stream] arrancado (config \(index + 1), frames=\(frameCount), state=\(streamStateLabel))")
                if streamState == .streaming { return }
            } catch {
                lastError = error.localizedDescription
                onLog("[stream] addStream error (config \(index + 1)): \(error.localizedDescription)")
                hevcDecoder?.invalidate()
                hevcDecoder = nil
                try await Task.sleep(nanoseconds: 1_000_000_000)
            }
        }

        throw NSError(
            domain: "Puente",
            code: 2,
            userInfo: [NSLocalizedDescriptionKey:
                "SDK Meta: no se pudo crear stream de cámara (\(lastError ?? "desconocido")). " +
                "Mantén gafas desplegadas y puestas; cierra otra sesión DAT activa."]
        )
    }

    private func ingestVideoFrame(_ frame: VideoFrame) {
        guard let image = decodeFrameImage(frame) else { return }
        latestStreamImage = image
        latestStreamImageAt = Date()
        frameCount += 1
        // Preview en vivo: refrescar cada frame para que se vea fluido.
        // (Antes era cada 15 frames ≈ 0.5 fps, por eso se veía "por fotos" y lento.)
        previewImage = image
        // La etiqueta y el aviso al padre sí cada 15, para no saturar el render.
        if frameCount == 1 || frameCount % 15 == 0 {
            frameLabel = "streaming · frame #\(frameCount)"
            notifyChanged()
        }
        if frameCount == 1 || frameCount % 30 == 0 {
            onLog("[stream] frame #\(frameCount) \(Int(image.size.width))x\(Int(image.size.height))")
        }
        fanOutFrameIfNeeded(image)
    }

    private func fanOutFrameIfNeeded(_ image: UIImage) {
        guard onFrameJpeg != nil else { return }
        let now = Date()
        guard now.timeIntervalSince(lastFrameFanOutAt) >= 0.45 else { return }
        lastFrameFanOutAt = now
        guard let jpeg = resize(image, maxHeight: frameFanOutMaxHeight).jpegData(compressionQuality: frameFanOutMaxHeight <= 448 ? 0.65 : 0.7) else { return }
        onFrameJpeg?(jpeg.base64EncodedString())
    }

    private func decodeFrameImage(_ frame: VideoFrame) -> UIImage? {
        if let direct = frame.makeUIImage() { return direct }
        if hevcDecoder == nil { hevcDecoder = HEVCDecoder() }
        return hevcDecoder?.decode(frame.sampleBuffer)
    }

    private func waitForStreaming(timeoutMs: Int) async throws {
        let start = Date()
        while streamState != .streaming && Date().timeIntervalSince(start) * 1000 < Double(timeoutMs) {
            try await Task.sleep(nanoseconds: 200_000_000)
        }
        guard streamState == .streaming else {
            throw NSError(domain: "Puente", code: 16, userInfo: [
                NSLocalizedDescriptionKey: "Timeout esperando stream=streaming (actual=\(streamStateLabel))"
            ])
        }
    }

    private func waitForRecentFrame(timeoutMs: Int) async -> Bool {
        let start = Date()
        while Date().timeIntervalSince(start) * 1000 < Double(timeoutMs) {
            if let at = latestStreamImageAt, latestStreamImage != nil,
               Date().timeIntervalSince(at) < 5 { return true }
            try? await Task.sleep(nanoseconds: 150_000_000)
        }
        return latestStreamImage != nil
    }

    private func capturePhotoOnce() async throws -> PhotoData {
        guard let stream else {
            throw NSError(domain: "Puente", code: 5, userInfo: [NSLocalizedDescriptionKey: "Sin stream"])
        }
        while isCapturingPhoto {
            try await Task.sleep(nanoseconds: 200_000_000)
        }
        isCapturingPhoto = true
        defer { isCapturingPhoto = false }

        return try await withCheckedThrowingContinuation { cont in
            var finished = false
            var photoListener: AnyListenerToken?

            func finish(with result: Result<PhotoData, Error>) {
                guard !finished else { return }
                finished = true
                photoListener = nil
                switch result {
                case .success(let photo): cont.resume(returning: photo)
                case .failure(let error): cont.resume(throwing: error)
                }
            }

            photoListener = stream.photoDataPublisher.listen { photo in
                Task { @MainActor in finish(with: .success(photo)) }
            }

            _ = stream.capturePhoto(format: .jpeg)

            Task { @MainActor in
                try await Task.sleep(nanoseconds: 15_000_000_000)
                finish(with: .failure(NSError(
                    domain: "Puente",
                    code: 6,
                    userInfo: [NSLocalizedDescriptionKey: "capturePhoto timeout"]
                )))
            }
        }
    }

    private func jpegBase64(from image: UIImage, maxHeight: CGFloat = 896) throws -> String {
        let resized = resize(image, maxHeight: maxHeight)
        guard let jpeg = resized.jpegData(compressionQuality: maxHeight <= 448 ? 0.65 : 0.7) else {
            throw NSError(domain: "Puente", code: 4, userInfo: [NSLocalizedDescriptionKey: "JPEG falló"])
        }
        return jpeg.base64EncodedString()
    }

    private func resize(_ image: UIImage, maxHeight: CGFloat) -> UIImage {
        let h = image.size.height
        guard h > maxHeight else { return image }
        let scale = maxHeight / h
        let size = CGSize(width: image.size.width * scale, height: maxHeight)
        UIGraphicsBeginImageContextWithOptions(size, false, 1)
        image.draw(in: CGRect(origin: .zero, size: size))
        let out = UIGraphicsGetImageFromCurrentImageContext()
        UIGraphicsEndImageContext()
        return out ?? image
    }

    private func notifyChanged() {
        onChanged?()
    }
}
