// State machine de la app (puente/CLAUDE.md §12) + estado de sesión del super.

export type PuenteSessionState =
  | "DISCONNECTED"
  | "CONNECTED_IDLE"
  | "LISTENING" // PTT
  | "PROCESSING" // worker
  | "SPEAKING" // TTS
  | "SENTIDO_CONTINUOUS" // 1 frame / N s
  | "ESCANEO_LIVE"; // Gemini Live

export interface ShoppingItem {
  item: string;
  status: "pending" | "done";
  preferencia?: string;
}

/** SessionState que viaja a /agents/super (schemas.md → SessionState). */
export interface SessionState {
  session_id: string;
  usuario_id: string;
  super_id: string;
  visita_numero: number; // 1 = visión obligatoria · 2+ = RAG hit
  lista_compra: ShoppingItem[];
  ubicacion_estimada?: string | null;
  items_en_carrito: string[];
  turno_actual?: string | null;
  pending_confirm: boolean;
}

export function pendientes(s: SessionState): ShoppingItem[] {
  return s.lista_compra.filter((i) => i.status === "pending");
}

/** Mezcla el session_state devuelto por Hermes sobre el local. */
export function applyAgentState(
  s: SessionState,
  updated: Record<string, unknown>,
  pending: boolean
): void {
  const u = updated as Partial<SessionState>;
  if (Array.isArray(u.lista_compra)) s.lista_compra = u.lista_compra;
  if (Array.isArray(u.items_en_carrito)) s.items_en_carrito = u.items_en_carrito;
  if ("ubicacion_estimada" in u) s.ubicacion_estimada = u.ubicacion_estimada ?? null;
  if ("turno_actual" in u) s.turno_actual = u.turno_actual ?? null;
  s.pending_confirm = pending;
}
