# Verificación E2E — Puente Worker

Ejecutar con worker local en `:8787`:

```bash
cd puente/backend/worker && npx wrangler dev
```

Si `WORKER_API_KEY` está en `.dev.vars`, añadir a cada curl:

```bash
-H "x-puente-key: $WORKER_API_KEY"
```

## 1. Transcribe token

```bash
curl -s -X POST http://localhost:8787/transcribe-token | head -c 200
```

Esperado: JSON con `"token"`.

## 2. TTS

```bash
curl -s -X POST http://localhost:8787/tts \
  -H "content-type: application/json" \
  -d '{"text":"Hola Puente, prueba de voz."}' \
  -o /tmp/puente-tts.mp3 && file /tmp/puente-tts.mp3
```

Esperado: `Audio file` / MPEG.

## 3. RAG — 2da visita (hit)

```bash
curl -s -X POST http://localhost:8787/rag/query \
  -H "content-type: application/json" \
  -d '{"query":"¿dónde está la leche?","super_id":"walmart_portales","visita_numero":2}'
```

Esperado: `"hit":true`, `"skip_vision":true`, pasillo 7.

## 4. RAG — 1ra visita (miss forzado)

```bash
curl -s -X POST http://localhost:8787/rag/query \
  -H "content-type: application/json" \
  -d '{"query":"leche","super_id":"walmart_portales","visita_numero":1}'
```

Esperado: `"hit":false`.

## 5. Fusion describe (requiere imagen)

Desde raíz del repo (si existe `frame.jpg`):

```bash
IMG=$(base64 -i frame.jpg | tr -d '\n')
curl -s -X POST http://localhost:8787/fusion/describe \
  -H "content-type: application/json" \
  -d "{\"image_base64\":\"$IMG\",\"module\":\"sentido\",\"transcript\":\"¿qué hay adelante?\",\"super_id\":\"walmart_portales\"}" \
  | head -c 500
```

Esperado: JSON con `speech`, `structured`, `alert`.

## 6. Agents super (recall)

```bash
curl -s -X POST http://localhost:8787/agents/super \
  -H "content-type: application/json" \
  -d '{"transcript":"¿qué me falta?","action":"recall","session_state":{"lista_compra":[{"item":"leche","status":"pending"}]},"user_md":"María","memory_md":""}' \
  | head -c 400
```

Esperado: JSON con `speech`, `session_state`.

Esperado: JSON con `speech`, `session_state`.

## 8. Cruce peatonal (eyesstreelighttalk WS)

Con el bridge en LAN (`external/eyesstreelighttalk`):

```bash
cd external/eyesstreelighttalk
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
MODEL=full bash scripts/download_models.sh   # primera vez
python -m src.ws_bridge --host 0.0.0.0 --port 8765
```

Prueba con imagen (requiere `websocat` o script Python):

```bash
python3 - <<'PY'
import asyncio, base64, json, websockets
async def main():
    with open("frame.jpg","rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    async with websockets.connect("ws://127.0.0.1:8765") as ws:
        await ws.send(json.dumps({"image_base64": b64}))
        print(await ws.recv())
asyncio.run(main())
PY
```

Esperado: JSON con `"module":"cruce"`, `structured.verdict`, `speech` (si cambió veredicto).

## 9. App móvil

1. `EXPO_PUBLIC_WORKER_BASE_URL=http://<IP-LAN>:8787` en `mobile-rn/.env`
2. Dispositivo físico + gafas Gen 2 (simulador no sirve para DAT real)
3. Mantener PTT → verificar log `[habla]` y audio

## 10. Deploy Worker (Cloudflare)

```bash
cd puente/backend/worker
npx wrangler login          # una vez, interactivo
npx wrangler deploy
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put ASSEMBLYAI_API_KEY
npx wrangler secret put ELEVENLABS_API_KEY
curl -s https://<tu-worker>.workers.dev/health
```

Actualizar `PUENTE_WORKER_BASE_URL` en `apps/mobile-ios/Config/Secrets.xcconfig`.

## 11. Pruebas hardware — iOS nativo + Meta DAT + Ray-Ban Gen 2

**App principal:** `puente/apps/mobile-ios` (sin Metro, sin Expo).

### Pre-requisitos (una vez)

| Paso | Acción |
|------|--------|
| Meta AI | Gafas emparejadas, firmware al día, **Developer Mode** ON |
| Wearables Center | App `ai.puente.app` registrada; iPhone en release channel de prueba si aplica |
| Mac | Worker en LAN accesible desde el iPhone (misma WiFi o hotspot del Mac) |
| Xcode | Team ID configurado; `Secrets.xcconfig` con IP LAN actual |

