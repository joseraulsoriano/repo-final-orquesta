# Flujo de Usuario 3: Uso de Computadora Manos Libres mediante Agentes (Open Claw / Hermes)

Este documento detalla el flujo de usuario (User Flow) para asistir a una persona con discapacidad visual en el uso de su computadora. Dado que los lectores de pantalla tradicionales y las tecnologías asistivas actuales pueden resultar complejos y burdos, este enfoque utiliza agentes de uso de computadora (Computer Use Agents) como Open Claw o Hermes.

La aplicación de las gafas sirve como puente o "Guía Vidente Virtual" que se comunica de forma transparente con el agente que controla la computadora.

La aplicación recibe como inputs y gestiona:
1. Comandos de voz del usuario captados por los micrófonos de las gafas.
2. Archivos Markdown en tiempo real con la transcripción de las acciones, estado de la interfaz gráfica y lecturas que el agente (Open Claw/Hermes) está realizando en la pantalla del usuario.

---

## Flujo de Usuario 3: Interacción y Gestión de Correos Electrónicos

**Objetivo:** Permitir al usuario leer, responder, archivar y gestionar correos electrónicos, así como agendar reuniones, sin necesidad de usar sus manos ni lidiar con la verbosidad de un lector de pantalla tradicional. Se mantiene en todo momento la autonomía, brindando descripciones claras y objetivas de lo que ocurre en el entorno digital.

### 1. Inicialización y Conexión con el Agente de Escritorio
*   **Contexto (Input):** El usuario se sienta frente a su computadora y da la instrucción por voz a sus gafas: *"Lee mis correos nuevos"*.
*   **Estándar de Accesibilidad:** Confirmar la recepción del comando y establecer claramente con qué sistema se está interactuando para evitar incertidumbre técnica y ansiedad.
*   **Acción del Agente (Voz):** *"Conectando con tu computadora. Dame un momento mientras reviso tu bandeja de entrada."*

### 2. Resumen y Lectura de Bandeja de Entrada
*   **Contexto (Input):** El agente de la computadora navega al cliente de correo, lee la pantalla, y actualiza el Markdown: `[Bandeja: 3 correos nuevos. 1. Equipo de Diseño (Asunto: Revisión). 2. Recursos Humanos. 3. Promoción.]`
*   **Estándar de Accesibilidad:** Agrupar y resumir la información objetivamente. No saturar cognitivamente leyendo código, barras de menú o elementos gráficos innecesarios (que es el problema de los lectores de pantalla). Proveer opciones claras basadas en las directrices de la AFB.
*   **Acción del Agente (Voz):** *"Tienes 3 correos nuevos. El primero es del Equipo de Diseño sobre una revisión, el segundo es de Recursos Humanos, y el tercero parece ser una promoción. ¿Quieres que lea el primero?"*

### 3. Lectura de Contenido Específico
*   **Contexto (Input):** El usuario responde *"Sí, lee el del equipo de diseño"*. El agente de computadora hace clic para abrir el correo y envía el texto al Markdown.
*   **Estándar de Accesibilidad:** Leer el contenido de manera pausada y clara. Indicar de manera objetiva si hay elementos adicionales como archivos adjuntos.
*   **Acción del Agente (Voz):** *"Abriendo el correo. El Equipo de Diseño dice: 'Hola, necesitamos revisar los últimos flujos mañana por la mañana. Saludos'. Nota adicional: Hay un archivo PDF adjunto. ¿Qué te gustaría hacer? Puedes responder, archivar o agendar la reunión."*

### 4. Ejecución de Tareas Complejas (Agendar Reunión)
*   **Contexto (Input):** El usuario instruye *"Agenda una reunión con ellos para mañana a las 10 AM y responde que ahí estaremos"*. El agente procesa la intención.
*   **Estándar de Accesibilidad:** Confirmar la acción compleja que se va a realizar en nombre del usuario antes de enviarla. La persona siempre debe tener la última palabra sobre sus comunicaciones (principio de autonomía y dignidad).
*   **Acción del Agente (Voz):** *"Entendido. Le indicaré a la computadora que redacte una respuesta y envíe una invitación de calendario para mañana a las 10 de la mañana. El mensaje dirá que ahí estaremos. ¿Confirmo el envío?"*

### 5. Confirmación y Finalización de Tarea
*   **Contexto (Input):** El usuario dice *"Sí, envíalo"*. El agente de computadora realiza las acciones pertinentes (redactar, enviar, agendar) y actualiza el Markdown con `[Acción completada: Correo enviado y evento en calendario]`.
*   **Estándar de Accesibilidad:** Cerrar el ciclo informando al usuario del éxito de la tarea, lo que funciona como un anclaje (*grounding*) de que el proceso ha terminado, evitando que se quede con dudas.
*   **Acción del Agente (Voz):** *"Listo. El correo ha sido enviado y la reunión está agendada en tu calendario para mañana a las 10 AM. Seguimos en tu bandeja de entrada. ¿Quieres escuchar el siguiente correo de Recursos Humanos?"*

---

### Consideraciones Clínicas y Técnicas (Regla de Oro)
*   **Autonomía total:** El agente nunca debe decidir de forma proactiva u oculta qué correos son importantes o borrarlos por su cuenta. Siempre debe describir las opciones objetivamente.
*   **Prevención de Fatiga Cognitiva:** Al delegar la interacción de la interfaz gráfica a agentes como Open Claw/Hermes y solo entregar la información digerida verbalmente, se elimina por completo la fatiga mental extrema que sufren las personas con discapacidad visual al intentar navegar por interfaces que no fueron diseñadas para ellos.
