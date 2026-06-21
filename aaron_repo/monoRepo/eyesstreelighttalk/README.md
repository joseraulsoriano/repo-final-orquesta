# Meta Glasses — Asistente de Cruce Peatonal

Sistema de visión que **entiende la escena de tráfico** para decidir si es
factible cruzar. A partir de imagen/video detecta semáforos, vehículos y
personas, estima la **dirección/movimiento** de los vehículos, y fusiona todo
en un veredicto: **FACTIBLE_CRUZAR / PRECAUCIÓN / NO_CRUZAR**.

Núcleo del *companion app* del flujo:

```
[ META GLASSES ] ──(Streaming)──► [ COMPANION APP ]
       ▲                                │
       │                     (OpenCV DNN / Inferencia YOLOv4)
       │                                │
       └────────(Alerta Voz / HUD)◄─────┘
```

## Arquitectura del pipeline

```
frame ─► Detector (YOLOv4/Darknet via OpenCV DNN, multi-clase)
            │  semáforos + vehículos + personas
            ├──► ColorClassifier (HSV + posición) ── estado de cada semáforo
            ├──► Tracker (IoU) ── dirección/velocidad de cada vehículo
            ▼
        CrossingDecisionEngine (fusiona luz + tráfico, suavizado temporal)
            │  veredicto de cruce
            ▼
        emit_alert()  ──►  JSON-line (hook de voz/HUD)
```

| Módulo | Rol |
|--------|-----|
| `src/detector.py` | Detección **multi-clase** (semáforo/vehículos/persona) con YOLOv4 sobre OpenCV DNN |
| `src/color_classifier.py` | Estado del semáforo por HSV + posición vertical del lente |
| `src/tracker.py` | Tracking IoU → dirección y velocidad (ACERCÁNDOSE / IZQ / DER / …) |
| `src/crossing.py` | Fusiona semáforo + tráfico → veredicto de cruce (suavizado) |
| `src/decision.py` | Mapea estado de semáforo a comando (pasar/no pasar) |
| `src/audio.py` | **Canal de salida auditivo**: voz + tonos hacia el SDK de las gafas |
| `src/pipeline.py` | Orquesta todo y dibuja overlays |
| `src/main.py` | CLI + loop de captura (imagen/video/webcam/stream) |
| `src/config.py` | Todos los parámetros ajustables |

## Lógica de decisión de cruce

| Semáforo vehicular | Vehículos en zona de cruce | Veredicto |
|---|---|---|
| ROJO | ninguno activo | **FACTIBLE_CRUZAR** |
| ROJO | alguno acercándose (se pasó el alto) | **NO_CRUZAR** |
| VERDE | — | **NO_CRUZAR** (autos con paso) |
| AMARILLO | — | **PRECAUCIÓN** |
| sin semáforo | tráfico acercándose / despejado | **NO_CRUZAR / PRECAUCIÓN** |

> El semáforo **peatonal** (muñeco caminar/no-caminar) no está en COCO; por ahora
> se **infiere** del semáforo vehicular + tráfico. Leerlo directamente es la fase 2
> (modelo Darknet custom).

## Uso rápido (sin Docker)

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Modelos: tiny (rápido) o full (preciso, ~250MB)
bash scripts/download_models.sh            # tiny
MODEL=full bash scripts/download_models.sh # YOLOv4 completo (recomendado)

# Imagen
python -m src.main --source data/foto.jpg --output output/escena.jpg --no-display

# Video (aquí cobran sentido dirección/movimiento)
python -m src.main --source data/clip.mp4 --output output/anotado.mp4 --no-display

# Stream de las gafas
python -m src.main --source rtsp://IP/stream --no-display
```

Flags útiles: `--model full|tiny`, `--input-size 832` (detecta más lejos),
`--conf 0.3`, `--stride 2` (procesa 1 de cada N frames).

## Uso con Docker

```bash
docker compose build
MODEL=full bash scripts/download_models.sh
docker compose run --rm detector --source /app/data/clip.mp4 \
  --output /app/output/anotado.mp4 --no-display
```

## Salida

Cada cambio de veredicto confirmado se emite como línea JSON en stdout — punto de
enganche para el companion app:

```json
{"verdict": "NO_CRUZAR", "message": "No cruce", "light": "RED",
 "reasons": ["1 vehiculo(s) acercandose pese al rojo"],
 "counts": {"semaforos": 3, "vehiculos": 8, "personas": 0}}
