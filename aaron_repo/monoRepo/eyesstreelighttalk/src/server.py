"""API HTTP para recibir un video (POST) y devolver el analisis de cruce.

Este es el punto donde el agente / companion app "apunta" a tu servicio:
sube un .mp4 y recibe el veredicto (FACTIBLE_CRUZAR / NO_CRUZAR / PRECAUCION)
junto con el detalle por cambio de estado.

Levantar:
    .venv/bin/uvicorn src.server:app --host 0.0.0.0 --port 8000
Docs interactivas (Swagger):
    http://localhost:8000/docs
"""
from __future__ import annotations

import shutil
import tempfile
import time
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse

from .service import analyze_video

app = FastAPI(
    title="Meta Glasses - Asistente de Cruce",
    description="Recibe un video de la escena y devuelve el veredicto de cruce.",
    version="1.0.0",
)

# Extensiones de video aceptadas.
_ALLOWED = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v", ".3gp"}
# Carpeta para los anotados generados (descargables).
_OUTPUT_DIR = Path(__file__).resolve().parent.parent / "output" / "api"
_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


@app.get("/health")
def health() -> dict:
    """Chequeo de vida para el agente / balanceador."""
    return {"status": "ok", "service": "crossing-analyzer"}


@app.post("/analyze")
async def analyze(
    file: UploadFile = File(..., description="Video de la escena (mp4)"),
    model: str = Query("full", pattern="^(full|tiny)$"),
    input_size: int = Query(608, ge=160, le=1280),
    stride: int = Query(1, ge=1, le=30, description="Procesar 1 de cada N frames"),
    annotate: bool = Query(False, description="Generar tambien el video anotado"),
) -> dict:
    """Recibe un video, lo procesa y devuelve el analisis de cruce en JSON."""
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in _ALLOWED:
        raise HTTPException(
            status_code=415,
            detail=f"Formato no soportado: '{suffix}'. Usa uno de {sorted(_ALLOWED)}",
        )

    # Guardamos el upload en un archivo temporal (cv2 necesita una ruta).
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    tmp_path = Path(tmp.name)
    try:
        with tmp:
            shutil.copyfileobj(file.file, tmp)
        if tmp_path.stat().st_size == 0:
            raise HTTPException(status_code=400, detail="El archivo llego vacio")

        annotate_path = None
        annotated_url = None
        if annotate:
            annotate_path = _OUTPUT_DIR / f"{tmp_path.stem}_anotado.mp4"
            annotated_url = f"/annotated/{annotate_path.name}"

        t0 = time.time()
        try:
            result = analyze_video(
                tmp_path, model=model, input_size=input_size,
                stride=stride, annotate_path=annotate_path,
            )
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

        result["processing_time_s"] = round(time.time() - t0, 2)
        if annotated_url:
            result["annotated_video"] = annotated_url
        return result
    finally:
        tmp_path.unlink(missing_ok=True)


@app.get("/annotated/{name}")
def get_annotated(name: str) -> FileResponse:
    """Descarga un video anotado generado por /analyze?annotate=true."""
    path = (_OUTPUT_DIR / name).resolve()
    # Evita path traversal: el archivo debe estar dentro de _OUTPUT_DIR.
    if _OUTPUT_DIR not in path.parents or not path.exists():
        raise HTTPException(status_code=404, detail="No encontrado")
    return FileResponse(path, media_type="video/mp4", filename=name)
