# metaglass-rayban-orquesta

# Puente — Accesibilidad con Ray-Ban Meta Gen 2

Plataforma modular de accesibilidad para personas con discapacidad en México/LATAM.  
Hardware MVP: **Ray-Ban Meta Gen 2** (audio-first, sin HUD).  
Hackathon Platanus — reto "Crear Interfaces".

## Qué es

**Puente** devuelve **agencia** — no sustituye sentidos. Traduce el entorno POV de las gafas en **narración espacial**, **decisiones** (Hermes) y **acciones** (saludos, listas, confirmaciones) por voz en altavoces de las gafas.

```
Gen 2 (cámara + mic + speakers)
    ↔ App Android DAT (teléfono)
        ↔ Backend (Worker + Fusion + RAG + Hermes)
            → TTS altavoces gafas
```

## Empezar aquí

| Orden | Documento | Para qué |
|-------|-----------|----------|
| 1 | **[puente/CLAUDE.md](./puente/CLAUDE.md)** | Contexto completo para Claude/Cursor — **leer primero** |
| 2 | **[puente/CHECKLIST.md](./puente/CHECKLIST.md)** | Setup Meta, APIs, deploy, demo |
| 3 | [GEN2_PUENTE_IMPLEMENTACION.md](./GEN2_PUENTE_IMPLEMENTACION.md) | Implementación Gen 2 |
| 4 | [FLUJO_SUPER_PERSONA_CIEGA.md](./FLUJO_SUPER_PERSONA_CIEGA.md) | E2E super — 3 escenarios visita |
| 5 | Canvas | [flujo-super-persona-ciega.canvas.tsx](/Users/chasse/.cursor/projects/Users-chasse-hackplatanus/canvases/flujo-super-persona-ciega.canvas.tsx) |

## Infraestructura local

| Carpeta | Qué es |
|---------|--------|
| [infra/myeyescantalk/](./infra/myeyescantalk/) | Experimento Mac/Electron Phase 1 (Ollama + OpenClaw) |
| [infra/ANALISIS_INFRAESTRUCTURA.md](./infra/ANALISIS_INFRAESTRUCTURA.md) | Mapa infra: myeyescantalk vs Puente worker |


| Tema | Archivo |
|------|---------|
| SDK Meta / DAT vs Web Apps | [INVESTIGACION_META_SDK.md](./INVESTIGACION_META_SDK.md) |
| Cámara POV / stream | [CAMARA_META_RAYBAN.md](./CAMARA_META_RAYBAN.md) |
| Discapacidades MX/LATAM | [MODULO_DISCAPACIDADES_MX_LATAM.md](./MODULO_DISCAPACIDADES_MX_LATAM.md) |
| Clicky → Puente | [ANALISIS_CLICKY_VS_PUENTE.md](./ANALISIS_CLICKY_VS_PUENTE.md) |
| Roadmap dual Gen2+Display | [ROADMAP_APP_PUENTE.md](./ROADMAP_APP_PUENTE.md) |

## Repo de código

```
puente/
├── CLAUDE.md              ← instrucciones agente
├── CHECKLIST.md           ← setup paso a paso
├── E2E_VERIFICATION.md    ← pruebas curl/runtime
├── backend/worker/        ← Cloudflare Worker (7 rutas)
├── apps/mobile-rn/        ← **MVP** Expo + DAT
├── apps/mobile/           ← Kotlin referencia
├── shared/prompts/        ← prompts ES-MX
└── shared/types/          ← JSON schemas
```

Código legacy reutilizable: `/Users/chasse/hack` (M1 GlassesView, orchestrator, voice).

## Módulos producto

| ID | Nombre | Fase | Demo super |
|----|--------|------|------------|
| Sentido | Orientación espacial | P0 | Sí |
| Puente | Saludos / WhatsApp | P0 | Opcional |
| Super | Lista + RAG + ProductJSON | P0 | **Sí** |
| Mano | Dictado documentos | P1 | No |
| Calma | Respuestas adaptativas HRV | P2 | No |

## Stack

| Capa | Tecnología |
|------|------------|
| Gafas | Ray-Ban Meta Gen 2 + DAT Android 0.7 |
| App | Kotlin — sample `CameraAccess` (referencia) |
| App MVP | **Expo `mobile-rn`** + `expo-meta-wearables-dat` |
| Backend | Cloudflare Worker + rutas fusion/RAG |
| Visión | Claude / GPT-4o mini → SceneJSON / ProductJSON |
| STT | AssemblyAI vía worker |
| TTS | ElevenLabs vía worker → altavoces gafas |
| Memoria / decisión | Patrones [Hermes Agent](https://github.com/NousResearch/hermes-agent) |
| Live (estante denso) | Gemini Live API |
| Inspiración loop | [Clicky](https://github.com/farzaa/clicky) (MIT) |

## Prompt para Claude (copiar al iniciar sesión)

```text
Lee puente/CLAUDE.md y puente/CHECKLIST.md en este repo.
Hardware: Ray-Ban Meta Gen 2. MVP: demo super persona ciega.
No implementes Display HUD ni CRM ventas. Español MX. Sigue GEN2_PUENTE_IMPLEMENTACION.md.
```

## Disclaimer

Puente es apoyo complementario. No sustituye bastón, perro guía, SLT ni certificaciones médicas.
