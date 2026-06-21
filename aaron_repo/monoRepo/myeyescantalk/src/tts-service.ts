import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger, setSpeaker } from '../electron/logger';
import { appConfig } from './app-config';

const PIPER_DIR = path.join(os.homedir(), '.myeyescantalk', 'sidecars', 'piper');
const PIPER_BIN = path.join(PIPER_DIR, 'piper');
const VOICES_DIR = path.join(os.homedir(), '.myeyescantalk', 'voices');
const AUDIO_CACHE = path.join(os.homedir(), '.myeyescantalk', 'audio-cache');

// Piper needs these shared libraries next to its binary. The macOS release
// tarball is known to omit them, in which case Piper cannot run — we must NOT
// attempt it (a failed spawn wastes ~3s per utterance before the fallback).
const PIPER_REQUIRED_DYLIBS = [
  'libonnxruntime.1.14.1.dylib',
  'libespeak-ng.1.dylib',
  'libpiper_phonemize.1.dylib',
];

// Speaking rate for the macOS `say` fallback (words/min). Slightly brisk for
// snappy feedback without sounding rushed.
const SAY_RATE = 190;

// ElevenLabs cloud TTS (preferred path when a key is present). Flash v2.5 is the
// low-latency multilingual model (~75 ms + network). One voice ("Catalina",
// Chilean Spanish) is used for both languages — the model is multilingual.
const EL_API = 'https://api.elevenlabs.io/v1';
const EL_MODEL = 'eleven_flash_v2_5';
const EL_VOICE_NAME = 'Catalina';
const EL_KEY_FILE = path.join(os.homedir(), '.myeyescantalk', 'elevenlabs.key');

export type Lang = 'es' | 'en';

interface QueueItem {
  text: string;
  lang: Lang;
}

/**
 * TTS service for the eyes-free assistant.
 *
 * Engine priority per utterance:
 *   1. ElevenLabs (cloud, best quality) — when an API key is configured
 *   2. Piper (local neural) — when its binary + voices are present
 *   3. macOS `say` (always available, offline) — the guaranteed baseline
 *
 * Core guarantee: the app is NEVER silent. If a higher tier fails (network down,
 * bad key), it automatically falls through to the next, ending at `say`.
 *
 * All speech is serialized through a queue so messages never talk over each
 * other — important when the assistant narrates several steps in a row.
 */
export class TtsService {
  private piperVoices: Partial<Record<Lang, string>> = {};
  private sayVoice: Partial<Record<Lang, string>> = {};
  private queue: QueueItem[] = [];
  private draining = false;
  private current: import('child_process').ChildProcess | null = null; // playing process
  private gen = 0; // bumped by stop() to cancel in-flight synthesis/playback

  private elevenKey = '';
  // undefined = not resolved yet; null = resolved but voice not found; string = id
  private elevenVoiceId: string | null | undefined = undefined;
  private lastSpokeAt = 0;

  /** True only when Piper can actually run (binary + all required dylibs present). */
  private piperRuntimeOk(): boolean {
    if (!fs.existsSync(PIPER_BIN)) return false;
    return PIPER_REQUIRED_DYLIBS.every((lib) => fs.existsSync(path.join(PIPER_DIR, lib)));
  }

  /** Detect what's available. Safe to call multiple times (e.g. after downloads). */
  refresh(): void {
    // Piper voices (quality path) — only if the runtime is actually usable.
    this.piperVoices = {};
    if (this.piperRuntimeOk()) {
      const es = this.findPiperVoice('es');
      const en = this.findPiperVoice('en');
      if (es) this.piperVoices.es = es;
      if (en) this.piperVoices.en = en;
    } else if (fs.existsSync(PIPER_BIN)) {
      logger.warn('Piper binary present but runtime libraries missing — using system voice', {
        needs: PIPER_REQUIRED_DYLIBS,
      });
    }
    logger.info('TTS refreshed', {
      piper: { es: !!this.piperVoices.es, en: !!this.piperVoices.en },
      sayVoice: this.sayVoice,
    });
  }

