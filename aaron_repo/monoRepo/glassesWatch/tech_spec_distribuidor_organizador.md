# Tech Spec: Integración Agente Distribuidor <—> Agente Organizador (LangGraph)

### Propósito
Comunicación 100% en memoria (RAM) entre el traductor del mundo real (Agente Distribuidor) y el cerebro que decide quién debe actuar (Agente Organizador). Esta conexión sucede dentro de la gráfica de **LangGraph**.

### Flujo Técnico (Paso a Paso)
1. **Actualización del Estado (LangGraph State):**
   *   En cuanto el Agente Distribuidor genera el string de Markdown, no hace un HTTP request. Simplemente inyecta el string en el objeto `State` (el diccionario de memoria que LangGraph comparte entre todos sus nodos).
   *   El hilo de ejecución pasa inmediatamente por el *edge* (arista) que conecta el nodo del Distribuidor con el nodo del Organizador.

2. **Evaluación del Agente Organizador (Sighted Guide Orchestrator):**
   *   **Input:** El Organizador despierta y lee el `State` más reciente (que contiene el Markdown fresquito y el historial de los últimos 5 mensajes).
   *   **Procesamiento:** Usa el System Prompt de `01_orquestador.md`. Evalúa las prioridades condicionales (*Conditional Edges* en LangChain):
       *   *¿Contiene la palabra "Ayuda" o caída?* -> Retorna el comando para invocar al Agente de Triage.
       *   *¿Estamos en un supermercado?* -> Retorna el comando para invocar al Shopper Swarm.
       *   *¿Es navegación estándar?* -> Retorna el comando para invocar al Agente de Movilidad.

3. **Routing Interno:**
   *   LangGraph ejecuta un `ConditionalRouter` basado en el string que devolvió el Organizador.
   *   El Organizador no espera la respuesta del sub-agente. Suelta el control, y LangGraph mueve el `State` al nodo especializado correspondiente (ej. Movilidad).

4. **El Regreso (El Camino Inverso al Hardware):**
   *   Cuando el sub-agente especializado termina su deducción (ej. "El semáforo está rojo, espera"), este texto se coloca en el `State`.
   *   El backend envía este texto inmediatamente de regreso por la conexión WebSocket hacia la App iOS.
   *   La App iOS recibe el texto, usa síntesis de voz (Text-to-Speech nativo de Apple o un TTS API) y manda el audio por el perfil **A2DP** directo a las bocinas de las gafas Meta Ray-Ban.
