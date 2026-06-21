# Flujo de Usuario 1: Navegación Asistida y Cruce de Intersecciones

Este documento detalla los flujos de usuario (User Flows) basados en las directrices de accesibilidad de instituciones especializadas (como la American Foundation for the Blind y la European Blind Union) para actuar como un "Guía Vidente" (Sighted Guide) virtual.

La aplicación recibe como inputs:
1. Datos de API de Google Maps (Ruta, ubicación GPS).
2. Archivos Markdown en tiempo real con telemetría, transcripción de audio del entorno y descripciones del modelo de visión (ej. color del semáforo).

---

## Flujo de Usuario 1: Navegación Asistida y Cruce de Intersecciones

**Objetivo:** Guiar al usuario de manera segura desde un punto de origen hasta su destino, enfocándose en el cruce seguro de calles mediante la identificación de semáforos, utilizando lenguaje estandarizado de guía vidente.

### 1. Inicio de la Ruta (Onboarding del trayecto)
*   **Contexto (Input):** El usuario sale de casa e inicia la ruta. Google Maps calcula la trayectoria.
*   **Estándar de Accesibilidad:** Presentar la situación y establecer expectativas claras antes de moverse.
*   **Acción del Agente (Voz):** *"Ruta confirmada hacia [Destino]. El trayecto tomará aproximadamente 15 minutos. El camino frente a ti es mayormente plano y está despejado."*

### 2. Navegación Activa (Aproximación a la esquina)
*   **Contexto (Input):** El archivo Markdown/GPS indica que el usuario está a 5-10 metros de una intersección.
*   **Estándar de Accesibilidad:** Avisar con antelación sobre cambios de nivel (curbs/bordillos) usando referencias de distancia claras (pasos), evitando aproximaciones ambiguas como "ahí adelante".
*   **Acción del Agente (Voz):** *"Nos acercamos a una esquina en aproximadamente 10 pasos. Prepárate para detenerte y sentir el cambio de nivel hacia abajo."*

### 3. Llegada al Bordillo y Lectura del Semáforo
*   **Contexto (Input):** El usuario se detiene. El modelo de visión detecta el semáforo y reporta en el Markdown: `[Semáforo: Rojo para peatones / Tráfico fluyendo]`.
*   **Estándar de Accesibilidad:** Nunca dar la instrucción de "espera" sin contexto. El agente debe describir el *porqué* y mantener al usuario anclado a la realidad del entorno para reducir la ansiedad y evitar confusiones acústicas.
*   **Acción del Agente (Voz):** *"Estamos en la orilla de la acera. El semáforo peatonal está en rojo. Escucho tráfico cruzando frente a ti."*

### 4. Cambio de Semáforo (Preparación para el cruce)
*   **Contexto (Input):** El archivo Markdown se actualiza: `[Semáforo: Verde para peatones / Autos detenidos]`.
*   **Estándar de Accesibilidad:** Confirmar seguridad doblemente. No basta con el color verde; el guía debe confirmar visualmente que el tráfico transversal se detuvo antes de instruir avanzar.
*   **Acción del Agente (Voz):** *"El semáforo ha cambiado a verde y el tráfico se ha detenido. El cruce es recto y no hay obstáculos detectados frente a ti."*

### 5. Durante y al Finalizar el Cruce
*   **Contexto (Input):** Los sensores y la cámara indican que el usuario está a punto de llegar a la acera opuesta.
*   **Estándar de Accesibilidad:** Prevenir tropiezos al final del cruce y confirmar que se ha llegado a la zona segura.
*   **Acción del Agente (Voz):** *"Estamos a 3 pasos de terminar el cruce. Frente a ti está el escalón de la acera... Bien hecho, la banqueta sigue despejada de frente."*