  initialize(): void {
    if (!fs.existsSync(AUDIO_CACHE)) fs.mkdirSync(AUDIO_CACHE, { recursive: true });

    // Load env files so a key in .env.local / .env is picked up. .env.local wins
    // (loaded first; dotenv does not override already-set vars).
    try {
      const dotenv = require('dotenv');
      dotenv.config({ path: '.env.local', quiet: true });
      dotenv.config({ path: '.env', quiet: true });
    } catch {
      /* dotenv optional */
    }

    // ElevenLabs key (preferred cloud TTS). Looked up from env, key file, or config.
    this.elevenKey = this.loadElevenKey();

    // Pick the best native macOS voice per language. Prefer an Enhanced/Premium
    // neural voice if the user has installed one (far better quality, still
    // ~zero latency); otherwise fall back to the base voice (Paulina for es_MX).
    this.sayVoice.es = this.bestSayVoice('es') || 'Paulina';
    this.sayVoice.en = this.bestSayVoice('en') || '';

    this.refresh();
    logger.info('TTS engines', {
      elevenLabs: this.elevenKey ? 'configured' : 'not configured',
    });

    // Route logAndSpeak() through real audio. From now on every spoken
    // state/prompt/error the rest of the app emits is actually heard.
    // App narration is always Spanish (the primary user language).
    setSpeaker((text) => {
      void this.speak(text, 'es');
    });

    logger.info('TTS service initialized');
  }

