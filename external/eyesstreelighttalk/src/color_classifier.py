"""Clasificacion del estado del semaforo (OpenCV, HSV + posicion vertical).

YOLO nos da *donde* esta el semaforo; aqui decidimos *de que color* esta
encendido. Distinguir rojo de amarillo SOLO por matiz es fragil: los LEDs
rojos de semaforos reales suelen verse anaranjados (matiz ~20) por la
sobreexposicion de la camara, y caen en el rango "amarillo".

Estrategia hibrida, mas robusta:
  1. Separamos pixeles encendidos en "calidos" (rojo/naranja/amarillo) vs
     "verdes" por matiz.
  2. Si el verde domina por conteo -> VERDE.
  3. Si dominan los calidos -> usamos la POSICION vertical del centroide
     calido: arriba = ROJO, en medio = AMARILLO (asi funciona un semaforo).
"""
from __future__ import annotations

from enum import Enum

import cv2
import numpy as np

from .config import ColorConfig


class LightState(str, Enum):
    RED = "RED"
    YELLOW = "YELLOW"
    GREEN = "GREEN"
    UNKNOWN = "UNKNOWN"


class ColorClassifier:
    def __init__(self, cfg: ColorConfig):
        self.cfg = cfg

    def classify(self, crop: np.ndarray) -> tuple[LightState, dict[str, float]]:
        """Clasifica un recorte BGR del semaforo.

        Devuelve el estado y un diccionario de metricas (utiles para overlay/debug).
        """
        if crop.size == 0:
            return LightState.UNKNOWN, {}

        c = self.cfg
        hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
        h_ch, s_ch, v_ch = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]

        # Pixeles "encendidos": suficientemente saturados y brillantes.
        lit = (s_ch >= c.sat_min) & (v_ch >= c.val_min)
        total = crop.shape[0] * crop.shape[1]

        # Calidos = rojo + naranja + amarillo (el matiz envuelve en 0 y 179).
        warm = lit & ((h_ch <= c.warm_hue_high) | (h_ch >= c.warm_hue_wrap))
        green = lit & (h_ch >= c.green[0]) & (h_ch <= c.green[1])

        warm_n = int(warm.sum())
        green_n = int(green.sum())

        metrics = {
            "warm_ratio": warm_n / total,
            "green_ratio": green_n / total,
        }

        # Nada encendido de forma significativa.
        if max(warm_n, green_n) / total < c.min_pixel_ratio:
            return LightState.UNKNOWN, metrics

        # Verde domina -> luz verde.
        if green_n >= warm_n:
            return LightState.GREEN, metrics

        # Dominan los calidos: la posicion vertical separa rojo de amarillo.
        ys = np.nonzero(warm)[0]
        centroid_y = float(ys.mean()) / crop.shape[0]
        metrics["warm_centroid_y"] = centroid_y

        if centroid_y < c.red_yellow_split:
            return LightState.RED, metrics
        return LightState.YELLOW, metrics
