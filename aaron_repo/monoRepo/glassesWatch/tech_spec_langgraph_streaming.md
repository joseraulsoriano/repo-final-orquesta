# Tech Spec: Arquitectura de Streaming y Orquestación con LangGraph

## 1. El Porqué (Contexto y Justificación)
El sistema actual define una lógica de negocio robusta mediante un enjambre de agentes (*Sighted Guide Orchestrator* y sus especialistas). Sin embargo, para darles "manos" y conectar el hardware (Meta Ray-Ban) con estos prompts, necesitamos una infraestructura que resuelva el mayor enemigo de las aplicaciones de asistencia visual: **la latencia**.

Una arquitectura tradicional (guardar video en S3 -> disparar Cloud Function -> procesar -> base de datos -> responder) introduce segundos de retraso (latencia de red, I/O de disco y *cold starts*). Para una persona caminando en la calle, 2 segundos de retraso pueden resultar en un accidente físico. Por esto, pivoteamos hacia una arquitectura de procesamiento en memoria basada en **WebSockets** y **LangGraph**, externalizando esto en un repositorio independiente para mantener la pureza de la lógica de los agentes.

## 2. Objetivos
1. **Reducir la latencia a milisegundos:** Mover los datos del hardware al LLM sin tocar el disco duro en el camino crítico.
2. **Orquestación en Memoria:** Utilizar LangGraph para manejar el estado de la conversación y enrutar condicionalmente a los agentes sin depender de consultas a bases de datos intermedias.
3. **Escritura Asíncrona (Fire and Forget):** Guardar el historial en bases de datos NoSQL y S3 únicamente como procesos secundarios (en background) para el entrenamiento y el RAG, sin bloquear la respuesta al usuario.

---

## 3. Paso a Paso del Flujo (El "Cómo")

A continuación se detalla el ciclo de vida de un evento, desde que es capturado por las gafas hasta que el usuario escucha la respuesta.

### Paso 1: Ingestión Continua (Hardware a Servidor)
*   **Trigger:** El usuario activa el sistema en sus gafas.
*   **Input:** Flujo de audio del micrófono y *frames* de video (ej. 1 foto por segundo).
*   **Procesamiento:** Las gafas abren una conexión persistente bidireccional (WebSocket o WebRTC) con el servidor backend. No se suben archivos pesados, se emiten paquetes de bytes en tiempo real.
*   **Output:** Stream de datos disponible en la memoria del servidor de ingestión.

### Paso 2: Nodo de Percepción (El Traductor)
*   **Trigger:** Recepción de un nuevo *frame* o transcripción de audio (mediante Whisper/Deepgram en streaming).
*   **Input:** Imagen (Base64) + Texto de audio.
*   **Procesamiento:** Un modelo multimodal (VLM rápido) toma la foto y genera el Markdown estandarizado del entorno (ej. `[Vision: Semáforo en rojo]`).
*   **Output:** Un string en formato Markdown.
*   **Acción paralela (Asíncrona):** Se dispara un *worker* en background que toma la imagen original y el audio y los envía a S3, y guarda el Markdown en la base de datos NoSQL para logs/RAG.

### Paso 3: Nodo Orquestador (LangGraph Router)
*   **Trigger:** Recepción del Markdown generado por el Nodo de Percepción.
*   **Input:** State de LangGraph (que incluye el Markdown nuevo y el historial de la sesión).
*   **Procesamiento:** El Orquestador evalúa las reglas condicionales definidas en LangGraph. Analiza el contexto para decidir si hay una urgencia, un cambio de entorno o si responde él mismo.
*   **Output:** Una decisión de enrutamiento (ej. `Route -> Node_Emergencia` o `Route -> Node_Movilidad`).

### Paso 4: Nodos Sub-Agentes (Procesamiento Especializado)
*   **Trigger:** Invocación directa desde el Nodo Orquestador a través de los *edges* condicionales de LangGraph.
*   **Input:** El State actual de LangGraph (Markdown + Contexto + Tarea delegada).
*   **Procesamiento:** El sub-agente específico (ej. Navegador de Pasillos) usa su System Prompt especializado para generar la respuesta o las acciones necesarias basándose estrictamente en los datos recibidos.
*   **Output:** Texto en lenguaje natural (ej. "Hay un escalón frente a ti").

### Paso 5: Entrega y Reproducción (Streaming al Hardware)
*   **Trigger:** El Sub-agente o el Orquestador finaliza la generación del token de respuesta.
*   **Input:** Texto generado por el LLM.
*   **Procesamiento:** El backend envía el texto de regreso a las Meta Ray-Ban a través del mismo WebSocket abierto. Se recomienda usar *Server-Sent Events* (SSE) o envío de tokens en tiempo real para que el TTS del dispositivo comience a hablar antes de que termine toda la frase.
*   **Output:** Síntesis de voz (Text-to-Speech local) en el dispositivo del usuario.

---

## 4. Resumen de Tecnologías y Roles
1. **Infraestructura de Red:** WebSockets / gRPC (Conexión persistente, adiós a la latencia HTTP/S3).
2. **Motor de Estado y Flujo:** LangGraph (Mantiene el historial en RAM y ejecuta la gráfica de decisión del Orquestador).
3. **Capa de LLM:** LangChain (Gestión de los prompts `.md` que creamos y llamadas a la API de OpenAI/Anthropic/Gemini).
4. **Almacenamiento (Background):** S3/Blob Storage (Archivos crudos) y MongoDB/DynamoDB (Logs y RAG). Todo ejecutado fuera del *Main Thread*.
