import { CROSSING_WS_URL } from "../config";

export interface CrossingResponse {
  speech?: string;
  structured?: Record<string, unknown>;
  spatial_tags?: string[];
  alert?: boolean;
  module?: string;
  tone_hz?: number;
  skipped?: boolean;
  ok?: boolean;
  error?: string;
}

/** WebSocket → eyesstreelighttalk ws_bridge (contrato Puente cruce). */
export class CrossingClient {
  private ws: WebSocket | null = null;
  private pending: ((res: CrossingResponse) => void) | null = null;

  constructor(private readonly wsUrl: string = CROSSING_WS_URL) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.disconnect();
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error(`Crossing WS error: ${this.wsUrl}`));
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(String(ev.data)) as CrossingResponse;
          this.pending?.(data);
        } catch {
          /* ignore */
        }
        this.pending = null;
      };
    });
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
    this.pending = null;
  }

  async analyzeFrame(jpegBase64: string, sessionId?: string): Promise<CrossingResponse> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      await this.connect();
    }
    const ws = this.ws;
    if (!ws) throw new Error("Crossing WS no conectado");

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = null;
        reject(new Error("Crossing WS timeout"));
      }, 8000);
      this.pending = (res) => {
        clearTimeout(timer);
        resolve(res);
      };
      ws.send(JSON.stringify({ image_base64: jpegBase64, session_id: sessionId }));
    });
  }
}
