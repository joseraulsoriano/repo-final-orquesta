# Alineación Puente ↔ eyesstreelighttalk (módulo Cruce Peatonal)

> Fuente de verdad compartida entre los dos equipos. Define cómo los dos sistemas
> —que hoy son distintos— orquestan **las mismas** Ray-Ban Meta Gen 2 sin pelearse,
> con un solo contrato de salida. Léelo antes de tocar cualquiera de los dos repos.

Repos:
- **Puente** — `hackplatanus/puente/` (Worker TS + App Android DAT). Caso: súper para personas ciegas.
- **eyesstreelighttalk** — `github.com/una-linea-a-la-vez/eyesstreelighttalk` (Python, YOLOv4 + OpenCV DNN). Caso: ¿puedo cruzar la calle?

---

## 1. Qué es cada sistema

| | eyesstreelighttalk | Puente |
|---|---|---|
| Lenguaje | Python (OpenCV DNN + YOLOv4) | TypeScript (Cloudflare Worker) + Android Kotlin |
| Caso de uso | Cruce peatonal: veredicto `FACTIBLE_CRUZAR / PRECAUCION / NO_CRUZAR` | Súper: Sentido / Producto / lista / RAG / Hermes |
| Cómputo | **Local/edge** (YOLO por frame, ~0.8 s `full@608`) | **Nube** (visión Claude batch, RAG, Hermes) |
| Latencia | crítica, decisión ≥2/seg, alerta <2 s | PTT→TTS ≤8 s, alerta <2 s |
| Salida | `JSON-line {verdict,message,light,reasons,counts}` + voz/tono | `{speech, structured, spatial_tags, alert, module}` + TTS |
| Estado glasses | `MetaGlassesAudioSink` = **stub** | App `mobile-ios` (Swift + MWDAT) con SuperFlow + módulo cruce |

**Decisión de integración (elegida):** mantener eyesstreelighttalk como **servicio Python aparte en la LAN**. No se reescribe el CV; conserva latencia <2 s; la app `mobile-ios` le relaya frames por WebSocket. El cruce es **un módulo más** de la plataforma modular de Puente, junto al SuperFlow.

---

## 2. Blockers de Gen 2 / DAT (lo que ambos deben respetar)

1. **Gen 2 NO expone RTSP.** El `--source rtsp://IP/stream` del README de eyesstreelighttalk **no aplica** a Gen 2. La única vía sancionada para sacar frames es **DAT sobre Bluetooth en iOS** (JPEG downstream, fps limitado). → eyesstreelighttalk recibe frames por **WebSocket** desde la app iOS, no por RTSP.
2. **Una sola sesión DAT activa** (`puente/CLAUDE.md` §2). **La app iOS es la única dueña de la sesión** y enruta frames al módulo activo.
3. **Gen 2 es solo audio** (sin HUD). Los overlays/`cv2.imshow` de eyesstreelighttalk son **solo debug de escritorio**. En gafas reales sobreviven únicamente `speak()` (TTS) y `play_tone()` (PCM). No construir HUD en el MVP.
4. **Cámara solo downstream**, no interceptar "Hey Meta", Meta AI app = conductor BT obligatorio.

---

## 3. Arquitectura convergente

```
                         ┌─ módulo SÚPER  → Cloudflare Worker  (Claude · RAG · Hermes)
Gen 2 ──DAT/BT──► mobile-ios ──┤   POST /fusion/describe, /rag/query, /agents/super, /gemini/live-token
 (1 sesión:                    │
  cam+mic+altavoz)             └─ módulo CRUCE → eyesstreelighttalk (laptop LAN, YOLO)
                               │      WS frames JPEG ──►  ◄── verdict (contrato Puente)
                               │
        ◄──── un solo path de salida: speak(text)/play_tone() → altavoz de las gafas
```

- La app Android **fan-out**: el frame del DAT va al módulo activo (Súper o Cruce), nunca a los dos.
- Los dos módulos devuelven **el mismo contrato** (§4). La app no necesita saber de qué módulo vino para hablarlo.
- **Gemini Live**: el worker **ya** expone `POST /gemini/live-token` (token efímero, el teléfono conecta directo al WS de Google). El `GeminiLiveBridge` de eyesstreelighttalk debe consumir **ese mismo token**, no una `GOOGLE_API_KEY` local, para que las credenciales vivan en un solo lugar.

---

## 4. Contrato de salida unificado (el "pegamento")

Ambos módulos emiten exactamente esta forma (la que ya produce `POST /fusion/describe`):

```json
{
  "speech": "Alto. No cruce, viene un vehículo.",   // texto ES-MX para TTS, SIN tags
  "structured": { /* SceneJSON | ProductJSON | CruceJSON */ },
  "spatial_tags": ["[SPATIAL:adelante:vehiculo]"],   // se quitan ANTES del TTS
  "alert": true,                                      // dispara vibración del teléfono
  "module": "cruce"                                   // "sentido" | "producto" | "cruce"
}
```

### `structured` para el módulo cruce (`CruceJSON`)

Es el payload nativo de eyesstreelighttalk, anidado bajo `structured`:

