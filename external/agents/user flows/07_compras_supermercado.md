# Flujo de Usuario 7: Asistencia en Compras (Supermercado)

Este flujo aborda uno de los entornos cognitivamente más demandantes: un supermercado. Utiliza un sub-orquestador (Shopper Orchestrator) apoyado por agentes de navegación de pasillos, inspección de productos y gestión de listas. Todo bajo la estricta directriz de **Cero Invenciones** y **Autonomía del Usuario** (proponer, no imponer).

---

### 1. Transición de Llegada y Verificación de Lista
*   **Contexto (Input):** El agente de Movilidad (`02_movilidad.md`) confirma la llegada a las puertas del supermercado y transfiere el control al *Shopper Orchestrator*.
*   **Acción del Gestor de Lista:** Revisa en background si existe una lista activa para la ubicación.
*   **Acción del Agente (Voz al usuario):** *"Hemos llegado a la entrada del supermercado. No detecto una lista de compras activa en tu memoria. ¿Qué te gustaría que compremos hoy?"*
*   *(El usuario dicta los artículos: "Leche, huevos, y pan").*

### 2. Propuesta de Ruta (Sin Imposiciones)
*   **Contexto (Input):** La lista está registrada. El modelo de visión detecta el panorama inicial (ej. cajas registradoras, pasillo 1 y 2, zona de frutas).
*   **Estándar de Accesibilidad:** El agente *propone* un plan lógico basado en la agrupación de los productos, pero pide el consentimiento del usuario para mantener la directriz de autonomía.
*   **Acción del Agente (Voz):** *"Tengo tu lista con tres artículos. Basado en lo que visualizo frente a nosotros, la zona de panadería está hacia tu derecha. Te propongo empezar por ahí y luego buscar los lácteos, ¿te parece bien el plan o prefieres ir a otro lado primero?"*

### 3. Navegación Dinámica de Pasillos (Cero Alucinaciones)
*   **Contexto (Input):** El usuario acepta ir a lácteos, pero el pasillo de lácteos aún no es visible para la cámara.
*   **Estándar de Accesibilidad:** El *Navegador de Pasillos* no inventa la ruta si no la ve. Se adapta sobre la marcha y guía de forma exploratoria.
*   **Acción del Agente (Voz):** *"Aún no tengo visión directa del pasillo de lácteos. Por ahora, el camino principal frente a ti está despejado y el pasillo 1 y 2 están a tu izquierda. Te sugiero caminar recto hasta que tengamos visual de los refrigeradores."*

### 4. Inspección Activa de Productos (Sin acceso al hardware, guiando al usuario)
*   **Contexto (Input):** El usuario llega a los refrigeradores y toma un cartón. El archivo Markdown de visión entrega datos parciales: `[Visión: Cartón de leche, marca ilegible, lado de información nutricional]`.
*   **Estándar de Accesibilidad:** Como el agente no controla el hardware, debe interactuar con el usuario para que este manipule el producto y así el modelo de visión obtenga mejores datos (precio, marca, caducidad).
*   **Acción del Agente (Voz):** *"Veo que sostienes un cartón de leche, pero la cámara está enfocando la tabla nutricional. ¿Podrías girarlo lentamente hacia tu derecha para poder leer la marca y la fecha de caducidad?"*
*   **Contexto Actualizado:** `[Visión: Marca X, Caducidad 25 de Agosto]`.
*   **Acción del Agente (Voz):** *"Es leche entera marca X. Su fecha de caducidad es el 25 de agosto."*

### 5. Gestión del Carrito y Finalización
*   **Contexto (Input):** El usuario guarda el producto en su carrito/cesta.
*   **Acción del Agente (Voz):** *"He marcado la leche en tu lista. Solo nos faltan los huevos y el pan. El pasillo a tu espalda parece llevar a abarrotes, ¿quieres que nos demos la vuelta?"*
