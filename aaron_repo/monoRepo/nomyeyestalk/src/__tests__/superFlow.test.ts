import { SuperFlow } from "../core/superFlow";
import { PuenteSessionState, SessionState } from "../core/sessionState";
import { MockGlassesBridge } from "../dat/mockGlassesBridge";
import { WorkerClient } from "../net/workerClient";
import {
  ContactRef,
  FusionRequest,
  FusionResponse,
  OrchestrateRequest,
  OrchestrateResponse,
  RagQueryRequest,
  RagQueryResponse,
  RecognizeRequest,
  RecognizeResponse,
} from "../net/types";

/**
 * Worker falso: registra cada request para verificar que el frame de las gafas
 * simuladas, el GPS y el session_state fluyen hasta el worker (la "conexión
 * completa"). Las respuestas son canned, no tocan red ni APIs externas.
 */
class FakeWorker {
  fusionCalls: FusionRequest[] = [];
  recognizeCalls: RecognizeRequest[] = [];
  ragCalls: RagQueryRequest[] = [];
  orchestrateCalls: OrchestrateRequest[] = [];
  ttsCalls: string[] = [];

  ragHit = false; // por defecto miss → fuerza visión (1ra visita)

  async ragQuery(req: RagQueryRequest): Promise<RagQueryResponse> {
    this.ragCalls.push(req);
    return this.ragHit
      ? {
          hit: true,
          confidence: 0.9,
          skip_vision: true,
          speech_hint: "La leche está en el pasillo 7, a tu derecha.",
          chunks: [{ collection: "layout", text: "pasillo 7", score: 0.9 }],
        }
      : { hit: false, confidence: 0, skip_vision: false, speech_hint: "", chunks: [] };
  }

  async fusionDescribe(req: FusionRequest): Promise<FusionResponse> {
    this.fusionCalls.push(req);
    return {
      speech:
        req.module === "sentido"
          ? "Adelante a tu derecha hay un refrigerador con lácteos."
          : "Es leche Lala entera, un litro, treinta y dos pesos.",
      structured: { tipo: req.module },
      spatial_tags: ["[SPATIAL:derecha:refrigerador]"],
      alert: false,
      module: req.module,
    };
  }

  async fusionRecognize(req: RecognizeRequest): Promise<RecognizeResponse> {
    this.recognizeCalls.push(req);
    const conocido = req.contacts.length > 0;
    return {
      speech: conocido
        ? "A tu izquierda está Andrea."
        : "Hay una persona enfrente, no la reconozco.",
      structured: {
        speech: conocido ? "A tu izquierda está Andrea." : "Hay una persona enfrente.",
        personas: conocido
          ? [
              {
                nombre: "Andrea",
                conocido: true,
                direccion: "izquierda",
                distancia: "cerca",
                gesto: null,
                confianza: 0.88,
              },
            ]
          : [
              {
                nombre: null,
                conocido: false,
                direccion: "adelante",
                distancia: "media",
                gesto: null,
                confianza: 0,
              },
            ],
        desconocidos: conocido ? 0 : 1,
        spatial_tags: conocido ? ["[SPATIAL:izquierda:Andrea:cerca]"] : ["[SPATIAL:adelante:persona:media]"],
      },
      spatial_tags: conocido ? ["[SPATIAL:izquierda:Andrea:cerca]"] : ["[SPATIAL:adelante:persona:media]"],
      module: "reconocer",
    };
  }

  async orchestrate(req: OrchestrateRequest): Promise<OrchestrateResponse> {
    this.orchestrateCalls.push(req);
    let speech = "Listo.";
    if (req.intent === "WHATS_LEFT") speech = "Te falta leche y huevos.";
    else if (req.intent === "WHO") {
      const personas = (req.structured?.personas as Array<{ nombre?: string | null }>) ?? [];
      const conocida = personas.find((p) => p?.nombre);
      speech = conocida ? `A tu izquierda está ${conocida.nombre}.` : "Hay una persona enfrente, no la reconozco.";
    } else if (req.intent === "WHAT_IS") speech = "Es leche Lala entera, un litro.";
    else if (req.intent === "WHERE") speech = "Adelante a tu derecha hay un refrigerador con lácteos.";
    return {
      speech,
      decision: req.intent === "WHO" ? "RECONOCER" : "IDLE",
      rationale: "",
      pending_confirm: req.intent === "WHAT_IS",
      alert: false,
      session_state: { ubicacion_estimada: "pasillo 7" },
    };
  }

  async tts(text: string): Promise<ArrayBuffer> {
    this.ttsCalls.push(text);
    return new ArrayBuffer(64); // mp3 simulado
  }
}

function baseState(visita = 1): SessionState {
  return {
    session_id: "sesion-test",
    usuario_id: "u",
    super_id: "walmart_portales",
    visita_numero: visita,
    lista_compra: [],
    items_en_carrito: [],
    pending_confirm: false,
  };
}

function build(opts: {
  transcripts: string[];
  state?: SessionState;
  ragHit?: boolean;
  contacts?: ContactRef[];
}) {
  const worker = new FakeWorker();
  if (opts.ragHit) worker.ragHit = true;
  const glasses = new MockGlassesBridge({ transcripts: opts.transcripts });
  const state = opts.state ?? baseState();
  const states: PuenteSessionState[] = [];
  const speech: string[] = [];
  const flow = new SuperFlow(
    worker as unknown as WorkerClient,
    glasses,
    state,
    "Usuario test",
    "Sin historial",
    { onState: (s) => states.push(s), onSpeech: (t) => speech.push(t) },
    () => opts.contacts ?? []
  );
  return { worker, glasses, state, states, speech, flow };
}

