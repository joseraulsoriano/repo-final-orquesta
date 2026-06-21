// Geolocalización para cruce/navegación dirigida al destino.
// Espejo TS de eyesstreelighttalk/src/geo.py. Puro (sin deps), testeable.

export interface Coord {
  lat: number;
  lng: number;
}

export interface NavContext {
  distancia_m: number;
  direccion_ego: "adelante" | "a tu derecha" | "detrás de ti" | "a tu izquierda";
  bearing: number;
  heading: number;
}

const R = 6_371_000; // radio terrestre (m)
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Distancia haversine en metros. */
export function distanceM(a: Coord, b: Coord): number {
  const la1 = rad(a.lat);
  const la2 = rad(b.lat);
  const dla = rad(b.lat - a.lat);
  const dlo = rad(b.lng - a.lng);
  const h =
    Math.sin(dla / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dlo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Rumbo 0-360 (desde el norte, horario) de a hacia b. */
export function bearingDeg(a: Coord, b: Coord): number {
  const la1 = rad(a.lat);
  const la2 = rad(b.lat);
  const dlo = rad(b.lng - a.lng);
  const y = Math.sin(dlo) * Math.cos(la2);
  const x =
    Math.cos(la1) * Math.sin(la2) -
    Math.sin(la1) * Math.cos(la2) * Math.cos(dlo);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Dirección relativa a HACIA DÓNDE MIRA el usuario (heading de la brújula). */
export function egocentric(
  heading: number,
  bearing: number
): NavContext["direccion_ego"] {
  const rel = (bearing - heading + 360) % 360;
  if (rel < 45 || rel >= 315) return "adelante";
  if (rel < 135) return "a tu derecha";
  if (rel < 225) return "detrás de ti";
  return "a tu izquierda";
}

/** Contexto de navegación al destino, listo para el contrato de cruce. */
export function navContext(current: Coord, dest: Coord, heading: number): NavContext {
  const bearing = bearingDeg(current, dest);
  return {
    distancia_m: Math.round(distanceM(current, dest)),
    direccion_ego: egocentric(heading, bearing),
    bearing: Math.round(bearing),
    heading: Math.round(heading),
  };
}
