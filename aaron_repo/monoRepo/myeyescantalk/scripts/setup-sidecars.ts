import execa = require('execa');
import { logger, logAndSpeak } from '../electron/logger';
import path from 'path';
import fs from 'fs';
import os from 'os';

const ROOT = path.join(os.homedir(), '.myeyescantalk');
const SIDECARS_DIR = path.join(ROOT, 'sidecars');
const MODELS_DIR = path.join(ROOT, 'models');
const VOICES_DIR = path.join(ROOT, 'voices');

const WHISPER_BIN = path.join(SIDECARS_DIR, 'whisper.cpp', 'main');
const PIPER_BIN = path.join(SIDECARS_DIR, 'piper', 'piper');
const WHISPER_MODEL = path.join(MODELS_DIR, 'ggml-base.bin');

// Verified-working HuggingFace paths. Piper voices live under a SPEAKER folder
// (the earlier failures were because `es_MX-medium` has no speaker and 404s).
const HF = 'https://huggingface.co';
const WHISPER_MODEL_URL = `${HF}/ggerganov/whisper.cpp/resolve/main/ggml-base.bin`;
const VOICES = {
  es: {
    onnx: `${HF}/rhasspy/piper-voices/resolve/main/es/es_MX/ald/medium/es_MX-ald-medium.onnx`,
    json: `${HF}/rhasspy/piper-voices/resolve/main/es/es_MX/ald/medium/es_MX-ald-medium.onnx.json`,
    file: 'es_MX-ald-medium.onnx',
  },
  en: {
    onnx: `${HF}/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx`,
    json: `${HF}/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx.json`,
    file: 'en_US-amy-medium.onnx',
  },
};

/**
 * Download a file with curl (-f fails on HTTP errors so we never save an error
 * page, -L follows the LFS redirect to the CDN). Validates a minimum size to
 * catch silent truncation.
 */
async function download(url: string, dest: string, minBytes: number): Promise<boolean> {
  try {
    await execa('curl', ['-fL', '--retry', '2', '-o', dest, url]);
    if (fs.existsSync(dest) && fs.statSync(dest).size >= minBytes) return true;
    // Too small → almost certainly an error body; remove it.
    if (fs.existsSync(dest)) fs.unlinkSync(dest);
    return false;
  } catch (error) {
    if (fs.existsSync(dest)) {
      try { fs.unlinkSync(dest); } catch { /* ignore */ }
    }
    logger.error('Download failed', { url, error: (error as Error).message });
    return false;
  }
}

/**
 * First-run setup. Downloads what can be fetched (Whisper model + Piper voices)
 * and honestly reports which native binaries still need to be present. Every
 * outcome is spoken — the user never has to look at a screen to know the state.
 */
export async function setupSidecars(): Promise<void> {
  [SIDECARS_DIR, MODELS_DIR, VOICES_DIR].forEach((d) => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });

  // 1. Whisper model (the STT brain). ~78 MB.
  if (fs.existsSync(WHISPER_MODEL) && fs.statSync(WHISPER_MODEL).size > 50_000_000) {
    logger.info('Whisper model already present');
  } else {
    logAndSpeak('Descargando modelo de reconocimiento de voz...', 'info');
    const ok = await download(WHISPER_MODEL_URL, WHISPER_MODEL, 50_000_000);
    logAndSpeak(ok ? 'Modelo de voz listo' : 'No pude descargar el modelo de voz', ok ? 'info' : 'error');
  }

  // 2. Piper voices (high-quality TTS). ~63 MB each + small JSON config.
  for (const [lang, v] of Object.entries(VOICES)) {
    const dest = path.join(VOICES_DIR, v.file);
    const destJson = dest + '.json';
    const haveVoice = fs.existsSync(dest) && fs.statSync(dest).size > 1_000_000 && fs.existsSync(destJson);
    if (haveVoice) {
      logger.info('Piper voice already present', { lang });
      continue;
    }
    logAndSpeak(`Descargando voz en ${lang === 'es' ? 'español' : 'inglés'}...`, 'info');
    const okOnnx = await download(v.onnx, dest, 1_000_000);
    const okJson = await download(v.json, destJson, 50);
    const ok = okOnnx && okJson;
    logAndSpeak(
      ok ? `Voz en ${lang === 'es' ? 'español' : 'inglés'} lista` : `No pude descargar la voz en ${lang === 'es' ? 'español' : 'inglés'}`,
      ok ? 'info' : 'warn'
    );
  }

  // 3. Native binaries: we cannot legally/practically auto-build these on first
  //    run, so we verify and report. The app still works without them (Whisper
  //    is required for STT; TTS always falls back to the macOS system voice).
  if (!fs.existsSync(WHISPER_BIN)) {
    logger.warn('Whisper binary missing', { expected: WHISPER_BIN });
    logAndSpeak('Falta el programa de reconocimiento de voz. Lo instalaré en el siguiente paso.', 'warn');
  }
  if (!fs.existsSync(PIPER_BIN)) {
    logger.warn('Piper binary missing — will use system voice', { expected: PIPER_BIN });
  }

  logger.info('Sidecar setup complete');
}
