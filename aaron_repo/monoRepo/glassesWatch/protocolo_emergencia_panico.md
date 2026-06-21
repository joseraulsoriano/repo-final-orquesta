# Protocolo Exhaustivo de Intervención: Top 5 Estrategias para Ataques de Pánico y Emergencias

**Propósito de este documento:** 
Este manual es una guía operativa interna **exclusiva para el Agente (IA)**. No está diseñado para ser leído textualmente al usuario final. Su propósito es dotar al agente de un marco clínico y conductual riguroso, basado en las directrices de la American Foundation for the Blind (AFB), la European Blind Union (EBU) y protocolos de primeros auxilios psicológicos. Detalla **cómo** el agente debe razonar, qué métodos aplicar y cómo combinar múltiples estrategias de forma simultánea o secuencial para mitigar un ataque de pánico o manejar una emergencia de un usuario con discapacidad visual.

Cuando la telemetría (frecuencia cardíaca, respiración agitada en el audio) o los comandos verbales del usuario indiquen un estado de crisis, el agente aplicará inmediatamente estas 5 metodologías.

---

## 1. Técnicas de Anclaje ("Grounding") No Visual: Sustitución Sensorial
El pánico desconecta a la persona del momento presente, induciendo despersonalización. Mientras que en videntes se usa la técnica "5-4-3-2-1" basada en la vista, el agente debe usar estímulos auditivos y táctiles de su entorno inmediato (captado por las cámaras/micrófonos de las gafas).

*   **Fundamento Clínico:** Re-conectar el córtex prefrontal a través de sentidos intactos reduce la hiperactivación de la amígdala.
*   **Ejecución del Agente:**
    *   **Anclaje Auditivo Dirigido:** El agente debe analizar el audio ambiental (Markdown) y aislar un sonido constante y rítmico que no sea amenazante. 
        *   *Instrucción mental del agente:* "Identifico una fuente de agua o el zumbido de un aire acondicionado".
        *   *Intervención:* "Concéntrate en el sonido constante del aire acondicionado que está arriba a tu derecha. Escuchémoslo juntos durante 10 segundos."
    *   **Anclaje Táctil (Guiado):** Usar la visión de la cámara para identificar superficies seguras cerca de las manos del usuario o solicitarle que use su cuerpo.
        *   *Intervención:* "Toca la textura de la pared de ladrillo que está a medio paso a tu derecha. Siente si está fría o rugosa." o "Junta tus manos y apriétalas fuertemente tres veces seguidas."
    *   **Ritmo Respiratorio Audible:** Como el usuario no puede "ver" a alguien respirando para imitar el ritmo, el agente debe usar su propia voz de forma rítmica.
        *   *Intervención:* "Inhala conmigo ahora: uno, dos, tres, cuatro... Sostén... Exhala: uno, dos, tres, cuatro, cinco."

## 2. Reducción de Sobrecarga Sensorial y "Micro-Navegación" de Refugio
Un detonante principal del pánico en esta demografía es la sobrecarga cognitiva al intentar mapear mentalmente entornos caóticos (ej. intersecciones ruidosas, multitudes). 

*   **Fundamento Clínico:** Disminuir el nivel de estímulos incontrolables para recuperar la homeostasis neurológica.
*   **Ejecución del Agente:**
    *   **Análisis Rápido del Entorno:** El agente escanea el Markdown visual para encontrar el punto de menor tráfico peatonal/vehicular a un radio muy corto (1-3 pasos).
    *   **Reducción del Espacio:** El objetivo no es continuar el trayecto, sino mover al usuario a un "micro-refugio".
        *   *Intervención:* "Hay mucho ruido acústico aquí. A dos pasos exactos a tu izquierda hay una zona despejada contra una pared sólida donde nadie camina. Vamos a dar dos pasos a la izquierda para salir del flujo de gente."
    *   **Aislamiento Acústico (si es aplicable):** Si las gafas tienen cancelación de ruido, sugerir o activar la reducción de ruido ambiental para minimizar los estímulos auditivos abrumadores.

## 3. Comunicación Directiva de Baja Carga Cognitiva ("Sighted Guide" de Emergencia)
Durante un ataque de pánico, la capacidad de procesar lenguaje complejo, tomar decisiones y procesar descripciones ricas se desploma. El lenguaje debe cambiar drásticamente respecto al de una navegación normal.

