# Flujo de Usuario 2: Reconocimiento de Entorno (Lugares Nuevos y Cambios)

Este flujo aborda la orientación espacial cuando el usuario llega a un lugar por primera vez, y la re-orientación cuando el usuario se encuentra en un entorno conocido pero algún elemento ha cambiado de lugar. Ambos casos se rigen por el principio de trato digno y no condescendiente: se otorga información objetiva para que el usuario, siendo 100% capaz, tome sus propias decisiones.

---

## Caso A: Llegada a un Lugar Nuevo (Onboarding Espacial)

**Objetivo:** Brindar un reconocimiento básico de orientación mediante la descripción de la geometría del lugar y la ubicación de puntos de interés (landmarks) para que el usuario se sienta seguro y pueda mapear mentalmente el espacio.

### 1. Panorama General (Macro-descripción)
*   **Contexto (Input):** El GPS marca la llegada al destino (ej. un café, la sala de espera de un hospital, una oficina). El modelo de visión captura el panorama del interior.
*   **Estándar de Accesibilidad:** Dar una idea de las proporciones del lugar y la iluminación/ambiente general antes de ir a los detalles, usando el sistema de reloj o direcciones relativas claras.
*   **Acción del Agente (Voz):** *"Hemos entrado a la recepción. Es un espacio mediano, rectangular. Escucho algo de eco y a un par de personas hablando hacia tu izquierda."*

### 2. Identificación de Puntos de Anclaje (Landmarks)
*   **Contexto (Input):** La IA visualiza elementos clave como el mostrador principal, la zona de asientos y las puertas.
*   **Estándar de Accesibilidad:** Describir los objetos más importantes usando distancias (pasos) y posición (posiciones de reloj). No abrumar con cada pequeño detalle, solo los necesarios para la navegación.
*   **Acción del Agente (Voz):** *"A tus 12 en punto, a unos 10 pasos, está el mostrador principal. A tus 3 en punto, a unos 5 pasos, hay una hilera de sillas vacías."*

### 3. Autonomía del Usuario (Espera de instrucción)
*   **Contexto (Input):** El usuario asimila la información.
*   **Estándar de Accesibilidad:** Evitar la actitud paternalista de decirle qué hacer (ej. "Ve a sentarte"). Dejar que el usuario decida con la información brindada.
*   **Acción del Agente (Voz):** *"¿Hacia dónde te gustaría que nos dirijamos?"*

---

## Caso B: Cambios en un Entorno Conocido

**Objetivo:** Advertir al usuario sobre modificaciones en un espacio que ya tiene mapeado en su memoria (ej. su propia casa, su oficina) para prevenir accidentes y evitar la desorientación.

### 1. Detección de la Anomalía / Cambio
*   **Contexto (Input):** El usuario entra a un entorno recurrente. El modelo de visión detecta un obstáculo inesperado o que un objeto grande cambió de sitio (ej. movieron el sofá, hay una caja en el pasillo).
*   **Estándar de Accesibilidad:** Advertir inmediatamente de manera objetiva sin alarmar en exceso, indicando exactamente qué es y dónde está ahora.
*   **Acción del Agente (Voz):** *"Atención, hay un cambio en el pasillo. Alguien dejó una caja grande en el suelo, justo en medio, a unos 3 pasos frente a ti."*

### 2. Re-orientación Espacial
*   **Contexto (Input):** Un mueble grande ha sido reubicado permanentemente (ej. el sillón de la sala).
*   **Estándar de Accesibilidad:** Ayudar a "reconstruir" el mapa mental del usuario.
*   **Acción del Agente (Voz):** *"Noto que movieron el sillón de dos plazas. Ya no está en el centro de la sala; ahora está pegado a la pared de tu lado izquierdo, cerca de la ventana."*

### 3. Asistencia en caso de confusión
*   **Contexto (Input):** El usuario podría desorientarse brevemente por el cambio.
*   **Estándar de Accesibilidad:** Ofrecer ayuda con respeto.
*   **Acción del Agente (Voz):** *"El camino por la derecha está completamente despejado. Si lo deseas, puedo guiarte paso a paso hasta rodearlo."*
