import { ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger } from '../electron/logger';
import { transcribe, isSttReady } from './stt';
import { ttsService } from './tts-service';

// Ignore mic input for this long after the assistant stops speaking (covers the
// Bluetooth echo tail), so the assistant never hears its own voice.
const ECHO_GUARD_MS = 700;

const AUDIO_CACHE = path.join(os.homedir(), '.myeyescantalk', 'audio-cache');

// Wake word (normalized, accent-free): "asistente". Matched as a loose stem so
// minor STT variations ("asistente", "asistentes", "asistenta") still trigger.
const WAKE_RE = /asistent/;

/**
 * Wake-word detection without extra dependencies.
 *
 * openWakeWord ships only English models, so instead we energy-gate in the
 * renderer (cheap) and confirm the spoken phrase with whisper (Spanish). When a
 * speech burst arrives, we transcribe it and check for the wake phrase.
 *
 * While a command turn is in progress, pause()/resume() silence wake listening
 * so the assistant's own voice doesn't trigger it.
 */
export class WakeWordService {
  private win: any = null;
  private cb: ((text: string) => void | Promise<void>) | null = null;
  private listening = false;
  private handling = false;

  setWindow(win: any): void {
    this.win = win;
  }

  isReady(): boolean {
    return !!this.win && isSttReady();
  }

  async startListening(cb: (text: string) => void | Promise<void>): Promise<void> {
    if (!this.isReady()) {
      logger.warn('Wake word not ready (need whisper + window)');
      return;
    }
    this.cb = cb;
    this.listening = true;
    ipcMain.on('wake:candidate', this.onCandidate);
    // Send only after the renderer has finished loading recorder.js, otherwise
    // the 'wake:listen' message is fired before the listener exists and is lost.
    const wc = this.win.webContents;
    if (wc.isLoading()) {
      wc.once('did-finish-load', () => wc.send('wake:listen'));
    } else {
      wc.send('wake:listen');
    }
    logger.info('Wake word listening (say "asistente")');
  }

  stopListening(): void {
    this.listening = false;
    ipcMain.removeListener('wake:candidate', this.onCandidate);
    if (this.win) this.win.webContents.send('wake:idle');
  }

  /** Silence wake listening during a command turn (avoids self-triggering). */
  pause(): void {
    if (this.win) this.win.webContents.send('wake:idle');
  }

  resume(): void {
    if (this.listening && this.win) this.win.webContents.send('wake:listen');
  }

  private onCandidate = async (_e: unknown, buf: ArrayBuffer): Promise<void> => {
    if (!this.listening || this.handling) return;
    // Don't react to the assistant's own voice (avoids the self-hearing loop).
    if (ttsService.isSpeaking() || ttsService.msSinceSpoke() < ECHO_GUARD_MS) return;
    this.handling = true;
    const file = path.join(AUDIO_CACHE, `wake-${Date.now()}.wav`);
    try {
      fs.writeFileSync(file, Buffer.from(buf));
      const text = await transcribe(file);
      // Log every candidate so you can see what the wake listener is hearing.
      logger.info('Wake candidate heard', { text: text || '(non-speech)' });
      if (text && this.matches(text)) {
        logger.info('Wake word detected', { text });
        if (this.cb) await this.cb(text); // pass full text so a one-breath command can be used
      }
    } catch (err) {
      logger.warn('Wake candidate processing error', { error: (err as Error).message });
    } finally {
      fs.promises.unlink(file).catch(() => {});
      this.handling = false;
    }
  };

  private matches(text: string): boolean {
    const normalized = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''); // strip accents
    return WAKE_RE.test(normalized);
  }
}

export const wakeWordService = new WakeWordService();
