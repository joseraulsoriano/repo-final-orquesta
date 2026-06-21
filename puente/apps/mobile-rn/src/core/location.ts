// "Estás en X" + rumbo de la brújula, on-device con expo-location (sin API key).
// Producción del where_am_i/heading que en backend hacía Nominatim. Falla con
// gracia: devuelve null/0 si no hay permiso o señal, sin romper el flujo.
import * as Location from "expo-location";
import { Coord } from "./geo";

/** Frase corta de la ubicación actual ("Av. X, colonia Y"). null si no hay dato. */
export async function whereAmI(coord: Coord): Promise<string | null> {
  try {
    const res = await Location.reverseGeocodeAsync({
      latitude: coord.lat,
      longitude: coord.lng,
    });
    const a = res[0];
    if (!a) return null;
    const calle = a.street || a.name;
    const conNum = calle && a.streetNumber ? `${calle} ${a.streetNumber}` : calle;
    const colonia = a.district || a.subregion;
    const parts: string[] = [];
    if (conNum) parts.push(conNum);
    if (colonia) parts.push(`colonia ${colonia}`);
    if (parts.length === 0 && a.city) parts.push(a.city);
    return parts.length ? parts.join(", ") : null;
  } catch {
    return null;
  }
}

/** Lee el rumbo de la brújula una vez (grados desde el norte). 0 si no hay. */
export async function getHeadingOnce(timeoutMs = 2500): Promise<number> {
  return new Promise((resolve) => {
    let done = false;
    let sub: Location.LocationSubscription | undefined;
    const finish = (h: number) => {
      if (done) return;
      done = true;
      sub?.remove();
      resolve(h);
    };
    Location.watchHeadingAsync((h) => {
      // trueHeading es -1 si no hay calibración; cae a magHeading.
      finish(h.trueHeading >= 0 ? h.trueHeading : h.magHeading);
    })
      .then((s) => {
        sub = s;
      })
      .catch(() => finish(0));
    setTimeout(() => finish(0), timeoutMs);
  });
}
