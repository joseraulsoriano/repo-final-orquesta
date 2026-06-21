import { ExpoConfig, ConfigContext } from "expo/config";

/**
 * Config dinámica: secrets Meta y URL del worker vía .env (ver .env.example).
 * Nunca commitear .env con tokens reales.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Puente",
  slug: "puente",
  version: "0.1.0",
  orientation: "portrait",
  scheme: "puente",
  newArchEnabled: false,
  ios: {
    bundleIdentifier: "ai.puente.app",
    deploymentTarget: "16.0",
    infoPlist: {
      NSMicrophoneUsageDescription: "Puente usa el micrófono para escuchar tus preguntas (PTT).",
      NSLocationWhenInUseUsageDescription: "Puente usa tu ubicación para orientarte en el super (RAG).",
      NSBluetoothAlwaysUsageDescription: "Puente se conecta a tus gafas Ray-Ban Meta por Bluetooth.",
      NSCameraUsageDescription: "Puente usa la cámara de las gafas para describir el entorno.",
      NSLocalNetworkUsageDescription:
        "Puente usa la red local para conectarse al servidor de desarrollo (Metro) y a tus gafas.",
      NSBonjourServices: ["_expo._tcp", "_exp._tcp"],
      NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
    },
  },
  android: {
    package: "ai.puente.app",
    permissions: [
      "INTERNET",
      "RECORD_AUDIO",
      "ACCESS_FINE_LOCATION",
      "ACCESS_COARSE_LOCATION",
      "BLUETOOTH_CONNECT",
      "VIBRATE",
    ],
  },
  plugins: [
    "expo-av",
    "expo-location",
    [
      "expo-meta-wearables-dat",
      {
        urlScheme: "puente",
        metaAppId: process.env.EXPO_PUBLIC_META_APP_ID ?? "",
        clientToken: process.env.EXPO_PUBLIC_META_CLIENT_TOKEN ?? "",
        bluetoothUsageDescription: "Puente se conecta a tus gafas Ray-Ban Meta por Bluetooth.",
      },
    ],
    [
      "expo-build-properties",
      {
        android: { usesCleartextTraffic: true },
      },
    ],
    "expo-asset",
  ],
  extra: {
    workerBaseUrl: process.env.EXPO_PUBLIC_WORKER_BASE_URL,
  },
});
