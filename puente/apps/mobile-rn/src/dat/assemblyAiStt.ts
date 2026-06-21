import { Buffer } from "buffer";

/**
 * STT en streaming con AssemblyAI Universal-3 Pro (spec v3).
 *
 * Auth: token efímero del worker (?token=) — la key nunca toca el teléfono.
 * Audio: PCM16 mono 16kHz, frames 50–1000 ms (los entrega react-native-live-audio-stream
 * en base64; aquí se decodifican a binario y se mandan por el WS).
 * Cierre: SIEMPRE Terminate (si no, la sesión sigue facturando hasta 3h).
 */
export class AssemblyAiStt {
  private ws?: WebSocket;
  transcript = "";
  endOfTurn = false;
  failed = false;

  constructor(private readonly token: string) {}

  connect(): Promise<void> {
    const url =
      "wss://streaming.assemblyai.com/v3/ws" +
      `?sample_rate=16000&speech_model=u3-rt-pro&token=${this.token}`;
    this.ws = new WebSocket(url);
    return new Promise((resolve, reject) => {
      const ws = this.ws!;
      ws.onopen = () => resolve();
      ws.onerror = () => {
        this.failed = true;
        reject(new Error("AssemblyAI WS error"));
      };
      ws.onmessage = (ev) => {
        const m = JSON.parse(String(ev.data));
        if (m.type === "Turn") {
          if (m.transcript) this.transcript = m.transcript; // siempre el texto actual
          if (m.end_of_turn) this.endOfTurn = true;
        } else if (m.type === "Termination") {
          this.endOfTurn = true;
        }
      };
    });
  }

  /** Envía un chunk PCM16 que llega en base64 (de react-native-live-audio-stream). */
  sendBase64Pcm(b64: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const bytes = Buffer.from(b64, "base64");
    // RN WebSocket acepta ArrayBuffer para frames binarios.
    this.ws.send(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  }

  forceEndpoint(): void {
    this.ws?.send(JSON.stringify({ type: "ForceEndpoint" }));
  }

  /** Termina limpio y devuelve el transcript final. */
  terminate(): string {
    try {
      this.ws?.send(JSON.stringify({ type: "Terminate" }));
      this.ws?.close(1000);
    } catch {
      /* noop */
    }
    return this.transcript;
  }
}
