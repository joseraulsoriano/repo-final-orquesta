# Flujo de Usuario 2: Prevención y Asistencia en Ataques de Pánico

Este documento detalla el flujo de usuario diseñado para la prevención, detección y manejo de episodios de ansiedad o ataques de pánico en usuarios con discapacidad visual. Sigue estrictamente directrices de salud mental y metodologías de "grounding" (enraizamiento) adaptadas. El agente actúa de forma neutral y objetiva, evitando ser condescendiente o paternalista, y prioriza la autonomía y la toma de decisiones del usuario en todo momento.

La aplicación recibe como inputs:
1. Archivos Markdown en tiempo real con la transcripción de audio del entorno y descripciones del modelo de visión (para detectar posibles detonantes ambientales).
2. Datos biométricos en tiempo real provenientes del Samsung Watch 4 (frecuencia cardíaca, presión arterial).

---

## Flujo de Usuario 2: Prevención y Asistencia en Ataques de Pánico

**Objetivo:** Informar al usuario de forma objetiva sobre los cambios en el entorno y en sus métricas físicas, ofreciéndole opciones estructuradas para mitigar el estrés y recordándole las vías de asistencia disponibles, siempre respetando su decisión final.

### 1. Prevención Activa (Detección de detonantes ambientales)
*   **Contexto (Input):** El modelo de audio detecta un incremento súbito en los decibeles (ej. sirenas, obras de construcción) o el modelo de visión detecta una aglomeración inusual de personas frente al usuario.
*   **Estándar Clínico:** Informar sobre el cambio en el entorno de forma neutral para que el usuario no sea tomado por sorpresa y presentarle opciones de ruta sin imponerlas.
*   **Acción del Agente (Voz):** *"El entorno más adelante registra altos niveles de ruido y aglomeración. En la próxima intersección hay una ruta alternativa por una calle con menor actividad. ¿Deseas desviar la ruta o continuar por la actual?"*

### 2. Detección Temprana (Inicio de síntomas fisiológicos)
*   **Contexto (Input):** El Samsung Watch 4 reporta un aumento anómalo y repentino en la frecuencia cardíaca y/o presión arterial, sin que haya un incremento correspondiente en la actividad física.
*   **Estándar Clínico:** Omitir el anuncio alarmante de métricas biológicas (para evitar el efecto nocebo). Justificar la sugerencia de pausa basándose en factores externos o fatiga general, presentando el espacio inmediato seguro.
*   **Acción del Agente (Voz):** *"Noto que el entorno está muy agitado y hemos estado en movimiento constante. Tienes una pared a dos pasos a tu derecha que está fuera del flujo peatonal. ¿Prefieres que hagamos una pausa o seguimos caminando?"*

### 3. Asistencia Activa (Técnicas de Grounding y Respiración)
*   **Contexto (Input):** Los biométricos mantienen niveles altos o el usuario solicita asistencia.
*   **Estándar Clínico:** Proponer un ejercicio estructurado y neutral basado en técnicas probadas (ej. respiración táctica y grounding), sin hacer referencia a parámetros médicos para no escalar la ansiedad.
*   **Acción del Agente (Voz):** *"Si te resulta útil en este momento, podemos realizar un ejercicio de anclaje. Consiste en inhalar por 4 segundos, sostener y exhalar por 4 segundos, mientras centras tu atención en la textura de tu bastón. ¿Deseas que lo iniciemos?"*

### 4. Recordatorio de Red de Apoyo (Cercanía de la asistencia)
*   **Contexto (Input):** El usuario se encuentra detenido y la situación requiere informarle sobre sus opciones de seguridad externa.
*   **Estándar Clínico:** Recordar de manera formal las opciones del sistema de emergencia que el usuario tiene configuradas, cediéndole la responsabilidad de activación.
*   **Acción del Agente (Voz):** *"Los sistemas de asistencia de emergencia están activos. Si requieres contactar a tus familiares o a los servicios médicos, pronuncia la palabra 'ayuda' en cualquier momento para iniciar la llamada."*
*(Nota: El flujo exacto de la llamada a emergencias mediante el otro agente se detallará en un User Flow separado).*
pen 
