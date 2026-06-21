# ─────────────────────────────────────────────────────────────────────────────
# Imagen base liviana (CPU) para el pipeline de vision de semaforos.
# Usamos python slim + opencv-python-headless para evitar el peso de las libs
# de GUI (GTK/Qt) que OpenCV no necesita en un servicio de inferencia.
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# Dependencias de sistema que opencv-headless aun requiere en runtime
# (libGL para algunos codecs, glib para gstreamer/ffmpeg, ffmpeg para
# decodificar streams RTSP/HTTP de las gafas).
RUN apt-get update && apt-get install -y --no-install-recommends \
        libglib2.0-0 \
        libgl1 \
        ffmpeg \
        curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instalamos dependencias primero (capa cacheable) y luego el codigo.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY scripts/ ./scripts/
COPY src/ ./src/

# Los modelos (.weights/.cfg/.names) se montan como volumen o se descargan
# con scripts/download_models.sh — NO se hornean en la imagen para no inflarla.
VOLUME ["/app/models", "/app/data", "/app/output"]

ENTRYPOINT ["python", "-m", "src.main"]
CMD ["--help"]