describe("SuperFlow ↔ gafas simuladas ↔ worker (conexión completa)", () => {
  it("ADD: agrega item a la lista por voz y habla la confirmación", async () => {
    const { state, speech, worker, flow } = build({
      transcripts: ["Agrega leche a mi lista"],
    });
    await flow.handlePtt();
    expect(state.lista_compra).toEqual([{ item: "leche", status: "pending" }]);
    expect(speech[0]).toContain("leche");
    expect(worker.ttsCalls).toHaveLength(1); // se reprodujo TTS en las gafas
  });

  it("WHERE 1ra visita: RAG miss → captura frame de gafas → visión sentido", async () => {
    const { worker, speech, flow } = build({
      transcripts: ["¿Dónde está la leche?"],
      ragHit: false,
    });
    await flow.handlePtt();
    expect(worker.ragCalls).toHaveLength(1);
    expect(worker.ragCalls[0].visita_numero).toBe(1);
    // El frame de las gafas simuladas llegó al worker:
    expect(worker.fusionCalls).toHaveLength(1);
    expect(worker.fusionCalls[0].module).toBe("sentido");
    expect(worker.fusionCalls[0].image_base64.length).toBeGreaterThan(0);
    expect(worker.fusionCalls[0].gps).toBeDefined();
    expect(speech[0]).toContain("refrigerador");
  });

  it("WHERE 2da visita: RAG hit → skip visión, no captura frame", async () => {
    const { worker, speech, flow } = build({
      transcripts: ["¿Dónde está la leche?"],
      state: baseState(2),
      ragHit: true,
    });
    await flow.handlePtt();
    expect(worker.fusionCalls).toHaveLength(0); // skip_vision
    expect(speech[0]).toContain("pasillo 7");
  });

  it("WHAT_IS: producto → fusion(producto) + orquestador, deja pending_confirm", async () => {
    const { worker, state, flow } = build({
      transcripts: ["¿Qué producto es este?"],
    });
    await flow.handlePtt();
    expect(worker.fusionCalls[0].module).toBe("producto");
    expect(worker.orchestrateCalls[0].intent).toBe("WHAT_IS");
    expect(state.pending_confirm).toBe(true);
    expect(state.ubicacion_estimada).toBe("pasillo 7");
  });

  it("WHATS_LEFT: recall → orquestador sin visión", async () => {
    const { worker, speech, flow } = build({
      transcripts: ["¿Qué me falta de la lista?"],
    });
    await flow.handlePtt();
    expect(worker.fusionCalls).toHaveLength(0);
    expect(worker.orchestrateCalls[0].intent).toBe("WHATS_LEFT");
    expect(speech[0]).toContain("falta");
  });

  it("WHO: reconoce contacto → fusion/recognize con contacts → orquestador nombra a la persona", async () => {
    const { worker, speech, flow } = build({
      transcripts: ["¿Quién está enfrente de mí?"],
      contacts: [{ name: "Andrea", relation: "amiga", image_base64: "ZmFrZQ==" }],
    });
    await flow.handlePtt();
    // Capturó frame y mandó los contactos al worker de reconocimiento:
    expect(worker.recognizeCalls).toHaveLength(1);
    expect(worker.recognizeCalls[0].image_base64.length).toBeGreaterThan(0);
    expect(worker.recognizeCalls[0].contacts).toHaveLength(1);
    // PersonasJSON fluyó al orquestador con intent WHO:
    expect(worker.orchestrateCalls[0].intent).toBe("WHO");
    expect(worker.orchestrateCalls[0].structured?.personas).toBeDefined();
    expect(speech[0]).toContain("Andrea");
  });

  it("WHO sin contactos: trata a la persona como desconocida (no inventa nombre)", async () => {
    const { worker, speech, flow } = build({
      transcripts: ["¿Quién está?"],
      contacts: [],
    });
    await flow.handlePtt();
    expect(worker.recognizeCalls[0].contacts).toHaveLength(0);
    expect(speech[0].toLowerCase()).toContain("no la reconozco");
  });

  it("YES tras pending_confirm: resuelve la confirmación vía orquestador", async () => {
    const st = baseState();
    st.pending_confirm = true;
    const { worker, flow } = build({ transcripts: ["sí, tómalo"], state: st });
    await flow.handlePtt();
    expect(worker.orchestrateCalls[0].intent).toBe("YES");
  });

  it("transcript vacío: avisa y no llama al worker", async () => {
    const { worker, speech, flow } = build({ transcripts: [""] });
    await flow.handlePtt();
    expect(speech[0]).toContain("No te escuché");
    expect(worker.fusionCalls).toHaveLength(0);
    expect(worker.orchestrateCalls).toHaveLength(0);
  });

  it("loop multi-turno: emite estados LISTENING→PROCESSING→SPEAKING→IDLE", async () => {
    const { states, flow } = build({ transcripts: ["¿Dónde está la leche?"] });
    await flow.handlePtt();
    expect(states[0]).toBe("LISTENING");
    expect(states).toContain("PROCESSING");
    expect(states).toContain("SPEAKING");
    expect(states[states.length - 1]).toBe("CONNECTED_IDLE");
  });
});
