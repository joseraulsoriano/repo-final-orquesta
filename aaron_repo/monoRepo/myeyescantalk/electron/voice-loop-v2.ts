import fs from 'fs';
import { spawn } from 'child_process';
import { logger, logAndSpeak } from './logger';
import { Agent } from '../openclaw-plugin/agent-interface';
import { SystemAgent } from '../openclaw-plugin/system-agent';
import { ClaudeAgent } from '../openclaw-plugin/claude-agent';
import { whisperService } from '../src/whisper-service';
import { transcribe as sttTranscribe, isSttReady } from '../src/stt';
import { wakeWordService } from '../src/wake-word-service';
import { ttsService } from '../src/tts-service';
import { micRecorder } from './mic-recorder';

// Instant "I'm listening" cue (local, ~0.2s) — replaces a slow synthesized prompt.
const LISTEN_CUE = '/System/Library/Sounds/Tink.aiff';

/**
 * Runtime voice loop, built for low latency and constant feedback:
 *  - Wake word "asistente" → instant beep → capture (endpointed) → submit.
 *  - Commands go into an async queue and run in the background, so you can keep
 *    talking; the agent narrates each step so you're never in silence.
 *  - Saying something already queued/running → "Ya estoy en eso."
 *  - Speaking over the assistant interrupts it (barge-in).
 */
export class VoiceLoopV2 {
  private agent: Agent = new SystemAgent();
  private running = false;
  private capturing = false;
  private queue: string[] = [];
  private active: string | null = null;
  private workerRunning = false;

  initialize(): boolean {
    whisperService.initialize(); // local STT fallback
    const sttReady = isSttReady();
    if (ClaudeAgent.isConfigured()) {
      this.agent = new ClaudeAgent((q) => this.confirmByVoice(q));
      logger.info('Agent: Claude (reasoning + vision)');
    } else {
      this.agent = new SystemAgent();
      logger.info('Agent: local intent (no ANTHROPIC_API_KEY)');
    }
    // Barge-in: when the user talks over the assistant, stop and listen.
    micRecorder.onBarge(() => this.onBarge());
    logger.info('Voice loop initialized', { stt: sttReady });
    return true;
  }

  async start(): Promise<void> {
    this.running = true;
    if (wakeWordService.isReady()) {
      // One fluid sentence (synthesized in a single call, no chunk pauses).
      logAndSpeak(
        'Hola, bienvenido, soy tu asistente; cuando quieras algo, solo di asistente y dime qué necesitas.',
        'info'
      );
      await wakeWordService.startListening(() => this.captureAndSubmit());
    } else {
      logAndSpeak('El reconocimiento de voz no está disponible en este momento.', 'warn');
    }
  }

  stop(): void {
    this.running = false;
    wakeWordService.stopListening();
  }

  /** User spoke over the assistant: stop talking and capture what they want. */
  private onBarge(): void {
    logger.info('Barge-in — stopping speech and listening');
    ttsService.stop();
    void this.captureAndSubmit();
  }

  /** Wake fired → beep → record the command → submit. */
  private async captureAndSubmit(): Promise<void> {
    if (this.capturing) return;
    if (!isSttReady()) {
      logAndSpeak('El reconocimiento de voz no está disponible.', 'warn');
      return;
    }
    this.capturing = true;
    wakeWordService.pause();
    try {
      await this.playCue(); // quiet "listening" beep
      // Let the beep (and its Bluetooth echo) die down BEFORE opening the mic,
      // otherwise the recorder captures the beep and thinks you already spoke.
      await new Promise((r) => setTimeout(r, 350));
      const wav = await micRecorder.record(8000);
      if (!wav) return;
      const transcript = await sttTranscribe(wav);
      fs.promises.unlink(wav).catch(() => {});
      if (!transcript) {
        logger.info('Empty command capture');
        await ttsService.speak('No te entendí, ¿puedes repetir?', 'es');
        return;
      }
      logger.info('Captured command', { transcript });
      this.submit(transcript);
    } finally {
      this.capturing = false;
      wakeWordService.resume();
    }
  }

  /** Queue a command. Dedups against in-flight/queued work, then kicks the worker. */
  private submit(text: string): void {
    const n = this.norm(text);
    if (this.active && this.similar(n, this.norm(this.active))) {
      void ttsService.speak('Ya estoy en eso.', 'es');
      return;
    }
    if (this.queue.some((q) => this.similar(n, this.norm(q)))) {
      void ttsService.speak('Eso ya está en la cola.', 'es');
      return;
    }
    this.queue.push(text);
    // If something is already running, acknowledge instantly so it's not silent.
    if (this.active) void ttsService.speak('Enseguida, lo agrego.', 'es');
    void this.runWorker();
  }

  /** Drains the queue one task at a time, narrating progress, never silent. */
  private async runWorker(): Promise<void> {
    if (this.workerRunning) return;
    this.workerRunning = true;
    try {
      while (this.queue.length > 0) {
        const task = this.queue.shift()!;
        this.active = task;
        try {
          const reply = await this.agent.sendToAgent(task, (p) => {
            // Live narration of each step → the user always knows what's happening.
            void ttsService.speak(p, 'es');
          });
          micRecorder.bargeOn();
          try {
            await ttsService.speak(reply, 'es');
          } finally {
            micRecorder.bargeOff();
          }
        } catch (err) {
          logger.error('Task failed', { task, error: (err as Error).message });
          await ttsService.speak('Hubo un problema con esa acción.', 'es');
        } finally {
          this.active = null;
        }
      }
    } finally {
      this.workerRunning = false;
    }
  }

  /** Speak a yes/no question and capture the spoken answer (for confirmations). */
  private async confirmByVoice(question: string): Promise<boolean> {
    await ttsService.speak(`${question} ¿Sí o no?`, 'es');
    const wav = await micRecorder.record(4000);
    if (!wav) return false;
    const t = await sttTranscribe(wav);
    fs.promises.unlink(wav).catch(() => {});
    const n = (t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    logger.info('Confirmation heard', { text: t });
    if (/\bno\b/.test(n)) return false;
    return /\b(si|claro|dale|confirmo|adelante|hazlo|hagalo|correcto|ok|de acuerdo)\b/.test(n);
  }

  /** Play the instant listening cue (a short system sound). */
  private playCue(): Promise<void> {
    return new Promise((resolve) => {
      try {
        // Quiet beep (-v 0.3) so its Bluetooth echo is less likely to be recorded.
        const p = spawn('afplay', ['-v', '0.3', LISTEN_CUE]);
        p.on('error', () => resolve());
        p.on('close', () => resolve());
      } catch {
        resolve();
      }
    });
  }

  private norm(s: string): string {
    return s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Loose duplicate check: equal, or one contains the other. */
  private similar(a: string, b: string): boolean {
    if (!a || !b) return false;
    return a === b || a.includes(b) || b.includes(a);
  }

  isRunning(): boolean {
    return this.running;
  }
}

export const voiceLoopV2 = new VoiceLoopV2();
