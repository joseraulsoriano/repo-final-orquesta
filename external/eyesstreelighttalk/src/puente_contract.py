"""Contrato de salida unificado Puente para el módulo cruce (ALINEACION_CRUCE.md §4)."""
from __future__ import annotations

from typing import Any

from .color_classifier import LightState
from .crossing import CrossingResult, CrossingVerdict, VERDICT_MESSAGE
from .tracker import Direction

# Frecuencias Hz para tonos en la app (Gen 2 audio-only).
TONE_HZ = {
    CrossingVerdict.SAFE: 440,
    CrossingVerdict.CAUTION: 800,
    CrossingVerdict.UNSAFE: 1200,
}


def _spatial_tags_from_tracks(vehicle_tracks: list) -> list[str]:
    tags: list[str] = []
    for t in vehicle_tracks:
        d = getattr(t, "direction", None)
        if d in (Direction.APPROACHING, Direction.LEFT, Direction.RIGHT):
            dir_label = {
                Direction.APPROACHING: "adelante",
                Direction.LEFT: "izquierda",
                Direction.RIGHT: "derecha",
            }.get(d, "adelante")
            tags.append(f"[SPATIAL:{dir_label}:vehiculo]")
    return tags[:3]


def verdict_to_cruce_json(
    crossing: CrossingResult,
    light_state: LightState,
    counts: dict[str, int],
    vehicle_tracks: list | None = None,
) -> dict[str, Any]:
    verdict = crossing.verdict
    return {
        "verdict": verdict.value,
        "light": light_state.value,
        "reasons": list(crossing.reasons),
        "counts": dict(counts),
    }


def crossing_to_puente_response(
    crossing: CrossingResult,
    light_state: LightState,
    counts: dict[str, int],
    vehicle_tracks: list | None = None,
    *,
    emit_even_if_unchanged: bool = False,
) -> dict[str, Any] | None:
    """Mapea veredicto YOLO → contrato Puente. None si anti-flicker (sin cambio)."""
    if not crossing.changed and not emit_even_if_unchanged:
        if crossing.verdict == CrossingVerdict.UNKNOWN:
            return None
        return None

    verdict = crossing.verdict
    structured = verdict_to_cruce_json(crossing, light_state, counts, vehicle_tracks)

    if verdict == CrossingVerdict.UNKNOWN:
        return {
            "speech": "",
            "structured": structured,
            "spatial_tags": [],
            "alert": False,
            "module": "cruce",
            "tone_hz": None,
        }

    speech = VERDICT_MESSAGE.get(verdict, "")
    if verdict == CrossingVerdict.UNSAFE and crossing.reasons:
        speech = f"Alto. No cruce. {crossing.reasons[0]}"
    elif verdict == CrossingVerdict.SAFE:
        speech = "Puede cruzar."
    elif verdict == CrossingVerdict.CAUTION:
        speech = "Precaución antes de cruzar."

    alert = verdict in (CrossingVerdict.CAUTION, CrossingVerdict.UNSAFE)
    spatial_tags = _spatial_tags_from_tracks(vehicle_tracks or [])

    return {
        "speech": speech,
        "structured": structured,
        "spatial_tags": spatial_tags,
        "alert": alert,
        "module": "cruce",
        "tone_hz": TONE_HZ.get(verdict),
    }
