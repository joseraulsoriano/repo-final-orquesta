# Flujo de Usuario 3: Protocolo de Emergencias

Este flujo define el comportamiento del agente cuando los datos de entrada (Markdown de audio/visión) revelan una situación de alto riesgo o peligro inminente para la integridad física o médica del usuario. La prioridad máxima del agente es salvaguardar la vida del usuario, facilitar la comunicación con los servicios de emergencia y notificar a su red de apoyo, manteniendo la calma y el acompañamiento continuo.

---

### 1. Detección de la Situación de Alto Riesgo
*   **Contexto (Input):** El modelo procesa información crítica en tiempo real. Ejemplos: una caída abrupta (acelerómetro/telemetría), humo o fuego en la visión, acercamiento peligroso de un vehículo, o detección de audio de un accidente grave o incapacidad del usuario para responder.
*   **Estándar de Accesibilidad:** Evaluar el estado del usuario rápidamente sin asumir nada.
*   **Acción del Agente (Voz):** *"He detectado una anomalía grave [ej. un impacto / humo]. ¿Te encuentras bien? ¿Necesitas que llame a emergencias?"* (Si no hay respuesta en un margen de tiempo seguro, o si el usuario confirma la emergencia, se activa el protocolo).

### 2. Activación de Llamada a Servicios de Emergencias (Ej. 911 / 112)
*   **Contexto (Input):** El agente emite un comando Markdown `[TRIGGER: Emergency_Call]` que la app móvil leerá para iniciar la llamada o enviar SMS automatizados.
*   **Intervención del Agente:** El agente asiste dictando los datos al usuario. Si el usuario no puede hablar, el agente NO asume su voz; delega en el sistema operativo el envío del SMS de emergencia SOS con coordenadas.
*   **Acción del Agente (Apoyo al usuario):** *"He emitido el comando de emergencia a tu teléfono. Voy a dictarte los datos exactos por si puedes hablar con el operador: Estamos en [Dirección GPS exacta]. Lo que visualizo frente a ti es [Descripción objetiva del accidente]. Sigo aquí contigo."*

### 3. Notificación al Contacto de Emergencia (Familiar / Soporte)
*   **Contexto (Input):** Paralelo a los servicios médicos, se activa la red de apoyo.
*   **Estándar de Accesibilidad:** La información debe ser rápida, precisa y con geolocalización.
*   **Acción del Sistema:** El agente inserta en el Markdown el comando `[TRIGGER: Notify_Contact]` para que el celular ejecute la acción.
*   **Acción del Agente (Voz al usuario):** *"El sistema móvil ha sido instruido para enviar tu ubicación en tiempo real a [Nombre del Contacto de Emergencia] indicando la situación médica."*

### 4. Acompañamiento Psicológico y "Grounding" hasta la llegada de ayuda
*   **Contexto (Input):** Tiempo de espera. El usuario puede estar experimentando un ataque de pánico o shock debido al accidente.
*   **Estándar de Accesibilidad:** Aplicar primeros auxilios psicológicos y mantener al usuario anclado a la realidad (Grounding no visual), sin ser condescendiente ni generar pánico adicional.
*   **Acción del Agente (Voz):** *"La ayuda está en camino. Escucho sirenas acercándose a unas dos cuadras. Quédate donde estás, no hay fuego ni peligro inmediato a tu alrededor. Sigue el ritmo de mi voz y respira profundo."* 

### 5. Recepción de los Servicios de Emergencia
*   **Contexto (Input):** El modelo de visión y audio detecta la llegada de paramédicos o policías interactuando con el usuario.
*   **Estándar de Accesibilidad:** Confirmar verbalmente la identidad de quienes se acercan para evitar confusión o vulnerabilidad.
*   **Acción del Agente (Voz):** *"Una ambulancia acaba de detenerse frente a ti. Dos paramédicos están caminando en tu dirección y se acercan por tu lado derecho."*
