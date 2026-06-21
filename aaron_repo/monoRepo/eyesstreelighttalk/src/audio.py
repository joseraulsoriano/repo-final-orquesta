"""Canal de retroalimentacion AUDITIVA hacia el usuario (Meta Glasses).

Dos formas de alerta, segun el veredicto de cruce:
  1. VOZ      : instruccion hablada ("Puede cruzar", "Alto, no cruce").
  2. TONO     : pitido de BAJA frecuencia = avanzar; ALTA frecuencia = detenerse.

Arquitectura:
  - La sintesis de voz real la hace el SDK de las gafas; aqui producimos el
    *texto* de la instruccion y el *spec* del tono, y los entregamos a un
    `GlassesAudioSink`.
  - `GlassesAudioSink` es la interfaz de integracion. `LocalAudioSink` la
    implementa para validar en escritorio (genera WAV reales y los reproduce
    con aplay). `MetaGlassesAudioSink` es el stub donde van las llamadas al SDK.

Los tonos se sintetizan con numpy + el modulo `wave` de la stdlib (sin
dependencias extra), para que el canal de tono sea 100% validable offline.
"""
from __future__ import annotations

import shutil
import subprocess
import wave
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .crossing import CrossingVerdict

SAMPLE_RATE = 16000  # mono, suficiente para voz/tono en altavoz de gafas


# --------------------------------------------------------------------------- #
# Especificacion de cada alerta por veredicto
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class ToneSpec:
    freq: float       # Hz (baja=avanzar, alta=detenerse)
    duration: float   # seg por pitido
    beeps: int        # numero de pitidos
    gap: float        # seg de silencio entre pitidos


# Frase de voz por veredicto (lo que el SDK sintetiza).
VOICE_PHRASES: dict[CrossingVerdict, str] = {
    CrossingVerdict.SAFE: "Puede cruzar",
    CrossingVerdict.UNSAFE: "Alto. No cruce",
    CrossingVerdict.CAUTION: "Precaucion antes de cruzar",
    CrossingVerdict.UNKNOWN: "",
}

# Tono por veredicto. BAJA frecuencia para avanzar, ALTA para detenerse.
TONE_SPECS: dict[CrossingVerdict, ToneSpec | None] = {
    CrossingVerdict.SAFE:    ToneSpec(freq=440.0,  duration=0.55, beeps=1, gap=0.0),
    CrossingVerdict.UNSAFE:  ToneSpec(freq=1200.0, duration=0.15, beeps=3, gap=0.09),
    CrossingVerdict.CAUTION: ToneSpec(freq=800.0,  duration=0.20, beeps=2, gap=0.12),
    CrossingVerdict.UNKNOWN: None,
}


def synth_tone(spec: ToneSpec, sample_rate: int = SAMPLE_RATE) -> np.ndarray:
    """Sintetiza un patron de pitidos como muestras int16 (mono)."""
    beep_n = int(sample_rate * spec.duration)
    t = np.arange(beep_n) / sample_rate
    wave_f = 0.6 * np.sin(2 * np.pi * spec.freq * t)

    # Fade in/out (5 ms) para evitar clicks.
    fade = max(1, int(sample_rate * 0.005))
    env = np.ones(beep_n)
    env[:fade] = np.linspace(0, 1, fade)
    env[-fade:] = np.linspace(1, 0, fade)
    beep = wave_f * env

    gap = np.zeros(int(sample_rate * spec.gap))
    parts: list[np.ndarray] = []
    for i in range(spec.beeps):
        parts.append(beep)
        if i < spec.beeps - 1:
            parts.append(gap)
    signal = np.concatenate(parts) if parts else np.zeros(1)
    return (signal * 32767).astype(np.int16)


def write_wav(path: Path, samples: np.ndarray, sample_rate: int = SAMPLE_RATE) -> None:
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # int16
        wf.setframerate(sample_rate)
        wf.writeframes(samples.tobytes())


# --------------------------------------------------------------------------- #
# Sinks (destinos de audio)
# --------------------------------------------------------------------------- #
class GlassesAudioSink:
    """Interfaz de salida de audio. El companion app implementa esto contra el
    SDK de las Meta Glasses."""

    def speak(self, text: str) -> None:               # pragma: no cover - interfaz
        raise NotImplementedError

    def play_tone(self, samples: np.ndarray) -> None:  # pragma: no cover - interfaz
        raise NotImplementedError


class MetaGlassesAudioSink(GlassesAudioSink):
    """STUB de integracion real. Aqui irian las llamadas al SDK de Meta:
        meta_sdk.audio.tts(text)            -> altavoz de las gafas
        meta_sdk.audio.play_pcm(samples)    -> tono por el altavoz
    Se deja como plantilla; requiere el SDK/credenciales de las gafas.
    """

    def __init__(self, sdk=None):
        self.sdk = sdk

    def speak(self, text: str) -> None:
        if self.sdk is None:
            raise RuntimeError("SDK de Meta Glasses no inicializado")
        self.sdk.audio.tts(text)          # <-- punto de integracion

    def play_tone(self, samples: np.ndarray) -> None:
        if self.sdk is None:
            raise RuntimeError("SDK de Meta Glasses no inicializado")
        self.sdk.audio.play_pcm(samples.tobytes(), SAMPLE_RATE)  # <-- integracion


class LocalAudioSink(GlassesAudioSink):
    """Implementacion local para validar en escritorio: guarda WAV y los
    reproduce con aplay/paplay si hay dispositivo de audio."""

    def __init__(self, out_dir: Path, play: bool = True):
        self.out_dir = Path(out_dir)
        self.out_dir.mkdir(parents=True, exist_ok=True)
        self._player = shutil.which("paplay") or shutil.which("aplay")
        self.play = play and self._player is not None
        self._counter = 0

    def speak(self, text: str) -> None:
        # Sin motor TTS local: registramos el texto que el SDK sintetizaria.
        print(f"[VOZ] -> gafas: \"{text}\"", flush=True)

    def play_tone(self, samples: np.ndarray) -> None:
        self._counter += 1
        path = self.out_dir / f"tono_{self._counter:03d}.wav"
        write_wav(path, samples)
        print(f"[TONO] -> {path}", flush=True)
        if self.play:
            try:
                subprocess.run([self._player, "-q", str(path)],
                               check=False, timeout=5,
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except Exception:
                pass  # sin dispositivo de audio: el WAV queda igual como evidencia


# --------------------------------------------------------------------------- #
# Alerter: del veredicto a la accion de audio
# --------------------------------------------------------------------------- #
class AudioAlerter:
    """Convierte un veredicto de cruce en voz y/o tono y lo despacha al sink."""

    def __init__(self, sink: GlassesAudioSink, mode: str = "both"):
        # mode: 'voice' | 'tone' | 'both' | 'none'
        self.sink = sink
        self.mode = mode
        # Pre-sintetizamos los tonos (no cambian) para no recalcular en vivo.
        self._tones = {
            v: synth_tone(spec) for v, spec in TONE_SPECS.items() if spec is not None
        }

    def alert(self, verdict: CrossingVerdict) -> None:
        if self.mode == "none" or verdict == CrossingVerdict.UNKNOWN:
            return
        if self.mode in ("voice", "both"):
            phrase = VOICE_PHRASES.get(verdict, "")
            if phrase:
                self.sink.speak(phrase)
        if self.mode in ("tone", "both"):
            samples = self._tones.get(verdict)
            if samples is not None:
                self.sink.play_tone(samples)
