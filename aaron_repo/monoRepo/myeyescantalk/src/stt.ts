import fs from 'fs';
import { logger } from '../electron/logger';
import { whisperService } from './whisper-service';

/**
 * Speech-to-text dispatcher.
 *
 * Prefers ElevenLabs Scribe (cloud) — fast and accurate, and it does NOT
 * hallucinate text on short/noisy clips the way local whisper does (which was
 * breaking wake-word detection). Falls back to local whisper.cpp when there's
 * no ElevenLabs key or the request fails (offline safety).
 */

const EL_STT_URL = 'https://api.elevenlabs.io/v1/speech-to-text';

function cleanNonSpeech(text: string): string {
  const s = text
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[♪♫🎵🎶]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return /[a-záéíóúüñ0-9]/i.test(s) ? s : '';
}

export function isSttReady(): boolean {
  return !!process.env.ELEVENLABS_API_KEY || whisperService.isReady();
}

async function elevenScribe(wavPath: string): Promise<string | null> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return null;
  try {
    const buf = fs.readFileSync(wavPath);
    const form = new FormData();
    form.append('file', new Blob([buf as any], { type: 'audio/wav' }), 'audio.wav');
    form.append('model_id', 'scribe_v1');
    form.append('language_code', 'spa'); // ISO-639-3 for Spanish
    const res = await fetch(EL_STT_URL, {
      method: 'POST',
      headers: { 'xi-api-key': key },
      body: form as any,
    });
    if (!res.ok) {
      logger.warn('ElevenLabs STT failed', { status: res.status, body: (await res.text()).slice(0, 150) });
      return null;
    }
    const data: any = await res.json();
    return cleanNonSpeech(String(data.text || ''));
  } catch (err) {
    logger.warn('ElevenLabs STT error', { error: (err as Error).message });
    return null;
  }
}

/** Transcribe a WAV file. Returns trimmed text, or null if nothing usable. */
export async function transcribe(wavPath: string): Promise<string | null> {
  if (process.env.ELEVENLABS_API_KEY) {
    const t = await elevenScribe(wavPath);
    if (t !== null) return t || null; // EL answered (possibly empty) → use it
    // EL errored → fall through to whisper
  }
  return whisperService.transcribe(wavPath);
}
