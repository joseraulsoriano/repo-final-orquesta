# Puente — Instrucciones para Claude / Cursor Agent

Lee este archivo antes de implementar. Es la fuente de verdad del proyecto.

---

## 1. Qué estamos construyendo

**Puente** — plataforma de accesibilidad para discapacidades (México/LATAM) usando **Ray-Ban Meta Gen 2**.

- **No** es Clicky (profesor Mac). **No** es CRM/ventas (`/Users/chasse/hack` legacy).
- **Sí** es: POV egocéntrico → JSON → RAG → Hermes → TTS altavoces gafas.
- **MVP demo:** persona ciega en supermercado — 3 escenarios de visita.

### Hardware confirmado

| Tiene el equipo | No tiene (backlog) |
|-----------------|------------------|
| Ray-Ban Meta **Gen 2** | Ray-Ban Display / HUD |
| iPhone iOS 16+ (MWDAT) | Android Expo (retirado) |

### Salida al usuario Gen 2

**Solo audio** por altavoces de las gafas (+ vibración teléfono en alertas). Sin pantalla en lente.

---

## 2. Arquitectura (no negociable)

```
Gen 2 ──DAT BT──► App iOS (Swift + MWDAT) ──HTTPS──► Cloudflare Worker
                                                      ├─ /fusion/describe
                                                      ├─ /rag/query
                                                      ├─ /agents/super
                                                      ├─ /chat (Clicky)
                                                      ├─ /tts
                                                      └─ /transcribe-token
                              ◄── TTS audio ── altavoces gafas
```

**Reglas DAT:**
- App móvil = cerebro. Nada corre en las gafas.
- Meta AI app = conductor BT obligatorio.
- Una sesión DAT activa.
- Cámara solo downstream (frames out, no inject in).
- No interceptar "Hey Meta".

Fuentes: [GEN2_PUENTE_IMPLEMENTACION.md](../GEN2_PUENTE_IMPLEMENTACION.md), [CAMARA_META_RAYBAN.md](../CAMARA_META_RAYBAN.md)

---

## 3. Estructura del repo

```
hackplatanus/
├── README.md
├── puente/
│   ├── CLAUDE.md          ← este archivo
│   ├── CHECKLIST.md
│   ├── backend/worker/    ← Cloudflare Worker (7 rutas)
│   ├── apps/mobile-ios/   ← **MVP demo** Swift + MWDAT (activo)
│   ├── apps/mobile/       ← Kotlin DAT (referencia / fallback)
│   └── shared/
│       ├── prompts/       ← system prompts ES-MX
│       └── types/         ← JSON schemas
├── docs/ (md en raíz)     ← investigación, flujos
└── canvases/              ← diagrama demo (Cursor)

/Users/chasse/hack/        ← legacy NO usar para producto
  M1/metaintegration/      ← solo GlassesView jurado opcional
```

---

## 3.1 Decisión MVP app móvil (2026-06)

| App | Rol | Estado |
|-----|-----|--------|
| **`apps/mobile-ios/`** | **MVP hackathon** — Swift + MWDAT nativo | SuperFlow, cruce, guía, Mac |
| **`apps/mobile/`** | Referencia Kotlin (CameraAccess fork) | Scaffold; hardware TODO |

**Regla para agentes:** implementar features nuevas en `mobile-ios`. No reintroducir Expo/RN ni duplicar SuperFlow en Kotlin salvo petición explícita.

Config: `Config/Secrets.xcconfig` (copiar desde `.example`). Ver `INTEGRACION.md`.

---

## 4. Loop cognitivo (fork Clicky)

