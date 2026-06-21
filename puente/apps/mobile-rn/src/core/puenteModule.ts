/** Módulos Puente — una sesión DAT, un módulo activo a la vez. */
export type PuenteModule = "supermercado" | "cruce" | "guia" | "mac";

export const PUENTE_MODULES: PuenteModule[] = ["supermercado", "cruce", "guia", "mac"];

export function moduleDisplayName(m: PuenteModule): string {
  switch (m) {
    case "supermercado":
      return "Super";
    case "cruce":
      return "Cruce";
    case "guia":
      return "Guía";
    case "mac":
      return "Mac";
  }
}

export function moduleSwitchIntent(transcript: string): PuenteModule | null {
  const s = transcript.toLowerCase();
  if (s.includes("modo cruce") || (s.includes("cruzar") && s.includes("modo"))) return "cruce";
  if (s.includes("modo super") || s.includes("modo compras") || s.includes("supermercado")) return "supermercado";
  if (s.includes("modo guía") || s.includes("modo guia") || s.includes("modo navegación") || s.includes("modo navegacion"))
    return "guia";
  if (s.includes("modo mac") || s.includes("modo computadora")) return "mac";
  return null;
}
