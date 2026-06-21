"""Deteccion multi-clase con YOLO (Darknet) cargado via OpenCV DNN.

OpenCV lee los pesos/cfg nativos de Darknet sin instalar el framework completo
(cv2.dnn.readNetFromDarknet), lo que mantiene la imagen liviana y portable.

Detecta el conjunto de clases de interes (semaforo, vehiculos, persona) en una
sola pasada — es la base para la decision de cruce.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np

from .config import DetectorConfig


@dataclass
class Detection:
    """Una deteccion en coordenadas de pixel del frame."""

    label: str
    x: int
    y: int
    w: int
    h: int
    confidence: float
    # Atributos derivados que rellenan etapas posteriores (color del semaforo,
    # id de track, vector de movimiento). Se dejan aqui para no usar __dict__.
    extra: dict = field(default_factory=dict)

    @property
    def box(self) -> tuple[int, int, int, int]:
        return self.x, self.y, self.w, self.h

    @property
    def center(self) -> tuple[float, float]:
        return self.x + self.w / 2, self.y + self.h / 2

    @property
    def area(self) -> int:
        return self.w * self.h


class Detector:
    def __init__(self, cfg: DetectorConfig):
        self.cfg = cfg
        self._validate_files()

        self.net = cv2.dnn.readNetFromDarknet(
            str(cfg.cfg_path), str(cfg.weights_path)
        )
        self.net.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
        self.net.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)
        self.output_layers = self.net.getUnconnectedOutLayersNames()

        self.class_names = self._load_class_names()
        # Indices de las clases de interes -> resolucion rapida en el bucle.
        interest = set(cfg.classes_of_interest)
        self.keep_ids = {
            i for i, name in enumerate(self.class_names) if name in interest
        }
        if not self.keep_ids:
            raise ValueError(
                f"Ninguna clase de interes encontrada en {cfg.names_path}"
            )

    def _validate_files(self) -> None:
        for path in (self.cfg.cfg_path, self.cfg.weights_path, self.cfg.names_path):
            if not path.exists():
                raise FileNotFoundError(
                    f"No existe el modelo: {path}\n"
                    "Descarga los modelos con:\n"
                    "  bash scripts/download_models.sh            (tiny)\n"
                    "  MODEL=full bash scripts/download_models.sh (completo)"
                )

    def _load_class_names(self) -> list[str]:
        with open(self.cfg.names_path, encoding="utf-8") as fh:
            return [line.strip() for line in fh if line.strip()]

    def detect(self, frame: np.ndarray) -> list[Detection]:
        """Devuelve las detecciones de las clases de interes en el frame (BGR)."""
        h, w = frame.shape[:2]

        blob = cv2.dnn.blobFromImage(
            frame,
            scalefactor=1 / 255.0,
            size=(self.cfg.input_size, self.cfg.input_size),
            swapRB=True,
            crop=False,
        )
        self.net.setInput(blob)
        layer_outputs = self.net.forward(self.output_layers)

        boxes: list[list[int]] = []
        confidences: list[float] = []
        class_ids: list[int] = []

        for output in layer_outputs:
            for detection in output:
                scores = detection[5:]
                class_id = int(np.argmax(scores))
                if class_id not in self.keep_ids:
                    continue
                confidence = float(scores[class_id])
                if confidence < self.cfg.conf_threshold:
                    continue

                cx, cy, bw, bh = detection[0:4] * np.array([w, h, w, h])
                x = int(cx - bw / 2)
                y = int(cy - bh / 2)
                boxes.append([x, y, int(bw), int(bh)])
                confidences.append(confidence)
                class_ids.append(class_id)

        # NMS por-clase para no fusionar, p.ej., un coche con un semaforo encima.
        detections: list[Detection] = []
        for cid in set(class_ids):
            idxs = [i for i, c in enumerate(class_ids) if c == cid]
            cls_boxes = [boxes[i] for i in idxs]
            cls_confs = [confidences[i] for i in idxs]
            keep = cv2.dnn.NMSBoxes(
                cls_boxes, cls_confs, self.cfg.conf_threshold, self.cfg.nms_threshold
            )
            for k in np.array(keep).flatten():
                x, y, bw, bh = cls_boxes[k]
                detections.append(
                    Detection(
                        label=self.class_names[cid],
                        x=max(0, x), y=max(0, y), w=bw, h=bh,
                        confidence=cls_confs[k],
                    )
                )
        return detections