Inspiración: [farzaa/clicky](https://github.com/farzaa/clicky) MIT.

```
PTT / Modo Sentido
  → STT (AssemblyAI)
  → Frame JPEG (DAT MEDIUM 504×896)
  → RAG context (si hay)
  → Visión → SceneJSON | ProductJSON
  → Hermes decisión
  → Strip [SPATIAL] tags
  → TTS (ElevenLabs) → gafas
```

**Copiar:** `puente/backend/worker/src/index.ts`, state machine pattern, SSE Claude.  
**No copiar:** OverlayWindow, ScreenCaptureKit, `[POINT:x,y]`.

Usar `[SPATIAL:direccion:objeto:distancia?]` — ver `shared/prompts/sentido.md`.

---

## 5. Demo super — 3 escenarios de visita

Documentación: [FLUJO_SUPER_PERSONA_CIEGA.md](../FLUJO_SUPER_PERSONA_CIEGA.md) §1.1  
Canvas: `canvases/flujo-super-persona-ciega.canvas.tsx`

| Escenario | RAG | Comportamiento clave |
|-----------|-----|---------------------|
| **1ra visita** | Vacío | Visión obligatoria · indexa `layout_super v1` |
| **2da visita** | v1 ~87% | RAG hit skip visión · dedup estantes · recall lista |
| **Experta + gafas** | Vacío Puente / mapa mental María | Contraste 3 min tacto vs 8 s PTT |

Sub-flujos 2da visita: ¿Dónde? · PTT cache · alternativa marca · ¿Qué me falta?

---

## 6. Contratos API (worker — implementados)

Rutas en `backend/worker/src/index.ts`:

| Ruta | Estado |
|------|--------|
| `POST /fusion/describe` | Implementado |
| `POST /rag/query` | MVP in-memory (`visita_numero=1` → miss forzado) |
| `POST /agents/super` | Hermes-lite |
| `POST /tts` | ElevenLabs stream |
| `POST /transcribe-token` | AssemblyAI |
| `POST /gemini/live-token` | Opcional (501 sin `GEMINI_API_KEY`) |
| `POST /chat` | Legacy Clicky passthrough |

Auth opcional: header `x-puente-key` si `WORKER_API_KEY` en secrets.

### POST `/fusion/describe`

```json
// Request
{
  "image_base64": "...",
  "module": "sentido" | "producto",
  "transcript": "opcional",
  "continuous": false,
  "locale": "es-MX",
  "rag_context": "string opcional",
  "profile": { "domains": ["vision"] }
}

// Response
{
  "speech": "texto para TTS sin tags",
  "structured": { /* SceneJSON o ProductJSON */ },
  "spatial_tags": ["[SPATIAL:...]"],
  "alert": false
}
```

### POST `/rag/query`

```json
// Request
{ "query": "leche", "gps": { "lat": 19.39, "lng": -99.17 }, "super_id": "walmart_portales" }
// Response
{ "hit": true, "confidence": 0.87, "speech_hint": "...", "skip_vision": true, "chunks": [] }
```

### POST `/agents/super`

```json
// Request
{ "transcript": "...", "structured": {}, "session_state": {}, "action": "confirm" | "alternativa" | "recall" }
// Response
{ "speech": "...", "session_state": {}, "pending_confirm": false }
```

Schemas completos: `shared/types/schemas.md`

---

## 7. Prompts — dónde viven

| Archivo | Uso |
|---------|-----|
| `shared/prompts/sentido.md` | SceneJSON · navegación espacial |
| `shared/prompts/producto-super.md` | ProductJSON · etiquetas · precio |
| `shared/prompts/hermes-super.md` | Decisión · lista · alternativas · recall |
| `shared/prompts/rag-inject.md` | Template contexto RAG en fusion |

**Reglas globales prompts:**
- Español mexicano
- Escrito para oído — sin markdown, listas, emojis
- 1–2 oraciones salvo que pidan más
- Egocéntrico: izquierda, derecha, adelante
- Tags `[SPATIAL:...]` al final — no leer en voz
- Disclaimer: apoyo complementario, no bastón/perro guía

---

## 8. Hermes / memoria (patrones)

Repo referencia: [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)

MVP **Hermes-lite** (no correr Hermes completo en teléfono):

| Pieza | Contenido |
|-------|-----------|
| `USER.md` | Perfil: ceguera, alergias, prefs Lala, ES-MX |
| `MEMORY.md` | Hechos: super favorito, marcas, historial |
| `SessionState` | Lista compra, turno, items carrito |
| Loop | Think → Act → Observe → speak / confirm / memory_write |

OpenClaw migrate: solo si ya tenían OpenClaw — `hermes claw migrate` importa MEMORY.

---

## 9. Herramientas externas

| Herramienta | Para qué |
|-------------|----------|
| DAT Android 0.7 | Stream, mic, speakers |
| Cloudflare Worker | Proxy keys (fork Clicky) |
| AssemblyAI | STT mic 8 kHz |
| ElevenLabs | TTS → gafas |
| Claude / GPT-4o | Visión batch |
| Gemini Live | Escaneo estante denso (2da visita) |
| MockDeviceKit | Dev sin gafas |
| Wearables MCP | `search_dat_docs` en Cursor |

Meta MCP: `https://mcp.developer.meta.com/wearables`

---

## 10. Config Android DAT

```kotlin
// Stream recomendado
StreamConfiguration(
    videoQuality = VideoQuality.MEDIUM,  // 504×896
    frameRate = 15,  // Sentido: sample 1/3s
)
```

Gradle deps:

```kotlin
implementation("com.meta.wearable:mwdat-core:0.7.0")
implementation("com.meta.wearable:mwdat-camera:0.7.0")
implementation("com.meta.wearable:mwdat-mockdevice:0.7.0")
```

Sample base: `CameraAccess` de meta-wearables-dat-android.

`local.properties`: `GITHUB_TOKEN=...`

---

## 11. SLAs (objetivos demo)

| Evento | Target | Max |
|--------|--------|-----|
| PTT → first TTS | ≤8 s | 12 s |
| RAG hit | 300 ms | 800 ms |
| SceneJSON batch | 3 s | 6 s |
| ProductJSON | 4 s | 8 s |
| Alerta seguridad | <2 s total | 3 s |

---

## 12. State machine app (Kotlin)

```kotlin
enum class PuenteSessionState {
    DISCONNECTED,
    CONNECTED_IDLE,
    LISTENING,           // PTT
    PROCESSING,          // API
    SPEAKING,            // TTS
    SENTIDO_CONTINUOUS,  // 1 frame/3s
    ESCANEO_LIVE         // Gemini Live
}
```

Modos usuario: Idle · Sentido · Consulta · Escaneo · Confirmación

---

## 13. Qué NO hacer

- No implementar CRM, Whisper ventas, MCP leads de `/Users/chasse/hack`
- No Display Web App en MVP Gen 2
- No `[POINT:x,y]` — solo `[SPATIAL:...]`
- No commitear API keys
- No UI compleja en teléfono — 4 pantallas max
- No prometer certificación médica / sustituto perro guía
- No force push main

---

## 14. Orden de implementación

Seguir [CHECKLIST.md](./CHECKLIST.md):

1. Worker deploy + secrets  
2. `/fusion/describe` con prompts  
3. Android fork CameraAccess  
4. Verificar TTS → **gafas**  
5. Loop PTT super ProductJSON  
6. RAG post-sesión  
7. Demo 3 escenarios  

---

## 15. Documentación cruzada

| Doc | Contenido |
|-----|-----------|
| [CHECKLIST.md](./CHECKLIST.md) | Setup paso a paso |
| [GEN2_PUENTE_IMPLEMENTACION.md](../GEN2_PUENTE_IMPLEMENTACION.md) | Gen 2 detalle |
| [FLUJO_SUPER_PERSONA_CIEGA.md](../FLUJO_SUPER_PERSONA_CIEGA.md) | E2E super |
| [MODULO_DISCAPACIDADES_MX_LATAM.md](../MODULO_DISCAPACIDADES_MX_LATAM.md) | Mercado |
| [ANALISIS_CLICKY_VS_PUENTE.md](../ANALISIS_CLICKY_VS_PUENTE.md) | Fork Clicky |
| [INVESTIGACION_META_SDK.md](../INVESTIGACION_META_SDK.md) | DAT vs Meta AI |

---

## 16. Convenciones código

- Kotlin: convenciones Android estándar
- Worker: TypeScript, wrangler
- Prompts: markdown en `shared/prompts/`
- Commits: imperativo, español o inglés consistente con repo
- Scope mínimo — no refactorizar legacy hack
- Tests: solo si piden o cubren comportamiento real

---

## 17. Pitch — diferenciador vs Meta AI

Meta AI: genérico, no customizable, no lista compra, no RAG super, no agentes.

Puente: egocéntrico ES-MX · RAG aprende el super · Hermes lista/recall · confirmación producto · 3 escenarios visita demostrables.

---

## 18. Primer mensaje sugerido al agente

```text
Revisa puente/CHECKLIST.md y puente/E2E_VERIFICATION.md.
Siguiente: conectar mobile-ios a worker deploy + probar PTT en gafas físicas.
No reimplementes /fusion — ya existe en worker.
```
