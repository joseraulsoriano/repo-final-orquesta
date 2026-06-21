import Foundation
import AVFoundation
import Speech
#if canImport(UIKit)
import UIKit
#endif

#if canImport(MWDATCore) && canImport(MWDATCamera) && !targetEnvironment(simulator)
import MWDATCore
import MWDATCamera
#endif

public enum BridgeError: Error {
    case cameraSetupFailed
    case permissionDenied
    case audioSessionFailed
}

@MainActor
public protocol MetaGlassesManagerDelegate: AnyObject {
    func glassesManager(_ manager: MetaGlassesManager, didCaptureAudioChunk data: Data)
    func glassesManager(_ manager: MetaGlassesManager, didCaptureVideoFrame jpegData: Data)
    func glassesManager(_ manager: MetaGlassesManager, didChangeState state: String)
    func glassesManager(_ manager: MetaGlassesManager, didRecognizeSpeechText text: String)
}

@MainActor
public class MetaGlassesManager: NSObject {
    public weak var delegate: MetaGlassesManagerDelegate?
    
    private let audioEngine = AVAudioEngine()
    private var isCapturing = false
    private var lastFrameTime: TimeInterval = 0
    private let frameThrottleInterval: TimeInterval = 1.0 // Enviar 1 frame por segundo (1 fps)
    
