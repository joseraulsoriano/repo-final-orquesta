import { Gps } from "../net/types";

/**
 * Frontera con el hardware Gen 2 vía DAT. Todo lo específico de Meta vive detrás
 * de esta interfaz; el orquestador (SuperFlow) solo conoce esto.
 */
export interface GlassesBridge {
  /** Inicializa DAT (configure, permisos, sesión). Llamar una vez al arrancar. */
  init(opts?: { mockVideoUri?: string }): Promise<void>;

  /** ID de sesión DAT activa (para EMWDATStreamView). */
  getSessionId(): string | undefined;

  captureFrameJpegBase64(): Promise<string>;

  gps(): Gps | undefined;

  playTts(audioMp3: ArrayBuffer): Promise<void>;

  vibrate(ms: number): void;

  /**
   * PTT: mic → AssemblyAI streaming → transcript.
   * @param isActive mientras devuelva true sigue escuchando; al false → forceEndpoint.
   */
  listenOnce(isActive?: () => boolean): Promise<string>;

  isConnected(): boolean;

  /** Cierra sesión DAT al salir de la app. */
  dispose(): Promise<void>;
}
