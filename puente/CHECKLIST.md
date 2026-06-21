# Checklist — Configuración Puente

Marcar en orden. Bloqueantes antes de demo jurado.

---

## Fase 0 — Cuentas y API keys

- [ ] [Wearables Developer Center](https://wearables.developer.meta.com/) — cuenta + App ID
- [ ] [Anthropic](https://console.anthropic.com/) — API key (visión + Hermes)
- [ ] [AssemblyAI](https://www.assemblyai.com/) — API key (STT)
- [ ] [ElevenLabs](https://elevenlabs.io/) — API key + Voice ID (TTS)
- [ ] [Cloudflare](https://dash.cloudflare.com/) — cuenta Workers
- [ ] (Opcional) [Google AI](https://aistudio.google.com/) — Gemini Live
- [ ] (Opcional) OpenAI — GPT-4o mini fallback visión

**No commitear:** `.dev.vars`, `.env`, secrets

---

## Fase 1 — Meta / Gafas Gen 2

- [ ] Gafas Gen 2 emparejadas en app **Meta AI**
- [ ] Firmware gafas actualizado
- [ ] **Developer Mode** ON (Meta AI → Settings → Developer)
- [ ] Permiso cámara gafas concedido (deeplink desde app DAT)
- [ ] Teléfono Android 10+ o iOS 16+ (`mobile-rn`)
- [ ] Cable USB para deploy + logs

---

## Fase 2 — Backend Worker

Ubicación: `puente/backend/worker/`

```bash
cd puente/backend/worker
npm install
cp .dev.vars.example .dev.vars   # completar
npx wrangler dev
npm test
```

Secrets producción:

```bash
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put ASSEMBLYAI_API_KEY
npx wrangler secret put ELEVENLABS_API_KEY
# Opcional:
npx wrangler secret put WORKER_API_KEY
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put VISION_MODEL
npx wrangler secret put HERMES_MODEL
```

- [ ] Worker deploy OK
- [ ] `POST /transcribe-token` responde 200
- [ ] `POST /tts` devuelve audio
- [x] `POST /fusion/describe` implementado — probar con `frame.jpg`
- [x] `POST /rag/query` implementado (sembrado; `visita_numero=1` → miss)
- [x] `POST /agents/super` implementado
- [x] `POST /gemini/live-token` implementado (501 sin GEMINI_API_KEY)
- [ ] Curl E2E — ver [E2E_VERIFICATION.md](./E2E_VERIFICATION.md)

Anotar URL: `https://________.workers.dev`

---

## Fase 3 — App móvil MVP (`mobile-rn`)

**Decisión:** Expo + DAT es el camino MVP. Kotlin en `apps/mobile/` es referencia.

```bash
cd puente/apps/mobile-rn
cp .env.example .env
# EXPO_PUBLIC_WORKER_BASE_URL, EXPO_PUBLIC_META_APP_ID, EXPO_PUBLIC_META_CLIENT_TOKEN
npm install
npx expo prebuild   # solo si regeneras nativo; cuidado duplicados MWDAT en iOS
npm run android     # o ios — dispositivo físico recomendado para DAT
```

- [x] SuperFlow + WorkerClient implementados
- [x] PTT hold/release (`onPressIn` / `onPressOut`)
- [x] DAT: `configure()` + `EMWDATStreamView` + deep link `handleUrl`
- [ ] TTS → **audio sale por gafas** (verificar BT HFP)
- [ ] PTT → STT → fusion → TTS loop en hardware
- [ ] Sesión Gen 2 ≥5 min sin crash

Mock sin gafas:

- [ ] `EXPO_PUBLIC_MOCK_VIDEO_URI` + MockDeviceKit (mp4 HEVC en Android)

---

## Fase 3b — Kotlin DAT (referencia, opcional)

- [ ] Solo si Expo DAT no alcanza — ver `apps/mobile/README.md`

---

## Fase 4 — Fusion + RAG + Hermes

- [ ] Prompts `shared/prompts/` wired al worker (build step)
- [ ] SceneJSON + ProductJSON validados (Zod/JSON Schema)
- [ ] Vector store / indexación post 1ra visita (endpoint write)
- [x] Hermes-lite: USER/MEMORY strings en app demo
- [x] RAG skip visión si confianza > 0.85

---

## Fase 5 — Demo super (3 escenarios)

Ver [FLUJO_SUPER_PERSONA_CIEGA.md](../FLUJO_SUPER_PERSONA_CIEGA.md) §1.1

- [ ] **1ra visita:** `visita_numero=1` → RAG miss → visión
- [ ] **2da visita:** `visita_numero=2` → RAG hit pasillo 7
- [ ] **Experta + gafas:** comparar 3 min tacto vs 8 s PTT
- [ ] Disclaimer en app
- [ ] Guion 3 min probado

---

## Fase 6 — Jurado / pitch

- [ ] Canvas flujo abierto en laptop
- [ ] Video fallback si WiFi cae
- [ ] Comparativa Meta AI nativo vs Puente
- [ ] Métricas: preguntas extraños, min/producto, autonomía

---

## Demo multi-flow glassesWatch (mobile-ios)

Una sesión DAT; cambia de módulo por voz o en Gestor de sesión DAT.

| Flow monoRepo | Módulo | Backend | Comando voz |
|---------------|--------|---------|-------------|
| 07_compras_supermercado | `supermercado` | Worker `/agents/orchestrate` + RAG | «modo super» |
| 03_reconocimiento_entorno | `supermercado` + sentido | `/fusion/describe` | (automático en super) |
| Cruce calle | `cruce` | eyesstreelighttalk WS `:8765` | «modo cruce» |
| 06_computadora_manos_libres | `mac` | myeyescantalk `:8788` | «modo Mac» → «oye abre mi correo» |
| 01_navegación_asistida | `guia` | `/agents/guide` | «modo guía» → «¿puedo cruzar?» |
| 05_emergencias | `guia` + alert | guide + vibración | (alert automático) |

### Checklist demo (orden sugerido)

1. **Worker cloud:** `cd puente/backend/worker && npx wrangler login && npx wrangler deploy` — URL en `Secrets.xcconfig`
2. **Cruce LAN:** `cd external/eyesstreelighttalk && pip install -r requirements.txt && python -m src.ws_bridge` — IP Mac en `PUENTE_CROSSING_WS_URL`
3. **Mac commands:** `cd infra/myeyescantalk && npm run command` — `:8788` en `PUENTE_COMMAND_BASE_URL`
4. **iOS:** build Puente, gafas Gen 2, modo super → describe entorno → «modo cruce» → veredicto voz <2s
5. **Guía:** «modo guía» → «¿puedo cruzar?» usa veredicto YOLO + `/agents/guide`
6. **Mac:** «modo Mac» → «oye abre mi correo» → Mail abre + confirmación TTS
7. **Disclaimer:** primera apertura muestra onboarding (una sola vez)

---

## Variables de entorno (referencia)

| Variable | Dónde | Uso |
|----------|-------|-----|
| `ANTHROPIC_API_KEY` | Worker secret | Visión, Hermes, chat |
| `ASSEMBLYAI_API_KEY` | Worker secret | STT token |
| `ELEVENLABS_API_KEY` | Worker secret | TTS |
| `ELEVENLABS_VOICE_ID` | wrangler.toml | Voz ES |
| `WORKER_API_KEY` | Worker secret (opcional) | Auth `x-puente-key` |
| `VISION_MODEL` | Worker secret (opcional) | Default `claude-sonnet-4-6` |
| `HERMES_MODEL` | Worker secret (opcional) | Default `claude-haiku-4-5` |
| `EXPO_PUBLIC_WORKER_BASE_URL` | mobile-rn `.env` | URL worker |
| `EXPO_PUBLIC_META_APP_ID` | mobile-rn `.env` | DAT Meta |
| `EXPO_PUBLIC_META_CLIENT_TOKEN` | mobile-rn `.env` | DAT Meta |
| `EXPO_PUBLIC_WORKER_API_KEY` | mobile-rn `.env` | Si worker tiene auth |
| `EXPO_PUBLIC_CROSSING_WS_URL` | mobile-rn `.env` | WS eyesstreelighttalk |
| `EXPO_PUBLIC_COMMAND_BASE_URL` | mobile-rn `.env` | myeyescantalk Mac |
| `GITHUB_TOKEN` | Kotlin local.properties | Gradle DAT deps |

---

## Orden recomendado

1. Worker `wrangler dev` + [E2E_VERIFICATION.md](./E2E_VERIFICATION.md)
2. `mobile-rn` `.env` + dispositivo físico
3. Verificar TTS por gafas
4. Demo 3 escenarios con `visita_numero` 1 vs 2
