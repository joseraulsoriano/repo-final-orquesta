export type UserIntent =
  | "ADD"
  | "WHERE"
  | "WHERE_AM_I"
  | "WHAT_IS"
  | "WHATS_LEFT"
  | "WHO"
  | "YES"
  | "NO"
  | "UNKNOWN";

/** Verbos para agregar items a la lista de compra. */
export const ADD_RE = /\b(agrega|agregar|agr[eé]game|añade|anade|añadir|anadir|apunta|an[oó]tame|anota|pon|p[oó]n)\b/i;

/** Clasifica intención por regex ES-MX (PTT super demo). */
export function intentOf(t: string): UserIntent {
  const s = t.toLowerCase();
  if (/\b(s[ií]|claro|d[aá]le|t[oó]malo)\b/.test(s)) return "YES";
  if (/\bno\b/.test(s)) return "NO";
  // ADD antes que el resto: "agrega/añade/apunta X a la lista/a mi compra".
  if (ADD_RE.test(s) && (s.includes("lista") || s.includes("compr"))) return "ADD";
  if (s.includes("falta") || s.includes("qué llevo") || s.includes("que llevo")) return "WHATS_LEFT";
  // Reconocimiento social: "¿quién está/es/hay?", "¿con quién estoy?", "reconoce".
  if (
    /\bqui[eé]n\b/.test(s) ||
    s.includes("reconoce") ||
    s.includes("reconocer") ||
    s.includes("qué personas") ||
    s.includes("que personas")
  )
    return "WHO";
  // "¿dónde estoy?" / "mi ubicación" / "en qué calle" → ubicación actual (reverse geocode).
  // Va ANTES de WHERE para no confundirse con "¿dónde está la leche?".
  if (
    /d[oó]nde\s+(estoy|me\s+encuentro)/.test(s) ||
    s.includes("mi ubicaci") ||
    s.includes("en qué calle") ||
    s.includes("en que calle") ||
    s.includes("qué lugar es este") ||
    s.includes("que lugar es este")
  )
    return "WHERE_AM_I";
  if (s.includes("dónde") || s.includes("donde")) return "WHERE";
  if (
    s.includes("qué es") ||
    s.includes("que es") ||
    s.includes("qué producto") ||
    s.includes("este") ||
    s.includes("esto")
  )
    return "WHAT_IS";
  return "UNKNOWN";
}

/** Extrae el producto de una frase de ADD, quitando el verbo y las coletillas
 * de lista. "agrégame leche deslactosada a mi lista" → "leche deslactosada". */
export function extractItem(transcript: string): string {
  let s = transcript.trim();
  s = s.replace(ADD_RE, " ");
  // Quita coletillas de "a (la|mi) lista / de compra(s)" y conectores sueltos.
  s = s.replace(/\b(a|en)\s+(la|mi)\s+(lista|compra)s?\b/gi, " ");
  s = s.replace(/\b(a\s+la\s+lista|de\s+compras?|por\s+favor|porfa)\b/gi, " ");
  s = s.replace(/^[\s,.;:]+|[\s,.;:]+$/g, "");
  s = s.replace(/\s{2,}/g, " ").trim();
  return s;
}