    private let speechRecognizer: SFSpeechRecognizer? = {
        print("[MetaGlassesManager] Inicializando SFSpeechRecognizer con locale es-MX...")
        if let mxRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "es-MX")) {
            print("[MetaGlassesManager] SFSpeechRecognizer es-MX creado exitosamente.")
            return mxRecognizer
        }
        print("[MetaGlassesManager] Advertencia: es-MX no soportado. Usando locale por defecto del sistema.")
        return SFSpeechRecognizer()
    }()
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    
    // Cámara de los lentes en producción
    #if canImport(MWDATCore) && canImport(MWDATCamera) && !targetEnvironment(simulator)
    private var deviceSession: DeviceSession?
    private var cameraStream: MWDATCamera.Stream?
    #endif
    
    public override init() {
        super.init()
    }
    
    /// Inicializa la captura respetando el ordenamiento técnico estricto de Meta
    /// 1. Agregar el stream de cámara
    /// 2. Configurar y encender HFP Audio
    /// 3. Esperar a que la ruta Bluetooth se asiente (2 segundos)
    /// 4. Iniciar la transmisión de cámara
    public func startCapture() async throws {
        print("[MetaGlassesManager] startCapture solicitado.")
        guard !isCapturing else {
            print("[MetaGlassesManager] Captura ya activa. Ignorando startCapture.")
            return
        }
        
        delegate?.glassesManager(self, didChangeState: "Initializing stream configuration...")
        
        // ----------------------------------------------------
        // PASO 2: Solicitar permisos y configurar Audio HFP (Gafas a Móvil)
        // ----------------------------------------------------
        delegate?.glassesManager(self, didChangeState: "Configuring Hands-Free Profile (HFP) Audio...")
        print("[MetaGlassesManager] Solicitando permiso de grabación de audio...")
        
        let granted = await AVAudioApplication.requestRecordPermission()
        guard granted else {
            print("[MetaGlassesManager] Error: Permiso de micrófono denegado.")
            throw BridgeError.permissionDenied
        }
        print("[MetaGlassesManager] Permiso de micrófono concedido.")
        
        print("[MetaGlassesManager] Solicitando autorización de reconocimiento de voz...")
        let speechAuthorized = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                print("[MetaGlassesManager] Estado de autorización de voz: \(status.rawValue)")
                continuation.resume(returning: status == .authorized)
            }
        }
        if !speechAuthorized {
            delegate?.glassesManager(self, didChangeState: "Speech recognition not authorized.")
            print("[MetaGlassesManager] Advertencia: Reconocimiento de voz no autorizado.")
        } else {
            print("[MetaGlassesManager] Reconocimiento de voz autorizado.")
        }
        
        let audioSession = AVAudioSession.sharedInstance()
        do {
            print("[MetaGlassesManager] Configurando categoría AVAudioSession a .playAndRecord con .allowBluetoothHFP...")
            // El perfil .allowBluetoothHFP es requerido para capturar el micrófono de las gafas a 8kHz
            try audioSession.setCategory(.playAndRecord, mode: .default, options: [.allowBluetoothHFP])
            try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
            print("[MetaGlassesSession] AVAudioSession activa.")
        } catch {
            print("[MetaGlassesManager] Error configurando sesión de audio: \(error)")
            throw BridgeError.audioSessionFailed
        }
        
        // Seleccionar la entrada HFP de las gafas (Bluetooth HFP)
        if let hfpInput = audioSession.availableInputs?.first(where: { $0.portType == .bluetoothHFP }) {
            print("[MetaGlassesManager] Lentes Ray-Ban Mic (HFP) encontrados. Configurando como input preferido...")
            try? audioSession.setPreferredInput(hfpInput)
            delegate?.glassesManager(self, didChangeState: "Connected to Ray-Ban Microphone (HFP)")
        } else {
            // Fallback al micrófono interno del teléfono en caso de Mocking/Prueba
            print("[MetaGlassesManager] Ray-Ban Mic no encontrado en Bluetooth. Usando micrófono interno del iPhone.")
            delegate?.glassesManager(self, didChangeState: "Ray-Ban Mic not found. Falling back to internal mic.")
        }
        
        // ----------------------------------------------------
        // PASO 3: Instalar el Tap en el motor de audio nativo (PCM 8kHz)
        // ----------------------------------------------------
        print("[MetaGlassesManager] Preparando AVAudioEngine...")
        let inputNode = audioEngine.inputNode
        let format = inputNode.inputFormat(forBus: 0) // HFP entregará 8kHz mono
        print("[MetaGlassesManager] Formato del nodo de entrada: \(format.sampleRate)Hz, \(format.channelCount) canales")
        
        // Inicializar e iniciar la transcripción de voz local
        setupSpeechRecognition()
        
        print("[MetaGlassesManager] Removiendo Taps previos e instalando nuevo Tap de audio a bus 0...")
        inputNode.removeTap(onBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            guard let self = self else { return }
            
            // Alimentar el buffer al reconocedor de voz local
            self.recognitionRequest?.append(buffer)
            
            // Extraer bytes PCM crudos del buffer
            if let channelData = buffer.int16ChannelData {
                let channelDataPointer = channelData.pointee
                let byteLength = Int(buffer.frameLength) * MemoryLayout<Int16>.size
                let data = Data(bytes: channelDataPointer, count: byteLength)
                self.delegate?.glassesManager(self, didCaptureAudioChunk: data)
            }
        }
        
        // Desactivar el volumen del mixer principal para evitar feedback y estática en las bocinas
        print("[MetaGlassesManager] Silenciando volumen del mixer principal (audioEngine.mainMixerNode.outputVolume = 0.0) para evitar estática/feedback.")
        audioEngine.mainMixerNode.outputVolume = 0.0
        
        do {
            print("[MetaGlassesManager] Preparando e iniciando audioEngine...")
            audioEngine.prepare()
            try audioEngine.start()
            print("[MetaGlassesManager] AVAudioEngine iniciado correctamente.")
        } catch {
            print("[MetaGlassesManager] Error iniciando AVAudioEngine: \(error)")
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
        isCapturing = true
        
        #if canImport(MWDATCore) && canImport(MWDATCamera) && !targetEnvironment(simulator)
        delegate?.glassesManager(self, didChangeState: "Starting video stream from Ray-Ban Meta...")
        do {
            let wearables = Wearables.shared
            
            // Requerir permisos si no están autorizados
            let cameraStatus: PermissionStatus
            do {
                cameraStatus = try await wearables.checkPermissionStatus(.camera)
            } catch {
                delegate?.glassesManager(self, didChangeState: "Permission check failed: \(error)")
                cameraStatus = .denied
            }
            
            if cameraStatus != .granted {
                do {
                    _ = try await wearables.requestPermission(.camera)
                } catch {
                    delegate?.glassesManager(self, didChangeState: "Permission request failed: \(error)")
                }
            }
            
            let deviceSelector = AutoDeviceSelector(wearables: wearables)
            let session: DeviceSession
            do {
                session = try wearables.createSession(deviceSelector: deviceSelector)
            } catch {
                delegate?.glassesManager(self, didChangeState: "Session creation failed: \(error)")
                throw error
            }
            self.deviceSession = session
            
            do {
                try session.start()
            } catch {
                delegate?.glassesManager(self, didChangeState: "Session start failed: \(error)")
                throw error
            }
            
            let config = StreamConfiguration(
                videoCodec: VideoCodec.raw,
                resolution: StreamingResolution.medium, // 504 x 896 px
                frameRate: 7
            )
            guard let stream = try? session.addStream(config: config) else {
                throw BridgeError.cameraSetupFailed
            }
            self.cameraStream = stream
            
            _ = stream.videoFramePublisher.listen { [weak self] frame in
                guard let self = self else { return }
                let jpegData = frame.makeUIImage()?.jpegData(compressionQuality: 0.7)
                Task { @MainActor in
                    let now = Date().timeIntervalSince1970
                    if now - self.lastFrameTime >= self.frameThrottleInterval {
                        self.lastFrameTime = now
                        if let jpegData = jpegData {
                            self.delegate?.glassesManager(self, didCaptureVideoFrame: jpegData)
                        }
                    }
                }
            }
            
            Task {
                await stream.start()
            }
            delegate?.glassesManager(self, didChangeState: "Streaming from Meta Glasses active (1 fps)...")
        } catch {
            let errorMsg = "Error: No se pudieron identificar las Gafas Meta Ray-Ban. Asegúrate de encenderlas, abrir las patillas y vincularlas en la app Meta View."
            delegate?.glassesManager(self, didChangeState: errorMsg)
            stopCapture()
        }
        #else
        delegate?.glassesManager(self, didChangeState: "Error: SDK de Meta no disponible en simulador. No se pudo iniciar la captura.")
        stopCapture()
        #endif
    }
    
    public func stopCapture() {
        print("[MetaGlassesManager] stopCapture solicitado.")
        guard isCapturing else {
            print("[MetaGlassesManager] Captura no activa. Ignorando stopCapture.")
            return
        }
        
        print("[MetaGlassesManager] Deteniendo audioEngine y removiendo Taps...")
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        
        print("[MetaGlassesManager] Cancelando tareas de reconocimiento de voz...")
        recognitionTask?.cancel()
        recognitionTask = nil
        recognitionRequest?.endAudio()
        recognitionRequest = nil
        
        #if canImport(MWDATCore) && canImport(MWDATCamera) && !targetEnvironment(simulator)
        print("[MetaGlassesManager] Deteniendo streams de cámara Meta...")
        if let stream = self.cameraStream {
            Task {
                print("[MetaGlassesManager] Deteniendo stream de cámara...")
                await stream.stop()
            }
        }
        if let session = self.deviceSession {
            print("[MetaGlassesManager] Deteniendo sesión del dispositivo...")
            session.stop()
        }
        self.deviceSession = nil
        self.cameraStream = nil
        #else
        print("[MetaGlassesManager] Ejecución en simulador (sin cámara local).")
        #endif
        
        print("[MetaGlassesManager] Desactivando AVAudioSession...")
        let audioSession = AVAudioSession.sharedInstance()
        try? audioSession.setActive(false, options: .notifyOthersOnDeactivation)
        
        isCapturing = false
        print("[MetaGlassesManager] Captura detenida de forma limpia.")
        delegate?.glassesManager(self, didChangeState: "Streaming stopped. Resources freed.")
    }
    
    private func setupSpeechRecognition() {
        print("[MetaGlassesManager] setupSpeechRecognition iniciado.")
        recognitionTask?.cancel()
        recognitionTask = nil
        
        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        guard let speechRecognizer = speechRecognizer, speechRecognizer.isAvailable, let recognitionRequest = recognitionRequest else {
            print("[MetaGlassesManager] Error: SFSpeechRecognizer no disponible, no inicializado o idioma no soportado.")
            delegate?.glassesManager(self, didChangeState: "Speech recognition unavailable or language not supported.")
            return
        }
        
        recognitionRequest.shouldReportPartialResults = true
        
        if #available(iOS 13.0, *) {
            recognitionRequest.requiresOnDeviceRecognition = false
        }
        
        print("[MetaGlassesManager] Creando tarea de reconocimiento de voz...")
        recognitionTask = speechRecognizer.recognitionTask(with: recognitionRequest) { [weak self] result, error in
            guard let self = self else { return }
            
            if let result = result {
                let transcription = result.bestTranscription.formattedString
                print("[MetaGlassesManager] Transcripción parcial local: '\(transcription)'")
                self.delegate?.glassesManager(self, didRecognizeSpeechText: transcription)
            }
            
            if let error = error {
                print("[MetaGlassesManager] Error en tarea de reconocimiento: \(error.localizedDescription)")
            }
            
            if error != nil || result?.isFinal == true {
                if self.isCapturing {
                    print("[MetaGlassesManager] Reiniciando ciclo de reconocimiento de voz...")
                    self.restartSpeechRecognition()
                }
            }
        }
        
        delegate?.glassesManager(self, didChangeState: "Speech Recognition engine listening...")
    }
    
    private func restartSpeechRecognition() {
        guard isCapturing else { return }
        
        recognitionRequest?.endAudio()
        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        guard let recognitionRequest = recognitionRequest else { return }
        recognitionRequest.shouldReportPartialResults = true
        
        recognitionTask = speechRecognizer?.recognitionTask(with: recognitionRequest) { [weak self] result, error in
            guard let self = self else { return }
            
            if let result = result {
                let transcription = result.bestTranscription.formattedString
                self.delegate?.glassesManager(self, didRecognizeSpeechText: transcription)
            }
            
            if error != nil || result?.isFinal == true {
                if self.isCapturing {
                    self.restartSpeechRecognition()
                }
            }
        }
    }
    
}
