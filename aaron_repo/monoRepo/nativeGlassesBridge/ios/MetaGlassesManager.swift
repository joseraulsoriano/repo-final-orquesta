import Foundation
import AVFoundation

// Simulación de los frameworks del SDK de Meta en caso de compilar localmente
// En Xcode real, se importa con:
// import MWDATCore
// import MWDATCamera

public enum BridgeError: Error {
    case cameraSetupFailed
    case permissionDenied
    case audioSessionFailed
}

public protocol MetaGlassesManagerDelegate: AnyObject {
    func glassesManager(_ manager: MetaGlassesManager, didCaptureAudioChunk data: Data)
    func glassesManager(_ manager: MetaGlassesManager, didCaptureVideoFrame jpegData: Data)
    func glassesManager(_ manager: MetaGlassesManager, didChangeState state: String)
}

public class MetaGlassesManager: NSObject {
    public weak var delegate: MetaGlassesManagerDelegate?
    
    private let audioEngine = AVAudioEngine()
    private var isCapturing = false
    private var lastFrameTime: TimeInterval = 0
    private let frameThrottleInterval: TimeInterval = 1.0 // Enviar 1 frame por segundo (1 fps)
    
    // Declaraciones mock del SDK de Meta Ray-Ban para referencia de compilación
    // En producción se descomentan las líneas reales de importación y se usan los objetos de Meta
    /*
    private var deviceSession: DeviceSession?
    private var cameraStream: MWDATCamera.Stream?
    */
    
    public override init() {
        super.init()
    }
    
    /// Inicializa la captura respetando el ordenamiento técnico estricto de Meta
    /// 1. Agregar el stream de cámara
    /// 2. Configurar y encender HFP Audio
    /// 3. Esperar a que la ruta Bluetooth se asiente (2 segundos)
    /// 4. Iniciar la transmisión de cámara
    public func startCapture() async throws {
        guard !isCapturing else { return }
        
        delegate?.glassesManager(self, didChangeState: "Initializing stream configuration...")
        
        // ----------------------------------------------------
        // PASO 1: Configurar el stream de cámara en el SDK
        // ----------------------------------------------------
        /*
        let config = StreamConfiguration(
            videoCodec: VideoCodec.raw,
            resolution: StreamingResolution.medium, // 504 x 896 px
            frameRate: 7
        )
        guard let stream = try? session.addStream(config: config) else {
            throw BridgeError.cameraSetupFailed
        }
        self.cameraStream = stream
        
        // Callback para capturar frames nativos
        _ = stream.videoFramePublisher.listen { [weak self] frame in
            guard let self = self else { return }
            let now = Date().timeIntervalSince1970
            if now - self.lastFrameTime >= self.frameThrottleInterval {
                self.lastFrameTime = now
                if let image = frame.makeUIImage(),
                   let jpegData = image.jpegData(compressionQuality: 0.7) {
                    self.delegate?.glassesManager(self, didCaptureVideoFrame: jpegData)
                }
            }
        }
        */
        
        // ----------------------------------------------------
        // PASO 2: Solicitar permisos y configurar Audio HFP (Gafas a Móvil)
        // ----------------------------------------------------
        delegate?.glassesManager(self, didChangeState: "Configuring Hands-Free Profile (HFP) Audio...")
        
        let granted = await AVAudioApplication.requestRecordPermission()
        guard granted else {
            throw BridgeError.permissionDenied
        }
        
        let audioSession = AVAudioSession.sharedInstance()
        do {
            // El perfil .allowBluetoothHFP es requerido para capturar el micrófono de las gafas a 8kHz
            try audioSession.setCategory(.playAndRecord, mode: .default, options: [.allowBluetoothHFP])
            try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            throw BridgeError.audioSessionFailed
        }
        
        // Seleccionar la entrada HFP de las gafas (Bluetooth HFP)
        if let hfpInput = audioSession.availableInputs?.first(where: { $0.portType == .bluetoothHFP }) {
            try? audioSession.setPreferredInput(hfpInput)
            delegate?.glassesManager(self, didChangeState: "Connected to Ray-Ban Microphone (HFP)")
        } else {
            // Fallback al micrófono interno del teléfono en caso de Mocking/Prueba
            delegate?.glassesManager(self, didChangeState: "Ray-Ban Mic not found. Falling back to internal mic.")
        }
        
        // ----------------------------------------------------
        // PASO 3: Instalar el Tap en el motor de audio nativo (PCM 8kHz)
        // ----------------------------------------------------
        let inputNode = audioEngine.inputNode
        let format = inputNode.inputFormat(forBus: 0) // HFP entregará 8kHz mono
        
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            guard let self = self else { return }
            
            // Extraer bytes PCM crudos del buffer
            if let channelData = buffer.int16ChannelData {
                let channelDataPointer = channelData.pointee
                let byteLength = Int(buffer.frameLength) * MemoryLayout<Int16>.size
                let data = Data(bytes: channelDataPointer, count: byteLength)
                self.delegate?.glassesManager(self, didCaptureAudioChunk: data)
            }
        }
        
