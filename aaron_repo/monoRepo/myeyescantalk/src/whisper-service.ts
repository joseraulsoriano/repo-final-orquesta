import execa = require('execa');
import { logger } from '../electron/logger';
import path from 'path';
import fs from 'fs';
import os from 'os';

const WHISPER_BIN = path.join(os.homedir(), '.myeyescantalk', 'sidecars', 'whisper.cpp', 'main');
const MODEL = path.join(os.homedir(), '.myeyescantalk', 'models', 'ggml-base.bin');

/**
 * Speech-to-text via whisper.cpp.
 *
 * Input must be a 16 kHz mono 16-bit WAV — whisper.cpp does not resample. The
 * recorder (renderer Web Audio capture) is responsible for producing that format.
 */
export class WhisperService {
  private ready = false;

  initialize(): boolean {
    const haveBin = fs.existsSync(WHISPER_BIN);
    const haveModel = fs.existsSync(MODEL) && fs.statSync(MODEL).size > 1_000_000;
    this.ready = haveBin && haveModel;
    if (!haveBin) logger.warn('Whisper binary missing', { expected: WHISPER_BIN });
    if (!haveModel) logger.warn('Whisper model missing', { expected: MODEL });
    if (this.ready) logger.info('Whisper service ready');
    return this.ready;
  }

  isReady(): boolean {
    return this.ready;
  }

  /**
   * Drop non-speech transcriptions. whisper labels music/noise with bracketed or
   * parenthesized tags ("[Música]", "(música de fondo)", "♪…♪", "[Applause]").
   * After removing those, if nothing with letters/digits remains, it wasn't
   * speech — return '' so callers treat it as "didn't understand" rather than
   * acting on music.
   */
  private cleanNonSpeech(text: string): string {
    const stripped = text
      .replace(/\[[^\]]*\]/g, ' ') // [Música], [MUSIC], [Applause]
      .replace(/\([^)]*\)/g, ' ') // (música de fondo)
      .replace(/[♪♫🎵🎶]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return /[a-záéíóúüñ0-9]/i.test(stripped) ? stripped : '';
  }

  /** Transcribe a 16 kHz mono WAV file. Returns trimmed text, or null on failure. */
  async transcribe(wavPath: string): Promise<string | null> {
    if (!this.ready) {
      logger.error('Whisper not ready');
      return null;
    }
    if (!fs.existsSync(wavPath)) {
      logger.error('Audio file not found', { wavPath });
      return null;
    }

    const outPrefix = wavPath.replace(/\.wav$/i, '') + '.out';
    try {
      await execa(WHISPER_BIN, [
        '-m', MODEL,
        '-l', 'es',     // primary language is Spanish (better accuracy than auto)
        '-nt',          // no timestamps
        '-otxt',        // write a .txt file
        '-of', outPrefix,
        '-f', wavPath,
      ]);

      const txtFile = outPrefix + '.txt';
      if (!fs.existsSync(txtFile)) {
        logger.error('Whisper produced no output', { txtFile });
        return null;
      }
      const raw = fs.readFileSync(txtFile, 'utf-8').trim();
      fs.promises.unlink(txtFile).catch(() => {});
      const text = this.cleanNonSpeech(raw);
      logger.info('Transcription complete', { raw, text });
      return text || null;
    } catch (error) {
      logger.error('Transcription failed', { error: (error as Error).message });
      return null;
    }
  }
}

export const whisperService = new WhisperService();
