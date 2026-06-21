"""Punto de entrada: corre el pipeline de escena sobre video/imagen/stream.

La fuente (--source) puede ser:
  - una imagen        : data/foto.jpg
  - un archivo video  : data/sample.mp4
  - una webcam        : 0  (indice de camara)
  - un stream         : rtsp://...  o  http://...  (el feed de las Meta Glasses)

Cada cambio de veredicto de cruce se imprime por stdout en formato JSON-line;
ese es el punto de enganche para que el companion app lo traduzca a voz / HUD.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import cv2

from .audio import AudioAlerter, LocalAudioSink
from .config import PipelineConfig
from .crossing import VERDICT_MESSAGE
from .pipeline import FrameResult, TrafficScenePipeline

_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}


def emit_alert(result: FrameResult, alerter: AudioAlerter | None = None) -> None:
    """Hook de alerta. Emite el payload JSON (consumo del companion app) y, si
    hay alerter, dispara la retroalimentacion auditiva hacia las gafas."""
    payload = {
        "verdict": result.crossing.verdict.value,
        "message": VERDICT_MESSAGE[result.crossing.verdict],
        "light": result.light_state.value,
        "reasons": result.crossing.reasons,
        "counts": result.counts,
    }
    print(json.dumps(payload, ensure_ascii=False), flush=True)
    if alerter is not None:
        alerter.alert(result.crossing.verdict)


def open_source(source: str) -> cv2.VideoCapture:
    # Indice de webcam ("0") vs ruta/URL.
    cap = cv2.VideoCapture(int(source)) if source.isdigit() else cv2.VideoCapture(source)
    if not cap.isOpened():
        raise RuntimeError(f"No se pudo abrir la fuente: {source}")
    return cap


def run_image(pipeline: TrafficScenePipeline, path: Path, args,
              alerter: AudioAlerter | None = None) -> int:
    frame = cv2.imread(str(path))
    if frame is None:
        raise RuntimeError(f"No se pudo leer la imagen: {path}")

    result = pipeline.process(frame)
    # En una sola imagen no hay suavizado temporal: usamos el veredicto directo.
    result.crossing.verdict = result.crossing.instant
    emit_alert(result, alerter)

    annotated = pipeline.annotate(frame, result)
    if args.output:
        cv2.imwrite(args.output, annotated)
        print(f"[OK] Imagen anotada -> {args.output}", file=sys.stderr)
    if not args.no_display:
        cv2.imshow("Escena", annotated)
        cv2.waitKey(0)
        cv2.destroyAllWindows()
    return 0


def run_stream(pipeline: TrafficScenePipeline, source: str, args,
               alerter: AudioAlerter | None = None) -> int:
    cap = open_source(source)

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 640
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 480

    writer = None
    if args.output:
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(args.output, fourcc, fps, (width, height))

    frame_idx = 0
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            frame_idx += 1

            # Procesar 1 de cada N frames para ahorrar computo (--stride).
            if args.stride > 1 and (frame_idx % args.stride) != 0:
                continue

            result = pipeline.process(frame)
            # Solo alertamos cuando el veredicto CONFIRMADO cambia (anti-flicker).
            if result.crossing.changed:
                emit_alert(result, alerter)

            if writer is not None or not args.no_display:
                annotated = pipeline.annotate(frame, result)
                if writer is not None:
                    writer.write(annotated)
                if not args.no_display:
                    cv2.imshow("Escena", annotated)
                    if cv2.waitKey(1) & 0xFF == ord("q"):
                        break
    finally:
        cap.release()
        if writer is not None:
            writer.release()
            print(f"[OK] Video anotado -> {args.output}", file=sys.stderr)
        if not args.no_display:
            cv2.destroyAllWindows()

    print(f"[OK] Frames procesados: {frame_idx}", file=sys.stderr)
    return 0


def build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="meta-traffic-scene",
        description="Decision de cruce peatonal (OpenCV DNN + YOLOv4/Darknet).",
    )
    p.add_argument("--source", required=True,
                   help="Imagen, video, indice de webcam (0) o URL rtsp/http del stream.")
    p.add_argument("--output", default=None,
                   help="Ruta de salida del anotado (imagen o .mp4).")
    p.add_argument("--no-display", action="store_true",
                   help="No abrir ventana (obligatorio en Docker/headless).")
    p.add_argument("--stride", type=int, default=1,
                   help="Procesar 1 de cada N frames (ahorra computo).")
    p.add_argument("--model", choices=("full", "tiny"), default=None,
                   help="Modelo YOLO: 'full' (preciso) o 'tiny' (rapido).")
    p.add_argument("--input-size", type=int, default=None,
                   help="Tamano de entrada de YOLO (608 default; +grande detecta mas lejos, +lento).")
    p.add_argument("--conf", type=float, default=None,
                   help="Umbral de confianza de deteccion (0.35 default).")
    p.add_argument("--audio", choices=("none", "voice", "tone", "both"), default="none",
                   help="Retroalimentacion auditiva: voz, tono, ambos o nada.")
    p.add_argument("--audio-dir", default="output/audio",
                   help="Carpeta donde se guardan los WAV de tono generados.")
    p.add_argument("--no-audio-play", action="store_true",
                   help="No reproducir por altavoz (solo guardar los WAV).")
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_arg_parser().parse_args(argv)

    cfg = PipelineConfig()
    if args.model is not None:
        cfg.detector.model = args.model
    if args.input_size is not None:
        cfg.detector.input_size = args.input_size
    if args.conf is not None:
        cfg.detector.conf_threshold = args.conf
    pipeline = TrafficScenePipeline(cfg)

    alerter = None
    if args.audio != "none":
        sink = LocalAudioSink(Path(args.audio_dir), play=not args.no_audio_play)
        alerter = AudioAlerter(sink, mode=args.audio)

    source_path = Path(args.source)
    if source_path.suffix.lower() in _IMAGE_EXTS and source_path.exists():
        return run_image(pipeline, source_path, args, alerter)
    return run_stream(pipeline, args.source, args, alerter)


if __name__ == "__main__":
    raise SystemExit(main())
