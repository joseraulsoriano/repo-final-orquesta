import CoreMedia
import UIKit
import VideoToolbox

/// Decodifica frames HEVC del stream DAT (Ray-Ban real suele mandar hvc1, no raw).
final class HEVCDecoder {
    private var decompressionSession: VTDecompressionSession?
    private var lastFormatDescription: CMFormatDescription?

    deinit { invalidate() }

    func decode(_ sampleBuffer: CMSampleBuffer) -> UIImage? {
        guard CMSampleBufferIsValid(sampleBuffer),
              let formatDescription = CMSampleBufferGetFormatDescription(sampleBuffer)
        else { return nil }

        if lastFormatDescription == nil
            || !CMFormatDescriptionEqual(formatDescription, otherFormatDescription: lastFormatDescription!) {
            createSession(formatDescription: formatDescription)
        }
        guard let session = decompressionSession else { return nil }

        var outputImage: UIImage?
        var flagOut: VTDecodeInfoFlags = []
        let status = VTDecompressionSessionDecodeFrame(
            session,
            sampleBuffer: sampleBuffer,
            flags: [._EnableAsynchronousDecompression],
            infoFlagsOut: &flagOut
        ) { status, _, imageBuffer, _, _ in
            guard status == noErr, let pixelBuffer = imageBuffer else { return }
            outputImage = Self.imageFromPixelBuffer(pixelBuffer)
        }
        guard status == noErr else { return nil }
        VTDecompressionSessionWaitForAsynchronousFrames(session)
        return outputImage
    }

    func invalidate() {
        if let session = decompressionSession {
            VTDecompressionSessionInvalidate(session)
        }
        decompressionSession = nil
        lastFormatDescription = nil
    }

    private func createSession(formatDescription: CMFormatDescription) {
        invalidate()
        var session: VTDecompressionSession?
        let attrs: [String: Any] = [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
        ]
        let status = VTDecompressionSessionCreate(
            allocator: kCFAllocatorDefault,
            formatDescription: formatDescription,
            decoderSpecification: nil,
            imageBufferAttributes: attrs as CFDictionary,
            outputCallback: nil,
            decompressionSessionOut: &session
        )
        if status == noErr, let session {
            decompressionSession = session
            lastFormatDescription = formatDescription
        }
    }

    private static func imageFromPixelBuffer(_ pixelBuffer: CVPixelBuffer) -> UIImage? {
        let ci = CIImage(cvPixelBuffer: pixelBuffer)
        guard let cg = CIContext().createCGImage(ci, from: ci.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
}
