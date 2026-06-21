# Puente — App RN + Expo (iOS + Android)

Cliente delgado del worker, un solo codebase para ambos teléfonos. El **backend
no cambia** — los 6 endpoints ya probados.

## Estructura
```
mobile-rn/
├── App.tsx                  ← pantalla demo: PTT hold/release → SuperFlow
├── app.config.ts            ← config Expo (secrets vía .env)
├── .env.example             ← EXPO_PUBLIC_WORKER_BASE_URL, Meta tokens
├── index.js · package.json · tsconfig.json
└── src/
    ├── config.ts            ← WORKER_BASE_URL + perfil/estado demo (María)
    ├── net/types.ts         ← contratos JSON (espejo de schemas.md)
    ├── net/workerClient.ts  ← cliente HTTP de los 6 endpoints
    ├── core/sessionState.ts ← state machine + lista de compra
    ├── core/superFlow.ts    ← orquestador de los 3 escenarios
    └── dat/
        ├── glassesBridge.ts ← interfaz del hardware
        ├── wrapperBridge.ts ← impl: expo-meta-wearables-dat + audio del SO
        └── assemblyAiStt.ts ← STT streaming (WebSocket v3)
```

## Por qué dev build (no Expo Go)
`expo-meta-wearables-dat` y `react-native-live-audio-stream` son módulos nativos →
**Expo Go no sirve**. Hay que generar un dev build.

## Cómo correrlo (en tu Mac)
```bash
cd puente/apps/mobile-rn
cp .env.example .env   # completar Meta + worker URL
npm install
npx expo prebuild                 # genera ios/ y android/ + aplica config plugins

# Worker corriendo aparte:
#   cd ../../backend/worker && npx wrangler dev

# Android (emulador o dispositivo):
npx expo run:android              # usa 10.0.2.2:8787 (config.ts)

# iOS (simulador o iPhone):
npx expo run:ios                  # usa localhost:8787
```
Teléfono físico: cambia `WORKER_BASE_URL` en `config.ts` a la **IP LAN de tu Mac**
(`http://192.168.x.x:8787`). El cleartext HTTP ya está habilitado (app.json).

## Probar SIN gafas (MockDeviceKit — builds debug)
En `App.tsx`, pasa un mp4 de super a `bridge.init({ mockVideoUri })` y completa el
TODO de `wrapperBridge.captureFrameJpegBase64` con la API mock del wrapper.

## Probar el flujo (los 3 escenarios)
Cambia `visita_numero` en `config.ts → demoState()`:
- `1` → RAG miss → visión (1ra visita)
- `2` → RAG hit → skip_vision <1s (2da visita)
- experta → mismo motor, contraste de UX

Botón PTT → di: "¿dónde está la leche?" · "¿qué producto es este?" · "¿qué me falta?"

## ⚠️ Lo que debes verificar (no pude compilar aquí)
1. **API exacta de `expo-meta-wearables-dat`** (v1.3.0): los nombres
   `startSession/startStream/capturePhoto/enableMock` en `wrapperBridge.ts` están
   marcados con TODO — confírmalos contra el README/types del paquete.
2. **`react-native-live-audio-stream`**: que emita PCM16 16kHz mono en `data`
   (base64). Si tu versión difiere, ajusta `listenOnce`.
3. **Mic de las gafas**: el wrapper no lo expone; el STT usa el mic del SO, que
   capta el mic BT de las Ray-Ban por HFP cuando están emparejadas.
4. **New Architecture OFF** (`newArchEnabled:false`) — el wrapper la marca "untested".

## Lo que SÍ está correcto y completo
`types.ts`, `workerClient.ts`, `sessionState.ts`, `superFlow.ts`, `assemblyAiStt.ts`
y la UI — TypeScript estándar contra contratos ya probados. Solo la capa DAT del
wrapper necesita verificación de nombres.
