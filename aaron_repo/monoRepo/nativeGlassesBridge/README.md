# Meta Ray-Ban Native Glasses Bridge (Ingestión de Ultra-Baja Latencia)

Este nuevo directorio contiene la implementación del puente nativo de ultra-baja latencia entre las gafas Meta Ray-Ban (vía el Wearables Device Access Toolkit SDK) y el primer nodo de Inteligencia Artificial (el Agente Distribuidor/Percepción), saltándose el almacenamiento en disco y utilizando canales WebSocket independientes para evitar el bloqueo de transmisión (*Head-of-Line Blocking*).

---

## Estructura del Directorio

```
nativeGlassesBridge/
├── README.md               <-- Este archivo explicativo
├── backend/
│   ├── requirements.txt    <-- Dependencias de Python FastAPI y Google GenAI
│   ├── config.py           <-- Configuración del nombre del asistente (Wake Word) y llaves API
│   ├── main.py             <-- Servidor FastAPI con WebSockets separados y simulación de LangGraph
│   ├── maps_client.py      <-- Integración con las APIs de Google Places (New) y Directions
│   └── distributor.py      <-- Agente Distribuidor multimodal con Gemini 2.5 Flash
└── ios/
    ├── MetaGlassesManager.swift <-- Configuración nativa del SDK de Meta y AVAudioEngine HFP
    └── StreamingClient.swift    <-- WebSocket dual persistente e interacción nativa iOS (TTS, háptico)
```

---

## 🚀 Guía de Configuración y Ejecución

### 1. Servidor Backend (FastAPI + Python)

1. Navega al directorio del backend y crea tu entorno virtual:
   ```bash
   cd backend
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

2. Configura tus llaves y variables en un archivo `.env` dentro de `backend/`:
   ```env
   # Nombre personalizable del asistente (Wake Word)
   ASSISTANT_NAME="Aaron"

   # Llaves API obligatorias
   GOOGLE_API_KEY="TU_GOOGLE_MAPS_API_KEY"
   GEMINI_API_KEY="TU_GEMINI_API_KEY"
   
   # Opciones de servidor (Opcionales)
   HOST="0.0.0.0"
   PORT="8000"
   ```

3. Levanta el servidor local:
   ```bash
   uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
   ```
   * *API de salud:* [http://localhost:8000/](http://localhost:8000/)

---

### 2. Cliente Móvil Nativo (iOS Swift)

1. Abre tu proyecto nativo en Xcode.
2. Agrega la dependencia del SDK de Meta a través de Swift Package Manager (SPM):
   * URL del repositorio: `https://github.com/facebook/meta-wearables-dat-ios`
3. Copia los archivos `MetaGlassesManager.swift` y `StreamingClient.swift` a tu proyecto Xcode.
4. Asegúrate de configurar en tu `Info.plist` los permisos y configuraciones requeridos descritos en [ios_integration.md](file:///Users/aaron/dev/platanusHack/meta-rayban-sdk-docs/ios_integration.md) (como `NSBluetoothAlwaysUsageDescription`, `UISupportedExternalAccessoryProtocols` y la configuración `MWDAT` de Meta).

---

## 🔍 Protocolo de Pruebas (Mocking y Activación)

1. **Simulación de Wake Command:**
   Con el servidor corriendo, puedes simular una orden de voz enviando un evento de texto simulado al socket de audio. Desde la consola de Xcode o de pruebas:
   ```swift
   streamingClient.sendTranscriptText("Hola Aaron, vamos al super más cercano a comprar leche")
   ```
   El backend:
   * Llamará a Google Places para encontrar el supermercado más cercano a tus coordenadas GPS.
   * Calculará la ruta de caminata con Google Directions.
   * Agregará la "leche" a tu lista de compras.
   * Enviará el comando `START_PERCEPTUAL_LOOP` al dispositivo iOS.

2. **Recepción en el Móvil y Encendido de Sensores:**
   Al recibir `START_PERCEPTUAL_LOOP`, la app iOS iniciará automáticamente el stream de video de la cámara (`MWDATCamera` con throttling de 1 fps) y activará el tap de micrófono en HFP (`AVAudioEngine`), empezando el envío continuo de frames JPEG por `/ws/video` y audio PCM por `/ws/audio` para la guía espacial activa del usuario.
