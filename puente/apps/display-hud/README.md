# Display HUD — Ray-Ban Display Web App

Viewport fijo **600×600**. Sin cámara ni micrófono — solo muestra estado del backend.

## Deploy

- Host: Vercel / Netlify (HTTPS obligatorio)
- Meta AI app → Developer Mode → Add web app URL

## Meta tags requeridos

```html
<meta name="mrbd-web-app-capable" content="yes">
<meta name="viewport" content="width=600, height=600, initial-scale=1.0, user-scalable=no">
```

## Input

- Neural Band / temple → Arrow keys + Enter
- Todos los botones con clase `.focusable`

## WS

Conectar a `wss://[backend]/hud?session=...` — ver ROADMAP_APP_PUENTE.md §6.

## Vistas Fase 1

1. Idle — conectado
2. Live — última línea Sentido
3. Puente — confirmar envío (Enter/Esc)

Implementación pendiente — Fase 1.