```json
{
  "verdict": "NO_CRUZAR",        // FACTIBLE_CRUZAR | PRECAUCION | NO_CRUZAR | EVALUANDO
  "light":   "RED",
  "reasons": ["1 vehiculo(s) acercandose pese al rojo"],
  "counts":  { "semaforos": 3, "vehiculos": 8, "personas": 0 }
}
```

### Reglas de mapeo (verdict → contrato)

| verdict | speech (ES-MX, para el oído) | alert | tono (Gen 2) |
|---|---|---|---|
| `FACTIBLE_CRUZAR` | "Puede cruzar." | `false` | 440 Hz ×1 |
| `PRECAUCION` | "Precaución antes de cruzar." | `true` | 800 Hz ×2 |
| `NO_CRUZAR` | "Alto. No cruce." (+ razón si la hay) | `true` | 1200 Hz ×3 |
| `EVALUANDO` | "" (silencio) | `false` | — |

- **`alert`** = `true` para `PRECAUCION` y `NO_CRUZAR` → la app vibra el teléfono además de hablar.
- **`spatial_tags`**: se deriva de la dirección del tracker (`ACERCANDOSE`/IZQ/DER) → `[SPATIAL:direccion:vehiculo]`. Formato único de Puente; **nunca** `[POINT:x,y]`. Se quitan antes del TTS.
- **Solo emitir al cambiar el veredicto confirmado** (anti-flicker), igual que hoy hace `emit_alert` con `crossing.changed`.

> Implementación de referencia: `src/puente_contract.py` (mapeo) y `src/ws_bridge.py` (servicio WS) en eyesstreelighttalk.

---

## 5. Canal de audio en Gen 2

El `GlassesAudioSink` de eyesstreelighttalk mapea limpio al path de Puente:

| eyesstreelighttalk | Puente / DAT |
|---|---|
| `sink.speak(text)` | la app Android pasa `speech` al altavoz vía DAT TTS (o el worker `/tts` → PCM → gafas) |
| `sink.play_tone(samples)` | la app Android reproduce el PCM del tono por el altavoz vía DAT |

En la arquitectura elegida, eyesstreelighttalk **no** habla directo a las gafas: devuelve el contrato por WS y **la app Android** ejecuta `speak`/`tono`. El `MetaGlassesAudioSink` stub queda como ruta alterna (si algún día Python tuviera acceso directo al SDK).

---

## 6. Disclaimer (obligatorio en ambos)

Puente y el módulo de cruce son **apoyo complementario**, no sustituyen bastón, perro guía ni certificación médica. El disclaimer va en el onboarding, **no** en cada alerta de cruce (sería ruidoso y peligroso en tiempo real).

---

## 7. Plan de pruebas con Gen 2 reales (modo dev)

Pre-requisito: gafas emparejadas en la Meta AI app + **Developer Mode activado**.

1. **Worker arriba y verificable**
   ```bash
   cd puente/backend/worker
   npx wrangler login          # interactivo (navegador) — una vez
   npx wrangler deploy
   # verificar contrato:
   curl -X POST https://<tu-worker>.workers.dev/fusion/describe \
     -H 'content-type: application/json' \
     -d '{"image_base64":"<jpeg b64>","module":"sentido","locale":"es-MX"}'
   ```
2. **Servicio de cruce en la laptop (LAN)**
   ```bash
   cd eyesstreelighttalk
   python3 -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   MODEL=full bash scripts/download_models.sh
   python -m src.ws_bridge --host 0.0.0.0 --port 8765   # recibe frames, devuelve contrato Puente
   ```
3. **Validar el contrato sin gafas** (mientras se arma la app): mandar un JPEG por WS y confirmar que vuelve `{speech, structured, spatial_tags, alert, module:"cruce"}`.
4. **App `mobile-ios` (Swift + MWDAT)**: una sola sesión DAT; switch de módulo Súper/Cruce; fan-out de frames; ejecutar `speak`/tono del contrato por el altavoz de las gafas.
5. **E2E con gafas**: caminar a un cruce → la app manda frames al servicio → veredicto → voz+tono+vibración en <2 s.

SLA objetivo del cruce: alerta **<2 s** total (`puente/CLAUDE.md` §11).

---

## 8. Estado de "subir todo" (deploy / push)

| Destino | Estado | Cómo se verifica |
|---|---|---|
| Worker (Cloudflare) | requiere `wrangler login` (interactivo) antes de `deploy` | `curl` a `/fusion/describe` y `/gemini/live-token` → 200 |
| eyesstreelighttalk | rama `puente-integracion` (no `main`) | el servicio arranca y emite el contrato |
| Código Puente | **`hackplatanus/` no es repo git** — sin remoto local | pendiente: decidir `git init`+remoto o ubicación del repo |

---

## 9. Pendientes / próximos pasos

1. Módulo cruce en `mobile-ios`: switch de módulo + fan-out de frames del DAT al servicio WS + ejecutar `speak`/tono del contrato. **Hecho.**
2. Derivar `[SPATIAL:...]` real desde la dirección del tracker en `puente_contract.py`.
3. Que `GeminiLiveBridge` consuma el token de `/gemini/live-token` en vez de `GOOGLE_API_KEY` local.
4. Calibrar zona de cruce y umbrales con video real de las gafas (fps de DAT, no de webcam).
5. Resolver el repositorio git de `hackplatanus` para poder versionar Puente.