        do {
            audioEngine.prepare()
            try audioEngine.start()
        } catch {
            throw BridgeError.audioSessionFailed
        }
        
        // ----------------------------------------------------
        // PASO 4: Esperar 2 segundos para estabilizar la ruta Bluetooth
        // ----------------------------------------------------
        delegate?.glassesManager(self, didChangeState: "Waiting 2 seconds for Bluetooth route to settle...")
        try await Task.sleep(nanoseconds: 2 * NSEC_PER_SEC)
        
        // ----------------------------------------------------
        // PASO 5: Iniciar el stream de video de forma segura
        // ----------------------------------------------------
        delegate?.glassesManager(self, didChangeState: "Starting video stream...")
        isCapturing = true
        
        /*
        // En producción:
        await stream.start()
        */
        
        // Simulación para pruebas locales: inicia un temporizador de frames mock
        startMockVideoGeneration()
    }
    
    public func stopCapture() {
        guard isCapturing else { return }
        
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        
        /*
        if let sessionId = deviceSession?.id {
            // Limpieza del SDK
            try? cameraStream?.stop()
        }
        */
        
        let audioSession = AVAudioSession.sharedInstance()
        try? audioSession.setActive(false, options: .notifyOthersOnDeactivation)
        
        isCapturing = false
        delegate?.glassesManager(self, didChangeState: "Streaming stopped. Resources freed.")
    }
    
    // Simula la captura de imágenes si estamos corriendo sin hardware real
    private func startMockVideoGeneration() {
        Task {
            while isCapturing {
                // Generar un pixel rojo simulado de 100x100 para pruebas de red
                if let mockImage = createSolidColorImage(color: .red, size: CGSize(width: 100, height: 100)),
                   let jpegData = mockImage.jpegData(compressionQuality: 0.5) {
                    self.delegate?.glassesManager(self, didCaptureVideoFrame: jpegData)
                }
                try? await Task.sleep(nanoseconds: 1 * NSEC_PER_SEC) // 1 fps
            }
        }
    }
    
    #if canImport(UIKit)
    private func createSolidColorImage(color: UIColor, size: CGSize) -> UIImage? {
        UIGraphicsBeginImageContextWithOptions(size, false, 0.0)
        color.setFill()
        UIRectFill(CGRect(origin: .zero, size: size))
        let image = UIGraphicsGetImageFromCurrentImageContext()
        UIGraphicsEndImageContext()
        return image
    }
    #else
    // Fallback multiplataforma para mock
    private func createSolidColorImage(color: Any, size: CGSize) -> MockImage? {
        return MockImage()
    }
    public class MockImage {
        public func jpegData(compressionQuality: Double) -> Data? {
            return "mock-jpeg-bytes".data(using: .utf8)
        }
    }
    #endif
}

#if !canImport(UIKit)
public enum UIColor {
    case red
}
#endif
