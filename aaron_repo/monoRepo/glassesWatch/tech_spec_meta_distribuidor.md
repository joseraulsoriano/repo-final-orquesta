# Tech Spec: Integración Meta Ray-Ban <—> Agente Distribuidor (Ingestión/Percepción)

### Propósito
Establecer un puente de ultra-baja latencia entre el hardware físico (Meta Ray-Ban) y nuestro primer nodo de Inteligencia Artificial (el Agente Distribuidor/Percepción), saltándose la necesidad de guardar archivos de video en el disco del celular.

### Flujo Técnico (Paso a Paso)
1. **Capa Hardware a Móvil (Bluetooth/Wi-Fi):**
   *   El usuario inicia sesión en la App Compañera (iOS Swift).
   *   La App usa `MWDATCore` del SDK de Meta para registrar la sesión.
   *   Se inicializa `MWDATCamera` para extraer un frame de video por segundo (o bajo demanda de movimiento).
   *   Se configura `AVAudioEngine` con un *tap* en el bus de entrada, usando el perfil **HFP (Hands-Free Profile)** para obtener buffers crudos PCM de 8kHz desde los micrófonos de las gafas.

2. **Capa Móvil a Backend (WebSocket):**
   *   La App móvil mantiene abierta una conexión WebSocket segura (wss://) hacia nuestro backend.
   *   Los buffers de audio PCM se envían en pequeños chunks (ej. cada 100ms) para que el servidor haga *streaming transcription* (ej. vía Deepgram o Whisper en tiempo real).
   *   Los frames de video se codifican en Base64 comprimido y se envían por el mismo socket.

3. **Agente Distribuidor (El Receptor en el Servidor):**
   *   Este es el primer nodo de nuestra arquitectura IA. Es un modelo multimodal rápido (ej. GPT-4o o Gemini 1.5 Pro).
   *   **Input:** Frame Base64 + Texto transcrito del audio en esa fracción de tiempo.
   *   **Procesamiento:** El Agente Distribuidor no toma decisiones lógicas. Su única función es **traducir el mundo analógico a Markdown estandarizado**.
   *   **Output generado:** `[Vision_Data: Semáforo en rojo, usuario detenido] [Audio_User: "¿Puedo cruzar?"]`.
