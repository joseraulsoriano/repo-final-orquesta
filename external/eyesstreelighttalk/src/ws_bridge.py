"""WebSocket bridge: recibe JPEG base64 desde la app Puente, devuelve contrato cruce.

Uso:
  python -m src.ws_bridge --host 0.0.0.0 --port 8765

Protocolo (JSON por mensaje):
  Cliente → {"image_base64": "<jpeg b64>", "session_id": "opcional"}
  Servidor → contrato Puente {speech, structured, spatial_tags, alert, module}
             o {"ok": true, "skipped": true} si anti-flicker (sin cambio de veredicto)
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import json
import logging
import sys

import cv2
import numpy as np

try:
    import websockets
    from websockets.server import WebSocketServerProtocol
except ImportError:
    print("Instala websockets: pip install websockets", file=sys.stderr)
    raise

from .config import PipelineConfig
from .crossing import CrossingVerdict
from .pipeline import TrafficScenePipeline
from .puente_contract import crossing_to_puente_response
from .tracker import Direction

log = logging.getLogger("ws_bridge")


def decode_jpeg_b64(data: str) -> np.ndarray | None:
    try:
        raw = base64.b64decode(data, validate=False)
        arr = np.frombuffer(raw, dtype=np.uint8)
        frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        return frame
    except Exception as e:
        log.warning("decode error: %s", e)
        return None


class CrossingBridge:
    def __init__(self):
        self.pipeline = TrafficScenePipeline(PipelineConfig())
        self._last_vehicle_tracks: list = []

    def process_b64(self, image_b64: str) -> dict:
        frame = decode_jpeg_b64(image_b64)
        if frame is None:
            return {"error": "invalid_jpeg", "module": "cruce"}

        result = self.pipeline.process(frame)
        vehicle_set = self.pipeline._vehicle_set
        self._last_vehicle_tracks = [
            t for t in self.pipeline.tracker.tracks.values()
            if t.label in vehicle_set
        ]

        contract = crossing_to_puente_response(
            result.crossing,
            result.light_state,
            result.counts,
            self._last_vehicle_tracks,
        )
        if contract is None:
            return {
                "ok": True,
                "skipped": True,
                "module": "cruce",
                "structured": {
                    "verdict": result.crossing.verdict.value,
                    "light": result.light_state.value,
                    "reasons": result.crossing.reasons,
                    "counts": result.counts,
                },
            }
        return contract


bridge = CrossingBridge()


async def handler(ws: WebSocketServerProtocol):
    peer = ws.remote_address
    log.info("client connected %s", peer)
    try:
        async for raw in ws:
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await ws.send(json.dumps({"error": "invalid_json", "module": "cruce"}))
                continue

            b64 = msg.get("image_base64") or msg.get("frame")
            if not b64:
                await ws.send(json.dumps({"error": "missing image_base64", "module": "cruce"}))
                continue

            loop = asyncio.get_running_loop()
            resp = await loop.run_in_executor(None, bridge.process_b64, b64)
            await ws.send(json.dumps(resp, ensure_ascii=False))
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        log.info("client disconnected %s", peer)


async def main(host: str, port: int):
    log.info("Puente crossing WS on ws://%s:%d", host, port)
    async with websockets.serve(handler, host, port, max_size=8 * 1024 * 1024):
        await asyncio.Future()


def cli():
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    p = argparse.ArgumentParser(description="Puente ↔ eyesstreelighttalk WebSocket bridge")
    p.add_argument("--host", default="0.0.0.0")
    p.add_argument("--port", type=int, default=8765)
    args = p.parse_args()
    asyncio.run(main(args.host, args.port))


if __name__ == "__main__":
    cli()
