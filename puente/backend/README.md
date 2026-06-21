# Backend — Cloudflare Worker Puente

Proxy HTTPS para que la app nunca embarque API keys de Anthropic, ElevenLabs, AssemblyAI ni Gemini.

**Código:** [`worker/src/index.ts`](./worker/src/index.ts) (~780 líneas, monolito).

## Rutas implementadas

| Método | Ruta | Upstream |
|--------|------|----------|
| POST | `/chat` | Anthropic (streaming, legacy Clicky) |
| POST | `/tts` | ElevenLabs |
| GET/POST | `/transcribe-token` | AssemblyAI |
| POST | `/fusion/describe` | Anthropic visión → SceneJSON / ProductJSON |
| POST | `/rag/query` | Lookup in-memory demo (`walmart_portales`) |
| POST | `/agents/super` | Hermes-lite (Claude texto) |
| POST | `/gemini/live-token` | Google Gemini Live (opcional) |

Contratos: [`../shared/types/schemas.md`](../shared/types/schemas.md) · [`../CLAUDE.md`](../CLAUDE.md) §6.

## Desarrollo local

```bash
cd puente/backend/worker
npm install
cp .dev.vars.example .dev.vars   # completar keys
npx wrangler dev                 # :8787
```

## Secrets producción

```bash
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put ASSEMBLYAI_API_KEY
npx wrangler secret put ELEVENLABS_API_KEY
# Opcional:
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put WORKER_API_KEY   # auth app → header x-puente-key
npx wrangler secret put VISION_MODEL       # override default claude-sonnet-4-6
npx wrangler secret put HERMES_MODEL       # override default claude-haiku-4-5
```

`ELEVENLABS_VOICE_ID` en [`wrangler.toml`](./worker/wrangler.toml).

## Prompts

Fuente declarativa: [`../shared/prompts/`](../shared/prompts/). El worker copia inline con comentario "Mantener en sync" — no lee `.md` en runtime (pendiente build step).

## Tests

```bash
npm test
```

Ver [`E2E_VERIFICATION.md`](../E2E_VERIFICATION.md) para curl end-to-end.

## No implementado (backlog)

- `/agents/puente`, `/hud` — fuera de MVP Gen 2
- Vector store RAG real
- Bun server (solo Cloudflare Workers)
