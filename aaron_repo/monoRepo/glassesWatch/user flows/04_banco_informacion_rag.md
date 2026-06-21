# Flujo de Usuario 3: Interacción con el Banco de Información RAG (Contexto Personalizado)

Este documento detalla cómo el sistema utiliza una arquitectura RAG (Retrieval-Augmented Generation) como un "banco de memoria" offline o local sobre el usuario. Esto asegura que la asistencia sea inmediata, altamente personalizada y no dependa de búsquedas externas en tiempo real para datos críticos o de contexto personal.

El sistema RAG almacena:
- Lugares frecuentes que el usuario visita.
- Personas conocidas (familia, amigos, cuidadores).
- Historial de interacciones previas.
- Contactos de emergencia preconfigurados.
- Banco de técnicas de asistencia clínica (ya probadas y aprobadas por el usuario y los estándares).

---

## Flujos de Uso del RAG

**Objetivo:** Agilizar las respuestas del agente, brindar familiaridad en la comunicación (siendo siempre neutrales pero precisos en los datos) y asegurar el acceso instantáneo a protocolos médicos y contactos clave.

### 1. Identificación de Personas Conocidas
*   **Contexto (Input):** El modelo de visión detecta un rostro humano y el sistema hace un emparejamiento con la base de datos RAG.
*   **Proceso RAG:** El sistema extrae el nombre, relación y notas de la última interacción.
*   **Acción del Agente (Voz):** *"El sistema reconoce a [Nombre de la persona, ej. 'tu hermana María'] acercándose frente a ti a unos 5 pasos."*

### 2. Navegación hacia Lugares Frecuentes
*   **Contexto (Input):** El usuario solicita ir a un lugar común (ej. "Llevame a la cafetería de siempre").
*   **Proceso RAG:** El agente consulta la ubicación exacta guardada, las preferencias de ruta habituales y los obstáculos conocidos reportados en viajes anteriores.
*   **Acción del Agente (Voz):** *"Ruta trazada hacia [Nombre del lugar]. Aplicaremos la misma ruta por la avenida principal que usamos el martes pasado. ¿Iniciamos el trayecto?"*

### 3. Técnicas de Asistencia Personalizadas (Acceso Inmediato)
*   **Contexto (Input):** El usuario requiere asistencia para un ataque de ansiedad (como se describe en el Flujo 2).
*   **Proceso RAG:** En lugar de buscar técnicas en tiempo real, el sistema recupera instantáneamente las técnicas de respiración o grounding que mejor le han funcionado al usuario en el pasado, garantizando rapidez y efectividad clínica.
*   **Acción del Agente (Voz):** *"El registro indica un aumento en el ritmo cardíaco. La última vez fue útil el ejercicio de respiración en 4 tiempos. ¿Deseas iniciar este ejercicio ahora?"*

### 4. Activación de Contactos de Emergencia
*   **Contexto (Input):** El usuario pronuncia la palabra de seguridad (ej. "Ayuda") o se detecta una caída grave.
*   **Proceso RAG:** El sistema recupera la jerarquía de contactos de emergencia e inserta en el Markdown el trigger de acción correspondiente para la capa de hardware móvil.
*   **Acción del Agente (Voz):** *"Iniciando protocolo de ayuda. He emitido la orden al sistema para alertar a [Nombre del Contacto] y compartir tu ubicación actual."*
