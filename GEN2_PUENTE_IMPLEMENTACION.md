# Puente en Ray-Ban Meta Gen 2 — Guía de implementación

> **Hardware objetivo:** Ray-Ban Meta **Gen 2** (sin display, sin HUD en lente)  
> **Salida única al usuario:** **audio por altavoces de las gafas** (+ vibración teléfono como fallback)  
> **Cerebro:** App móvil Android/iOS vía **DAT** + backend en nube  
> **Inspiración técnica:** Loop de [Clicky](https://github.com/farzaa/clicky), adaptado de Mac → POV egocéntrico

---

## 1. Modelo mental Gen 2

Las Gen 2 **no tienen pantalla**. Todo lo que el usuario percibe pasa por **oído** (y opcionalmente tacto en el teléfono). Tu app no corre en las gafas: corre en el **teléfono**, conectada por Bluetooth.

```
┌──────────────────────────────────────────────────────────────┐
│  RAY-BAN META GEN 2 (periférico)                             │
│  • Cámara POV 12MP → stream comprimido BT                    │
│  • Micrófono HFP mono 8 kHz                                  │
│  • Altavoces → TTS / respuestas                              │
│  • Botón temple / LED privacidad                             │
│  • NO pantalla · NO Neural Band · NO HUD                     │
└───────────────────────────┬──────────────────────────────────┘
                            │ Bluetooth Classic (DAT)
                            │ Meta AI app = conductor obligatorio
┌───────────────────────────▼──────────────────────────────────┐
│  TELÉFONO — App Puente (DAT) ★ CEREBRO ★                     │
│  • StreamSession → frames JPEG                               │
│  • Mic capture → STT                                         │
│  • HTTP → backend fusion + agentes                           │
│  • TTS audio → ruta altavoces gafas                          │
│  • UI minimal (estado, permisos, perfil discapacidad)        │
└───────────────────────────┬──────────────────────────────────┘
                            │ HTTPS
┌───────────────────────────▼──────────────────────────────────┐
│  BACKEND (Cloudflare Worker o Bun)                             │
│  • /fusion/describe — visión + prompt Sentido                  │
│  • /agents/puente — acciones sociales                          │
│  • /chat · /tts · /transcribe-token (fork Clicky)              │
└────────────────────────────────────────────────────────────────┘

Opcional jurado (NO usuario final):
  Teléfono → WebSocket → companion-web (POV en laptop/proyector)
```

**Comparación con Meta AI nativo:** Meta AI ya describe lo que ves y responde por voz. Puente se diferencia con **lenguaje espacial egocéntrico**, **agentes de acción** (WhatsApp, saludos) y **modo continuo** caminando — cosas que Meta AI no customiza vía DAT.

---

## 2. Clicky → Gen 2: traducción directa

| Clicky (Mac) | Puente Gen 2 | Notas |
|--------------|--------------|-------|
| ScreenCaptureKit JPEG | `VideoFrame` DAT MEDIUM 504×896 | POV frente, no pantalla |
| Push-to-talk Ctrl+Option | Botón temple + hold, o PTT en app | No hay shortcut global |
| AssemblyAI WS | AssemblyAI token vía worker | Mic HFP 8 kHz mono |
| Claude vision SSE | `/fusion/describe` | Prompt Sentido ES-MX |
| ElevenLabs → Mac speakers | ElevenLabs/Android TTS → **gafas** | Routing audio crítico |
| `[POINT:x,y:label]` | `[SPATIAL:derecha:elevador]` | Solo audio, strip tags antes TTS |
| Cursor overlay | **Eliminado** | Gen 2 no tiene output visual |
| Menu bar panel | Pantalla sesión minimal | 3–4 pantallas max |
| Multi-monitor | Un solo POV 9:16 | Más simple |

**Copiar del repo Clicky:**
- `worker/src/index.ts` (95%)
- Patrón state machine `CompanionManager`
- Cliente Claude streaming (portar a Kotlin)
- Filosofía prompts "for the ear"

**No portar:** `OverlayWindow`, `ScreenCaptureKit`, `MenuBarPanelManager`, `[POINT]`.

---

## 3. Pipeline Gen 2 (detalle técnico)

### 3.1 Loop on-demand (pregunta del usuario)

```
Usuario pulsa temple / dice comando en app
  → Mic gafas ON (HFP)
  → AssemblyAI streaming STT (worker /transcribe-token)
  → Usuario suelta → transcript final
  → capturePhoto() o último frame del stream
  → POST /fusion/describe { image, transcript, module, locale }
  → Respuesta texto + tags [SPATIAL:...]
  → Strip tags → TTS → AudioTrack → altavoces gafas
  → (Opcional) Agente Puente si intención social detectada
```

### 3.2 Loop continuo Sentido (caminando)

```
Usuario activa "Modo Sentido" en app
  → StreamSession MEDIUM @ 7–15 fps
  → Cada 3 s: sample 1 frame (no saturar BT ni API)
  → POST /fusion/describe { image, module: "sentido", continuous: true }
  → Si hay cambio relevante vs frame anterior → TTS
  → Si alerta [SPATIAL:alerta:...] → TTS prioritario + vibración teléfono
  → Usuario dice "detén" o pulsa temple → stop stream
```

**Límites DAT Gen 2 (recordar):**
- Una sesión DAT activa a la vez
- Stream no en background prolongado (app foreground)
- `capturePhoto()` solo con stream en `STREAMING`
- Compresión adaptativa por BT — preferir MEDIUM + 1 frame/3s en Sentido

Config recomendada:

```kotlin
StreamConfiguration(
    videoQuality = VideoQuality.MEDIUM,  // 504×896
    frameRate = 15,                       // Sentido continuo: bajar a 7
)
```

---

## 4. Módulos priorizados para Gen 2

Gen 2 es **audio-first**. Prioriza módulos donde el oído basta.

| Prioridad | Módulo | Discapacidad | Gen 2 | Cómo suena |
|-----------|--------|--------------|-------|------------|
| **P0** | **Sentido** | Visual / baja visión | Core | "A tu derecha un elevador. Adelante escaleras." |
| **P0** | **Puente** | Motriz / comunicación | Core | "Le envié saludo a Ángel por WhatsApp." |
| **P1** | **Mano** | Destreza (sin manos) | v1 | "¿Envío este correo? Di sí o no." |
| **P1** | **Voz** | Mudez | v1 | TTS por altavoces gafas = tu voz |
| **P2** | **Oído+** | Auditiva | Débil | Captions solo en **teléfono** + vibración |
| **P2** | **Calma** | Cognición | v2 | Respuestas más cortas si detectas estrés |

**Insight México:** Motriz/destreza (~48%) > visual (~33%). **Puente + Mano** son tan importantes como Sentido en Gen 2.

### 4.1 Sentido — flujo Gen 2

**Entrada:** frame POV + GPS teléfono (opcional)  
**Salida:** solo TTS altavoces

```
Prompt usuario: "¿Qué hay a mi derecha?"
→ Frame actual → fusion
→ "A tu derecha hay una terraza con mesas. A unos dos pasos."
→ [SPATIAL:derecha:terraza:distancia_corta]
```

**Reglas audio Gen 2:**
- Máximo 2 oraciones por respuesta (excepto si piden más)
- Sin listas, markdown, emojis
- Referencias: izquierda, derecha, adelante, atrás, arriba, abajo
- Alertas interrumpen TTS en curso

### 4.2 Puente — flujo Gen 2

**Caso:** "Saluda a mi amigo Ángel"

```
STT → POST /agents/puente { transcript, image, contacts }
  → Vision: ¿hay persona visible?
  → Lookup contacto "Ángel"
  → Acción: Intent share WhatsApp / SMS
  → TTS: "Listo. Le mandé un saludo a Ángel."
  → Confirmación previa por voz: "¿Confirmas? Di sí."
```

Sin HUD: **confirmación 100% por voz** ("di sí para enviar").

### 4.3 Mano — flujo Gen 2

```
"Dicta un mensaje al doctor"
→ STT continuo → borrador
→ TTS lee borrador completo
→ "¿Lo envío?" → "Sí" → acción
```

### 4.4 Oído+ — limitación Gen 2

Sin Display, **no hay captions en lente**. Opciones Gen 2:
- Vibración teléfono en alertas
- Notificación con texto (usuario saca teléfono — peor UX)
- **Marcar como "mejor con Display"** en pitch, no bloquear MVP

---

## 5. Sistema `[SPATIAL]` — solo audio Gen 2

Clicky usa `[POINT:x,y]`. En Gen 2 **solo parseas para lógica interna**; el usuario nunca ve coordenadas.

```
[SPATIAL:derecha:elevador:distancia_media]
[SPATIAL:izquierda:terraza]
[SPATIAL:adelante:escaleras]
[SPATIAL:alerta:vehiculo]
[SPATIAL:none]
```

**Parser Kotlin (borrador):**

```kotlin
fun stripSpatialTags(raw: String): String =
    raw.replace(Regex("\\[SPATIAL:[^\\]]+\\]"), "").trim()

fun parseSpatialTags(raw: String): List<SpatialTag> { /* regex */ }

data class SpatialTag(
    val direction: String,  // derecha, izquierda, adelante, alerta
    val label: String,
    val distance: String? = null
)
```

**Uso interno:** priorizar alertas, vibración teléfono, companion-web jurado. **TTS** usa texto sin tags.

---

## 6. Prompts Gen 2 (listos para backend)

### 6.1 Sentido

```
Eres Puente Sentido, compañero de orientación para personas con baja visión en México.
El usuario lleva gafas Ray-Ban Meta Gen 2: SOLO escucha respuestas por altavoces. No hay pantalla.

Reglas:
- Español mexicano claro, frases cortas (1–2 oraciones salvo que pidan más).
- Escrito para oído: sin listas, markdown, símbolos raros.
- Referencias egocéntricas: "a tu derecha", "adelante", "detrás".
- Prioriza seguridad: vehículos, escalones, postes → tono de alerta.
- No digas "haz clic" ni referencias visuales de UI.
- Al final, tags [SPATIAL:direccion:objeto:distancia?] sin leerlos en voz.
- Disclaimer implícito: apoyo complementario, no sustituyes bastón ni perro guía.

Imagen: POV vertical 9:16 desde la frente del usuario, caminando.
```

### 6.2 Puente

```
Eres Puente social. El usuario tiene limitación motriz y no puede usar las manos con facilidad.
Interpreta intenciones: saludar, enviar mensaje, tomar nota de quién está presente.
Confirma acciones destructivas por voz antes de ejecutar.
Respuesta hablada: confirma qué hiciste en una frase.
```

---

## 7. Stack mínimo Gen 2

```
puente/
├── apps/mobile-android/     # ★ ÚNICO cliente usuario Gen 2
│   ├── dat/                 # Wearables DAT 0.7
│   ├── audio/               # Mic HFP, TTS → gafas
│   ├── modules/sentido/
│   ├── modules/puente/
│   └── ui/                  # 4 pantallas
│
├── backend/worker/          # Fork Clicky + fusion + puente
│   └── src/index.ts
│
└── apps/companion-web/      # Solo demo jurado (opcional)
```

| Pieza | Tecnología Gen 2 |
|-------|------------------|
| App | **Kotlin + DAT Android 0.7** |
| Sample base | [CameraAccess](https://github.com/facebook/meta-wearables-dat-android/tree/main/samples) |
| Backend | Cloudflare Worker (fork Clicky) |
| Visión | Claude Sonnet / GPT-4o mini |
| STT | AssemblyAI vía worker |
| TTS | ElevenLabs vía worker, o Android TTS |
| Mock dev | MockDeviceKit (CI sin gafas) |

**Eliminado del scope Gen 2:**
- `apps/display-hud/` — no aplica
- Web Apps toolkit — no aplica
- MWDATDisplay — no aplica
- Neural Band — no aplica

---

## 8. App Android — pantallas y estados

### 8.1 Pantallas (4)

| # | Pantalla | Contenido |
|---|----------|-----------|
| 1 | Onboarding | Perfil discapacidad (multi-select Washington Group) |
| 2 | Permisos | Deeplink Meta AI → cámara gafas + BT |
| 3 | Sesión | Modo Sentido / Puente / idle, indicador "escuchando" |
| 4 | Ajustes | Velocidad TTS, idioma, disclaimer |

**No construir:** UI compleja, mapas, feed de video en teléfono (opcional debug).

### 8.2 State machine

```kotlin
enum class PuenteSessionState {
    DISCONNECTED,       // Sin gafas
    CONNECTED_IDLE,     // Gafas listas
    LISTENING,          // Mic activo (PTT)
    PROCESSING,         // Frame + API
    SPEAKING,           // TTS en altavoces gafas
    SENTIDO_CONTINUOUS  // Stream + sample cada 3s
}
```

Port directo del patrón `CompanionManager` de Clicky.

### 8.3 Input Gen 2

| Input | Acción |
|-------|--------|
| Botón temple (capture) | PTT: grabar mientras presionado |
| Voz en app "Modo Sentido" | Toggle continuo |
| Voz "Detén" / "Para" | Stop Sentido |
| Teléfono (fallback) | PTT si temple no mapeado en v0 |

**Nota:** No puedes interceptar "Hey Meta" — eso es Meta AI. Tu wake word es vía **tu app** o botón.

---

## 9. Backend — contratos Gen 2

### POST `/fusion/describe`

```json
{
  "image_base64": "...",
  "module": "sentido",
  "transcript": "¿qué hay a mi derecha?",
  "continuous": false,
  "locale": "es-MX",
  "profile": { "domains": ["vision"] }
}
```

```json
{
  "speech": "A tu derecha hay un elevador.",
  "spatial_tags": ["[SPATIAL:derecha:elevador:distancia_media]"],
  "alert": false
}
```

### POST `/agents/puente`

```json
{
  "transcript": "saluda a mi amigo ángel",
  "image_base64": "...",
  "contacts": [{ "name": "Ángel", "phone": "+52..." }]
}
```

```json
{
  "speech": "¿Confirmas que envíe un saludo a Ángel por WhatsApp?",
  "action": "confirm_whatsapp",
  "pending": true
}
```

### Worker Clicky (existente)

| Ruta | Uso Gen 2 |
|------|-----------|
| `POST /chat` | Fallback chat |
| `POST /tts` | Audio MP3 → gafas |
| `POST /transcribe-token` | STT mic gafas |

---

## 10. Setup Gen 2 — checklist

### Fase 0 — Meta (bloqueante)

- [ ] Cuenta [Wearables Developer Center](https://wearables.developer.meta.com/)
- [ ] App registrada → Application ID
- [ ] Meta AI app → **Developer Mode** ON
- [ ] Gafas Gen 2 emparejadas + firmware actualizado
- [ ] Permiso cámara gafas vía deeplink Meta AI
- [ ] `GITHUB_TOKEN` en `local.properties` (Gradle DAT)

### Fase 1 — Backend (1 día)

- [ ] Fork `clicky/worker` → `puente/backend/worker`
- [ ] Deploy Cloudflare Worker
- [ ] Añadir `/fusion/describe` stub
- [ ] Probar `/tts` y `/transcribe-token` con curl

### Fase 2 — Android DAT (2–3 días)

- [ ] Fork sample `CameraAccess`
- [ ] Stream MEDIUM → log frame OK
- [ ] Integrar worker `/fusion/describe` con 1 frame
- [ ] TTS respuesta → altavoces gafas
- [ ] PTT mic → STT → fusion

### Fase 3 — Módulos demo (2 días)

- [ ] Sentido: pregunta espacial + modo continuo 30s
- [ ] Puente: "Saluda a Ángel" → share intent
- [ ] Companion web POV (jurado)

### Fase 4 — Polish hackathon

- [ ] Onboarding perfil discapacidad
- [ ] Disclaimer legal
- [ ] Demo script 3 min
- [ ] MockDeviceKit en CI

---

## 11. Demo hackathon Gen 2 (3 actos, solo audio)

| Acto | Acción | Qué escucha el jurado |
|------|--------|------------------------|
| 1 | Caminar con Modo Sentido | Narración espacial en altavoces gafas |
| 2 | "¿Qué hay a mi derecha?" | Respuesta on-demand |
| 3 | "Saluda a mi amigo Ángel" | Confirmación voz → WhatsApp enviado |

**Proyector:** companion-web muestra POV + transcript (jurado ve, usuario no necesita ver).

---

## 12. Gen 2 vs Meta AI — diferenciación en demo

| | Meta AI nativo | Puente Gen 2 |
|---|----------------|--------------|
| Lenguaje | Genérico "veo una mesa" | **Egocéntrico** "a tu derecha" |
| Continuo caminando | Live AI limitado | **Modo Sentido** cada 3s |
| Acciones | No WhatsApp custom | **Agente Puente** |
| Perfil | Uno para todos | **Washington Group** onboarding |
| Mercado | Global | **MX/LATAM**, datos INEGI |
| Custom | No vía DAT | **Tu prompts + agentes** |

---

## 13. Riesgos Gen 2

| Riesgo | Mitigación |
|--------|------------|
| Latencia BT + visión | 1 frame/3s, MEDIUM quality |
| TTS no sale por gafas | Probar routing HFP early |
| Mic 8 kHz calidad STT | AssemblyAI u3-rt-pro |
| Batería stream continuo | Modo Sentido con auto-stop 10 min |
| Usuario sordo | Declarar limitación; Display en roadmap |
| Background kill Android | Foreground service + notificación |

---

## 14. Próximo paso inmediato

1. **Fork worker Clicky** → deploy  
2. **Fork DAT Android CameraAccess** → 1 frame + TTS "Hola desde Puente"  
3. **Validar audio sale por gafas** (no speaker teléfono)  
4. **Conectar `/fusion/describe`** con prompt Sentido  
5. Display HUD → **backlog**, no bloquea Gen 2

---

## Referencias

- [ANALISIS_CLICKY_VS_PUENTE.md](./ANALISIS_CLICKY_VS_PUENTE.md)
- [CAMARA_META_RAYBAN.md](./CAMARA_META_RAYBAN.md)
- [MODULO_DISCAPACIDADES_MX_LATAM.md](./MODULO_DISCAPACIDADES_MX_LATAM.md)
- [DAT Android](https://github.com/facebook/meta-wearables-dat-android)
- [Clicky](https://github.com/farzaa/clicky)
- [Meta Accessibility](https://www.meta.com/ai-glasses/accessibility/)
