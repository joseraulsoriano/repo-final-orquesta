# Investigación: Ecosistema Meta Wearables + Implicaciones para el Hack

> **Contexto del equipo:** Ray-Ban Meta **Gen 1 sin display**, pivot hacia asistencia espacial multimodal para personas ciegas, integración de sentidos (vista, oído, olfato mock/IoT, interocepción), repo existente en `/Users/chasse/hack` (M1 simulador React + MCP + hackAIVoice).

> **Fecha de investigación:** Junio 2026

---

## 1. Resumen ejecutivo

Meta abrió **tres vías de desarrollo** distintas en 2026. Para **Ray-Ban Meta Gen 1 sin display**, la vía correcta es el **Device Access Toolkit (DAT)**, no las Web Apps.

| Vía | Hardware | Qué corre dónde | Cámara | Audio I/O | Gen 1 |
|-----|----------|-----------------|--------|-----------|-------|
| **Meta AI + Muse Spark** | Todas las gafas | Meta AI app (cerebro) | Sí (Meta) | Sí (Meta) | Sí |
| **DAT (iOS/Android)** | Gen 1, Gen 2, Display | **Tu app móvil** (cerebro) | Stream + foto | Mic 8kHz mono + speakers | **Sí** |
| **Web Apps** | Solo Ray-Ban **Display** | Browser en lente | **No** | **No** | **No** |

**Conclusión para el hack:** El post de Reddit es **correcto**. Tu app (Android o iOS) es el cerebro; las gafas Gen 1 son periférico de cámara, micrófono y altavoz. Puedes **ignorar Meta AI** como LLM y usar OpenAI/Gemini/tu backend.

