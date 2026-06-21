"""Pipeline por-frame para la decision de cruce.

Flujo:
  detectar (multi-clase) -> clasificar color de semaforos -> trackear vehiculos
  -> fusionar en veredicto de cruce -> anotar.

Es agnostico de la fuente (imagen, video, webcam o stream de las gafas).
"""
from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np

from .color_classifier import ColorClassifier, LightState
from .config import (
    PERSON_CLASS,
    TRAFFIC_LIGHT_CLASS,
    VEHICLE_CLASSES,
    PipelineConfig,
)
from .crossing import CrossingDecisionEngine, CrossingResult, CrossingVerdict, VERDICT_MESSAGE
from .decision import COMMAND_MESSAGE, Command, DecisionEngine
from .detector import Detection, Detector
from .tracker import Direction, Tracker

# Prioridad de estado del semaforo (lado seguro: rojo manda).
_LIGHT_PRIORITY = {
    LightState.RED: 3, LightState.YELLOW: 2, LightState.GREEN: 1, LightState.UNKNOWN: 0,
}

# Colores BGR del overlay.
_LIGHT_BGR = {
    LightState.RED: (0, 0, 255), LightState.YELLOW: (0, 255, 255),
    LightState.GREEN: (0, 200, 0), LightState.UNKNOWN: (160, 160, 160),
}
_VERDICT_BGR = {
    CrossingVerdict.SAFE: (0, 200, 0), CrossingVerdict.CAUTION: (0, 255, 255),
    CrossingVerdict.UNSAFE: (0, 0, 255), CrossingVerdict.UNKNOWN: (160, 160, 160),
}
_CLASS_BGR = {"vehicle": (255, 160, 0), "person": (255, 0, 255)}


@dataclass
class FrameResult:
    detections: list[Detection]
    light_state: LightState
    light_command: Command
    crossing: CrossingResult
    counts: dict = field(default_factory=dict)


class TrafficScenePipeline:
    def __init__(self, cfg: PipelineConfig | None = None):
        self.cfg = cfg or PipelineConfig()
        self.detector = Detector(self.cfg.detector)
        self.classifier = ColorClassifier(self.cfg.color)
        self.tracker = Tracker(self.cfg.tracker)
        self.light_engine = DecisionEngine(self.cfg.decision)
        self.crossing_engine = CrossingDecisionEngine(self.cfg.crossing)
        self._vehicle_set = set(VEHICLE_CLASSES)
        self._last_light_state = LightState.UNKNOWN
        self._last_shape: tuple = (480, 640, 3)

    def process(self, frame: np.ndarray) -> FrameResult:
        detections = self.detector.detect(frame)

        # 1) Semaforos: clasificar color y derivar el estado de la escena.
        light_state = LightState.UNKNOWN
        for det in detections:
            if det.label != TRAFFIC_LIGHT_CLASS:
                continue
            crop = frame[det.y:det.y + det.h, det.x:det.x + det.w]
            state, _ = self.classifier.classify(crop)
            det.extra["state"] = state
            if _LIGHT_PRIORITY[state] > _LIGHT_PRIORITY[light_state]:
                light_state = state
        light_decision = self.light_engine.update(light_state)

        # 2) Vehiculos (y personas): trackear para direccion/movimiento.
        trackable = [d for d in detections if d.label in self._vehicle_set
                     or d.label == PERSON_CLASS]
        tracks = self.tracker.update(trackable)
        vehicle_tracks = [t for t in tracks if t.label in self._vehicle_set]

        # 3) Decision de cruce.
        crossing = self.crossing_engine.evaluate(light_state, vehicle_tracks, frame.shape)
        self._last_light_state = light_state
        self._last_shape = frame.shape

        counts = {
            "semaforos": sum(1 for d in detections if d.label == TRAFFIC_LIGHT_CLASS),
            "vehiculos": sum(1 for d in detections if d.label in self._vehicle_set),
            "personas": sum(1 for d in detections if d.label == PERSON_CLASS),
        }
        return FrameResult(
            detections=detections, light_state=light_state,
            light_command=light_decision.command, crossing=crossing, counts=counts,
        )

    def decide_predicted(self, dt: float):
        """Re-evalua el cruce ENTRE frames extrapolando los tracks `dt`
        intervalos hacia adelante. No corre deteccion (es barato) -> permite
        emitir decisiones a >1 fps aunque la fuente entregue 1 fps."""
        predicted = self.tracker.predict(dt)
        vehicles = [t for t in predicted if t.label in self._vehicle_set]
        return self.crossing_engine.evaluate(
            self._last_light_state, vehicles, self._last_shape)

    # --------------------------------------------------------------------- #
    def annotate(self, frame: np.ndarray, result: FrameResult) -> np.ndarray:
        out = frame.copy()

        for det in result.detections:
            if det.label == TRAFFIC_LIGHT_CLASS:
                state = det.extra.get("state", LightState.UNKNOWN)
                color = _LIGHT_BGR[state]
                label = f"semaforo:{state.value}"
            elif det.label == PERSON_CLASS:
                color = _CLASS_BGR["person"]
                label = "persona"
            else:  # vehiculo
                color = _CLASS_BGR["vehicle"]
                d = det.extra.get("direction", Direction.STATIONARY)
                label = f"{det.label}:{d.value}"
                self._draw_motion_arrow(out, det, color)

            cv2.rectangle(out, (det.x, det.y), (det.x + det.w, det.y + det.h), color, 2)
            cv2.putText(out, label, (det.x, max(10, det.y - 6)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1, cv2.LINE_AA)

        self._draw_banner(out, result)
        return out

    def _draw_motion_arrow(self, out, det: Detection, color) -> None:
        vel = det.extra.get("velocity")
        if not vel:
            return
        cx, cy = det.center
        scale = 4.0
        end = (int(cx + vel[0] * scale), int(cy + vel[1] * scale))
        cv2.arrowedLine(out, (int(cx), int(cy)), end, color, 2, tipLength=0.4)

    def _draw_banner(self, out, result: FrameResult) -> None:
        v = result.crossing.verdict
        bgr = _VERDICT_BGR[v]
        line1 = f"{v.value}  |  {VERDICT_MESSAGE[v]}"
        reason = result.crossing.reasons[0] if result.crossing.reasons else ""
        c = result.counts
        line2 = (f"semaforo:{result.light_state.value}  "
                 f"veh:{c.get('vehiculos',0)} per:{c.get('personas',0)}  {reason}")

        cv2.rectangle(out, (0, 0), (out.shape[1], 56), (0, 0, 0), -1)
        cv2.putText(out, line1, (10, 24), cv2.FONT_HERSHEY_SIMPLEX, 0.7, bgr, 2, cv2.LINE_AA)
        cv2.putText(out, line2, (10, 48), cv2.FONT_HERSHEY_SIMPLEX, 0.5,
                    (220, 220, 220), 1, cv2.LINE_AA)
