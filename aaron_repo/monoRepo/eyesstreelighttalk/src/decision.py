"""Logica de decision: del estado del semaforo al comando para el usuario.

Incluye suavizado temporal: un cambio de comando solo se confirma tras N frames
consecutivos con el mismo estado, para no alertar por una deteccion espuria.
El comando confirmado es lo que el companion app convertiria en voz/HUD.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from .color_classifier import LightState
from .config import DecisionConfig


class Command(str, Enum):
    GO = "PASAR"
    STOP = "NO_PASAR"
    CAUTION = "PRECAUCION"
    NONE = "SIN_SEMAFORO"


# Mapeo directo estado -> comando.
_STATE_TO_COMMAND = {
    LightState.GREEN: Command.GO,
    LightState.RED: Command.STOP,
    LightState.YELLOW: Command.CAUTION,
    LightState.UNKNOWN: Command.NONE,
}

# Mensaje legible (lo que el HUD/voz diria).
COMMAND_MESSAGE = {
    Command.GO: "Luz verde: puede avanzar",
    Command.STOP: "Luz roja: detengase",
    Command.CAUTION: "Luz amarilla: precaucion",
    Command.NONE: "Sin semaforo a la vista",
}


def instant_command(state: LightState) -> Command:
    """Comando inmediato para un estado, sin suavizado temporal.

    Util para modo imagen (un solo frame), donde el anti-flicker no aplica.
    """
    return _STATE_TO_COMMAND[state]


@dataclass
class Decision:
    command: Command
    state: LightState
    changed: bool  # True solo en el frame donde el comando confirmado cambia


class DecisionEngine:
    def __init__(self, cfg: DecisionConfig):
        self.cfg = cfg
        self._confirmed: Command = Command.NONE
        self._candidate: Command | None = None
        self._candidate_count: int = 0

    def update(self, state: LightState) -> Decision:
        command = _STATE_TO_COMMAND[state]

        if command == self._candidate:
            self._candidate_count += 1
        else:
            self._candidate = command
            self._candidate_count = 1

        changed = False
        # Confirmamos el cambio solo tras alcanzar la estabilidad requerida.
        if (
            self._candidate_count >= self.cfg.stability_frames
            and command != self._confirmed
        ):
            self._confirmed = command
            changed = True

        return Decision(command=self._confirmed, state=state, changed=changed)
