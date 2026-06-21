import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";
import * as Location from "expo-location";
import { Buffer } from "buffer";
import { Vibration } from "react-native";
import LiveAudioStream from "react-native-live-audio-stream";
import {
  addListener,
  addStreamToSession,
  capturePhoto,
  configure,
  createSession,
  enableMockDeviceKit,
  getRegistrationStateAsync,
  mockDeviceDon,
  mockDevicePowerOn,
  mockDeviceSetCameraFeed,
  mockDeviceSetCameraFeedFromCamera,
  mockDeviceUnfold,
  pairMockDevice,
  requestPermission,
  setLogLevel,
  startRegistration,
  startSession,
  stopSession,
} from "expo-meta-wearables-dat";

import { SHOW_DEBUG_LOGS } from "../config";
import { Gps } from "../net/types";
import { WorkerClient } from "../net/workerClient";
import { AssemblyAiStt } from "./assemblyAiStt";
import { GlassesBridge } from "./glassesBridge";

interface PhotoData {
  filePath: string;
  format: "jpeg" | "heic";
  timestamp: number;
  base64?: string;
}

type ListenerSub = { remove: () => void } | null;

/** Rechaza si la promesa no resuelve en `ms` — evita cuelgues silenciosos. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`timeout ${label} (${ms}ms)`)), ms)
    ),
  ]);
}

/**
 * GlassesBridge real sobre expo-meta-wearables-dat (v1.3.0) + audio del SO.
 */
export class WrapperBridge implements GlassesBridge {
  private lastGps?: Gps;
  private sessionId?: string;
  private gpsWatch?: Location.LocationSubscription;
  /** Último estado del stream de video DAT (stopped→…→streaming). */
  private streamState = "stopped";
  /** Listeners del stream a limpiar en dispose. */
  private streamSubs: ListenerSub[] = [];

  constructor(
    private readonly worker: WorkerClient,
    private readonly onLog: (s: string) => void = () => {}
  ) {}

