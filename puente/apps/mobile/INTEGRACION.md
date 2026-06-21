# App Android DAT — Integración

Scaffold de la app "cerebro" (Gen 2 + DAT → worker). Esto deja **lista la capa
determinista**; falta enchufar el hardware Meta y tu setup.

## Qué YA está hecho (capa cerebro, probada contra el worker)

| Archivo | Rol |
|---|---|
| `net/Models.kt` | Contratos JSON exactos (espejo de `shared/types/schemas.md`) |
| `net/WorkerClient.kt` | Cliente HTTP a los 6 endpoints (fusion, rag, agents, tts, transcribe-token, gemini) |
| `core/SessionState.kt` | State machine (§12) + lista de compra serializable |
| `core/SuperFlow.kt` | Orquestador de los 3 escenarios (PTT → percibe → decide → habla) |
| `dat/GlassesBridge.kt` | **Interfaz** del hardware (lo único específico de Meta) |
| `ui/MainActivity.kt` | Pantalla demo: botón PTT → un turno completo del flujo |

Los 3 escenarios del FLUJO **no son ramas distintas**: emergen de `visita_numero`
y del estado de RAG. Cambia `visita_numero` en `MainActivity` para probar cada uno:
- `1` → RAG miss → visión obligatoria (1ra visita)
- `2` → RAG hit → skip_vision, <1s (2da visita)
- experta → mismo motor; el contraste es de UX (tacto 3 min vs PTT 8s)

## Qué FALTA enchufar (tu trabajo + hardware)

### 1. Setup Meta (CHECKLIST Fase 1)
- Gafas Gen 2 emparejadas en Meta AI app · Developer Mode ON · firmware al día
- App ID en [Wearables Developer Center](https://wearables.developer.meta.com/) → `manifestPlaceholders["metaAppId"]` en `app/build.gradle.kts`
- `GITHUB_TOKEN` (Gradle baja el SDK DAT) → `gradle.properties` o env

### 2. Implementar `GlassesBridge` (reemplazar `TodoGlassesBridge`)
Forkea `samples/CameraAccess` de [meta-wearables-dat-android](https://github.com/facebook/meta-wearables-dat-android) y conecta:

| Método | Implementación DAT |
|---|---|
| `captureFrameJpegBase64()` | `stream.capturePhoto()` o último `VideoFrame` → JPEG **504×896** → base64 (el tamaño importa: a 1024px la visión tarda ~8s; a 504×896 ~5s) |
| `gps()` | `FusedLocationProviderClient` del teléfono |
| `playTts(audio)` | `audio.byteStream()` → altavoces gafas vía HFP / `AudioTrack` (consumir conforme llega) |
| `vibrate(ms)` | `Vibrator` del teléfono |
| `listenOnce()` | Mic → AssemblyAI streaming. Token: `worker.transcribeTokenRaw()`; conecta a `wss://streaming.assemblyai.com/v3/ws?token=...` PCM16 16kHz, manda `Terminate` al soltar PTT |

### 3. `WORKER_BASE_URL`
- Emulador: `http://10.0.2.2:8787` (ya configurado)
- Dispositivo físico en LAN: `http://<ip-de-tu-mac>:8787`
- Producción: la URL `https://____.workers.dev` (tras `wrangler deploy`)

## Probar SIN gafas (recomendado primero)
**MockDeviceKit** alimenta un mp4 de super y emite frames por la misma API DAT:
```kotlin
mockKit.enable()
val glasses = mockKit.pairRaybanMeta()
glasses.services.camera.setCameraFeed(videoMp4Uri)   // h.264/h.265
```
Implementa `GlassesBridge` sobre esa sesión mock y el flujo completo corre en el
emulador, contra `wrangler dev`, sin hardware. Cuando llegue Gen 2, solo cambias
la fuente del frame.

## Modo Escaneo (Gemini Live, opcional)
`worker.geminiLiveToken(...)` devuelve `{token, ws_url, model}`. Conecta con el
**cliente oficial de Gemini Live** (no WS crudo — el transporte del token efímero
lo maneja el SDK). Solo para estante denso; el batch `/fusion` sigue para confirmar.

## ⚠️ Notas de honestidad
- Este scaffold **no se compiló** aquí (sin Android SDK ni deps DAT en el entorno).
  La capa cerebro es Kotlin/OkHttp estándar; las **coords del SDK DAT y la URL de
  GitHub Packages en `settings.gradle.kts` deben verificarse** contra el sample.
- `TodoGlassesBridge` lanza `NotImplementedError` a propósito hasta que lo enchufes.