  /**
   * Pick the best native macOS voice for a language. Returns an Enhanced/Premium
   * neural voice name if the user has one installed (much better quality, still
   * instant), otherwise null so the caller uses a curated base voice.
   */
  private bestSayVoice(lang: Lang): string | null {
    let out = '';
    try {
      out = execSync("say -v '?'", { encoding: 'utf8' });
    } catch {
      return null;
    }
    const wantLocale = lang === 'es' ? /^es_(MX|419|US|ES)$/ : /^en_(US|GB)$/;
    const candidates = out
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const left = (line.includes('#') ? line.slice(0, line.indexOf('#')) : line).trim();
        const m = left.match(/\s([a-z]{2}_[A-Za-z0-9]+)$/);
        if (!m) return null;
        const locale = m[1];
        const name = left.slice(0, left.length - locale.length).trim();
        return { name, locale, enhanced: /\((Enhanced|Premium)\)/i.test(name) };
      })
      .filter((c): c is { name: string; locale: string; enhanced: boolean } => !!c);

    // Only auto-select an Enhanced/Premium voice; prefer es_MX among those.
    const enhanced = candidates
      .filter((c) => c.enhanced && wantLocale.test(c.locale))
      .sort((a, b) => (b.locale === 'es_MX' ? 1 : 0) - (a.locale === 'es_MX' ? 1 : 0));
    return enhanced.length > 0 ? enhanced[0].name : null;
  }

  /** Find a Piper .onnx voice for a language (first match wins). Requires a .json sidecar. */
  private findPiperVoice(lang: Lang): string | null {
    if (!fs.existsSync(VOICES_DIR)) return null;
    const prefix = lang === 'es' ? 'es_' : 'en_';
    const files = fs.readdirSync(VOICES_DIR);
    for (const f of files) {
      if (f.startsWith(prefix) && f.endsWith('.onnx')) {
        const full = path.join(VOICES_DIR, f);
        const cfg = full + '.json';
        // A valid Piper voice is a real model (>1 MB) with its config sidecar.
        if (fs.existsSync(cfg) && fs.statSync(full).size > 1_000_000) {
          return full;
        }
      }
    }
    return null;
  }

  /** Queue text to be spoken. Resolves when this item finishes playing. */
  speak(text: string, lang?: Lang): Promise<void> {
    const clean = (text || '').trim();
    if (!clean) return Promise.resolve();
    const item: QueueItem = { text: clean, lang: lang ?? this.detectLang(clean) };
    this.queue.push(item);
    return this.drain();
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length > 0) {
        const item = this.queue.shift()!;
        try {
          await this.speakNow(item.text, item.lang);
        } catch (err) {
          // Last-resort: never fail silently. Try plain `say`.
          logger.error('TTS playback error, falling back to say', {
            error: (err as Error).message,
          });
          await this.saySpeak(item.text, item.lang).catch(() => {});
        }
      }
    } finally {
      this.draining = false;
      this.lastSpokeAt = Date.now();
    }
  }

  /** Immediately stop speaking and drop anything queued (for barge-in). */
  stop(): void {
    this.gen++; // invalidate any in-flight synth/playback
    this.queue = [];
    if (this.current) {
      try {
        this.current.kill();
      } catch {
        /* ignore */
      }
      this.current = null;
    }
    this.lastSpokeAt = Date.now();
  }

  /** True while the assistant is producing audio. Used to mute self-hearing. */
  isSpeaking(): boolean {
    return this.draining;
  }

  /** Milliseconds since the assistant last finished speaking. */
  msSinceSpoke(): number {
    return Date.now() - this.lastSpokeAt;
  }

  private async speakNow(text: string, lang: Lang): Promise<void> {
    // 1. ElevenLabs (best quality) when configured.
    if (this.elevenKey) {
      try {
        await this.elevenSpeak(text, lang);
        return;
      } catch (err) {
        logger.warn('ElevenLabs TTS failed, falling back', { error: (err as Error).message });
      }
    }
    // 2. Piper (local neural) when available.
    const voice = this.piperVoices[lang];
    if (voice) {
      try {
        await this.piperSpeak(text, voice);
        return;
      } catch (err) {
        logger.warn('Piper TTS failed, falling back to say', { error: (err as Error).message });
      }
    }
    // 3. macOS say (guaranteed).
    await this.saySpeak(text, lang);
  }

  /** Read the ElevenLabs API key from env, a key file, or the app config. */
  private loadElevenKey(): string {
    if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim();
    if (fs.existsSync(EL_KEY_FILE)) {
      // Use the first non-empty, non-comment line so the file can carry notes.
      const line = fs
        .readFileSync(EL_KEY_FILE, 'utf8')
        .split('\n')
        .map((s) => s.trim())
        .find((s) => s && !s.startsWith('#'));
      if (line) return line;
    }
    const cfg = appConfig.get('elevenLabsApiKey');
    return cfg ? String(cfg).trim() : '';
  }

  /** Resolve the Catalina voice id once (env/config override, else lookup by name). */
  private async ensureElevenVoiceId(): Promise<string | null> {
    if (this.elevenVoiceId !== undefined) return this.elevenVoiceId;

    const override = process.env.ELEVENLABS_VOICE_ID || appConfig.get('elevenVoiceId');
    if (override) {
      this.elevenVoiceId = String(override);
      return this.elevenVoiceId;
    }

    try {
      const res = await fetch(`${EL_API}/voices`, { headers: { 'xi-api-key': this.elevenKey } });
      if (!res.ok) {
        logger.error('ElevenLabs voices lookup failed', { status: res.status });
        this.elevenVoiceId = null;
        return null;
      }
      const data: any = await res.json();
      const match = (data.voices || []).find((v: any) => new RegExp(EL_VOICE_NAME, 'i').test(v.name));
      if (match) {
        this.elevenVoiceId = match.voice_id;
        logger.info('ElevenLabs voice resolved', { name: match.name, id: match.voice_id });
      } else {
        this.elevenVoiceId = null;
        logger.warn(`ElevenLabs voice "${EL_VOICE_NAME}" not in your account — add it in the ElevenLabs app or set elevenVoiceId`);
      }
      return this.elevenVoiceId ?? null;
    } catch (err) {
      logger.error('ElevenLabs voices request error', { error: (err as Error).message });
      this.elevenVoiceId = null;
      return null;
    }
  }

  /**
   * Speak via ElevenLabs with sentence pipelining: the first (short) sentence
   * starts playing as soon as it's synthesized (~0.6s), while the next sentence
   * is synthesized in parallel during playback. This cuts time-to-first-audio
   * dramatically vs. waiting for the whole paragraph.
   *
   * Throws only on a hard failure (voice can't be resolved) so speakNow can fall
   * back to a local engine. Transient per-sentence errors fall back to `say` for
   * that sentence (no double-speak).
   */
  private async elevenSpeak(text: string, lang: Lang): Promise<void> {
    const voiceId = await this.ensureElevenVoiceId();
    if (!voiceId) throw new Error('no ElevenLabs voice available');

    const myGen = this.gen; // if stop() bumps this, abort immediately (barge-in)
    // Short text (intro, most replies) is synthesized in ONE call so it flows
    // naturally; only long text is split into sentences for faster first-audio.
    const sentences = text.length < 220 ? [text.trim()] : this.splitSentences(text);

    // Look-ahead of 1: synthesize sentence i+1 while sentence i plays.
    let nextSynth: Promise<string | null> = this.synthSafe(sentences[0], voiceId);
    for (let i = 0; i < sentences.length; i++) {
      const file = await nextSynth;
      if (this.gen !== myGen) {
        if (file) fs.promises.unlink(file).catch(() => {});
        return; // interrupted — do NOT play the next pre-synthesized sentence
      }
      if (i + 1 < sentences.length) {
        nextSynth = this.synthSafe(sentences[i + 1], voiceId);
      }
      if (file) {
        try {
          await this.playFile(file);
        } finally {
          fs.promises.unlink(file).catch(() => {});
        }
      } else {
        await this.saySpeak(sentences[i], lang);
      }
      if (this.gen !== myGen) return; // interrupted after this sentence
    }
  }

  /** Synthesize one chunk to an mp3 file; resolves null on failure (never throws). */
  private async synthSafe(text: string, voiceId: string): Promise<string | null> {
    try {
      // /stream returns audio as it is generated → lower time-to-first-byte.
      const res = await fetch(`${EL_API}/text-to-speech/${voiceId}/stream?output_format=mp3_44100_128`, {
        method: 'POST',
        headers: { 'xi-api-key': this.elevenKey, 'content-type': 'application/json' },
        // language_code locks Flash v2.5 to Spanish (primary language) for
        // consistent pronunciation.
        body: JSON.stringify({ text, model_id: EL_MODEL, language_code: 'es' }),
      });
      if (!res.ok) {
        logger.warn('ElevenLabs synth failed for chunk', { status: res.status });
        return null;
      }
      const mp3 = path.join(AUDIO_CACHE, `el-${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`);
      fs.writeFileSync(mp3, Buffer.from(await res.arrayBuffer()));
      return mp3;
    } catch (err) {
      logger.warn('ElevenLabs synth error for chunk', { error: (err as Error).message });
      return null;
    }
  }

  /** Split text into sentence-ish chunks, merging tiny fragments to avoid choppiness. */
  private splitSentences(text: string): string[] {
    const raw = text.replace(/\s+/g, ' ').trim();
    const pieces = raw.match(/[^.!?…]+[.!?…]+|\S[^.!?…]*$/g) || [raw];
    const out: string[] = [];
    for (const p of pieces) {
      const s = p.trim();
      if (!s) continue;
      // Merge very short fragments into the previous chunk for smoother prosody.
      if (out.length > 0 && (s.length < 18 || out[out.length - 1].length < 18)) {
        out[out.length - 1] = `${out[out.length - 1]} ${s}`;
      } else {
        out.push(s);
      }
    }
    return out.length > 0 ? out : [raw];
  }

  /** Play an audio file (mp3/wav) via afplay. Tracked so stop() can kill it. */
  private playFile(file: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const p = spawn('afplay', [file]);
      this.current = p;
      p.on('error', reject);
      p.on('close', () => {
        if (this.current === p) this.current = null;
        resolve();
      });
    });
  }

  /** High-quality path: Piper synthesizes a WAV, afplay plays it. */
  private piperSpeak(text: string, voicePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const wav = path.join(AUDIO_CACHE, `tts-${Date.now()}-${Math.random().toString(36).slice(2)}.wav`);
      const piper = spawn(PIPER_BIN, ['--model', voicePath, '--output_file', wav]);
      let stderr = '';
      piper.stderr?.on('data', (d) => (stderr += d.toString()));
      piper.on('error', reject);
      piper.on('close', (code) => {
        if (code !== 0 || !fs.existsSync(wav)) {
          reject(new Error(`piper exited ${code}: ${stderr.slice(0, 200)}`));
          return;
        }
        const afplay = spawn('afplay', [wav]);
        this.current = afplay;
        afplay.on('error', reject);
        afplay.on('close', () => {
          if (this.current === afplay) this.current = null;
          fs.promises.unlink(wav).catch(() => {});
          resolve();
        });
      });
      piper.stdin.write(text);
      piper.stdin.end();
    });
  }

  /** Guaranteed path: macOS `say`. Always available, offline. */
  private saySpeak(text: string, lang: Lang): Promise<void> {
    return new Promise((resolve, reject) => {
      const args: string[] = [];
      const voice = this.sayVoice[lang];
      if (voice) args.push('-v', voice);
      args.push('-r', String(SAY_RATE));
      args.push(text);
      const say = spawn('say', args);
      this.current = say;
      say.on('error', reject);
      say.on('close', () => {
        if (this.current === say) this.current = null;
        resolve();
      });
    });
  }

  /**
   * Heuristic language detection for content of unknown origin (e.g. agent
   * replies or on-screen text). Spanish accents/punctuation or common Spanish
   * function words → es; otherwise en. App narration bypasses this and forces es.
   */
  private detectLang(text: string): Lang {
    if (/[áéíóúñ¿¡]/i.test(text)) return 'es';
    if (/\b(el|la|los|las|un|una|de|que|en|por|para|con|cómo|qué|está|hola|gracias)\b/i.test(text)) {
      return 'es';
    }
    return 'en';
  }

  /** True when the high-quality Piper path is available for a language. */
  hasPiper(lang: Lang): boolean {
    return !!this.piperVoices[lang];
  }

  /** Which engine an utterance would actually use right now (resolves ElevenLabs). */
  async activeEngine(lang: Lang = 'es'): Promise<'elevenlabs' | 'piper' | 'say'> {
    if (this.elevenKey && (await this.ensureElevenVoiceId())) return 'elevenlabs';
    if (this.piperVoices[lang]) return 'piper';
    return 'say';
  }
}

export const ttsService = new TtsService();
