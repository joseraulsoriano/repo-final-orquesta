import {
  AgentsSuperRequest,
  AgentsSuperResponse,
  FusionRequest,
  FusionResponse,
  GeminiLiveTokenRequest,
  GeminiLiveTokenResponse,
  GuideRequest,
  GuideResponse,
  OrchestrateRequest,
  OrchestrateResponse,
  RagQueryRequest,
  RagQueryResponse,
  RecognizeRequest,
  RecognizeResponse,
} from "./types";
import { WORKER_API_KEY } from "../config";

/**
 * Cliente HTTP al Cloudflare Worker Puente.
 */
export class WorkerClient {
  constructor(private readonly baseUrl: string) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "content-type": "application/json" };
    if (WORKER_API_KEY) h["x-puente-key"] = WORKER_API_KEY;
    return h;
  }

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(this.baseUrl + path, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new WorkerError(path, res.status, text);
    }
    return JSON.parse(text) as T;
  }

  /** SceneJSON | ProductJSON. SLA: sentido ~5s, producto ~4s (a 504x896). */
  fusionDescribe(req: FusionRequest): Promise<FusionResponse> {
    return this.postJson<FusionResponse>("/fusion/describe", req);
  }

  /** Reconocer contactos en la escena POV → "A tu izquierda está Andrea". */
  fusionRecognize(req: RecognizeRequest): Promise<RecognizeResponse> {
    return this.postJson<RecognizeResponse>("/fusion/recognize", req);
  }

  /** skip_vision cuando confidence > 0.85 (2da visita). ~ms. */
  ragQuery(req: RagQueryRequest): Promise<RagQueryResponse> {
    return this.postJson<RagQueryResponse>("/rag/query", req);
  }

  /** Decisión Hermes-lite (confirmar / alternativa / recall). */
  agentsSuper(req: AgentsSuperRequest): Promise<AgentsSuperResponse> {
    return this.postJson<AgentsSuperResponse>("/agents/super", req);
  }

  /** Shopper Orchestrator: decide y compone la voz final (Payload → TTS). */
  orchestrate(req: OrchestrateRequest): Promise<OrchestrateResponse> {
    return this.postJson<OrchestrateResponse>("/agents/orchestrate", req);
  }

  /** Sighted Guide Orchestrator (swarm 01). */
  guide(req: GuideRequest): Promise<GuideResponse> {
    return this.postJson<GuideResponse>("/agents/guide", req);
  }

  /** Token efímero para conectar el WS de Gemini Live (modo Escaneo). */
  geminiLiveToken(req: GeminiLiveTokenRequest): Promise<GeminiLiveTokenResponse> {
    return this.postJson<GeminiLiveTokenResponse>("/gemini/live-token", req);
  }

  /** Escribe un evento de percepción en la DB temp (pizarra de sesión). El
   * puerto la llena; los agentes la leen vía /session/context. */
  sessionObserve(event: Record<string, unknown>): Promise<{ ok: boolean; events: number }> {
    return this.postJson<{ ok: boolean; events: number }>("/session/observe", event);
  }

  /** Token de AssemblyAI streaming (single-use). Devuelve el token string. */
  async transcribeToken(): Promise<string> {
    const headers: Record<string, string> = {};
    if (WORKER_API_KEY) headers["x-puente-key"] = WORKER_API_KEY;
    const res = await fetch(this.baseUrl + "/transcribe-token", { method: "POST", headers });
    const text = await res.text();
    if (!res.ok) throw new WorkerError("/transcribe-token", res.status, text);
    return (JSON.parse(text) as { token: string }).token;
  }

  /**
   * TTS → mp3. Devuelve el ArrayBuffer del audio (el worker fuerza
   * model_id=eleven_multilingual_v2 si no se manda). El caller lo escribe a
   * archivo y reproduce con expo-av.
   */
  async tts(text: string): Promise<ArrayBuffer> {
    const res = await fetch(this.baseUrl + "/tts", {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new WorkerError("/tts", res.status, await res.text());
    return res.arrayBuffer();
  }
}

export class WorkerError extends Error {
  constructor(public path: string, public status: number, public bodyText: string) {
    super(`Worker ${path} → HTTP ${status}: ${bodyText.slice(0, 300)}`);
  }
}
