# Investigación: Cámara Ray-Ban Meta — Interno vs Externo (Developer)

> **Hardware de referencia:** Ray-Ban Meta Gen 1 y Gen 2 (sin display)  
> **SDK:** [Wearables Device Access Toolkit (DAT)](https://wearables.developer.meta.com/docs/develop/) v0.7  
> **Samples:** [meta-wearables-dat-android](https://github.com/facebook/meta-wearables-dat-android) · [meta-wearables-dat-ios](https://github.com/facebook/meta-wearables-dat-ios)

---

## 1. Mapa mental: dos mundos de la cámara

```
┌─────────────────────────────────────────────────────────────────┐
│  INTERNO (Meta controla — usuario final / Meta AI)              │
│                                                                 │
│  Sensor 12MP → procesador AR1 → memoria gafas → BT → Meta AI app│
│  • Botón captura / "Hey Meta, take a photo"                     │
│  • Video hasta 3K (Gen 2) guardado en gafas → import a teléfono │
│  • Live AI / Muse Spark: "describe lo que veo"                  │
│  • LED blanco = grabando (privacidad bystander)                 │
│                                                                 │
│  Tú NO puedes inyectar nada aquí ni interceptar este pipeline   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  EXTERNO (Developer — DAT en TU app móvil)                      │
│                                                                 │
│  Sensor 12MP → stream comprimido → Bluetooth Classic → tu app  │
│  • VideoStream: frames continuos (configurable)                 │
│  • capturePhoto(): JPEG/HEIC mientras stream activo             │
│  • Tú envías bytes a OpenAI/Gemini/tu modelo                    │
│  • Tú devuelves audio TTS → altavoces gafas (vía HFP)         │
│                                                                 │
│  Flujo paralelo a Meta AI — no lo reemplaza                    │
└─────────────────────────────────────────────────────────────────┘
```

**Regla de oro:** la cámara **genera** imagen/video hacia afuera. **No acepta** input visual (no puedes "inyectarle" una imagen a las gafas como si fueran pantalla).

---

## 2. Hardware interno (lo que hay físicamente en las gafas)

| Spec | Gen 1 | Gen 2 |
|------|-------|-------|
| Sensor | 12 MP ultra-wide | 12 MP ultra-wide (sensor mejorado) |
| FOV | Ultra-wide POV (pecho/cara nivel) | Igual, mejor low-light |
| Video nativo (botón/Hey Meta) | 1080p @ 30fps, ~3 min | **3K @ 30fps**, 1080p @ 60fps, ~5 min |
| Procesador | Snapdragon AR1 Gen 1 | Snapdragon AR1 Gen 1+ |
| Almacenamiento | Memoria interna en gafas | Igual |
| Estabilización | Básica | Hyperlapse, slow-mo, estabilización ajustable |
| LED privacidad | Sí (blanco al grabar) | Sí |
| Livestream FB/IG | Gen 1 sí | **Gen 2 no** |
| Ajuste auto exposición | Sí (Meta AI app) | Sí |

**Qué hace la cámara sola (sin tu app):**
- Captura foto/video al botón lateral o voz
- Auto-ajusta exposición al ambiente
- Guarda en memoria interna → sync a Meta AI app → rol de cámara del teléfono
- Formatos nativos: JPEG/HEIC foto, MP4/HEVC video ([Meta Help](https://www.meta.com/help/ai-glasses/272319252352130/))

**Qué NO hace sola:**
- No procesa IA on-device (el cómputo pesado va al teléfono/nube Meta)
- No stream continuo a terceros sin DAT session activa

---

## 3. Qué genera la cámara vía DAT (lo que TÚ recibes)

### 3.1 Modos de salida

| Modo | API | Cuándo | Output |
|------|-----|--------|--------|
| **Video stream** | `session.addStream()` → `stream.videoStream` | Sesión DAT activa | `VideoFrame` continuo |
| **Foto** | `stream.capturePhoto()` | Solo mientras stream en `STREAMING` | `PhotoData` (bytes) |

### 3.2 Resoluciones de stream (9:16 vertical — POV de caminar)

| Nivel | Píxeles | Cuándo usar |
|-------|---------|-------------|
| `HIGH` | **720 × 1280** | Detalle máximo (más compresión BT) |
| `MEDIUM` | **504 × 896** | **Recomendado para vision AI** |
| `LOW` | **360 × 640** | Ahorro batería/ancho de banda |

Fuente: [Android integration guide](https://wearables.developer.meta.com/docs/develop/dat/build-integration-android/)

### 3.3 Frame rate permitido

Valores exactos: **`2`, `7`, `15`, `24`, `30` FPS** — no arbitrary.

**Recomendación para navegación ciega:**
- **2–7 FPS** si solo mandas 1 de cada N frames a GPT (cada 3–5 s)
- **15–24 FPS** si quieres preview fluido en pantalla del teléfono
- Meta documenta: *"Lower resolution and frame rate usually produce better visual quality per frame over Bluetooth"*

### 3.4 Codecs y formato de frame

| Plataforma | Codec stream | Foto |
|------------|--------------|------|
| **Android** | Raw o **HEVC (hvc1)** comprimido | JPEG |
| **iOS** | `VideoCodec.raw` o `hvc1` | JPEG o HEIC |

Community wrapper [expo-meta-wearables-dat](https://github.com/circus-kitchens/expo-meta-wearables-dat) expone:

```typescript
VideoFrameMetadata: { timestamp, width, height, isCompressed? }
PhotoData: { filePath, format, timestamp, width?, height?, base64? }
StreamingResolution: "high" | "medium" | "low"
VideoCodec: "raw" | "hvc1"
```

Cada `VideoFrame` = **buffer de video crudo o comprimido** + metadata (timestamp, dimensiones).

### 3.5 Compresión y ancho de banda (límite crítico)

El stream va por **Bluetooth Classic** (no WiFi directo gafas→nube).

Meta aplica **escalera automática de calidad:**
1. Si falta ancho de banda → baja resolución un nivel (HIGH→MEDIUM→LOW)
2. Si sigue justo → baja FPS (ej. 30→24), **nunca bajo 15 FPS**
3. Compresión **por frame** adaptativa — la imagen puede verse peor de lo que dice la resolución

**Implicación práctica:** para vision LLM, a veces **MEDIUM @ 15fps** da mejor JPEG decodificado que HIGH @ 30fps.

---

## 4. Ciclo de vida: cuándo la cámara está "tuya"

```
Registration (one-time, Meta AI app)
    ↓
Permission CAMERA (Meta AI app deeplink — allow once/always/deny)
    ↓
Wearables.createSession() → session.start()
    ↓
session.addStream(StreamConfiguration) → stream.start()
    ↓
StreamState: STOPPED → STARTING → STARTED → STREAMING
    ↓
stream.videoStream.collect { frame → TU CÓDIGO }
stream.capturePhoto() → PhotoData
    ↓
stream.stop() → session.stop()
```

### Restricciones de sesión

| Regla | Impacto |
|-------|---------|
| **Una sesión activa a la vez** en el dispositivo | Meta AI y tu app compiten — no simultáneo |
| Sesión pausa si cierran bisagras, se quitan gafas, tap | Debes manejar `PAUSED` / `STOPPED` |
| `capturePhoto()` solo en `STREAMING` | No foto suelta sin stream |
| **No background streaming** | App debe estar foreground ([expo wrapper](https://github.com/circus-kitchens/expo-meta-wearables-dat)) |
| Meta AI app **obligatoria** instalada | Conductor BT — no se salta |

### Estados que debes observar

**Session:** `IDLE` → `STARTING` → `STARTED` → `PAUSED` → `STOPPING` → `STOPPED`

**Stream:** `STOPPED` → `STARTING` → `STARTED` → `STREAMING` → `STOPPING` → `STOPPED` → `CLOSED`

---

## 5. Qué puedes INYECTAR vs qué NO

### NO puedes inyectar (límites duros)

| Acción | Por qué |
|--------|---------|
| Enviar imagen **a** la cámara/lente | No es display; Gen 2 no tiene pantalla |
| Modificar exposición/focus desde DAT | Controlado por firmware Meta |
| Interceptar pipeline Meta AI | Meta no expone hooks |
| Usar "Hey Meta" como trigger custom | Wake word reservado |
| Stream sin sesión DAT | No hay API pasiva de cámara |
| Correr procesamiento **en** las gafas | No hay runtime developer en device |
| Acceso directo a memoria interna de fotos | Solo vía Meta AI app import |
| Background stream con app cerrada | SDK no lo soporta |

### SÍ puedes inyectar (en tu pipeline downstream)

Todo lo que hagas **después** de recibir `VideoFrame` o `PhotoData`:

| Inyección | Ejemplo |
|-----------|---------|
| **Prompt al LLM** | "Describe para persona ciega: izq, der, adelante" |
| **Contexto multimodal** | Audio Whisper + olfato ESP32 + HRV en el mismo prompt |
| **Historial de frames** | Últimos 3 frames para detectar movimiento |
| **Reglas de seguridad** | "Si detectas cruce, di ESPERA" |
| **TTS de vuelta** | Texto → altavoces gafas (HFP playback) |
| **Almacenamiento** | Guardar frames en teléfono/cloud con consentimiento |
| **WebSocket a laptop** | M1 GlassesView para jurado |
| **Cualquier CV clásico** | OCR, YOLO, barcode — en el teléfono |

```
Cámara gafas ──genera──► Frame bytes ──inyectas──► [TU PIPELINE] ──► Output
                              │
                              ├── OpenAI GPT-4o vision
                              ├── Google Gemini Flash
                              ├── ONNX en teléfono (offline)
                              ├── Tesseract OCR
                              └── Custom fusion con olfato/HRV
```

---

## 6. Qué puedes CREAR con la cámara (casos concretos)

### Tier 1 — Factible en hackathon (1–2 días)

| Producto | Input cámara | Output |
|----------|--------------|--------|
| **Guía espacial ciegos** (vuestro caso) | Frame cada 3s | TTS: izq/der/adelante |
| **OCR manos libres** | capturePhoto | Lee cartel/señal en voz alta |
| **"¿Qué es esto?"** | Foto bajo demanda | Identificación objeto |
| **Detector de cruce** | Frames + prompt seguridad | SÍ/NO/ESPERA |
| **Asistente de compras** | Foto estante | Ranking productos (Muse Spark hace similar) |
| **Traducción visual** | OCR + translate | Lee texto traducido (Meta tiene live translation aparte) |

### Tier 2 — Con más tiempo

| Producto | Notas |
|----------|-------|
| Stream continuo + tracking | Comparar frames N vs N-1 para "algo se acerca" |
| Mapa mental de ruta | GPS teléfono + descripciones acumuladas |
| Alerta obstáculo | Detección movimiento en zona central del frame |
| Asistente de campo | Fotos + notas de voz → CRM (vuestro MCP original) |
| Realidad aumentada audio | "El elevador que mencioné sigue a tu derecha" (memoria) |

### Tier 3 — Research / difícil en BT

| Producto | Bloqueo |
|----------|---------|
| SLAM indoor preciso | Latencia + compresión BT |
| 30 FPS vision en tiempo real | Ancho de banda |
| Reconocimiento facial continuo | Privacidad + compute |
| AR overlays en lente | Requiere Display + MWDATDisplay |

---

## 7. Meta AI nativo vs tu app DAT (competencia/coexistencia)

### Lo que Meta AI hace con la cámara (interno, cerrado)

| Feature | Comando / trigger | Procesamiento |
|---------|-------------------|---------------|
| Foto | Botón / "Hey Meta, take a photo" | Gafas → teléfono galería |
| Video | Botón / "Hey Meta, take a video" | Hasta 3K Gen 2 |
| Describe escena | "Hey Meta, describe..." + Detailed Responses | **Muse Spark** multimodal ([abril 2026](https://about.fb.com/news/2026/04/introducing-muse-spark-meta-superintelligence-labs/)) |
| Live AI | App Meta AI apuntando cámara | Tiempo real en app (mayo 2026) |
| Visual Q&A | Pregunta sobre lo que ves | Nube Meta |
| Be My Eyes | "Hey Meta, Be My Eyes" | Video a voluntario humano |

### Privacidad de datos cámara ([The Verge, abril 2026](https://www.theverge.com/news/658602/meta-ray-ban-privacy-policy-ai-training-voice-recordings))

- Fotos del **botón** → rol cámara teléfono, **no** entrenamiento Meta (según Meta)
- Si pasas foto a **Meta AI / terceros** → aplican políticas de ese producto
- Voz "Hey Meta" → puede guardarse hasta 1 año para training
- **Tu app DAT:** tú eres responsable de consentimiento y destino de frames

### Coexistencia en demo

1. **Baseline:** Meta AI Detailed Responses en Gen 2
2. **Vuestro:** App DAT con prompt espacial + fusión sentidos
3. **No corren a la vez** (una sesión) — alternar en pitch

---

## 8. Pipeline recomendado para "Sentido" (Gen 2)

```
┌──────────────┐     ┌─────────────────┐     ┌──────────────────┐
│ Gen 2 camera │────►│ DAT Stream      │────►│ Decodificar frame│
│ 12MP POV     │ BT  │ MEDIUM @ 15fps  │     │ (HEVC→Bitmap)    │
└──────────────┘     └─────────────────┘     └────────┬─────────┘
                                                      │
                    ┌─────────────────────────────────┼─────────────────────┐
                    │                                 ▼                     │
                    │  Cada 3s: sample frame ──► Base64 ──► Vision API      │
                    │                                 │                     │
                    │  Paralelo: mic HFP ──► Whisper ──┤                     │
                    │  Paralelo: ESP32 ──► olfato ────┤──► Fusion prompt    │
                    │  Paralelo: watch ──► HRV ───────┘                     │
                    │                                 │                     │
                    │                                 ▼                     │
                    │                    "Derecha: elevador. Olor tabaco."   │
                    │                                 │                     │
                    │                                 ▼                     │
                    │                    TTS → altavoces Gen 2              │
                    └───────────────────────────────────────────────────────┘
                    │
                    └── WebSocket opcional → M1 GlassesView (jurado)
```

### Config óptima documentada

```kotlin
StreamConfiguration(
    videoQuality = VideoQuality.MEDIUM,  // 504×896
    frameRate = 15,                       // balance calidad/BT
)
// Samplear 1 frame cada 3s para API (no mandar los 15 fps a OpenAI)
```

---

## 9. MockDeviceKit — desarrollo sin gafas

```kotlin
mockKit.enable()
val glasses = mockKit.pairRaybanMeta()
glasses.services.camera.setCameraFeed(videoUri)      // MP4 calle
glasses.services.camera.setCapturedImage(imageUri)   // PNG test
```

Formatos mock soportados:
- **Video:** h.264, h.265
- **Imagen:** JPEG, PNG

Útil para: CI, demo jurado con video controlado, desarrollo sin Gen 2 encima.

---

## 10. IMU / sensores (no es cámara, pero complementa)

DAT también expone **IMU** (acelerómetro, giroscopio, magnetómetro) en algunos paths — útil para **propiocepción** ("giraste a la izquierda").

Web Apps Display tienen `DeviceMotionEvent` — **no aplica a Gen 2 sin display**.

Para Gen 2: sensores vía DAT sensor API o GPS/brújula del teléfono en bolsillo.

---

## 11. Límites: hasta dónde llega

### Interno (Meta / hardware)

| Límite | Valor |
|--------|-------|
| Resolución sensor | 12 MP |
| Video nativo max | 3K @ 30 (Gen 2) |
| Compute on-glasses | Mínimo (capture + encode + BT) |
| Storage | Limitada, sync a teléfono |
| Display | **No (Gen 2)** |

### Externo (DAT developer)

| Límite | Valor |
|--------|-------|
| Stream max res | 720×1280 |
| Stream max FPS | 30 (efectivo ~15–24 con BT) |
| Foto | JPEG/HEIC, solo durante stream |
| Latencia típica | 100–500ms por frame + BT |
| Background | No |
| Sesiones concurrentes | 1 |
| Inyección a cámara | **No** |
| Procesamiento IA | **100% en tu teléfono/backend** |

### Tu producto (realista)

| Capacidad | Alcanzable |
|-----------|------------|
| Narración cada 3–5s | Sí |
| Tiempo real sub-segundo | No fiable vía BT |
| "¿Puedo cruzar?" | Sí con disclaimer |
| Olfato/HRV fusion | Sí (externo al stream cámara) |
| Demo Gen 2 en vivo | Sí con DAT |

---

## 12. Rutas de implementación según stack

| Stack | Cámara real Gen 2 | Esfuerzo |
|-------|-------------------|----------|
| **Android Kotlin + DAT** | Sí — referencia oficial | 1–2 días MVP |
| **iOS Swift + DAT** | Sí | 1–2 días MVP |
| **React Native** ([expo-meta-wearables-dat](https://github.com/circus-kitchens/expo-meta-wearables-dat)) | Sí — wrapper community | 1–2 días |
| **M1 React web solo** | No — webcam teléfono/laptop | Horas (simulado) |
| **Meta AI solo** | Sí pero cerrado | 0 código |

**Si ya tienen M1 React:** pueden reusar UI en laptop + app DAT mínima solo para cámara/audio real.

---

## 13. Checklist pre-demo Gen 2

- [ ] Meta AI app v272+ (Muse Spark rollout)
- [ ] Gafas firmware v20+
- [ ] Developer Mode ON
- [ ] Proyecto registrado en Wearables Developer Center (o Dev Mode con ID=0)
- [ ] Permiso cámara granted (Meta AI deeplink)
- [ ] Sesión DAT → stream MEDIUM @ 15fps
- [ ] Decodificar frame → base64 → vision API
- [ ] TTS → speakers (probar volumen en ambiente ruidoso)
- [ ] Plan B: MockDeviceKit + video MP4 calle

---

## 14. Respuesta directa a tus preguntas

| Pregunta | Respuesta |
|----------|-----------|
| **¿Qué hace la cámara?** | Captura POV ultra-wide; nativamente foto/video a galería; vía DAT stream de frames a tu app |
| **¿Qué tenemos (developer)?** | Stream 360p–720p, 2–30fps, JPEG/HEIC snapshot, bytes raw/HEVC |
| **¿Qué podemos inyectarle?** | **Nada a la cámara.** Sí inyectar prompts/contexto al procesar sus frames |
| **¿Qué podemos crear?** | Guía espacial, OCR, Q&A visual, alertas, field tools — todo downstream |
| **¿Interno vs externo?** | Interno = Meta AI + botón. Externo = DAT stream a tu app |
| **¿Qué genera la cámara?** | `VideoFrame` (stream) + `PhotoData` (foto); no genera texto ni audio solo |

---

## Referencias

- [DAT Build Overview](https://wearables.developer.meta.com/docs/build-overview)
- [Android Camera Integration](https://wearables.developer.meta.com/docs/develop/dat/build-integration-android/)
- [DAT iOS GitHub](https://github.com/facebook/meta-wearables-dat-ios)
- [DAT Android GitHub + CameraAccess sample](https://github.com/facebook/meta-wearables-dat-android)
- [expo-meta-wearables-dat (tipos PhotoData/VideoFrame)](https://github.com/circus-kitchens/expo-meta-wearables-dat)
- [Meta camera capture help](https://www.meta.com/help/ai-glasses/272319252352130/)
- [Muse Spark + Live AI](https://about.fb.com/news/2026/04/introducing-muse-spark-meta-superintelligence-labs/)
- [Meta camera privacy policy](https://www.theverge.com/news/658602/meta-ray-ban-privacy-policy-ai-training-voice-recordings)
