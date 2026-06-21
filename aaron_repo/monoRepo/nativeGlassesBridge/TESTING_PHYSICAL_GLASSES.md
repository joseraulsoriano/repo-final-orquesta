# Guía de Pruebas: Testeo Físico en Meta Ray-Ban Glasses

Esta guía explica detalladamente los pasos necesarios para desplegar, conectar y probar la integración nativa de ultra-baja latencia utilizando unas **gafas físicas Meta Ray-Ban** y un **iPhone físico**.

---

## 📋 Requisitos Previos

1. **Hardware:**
   * Un iPhone físico (iOS 17+) conectado a la misma red Wi-Fi que tu Mac.
   * Gafas Meta Ray-Ban emparejadas con el iPhone.
   * Una Mac con Xcode instalado.
2. **Cuentas y Registros:**
   * Cuenta de desarrollador de Apple (gratuita o de pago) para firmar la app y habilitar capacidades de Bluetooth.
   * Cuenta de Meta registrada en el [Wearables Developer Center](https://developer.meta.com/).
   * Modo Desarrollador (*Developer Mode*) activado en la App Meta AI de tu iPhone.

---

## 🛠️ Paso 1: Configurar el Backend en la Red Local (LAN)

Para que el iPhone pueda comunicarse con el servidor corriendo en tu Mac, el servidor debe estar expuesto en tu red local:

1. **Obtén la IP local de tu Mac:**
   Abre la terminal de tu Mac y ejecuta:
   ```bash
   ipconfig getifaddr en0
   ```
   *Supongamos que el resultado es `192.168.1.15`.*

2. **Levanta el Servidor FastAPI en la IP Local:**
   Asegúrate de que tu archivo `.env` en `backend/` contenga tus llaves (`GEMINI_API_KEY` y `GOOGLE_API_KEY`), y ejecuta:
   ```bash
   uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
   ```
   *El parámetro `--host 0.0.0.0` expone el servidor a todos los dispositivos de la red Wi-Fi.*

---

## 📱 Paso 2: Configuración del Proyecto Xcode (iOS)

1. **Crea un nuevo proyecto en Xcode:**
   * Elige **iOS App** y selecciona **Swift** como lenguaje y **SwiftUI** como interfaz.
2. **Habilita las Capacidades Requeridas (Signing & Capabilities):**
   * **Background Modes:** Selecciona `Uses Bluetooth accessories` y `Acts as a Bluetooth peripheral`.
   * **Keychain Sharing:** Requerido para almacenar las credenciales de la sesión de Meta de forma segura.
3. **Agrega el SDK de Meta (SPM):**
   * En Xcode, ve a **File** > **Add Package Dependencies...**
   * Agrega: `https://github.com/facebook/meta-wearables-dat-ios`
4. **Modifica el `Info.plist` de la App:**
   Agrega los siguientes parámetros obligatorios de attestation y conexión externa:
   ```xml
   <!-- Protocolo de Accesorios Externos de Meta -->
   <key>UISupportedExternalAccessoryProtocols</key>
   <array>
       <string>com.meta.ar.wearable</string>
   </array>
   
   <!-- Descripción de Permisos -->
   <key>NSBluetoothAlwaysUsageDescription</key>
   <string>Esta app necesita conexión Bluetooth para comunicarse con las gafas Meta Ray-Ban.</string>
   
   <!-- Configuración MWDAT del SDK de Meta -->
   <key>MWDAT</key>
   <dict>
       <key>AppLinkURLScheme</key>
       <string>tunombredeapp://</string>
       <key>MetaAppID</key>
       <string>TU_META_APP_ID_DE_DEVELOPER_CENTER</string>
       <key>ClientToken</key>
       <string>TU_CLIENT_TOKEN_DE_DEVELOPER_CENTER</string>
       <key>TeamID</key>
       <string>TU_APPLE_DEVELOPER_TEAM_ID</string>
       <key>DAMEnabled</key>
       <true/>
   </dict>
   ```

---

## 🔗 Paso 3: Cablear los Archivos Nativos y Apuntar al Servidor

1. Agrega los archivos [MetaGlassesManager.swift](file:///Users/aaron/dev/platanusHack/nativeGlassesBridge/ios/MetaGlassesManager.swift) y [StreamingClient.swift](file:///Users/aaron/dev/platanusHack/nativeGlassesBridge/ios/StreamingClient.swift) a tu proyecto Xcode.
2. En tu vista SwiftUI principal, inicializa el cliente apuntando a la **IP de tu Mac**:
   ```swift
   struct ContentView: View {
       @State private var client = StreamingClient(sessionId: "session_prueba_fisica", host: "192.168.1.15:8000") // Usa la IP real de tu Mac
       @State private var glassesManager = MetaGlassesManager()
       
       var body: some View {
           VStack(spacing: 20) {
               Button("Conectar Sockets") {
                   client.connect()
               }
               
               Button("Simular Wake Word") {
                   client.sendTranscriptText("Hola Aaron, vamos al super más cercano a comprar leche")
               }
           }
           .onAppear {
               glassesManager.delegate = self
               client.delegate = self
           }
       }
   }
   ```
3. Extiende tu vista/controlador para conectar los delegados y reaccionar a las órdenes del backend:
   ```swift
   extension ContentView: MetaGlassesManagerDelegate, StreamingClientDelegate {
       // MetaGlassesManagerDelegate
       func glassesManager(_ manager: MetaGlassesManager, didCaptureAudioChunk data: Data) {
           client.sendAudioData(data) // Transmite PCM crudo al backend
       }
       
       func glassesManager(_ manager: MetaGlassesManager, didCaptureVideoFrame jpegData: Data) {
           client.sendVideoFrame(jpegData) // Transmite frames JPEG al backend
       }
       
       func glassesManager(_ manager: MetaGlassesManager, didChangeState state: String) {
           print("Gafas State: \(state)")
       }
       
       // StreamingClientDelegate
       func streamingClient(_ client: StreamingClient, didReceiveStartPerceptualLoop payload: [String : Any]) {
           Task {
               // El servidor validó la ruta; iniciamos cámara y micrófono automáticamente
               try? await glassesManager.startCapture()
           }
       }
       
       func streamingClient(_ client: StreamingClient, didChangeConnectionStatus isConnected: Bool, channel: String) {
           print("Canal \(channel) conectado: \(isConnected)")
       }
   }
   ```

---

## 🏃‍♂️ Paso 4: Protocolo de Ejecución del Test Físico

1. **Conecta tu iPhone físico** a la Mac vía cable y selecciona tu iPhone como dispositivo de destino en Xcode.
2. Presiona **Run** en Xcode para compilar e instalar la app.
3. **Flujo de una sola vez (Registro y Permisos):**
   * Abre la app instalada en tu iPhone.
   * Al inicializar el SDK, si el dispositivo no está registrado, se te redirigirá automáticamente a la app **Meta AI**.
   * Presiona **Conectar/Permitir** en Meta AI para enlazar tu aplicación.
   * Regresarás a tu aplicación. Se te solicitará permiso de cámara en un flujo similar.
4. **Comenzar la navegación y el bucle perceptual:**
   * Enciende tus gafas Meta Ray-Ban y colócatelas. Asegúrate de escuchar el sonido de confirmación en las gafas.
   * Abre tu app y presiona **"Conectar Sockets"**.
   * Presiona **"Simular Wake Word"** (o usa el comando por voz si tienes un motor de reconocimiento local configurado).
   * **El Backend:** Buscará el supermercado más cercano vía Google Places, calculará la ruta peatonal en Google Directions e inyectará la información de la ruta en LangGraph.
   * **La App iOS:** Recibirá de inmediato el comando `START_PERCEPTUAL_LOOP`.
   * **Confirmación de voz:** Las gafas te hablarán diciendo: *"Entendido. Calculando ruta al supermercado más cercano, que está a 350 metros..."*
   * **Captura Activa:** La app móvil encenderá el tap del micrófono HFP y el stream de la cámara de forma automática.
   * **Guía espacial activa:** Camina. A cada segundo, el backend procesará el frame de video mediante YOLO (visión local rápida de `eyesstreelighttalk`) combinándolo con Gemini Flash, y te irá describiendo por voz (ej. *"El semáforo ha cambiado a verde, el cruce está libre, camina recto"*) de forma fluida a través de los altavoces de tus gafas Meta Ray-Ban.

---

## 💡 Consejos de Rendimiento para Bluetooth

* **Uso de Anchos de Banda Bajos:** La conexión entre las gafas y el iPhone es Bluetooth Classic. Para evitar desconexiones de frames de video, mantén la configuración del stream en resolución `medium` (504 x 896 px) o `low`, y un frame rate de 7 fps en el `MetaGlassesManager` (el código ya incluye un mecanismo de *throttling* para enviar únicamente 1 frame por segundo por el WebSocket).
* **Batería:** Asegúrate de que las gafas estén por encima del 15% de batería para que los streams nativos no se suspendan por políticas de ahorro de energía de Meta OS.