**Muse Spark** ([anuncio abril 2026](https://about.fb.com/news/2026/04/introducing-muse-spark-meta-superintelligence-labs/)) mejora la percepción multimodal de Meta AI en gafas (live AI, voz más rápida), pero **no reemplaza** un producto custom con lenguaje espacial egocéntrico, olfato fusionado e interocepción.

---

## 2. Las tres plataformas Meta (detalle)

### 2.1 Meta AI + Muse Spark (asistente de fábrica)

**Qué es:** Modelo Muse Spark de Meta Superintelligence Labs. Percepción multimodal nativa en la app Meta AI y gafas.

**Capacidades relevantes (mayo 2026):**
- Voz conversacional con interrupciones y cambio de idioma
- **Live AI:** apuntar cámara y preguntar en tiempo real (landmarks, casa)
- Rollout gradual a Ray-Ban Meta Gen 1/2 en US/Canadá
- Detailed Responses para accesibilidad (descripciones más ricas para ciegos)
- Integración Be My Eyes ("Hey Meta, Be My Eyes")

**Limitaciones para vuestro producto:**
- No controláis el prompt ni el formato de respuesta (izq/der/adelante)
- Meta advierte: **no usar como ayuda de movilidad**
- No integráis olfato, HRV ni fusión multimodal custom
- No podéis interceptar "Hey Meta"

**Cuándo usarlo en el hack:** Como **baseline de comparación** en demo ("Meta AI vs Sentido").

---

### 2.2 Device Access Toolkit — DAT (vuestra vía principal)

**Docs:** [wearables.developer.meta.com/docs/develop](https://wearables.developer.meta.com/docs/develop/)

**Repos oficiales:**
- iOS: [facebook/meta-wearables-dat-ios](https://github.com/facebook/meta-wearables-dat-ios) (453 stars)
- Android: [facebook/meta-wearables-dat-android](https://github.com/facebook/meta-wearables-dat-android)

**Dispositivos soportados:** Ray-Ban Meta Gen 1, Gen 2, Optics, Ray-Ban Display.

#### Modelo mental (validado vs Reddit)

```
Ray-Ban Meta Gen 1
       ↓ Bluetooth
Meta AI app (conductor: emparejamiento, permisos, firmware)
       ↓
Tu app Android/iOS (CEREBRO: lógica + IA + almacenamiento)
       ↓
OpenAI / Gemini / tu backend / modelos locales
```

#### Lo que SÍ podéis hacer

| Capacidad | Componente SDK | Uso en "Sentido" |
|-----------|----------------|------------------|
| Stream de video POV | `MWDATCamera` | Frames cada 2-3s → vision API |
| Captura de foto | `MWDATCamera` | Snapshot bajo demanda |
| Audio entrada | HFP Bluetooth, 8 kHz mono | Whisper / detección ambiente |
| Audio salida | Speakers gafas | TTS narración espacial |
| Sesiones | `MWDATCore` | Start/pause/stop con tap en gafas |
| Testing sin hardware | MockDeviceKit | CI + demo con video pregrabado |

#### Lo que NO podéis hacer

- Ejecutar código en las gafas
- Reemplazar/interceptar "Hey Meta"
- UI custom en lente (Gen 1 no tiene display anyway)
- Conectar gafas a internet sin teléfono
- Saltar Meta AI app (siempre necesaria como conductor BT)

#### Ciclo de integración

1. **Registration:** usuario conecta tu app a las gafas (one-time, deeplink a Meta AI)
2. **Permissions:** cámara vía Meta AI app; micrófono vía HFP del SO
3. **Session:** una sesión activa a la vez; pause al cerrar bisagras o quitarse gafas

#### Setup mínimo

1. Meta AI app v272+ con **Developer Mode** (tap 5× en versión en Settings > App Info)
2. Gafas firmware mínimo según [Version Dependencies](https://wearables.developer.meta.com/docs/develop/dat/version-dependencies/)
3. Cuenta en [Wearables Developer Center](https://wearables.developer.meta.com/)
4. App ID + registro de proyecto
5. Android: `GITHUB_TOKEN` para GitHub Packages (SDK distribuido ahí)
6. iOS: Swift Package Manager desde repo GitHub

#### Mock Device Kit (crítico para hackathon)

Permite desarrollar **sin gafas físicas** en CI:

```kotlin
// Android — video pregrabado como feed de cámara
val mockKit = MockDeviceKit.getInstance(context)
mockKit.enable()
val glasses = mockKit.pairRaybanMeta()
glasses.services.camera.setCameraFeed(testVideoUri)
```

iOS tiene equivalente `MockDeviceKit` en el repo DAT iOS.

**Implicación:** Podéis tener pipeline completo en Android + mock para jurado, y demo real con Gen 1 el día del pitch.

---

### 2.3 Web Apps (NO aplica a Gen 1)

**Docs:** [Web Apps build guide](https://wearables.developer.meta.com/docs/develop/webapps/build)  
**Toolkit:** [facebookincubator/meta-wearables-webapp](https://github.com/facebookincubator/meta-wearables-webapp)

**Solo Ray-Ban Display.** Viewport 600×600, D-pad/Neural Band, IMU, GPS, localStorage.

**Sin soporte:** cámara, micrófono, text input, offline.

**Relación con vuestro M1 React:** El simulador `GlassesView` en M1 está alineado con Display web apps, pero **vuestras Gen 1 no pueden cargarlo en el lente**. Sí sirve como **proyector para el jurado** en laptop.

---

## 3. Google Health API (interocepción)

**Docs:** [developers.google.com/health](https://developers.google.com/health?hl=es-419)

**Qué es:** Evolución unificada de Fitbit Web API. OAuth 2.0 Google, datos de Pixel Watch, Fitbit, terceros.

**Datos útiles para interocepción:**

| Biomarcador | Sentido | Uso en "Sentido" |
|-------------|---------|------------------|
| Heart rate | Interocepción | Pulso en tiempo real |
| HRV (RMSSD, SDNN) | Interocepción | Detectar estrés/ansiedad al cruzar |
| Respiratory rate | Interocepción | Fatiga, pánico |
| Steps / activity | Propiocepción indirecta | Ritmo de marcha |
| Sleep | Contexto | Modo "descansado" vs "cansado" |

**Integración propuesta:**

```
Pixel Watch / Fitbit / Apple Watch (compañero)
       ↓ REST/WebSocket
Backend (FastAPI o MCP extendido)
       ↓ HRV + contexto
Prompt vision: "Usuario en estrés (HRV bajo). Respuestas más cortas. Prioriza seguridad."
       ↓
TTS → altavoces Ray-Ban Gen 1
```

**Para hackathon:** Mock de HRV en backend (`stress_level: 0.8`) es suficiente; Fitbit real es bonus.

---

## 4. Mapa de sentidos × plataforma × factibilidad

| Sentido | Fuente hardware | Plataforma | MVP hackathon |
|---------|-----------------|------------|---------------|
| **Vista** | Cámara Gen 1 vía DAT | DAT → vision API | **Core** |
| **Oído (input)** | Mic Gen 1 vía HFP | DAT → Whisper | Reusar pipeline M1 |
| **Oído (output)** | Speakers Gen 1 | DAT + TTS | Core |
| **Olfato** | ESP32 + MQ-135 (externo) | BLE → app Android | Mock + sensor opcional |
| **Tacto** | Vibración teléfono | Android haptic | Nice-to-have |
| **Gusto** | — | — | Skip (mencionar en roadmap) |
| **Propiocepción** | IMU teléfono / Display web | `DeviceMotionEvent` | GPS + brújula en app |
| **Interocepción** | Fitbit/Pixel Watch | Google Health API | Mock HRV |

---

## 5. Arquitectura recomendada post-investigación

### Opción A — Hackathon realista (RECOMENDADA)

```
┌─────────────────────────────────────────────────────────────┐
│  CAPA DEMO JURADO (laptop)                                  │
│  M1 GlassesView (React) ← WebSocket ← Backend               │
└─────────────────────────────────────────────────────────────┘
                              ↑
┌─────────────────────────────────────────────────────────────┐
│  CAPA CEREBRO — App Android (DAT) o Backend + teléfono     │
│                                                             │
│  DAT Session                                                │
│    ├─ MWDATCamera → frame cada 3s                          │
│    ├─ HFP mic → audio chunks → Whisper                     │
│    └─ speakers ← TTS (ElevenLabs / Android TTS)            │
│                                                             │
│  Fusion Engine (nuevo)                                      │
│    ├─ Vision: GPT-4o / Gemini Flash + prompt espacial      │
│    ├─ Audio: clasificación ambiente                        │
│    ├─ OlfactoryAdapter: mock o ESP32 BLE                   │
│    └─ InteroceptionAdapter: mock HRV o Google Health       │
│                                                             │
│  Output: "Adelante cruce. Derecha: elevador. Olor tabaco."  │
└─────────────────────────────────────────────────────────────┘
                              ↑
┌─────────────────────────────────────────────────────────────┐
│  Ray-Ban Meta Gen 1 — ojos, oídos, boca                   │
└─────────────────────────────────────────────────────────────┘
```

### Opción B — Solo web (sin DAT, más rápida, menos "real")

- Teléfono con cámara trasera + TTS
- M1 simulador en laptop
- Gen 1 solo con Meta AI como comparación
- **Marcabilidad:** 7/10 vs 9/10 con DAT

### Opción C — Full stack DAT + Google Health + ESP32

- Máximo diferenciador multimodal
- **Esfuerzo:** 2-3 días
- **Marcabilidad:** 10/10 si funciona en vivo

---

## 6. Qué reutilizar del repo `/Users/chasse/hack`

| Módulo | Acción | Sentido |
|--------|--------|---------|
| `M1/GlassesView` | **Mantener** — sync WebSocket con frames DAT | Vista (jurado) |
| `M1/LensDisplay` | Adaptar texto → última narración | Vista (jurado) |
| `M1/useWhisperSales` | Refactor → `useAmbientAudio` | Oído |
| `M1/config.ts` | Mantener simulador; descartar native glasses para Gen 1 | — |
| `M5/hackAIVoice` | TTS pipeline | Oído output |
| `MCP/CRM` | **Descartar** o mock mínimo | — |
| **Nuevo** `M7/sentido-android` | App DAT Kotlin | Core real |
| **Nuevo** `fusion/` | Backend Python/Bun vision+olfato+HRV | Core |

---

## 7. Muse Spark vs vuestro producto — tabla de diferenciación

| Feature | Meta AI + Muse Spark | Vuestro "Sentido" |
|---------|---------------------|-------------------|
| Describe escena | Sí (bajo demanda) | Sí (continuo cada 3s) |
| Lenguaje egocéntrico | Parcial | **Core: izq/der/adelante** |
| "¿Puedo cruzar?" | Limitado + disclaimer Meta | Custom con prioridad seguridad |
| Olfato fusionado | No | **Sí (mock/sensor)** |
| Interocepción adaptativa | No | **Sí (HRV → tono respuesta)** |
| Control del stack | Cero | Total (DAT + vuestro LLM) |
| Open source / demo custom | No | Sí |

**Pitch:** *"Meta AI ve el mundo. Sentido te orienta en él — con olfato, pulso y lenguaje que entiendes caminando."*

---

## 8. Checklist de investigación → acción

### Fase 0 — Hoy (2h)
- [ ] Confirmar firmware Gen 1 + Meta AI app v272+ en teléfono del demo
- [ ] Activar Developer Mode en Meta AI app
- [ ] Crear cuenta Wearables Developer Center
- [ ] Decidir plataforma: **Android** (más docs Reddit) vs iOS (si solo tienen iPhone)

### Fase 1 — Setup DAT (4-6h)
- [ ] Clonar [meta-wearables-dat-android](https://github.com/facebook/meta-wearables-dat-android)
- [ ] Correr sample app + MockDeviceKit con video de calle
- [ ] Registrar app en Developer Center
- [ ] Primera sesión real con Gen 1: capturar 1 frame → log

### Fase 2 — Fusion backend (4-6h)
- [ ] Endpoint `POST /fusion/describe` (image + audio + olfactory + hrv)
- [ ] Prompt espacial en español
- [ ] TTS → speakers vía app Android
- [ ] WebSocket → M1 GlassesView (jurado)

### Fase 3 — Demo (2h)
- [ ] Video fallback si WiFi falla
- [ ] Comparación side-by-side Meta AI vs Sentido
- [ ] Disclaimer accesibilidad
- [ ] Escenario: elevador derecha, terraza izquierda, persona fumando

### Fase 4 — Bonus sentidos
- [ ] ESP32 MQ-135 → BLE
- [ ] Google Health OAuth → HRV real
- [ ] Mock olfato con tecla en app

---

## 9. Herramientas AI para acelerar desarrollo DAT

Meta publicó plugins/skills para coding agents:

| Herramienta | Repo | Uso |
|-------------|------|-----|
| DAT iOS skills | meta-wearables-dat-ios | Cursor rules + MCP |
| DAT Android skills | meta-wearables-dat-android | Cursor rules + MCP |
| Web Apps skills | meta-wearables-webapp | Solo Display (no Gen 1) |
| Wearables MCP | `https://mcp.developer.meta.com/wearables` | `search_dat_docs` en Cursor |

**Prompt starter (oficial Meta):**

```text
Use https://wearables.developer.meta.com/docs/develop/dat/build-overview/,
then use the Wearables MCP endpoint https://mcp.developer.meta.com/wearables
to call search_dat_docs for current DAT setup guidance.
Inspect my environment and app platform first, then produce the smallest
setup checklist for SDK prerequisites, Meta AI app and glasses versions,
Developer Mode, and Mock Device Kit fallback testing.
```

---

## 10. Riesgos y mitigaciones

| Riesgo | Probabilidad | Mitigación |
|--------|--------------|------------|
| SDK en developer preview, bugs | Media | MockDeviceKit + video fallback |
| Latencia vision API > 5s | Alta | Frames cada 4s, no streaming continuo |
| Audio HFP 8kHz mono baja calidad | Media | Whisper tolera; TTS nativo Android OK |
| Jurado: "Meta ya lo hace" | Alta | Demo comparativa + olfato + HRV |
| Solo iPhone en equipo, SDK Android | Media | Backend en laptop + teléfono cámara como plan B |
| Google Health OAuth lento | Media | Mock HRV para demo |

---

## 11. Decisión final para el equipo

**Con Ray-Ban Meta Gen 1 sin display + reto "5 sentidos" + accesibilidad:**

1. **Abandonad** el pivot de ventas/CRM para el demo
2. **Mantened** M1 como proyector visual para jurado
3. **Construid** app Android con DAT como producto real
4. **Usad** Meta AI + Muse Spark solo como baseline en pitch
5. **No intentéis** Web Apps (no aplican a Gen 1)
6. **Diferenciador:** fusión vista + oído + olfato + interocepción con lenguaje espacial
7. **Google Health API** para interocepción real en v2; mock en MVP

**Marcabilidad estimada con DAT + Gen 1 real + fusión multimodal:** **9/10**

---

## 12. Referencias

- [Muse Spark announcement](https://about.fb.com/news/2026/04/introducing-muse-spark-meta-superintelligence-labs/)
- [Wearables Developer Center](https://wearables.developer.meta.com/docs/develop/)
- [DAT Build Overview](https://wearables.developer.meta.com/docs/build-overview)
- [DAT iOS GitHub](https://github.com/facebook/meta-wearables-dat-ios)
- [DAT Android GitHub](https://github.com/facebook/meta-wearables-dat-android)
- [Web Apps Toolkit](https://github.com/facebookincubator/meta-wearables-webapp)
- [Google Health API](https://developers.google.com/health?hl=es-419)
- [Meta AI Accessibility / Detailed Responses](https://www.meta.com/ai-glasses/accessibility/)

---

## Apéndice A — Prompt de fusión multimodal (borrador)

```text
Eres un asistente de navegación para una persona ciega caminando en espacio urbano.

ENTRADAS:
- Imagen POV (cámara de gafas)
- Audio ambiente transcrito: {audio_transcript}
- Olfato: {olfactory_label} (confianza: {olfactory_confidence})
- Estado corporal: pulso {hr}bpm, estrés {stress_level}/1.0

REGLAS:
1. Responde en español, máximo 2 frases si estrés > 0.7; máximo 3 si calmado.
2. Usa lenguaje egocéntrico: "a tu derecha", "a tu izquierda", "adelante", "atrás".
3. Prioriza SEGURIDAD: cruces, escaleras, obstáculos, vehículos.
4. Si olfato detecta humo/tabaco, menciónalo con dirección si la imagen lo confirma.
5. NO inventes semáforos ni señales que no veas.
6. Si preguntan "¿puedo cruzar?", responde SÍ/NO/ESPERA con razón en 1 frase.

FORMATO:
adelante: ...
izquierda: ...
derecha: ...
alerta: ... (solo si hay peligro)
```

## Apéndice B — Contexto de prompts anteriores (orquestador)

| Fecha | Decisión |
|-------|----------|
| Sesión 1 | Pivot de ventas → navegación espacial ciegos |
| Sesión 2 | Gen 1 sin display confirmado; audio > HUD |
| Sesión 3 | Integración 5 sentidos + olfato como diferenciador |
| Sesión 4 | DAT Android/iOS como vía real; Web Apps descartadas para Gen 1 |
| Sesión 5 | Muse Spark = baseline; Google Health = interocepción v2 |
