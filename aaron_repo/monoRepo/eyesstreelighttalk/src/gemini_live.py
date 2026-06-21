"""Integracion con Gemini Live respetando su limite de 1 fps de video.

Gemini Live solo acepta ~1 frame/seg (768x768 recomendado) y no sirve para
video rapido. Para no perder informacion temporal, NO le mandamos 1 frame
"crudo" por segundo: le mandamos 1 DIGEST por segundo que comprime el ultimo
segundo de captura a fps completo.

  FrameDigestBuilder  -> arma 1 imagen 768x768 (mosaico de los ultimos N frames
                         + anotaciones) que condensa el movimiento del segundo.
  GeminiLiveBridge    -> plantilla de conexion al SDK google-genai (Live API):
                         envia el digest a 1 fps y recibe texto/voz de contexto.

Asi: la ruta rapida (YOLO local) decide la seguridad a >1 fps; Gemini aporta
entendimiento semantico y conversacion sobre un input que respeta su regla.
"""
from __future__ import annotations

import os
from collections import deque
from pathlib import Path

import cv2
import numpy as np

# Gemini Live recomienda 768x768 a 1 fps.
GEMINI_FRAME_SIZE = 768
GEMINI_MODEL = "gemini-live-2.5-flash-preview"

# Raiz del proyecto (…/meta-traffic-light) -> donde vive el archivo .env
_ROOT = Path(__file__).resolve().parent.parent


def load_env(path: Path | None = None) -> None:
    """Carga variables KEY=VALUE de un archivo .env del proyecto a os.environ
    (sin pisar las ya definidas). Evita dependencia de python-dotenv."""
    env_path = path or (_ROOT / ".env")
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key, val = key.strip(), val.strip().strip('"').strip("'")
        os.environ.setdefault(key, val)


class FrameDigestBuilder:
    """Acumula frames a fps completo y compone un mosaico 1x/seg para Gemini.

    El mosaico (p.ej. 2x2 de los 4 frames mas representativos del segundo) mete
    informacion temporal en una sola imagen -> Gemini "ve" el movimiento aunque
    reciba 1 imagen/seg.
    """

    def __init__(self, grid: tuple[int, int] = (2, 2), size: int = GEMINI_FRAME_SIZE):
        self.rows, self.cols = grid
        self.capacity = self.rows * self.cols
        self.size = size
        self.buffer: deque = deque(maxlen=64)  # frames del ultimo segundo

    def add(self, frame: np.ndarray) -> None:
        self.buffer.append(frame)

    def _sample_frames(self) -> list[np.ndarray]:
        """Toma `capacity` frames espaciados uniformemente del buffer (los
        instantes mas representativos del segundo)."""
        n = len(self.buffer)
        if n == 0:
            return []
        if n <= self.capacity:
            return list(self.buffer)
        idxs = np.linspace(0, n - 1, self.capacity).astype(int)
        return [self.buffer[i] for i in idxs]

    def build(self, caption: str | None = None) -> np.ndarray | None:
        """Compone el mosaico 768x768. Devuelve None si no hay frames."""
        frames = self._sample_frames()
        if not frames:
            return None

        cell_w = self.size // self.cols
        cell_h = self.size // self.rows
        canvas = np.zeros((self.size, self.size, 3), np.uint8)

        for i, fr in enumerate(frames):
            r, c = divmod(i, self.cols)
            cell = cv2.resize(fr, (cell_w, cell_h))
            # Sello de orden temporal (t0..tN) para que Gemini infiera direccion.
            cv2.putText(cell, f"t{i}", (6, 22), cv2.FONT_HERSHEY_SIMPLEX,
                        0.7, (0, 255, 255), 2, cv2.LINE_AA)
            canvas[r * cell_h:(r + 1) * cell_h, c * cell_w:(c + 1) * cell_w] = cell

        if caption:
            cv2.rectangle(canvas, (0, self.size - 26), (self.size, self.size), (0, 0, 0), -1)
            cv2.putText(canvas, caption[:90], (8, self.size - 8),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
        self.buffer.clear()
        return canvas

    @staticmethod
    def to_jpeg(image: np.ndarray, quality: int = 80) -> bytes:
        ok, buf = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, quality])
        if not ok:
            raise RuntimeError("No se pudo codificar el digest a JPEG")
        return buf.tobytes()


# Instruccion de sistema: define el rol de Gemini en el flujo.
SYSTEM_INSTRUCTION = (
    "Eres el copiloto de movilidad de unas gafas para asistencia peatonal. "
    "Recibes 1 mosaico por segundo: cada celda (t0..tN) es un instante del ultimo "
    "segundo, en orden temporal. Describe SOLO peligros relevantes para cruzar "
    "(vehiculos acercandose, su direccion, motos/bicis, obstaculos) en frases muy "
    "cortas en espanol. Si no hay peligro, guarda silencio. No narres lo obvio."
)


class GeminiLiveBridge:
    """Plantilla de integracion con el SDK google-genai (Live API).

    Uso real (requiere: pip install google-genai  y  GOOGLE_API_KEY):

        bridge = GeminiLiveBridge()
        async with bridge.connect() as session:
            # cada 1 seg:
            await bridge.send_digest(session, digest_jpeg)
            # leer respuestas (texto/voz) en otra tarea:
            async for text in bridge.responses(session):
                audio_sink.speak(text)

    Aqui dejamos los puntos de integracion marcados; no se ejecuta sin SDK.
    """

    def __init__(self, model: str = GEMINI_MODEL, voice: bool = True):
        self.model = model
        self.voice = voice
        self._genai = None
        self._types = None

    @property
    def available(self) -> bool:
        load_env()  # toma GOOGLE_API_KEY del .env del proyecto si existe
        try:
            import google.genai  # noqa: F401
            return bool(os.environ.get("GOOGLE_API_KEY"))
        except ImportError:
            return False

    def _ensure_sdk(self):
        if self._genai is None:
            from google import genai
            from google.genai import types
            self._genai, self._types = genai, types
        return self._genai, self._types

    def connect(self):
        """Abre la sesion Live. Devuelve el context manager async del SDK."""
        genai, types = self._ensure_sdk()
        client = genai.Client()
        modalities = ["AUDIO"] if self.voice else ["TEXT"]
        config = types.LiveConnectConfig(
            response_modalities=modalities,
            system_instruction=SYSTEM_INSTRUCTION,
        )
        return client.aio.live.connect(model=self.model, config=config)

    async def send_digest(self, session, jpeg_bytes: bytes) -> None:
        """Envia 1 digest (mosaico) como frame de video a 1 fps."""
        _, types = self._ensure_sdk()
        await session.send_realtime_input(
            video=types.Blob(data=jpeg_bytes, mime_type="image/jpeg")
        )

    async def responses(self, session):
        """Itera las respuestas de Gemini (texto/voz de contexto)."""
        async for message in session.receive():
            if message.text:
                yield message.text
