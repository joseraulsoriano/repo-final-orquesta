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
- [ ] iPhone iOS 16+ con Xcode (`mobile-ios`)
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

## Fase 3 — App móvil MVP (`mobile-ios`)

**Decisión:** Swift + MWDAT nativo es el camino MVP. Kotlin en `apps/mobile/` es referencia.

```bash
cd puente/apps/mobile-ios
cp Config/Secrets.xcconfig.example Config/Secrets.xcconfig
# PUENTE_WORKER_BASE_URL, META_APP_ID, CLIENT_TOKEN, PUENTE_CROSSING_WS_URL
./setup.sh
open Puente.xcodeproj
```

- [x] SuperFlow + WorkerClient + ModuleRouter (super, cruce, guía, mac)
- [x] DAT: `DatGlassesBridge` + stream + reconexión en background
- [ ] TTS → **audio sale por gafas** (verificar BT HFP)
- [ ] PTT / mic en vivo → STT → fusion → TTS loop en hardware
- [ ] Sesión Gen 2 ≥5 min sin crash

Mock sin gafas: usar simulador solo para UI; DAT requiere iPhone físico + gafas.

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
| `PUENTE_WORKER_BASE_URL` | `Secrets.xcconfig` | URL worker |
| `META_APP_ID` | `Secrets.xcconfig` | DAT Meta |
| `CLIENT_TOKEN` | `Secrets.xcconfig` | DAT Meta |
| `PUENTE_WORKER_API_KEY` | `Secrets.xcconfig` | Si worker tiene auth |
| `PUENTE_CROSSING_WS_URL` | `Secrets.xcconfig` | WS eyesstreelighttalk |
| `PUENTE_COMMAND_BASE_URL` | `Secrets.xcconfig` | myeyescantalk Mac |
| `GITHUB_TOKEN` | Kotlin local.properties | Gradle DAT deps |

---

## Orden recomendado

1. Worker `wrangler dev` + [E2E_VERIFICATION.md](./E2E_VERIFICATION.md)
2. `mobile-ios` `Secrets.xcconfig` + iPhone físico
3. Verificar TTS por gafas
4. Demo 3 escenarios con `visita_numero` 1 vs 2
