import { GlassesBridge } from "../dat/glassesBridge";
import { WorkerClient } from "../net/workerClient";
import { ContactRef } from "../net/types";
import { extractItem, intentOf } from "./intentRouting";
import { whereAmI } from "./location";
import { applyAgentState, pendientes, PuenteSessionState, SessionState } from "./sessionState";

export interface SuperFlowHooks {
  onState?: (s: PuenteSessionState) => void;
  onSpeech?: (text: string) => void;
}

/**
 * Fuente de contactos para reconocimiento social. Los contactos (nombre +
 * relación + foto de referencia) los libera la app de Meta; aquí se inyectan
 * como proveedor para no acoplar SuperFlow a un store concreto. Devuelve []
 * cuando no hay contactos cargados (recognize entonces solo dirá "una persona").
 */
export type ContactsProvider = () => ContactRef[] | Promise<ContactRef[]>;

/**
 * Orquestador del flujo super (FLUJO_SUPER_PERSONA_CIEGA.md).
 * visita_numero en session_state controla RAG hit (2+) vs visión obligatoria (1).
 */
export class SuperFlow {
  private pttActive = false;
  /** Loop "Sentido continuo": las gafas describen el entorno solas, sin PTT. */
  private continuousActive = false;
  /** Loop "Mic vivo": el micrófono queda encendido en escucha continua, sin botón. */
  private liveMicActive = false;
  /** true mientras el TTS suena por las gafas: el mic no debe grabar su propia voz. */
  private speaking = false;

  constructor(
    private readonly worker: WorkerClient,
    private readonly glasses: GlassesBridge,
    private readonly state: SessionState,
    private readonly userMd: string,
    private readonly memoryMd: string,
    private readonly hooks: SuperFlowHooks = {},
    private readonly contacts: ContactsProvider = () => []
  ) {}

  /** Señala fin de PTT (soltar botón). */
  releasePtt(): void {
    this.pttActive = false;
  }

  isSentidoContinuo(): boolean {
    return this.continuousActive;
  }

  /** Detiene el loop Sentido continuo. */
  stopSentidoContinuo(): void {
    this.continuousActive = false;
  }

  /**
   * Modo SIEMPRE-ENCENDIDO: las gafas en stream; cada ~frame se describe el
   * entorno solo (sin PTT). "Me pongo las Meta y me va diciendo qué hay."
   * Cede el turno al PTT si el usuario presiona (no traslapa voz). Termina con
   * stopSentidoContinuo().
   */
  async startSentidoContinuo(): Promise<void> {
    if (this.continuousActive) return;
    this.continuousActive = true;
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
    while (this.continuousActive) {
      this.setState("SENTIDO_CONTINUOUS");
      // Cede el turno: si el usuario está en PTT, no captures ni hables encima.
      if (this.pttActive) {
        await delay(300);
        continue;
      }
      try {
        const frame = await this.glasses.captureFrameJpegBase64();
        if (!this.continuousActive || this.pttActive) continue;
        const fusion = await this.worker.fusionDescribe({
          image_base64: frame,
          module: "sentido",
          continuous: true,
          locale: "es-MX",
          gps: this.glasses.gps(),
          session_id: this.state.session_id,
          frame_id: `f_${Date.now()}`,
        });
        // INGESTOR: cada frame describe → DB temp (los agentes leerán de aquí).
        this.worker
          .sessionObserve({
            session_id: this.state.session_id,
            type: "vision",
            scene: fusion.structured,
            speech: fusion.speech,
            frame_id: `f_${Date.now()}`,
          })
          .then((r) => this.hooks.onSpeech?.(`[db] vision → temp (events=${r.events})`))
          .catch((e) => this.hooks.onSpeech?.(`[db:error] ${(e as Error).message}`));
        if (this.continuousActive && !this.pttActive && fusion.speech?.trim()) {
          if (fusion.alert) this.glasses.vibrate(300);
          await this.speak(fusion.speech);
        }
      } catch (e) {
        this.hooks.onSpeech?.(`[sentido:error] ${(e as Error).message}`);
        await delay(1000);
      }
      await delay(1200); // respiro entre descripciones (evita spam de voz)
    }
    this.setState("CONNECTED_IDLE");
  }

