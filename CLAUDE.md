# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

**Puente** — accessibility platform for blind/disabled users in Mexico/LATAM, **Ray-Ban Meta Gen 2** (audio-only). Hackathon Platanus.

**`puente/CLAUDE.md` is the authoritative project spec.** Read it before implementing anything in `puente/`.

## Repo map

```
hackplatanus/
├── *.md                        ← research/design docs (Spanish)
└── puente/
    ├── CLAUDE.md               ← AUTHORITATIVE agent instructions
    ├── CHECKLIST.md            ← setup checklist
    ├── E2E_VERIFICATION.md     ← curl / runtime verification
    ├── backend/worker/         ← Cloudflare Worker (7 routes, implemented)
    ├── apps/mobile-ios/      ← **MVP app** Swift + MWDAT (activo)
    ├── apps/mobile/            ← Kotlin reference scaffold
    └── shared/prompts/         ← ES-MX prompts (sync manually with worker)
```

## Architecture

```
Gen 2 ──DAT──► mobile-ios (Swift) ──HTTPS──► Cloudflare Worker ──► Anthropic / ElevenLabs / AssemblyAI
                    ◄── TTS mp3 ────────────────────────────────┘
```

The Worker implements `/fusion/describe`, `/rag/query`, `/agents/super`, `/tts`, `/transcribe-token`, `/chat`, and optional `/gemini/live-token`. See `puente/backend/worker/src/index.ts`.

## Commands

**Worker:**
```bash
cd puente/backend/worker && npm install && npx wrangler dev
```

**Mobile MVP (iOS):**
```bash
cd puente/apps/mobile-ios
cp Config/Secrets.xcconfig.example Config/Secrets.xcconfig   # Worker URL, Meta tokens
./setup.sh && open Puente.xcodeproj   # iPhone físico para DAT
```

When in doubt, defer to `puente/CLAUDE.md`.
