/**
 * Puente Proxy Worker
 *
 * Proxies requests to Claude, ElevenLabs and AssemblyAI so the app never
 * ships with raw API keys. Keys are stored as Cloudflare secrets.
 *
 * Routes:
 *   POST /chat             → Anthropic Messages API (streaming)
 *   POST /tts              → ElevenLabs TTS API
 *   POST /transcribe-token → AssemblyAI streaming token
 *   POST /fusion/describe  → vision batch → SceneJSON | ProductJSON (Fase 2)
 *   POST /fusion/recognize → reconocer contactos en escena → PersonasJSON
 *   POST /rag/query        → layout/contexto RAG → skip_vision (Fase 4)
 *   POST /agents/super     → Hermes-lite decisión lista/confirmación (Fase 4)
 *   POST /agents/guide        → orquestador guía (swarm 01)
 *   POST /agents/platform     → orquestador maestro always-on + historial blackboard
 *   POST /gemini/live-token→ token efímero Gemini Live, modo Escaneo (Fase 2 opc.)
 */

import { parseJsonLoose } from "./parseJson";

// Modelos: visión batch (SLA ≤8s) y Hermes solo-texto (más barato).
const DEFAULT_VISION_MODEL = "claude-sonnet-4-6";
const DEFAULT_CONTINUOUS_VISION_MODEL = "claude-haiku-4-5";
const DEFAULT_HERMES_MODEL = "claude-haiku-4-5";
const MAX_IMAGE_BASE64_CHARS = 6_000_000;
const MAX_TTS_TEXT_CHARS = 2_000;

// Modelo Gemini Live para el modo "Escaneo estante denso".
const DEFAULT_GEMINI_LIVE_MODEL = "gemini-3.1-flash-live-preview";
const GEMINI_LIVE_WS_URL =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent";

interface Env {
  ANTHROPIC_API_KEY: string;
  ELEVENLABS_API_KEY: string;
  ELEVENLABS_VOICE_ID: string;
  ASSEMBLYAI_API_KEY: string;
  VISION_MODEL?: string;
  VISION_CONTINUOUS_MODEL?: string;
  HERMES_MODEL?: string;
  WORKER_API_KEY?: string;
  GEMINI_API_KEY?: string;
  GEMINI_LIVE_MODEL?: string;
}

