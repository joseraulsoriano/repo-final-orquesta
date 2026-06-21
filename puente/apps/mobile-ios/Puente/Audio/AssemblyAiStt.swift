import AVFoundation
import Foundation

final class AssemblyAiStt: @unchecked Sendable {
    private var webSocket: URLSessionWebSocketTask?
    private let lock = NSLock()
    private var listenTask: Task<Void, Never>?

    private(set) var transcript = ""
    private(set) var endOfTurn = false
    private(set) var failed = false
    var onPartial: ((String) -> Void)?

    func connect(token: String) async throws {
        let urlString =
            "wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&speech_model=u3-rt-pro&token=\(token)"
        guard let url = URL(string: urlString) else { throw URLError(.badURL) }
        let task = URLSession.shared.webSocketTask(with: url)
        webSocket = task
        task.resume()
        listenTask = Task { await self.listen(on: task) }
        try await Task.sleep(nanoseconds: 300_000_000)
    }

    private func listen(on task: URLSessionWebSocketTask) async {
        while !Task.isCancelled {
            do {
                let msg = try await task.receive()
                guard case .string(let text) = msg,
                      let data = text.data(using: .utf8),
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let type = json["type"] as? String
                else { continue }

                lock.lock()
                if type == "Turn" {
                    var partialText: String?
                    if let t = json["transcript"] as? String {
                        transcript = t
                        partialText = t
                    }
                    if json["end_of_turn"] as? Bool == true { endOfTurn = true }
                    let partial = onPartial
                    lock.unlock()
                    if let partialText, !partialText.isEmpty { partial?(partialText) }
                    continue
                } else if type == "Termination" {
                    endOfTurn = true
                }
                lock.unlock()
            } catch {
                lock.lock()
                failed = true
                lock.unlock()
                break
            }
        }
    }

    func sendPCM(_ data: Data) {
        webSocket?.send(.data(data)) { _ in }
    }

    func forceEndpoint() {
        webSocket?.send(.string(#"{"type":"ForceEndpoint"}"#)) { _ in }
    }

    func terminate() -> String {
        listenTask?.cancel()
        webSocket?.send(.string(#"{"type":"Terminate"}"#)) { _ in }
        webSocket?.cancel(with: .goingAway, reason: nil)
        lock.lock()
        let t = transcript
        lock.unlock()
        return t
    }
}

enum PCM16Converter {
    static func toMono16k(_ buffer: AVAudioPCMBuffer) -> Data? {
        guard let format = AVAudioFormat(
            commonFormat: .pcmFormatInt16,
            sampleRate: 16_000,
            channels: 1,
            interleaved: true
        ), let converter = AVAudioConverter(from: buffer.format, to: format) else { return nil }

        let ratio = format.sampleRate / buffer.format.sampleRate
        let outCapacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 64
        guard let out = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: outCapacity) else { return nil }

        var err: NSError?
        var consumed = false
        converter.convert(to: out, error: &err) { _, status in
            if consumed {
                status.pointee = .noDataNow
                return nil
            }
            consumed = true
            status.pointee = .haveData
            return buffer
        }
        guard err == nil, let ch = out.int16ChannelData else { return nil }
        return Data(bytes: ch[0], count: Int(out.frameLength) * MemoryLayout<Int16>.size)
    }
}
