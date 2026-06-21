"""Configuracion central del pipeline.

Todos los parametros ajustables viven aqui para no tener "numeros magicos"
dispersos por el codigo. Se pueden sobreescribir por CLI (ver main.py).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

# Raiz del proyecto (…/meta-traffic-light)
ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = ROOT / "models"


# Clases de COCO relevantes para una decision de cruce peatonal.
# El semaforo da el estado; vehiculos y personas, el contexto de trafico.
TRAFFIC_LIGHT_CLASS = "traffic light"
VEHICLE_CLASSES = ("car", "motorbike", "bus", "truck", "bicycle", "train")
PERSON_CLASS = "person"


@dataclass
class DetectorConfig:
    """Parametros del modelo YOLO (Darknet) cargado via OpenCV DNN.

    `model` selecciona los pesos: 'full' (yolov4, preciso, lento) o 'tiny'
    (yolov4-tiny, rapido, pierde objetos lejanos). Las rutas se derivan solas.
    """

    model: str = "full"  # 'full' | 'tiny'
    names_path: Path = MODELS_DIR / "coco.names"

    # Tamano de entrada de la red. Mas grande = detecta objetos mas pequenos/
    # lejanos a costa de velocidad. 608 es buen balance para escena urbana.
    input_size: int = 608

    # Umbrales de deteccion.
    conf_threshold: float = 0.35   # confianza minima para aceptar una caja
    nms_threshold: float = 0.45    # supresion de no-maximos (cajas solapadas)

    # Clases que detectamos. Vacio = todas las de interes (semaforo+vehiculos+persona).
    classes_of_interest: tuple[str, ...] = (
        TRAFFIC_LIGHT_CLASS, *VEHICLE_CLASSES, PERSON_CLASS,
    )

    @property
    def cfg_path(self) -> Path:
        return MODELS_DIR / ("yolov4.cfg" if self.model == "full" else "yolov4-tiny.cfg")

    @property
    def weights_path(self) -> Path:
        return MODELS_DIR / ("yolov4.weights" if self.model == "full" else "yolov4-tiny.weights")


@dataclass
class ColorConfig:
    """Rangos HSV para clasificar el estado del semaforo.

    El matiz (H) en OpenCV va de 0-179. El rojo aparece en los dos extremos,
    por eso lleva dos rangos. Se exige saturacion y brillo altos para descartar
    pixeles apagados/grises de la carcasa del semaforo.
    """

    sat_min: int = 60
    val_min: int = 90

    # Matices "calidos" (rojo+naranja+amarillo). El matiz (0-179) envuelve:
    # rojo/naranja/amarillo van de 0..warm_hue_high y tambien >=warm_hue_wrap.
    warm_hue_high: int = 35
    warm_hue_wrap: int = 160
    # Rango de matiz del verde.
    green: tuple[int, int] = (40, 90)

    # Entre los calidos, el centroide vertical (0=arriba, 1=abajo) separa
    # ROJO (lente superior) de AMARILLO (lente medio).
    red_yellow_split: float = 0.50

    # Fraccion minima de pixeles encendidos (sobre el area del recorte) para
    # considerar que hay una luz. Evita falsos positivos por ruido.
    min_pixel_ratio: float = 0.02


@dataclass
class DecisionConfig:
    """Logica de comando y suavizado temporal."""

    # N frames consecutivos con el mismo estado antes de emitir un cambio de
    # comando. Evita parpadeos (flicker) por una deteccion espuria.
    stability_frames: int = 3


@dataclass
class TrackerConfig:
    """Seguimiento de objetos entre frames (para estimar direccion/velocidad)."""

    # IoU minimo para asociar una deteccion a un track existente.
    iou_match_threshold: float = 0.3
    # Frames que un track sobrevive sin volver a detectarse antes de borrarse.
    max_age: int = 8
    # Frames de historia para promediar el vector de velocidad (suaviza ruido).
    velocity_window: int = 5
    # Magnitud minima de desplazamiento (px/frame) para considerar que se mueve.
    min_speed_px: float = 1.5


@dataclass
class CrossingConfig:
    """Fusion de senales para decidir si es factible cruzar."""

    # Un vehiculo se considera "acercandose" si su caja crece (se aproxima a la
    # camara) por encima de esta tasa relativa de area por frame.
    approaching_area_growth: float = 0.02
    # Banda inferior-central del frame = "zona de cruce" frente al peaton.
    # (fracciones del ancho/alto) — vehiculos aqui son los mas relevantes.
    crossing_zone_y: float = 0.45   # desde esta altura hacia abajo
    # N frames estables antes de confirmar un veredicto de cruce.
    stability_frames: int = 4


@dataclass
class PipelineConfig:
    detector: DetectorConfig = field(default_factory=DetectorConfig)
    color: ColorConfig = field(default_factory=ColorConfig)
    decision: DecisionConfig = field(default_factory=DecisionConfig)
    tracker: TrackerConfig = field(default_factory=TrackerConfig)
    crossing: CrossingConfig = field(default_factory=CrossingConfig)
