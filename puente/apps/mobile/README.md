# Mobile Kotlin — referencia DAT (no MVP activo)

Scaffold Android con SuperFlow espejo de `mobile-rn`. **MVP hackathon:** usar [`../mobile-rn/`](../mobile-rn/) (Expo + `expo-meta-wearables-dat`).

## Estado

| Pieza | Estado |
|-------|--------|
| SuperFlow / WorkerClient | Scaffold Kotlin |
| DAT hardware | `TodoGlassesBridge` — no implementado |
| MockDeviceKit | TODO capture frame |

## Cuándo usar este módulo

- Fork oficial [`CameraAccess`](https://github.com/facebook/meta-wearables-dat-android) si Expo DAT no cubre un requisito nativo.
- Producción Android pura post-hackathon.

## Setup (cuando se retome)

Ver [DAT Android integration](https://wearables.developer.meta.com/docs/develop/dat/build-integration-android/).

```kotlin
implementation("com.meta.wearable:mwdat-core:0.7.0")
implementation("com.meta.wearable:mwdat-camera:0.7.0")
implementation("com.meta.wearable:mwdat-mockdevice:0.7.0")
```

Gen 2 **audio-only** en MVP — sin Display/HUD (`apps/display-hud/` es backlog).
