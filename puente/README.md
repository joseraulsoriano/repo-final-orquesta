# Puente — App de accesibilidad Meta Ray-Ban

> **Para Claude/Cursor:** lee **[CLAUDE.md](./CLAUDE.md)** primero.  
> **Para humanos:** **[CHECKLIST.md](./CHECKLIST.md)** paso a paso.

## Inicio rápido

```bash
# 1. Backend
cd puente/backend/worker && npm install
# secrets → ver CHECKLIST.md
npx wrangler dev

# 2. Android (cuando exista)
# Fork CameraAccess → apps/mobile/
```

## Documentación

| Doc | Uso |
|-----|-----|
| [CLAUDE.md](./CLAUDE.md) | Contexto agente — fuente de verdad |
| [CHECKLIST.md](./CHECKLIST.md) | Setup Meta, APIs, deploy |
| [shared/prompts/](./shared/prompts/) | Prompts ES-MX |
| [shared/types/schemas.md](./shared/types/schemas.md) | JSON contracts |
| [../GEN2_PUENTE_IMPLEMENTACION.md](../GEN2_PUENTE_IMPLEMENTACION.md) | Gen 2 |
| [../FLUJO_SUPER_PERSONA_CIEGA.md](../FLUJO_SUPER_PERSONA_CIEGA.md) | Demo super |

## Hardware MVP

**Ray-Ban Meta Gen 2** — audio-only. Display = backlog.

## Estructura

```
puente/
├── CLAUDE.md
├── CHECKLIST.md
├── backend/worker/     ← Cloudflare (fork Clicky)
├── apps/mobile/        ← Android DAT (crear)
└── shared/
    ├── prompts/
    ├── types/
    └── hermes/
```

## Prompt starter Claude

```text
Lee puente/CLAUDE.md y CHECKLIST.md.
Implementa en orden: worker /fusion/describe → Android DAT stub → loop PTT super.
Gen 2 only. Español MX.
```
