"""Controlador de tiempo real: desacopla la frecuencia de DECISION de la de FRAMES.

La fuente (Gemini Live / gafas) entrega ~1 fps. Para decidir a >=2/seg sin
frames nuevos:
  - on_frame(): ruta PESADA (deteccion + tracking + decision). Se corre cada vez
    que llega un frame (p.ej. 1 fps).
  - tick():     ruta LIGERA. Extrapola los tracks y re-evalua el cruce SIN
    deteccion. Se corre entre frames (p.ej. a la mitad del segundo) -> decisiones
    a 2+ Hz.
  - feed_digest()/build_digest(): acumula los frames del segundo para el mosaico
    1x/seg que se envia a Gemini Live.

Es agnostico del transporte: lo maneja el bucle que lo conduce (ver main.py o
el bridge de Gemini).
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .config import PipelineConfig
from .crossing import CrossingResult, VERDICT_MESSAGE
from .gemini_live import FrameDigestBuilder
from .pipeline import FrameResult, TrafficScenePipeline


def realtime_config() -> PipelineConfig:
    """Preset para tiempo real en el celular: tiny@608 (rapido, buena cobertura)."""
    cfg = PipelineConfig()
    cfg.detector.model = "tiny"
    cfg.detector.input_size = 608
    return cfg


@dataclass
class Decision:
    """Una decision emitida, sea de frame real o de prediccion."""
    t: float
    verdict: str
    source: str          # 'frame' | 'predict'
    changed: bool
    reasons: list


class RealtimeController:
    def __init__(self, cfg: PipelineConfig | None = None,
                 digest_builder: FrameDigestBuilder | None = None,
                 audio_alerter=None):
        self.pipeline = TrafficScenePipeline(cfg or realtime_config())
        self.digest = digest_builder or FrameDigestBuilder()
        self.alerter = audio_alerter
        self._last_frame_t: float = 0.0

    # --- ruta pesada: llega un frame real (a fps de la fuente) ---
    def on_frame(self, frame: np.ndarray, t: float) -> tuple[FrameResult, Decision]:
        self.digest.add(frame)
        result = self.pipeline.process(frame)
        self._last_frame_t = t
        dec = self._emit(t, result.crossing, "frame")
        return result, dec

    # --- ruta ligera: entre frames, extrapolando movimiento ---
    def tick(self, t: float) -> Decision:
        dt = max(0.0, t - self._last_frame_t)  # en intervalos-de-deteccion (=seg si 1fps)
        crossing = self.pipeline.decide_predicted(dt)
        return self._emit(t, crossing, "predict")

    # --- digest 1x/seg para Gemini Live ---
    def build_digest(self, caption: str | None = None) -> np.ndarray | None:
        return self.digest.build(caption)

    def _emit(self, t: float, crossing: CrossingResult, source: str) -> Decision:
        dec = Decision(t=round(t, 2), verdict=crossing.verdict.value, source=source,
                       changed=crossing.changed, reasons=crossing.reasons)
        if crossing.changed and self.alerter is not None:
            self.alerter.alert(crossing.verdict)
        return dec