```

## Canal de retroalimentación auditiva (`--audio`)

La companion app alerta al usuario por el altavoz de las gafas de dos formas:

| Veredicto | Voz | Tono |
|---|---|---|
| FACTIBLE_CRUZAR | "Puede cruzar" | **440 Hz** (baja = avanzar), 1 pitido |
| NO_CRUZAR | "Alto. No cruce" | **1200 Hz** (alta = detenerse), 3 pitidos |
| PRECAUCIÓN | "Precaución antes de cruzar" | 800 Hz, 2 pitidos |

```bash
python -m src.main --source data/clip.mp4 --no-display --audio both
# --audio voice|tone|both|none   --no-audio-play (solo guarda WAV)
```

**Integración con Meta Glasses:** `src/audio.py` define la interfaz
`GlassesAudioSink`. `LocalAudioSink` valida en escritorio (genera WAV reales y
los reproduce con aplay). `MetaGlassesAudioSink` es la plantilla donde van las
llamadas reales al SDK:

```python
meta_sdk.audio.tts(text)                    # voz por el altavoz de las gafas
meta_sdk.audio.play_pcm(samples, 16000)     # tono por el altavoz
```

## API HTTP — recibir video por POST

Tu parte expone un endpoint donde el agente "apunta": sube un `.mp4` y recibe el
veredicto de cruce en JSON.

```bash
# Levantar el servidor
.venv/bin/python -m uvicorn src.server:app --host 0.0.0.0 --port 8000
# Docs interactivas (Swagger): http://localhost:8000/docs
```

| Endpoint | Qué hace |
|---|---|
| `GET /health` | Chequeo de vida |
| `POST /analyze` | Recibe el video (campo `file`) y devuelve el análisis |
| `GET /annotated/{name}` | Descarga el video anotado (si `annotate=true`) |

`POST /analyze` acepta query params: `model=full\|tiny`, `input_size`, `stride`
(1 de cada N frames), `annotate=true\|false`.

```bash
curl -X POST "http://localhost:8000/analyze?model=full&stride=5" \
     -F "file=@escena.mp4"
```

Respuesta:
```json
{
  "summary": {
    "final_verdict": "FACTIBLE_CRUZAR", "final_light": "RED",
    "final_counts": {"semaforos": 2, "vehiculos": 0, "personas": 11},
    "frames_processed": 68, "duration_s": 8.05, "model": "full@608"
  },
  "verdict_changes": [
    {"t": 3.0, "verdict": "NO_CRUZAR", "light": "GREEN", "reasons": [...], "counts": {...}}
  ],
  "processing_time_s": 12.4
}
```

## Tiempo real + integración Gemini Live

Gemini Live (transporte de streaming de las gafas) acepta **máx. 1 fps** de video
(768×768) — insuficiente para escena de tráfico rápida. La solución **no** es
forzar más fps (imposible), sino **desacoplar la frecuencia de decisión de la de
frames** y comprimir el tiempo en el espacio:

```
Stream gafas (fps completo)
   ├──► YOLO + tracking (cada frame) ─────────► decisiones ≥2/seg (ruta rápida)
   │         └─ predicción de movimiento entre frames (tracker.predict)
   └──► FrameDigest (1 seg de frames → 1 mosaico 768×768) ─► Gemini Live (1 fps)
                                                              └─ contexto + voz
```

**Claves (validadas con el video real):**
- **Presupuesto de cómputo:** si la fuente da 1 fps, hay ~1 s por frame →
  `full@608` (0.78 s) **cabe**; se usa el modelo *preciso*, no `tiny`. `tiny@608`
  (11 fps) solo es necesario si hay un canal de video paralelo a fps completo.
- **Decisiones ≥2/seg:** `RealtimeController.on_frame()` (pesado, 1 fps) +
  `.tick()` (predicción, ligero) → 2 decisiones/seg. La predicción puede
  adelantar un cambio de veredicto medio segundo antes del siguiente frame.
- **Digest 1 fps:** `FrameDigestBuilder` arma un mosaico 2×2 (t0..t3) que mete el
  movimiento del segundo en una imagen → Gemini "ve" dirección a 1 fps.

```python
from src.realtime import RealtimeController, realtime_config
from src.gemini_live import GeminiLiveBridge, FrameDigestBuilder

ctrl = RealtimeController()                 # full@608 + digest + (audio opcional)
result, dec = ctrl.on_frame(frame, t)       # 1 fps: detección + decisión
dec_pred   = ctrl.tick(t + 0.5)             # +0.5s: decisión por predicción
digest     = ctrl.build_digest(caption)     # 1x/seg: mosaico para Gemini
```

**Integración real Gemini Live** (`src/gemini_live.py`, requiere
`pip install google-genai` + `GOOGLE_API_KEY`):

```python
bridge = GeminiLiveBridge()                 # modelo gemini-live-2.5-flash-preview
async with bridge.connect() as session:
    await bridge.send_digest(session, FrameDigestBuilder.to_jpeg(digest))
    async for text in bridge.responses(session):
        audio_sink.speak(text)              # voz de contexto por las gafas
```

## Próximos pasos

1. **Semáforo peatonal custom** (fase 2): modelo Darknet con clases walk/dont-walk.
2. Calibrar la "zona de cruce" y los umbrales de movimiento con video real.
3. Optimizar para el celular (cuantización / NNAPI) para tiempo real.
4. Puente del `emit_alert()` hacia TTS / HUD en el companion app.
# eyesstreelighttalk
