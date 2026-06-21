// Contratos JSON entre la app y el Cloudflare Worker.
// Espejo de puente/shared/types/schemas.md — mantener en sync con el worker.

export interface Gps {
  lat: number;
  lng: number;
  accuracy_m?: number;
}

// ---------- /fusion/describe ----------

export type FusionModule = "sentido" | "producto";

export interface FusionRequest {
  image_base64: string;
  module: FusionModule;
  transcript?: string;
  continuous?: boolean;
  locale?: string;
  rag_context?: string;
  // producto:
  item_buscado?: string;
  marca_preferida?: string;
  // metadata del teléfono (el modelo no la inventa):
  gps?: Gps;
  timestamp?: string;
  session_id?: string;
  super_id?: string;
  frame_id?: string;
}

export interface FusionResponse {
  speech: string;
  structured: Record<string, unknown>; // SceneJSON | ProductJSON
  spatial_tags: string[];
  alert: boolean;
  module: FusionModule;
}

// ---------- /fusion/recognize ----------

export interface ContactRef {
  name: string;
  relation?: string;
  image_base64: string; // foto de referencia del contacto
}

export interface RecognizeRequest {
  image_base64: string; // frame POV actual
  contacts: ContactRef[]; // máx 12 por llamada (worker: MAX_CONTACTS)
  transcript?: string;
  locale?: string;
}

export interface PersonaMatch {
  nombre: string | null; // nombre del contacto, o null si desconocido
  conocido: boolean;
  direccion: "izquierda" | "derecha" | "adelante" | "atras";
  distancia: "cerca" | "media" | "lejos";
  gesto: string | null; // social y neutral; null si nada claro
  confianza: number; // 0..1
}

export interface RecognizeStructured {
  speech: string;
  personas: PersonaMatch[];
  desconocidos: number;
  spatial_tags: string[];
  schema_version?: string;
  timestamp?: string;
}

export interface RecognizeResponse {
  speech: string;
  structured: RecognizeStructured;
  spatial_tags: string[];
  module: "reconocer";
}

// ---------- /rag/query ----------

export interface RagQueryRequest {
  query: string;
  gps?: Gps;
  super_id?: string;
  visita_numero?: number;
}

export interface RagChunk {
  collection: string;
  text: string;
  score: number;
}

export interface RagQueryResponse {
  hit: boolean;
  confidence: number;
  skip_vision: boolean;
  speech_hint: string;
  chunks: RagChunk[];
}

// ---------- /agents/super ----------

export interface AgentsSuperRequest {
  transcript?: string;
  structured?: Record<string, unknown>;
  session_state?: Record<string, unknown>;
  action?: "confirm" | "alternativa" | "recall";
  user_md?: string;
  memory_md?: string;
}

export interface AgentsSuperResponse {
  speech: string;
  session_state: Record<string, unknown>;
  pending_confirm: boolean;
  action: string;
  memory_ops: unknown[];
}

// ---------- /agents/orchestrate (Shopper Orchestrator) ----------

export interface OrchestrateRequest {
  transcript?: string;
  intent?: string; // ADD/WHERE/WHAT_IS/WHATS_LEFT/YES/NO
  structured?: Record<string, unknown>; // SceneJSON | ProductJSON de /fusion
  session_state?: Record<string, unknown>;
  user_md?: string;
  memory_md?: string;
  locale?: string;
}

export interface OrchestrateResponse {
  speech: string; // Payload → ElevenLabs
  decision: string;
  rationale: string;
  pending_confirm: boolean;
  alert: boolean;
  session_state: Record<string, unknown>;
}

// ---------- /gemini/live-token ----------

export interface GeminiLiveTokenRequest {
  items_pendientes?: string[];
  rag_context?: string;
  locale?: string;
}

export interface GeminiLiveTokenResponse {
  token: string;
  ws_url: string;
  model: string;
}

// ---------- /agents/guide ----------

export interface GuideRequest {
  audio_transcript: string;
  vision_data?: Record<string, unknown>;
  gps?: Gps;
  session?: Record<string, unknown>;
  user_md?: string;
  memory_md?: string;
  locale?: string;
}

export interface GuideResponse {
  decision: string;
  route: string | null;
  speech: string;
  alert: boolean;
  next_input?: string;
  session?: string;
}
