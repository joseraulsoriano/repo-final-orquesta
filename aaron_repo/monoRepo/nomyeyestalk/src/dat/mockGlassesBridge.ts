import { Gps } from "../net/types";
import { GlassesBridge } from "./glassesBridge";

/**
 * 1×1 JPEG válido (base64). Suficiente para que el pipeline corra de extremo a
 * extremo sin hardware; para una demo con visión real sustituye por un frame
 * de muestra vía `opts.frameBase64`.
 */
const TINY_JPEG_B64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAAAv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AfwD/2Q==";

export interface MockGlassesOptions {
  /** Cola de transcripts que `listenOnce` irá entregando, uno por PTT. */
  transcripts?: string[];
  /** Frame JPEG base64 a devolver en cada captura (default: 1×1 placeholder). */
  frameBase64?: string;
  /** GPS simulado (default: Portales, CDMX). */
  gps?: Gps;
  /** Logger opcional (mismo contrato que WrapperBridge). */
  onLog?: (s: string) => void;
  /** Latencia simulada por operación, ms (default 0 → tests rápidos). */
  latencyMs?: number;
}

/**
 * Implementación 100% en JS de {@link GlassesBridge} — simula las Ray-Ban Meta
 * Gen 2 sin DAT ni módulo nativo. Sirve para:
 *  - Pruebas de integración del loop completo (SuperFlow → Worker) headless.
 *  - Correr el cerebro en el teléfono sin gafas (EXPO_PUBLIC_USE_MOCK_GLASSES=1).
 *
 * No toca expo-meta-wearables-dat, así que es seguro de importar en Jest.
 */
export class MockGlassesBridge implements GlassesBridge {
  private readonly queue: string[];
  private readonly frame: string;
  private readonly _gps?: Gps;
  private readonly log: (s: string) => void;
  private readonly latency: number;
  private connected = false;
  /** Transcripts capturados/consumidos, para inspección en tests. */
  readonly consumed: string[] = [];

  constructor(opts: MockGlassesOptions = {}) {
    this.queue = [...(opts.transcripts ?? [])];
    this.frame = opts.frameBase64 ?? TINY_JPEG_B64;
    this._gps = opts.gps ?? { lat: 19.3637, lng: -99.1419, accuracy_m: 8 };
    this.log = opts.onLog ?? (() => {});
    this.latency = opts.latencyMs ?? 0;
  }

  /** Encola más frases de PTT en runtime (útil para la demo interactiva). */
  pushTranscript(t: string): void {
    this.queue.push(t);
  }

  private delay(): Promise<void> {
    return this.latency > 0
      ? new Promise((r) => setTimeout(r, this.latency))
      : Promise.resolve();
  }

  async init(): Promise<void> {
    this.log("[mock] gafas simuladas — sin DAT, sin hardware");
    await this.delay();
    this.connected = true;
  }

  getSessionId(): string | undefined {
    return this.connected ? "mock-session" : undefined;
  }

  async captureFrameJpegBase64(): Promise<string> {
    this.log("[mock] captura de frame simulada");
    await this.delay();
    return this.frame;
  }

  gps(): Gps | undefined {
    return this._gps;
  }

  async playTts(audioMp3: ArrayBuffer): Promise<void> {
    this.log(`[mock] reproduciendo TTS (${audioMp3.byteLength} bytes) por altavoces simulados`);
    await this.delay();
  }

  vibrate(ms: number): void {
    this.log(`[mock] vibración ${ms}ms`);
  }

  async listenOnce(_isActive?: () => boolean): Promise<string> {
    await this.delay();
    const t = this.queue.shift() ?? "";
    this.consumed.push(t);
    this.log(`[mock] PTT → "${t}"`);
    return t;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async dispose(): Promise<void> {
    this.connected = false;
    this.log("[mock] sesión simulada cerrada");
  }
}
