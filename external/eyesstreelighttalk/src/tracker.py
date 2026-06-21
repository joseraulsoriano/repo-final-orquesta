"""Seguimiento multi-objeto por IoU para estimar direccion y velocidad.

Asocia detecciones entre frames con un ID estable y, a partir del historial de
centroides y areas, deriva:
  - vector de velocidad (px/frame) suavizado,
  - direccion de movimiento (IZQUIERDA/DERECHA/ACERCANDOSE/ALEJANDOSE/QUIETO).

Es un tracker ligero (sin dependencias extra) suficiente para el contexto de
trafico de la decision de cruce. Para multitudes densas se cambiaria a SORT.
"""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from enum import Enum

from .config import TrackerConfig
from .detector import Detection


class Direction(str, Enum):
    LEFT = "IZQUIERDA"
    RIGHT = "DERECHA"
    APPROACHING = "ACERCANDOSE"
    RECEDING = "ALEJANDOSE"
    STATIONARY = "QUIETO"


@dataclass
class PredictedTrack:
    """Estado extrapolado de un track a un instante futuro (sin deteccion nueva).

    Expone la misma interfaz minima que usa el motor de cruce (`centers`,
    `direction`, `label`) para poder evaluarlo igual que un track real.
    """
    label: str
    centers: list
    direction: "Direction"
    track_id: int


def _iou(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> float:
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    x1, y1 = max(ax, bx), max(ay, by)
    x2, y2 = min(ax + aw, bx + bw), min(ay + ah, by + bh)
    inter = max(0, x2 - x1) * max(0, y2 - y1)
    if inter == 0:
        return 0.0
    union = aw * ah + bw * bh - inter
    return inter / union


@dataclass
class Track:
    id: int
    label: str
    box: tuple[int, int, int, int]
    centers: deque = field(default_factory=lambda: deque(maxlen=16))
    areas: deque = field(default_factory=lambda: deque(maxlen=16))
    age: int = 0           # frames desde la ultima asociacion
    hits: int = 0          # veces vista en total

    velocity: tuple[float, float] = (0.0, 0.0)
    direction: Direction = Direction.STATIONARY


class Tracker:
    def __init__(self, cfg: TrackerConfig):
        self.cfg = cfg
        self.tracks: dict[int, Track] = {}
        self._next_id = 0

    def update(self, detections: list[Detection]) -> list[Track]:
        """Asocia detecciones a tracks y recalcula movimiento. Devuelve los
        tracks vivos (vistos en este frame)."""
        # 1) Asociacion greedy por IoU, respetando la etiqueta de clase.
        unmatched = list(range(len(detections)))
        matched: dict[int, int] = {}  # track_id -> det_idx

        for tid, track in self.tracks.items():
            best_iou, best_det = self.cfg.iou_match_threshold, None
            for di in unmatched:
                det = detections[di]
                if det.label != track.label:
                    continue
                iou = _iou(track.box, det.box)
                if iou >= best_iou:
                    best_iou, best_det = iou, di
            if best_det is not None:
                matched[tid] = best_det
                unmatched.remove(best_det)

        # 2) Actualizar tracks asociados.
        for tid, di in matched.items():
            self._update_track(self.tracks[tid], detections[di])

        # 3) Envejecer / borrar tracks no asociados.
        for tid, track in list(self.tracks.items()):
            if tid not in matched:
                track.age += 1
                if track.age > self.cfg.max_age:
                    del self.tracks[tid]

        # 4) Crear tracks para detecciones nuevas.
        for di in unmatched:
            self._create_track(detections[di])

        # Devolvemos solo los vistos en este frame (age == 0) y enlazamos el
        # track a su deteccion para el render.
        live = []
        for tid, di in matched.items():
            detections[di].extra["track_id"] = tid
            detections[di].extra["direction"] = self.tracks[tid].direction
            detections[di].extra["velocity"] = self.tracks[tid].velocity
            live.append(self.tracks[tid])
        for di in unmatched:
            # tracks recien creados (sin movimiento aun)
            detections[di].extra.setdefault("direction", Direction.STATIONARY)
        return live

    def predict(self, dt: float) -> list[PredictedTrack]:
        """Extrapola la posicion de los tracks activos `dt` intervalos-de-deteccion
        hacia el futuro con un modelo de velocidad constante.

        Permite re-evaluar la decision de cruce ENTRE frames (a >1 fps) usando la
        ultima velocidad estimada, sin necesidad de un frame nuevo. dt=0.5 con
        captura a 1 fps equivale a una decision extra a la mitad del segundo.
        """
        out: list[PredictedTrack] = []
        for t in self.tracks.values():
            if t.age > 0 or not t.centers:
                continue  # solo tracks vistos en el ultimo frame
            cx, cy = t.centers[-1]
            vx, vy = t.velocity
            pred = (cx + vx * dt, cy + vy * dt)
            out.append(PredictedTrack(label=t.label, centers=[pred],
                                      direction=t.direction, track_id=t.id))
        return out

    def _create_track(self, det: Detection) -> None:
        t = Track(id=self._next_id, label=det.label, box=det.box)
        t.centers.append(det.center)
        t.areas.append(det.area)
        t.hits = 1
        self.tracks[self._next_id] = t
        det.extra["track_id"] = self._next_id
        self._next_id += 1

    def _update_track(self, track: Track, det: Detection) -> None:
        track.box = det.box
        track.centers.append(det.center)
        track.areas.append(det.area)
        track.age = 0
        track.hits += 1
        self._recompute_motion(track)

    def _recompute_motion(self, track: Track) -> None:
        n = min(self.cfg.velocity_window, len(track.centers))
        if n < 2:
            return
        (x0, y0), (x1, y1) = track.centers[-n], track.centers[-1]
        dx, dy = (x1 - x0) / (n - 1), (y1 - y0) / (n - 1)
        track.velocity = (dx, dy)

        # Crecimiento de area = se acerca/aleja de la camara.
        a0, a1 = track.areas[-n], track.areas[-1]
        area_growth = (a1 - a0) / max(1.0, a0) / (n - 1)

        speed = (dx ** 2 + dy ** 2) ** 0.5
        track.direction = self._classify(dx, dy, area_growth, speed)

    def _classify(self, dx: float, dy: float, area_growth: float, speed: float) -> Direction:
        # Acercarse/alejarse domina (es lo critico para cruzar): lo decide el
        # cambio de tamano de la caja.
        if area_growth > 0.03 and speed >= self.cfg.min_speed_px * 0.5:
            return Direction.APPROACHING
        if area_growth < -0.03 and speed >= self.cfg.min_speed_px * 0.5:
            return Direction.RECEDING
        if speed < self.cfg.min_speed_px:
            return Direction.STATIONARY
        return Direction.RIGHT if dx >= 0 else Direction.LEFT
