/**
 * Prueba de integración REAL (no mock del worker): corre el flujo de la app tal
 * cual — SuperFlow → WorkerClient → worker local (localhost:8787) → Anthropic —
 * con la foto de Andrea como frame POV y DEMO_CONTACTS como directorio.
 *
 * Requiere el worker corriendo (npx wrangler dev --port 8787). Por eso vive como
 * .itest.ts y no como .test.ts (no corre en la suite normal).
 *
 * Correr:  npx jest recognizeLive.itest --testMatch '**\/*.itest.ts'
 */
import { SuperFlow } from "../core/superFlow";
import { MockGlassesBridge } from "../dat/mockGlassesBridge";
import { WorkerClient } from "../net/workerClient";
import { DEMO_CONTACTS, USER_MD, MEMORY_MD } from "../config";
import { ANDREA_JPEG_B64 } from "../data/contactPhotos";
import { SessionState } from "../core/sessionState";

function state(): SessionState {
  return {
    session_id: "itest-recognize",
    usuario_id: "jose_raul",
    super_id: "mi_super",
    visita_numero: 1,
    lista_compra: [],
    items_en_carrito: [],
    pending_confirm: false,
  };
}

describe("[live] reconocer persona — app flow contra worker real", () => {
  it("PTT '¿quién está enfrente?' con Andrea en el directorio → la nombra", async () => {
    const worker = new WorkerClient("http://localhost:8787");
    const glasses = new MockGlassesBridge({
      transcripts: ["¿Quién está enfrente de mí?"],
      frameBase64: ANDREA_JPEG_B64, // frame POV = foto real de Andrea
      onLog: (s) => console.log(s),
    });
    const speech: string[] = [];
    const flow = new SuperFlow(
      worker,
      glasses,
      state(),
      USER_MD,
      MEMORY_MD,
      { onState: (s) => console.log(`[estado] ${s}`), onSpeech: (t) => speech.push(t) },
      () => DEMO_CONTACTS
    );

    await flow.handlePtt();
    console.log("\n>>> HABLA A LAS GAFAS:", speech.join(" | "));
    expect(speech.length).toBeGreaterThan(0);
    expect(speech.join(" ")).toMatch(/Andrea/i);
  }, 60000);
});
