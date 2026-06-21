import { ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger } from './logger';

const AUDIO_CACHE = path.join(os.homedir(), '.myeyescantalk', 'audio-cache');

/**
 * Microphone capture, main-process side.
 *
 * macOS ships no CLI recorder, so capture happens in the Electron renderer via
 * the Web Audio API (see assets/recorder.js): it records raw PCM, downsamples to
 * 16 kHz mono, encodes a WAV, and ships the bytes here over IPC. We write them
 * to a temp file that whisper.cpp can transcribe directly.
 */
export class MicRecorder {
  private win: any = null;
  private bargeCb: (() => void) | null = null;

  setWindow(win: any): void {
    this.win = win;
  }

  /** Register a callback fired when the user speaks over the assistant (barge-in). */
  onBarge(cb: () => void): void {
    this.bargeCb = cb;
    ipcMain.on('barge:hit', () => {
      if (this.bargeCb) this.bargeCb();
    });
  }

  /** Arm/disarm barge-in detection (while the assistant is speaking). */
  bargeOn(): void {
    if (this.win) this.win.webContents.send('barge:on');
  }
  bargeOff(): void {
    if (this.win) this.win.webContents.send('barge:off');
  }

  /** Record for `ms` ms; returns the path to a 16 kHz WAV, or null on failure. */
  record(ms = 5000): Promise<string | null> {
    if (!this.win) {
      logger.error('Mic recorder has no window');
      return Promise.resolve(null);
    }
    if (!fs.existsSync(AUDIO_CACHE)) fs.mkdirSync(AUDIO_CACHE, { recursive: true });

    return new Promise((resolve) => {
      const cleanup = () => {
        ipcMain.removeListener('record:audio', onAudio);
        ipcMain.removeListener('record:error', onError);
        clearTimeout(timer);
      };
      const onAudio = (_e: unknown, buf: ArrayBuffer) => {
        cleanup();
        const file = path.join(AUDIO_CACHE, `mic-${Date.now()}.wav`);
        try {
          fs.writeFileSync(file, Buffer.from(buf));
          resolve(file);
        } catch (err) {
          logger.error('Failed to write mic WAV', { error: (err as Error).message });
          resolve(null);
        }
      };
      const onError = (_e: unknown, msg: string) => {
        cleanup();
        logger.error('Mic capture error', { msg });
        resolve(null);
      };
      // Safety net: if the renderer never answers, don't hang forever.
      const timer = setTimeout(() => {
        cleanup();
        logger.error('Mic capture timed out');
        resolve(null);
      }, ms + 8000);

      ipcMain.once('record:audio', onAudio);
      ipcMain.once('record:error', onError);
      this.win.webContents.send('record:start', ms);
    });
  }
}

export const micRecorder = new MicRecorder();
