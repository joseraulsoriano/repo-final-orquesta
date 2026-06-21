"""Decision de cruce peatonal por fusion de senales.

Sin leer directamente el muneco peatonal (eso seria el modelo custom de fase 2),
inferimos si es factible cruzar combinando:
  1. Estado del semaforo VEHICULAR (rojo = autos detenidos = peaton puede cruzar).
  2. Vehiculos en la "zona de cruce" (banda inferior del frame) que se acercan
     o se mueven — un auto que avanza invalida el cruce aunque el semaforo este
     en rojo (alguien se lo paso).

Salida: veredicto SAFE / CAUTION / UNSAFE con las razones que lo motivaron.
El veredicto se confirma con suavizado temporal para no titilar.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

from .color_classifier import LightState
from .config import CrossingConfig
from .tracker import Direction, Track


class CrossingVerdict(str, Enum):
    SAFE = "FACTIBLE_CRUZAR"
    CAUTION = "PRECAUCION"
    UNSAFE = "NO_CRUZAR"
    UNKNOWN = "EVALUANDO"


VERDICT_MESSAGE = {
    CrossingVerdict.SAFE: "Es factible cruzar",
    CrossingVerdict.CAUTION: "Precaucion antes de cruzar",
    CrossingVerdict.UNSAFE: "No cruce",
    CrossingVerdict.UNKNOWN: "Evaluando entorno",
}


@dataclass
class CrossingResult:
    verdict: CrossingVerdict       # veredicto confirmado (suavizado)
    reasons: list[str] = field(default_factory=list)
    changed: bool = False
    instant: CrossingVerdict = CrossingVerdict.UNKNOWN  # sin suavizar (modo imagen)


class CrossingDecisionEngine:
    def __init__(self, cfg: CrossingConfig):
        self.cfg = cfg
        self._confirmed = CrossingVerdict.UNKNOWN
        self._candidate: CrossingVerdict | None = None
        self._candidate_count = 0

    def evaluate(
        self,
        light_state: LightState,
        vehicle_tracks: list[Track],
        frame_shape: tuple[int, int],
    ) -> CrossingResult:
        h, w = frame_shape[:2]
        reasons: list[str] = []

        # Vehiculos relevantes: los que estan en la banda inferior (cerca del
        # peaton) y se mueven o se acercan.
        zone_y = self.cfg.crossing_zone_y * h
        active = [
            t for t in vehicle_tracks
            if t.centers and t.centers[-1][1] >= zone_y
            and t.direction in (Direction.APPROACHING, Direction.LEFT, Direction.RIGHT)
        ]
        approaching = [t for t in active if t.direction == Direction.APPROACHING]

        # --- Logica de fusion ---
        if light_state == LightState.GREEN:
            # Verde vehicular = autos con paso = peaton NO cruza.
            verdict = CrossingVerdict.UNSAFE
            reasons.append("Semaforo vehicular en verde (autos con paso)")
        elif light_state == LightState.RED:
            # Rojo vehicular = autos detenidos = peaton puede cruzar...
            if approaching:
                verdict = CrossingVerdict.UNSAFE
                reasons.append(f"{len(approaching)} vehiculo(s) acercandose pese al rojo")
            elif active:
                verdict = CrossingVerdict.CAUTION
                reasons.append(f"{len(active)} vehiculo(s) en movimiento cerca")
            else:
                verdict = CrossingVerdict.SAFE
                reasons.append("Semaforo vehicular en rojo y sin trafico activo")
        elif light_state == LightState.YELLOW:
            verdict = CrossingVerdict.CAUTION
            reasons.append("Semaforo vehicular en amarillo (transicion)")
        else:
            # Sin semaforo legible: decidir por trafico.
            if approaching:
                verdict = CrossingVerdict.UNSAFE
                reasons.append(f"{len(approaching)} vehiculo(s) acercandose")
            elif active:
                verdict = CrossingVerdict.CAUTION
                reasons.append(f"{len(active)} vehiculo(s) en movimiento cerca")
            else:
                verdict = CrossingVerdict.CAUTION
                reasons.append("Sin semaforo visible; verifique manualmente")

        return self._stabilize(verdict, reasons)

    def _stabilize(self, verdict: CrossingVerdict, reasons: list[str]) -> CrossingResult:
        if verdict == self._candidate:
            self._candidate_count += 1
        else:
            self._candidate = verdict
            self._candidate_count = 1

        changed = False
        if (
            self._candidate_count >= self.cfg.stability_frames
            and verdict != self._confirmed
        ):
            self._confirmed = verdict
            changed = True

        return CrossingResult(verdict=self._confirmed, reasons=reasons,
                              changed=changed, instant=verdict)