  /**
   * MIC VIVO — el micrófono queda encendido al abrir la sesión (sin botón). Cada
   * turno de voz que cierra AssemblyAI (end_of_turn) se rutea al flujo. Convive
   * con el Sentido continuo: mientras el TTS suena (`speaking`) el mic no captura
   * (no graba su propia voz) y mientras procesa un turno toma `pttActive` para
   * que el Sentido ceda y no se traslapen las voces. Termina con stopLiveMic().
   */
  async startLiveMic(): Promise<void> {
    if (this.liveMicActive) return;
    this.liveMicActive = true;
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
    while (this.liveMicActive) {
      // No abras el mic mientras hablan las gafas o hay un turno en curso.
      if (this.speaking || this.pttActive) {
        await delay(150);
        continue;
      }
      let transcript = "";
      try {
        // isActive: corta la captura si arranca el TTS o se apaga el mic vivo.
        transcript = (
          await this.glasses.listenOnce(() => this.liveMicActive && !this.speaking)
        ).trim();
      } catch (e) {
        this.hooks.onSpeech?.(`[mic:error] ${(e as Error).message}`);
        await delay(500);
        continue;
      }
      if (!transcript) {
        await delay(120);
        continue;
      }
      // El TTS arrancó durante la captura → el transcript puede traer voz propia;
      // descártalo en vez de actuar sobre ruido.
      if (this.speaking) continue;
      this.pttActive = true; // el Sentido cede mientras atendemos al usuario.
      this.setState("PROCESSING");
      try {
        await this.routeTranscript(transcript);
      } catch (e) {
        this.hooks.onSpeech?.(`[mic:error] ${(e as Error).message}`);
      } finally {
        this.pttActive = false;
      }
    }
  }

  /** Apaga el loop Mic vivo. */
  stopLiveMic(): void {
    this.liveMicActive = false;
  }

  async handlePtt(): Promise<void> {
    this.pttActive = true;
    this.setState("LISTENING");
    const transcript = (
      await this.glasses.listenOnce(() => this.pttActive)
    ).trim();
    this.pttActive = false;

    if (!transcript) {
      return this.speak("No te escuché. Mantén el botón y vuelve a intentar.");
    }
    return this.routeTranscript(transcript);
  }

  /** Rutea un transcript ya capturado al sub-flujo según su intención. */
  private async routeTranscript(transcript: string): Promise<void> {
    const intent = intentOf(transcript);
    if (this.state.pending_confirm && (intent === "YES" || intent === "NO")) {
      return this.resolveConfirm(transcript);
    }

    switch (intent) {
      case "ADD":
        return this.addToList(transcript);
      case "WHERE_AM_I":
        return this.whereAmICurrently();
      case "WHERE":
        return this.navigate(transcript);
      case "WHAT_IS":
        return this.confirmProduct(transcript);
      case "WHATS_LEFT":
        return this.recall(transcript);
      case "WHO":
        return this.recognizePeople(transcript);
      case "YES":
      case "NO":
        return this.resolveConfirm(transcript);
      default:
        return this.recall(transcript);
    }
  }

  async addToList(transcript: string): Promise<void> {
    this.setState("PROCESSING");
    const item = extractItem(transcript);
    if (!item) {
      return this.speak("¿Qué quieres que agregue a tu lista?");
    }
    const yaEsta = this.state.lista_compra.some(
      (i) => i.item.toLowerCase() === item.toLowerCase()
    );
    if (yaEsta) {
      return this.speak(`${item} ya está en tu lista.`);
    }
    this.state.lista_compra.push({ item, status: "pending" });
    await this.speak(`Listo, agregué ${item} a tu lista.`);
  }

  /** "¿Dónde estoy?" → reverse geocode del GPS en tiempo real (on-device). */
  async whereAmICurrently(): Promise<void> {
    this.setState("PROCESSING");
    const gps = this.glasses.gps();
    if (!gps) {
      return this.speak("No tengo tu ubicación todavía. Activa el GPS y vuelve a intentar.");
    }
    const lugar = await whereAmI({ lat: gps.lat, lng: gps.lng });
    if (!lugar) {
      return this.speak("Tengo tu posición pero no pude leer la calle. Intenta de nuevo en un momento.");
    }
    await this.speak(`Estás en ${lugar}.`);
  }

