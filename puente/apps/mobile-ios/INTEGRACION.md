# Puente iOS nativo (SwiftUI + Meta DAT SDK)

App SwiftUI sin Metro/Expo. Compila directo en Xcode → iPhone físico.

## Arranque rápido

```bash
# 1. Worker en tu Mac (acceso LAN abierto)
cd puente/backend/worker
npx wrangler dev --ip 0.0.0.0

# 2. App iOS
cd puente/apps/mobile-ios
cp Config/Secrets.xcconfig.example Config/Secrets.xcconfig   # si no existe
# Edita PUENTE_WORKER_BASE_URL = http://<IP-MAC>:8787
chmod +x setup.sh && ./setup.sh
open Puente.xcodeproj
```

En Xcode: **Signing & Capabilities** → tu Team → Run en iPhone.

Requisitos Meta: Developer Mode en Meta AI, Meta AI V272+, firmware gafas V125+.

## ¿Mosquitto / MQTT?

**No hace falta para el MVP.** Puente ya funciona así:

```
iPhone ──HTTPS POST──► Worker :8787 ──► Claude / ElevenLabs / AssemblyAI
       ◄── mp3 TTS ───┘
```

Todo es request/response (visión batch, TTS, token STT). MQTT aportaría valor **después**, por ejemplo:

| Caso futuro | Rol de MQTT |
|-------------|-------------|
| Dashboard en Mac viendo eventos de sesión en vivo | `puente/session/{id}/events` |
| Varios clientes (app + debug + myeyescantalk) | Pub/sub desacoplado |
| Telemetría / alertas fuera del camino crítico | Topics de observabilidad |

Para el hackathon, MQTT = otro proceso que mantener, otro puerto, otro fallo en demo. **Déjalo fuera del camino crítico.**

## “Acceso abierto” recomendado (sin Mosquitto)

Para que el iPhone alcance tu Mac sin pelear con auth ni Metro:

1. **Worker sin API key en dev** — no configures `WORKER_API_KEY` en wrangler; el worker acepta todo en LAN.
2. **`wrangler dev --ip 0.0.0.0`** — escucha en todas las interfaces, no solo localhost.
3. **`PUENTE_WORKER_BASE_URL`** en `Secrets.xcconfig` = IP LAN del Mac (`192.168.x.x:8787`).
4. **Info.plist** ya tiene `NSAllowsLocalNetworking` para HTTP cleartext en LAN.
5. **Firewall macOS** — permite conexiones entrantes a Node/wrangler si iOS no conecta.

Opcional post-demo: Mosquitto en Mac con auth anónima solo en `127.0.0.1` para debug; el Worker publicaría eventos `/session/observe` — no bloqueante para compilar hoy.

## Estructura

```
mobile-ios/
├── project.yml              ← XcodeGen
├── Config/Secrets.xcconfig  ← gitignored (Worker + Meta)
└── Puente/
    ├── PuenteApp.swift
    ├── Dat/DatGlassesBridge.swift   ← Meta SDK 0.7 directo
    ├── Core/SuperFlow.swift         ← loop principal Puente
    └── Net/WorkerClient.swift
```

## Mock sin gafas (Debug)

En `PuenteViewModel`, `useMockDevice = true` activa MockDeviceKit (solo builds Debug).

## Build

| | mobile-ios |
|---|------------|
| Meta DAT | SDK nativo MWDAT 0.7 |
| Compilar teléfono | Xcode ⌘R (iPhone físico) |

Doc Meta local: `puente/mcp-meta/docsMeeta/ios_integration.md`