  async init(opts?: { mockVideoUri?: string; mockFromCamera?: boolean }): Promise<void> {
    const useMock = !!(opts?.mockVideoUri || opts?.mockFromCamera);
    try {
      // Producción: el SDK DAT calla salvo errores (EXPO_PUBLIC_DEBUG=1 → verbose).
      setLogLevel(SHOW_DEBUG_LOGS ? "debug" : "error");
    } catch {
      /* noop */
    }
    this.onLog("[dat] configure()…");
    await configure();

    // Telemetría del stream: sin esto, capturePhoto falla "a ciegas". El estado
    // pasa stopped→waitingForDevice→starting→streaming; capturePhoto SOLO funciona
    // en "streaming".
    this.streamSubs.push(
      addListener("onStreamStateChange", (p: { state: string }) => {
        this.streamState = p.state;
        this.onLog(`[dat] stream state = ${p.state}`);
      })
    );
    this.streamSubs.push(
      addListener("onStreamError", (e: unknown) => {
        this.onLog(`[dat] stream ERROR = ${JSON.stringify(e)}`);
      })
    );

    // En mock: habilita el kit ANTES de tocar registro/permisos para que los
    // intercepte y NO dispare deeplinks a la Meta AI app.
    let deviceId: string | undefined;
    if (useMock) {
      this.onLog("[dat] enableMockDeviceKit()…");
      await enableMockDeviceKit({ initiallyRegistered: true, initialPermissionsGranted: true });
      deviceId = await pairMockDevice();
      if (opts?.mockFromCamera) {
        this.onLog("[dat] feed mock = cámara del teléfono (back)");
        await mockDeviceSetCameraFeedFromCamera(deviceId, "back");
      } else {
        this.onLog(`[dat] feed mock = video ${opts!.mockVideoUri}`);
        await mockDeviceSetCameraFeed(deviceId, opts!.mockVideoUri!);
      }
      // El mock arranca apagado/plegado/sin poner → no es "elegible" para una
      // sesión. Lo dejamos como gafas reales puestas: encendido, desplegado y don.
      this.onLog("[dat] mock: powerOn + unfold + don…");
      await mockDevicePowerOn(deviceId);
      await mockDeviceUnfold(deviceId);
      await mockDeviceDon(deviceId);
    } else {
      this.onLog("[dat] getRegistrationStateAsync()…");
      let reg = await getRegistrationStateAsync();
      this.onLog(`[dat] registro = ${reg}`);
      if (reg !== "registered") {
        this.onLog("[dat] startRegistration() → abre Meta AI…");
        await startRegistration();
        // startRegistration regresa al volver de Meta AI, pero el estado
        // "registered" lo confirma el callback deeplink (handleUrl) de forma
        // asíncrona. Esperamos a que se asiente antes de crear la sesión; si no,
        // seguiríamos creyendo que NO está registrado y re-disparando el flujo.
        reg = await this.waitForRegistered(20000);
        this.onLog(`[dat] startRegistration() OK, registro = ${reg}`);
        if (reg !== "registered") {
          throw new Error(
            "Registro no se completó (timeout). ¿Tocaste 'Conectar' en Meta AI?"
          );
        }
      }
    }

    await Audio.requestPermissionsAsync();
    const loc = await Location.requestForegroundPermissionsAsync();
    if (loc.granted) {
      await this.refreshGps();
      this.gpsWatch = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 15 },
        (p) => {
          this.lastGps = {
            lat: p.coords.latitude,
            lng: p.coords.longitude,
            accuracy_m: p.coords.accuracy ?? undefined,
          };
        }
      );
    }

    // Permiso de cámara de las gafas: solo en modo real (deeplink a Meta AI).
    // En mock ya viene concedido por initialPermissionsGranted.
    if (!useMock) {
      this.onLog("[dat] requestPermission(camera)…");
      const cam = await requestPermission("camera");
      this.onLog(`[dat] permiso cámara = ${cam}`);
      if (cam !== "granted") throw new Error("Permiso de cámara de las gafas denegado");
    }

    this.onLog("[dat] createSession()…");
    this.sessionId = await createSession(deviceId);
    this.onLog("[dat] startSession()…");
    await startSession(this.sessionId);
    this.onLog("[dat] addStreamToSession()…");
    await addStreamToSession(this.sessionId, {
      resolution: "medium",
      frameRate: 7,
      ...(deviceId ? { deviceId } : {}),
    });
    this.onLog("[dat] stream OK");
  }

  getSessionId(): string | undefined {
    return this.sessionId;
  }

  /** Sondea el estado de registro hasta "registered" o hasta agotar el timeout. */
  private async waitForRegistered(
    timeoutMs: number
  ): Promise<Awaited<ReturnType<typeof getRegistrationStateAsync>>> {
    const start = Date.now();
    let s = await getRegistrationStateAsync();
    while (s !== "registered" && Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 500));
      s = await getRegistrationStateAsync();
    }
    return s;
  }

  private async refreshGps(): Promise<void> {
    const p = await Location.getCurrentPositionAsync({});
    this.lastGps = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy_m: 10 };
  }

  /** Espera a que el stream llegue a "streaming" (no bloquea init: el stream
   * arranca cuando el EMWDATStreamView se monta, después de init). */
  private async waitForStreaming(timeoutMs: number): Promise<void> {
    const start = Date.now();
    while (this.streamState !== "streaming" && Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 200));
    }
    this.onLog(`[dat] stream listo para capturar = ${this.streamState}`);
  }

  async captureFrameJpegBase64(): Promise<string> {
    if (this.streamState !== "streaming") {
      this.onLog(`[dat] stream=${this.streamState}, esperando "streaming" para capturar…`);
      await this.waitForStreaming(8000);
    }
    const photo = await this.capturePhotoOnce();
    const path = photo.filePath.startsWith("file://")
      ? photo.filePath
      : `file://${photo.filePath}`;
    const out = await ImageManipulator.manipulateAsync(
      path,
      [{ resize: { height: 896 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    if (!out.base64) throw new Error("ImageManipulator no devolvió base64");
    return out.base64;
  }

  private capturePhotoOnce(): Promise<PhotoData> {
    return new Promise<PhotoData>((resolve, reject) => {
      const sub: ListenerSub = addListener("onPhotoCaptured", (photo: PhotoData) => {
        sub?.remove();
        this.onLog(`[dat] foto capturada (${photo.format}, ${photo.filePath ? "file" : "sin-path"})`);
        resolve(photo);
      });
      capturePhoto("jpeg").catch((e) => {
        sub?.remove();
        this.onLog(`[dat] capturePhoto ERROR = ${(e as Error).message}`);
        reject(e as Error);
      });
      // BT real: la foto puede tardar varios segundos en transferir. 5s era corto.
      setTimeout(() => {
        sub?.remove();
        reject(new Error(`capturePhoto timeout (stream=${this.streamState})`));
      }, 10000);
    });
  }

  gps(): Gps | undefined {
    return this.lastGps;
  }

  async playTts(audioMp3: ArrayBuffer): Promise<void> {
    const b64 = Buffer.from(audioMp3).toString("base64");
    const uri = FileSystem.cacheDirectory + `tts_${Date.now()}.mp3`;
    await FileSystem.writeAsStringAsync(uri, b64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        sound.unloadAsync().finally(() => {
          FileSystem.deleteAsync(uri, { idempotent: true }).finally(() =>
            reject(new Error("TTS playback timeout"))
          );
        });
      }, 60_000);
      sound.setOnPlaybackStatusUpdate((st) => {
        if (!st.isLoaded) return;
        if ("error" in st && st.error) {
          clearTimeout(timeout);
          sound.unloadAsync().finally(() => reject(new Error(String(st.error))));
          return;
        }
        if (st.didJustFinish) {
          clearTimeout(timeout);
          sound.unloadAsync().finally(() => {
            FileSystem.deleteAsync(uri, { idempotent: true }).finally(resolve);
          });
        }
      });
    });
  }

  vibrate(ms: number): void {
    Vibration.vibrate(ms);
  }

  async listenOnce(isActive: () => boolean = () => true): Promise<string> {
    this.onLog("[stt] pidiendo token al worker…");
    let token: string;
    try {
      token = await withTimeout(this.worker.transcribeToken(), 6000, "token worker");
    } catch (e) {
      this.onLog(`[stt:error] ${(e as Error).message} — ¿el teléfono alcanza el worker?`);
      throw e;
    }
    this.onLog("[stt] token ok, conectando WS AssemblyAI…");
    const stt = new AssemblyAiStt(token);
    try {
      await withTimeout(stt.connect(), 6000, "WS AssemblyAI");
    } catch (e) {
      this.onLog(`[stt:error] ${(e as Error).message}`);
      throw e;
    }
    this.onLog("[stt] WS abierto, iniciando mic…");

    LiveAudioStream.init({
      sampleRate: 16000,
      channels: 1,
      bitsPerSample: 16,
      audioSource: 6,
      bufferSize: 4096,
      wavFile: "",
    });
    let chunks = 0;
    const onData = (b64: string) => {
      chunks++;
      stt.sendBase64Pcm(b64);
    };
    LiveAudioStream.on("data", onData);
    LiveAudioStream.start();
    this.onLog("[stt] grabando (suelta el botón para terminar)…");

    const startedAt = Date.now();
    const MAX_MS = 8000;
    while (!stt.endOfTurn && !stt.failed && Date.now() - startedAt < MAX_MS) {
      if (!isActive()) {
        stt.forceEndpoint();
      }
      await new Promise((r) => setTimeout(r, 80));
    }

    LiveAudioStream.stop();
    (LiveAudioStream as { removeAllListeners?: (e: string) => void }).removeAllListeners?.("data");
    const result = stt.terminate();
    this.onLog(`[stt] fin: chunks_mic=${chunks}, transcript="${result}"`);
    return result;
  }

  isConnected(): boolean {
    return this.sessionId != null;
  }

  async dispose(): Promise<void> {
    this.gpsWatch?.remove();
    this.streamSubs.forEach((s) => s?.remove());
    this.streamSubs = [];
    if (this.sessionId) {
      try {
        await stopSession(this.sessionId);
      } catch {
        /* noop */
      }
      this.sessionId = undefined;
    }
  }
}