  async navigate(transcript: string): Promise<void> {
    this.setState("PROCESSING");
    const rag = await this.worker.ragQuery({
      query: transcript,
      gps: this.glasses.gps(),
      super_id: this.state.super_id,
      visita_numero: this.state.visita_numero,
    });
    // Atajo rápido RAG-hit (<1s): se habla el hint sin pasar por el orquestador.
    if (rag.hit && rag.skip_vision) {
      this.state.ubicacion_estimada = rag.chunks[0]?.text ?? null;
      return this.speak(rag.speech_hint);
    }
    // Sub-agente de visión (Aisle Navigator) → JSON; el orquestador compone la voz.
    const frame = await this.glasses.captureFrameJpegBase64();
    const fusion = await this.worker.fusionDescribe({
      image_base64: frame,
      module: "sentido",
      transcript,
      rag_context: rag.hit ? rag.speech_hint : undefined,
      gps: this.glasses.gps(),
      super_id: this.state.super_id,
      session_id: this.state.session_id,
      frame_id: `f_${Date.now()}`,
    });
    await this.orchestrateSpeak(transcript, "WHERE", fusion.structured);
  }

  async confirmProduct(transcript: string): Promise<void> {
    this.setState("PROCESSING");
    const target = pendientes(this.state)[0];
    // Sub-agente de visión (Product Inspector) → JSON; el orquestador compone la voz.
    const frame = await this.glasses.captureFrameJpegBase64();
    const fusion = await this.worker.fusionDescribe({
      image_base64: frame,
      module: "producto",
      transcript,
      item_buscado: target?.item,
      marca_preferida: target?.preferencia,
      gps: this.glasses.gps(),
      super_id: this.state.super_id,
      session_id: this.state.session_id,
      frame_id: `f_${Date.now()}`,
    });
    await this.orchestrateSpeak(transcript, "WHAT_IS", fusion.structured);
  }

  /**
   * Reconocimiento social: captura el frame POV, lo compara contra las fotos de
   * referencia de los contactos (Puente Caras) y el orquestador compone la voz
   * ("A tu izquierda está Andrea" / "Hay una persona enfrente, no la reconozco").
   * Solo nombra a quien esté en `contacts`; nunca inventa identidad.
   */
  async recognizePeople(transcript: string): Promise<void> {
    this.setState("PROCESSING");
    const contacts = await this.contacts();
    const frame = await this.glasses.captureFrameJpegBase64();
    const recog = await this.worker.fusionRecognize({
      image_base64: frame,
      contacts,
      transcript,
      locale: "es-MX",
    });
    // PersonasJSON → orquestador (cero invención: solo nombra personas presentes).
    await this.orchestrateSpeak(transcript, "WHO", recog.structured as unknown as Record<string, unknown>);
  }

  async recall(transcript: string): Promise<void> {
    this.setState("PROCESSING");
    await this.orchestrateSpeak(transcript, "WHATS_LEFT");
  }

  private async resolveConfirm(transcript: string): Promise<void> {
    this.setState("PROCESSING");
    const intent = intentOf(transcript) === "NO" ? "NO" : "YES";
    await this.orchestrateSpeak(transcript, intent);
  }

  /**
   * Shopper Orchestrator: toma la decisión y compone la voz final (Payload).
   * Su `speech` es lo que se manda a ElevenLabs. Aquí convergen todas las rutas
   * de decisión/visión antes del TTS.
   */
  private async orchestrateSpeak(
    transcript: string,
    intent: string,
    structured?: Record<string, unknown>
  ): Promise<void> {
    const res = await this.worker.orchestrate({
      transcript,
      intent,
      structured,
      session_state: this.state as unknown as Record<string, unknown>,
      user_md: this.userMd,
      memory_md: this.memoryMd,
      locale: "es-MX",
    });
    applyAgentState(this.state, res.session_state, res.pending_confirm);
    if (res.alert) this.glasses.vibrate(300);
    await this.speak(res.speech);
  }

  /** Anuncio hablado puntual (saludo de arranque, avisos). Mismo pipeline TTS. */
  async announce(text: string): Promise<void> {
    await this.speak(text);
  }

  private async speak(text: string): Promise<void> {
    if (!text.trim()) return;
    this.hooks.onSpeech?.(text);
    this.setState("SPEAKING");
    // Marca el turno de voz: el Mic vivo no captura mientras suena el TTS.
    this.speaking = true;
    try {
      const audio = await this.worker.tts(text);
      await this.glasses.playTts(audio);
    } finally {
      this.speaking = false;
    }
    this.setState("CONNECTED_IDLE");
  }

  private setState(s: PuenteSessionState): void {
    this.hooks.onState?.(s);
  }
}