function requireAuth(request: Request, env: Env): Response | null {
  if (!env.WORKER_API_KEY) return null;
  const key = request.headers.get("x-puente-key");
  if (key !== env.WORKER_API_KEY) {
    return jsonError("Unauthorized", 401);
  }
  return null;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // /transcribe-token y /session/context son idempotentes — aceptan GET o POST.
    if (
      request.method !== "POST" &&
      url.pathname !== "/transcribe-token" &&
      url.pathname !== "/session/context" &&
      url.pathname !== "/session/list" &&
      url.pathname !== "/health"
    ) {
      return new Response("Method not allowed", { status: 405 });
    }

    if (url.pathname === "/health" && request.method === "GET") {
      return new Response(
        JSON.stringify({
          ok: true,
          anthropic: Boolean(env.ANTHROPIC_API_KEY?.trim()),
          assemblyai: Boolean(env.ASSEMBLYAI_API_KEY?.trim()),
          elevenlabs: Boolean(env.ELEVENLABS_API_KEY?.trim()),
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }

    const authErr = requireAuth(request, env);
    if (authErr) return authErr;

    try {
      if (url.pathname === "/chat") {
        return await handleChat(request, env);
      }

      if (url.pathname === "/tts") {
        return await handleTTS(request, env);
      }

      if (url.pathname === "/transcribe-token") {
        return await handleTranscribeToken(env);
      }

      if (url.pathname === "/fusion/describe") {
        return await handleFusionDescribe(request, env);
      }

      if (url.pathname === "/fusion/recognize") {
        return await handleFusionRecognize(request, env);
      }

      if (url.pathname === "/rag/query") {
        return await handleRagQuery(request);
      }

      if (url.pathname === "/agents/super") {
        return await handleAgentsSuper(request, env);
      }

      if (url.pathname === "/agents/orchestrate") {
        return await handleAgentsOrchestrate(request, env);
      }

      if (url.pathname === "/agents/guide") {
        return await handleAgentsGuide(request, env);
      }

      if (url.pathname === "/agents/platform") {
        return await handleAgentsPlatform(request, env);
      }

      if (url.pathname === "/session/observe") {
        return await handleSessionObserve(request);
      }

      if (url.pathname === "/session/context") {
        return await handleSessionContext(request);
      }

      if (url.pathname === "/session/list") {
        return handleSessionList();
      }

      if (url.pathname === "/gemini/live-token") {
        return await handleGeminiLiveToken(request, env);
      }
    } catch (error) {
      console.error(`[${url.pathname}] Unhandled error:`, error);
      return new Response(
        JSON.stringify({ error: String(error) }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    return new Response("Not found", { status: 404 });
  },
};

async function handleChat(request: Request, env: Env): Promise<Response> {
  const body = await request.text();

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[/chat] Anthropic API error ${response.status}: ${errorBody}`);
    return new Response(errorBody, {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(response.body, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") || "text/event-stream",
      "cache-control": "no-cache",
    },
  });
}

async function handleTranscribeToken(env: Env): Promise<Response> {
  const response = await fetch(
    "https://streaming.assemblyai.com/v3/token?expires_in_seconds=480",
    {
      method: "GET",
      headers: {
        authorization: env.ASSEMBLYAI_API_KEY,
      },
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[/transcribe-token] AssemblyAI token error ${response.status}: ${errorBody}`);
    return new Response(errorBody, {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  }

  const data = await response.text();
  return new Response(data, {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function handleTTS(request: Request, env: Env): Promise<Response> {
  // ES-MX: si la app no manda model_id, forzamos el modelo multilingüe.
  // Sin esto ElevenLabs usa el monolingüe inglés y el español suena mal.
  const raw = await request.text();
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = {};
  }
  if (!payload.model_id) payload.model_id = "eleven_multilingual_v2";
  const text = typeof payload.text === "string" ? payload.text : "";
  if (text.length > MAX_TTS_TEXT_CHARS) {
    return jsonError(`text excede ${MAX_TTS_TEXT_CHARS} caracteres`, 400);
  }
  const body = JSON.stringify(payload);
  const voiceId = env.ELEVENLABS_VOICE_ID;

  // Endpoint /stream → ElevenLabs emite chunks de audio según los genera.
  // El worker reenvía response.body tal cual, así que el first-byte llega
  // mucho antes que esperando el mp3 completo (SLA TTS first-audio 0.5s).
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?optimize_streaming_latency=4`,
    {
      method: "POST",
      headers: {
        "xi-api-key": env.ELEVENLABS_API_KEY,
        "content-type": "application/json",
        accept: "audio/mpeg",
      },
      body,
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[/tts] ElevenLabs API error ${response.status}: ${errorBody}`);
    return new Response(errorBody, {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(response.body, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") || "audio/mpeg",
    },
  });
}

/* -------------------------------------------------------------------------
 * POST /fusion/describe — visión batch → SceneJSON | ProductJSON
 *
 * Loop cognitivo Puente (Fase 2 CHECKLIST). Recibe un frame POV de las gafas
 * Gen 2, lo manda a Claude con el prompt del módulo (sentido | producto) y
 * devuelve un FusionResponse listo para TTS + Hermes.
 *
 * Contrato: shared/types/schemas.md (FusionResponse) y puente/CLAUDE.md §6.
 * Prompts fuente de verdad: shared/prompts/{sentido,producto-super}.md.
 * ------------------------------------------------------------------------- */

interface FusionRequest {
  image_base64: string;
  module: "sentido" | "producto";
  transcript?: string;
  continuous?: boolean;
  locale?: string;
  rag_context?: string;
  profile?: { domains?: string[] };
  // Sólo módulo producto:
  item_buscado?: string;
  marca_preferida?: string;
  // Metadata del teléfono (NO de las gafas): el modelo no la puede inventar.
  // Las gafas solo dan frame+timestamp; GPS/session/super los pone la app DAT.
  gps?: { lat: number; lng: number; accuracy_m?: number };
  timestamp?: string;
  session_id?: string;
  super_id?: string;
  frame_id?: string;
}

const NADA = "(sin dato)";

// Prompt Sentido — espejo de shared/prompts/sentido.md. Mantener en sync.
function sentidoSystemPrompt(req: FusionRequest): string {
  return `Eres Puente Sentido, compañero de orientación espacial para personas con baja visión en México.

HARDWARE: Ray-Ban Meta Gen 2. El usuario SOLO escucha por altavoces. No hay pantalla.

IMAGEN: POV vertical 9:16 desde la frente, caminando en espacio interior o urbano.

CONTEXTO RAG (si viene):
${req.rag_context || NADA}

TRANSCRIPT USUARIO (si viene):
${req.transcript || NADA}

REGLAS:
- Español mexicano claro. Frases cortas (1–2 salvo que pidan más).
- Escrito para OÍDO: sin listas, markdown, emojis, símbolos raros.
- Referencias egocéntricas: "a tu derecha", "a tu izquierda", "adelante", "detrás".
- Prioriza SEGURIDAD: vehículos, escalones, postes, personas → tono alerta.
- No digas "haz clic" ni referencias de UI digital.
- No inventes objetos que no veas con confianza razonable.
- Apoyo complementario — no sustituyes bastón ni perro guía.

AL FINAL de tu respuesta (no leer en voz), append tags:
[SPATIAL:direccion:objeto:distancia?]
Direcciones: derecha, izquierda, adelante, atras, alerta
Distancia opcional: cerca, media, lejos
Si nada relevante: [SPATIAL:none]

RESPONDE SOLO CON JSON (sin texto adicional ni \`\`\`):
{
  "speech": "texto limpio para TTS sin tags",
  "scene_type": "entrada|pasillo|caja|exterior|otro",
  "spatial": {
    "adelante": { "label": "...", "distancia": "...", "transitable": true },
    "izquierda": { "label": "...", "distancia": "..." },
    "derecha": { "label": "...", "distancia": "..." },
    "alerta": null
  },
  "personas": 0,
  "confianza": 0.0,
  "spatial_tags": ["[SPATIAL:...]"]
}`;
}

// Prompt Producto — espejo de shared/prompts/producto-super.md. Mantener en sync.
function productoSystemPrompt(req: FusionRequest): string {
  return `Eres Puente Producto, asistente para identificar productos en supermercado para persona ciega en México.

HARDWARE: Gen 2 — respuesta solo por audio.

CONTEXTO:
- Item buscado en lista: ${req.item_buscado || NADA}
- Preferencia marca: ${req.marca_preferida || NADA}
- RAG estante: ${req.rag_context || NADA}
- Transcript usuario: ${req.transcript || NADA}

REGLAS:
- Lee etiqueta visible: nombre, marca, presentación, precio si visible.
- Compara con item buscado. Score match 0–1.
- Si precio visible en MXN, inclúyelo.
- speech: 1–2 oraciones, confirma producto y pregunta "¿Lo tomas?" si match alto.
- Si no match: describe qué ves y alternativas en estante.
- Si no legible: pide que acerque el producto.
- Español MX, para oído, sin markdown.

RESPONDE SOLO CON JSON (sin texto adicional ni \`\`\`):
{
  "speech": "...",
  "producto": {
    "nombre": "...",
    "marca": "...",
    "presentacion": "...",
    "categoria": "lacteos|panaderia|...",
    "precio_visible": null,
    "moneda": "MXN"
  },
  "match_lista": {
    "item_buscado": "...",
    "match": true,
    "score": 0.91
  },
  "alternativas_visibles": [
    { "marca": "...", "match_parcial": true }
  ],
  "confianza": 0.88
}`;
}

async function handleFusionDescribe(request: Request, env: Env): Promise<Response> {
  let req: FusionRequest;
  try {
    req = (await request.json()) as FusionRequest;
  } catch {
    return jsonError("Body inválido: se esperaba JSON", 400);
  }

  if (!req.image_base64) {
    return jsonError("Falta image_base64", 400);
  }
  if (!env.ANTHROPIC_API_KEY?.trim()) {
    return jsonError(
      "ANTHROPIC_API_KEY vacía en el worker. Rellena puente/backend/worker/.dev.vars y reinicia wrangler dev.",
      503
    );
  }
  if (req.image_base64.length > MAX_IMAGE_BASE64_CHARS) {
    return jsonError("image_base64 demasiado grande", 413);
  }
  const module = req.module === "producto" ? "producto" : "sentido";

  // Acepta data URL ("data:image/jpeg;base64,....") o base64 pelado.
  const commaIdx = req.image_base64.indexOf(",");
  const isDataUrl = req.image_base64.startsWith("data:") && commaIdx !== -1;
  const imageData = isDataUrl
    ? req.image_base64.slice(commaIdx + 1)
    : req.image_base64;
  const mediaType = isDataUrl
    ? req.image_base64.slice(5, req.image_base64.indexOf(";"))
    : "image/jpeg";

  const system =
    module === "producto" ? productoSystemPrompt(req) : sentidoSystemPrompt(req);

  const userText =
    module === "sentido" && req.continuous
      ? "Modo continuo. Solo habla si hay cambio relevante o alerta. Si no hay cambio, speech vacío."
      : req.transcript
        ? `El usuario preguntó: "${req.transcript}". Responde usando la imagen POV.`
        : "Describe la escena según las reglas.";

  const isContinuousSentido = module === "sentido" && !!req.continuous;
  const isBriefGreeting =
    module === "sentido" &&
    !req.continuous &&
    typeof req.transcript === "string" &&
    req.transcript.includes("Saludo inicial");

  const visionModel = isContinuousSentido
    ? env.VISION_CONTINUOUS_MODEL || DEFAULT_CONTINUOUS_VISION_MODEL
    : env.VISION_MODEL || DEFAULT_VISION_MODEL;
  const maxTokens = isContinuousSentido
    ? 256
    : isBriefGreeting
      ? 280
      : module === "producto"
        ? 768
        : 512;

  const anthropicBody = JSON.stringify({
    model: visionModel,
    max_tokens: maxTokens,
    system,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: imageData },
          },
          { type: "text", text: userText },
        ],
      },
    ],
  });

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: anthropicBody,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[/fusion/describe] Anthropic error ${response.status}: ${errorBody}`);
    return new Response(errorBody, {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  }

  const data = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const rawText =
    data.content?.find((b) => b.type === "text")?.text?.trim() || "";

  const structured = parseJsonLoose(rawText);
  if (!structured) {
    console.error(`[/fusion/describe] No se pudo parsear JSON del modelo: ${rawText}`);
    return jsonError("El modelo no devolvió JSON válido", 502);
  }

  // Fusiona metadata del teléfono (GPS/timestamp/IDs) — el modelo no la conoce.
  mergeDeviceMetadata(structured, req, module);

  // speech limpio (defensivo: quita cualquier [SPATIAL:...] que se haya colado).
  const speech = stripSpatialTags(String(structured.speech || "")).trim();
  const spatialTags = extractSpatialTags(structured, rawText);
  const alert = isAlert(module, structured, spatialTags);

  const fusionResponse = {
    speech,
    structured,
    spatial_tags: spatialTags,
    alert,
    module,
  };

  return new Response(JSON.stringify(fusionResponse), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

// --- helpers fusion ---

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const SPATIAL_RE = /\[SPATIAL:[^\]]*\]/g;

function stripSpatialTags(text: string): string {
  return text.replace(SPATIAL_RE, "").replace(/\s{2,}/g, " ").trim();
}

// Extrae tags del campo structured.spatial_tags o, como respaldo, del texto crudo.
function extractSpatialTags(structured: any, rawText: string): string[] {
  if (Array.isArray(structured.spatial_tags) && structured.spatial_tags.length) {
    return structured.spatial_tags.map((t: unknown) => String(t));
  }
  return rawText.match(SPATIAL_RE) || [];
}

// Parser tolerante movido a ./parseJson.ts (tests unitarios).

function isAlert(module: string, structured: any, tags: string[]): boolean {
  if (module !== "sentido") return false;
  if (structured?.spatial?.alerta) return true;
  return tags.some((t) => /\[SPATIAL:alerta/i.test(t));
}

// Inyecta los campos que SOLO conoce el teléfono (no el modelo ni las gafas):
// schema_version, timestamp, IDs de sesión/frame, GPS y super_id.
function mergeDeviceMetadata(
  structured: any,
  req: FusionRequest,
  module: string
): void {
  structured.schema_version = "1.0";
  structured.timestamp = req.timestamp || new Date().toISOString();
  if (req.frame_id) structured.frame_id = req.frame_id;
  if (module === "sentido") {
    if (req.session_id) structured.session_id = req.session_id;
    if (req.gps) structured.gps = req.gps;
    if (req.super_id) structured.super_id = req.super_id;
  }
}

/* -------------------------------------------------------------------------
 * POST /fusion/recognize — reconocer contactos en la escena POV
 *
 * Compara el frame POV de las gafas contra las fotos de referencia de los
 * contactos del usuario (multi-imagen a Claude) y devuelve quién está y dónde,
 * egocéntrico, listo para TTS. Caso: persona ciega — "A tu izquierda está Andrea".
 *
 * Solo nombra a personas presentes en `contacts`; a cualquier otra la trata como
 * desconocida (nunca inventa identidad). Prompt fuente: shared/prompts/reconocer-personas.md.
 * ------------------------------------------------------------------------- */

interface ContactRef {
  name: string;
  relation?: string;
  image_base64: string;
}

interface RecognizeRequest {
  image_base64: string; // frame POV actual
  contacts: ContactRef[];
  transcript?: string;
  locale?: string;
}

const MAX_CONTACTS = 12;

// Acepta data URL o base64 pelado → { data, mediaType }.
function splitImage(b64: string): { data: string; mediaType: string } {
  const commaIdx = b64.indexOf(",");
  const isDataUrl = b64.startsWith("data:") && commaIdx !== -1;
  return {
    data: isDataUrl ? b64.slice(commaIdx + 1) : b64,
    mediaType: isDataUrl ? b64.slice(5, b64.indexOf(";")) : "image/jpeg",
  };
}

// Prompt Caras — espejo de shared/prompts/reconocer-personas.md. Mantener en sync.
function reconocerSystemPrompt(req: RecognizeRequest): string {
  return `Eres Puente Caras, asistente de reconocimiento social para una persona ciega en México.

HARDWARE: Ray-Ban Meta Gen 2. El usuario SOLO escucha por altavoces. No hay pantalla.

ENTRADA:
- Primero recibes una o varias FOTOS DE REFERENCIA de contactos, cada una con su nombre y relación.
- Al final recibes la ESCENA POV actual (vertical 9:16, desde la frente del usuario).

TRANSCRIPT USUARIO (si viene): ${req.transcript || NADA}

TAREA:
- Detecta las caras visibles en la ESCENA POV.
- Para cada cara, decide si coincide con algún CONTACTO de referencia.
- Solo asigna un nombre si la coincidencia es razonablemente clara. Ante la duda, trátala como persona desconocida.
- Nunca inventes un nombre ni adivines la identidad de quien no esté en los contactos.

REGLAS DE VOZ:
- Español mexicano, frases cortas (1–2), para el OÍDO: sin listas, markdown ni emojis.
- Referencias egocéntricas: "a tu izquierda", "a tu derecha", "enfrente de ti".
- Si reconoces a alguien: di su nombre y dónde está. Ej: "A tu izquierda está Andrea."
- Si hay alguien pero no es un contacto: "Hay una persona enfrente, no la reconozco."
- Si no hay personas: speech vacío.
- No describas rasgos físicos sensibles ni juzgues apariencia. Solo nombre, dirección y, si es claro, un gesto social (saluda, se acerca, está sentada).
- Apoyo complementario — no sustituyes bastón ni perro guía.

AL FINAL (no leer en voz), append tags:
[SPATIAL:direccion:nombre:distancia?]
Direcciones: izquierda, derecha, adelante, atras. Distancia opcional: cerca, media, lejos.
Si no hay personas: [SPATIAL:none]

RESPONDE SOLO CON JSON (sin texto adicional ni \`\`\`):
{
  "speech": "texto limpio para TTS sin tags",
  "personas": [
    { "nombre": "Andrea", "conocido": true, "direccion": "izquierda", "distancia": "cerca", "gesto": null, "confianza": 0.82 }
  ],
  "desconocidos": 0,
  "spatial_tags": ["[SPATIAL:izquierda:Andrea:cerca]"]
}`;
}

async function handleFusionRecognize(request: Request, env: Env): Promise<Response> {
  let req: RecognizeRequest;
  try {
    req = (await request.json()) as RecognizeRequest;
  } catch {
    return jsonError("Body inválido: se esperaba JSON", 400);
  }

  if (!req.image_base64) return jsonError("Falta image_base64 (frame POV)", 400);
  if (req.image_base64.length > MAX_IMAGE_BASE64_CHARS) {
    return jsonError("image_base64 demasiado grande", 413);
  }
  // contacts[] puede venir vacío: sin directorio cargado igual detecta presencia
  // ("hay una persona enfrente, no la reconozco") sin inventar identidad.
  const contacts = Array.isArray(req.contacts) ? req.contacts : [];
  if (contacts.length > MAX_CONTACTS) {
    return jsonError(`Máximo ${MAX_CONTACTS} contactos por llamada`, 400);
  }

  // content: [ (label + foto de referencia)*N , label + frame POV ]
  const content: Array<Record<string, unknown>> = [];
  for (const c of contacts) {
    if (!c?.name || !c?.image_base64) continue;
    const img = splitImage(c.image_base64);
    content.push({
      type: "text",
      text: `CONTACTO de referencia: ${c.name}${c.relation ? ` (${c.relation})` : ""}`,
    });
    content.push({
      type: "image",
      source: { type: "base64", media_type: img.mediaType, data: img.data },
    });
  }
  const pov = splitImage(req.image_base64);
  content.push({ type: "text", text: "ESCENA POV actual (¿quién está y dónde?):" });
  content.push({
    type: "image",
    source: { type: "base64", media_type: pov.mediaType, data: pov.data },
  });

  const anthropicBody = JSON.stringify({
    model: env.VISION_MODEL || DEFAULT_VISION_MODEL,
    max_tokens: 1024,
    system: reconocerSystemPrompt(req),
    messages: [{ role: "user", content }],
  });

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: anthropicBody,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[/fusion/recognize] Anthropic error ${response.status}: ${errorBody}`);
    return new Response(errorBody, {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  }

  const data = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const rawText = data.content?.find((b) => b.type === "text")?.text?.trim() || "";
  const structured = parseJsonLoose(rawText);
  if (!structured) {
    console.error(`[/fusion/recognize] No se pudo parsear JSON del modelo: ${rawText}`);
    return jsonError("El modelo no devolvió JSON válido", 502);
  }

  structured.schema_version = "1.0";
  structured.timestamp = new Date().toISOString();
  const speech = stripSpatialTags(String(structured.speech || "")).trim();
  const spatialTags = extractSpatialTags(structured, rawText);

  return new Response(
    JSON.stringify({ speech, structured, spatial_tags: spatialTags, module: "reconocer" }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

/* -------------------------------------------------------------------------
 * POST /rag/query — contexto RAG / layout del super
 *
 * MVP: lookup sembrado en memoria (sin vector store todavía — ver CHECKLIST
 * Fase 4: "MVP: JSON files OK"). Reemplazar por embeddings/SQLite cuando exista.
 * Habilita el escenario "2da visita: RAG hit pasillo 7 sin visión".
 *
 * Contrato: schemas.md → RAGQueryResponse · puente/CLAUDE.md §6.
 * ------------------------------------------------------------------------- */

interface RagQueryRequest {
  query: string;
  gps?: { lat: number; lng: number };
  super_id?: string;
  /** 1 = 1ra visita → forzar RAG miss (visión obligatoria). 2+ = layout sembrado. */
  visita_numero?: number;
}

// Layout sembrado del super demo (Walmart Portales, visita 2 indexada).
// Colección layout_super: categoría → pasillo + pista de voz.
const LAYOUT_SUPER: Record<string, Record<string, { pasillo: string; speech_hint: string }>> = {
  walmart_portales: {
    lacteos: { pasillo: "7", speech_hint: "Lácteos en el pasillo 7, a tu izquierda." },
    panaderia: { pasillo: "3", speech_hint: "Panadería en el pasillo 3, al fondo a la derecha." },
    frutas: { pasillo: "1", speech_hint: "Frutas y verduras en el pasillo 1, junto a la entrada." },
    limpieza: { pasillo: "12", speech_hint: "Limpieza y detergentes en el pasillo 12, al final." },
  },
};

// Mapa palabra → categoría (ES-MX). Pragmático para la demo.
const CATEGORIA_KEYWORDS: Array<[RegExp, string]> = [
  [/leche|lacteo|yogur|queso|crema|mantequilla/i, "lacteos"],
  [/pan|bolillo|tortilla|integral|panaderia/i, "panaderia"],
  [/manzana|fruta|verdura|platano|jitomate|aguacate/i, "frutas"],
  [/detergente|jabon|limpieza|cloro|suavizante/i, "limpieza"],
];

async function handleRagQuery(request: Request): Promise<Response> {
  let req: RagQueryRequest;
  try {
    req = (await request.json()) as RagQueryRequest;
  } catch {
    return jsonError("Body inválido: se esperaba JSON", 400);
  }
  if (!req.query) return jsonError("Falta query", 400);

  const miss = {
    hit: false,
    confidence: 0,
    skip_vision: false,
    speech_hint: "",
    chunks: [] as Array<{ collection: string; text: string; score: number }>,
  };

  // 1ra visita: RAG vacío → la app debe usar visión batch.
  if (req.visita_numero === 1) {
    return new Response(JSON.stringify(miss), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  const superId = req.super_id || "";
  const layout = LAYOUT_SUPER[superId];
  const categoria =
    CATEGORIA_KEYWORDS.find(([re]) => re.test(req.query))?.[1] || null;

  if (!layout || !categoria || !layout[categoria]) {
    // RAG miss → la app cae a visión batch (visita 1 / super no indexado).
    return new Response(JSON.stringify(miss), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  const entry = layout[categoria];
  const confidence = 0.87; // hit sembrado; con vector store sería el score real.
  const ragResponse = {
    hit: true,
    confidence,
    skip_vision: confidence > 0.85, // regla rag-inject.md
    speech_hint: entry.speech_hint,
    chunks: [
      {
        collection: "layout_super",
        text: `pasillo ${entry.pasillo} = ${categoria}`,
        score: confidence,
      },
    ],
  };

  return new Response(JSON.stringify(ragResponse), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/* -------------------------------------------------------------------------
 * POST /agents/super — Hermes-lite: decisión (confirmar / alternativa / recall)
 *
 * Loop Think→Act→Observe sobre SessionState + USER + MEMORY + ProductJSON/RAG.
 * El backend expone el contrato Hermes (no corre Hermes completo en el teléfono,
 * puente/CLAUDE.md §8). Prompt fuente: shared/prompts/hermes-super.md.
 *
 * Contrato: puente/CLAUDE.md §6 · schemas.md → SessionState.
 * ------------------------------------------------------------------------- */

interface AgentsSuperRequest {
  transcript?: string;
  structured?: Record<string, any>;
  session_state?: Record<string, any>;
  action?: "confirm" | "alternativa" | "recall";
  // Hermes-lite: el teléfono manda perfil/memoria (filesystem o env).
  user_md?: string;
  memory_md?: string;
}

function hermesSystemPrompt(req: AgentsSuperRequest): string {
  return `Eres el agente de decisión Puente para compras en supermercado.

ENTRADAS:
- SessionState: ${JSON.stringify(req.session_state || {})}
- USER profile: ${req.user_md || NADA}
- MEMORY: ${req.memory_md || NADA}
- Último ProductJSON o RAG: ${JSON.stringify(req.structured || {})}
- Transcript usuario: ${req.transcript || NADA}
- Acción solicitada: ${req.action || "auto"}

ACCIONES POSIBLES:
- CONFIRMAR — match alto, pedir "sí/no" voz
- ALTERNATIVA — proponer otra marca
- RECALL — responder "¿qué me falta?"
- NAVEGAR — siguiente pasillo sugerido
- MEMORY_WRITE — guardar preferencia o compra completada
- ALERTA — interrumpir por seguridad
- IDLE — nada que hacer

REGLAS:
- Español MX, frases cortas para TTS, sin markdown.
- Confirmaciones destructivas (marcar comprado) requieren "sí" explícito.
- Si usuario dice "sí" y había pending_confirm: actualizar lista, marcar item done.
- Recall: leer items pending + sugerir siguiente.
- No inventar items en la lista.
- Devuelve session_state COMPLETO y actualizado (no parcial).

RESPONDE SOLO CON JSON (sin texto adicional ni \`\`\`):
{
  "speech": "...",
  "action": "CONFIRMAR|ALTERNATIVA|RECALL|NAVEGAR|MEMORY_WRITE|ALERTA|IDLE",
  "pending_confirm": false,
  "session_state": { /* actualizado completo */ },
  "memory_ops": []
}`;
}

async function handleAgentsSuper(request: Request, env: Env): Promise<Response> {
  let req: AgentsSuperRequest;
  try {
    req = (await request.json()) as AgentsSuperRequest;
  } catch {
    return jsonError("Body inválido: se esperaba JSON", 400);
  }

  const anthropicBody = JSON.stringify({
    model: env.HERMES_MODEL || DEFAULT_HERMES_MODEL,
    max_tokens: 1024,
    system: hermesSystemPrompt(req),
    messages: [
      { role: "user", content: req.transcript || "Decide el siguiente paso." },
    ],
  });

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: anthropicBody,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[/agents/super] Anthropic error ${response.status}: ${errorBody}`);
    return new Response(errorBody, {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  }

  const data = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const rawText =
    data.content?.find((b) => b.type === "text")?.text?.trim() || "";
  const decision = parseJsonLoose(rawText);
  if (!decision) {
    console.error(`[/agents/super] No se pudo parsear JSON del modelo: ${rawText}`);
    return jsonError("El modelo no devolvió JSON válido", 502);
  }

  // Contrato §6: { speech, session_state, pending_confirm } (+ action/memory_ops).
  const agentResponse = {
    speech: stripSpatialTags(String(decision.speech || "")).trim(),
    session_state: decision.session_state ?? req.session_state ?? {},
    pending_confirm: Boolean(decision.pending_confirm),
    action: decision.action || "IDLE",
    memory_ops: Array.isArray(decision.memory_ops) ? decision.memory_ops : [],
  };

  return new Response(JSON.stringify(agentResponse), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/* -------------------------------------------------------------------------
 * POST /agents/orchestrate — Shopper Orchestrator (swarm una-linea-a-la-vez)
 *
 * Capa de ORQUESTACIÓN antes del TTS: recibe el transcript + el JSON de visión
 * (que ya produjo el sub-agente de visión en /fusion = Aisle Navigator / Product
 * Inspector) + el estado de la lista, TOMA LA DECISIÓN y compone el `speech`
 * final. Ese `speech` (el "Payload" del agente) es lo que el teléfono manda a
 * ElevenLabs. Prompts fuente: shared/prompts/agents/07_shopper_orquestador.md
 * (+ 08 navegador, 09 inspector, 10 gestor lista). Regla de Oro: cero invención.
 * ------------------------------------------------------------------------- */

interface OrchestrateRequest {
  transcript?: string;
  intent?: string; // pista del router del teléfono: ADD/WHERE/WHAT_IS/WHATS_LEFT/YES/NO
  structured?: Record<string, any>; // SceneJSON | ProductJSON de /fusion (si hubo visión)
  session_state?: Record<string, any>; // incluye lista_compra
  user_md?: string;
  memory_md?: string;
  locale?: string;
}

function shopperOrchestratorPrompt(req: OrchestrateRequest): string {
  return `Eres el SHOPPER ORCHESTRATOR de Puente: un compañero de compras para una persona con discapacidad visual que trae gafas con cámara. Eres el ÚNICO que le habla al usuario; los sub-agentes (Navegador de pasillos, Inspector de productos, Gestor de lista) trabajan en silencio y tú sintetizas su info en una respuesta natural.

REGLA DE ORO — CERO ALUCINACIONES / CERO INVENCIONES:
- No inventes pasillos, precios, marcas, caducidades ni items de la lista.
- Si la info de visión no contiene lo que se pide, dilo y propón explorar; NO adivines ubicaciones.
- Eres un GUÍA VIDENTE: descripciones objetivas, distancias en pasos, direcciones egocéntricas (izquierda, derecha, adelante) y reloj (a tus 12). Trato 100% digno, nunca condescendiente.

PRIORIDADES DE DECISIÓN:
1. Seguridad primero: si la visión reporta un obstáculo (carrito, derrame, persona), alértalo ANTES que cualquier otra cosa.
2. Proponer, nunca imponer: las rutas y pasos son sugerencias; termina con una pregunta de confirmación cuando aplique ("¿Te parece?").
3. Delegación implícita según el caso:
   - Dónde está algo (WHERE) → razona como Navegador: lee letreros/números de pasillo de la visión; si no se ven, dilo y sugiere avanzar.
   - Qué es / leer etiqueta (WHAT_IS) → razona como Inspector: si el texto está borroso/parcial, pide al usuario acercar o girar el producto; nunca adivines caducidad/marca.
   - Qué me falta (WHATS_LEFT) → la lista YA está en SessionState.lista_compra; léela AHÍ MISMO y nombra los items con status "pending" en el speech. No digas "déjame revisar" ni "un momento"; responde directo (ej. "Te faltan leche y pan."). Si no hay pendientes, dilo.
   - Quién está (WHO) → razona como Reconocedor social: la visión trae PersonasJSON con personas[] (cada una con nombre, conocido, direccion, distancia, gesto). Nombra SOLO a quien venga con conocido=true, indicando su dirección egocéntrica (ej. "A tu izquierda está Andrea."). A quien no sea contacto descríbelo como "una persona" sin inventar nombre (ej. "Hay una persona enfrente, no la reconozco."). Si personas[] viene vacío, di que no ves a nadie conocido. NUNCA inventes una identidad.
   - Agregar (ADD) → confirma el item agregado.
   - Confirmación (YES/NO) con pending_confirm → marca el item como comprado solo con "sí" explícito.

NUNCA des respuestas-relleno tipo "ahorita te digo" o "un momento mientras reviso": ya tienes los datos en las ENTRADAS, contesta con la info en el mismo turno.

ENTRADAS:
- Transcript del usuario: ${req.transcript || NADA}
- Intent (pista del router): ${req.intent || "auto"}
- Visión (SceneJSON/ProductJSON del sub-agente): ${JSON.stringify(req.structured || {})}
- SessionState (incluye lista_compra): ${JSON.stringify(req.session_state || {})}
- USER: ${req.user_md || NADA}
- MEMORY: ${req.memory_md || NADA}
- locale: ${req.locale || "es-MX"}

FORMATO DE SALIDA — el "Payload" va directo a TTS. Sé BREVE (la latencia importa):
- speech: español mexicano, para el OÍDO. Sin markdown, listas ni emojis. 1–2 oraciones.
- Si hay peligro físico inminente, pon alert=true.
- session_state: OMÍTELO si la lista no cambió (la app conserva el suyo). Inclúyelo SOLO si agregaste un item o marcaste uno como done; en ese caso devuelve la lista_compra completa. No borres items; márcalos done.

RESPONDE SOLO CON JSON COMPACTO (sin \`\`\` ni texto extra). No incluyas explicaciones:
{
  "speech": "...",
  "decision": "NAVEGAR|INSPECCIONAR|RECALL|RECONOCER|AGREGAR|CONFIRMAR|ACLARAR|ALERTA|IDLE",
  "pending_confirm": false,
  "alert": false
}`;
}

async function handleAgentsOrchestrate(request: Request, env: Env): Promise<Response> {
  let req: OrchestrateRequest;
  try {
    req = (await request.json()) as OrchestrateRequest;
  } catch {
    return jsonError("Body inválido: se esperaba JSON", 400);
  }

  const anthropicBody = JSON.stringify({
    model: env.HERMES_MODEL || DEFAULT_HERMES_MODEL,
    max_tokens: 384, // respuesta corta (speech + flags) → menos generación, menos latencia
    system: shopperOrchestratorPrompt(req),
    messages: [
      { role: "user", content: req.transcript || "Decide y compón la respuesta para el usuario." },
    ],
  });

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: anthropicBody,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[/agents/orchestrate] Anthropic error ${response.status}: ${errorBody}`);
    return new Response(errorBody, {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  }

  const data = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const rawText = data.content?.find((b) => b.type === "text")?.text?.trim() || "";
  const decision = parseJsonLoose(rawText);
  if (!decision) {
    console.error(`[/agents/orchestrate] No se pudo parsear JSON del modelo: ${rawText}`);
    return jsonError("El modelo no devolvió JSON válido", 502);
  }

  const orchestrateResponse = {
    speech: stripSpatialTags(String(decision.speech || "")).trim(),
    decision: decision.decision || "IDLE",
    rationale: decision.rationale || "",
    pending_confirm: Boolean(decision.pending_confirm),
    alert: Boolean(decision.alert),
    session_state: decision.session_state ?? req.session_state ?? {},
  };

  return new Response(JSON.stringify(orchestrateResponse), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/* -------------------------------------------------------------------------
 * POST /agents/guide — SIGHTED GUIDE ORCHESTRATOR (swarm 01_orquestador)
 *
 * Orquestador MAESTRO: el único que le habla al usuario. Recibe un paquete de
 * percepción (audio/visión/biometría/GPS ya procesados a "Markdown") y DECIDE
 * el control de la comunicación: a quién rutea, qué input necesita después
 * (cadencia), y si el loop continúa o cierra. La app es solo ejecutor.
 * Prompts fuente: shared/prompts/agents/01_orquestador.md + _directrices.md.
 * Regla de Oro: cero invención; lenguaje no directivo de guía vidente.
 * ------------------------------------------------------------------------- */

interface GuideRequest {
  audio_transcript?: string;
  vision_data?: Record<string, any> | string; // structured de /fusion o /cruce (ya procesado)
  biometrics?: Record<string, any>; // { hr, stress } — mock por ahora
  gps?: Record<string, any>;
  session?: Record<string, any>; // { module, turn }
  user_md?: string;
  memory_md?: string;
  locale?: string;
}

function sightedGuideOrchestratorPrompt(req: GuideRequest): string {
  const vision =
    typeof req.vision_data === "string"
      ? req.vision_data
      : JSON.stringify(req.vision_data || {});
  return `Eres el SIGHTED GUIDE ORCHESTRATOR de Puente: el enrutador central de una plataforma de accesibilidad multi-agente para una persona con discapacidad visual que usa gafas con cámara. Eres el ÚNICO que le habla al usuario; los sub-agentes especializados trabajan en silencio.

REGLA DE ORO — CERO ALUCINACIONES: nunca inventes entorno, identidades, semáforos ni datos que no vengan en las ENTRADAS. Eres un GUÍA VIDENTE: objetivo, distancias en pasos, direcciones egocéntricas (izquierda/derecha/adelante) y de reloj (a tus 12). Trato 100% digno, jamás condescendiente ni directivo ("el semáforo está rojo", NO "no cruces").

TÚ CONTROLAS LA COMUNICACIÓN — decides quién habla, qué entra y cuándo termina:
- decision: SPEAK (hablarle al usuario) | ROUTE (delegar en silencio a un subagente) | AWAIT (esperar más datos sin hablar) | TRIGGER (acción del SO).
- route (solo si decision=ROUTE): mobility | shopper | clinical | emergency | rag | digital.
- next_input: qué necesitas en el SIGUIENTE tick para continuar — FRAME (foto), AUDIO (escuchar), FRAME+AUDIO, o NONE. TÚ marcas la cadencia, no un timer.
- session: CONTINUE (sigue el loop) | CLOSE (la tarea terminó; volver a idle).
- triggers: acciones del SO en emergencia (ej. "Emergency_Call_911", "Notify_Contact_GPS").

PRIORIDADES (preemptan en este orden):
1. Peligro físico (fuego, caída, vehículo acercándose) → route=emergency, alert=true.
2. Movimiento/navegación/cruce de calle → route=mobility.
3. Estrés biométrico alto → route=clinical.
4. Entorno retail/supermercado → route=shopper.
Si el input es ambiguo (ej. solo "¿qué es eso?"), NO adivines: decision=SPEAK pidiendo aclaración objetiva.

NUNCA traslapes voz ni des relleno ("ahorita te digo"): responde con lo que ya hay en las ENTRADAS.

ENTRADAS (paquete de percepción):
[Audio_Transcript: ${req.audio_transcript || NADA}]
[Vision_Data: ${vision}]
[Biometrics: ${JSON.stringify(req.biometrics || {})}]
[GPS: ${JSON.stringify(req.gps || {})}]
[Session: ${JSON.stringify(req.session || {})}]
[USER: ${req.user_md || NADA}]
[MEMORY: ${req.memory_md || NADA}]
locale: ${req.locale || "es-MX"}

RESPONDE SOLO CON JSON COMPACTO (sin \`\`\` ni texto extra):
{
  "decision": "SPEAK|ROUTE|AWAIT|TRIGGER",
  "route": "mobility|shopper|clinical|emergency|rag|digital|null",
  "speech": "texto ES-MX para TTS, 1-2 oraciones, vacío si no hablas",
  "next_input": "FRAME|AUDIO|FRAME+AUDIO|NONE",
  "session": "CONTINUE|CLOSE",
  "triggers": [],
  "alert": false,
  "rationale": ""
}`;
}

async function handleAgentsGuide(request: Request, env: Env): Promise<Response> {
  let req: GuideRequest;
  try {
    req = (await request.json()) as GuideRequest;
  } catch {
    return jsonError("Body inválido: se esperaba JSON", 400);
  }

  const anthropicBody = JSON.stringify({
    model: env.HERMES_MODEL || DEFAULT_HERMES_MODEL,
    max_tokens: 384,
    system: sightedGuideOrchestratorPrompt(req),
    messages: [
      {
        role: "user",
        content: req.audio_transcript || "Evalúa las entradas y decide el control.",
      },
    ],
  });

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: anthropicBody,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[/agents/guide] Anthropic error ${response.status}: ${errorBody}`);
    return new Response(errorBody, {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  }

  const data = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const rawText = data.content?.find((b) => b.type === "text")?.text?.trim() || "";
  const decision = parseJsonLoose(rawText);
  if (!decision) {
    console.error(`[/agents/guide] No se pudo parsear JSON del modelo: ${rawText}`);
    return jsonError("El modelo no devolvió JSON válido", 502);
  }

  const guideResponse = {
    decision: decision.decision || "AWAIT",
    route: decision.route ?? null,
    speech: stripSpatialTags(String(decision.speech || "")).trim(),
    next_input: decision.next_input || "NONE",
    session: decision.session || "CONTINUE",
    triggers: Array.isArray(decision.triggers) ? decision.triggers : [],
    alert: Boolean(decision.alert),
    rationale: decision.rationale || "",
  };

  return new Response(JSON.stringify(guideResponse), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/* -------------------------------------------------------------------------
 * POST /agents/platform — orquestador maestro always-on (iOS mic continuo)
 *
 * Un turno de voz → ruta (clinical/emergency/shopper/mobility/digital/…)
 * → speech para TTS o delegate para sub-flujo en el teléfono.
 * Persiste turno + memory_note en blackboard (session_id).
 * Prompts fuente: 01_orquestador + 03_clinico + 05_emergencias + _directrices.
 * ------------------------------------------------------------------------- */

interface PlatformRequest {
  transcript?: string;
  session_id?: string;
  vision_data?: Record<string, any>;
  gps?: Record<string, any>;
  biometrics?: Record<string, any>;
  session_state?: Record<string, any>;
  user_md?: string;
  memory_md?: string;
  locale?: string;
  active_module?: string;
}

function hintRouteFromTranscript(transcript: string): string | null {
  const s = transcript.toLowerCase();
  if (
    /no puedo respirar|me muero|emergencia|incendio|fuego|me ca[ií]|auxilio|911|ayuda urgente|peligro inmediato/.test(
      s
    )
  ) {
    return "emergency";
  }
  if (
    /ansiedad|p[aá]nico|nervios|estr[eé]s|miedo|ataque de|agobiad|me siento mal|no aguanto|temblor/.test(
      s
    )
  ) {
    return "clinical";
  }
  if (/qui[eé]n|reconoce|con qui[eé]n|enfrente de m[ií]|mis amigos|cerca.*(amig|conocid)/.test(s)) {
    return "social";
  }
  if (/correo|mail|gmail|outlook|abre mi|escribe a|whatsapp web|safari|mac|computadora/.test(s)) {
    return "digital";
  }
  if (
    /lista|super|compr|producto|leche|pan|huevo|precio|marca|estante|carrito|agrega|añade|donde est[aá] la/.test(
      s
    )
  ) {
    return "shopper";
  }
  if (/cruzar|calle|sem[aá]foro|tr[aá]fico|peaton|verde|rojo|puedo cruzar/.test(s)) {
    return "mobility";
  }
  if (/d[oó]nde (estoy|estamos|me encuentro)|en qu[eé] lugar|mi ubicaci|en qu[eé] calle/.test(s)) {
    return "location";
  }
  return null;
}

function formatBlackboardHistory(events: BlackboardEvent[]): string {
  return events
    .slice(-8)
    .map((e) => {
      if (e.type === "turn") {
        const u = String(e.transcript || "").slice(0, 100);
        const r = e.route || "?";
        const sp = String(e.speech || "").slice(0, 90);
        return `- turno: «${u}» → ${r}${sp ? ` · «${sp}»` : ""}`;
      }
      if (e.type === "memory") return `- memoria: ${String(e.note || e.memory_note || "").slice(0, 120)}`;
      if (e.type === "turn_in") return `- escuchado: ${String(e.transcript || "").slice(0, 80)}`;
      return `- ${e.type}: ${JSON.stringify(e).slice(0, 100)}`;
    })
    .join("\n");
}

function platformOrchestratorPrompt(
  req: PlatformRequest,
  history: string,
  routeHint: string | null
): string {
  const vision = JSON.stringify(req.vision_data || {});
  return `Eres el ORQUESTADOR MAESTRO Puente (Sighted Guide Orchestrator): único que habla al usuario con discapacidad visual usando gafas Meta Ray-Ban Gen 2.

REGLA DE ORO — CERO ALUCINACIONES: solo usa datos en ENTRADAS e HISTORIAL. Guía vidente: egocéntrico (izquierda/derecha/adelante), distancias en pasos, trato digno sin condescendencia.

SUB-AGENTES (produces el speech final tú; no digas "te paso con otro agente"):

1. CLINICAL (route=clinical) — ansiedad, pánico, estrés, nervios:
   - Grounding CBT / primeros auxilios psicológicos: respiración, anclaje sensorial, opciones no mandatos.
   - NUNCA diagnosticar ("tienes un ataque de pánico"), NUNCA leer biometría alarmante en voz alta.
   - 1-2 oraciones calmadas, tono profesional estable. delegate=null.

2. EMERGENCY (route=emergency) — peligro físico inmediato:
   - alert=true. Speech breve: contención + acción concreta (detenerse, alejarse, pedir ayuda).
   - delegate=null salvo que pida cruce explícito.

3. SHOPPER (route=shopper) — super, lista, productos:
   - Si basta texto/historial: responde tú (delegate=null).
   - Si necesita ver estante/producto: delegate=shopper y speech breve de transición ("Voy a mirar el estante").

4. MOBILITY (route=mobility) — cruce, calle, semáforo:
   - Si hay Vision_Data de cruce: responde con veredicto.
   - Si no hay visión: delegate=mobility + speech ("Te ayudo con el cruce, apunta al semáforo").

5. DIGITAL (route=digital) — correo, Mac, apps:
   - delegate=mac + speech breve confirmando acción.

6. SOCIAL (route=social) — quién está, reconocer contactos:
   - delegate=recognize + speech breve ("Voy a mirar quién está cerca").

7. GENERAL — saludos, preguntas ambiguas: aclara en 1 frase o responde con lo disponible.

ENTRADAS:
[Transcript: ${req.transcript || NADA}]
[Vision_Data: ${vision}]
[Biometrics: ${JSON.stringify(req.biometrics || {})}]
[GPS: ${JSON.stringify(req.gps || {})}]
[Session_State: ${JSON.stringify(req.session_state || {})}]
[Módulo activo: ${req.active_module || "asistente"}]
[USER: ${req.user_md || NADA}]
[MEMORY: ${req.memory_md || NADA}]
locale: ${req.locale || "es-MX"}
${routeHint ? `[Pista rápida: route=${routeHint}]` : ""}

HISTORIAL RECIENTE (blackboard):
${history || "sin historial previo"}

RESPONDE SOLO JSON (sin markdown):
{
  "route": "clinical|emergency|shopper|mobility|digital|social|rag|general",
  "speech": "texto ES-MX para TTS, 1-2 oraciones, escrito para oído",
  "delegate": null|"shopper"|"mobility"|"mac"|"recognize",
  "alert": false,
  "memory_note": "frase opcional para historial (hecho útil del turno)",
  "session_state": {},
  "rationale": ""
}
session_state solo si cambió lista_compra u otro campo; si no, {}.`;
}

async function handleAgentsPlatform(request: Request, env: Env): Promise<Response> {
  let req: PlatformRequest;
  try {
    req = (await request.json()) as PlatformRequest;
  } catch {
    return jsonError("Body inválido: se esperaba JSON", 400);
  }

  const transcript = String(req.transcript || "").trim();
  if (!transcript) return jsonError("Falta transcript", 400);

  const session_id = String(req.session_id || "default").trim();
  const now = Date.now();
  pruneBlackboard(now);
  const bb = getBoard(session_id, now);
  const history = formatBlackboardHistory(bb.events);
  const routeHint = hintRouteFromTranscript(transcript);

  bb.events.push({
    ts: now,
    type: "turn_in",
    transcript,
    active_module: req.active_module,
  });
  if (bb.events.length > BLACKBOARD_MAX_EVENTS) {
    bb.events.splice(0, bb.events.length - BLACKBOARD_MAX_EVENTS);
  }
  bb.updated = now;

  const anthropicBody = JSON.stringify({
    model: env.HERMES_MODEL || DEFAULT_HERMES_MODEL,
    max_tokens: 280,
    system: platformOrchestratorPrompt(req, history, routeHint),
    messages: [{ role: "user", content: transcript }],
  });

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: anthropicBody,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[/agents/platform] Anthropic error ${response.status}: ${errorBody}`);
    return new Response(errorBody, {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  }

  const data = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const rawText = data.content?.find((b) => b.type === "text")?.text?.trim() || "";
  const decision = parseJsonLoose(rawText);
  if (!decision) {
    console.error(`[/agents/platform] JSON inválido: ${rawText}`);
    return jsonError("El modelo no devolvió JSON válido", 502);
  }

  const speech = stripSpatialTags(String(decision.speech || "")).trim();
  const route = String(decision.route || routeHint || "general");
  const delegate = decision.delegate ?? null;
  const memoryNote = String(decision.memory_note || "").trim();

  bb.events.push({
    ts: Date.now(),
    type: "turn",
    transcript,
    route,
    speech,
    delegate,
    memory_note: memoryNote || undefined,
    rationale: decision.rationale,
  });
  if (memoryNote) {
    bb.events.push({ ts: Date.now(), type: "memory", note: memoryNote });
  }
  if (bb.events.length > BLACKBOARD_MAX_EVENTS) {
    bb.events.splice(0, bb.events.length - BLACKBOARD_MAX_EVENTS);
  }
  bb.updated = Date.now();

  const platformResponse = {
    route,
    speech,
    delegate,
    alert: Boolean(decision.alert),
    memory_note: memoryNote || null,
    session_state: decision.session_state ?? {},
    rationale: decision.rationale ?? "",
    history_saved: true,
    events: bb.events.length,
  };

  return new Response(JSON.stringify(platformResponse), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/* -------------------------------------------------------------------------
 * DB TEMP (pizarra de sesión) — el "espacio reutilizable" que el puerto llena
 * y los agentes leen/limpian. Patrón blackboard. NUESTRO trabajo = el ingestor.
 * MVP in-memory (por isolate; cambiar a Durable Object si debe sobrevivir
 * redeploys / multi-isolate, sin tocar el contrato).
 *   POST     /session/observe  → el puerto escribe percepción (turn/vision/gps/intro)
 *   GET|POST /session/context  → los agentes leen el contexto de la sesión
 * ------------------------------------------------------------------------- */

interface BlackboardEvent {
  ts: number;
  type: string; // "turn" | "vision" | "gps" | ...
  [k: string]: any;
}
interface SessionBlackboard {
  session_id: string;
  updated: number;
  intro?: any; // descripción inicial del entorno (1ra foto → Gemini)
  events: BlackboardEvent[];
}

const BLACKBOARD = new Map<string, SessionBlackboard>();
const BLACKBOARD_TTL_MS = 60 * 60 * 1000; // 1h: "temp"
const BLACKBOARD_MAX_EVENTS = 200; // buffer rodante

function pruneBlackboard(now: number): void {
  for (const [id, bb] of BLACKBOARD) {
    if (now - bb.updated > BLACKBOARD_TTL_MS) BLACKBOARD.delete(id);
  }
}

function getBoard(session_id: string, now: number): SessionBlackboard {
  let bb = BLACKBOARD.get(session_id);
  if (!bb) {
    bb = { session_id, updated: now, events: [] };
    BLACKBOARD.set(session_id, bb);
  }
  return bb;
}

async function handleSessionObserve(request: Request): Promise<Response> {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonError("Body inválido: se esperaba JSON", 400);
  }
  const session_id = String(body?.session_id || "").trim();
  if (!session_id) return jsonError("Falta session_id", 400);

  const now = Date.now();
  pruneBlackboard(now);
  const bb = getBoard(session_id, now);
  bb.updated = now;

  if (body.intro !== undefined) {
    // Siembra del entorno (1ra foto → Gemini). Reemplaza la intro previa.
    bb.intro = { ts: now, ...body.intro };
  } else {
    const ev: BlackboardEvent = { ts: now, type: String(body.type || "event") };
    for (const k of Object.keys(body)) {
      if (k !== "session_id" && k !== "type") ev[k] = body[k];
    }
    bb.events.push(ev);
    if (bb.events.length > BLACKBOARD_MAX_EVENTS) {
      bb.events.splice(0, bb.events.length - BLACKBOARD_MAX_EVENTS);
    }
  }

  return new Response(JSON.stringify({ ok: true, events: bb.events.length }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function handleSessionContext(request: Request): Promise<Response> {
  const url = new URL(request.url);
  let session_id = url.searchParams.get("session_id") || "";
  let limit = Number(url.searchParams.get("limit") || "0");
  if (!session_id && request.method === "POST") {
    try {
      const b: any = await request.json();
      session_id = String(b?.session_id || "");
      limit = Number(b?.limit || 0);
    } catch {
      /* noop */
    }
  }
  session_id = session_id.trim();
  if (!session_id) return jsonError("Falta session_id", 400);

  pruneBlackboard(Date.now());
  const bb = BLACKBOARD.get(session_id);
  if (!bb) {
    return new Response(JSON.stringify({ session_id, intro: null, events: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  const events = limit > 0 ? bb.events.slice(-limit) : bb.events;
  return new Response(
    JSON.stringify({ session_id, updated: bb.updated, intro: bb.intro ?? null, events }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

/** Debug: lista las sesiones activas en la DB temp (para verificar el ingestor). */
function handleSessionList(): Response {
  pruneBlackboard(Date.now());
  const sessions = [...BLACKBOARD.values()].map((bb) => ({
    session_id: bb.session_id,
    events: bb.events.length,
    has_intro: !!bb.intro,
    updated: bb.updated,
  }));
  return new Response(JSON.stringify({ sessions }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/* -------------------------------------------------------------------------
 * POST /gemini/live-token — token efímero para Gemini Live (modo Escaneo)
 *
 * El worker NO proxyea el WebSocket (añadiría RTT al SLA <1s de Live). Acuña
 * un token efímero con la key server-side y el teléfono conecta DIRECTO a
 * GEMINI_LIVE_WS_URL con ?access_token=<token>. Mismo patrón que /transcribe-token.
 *
 * liveConnectConstraints fija modelo + modalidad AUDIO + system instruction
 * para que el cliente no los altere. Fuente prompt: FLUJO §7.2.
 * ------------------------------------------------------------------------- */

interface GeminiLiveTokenRequest {
  items_pendientes?: string[];
  rag_context?: string;
  locale?: string;
}

function shelfScanSystemInstruction(req: GeminiLiveTokenRequest): string {
  const items = req.items_pendientes?.length
    ? req.items_pendientes.join(", ")
    : "lo que el usuario indique";
  const rag = req.rag_context ? `\nContexto del estante: ${req.rag_context}` : "";
  return `Eres guía de compras para una persona ciega en México, escaneando un estante de supermercado.
Describe en español mexicano claro, egocéntrico (izquierda, derecha, arriba, abajo, adelante), frases cortas.
El usuario busca: ${items}.${rag}
Prioriza: seguridad > producto correcto > precio.
Habla solo por audio; sin markdown ni listas. Si no estás seguro, pide que acerque el producto o use el botón de confirmar.
Apoyo complementario — no sustituyes bastón ni perro guía.`;
}

async function handleGeminiLiveToken(request: Request, env: Env): Promise<Response> {
  if (!env.GEMINI_API_KEY) {
    return jsonError("GEMINI_API_KEY no configurada (Fase 2 opcional)", 501);
  }

  let req: GeminiLiveTokenRequest = {};
  try {
    req = (await request.json()) as GeminiLiveTokenRequest;
  } catch {
    // body opcional — sin lista/RAG igual acuña token genérico
  }

  const model = env.GEMINI_LIVE_MODEL || DEFAULT_GEMINI_LIVE_MODEL;
  const modelPath = model.startsWith("models/") ? model : `models/${model}`;
  const now = Date.now();
  // REST AuthToken: las restricciones van en bidiGenerateContentSetup, y fieldMask
  // indica qué campos quedan BLOQUEADOS (el cliente no puede cambiarlos).
  const tokenBody = {
    uses: 1,
    expireTime: new Date(now + 30 * 60 * 1000).toISOString(), // token usable 30 min
    newSessionExpireTime: new Date(now + 60 * 1000).toISOString(), // abrir sesión <1 min
    fieldMask: "model,systemInstruction,generationConfig.responseModalities",
    bidiGenerateContentSetup: {
      model: modelPath,
      systemInstruction: {
        parts: [{ text: shelfScanSystemInstruction(req) }],
      },
      generationConfig: {
        responseModalities: ["AUDIO"],
      },
    },
  };

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1alpha/auth_tokens",
    {
      method: "POST",
      headers: {
        "x-goog-api-key": env.GEMINI_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify(tokenBody),
    }
  );

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[/gemini/live-token] Google error ${response.status}: ${errorBody}`);
    return new Response(errorBody, {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  }

  const data = (await response.json()) as { name?: string };
  // Devolvemos el token + dónde y con qué modelo conectar (el teléfono no lo sabe).
  return new Response(
    JSON.stringify({
      token: data.name, // pasar como ?access_token=<token> en el WS
      ws_url: GEMINI_LIVE_WS_URL,
      model: modelPath,
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}