### Arranque de servicios (3 terminales)

```bash
# T1 — Worker (obligatorio para visión/voz)
cd puente/backend/worker
npx wrangler dev --ip 0.0.0.0 --port 8787

# T2 — Cruce YOLO (solo modo cruce)
cd external/eyesstreelighttalk
source .venv/bin/activate   # pip install -r requirements.txt
python -m src.ws_bridge --host 0.0.0.0 --port 8765

# T3 — Comandos Mac (solo modo Mac)
cd infra/myeyescantalk && npm run command
```

### Verificar red antes de abrir la app

En el **Safari del iPhone** (no en el Mac):

```
http://<IP-MAC>:8787/health
```

Esperado: `{"ok":true,"anthropic":true,...}`. Si falla con timeout, actualiza `Secrets.xcconfig` y **rebuild** en Xcode.

IP actual del Mac (puede cambiar al cambiar de red):

```bash
ipconfig getifaddr en0
```

### Build e instalar en iPhone

```bash
cd puente/apps/mobile-ios
xcodegen generate
open Puente.xcodeproj
```

1. Selecciona tu **iPhone físico** (no simulador).
2. Product → Clean Build Folder.
3. Run (⌘R).
4. Si pide confianza: Ajustes → General → VPN y gestión de dispositivos.

### Checklist en la app (orden recomendado)

#### A. Sesión DAT

1. Abre Puente → icono gafas (Gestor de sesión DAT).
2. **Registro Meta:** si dice `unregistered`, pulsa «Registrar app en Meta» → Meta AI → acepta permisos → vuelve con deeplink `puente://`.
3. **Dispositivo:** debe aparecer Ray-Ban con `linkState=connected`, `compatibility=compatible`.
4. **Stream:** estado `streaming`, frames > 0, «Frame reciente: Sí».
5. Preview de cámara visible en pantalla.

Logs OK en Xcode:

```
[stream] arrancado
[stream] frame #1 …
[init] worker OK anthropic=true …
```

#### B. Modo super (default)

1. Banner verde «SUPER — di oye o hola ayúdame».
2. Tras ~5 s: descripción inicial del entorno por voz en las gafas.
3. Di **«oye, ¿qué hay adelante?»** → escucha → respuesta TTS.
4. Di **«modo cruce»** → banner cambia a CRUCE.

#### C. Modo cruce

1. Gestor DAT → URL cruce WS apunta a `ws://<IP-MAC>:8765`.
2. Apunta las gafas a un semáforo/calle (o imagen de prueba).
3. Esperado: veredicto por voz en **<2 s**; vibración si `alert=true`; tono 440/800/1200 Hz.
4. Di **«modo super»** → vuelve compras/entorno.

#### D. Modo guía

1. Di **«modo guía»** (o selector en Gestor DAT).
2. Di **«¿puedo cruzar?»** → usa último veredicto YOLO + `/agents/guide`.
3. Respuesta objetiva, sin inventar semáforos.

#### E. Modo Mac

1. Di **«modo Mac»**.
2. Di **«oye, abre mi correo»** → Mail en Mac + confirmación TTS.
3. Requiere `myeyescantalk` en `:8788`.

### Errores frecuentes

| Síntoma | Causa | Fix |
|---------|-------|-----|
| Stream OK, Claude/voz no | iPhone no alcanza worker | Safari `/health`; IP en `Secrets.xcconfig`; rebuild |
| `noEligibleDevice` | Gafas no conectadas en Meta AI | Abrir Meta AI, desplegar gafas, cerrar otra sesión DAT |
| Sin frames | Permiso cámara gafas | Gestor DAT → Refrescar permiso cámara |
| Cruce WS error | ws_bridge apagado o IP mal | Terminal T2; URL en Gestor DAT |
| Sin audio en gafas | Ruta BT | TTS usa A2DP; mic usa HFP — no uses auriculares ajenos |
| Info.plist vacío | xcodegen pisó el plist | Mantener `generate: false` en `project.yml`; plist completo con MWDAT |

### Script rápido (Mac)

```bash
cd puente/apps/mobile-ios && ./scripts/verify-lan.sh
```

## Resultados última corrida (2026-06-20)

| Prueba | Resultado |
|--------|-----------|
| `POST /transcribe-token` | 200 OK |
| `POST /tts` | 200, MPEG ~17KB |
| `POST /rag/query` visita 2 | hit, skip_vision, pasillo 7 |
| `POST /rag/query` visita 1 | miss forzado |
| `POST /fusion/describe` + frame.jpg | 200, speech + structured |
| App física + gafas TTS | **Pendiente manual** |
| Demo 3 escenarios | **Pendiente manual** |
