import Foundation
import AVFoundation

#if canImport(UIKit)
import UIKit
#endif

public protocol StreamingClientDelegate: AnyObject {
    func streamingClient(_ client: StreamingClient, didReceiveStartPerceptualLoop payload: [String: Any])
    func streamingClient(_ client: StreamingClient, didChangeConnectionStatus isConnected: Bool, channel: String)
}

public class StreamingClient: NSObject {
    public weak var delegate: StreamingClientDelegate?
    
    private let sessionId: String
    private let serverHost: String
    
    private var audioTask: URLSessionWebSocketTask?
    private var videoTask: URLSessionWebSocketTask?
    
    private let speechSynthesizer = AVSpeechSynthesizer()
    private let urlSession = URLSession(configuration: .default)
    
    public init(sessionId: String, host: String = "localhost:8000") {
        self.sessionId = sessionId
        self.serverHost = host
        super.init()
    }
    
    /// Conecta ambos canales de WebSockets de forma independiente (Audio y Video)
    public func connect() {
        // 1. Canal de Audio
        let audioUrl = URL(string: "ws://\(serverHost)/ws/audio?session_id=\(sessionId)")!
        print("[StreamingClient] Conectando canal de audio a: \(audioUrl.absoluteString)")
        audioTask = urlSession.webSocketTask(with: audioUrl)
        audioTask?.resume()
        listenToChannel(task: audioTask, name: "Audio")
        delegate?.streamingClient(self, didChangeConnectionStatus: true, channel: "Audio")
        
        // 2. Canal de Video
        let videoUrl = URL(string: "ws://\(serverHost)/ws/video?session_id=\(sessionId)")!
        print("[StreamingClient] Conectando canal de video a: \(videoUrl.absoluteString)")
        videoTask = urlSession.webSocketTask(with: videoUrl)
        videoTask?.resume()
        listenToChannel(task: videoTask, name: "Video")
        delegate?.streamingClient(self, didChangeConnectionStatus: true, channel: "Video")
    }
    
    public func disconnect() {
        print("[StreamingClient] Cancelando tareas de WebSockets (Desconectando)...")
        audioTask?.cancel(with: .normalClosure, reason: nil)
        videoTask?.cancel(with: .normalClosure, reason: nil)
        
        delegate?.streamingClient(self, didChangeConnectionStatus: false, channel: "Audio")
        delegate?.streamingClient(self, didChangeConnectionStatus: false, channel: "Video")
    }
    
    /// Envía un buffer de audio PCM de 8kHz crudo por el canal de audio (binario)
    public func sendAudioData(_ data: Data) {
        audioTask?.send(.data(data)) { error in
            if let error = error {
                print("[StreamingClient] Error de envío en canal de audio: \(error.localizedDescription)")
            }
        }
    }
    
    /// Envía un frame de video JPEG comprimido por el canal de video (binario)
    public func sendVideoFrame(_ jpegData: Data) {
        print("[StreamingClient] Enviando frame de video (\(jpegData.count) bytes) al servidor...")
        videoTask?.send(.data(jpegData)) { error in
            if let error = error {
                print("[StreamingClient] Error de envío en canal de video: \(error.localizedDescription)")
            }
        }
    }
    
    /// Envía texto al servidor de audio para procesar comandos de voz (ej: simulación de wake word)
    public func sendTranscriptText(_ text: String) {
        print("[StreamingClient] Enviando transcripción de texto: '\(text)'")
        let payload: [String: Any] = [
            "type": "transcript",
            "text": text,
            "timestamp": Date().timeIntervalSince1970
        ]
        if let jsonData = try? JSONSerialization.data(withJSONObject: payload, options: []),
           let jsonString = String(data: jsonData, encoding: .utf8) {
            audioTask?.send(.string(jsonString)) { error in
                if let error = error {
                    print("[StreamingClient] Error de envío de texto de transcripción: \(error)")
                }
            }
        }
    }
    
    private func listenToChannel(task: URLSessionWebSocketTask?, name: String) {
        task?.receive { [weak self] result in
            guard let self = self, let task = task else { return }
            
            switch result {
            case .success(let message):
                switch message {
                case .string(let jsonString):
                    print("[StreamingClient] Mensaje JSON crudo recibido en canal \(name)")
                    self.handleIncomingMessage(jsonString)
                case .data(let data):
                    print("[StreamingClient] Advertencia: Se recibió payload binario no esperado en canal \(name): \(data.count) bytes")
                @unknown default:
                    break
                }
                
                // Volver a escuchar de forma recursiva
                self.listenToChannel(task: task, name: name)
                
            case .failure(let error):
                print("[StreamingClient] Error de recepción en canal \(name): \(error.localizedDescription)")
                self.delegate?.streamingClient(self, didChangeConnectionStatus: false, channel: name)
            }
        }
    }
    
    private func handleIncomingMessage(_ jsonString: String) {
        guard let data = jsonString.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data, options: []) as? [String: Any],
              let action = json["action"] as? String,
              let payload = json["payload"] as? [String: Any] else {
            print("[StreamingClient] Error al decodificar mensaje JSON: \(jsonString)")
            return
        }
        
        print("Mensaje recibido del servidor: \(action)")
        
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            
            switch action {
            case "START_PERCEPTUAL_LOOP":
                // Notificar a la app para que inicie la cámara y micrófono HFP
                self.delegate?.streamingClient(self, didReceiveStartPerceptualLoop: payload)
                
                // Anunciar el inicio vía TTS
                if let summary = payload["route_summary"] as? String {
                    self.speak(summary)
                }
                
            case "SPEAK":
                if let text = payload["text"] as? String {
                    self.speak(text)
                }
                
            case "SPEAK_ALERT":
                if let text = payload["text"] as? String {
                    self.speak(text)
                    self.triggerHapticFeedback()
                }
                
            default:
                print("Acción no soportada: \(action)")
            }
        }
    }
    
    private func speak(_ text: String) {
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: "es-MX")
        utterance.rate = 0.55 // Velocidad de habla natural
        
        // Detener reproducción actual para no traslapar
        if speechSynthesizer.isSpeaking {
            speechSynthesizer.stopSpeaking(at: .immediate)
        }
        speechSynthesizer.speak(utterance)
    }
    
    private func triggerHapticFeedback() {
        #if canImport(UIKit)
        // Generador de impacto táctil para alertas de peligro físico (EBU standards)
        let generator = UINotificationFeedbackGenerator()
        generator.notificationOccurred(.error)
        #endif
    }
}
