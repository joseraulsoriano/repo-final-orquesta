#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Descarga los pesos y configuracion de YOLOv4-tiny (Darknet) entrenado en COCO.
# Usamos la variante "tiny": ~6 MB, pensada para correr en CPU / dispositivos
# moviles (companion app) con FPS razonables. La clase relevante de COCO es
# "traffic light" (indice 9).
#
# Uso:  bash scripts/download_models.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

MODELS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/models"
mkdir -p "$MODELS_DIR"

# Modelo por defecto: tiny (rapido). Para "detectar todo" usar el completo:
#   MODEL=full bash scripts/download_models.sh
MODEL="${MODEL:-tiny}"

NAMES_URL="https://raw.githubusercontent.com/AlexeyAB/darknet/master/data/coco.names"

if [[ "$MODEL" == "full" ]]; then
  CFG_URL="https://raw.githubusercontent.com/AlexeyAB/darknet/master/cfg/yolov4.cfg"
  WEIGHTS_URL="https://github.com/AlexeyAB/darknet/releases/download/darknet_yolo_v3_optimal/yolov4.weights"
  CFG_NAME="yolov4.cfg"; WEIGHTS_NAME="yolov4.weights"
else
  CFG_URL="https://raw.githubusercontent.com/AlexeyAB/darknet/master/cfg/yolov4-tiny.cfg"
  WEIGHTS_URL="https://github.com/AlexeyAB/darknet/releases/download/yolov4/yolov4-tiny.weights"
  CFG_NAME="yolov4-tiny.cfg"; WEIGHTS_NAME="yolov4-tiny.weights"
fi

download() {
  local url="$1" dest="$2"
  if [[ -f "$dest" ]]; then
    echo "[=] Ya existe: $(basename "$dest") (omitido)"
    return
  fi
  echo "[*] Descargando $(basename "$dest") ..."
  curl -fL --retry 3 -o "$dest" "$url"
}

echo "[i] Modelo seleccionado: $MODEL"
download "$CFG_URL"     "$MODELS_DIR/$CFG_NAME"
download "$WEIGHTS_URL" "$MODELS_DIR/$WEIGHTS_NAME"
download "$NAMES_URL"   "$MODELS_DIR/coco.names"

echo
echo "[OK] Modelos en: $MODELS_DIR"
ls -lh "$MODELS_DIR"
