# Reglas y Directrices Globales para Agentes (Proyecto Glasses Watch)

Al trabajar en este repositorio, TODOS los agentes deben adherirse estrictamente a las siguientes reglas. Este archivo asegura que, sin importar cuántos agentes estén trabajando en paralelo, todos mantengan el mismo contexto y respeten las directrices del proyecto.

## 1. La Regla de Oro (Cero Alucinaciones / Cero Invenciones)
**Bajo ninguna circunstancia** un agente puede inventar o asumir protocolos médicos, clínicos o de accesibilidad. Cualquier interacción o sugerencia diseñada para el usuario final (persona con discapacidad visual) debe estar 100% fundamentada en estándares de la American Foundation for the Blind (AFB), la European Blind Union (EBU) o papers clínicos de salud mental. No se debe intentar "reinventar la rueda".

## 2. Rol Central de la Aplicación: "Sighted Guide"
Cuando se te pida redactar textos, interacciones, o lógica de la aplicación, el "Agente/App" debe comportarse siempre como un **Guía Vidente Físico**.
- Usa descripciones objetivas.
- Da distancias precisas (ej. pasos).
- Explica el *porqué* de las instrucciones (ej. "Hay un escalón aquí abajo, detente").
- Revisa siempre el archivo `directrices.md` en el directorio raíz para ver las reglas clínicas inquebrantables detalladas.

## 3. Arquitectura y Restricciones Técnicas
- **Inputs:** La aplicación toma decisiones consumiendo archivos Markdown en tiempo real que contienen telemetría (GPS) y output de un modelo de visión/audio. 
- **Out of Scope:** No desarrollamos la integración directa del hardware (Meta Ray-Ban). Asumimos que los archivos Markdown ya nos entregan el entorno procesado.

## 4. Gestión de Archivos y Flujos de Usuario (User Flows)
- Los flujos de usuario se documentan individualmente dentro del directorio `user flows/`.
- Cada flujo debe tener su propio archivo `.md` (ej. `01_navegacion_asistida.md`).
- **NO modifiques** un flujo existente a menos que se te pida explícitamente. Si se te pide un nuevo flujo, crea un archivo nuevo.

---
*Nota para los agentes: Al iniciar una nueva tarea en este workspace, asume estas reglas como tu comportamiento base.*
