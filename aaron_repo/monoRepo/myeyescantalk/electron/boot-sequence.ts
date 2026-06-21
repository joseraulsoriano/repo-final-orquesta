import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger, logAndSpeak } from './logger';
import { audioRouter } from './audio-router';
import { setupSidecars } from '../scripts/setup-sidecars';
import { appConfig } from '../src/app-config';
import { ttsService } from '../src/tts-service';
import { routeToGlasses } from '../src/glasses';
import { isSttReady } from '../src/stt';

const SIDECARS_DIR = path.join(os.homedir(), '.myeyescantalk', 'sidecars');
const PIPER_BIN = path.join(SIDECARS_DIR, 'piper', 'piper');

export class BootSequence {
  private maxRetries = 3;
  private retryDelay = 2000; // ms

  async run(): Promise<boolean> {
    try {
      // Step 1: Instant greeting — spoken immediately so the user knows the
      // app is alive before any heavy work begins.
      logAndSpeak('Iniciando…', 'info');
      logger.info('Boot sequence started');

      // Step 0/first-run: download what we can (model + voices). Spoken progress.
      if (appConfig.isFirstRun()) {
        logAndSpeak('Primera ejecución. Preparando componentes...', 'info');
        logger.info('First run - setting up sidecars');
        await setupSidecars();
        // Pick up any newly downloaded Piper voices for higher-quality speech.
        ttsService.refresh();
        appConfig.markSetupComplete();
        logAndSpeak('Preparación completada', 'info');
      }

      // Step 2: Detect and configure audio (silent unless there's a problem).
      logger.info('Configuring audio');
      await this.configureAudio();

      // Step 3: Health checks (silent unless a component is unavailable).
      logger.info('Running health checks');
      await this.runHealthChecks();

      // Boot complete. The spoken welcome is delivered by the voice loop.
      logger.info('Boot sequence completed successfully');
      return true;
    } catch (error) {
      logAndSpeak(`Error durante el inicio: ${(error as Error).message}`, 'error');
      logger.error('Boot sequence failed', { error: (error as Error).message });
      return false;
    }
  }

  private async configureAudio(): Promise<void> {
    try {
      // Detect devices
      const devices = await audioRouter.detectDevices();

      if (devices.length === 0) {
        throw new Error('No audio devices found');
      }

      // List devices
      audioRouter.printDevices();

      // 1) Prefer the Ray-Ban Meta glasses: auto-connect + route in/out to them.
      const glasses = await routeToGlasses();
      if (glasses.routed) {
        logger.info('Using glasses for audio', { device: glasses.device });
        return;
      }
      if (glasses.paired) {
        // Paired but not connected/found — worth saying (they may be off).
        logAndSpeak('No encontré tus lentes. Asegúrate de que estén encendidos y cerca.', 'warn');
      }

      // 2) Fallback: another Bluetooth device, else built-in (silent on success).
      const btDevices = audioRouter.getBluetoothDevices();
      if (btDevices.length > 0) {
        const name = btDevices[0].name;
        audioRouter.saveDevicePreference(name, name);
        logger.info('Using Bluetooth audio', { device: name });
      } else {
        const input = audioRouter.getInputDevices()[0];
        const output = audioRouter.getOutputDevices()[0];
        if (input && output) {
          audioRouter.saveDevicePreference(input.name, output.name);
        }
        logger.info('Using built-in audio (no Bluetooth device)');
      }
    } catch (error) {
      throw new Error(`Audio configuration failed: ${(error as Error).message}`);
    }
  }

  /**
   * Check each component. Everything is logged, but only UNAVAILABLE components
   * are spoken — a healthy startup stays quiet (just "Iniciando…").
   */
  private async runHealthChecks(): Promise<void> {
    // STT: ready if ElevenLabs Scribe (cloud) or local whisper is available.
    const sttOk = isSttReady();
    logger.info('Health: STT', { ok: sttOk });
    if (!sttOk) logAndSpeak('El reconocimiento de voz no está disponible.', 'warn');

    // TTS always works (macOS `say` is the baseline), so it's never announced.
    logger.info('Health: TTS', { piper: fs.existsSync(PIPER_BIN) && ttsService.hasPiper('es') });
  }
}

export const bootSequence = new BootSequence();