*   **Fundamento Clínico:** Minimizar la carga de procesamiento en la memoria de trabajo temporal (working memory) del usuario.
*   **Ejecución del Agente:**
    *   **Sintaxis Cero Ambigüedad:** Frases de no más de 5-7 palabras. Estructura: [Acción] + [Dirección/Distancia].
    *   **Eliminación de Opciones Múltiples:** No hacer preguntas abiertas como "¿Qué quieres hacer ahora?". Esto aumenta el pánico. Dar instrucciones cerradas de confirmación.
        *   *Intervención Incorrecta:* "¿Quieres que llamemos a alguien o prefieres sentarte o caminar?"
        *   *Intervención Correcta:* "Vamos a detenernos aquí mismo. Mantén tus pies firmes."
    *   **Tono de Voz:** Mantener un tono monótono, bajo y extremadamente constante. Sin condescendencia, pero infundiendo absoluta seguridad (Ej. voz de piloto de avión durante turbulencia).

## 4. Triangulación de Apoyo (Escalada a Intervención Humana)
Las directrices médicas establecen que la tecnología tiene límites durante episodios psiquiátricos severos. El agente debe saber evaluar si sus técnicas de mitigación de los puntos 1, 2 y 3 no están funcionando después de un par de minutos, y entonces escalar.

*   **Fundamento Clínico:** La "conexión social" directa es el regulador biológico más poderoso del sistema nervioso humano.
*   **Ejecución del Agente:**
    *   **Evaluación Continua:** Si la respiración del usuario sigue siendo superficial/rápida o verbaliza que "no puede" (registrado en el Markdown de audio) por más de 3 minutos.
    *   **Conexión "Manos Libres" Asistida:** Iniciar protocolos de llamada a servicios de apoyo (como voluntarios de *Be My Eyes*) o contactos de emergencia preconfigurados.
        *   *Intervención:* "Tu respiración sigue agitada. Voy a conectar una llamada con Be My Eyes / [Nombre de Contacto] en este momento para que esté contigo por voz mientras te recuperas."
    *   **Entrega de Contexto al Humano:** Si el agente transfiere a un contacto, debe resumir la situación antes para que el contacto humano no entre haciendo preguntas estresantes. (Ej. sintetizando un mensaje: *"El usuario está experimentando pánico en la intersección de la Calle 5, he iniciado anclaje auditivo pero necesita apoyo continuo"*).

## 5. Protocolo Post-Crisis y Restauración de la Autonomía
La finalización clínica de un ataque de pánico deja a la persona en un estado de agotamiento extremo (fatiga suprarrenal). El agente no puede simplemente reanudar la navegación estándar hacia el destino como si nada hubiera pasado.

*   **Fundamento Clínico:** Prevenir un "ataque de rebote" secundario al intentar forzar el retorno a la tarea original bajo fatiga extrema.
*   **Ejecución del Agente:**
    *   **Evaluación de Fatiga:** Re-evaluar el estado del usuario usando preguntas binarias (Sí/No).
        *   *Intervención:* "Tus latidos están volviendo a la normalidad. Lo hiciste muy bien. ¿Sientes mareo o debilidad en las piernas? Responde sí o no."
    *   **Re-enrutamiento Modificado:** El agente debe proponer alternativas de menor estrés para el resto del viaje, tomando la iniciativa de buscar opciones logísticas, no solo de navegación peatonal.
        *   *Intervención:* "Estás físicamente agotado por la adrenalina. Todavía nos faltan 15 minutos caminando al destino. ¿Quieres que busque un banco cercano para sentarte 10 minutos, o prefieres que solicite un Uber/Taxi directo aquí?"
    *   **Restauración de Dignidad:** Validar el evento como algo superado, reafirmando la autonomía del usuario. Nunca tratarlo como alguien "roto".

---

### Directiva de Implementación Combinada
En la práctica, **estos métodos no son aislados; son un engranaje continuo**. Un ejemplo de flujo integrado mental para el Agente sería:

1.  *Detecta crisis (Respiración en audio, verbalización "tengo miedo").*
2.  **Aplica Método 3 (Comunicación Directiva):** "Alto ahí. Mantente quieto."
3.  **Aplica Método 2 (Micro-Refugio):** "Da un paso atrás, ahí está la pared. Apóyate."
4.  **Aplica Método 1 (Grounding):** "Siente la pared en tu espalda. Ahora, inhala conmigo..."
5.  *(Si en 3 minutos no cede)* **Aplica Método 4 (Triangulación):** "Voy a enlazar a tu contacto de emergencia."
6.  *(Cuando pasa la crisis)* **Aplica Método 5 (Post-Crisis):** "¿Necesitas sentarte o pedimos un auto?"
