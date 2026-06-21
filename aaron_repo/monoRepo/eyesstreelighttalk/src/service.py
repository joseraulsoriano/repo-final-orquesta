"""Servicio de analisis: procesa un video y devuelve el resultado estructurado.

Separa la logica de procesamiento de la capa HTTP (server.py) para poder
reutilizarla (CLI, tests, cola de trabajos, etc.).
"""
from __future__ import annotations

from pathlib import Path

import cv2

from .config import PipelineConfig
from .crossing import VERDICT_MESSAGE
from .decision import instant_command
from .pipeline import TrafficScenePipeline


def analyze_video(
    video_path: str | Path,
    model: str = "full",
    input_size: int = 608,
    stride: int = 1,
    annotate_path: str | Path | None = None,
) -> dict:
    """Corre el pipeline sobre el video y devuelve el analisis de cruce.

    - model/input_size: configuracion del detector YOLO.
    - stride: procesa 1 de cada N frames (acelera videos largos).
    - annotate_path: si se da, escribe el video anotado ahi.
    Devuelve un dict JSON-serializable con resumen + cambios de veredicto.
    """
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise ValueError(f"No se pudo abrir el video: {video_path}")

    cfg = PipelineConfig()
    cfg.detector.model = model
    cfg.detector.input_size = input_size
    pipeline = TrafficScenePipeline(cfg)

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 640
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 480

    writer = None
    if annotate_path is not None:
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(str(annotate_path), fourcc, fps, (width, height))

    verdict_changes: list[dict] = []
    frame_idx = 0
    processed = 0
    last_result = None

    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            frame_idx += 1
            if stride > 1 and (frame_idx % stride) != 0:
                continue

            result = pipeline.process(frame)
            processed += 1
            last_result = result

            if result.crossing.changed:
                verdict_changes.append({
                    "t": round(frame_idx / fps, 2),
                    "verdict": result.crossing.verdict.value,
                    "message": VERDICT_MESSAGE[result.crossing.verdict],
                    "light": result.light_state.value,
                    "reasons": result.crossing.reasons,
                    "counts": result.counts,
                })

            if writer is not None:
                writer.write(pipeline.annotate(frame, result))
    finally:
        cap.release()
        if writer is not None:
            writer.release()

    # Veredicto final: el ultimo confirmado, o el instantaneo del ultimo frame.
    if last_result is not None:
        final_verdict = last_result.crossing.verdict.value
        if final_verdict == "EVALUANDO":
            final_verdict = last_result.crossing.instant.value
        final_light = last_result.light_state.value
        final_counts = last_result.counts
    else:
        final_verdict, final_light, final_counts = "EVALUANDO", "UNKNOWN", {}

    return {
        "summary": {
            "final_verdict": final_verdict,
            "final_light": final_light,
            "final_counts": final_counts,
            "frames_total": frame_idx,
            "frames_processed": processed,
            "duration_s": round(frame_idx / fps, 2),
            "fps": round(fps, 1),
            "resolution": f"{width}x{height}",
            "model": f"{model}@{input_size}",
        },
        "verdict_changes": verdict_changes,
    }
