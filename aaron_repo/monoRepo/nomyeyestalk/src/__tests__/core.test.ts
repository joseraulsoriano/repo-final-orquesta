import { applyAgentState, SessionState } from "../core/sessionState";
import { intentOf } from "../core/intentRouting";
import { WorkerError } from "../net/workerClient";

describe("intentOf", () => {
  it("detects WHERE", () => {
    expect(intentOf("¿Dónde está la leche?")).toBe("WHERE");
  });

  it("detects WHAT_IS", () => {
    expect(intentOf("¿Qué producto es este?")).toBe("WHAT_IS");
  });

  it("detects WHATS_LEFT", () => {
    expect(intentOf("¿Qué me falta de la lista?")).toBe("WHATS_LEFT");
  });

  it("detects YES/NO", () => {
    expect(intentOf("sí, tómalo")).toBe("YES");
    expect(intentOf("no gracias")).toBe("NO");
  });
});

describe("applyAgentState", () => {
  it("merges lista and pending_confirm", () => {
    const s: SessionState = {
      session_id: "x",
      usuario_id: "u",
      super_id: "walmart_portales",
      visita_numero: 2,
      lista_compra: [{ item: "leche", status: "pending" }],
      items_en_carrito: [],
      pending_confirm: false,
    };
    applyAgentState(
      s,
      {
        lista_compra: [{ item: "leche", status: "done" }],
        ubicacion_estimada: "pasillo 7",
      },
      true
    );
    expect(s.lista_compra[0].status).toBe("done");
    expect(s.ubicacion_estimada).toBe("pasillo 7");
    expect(s.pending_confirm).toBe(true);
  });
});

describe("WorkerError", () => {
  it("includes path and status in message", () => {
    const e = new WorkerError("/tts", 502, "upstream fail");
    expect(e.message).toContain("/tts");
    expect(e.message).toContain("502");
    expect(e.path).toBe("/tts");
    expect(e.status).toBe(502);
  });
});
