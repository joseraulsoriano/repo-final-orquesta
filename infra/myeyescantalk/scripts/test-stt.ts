import execa = require('execa');
import os from 'os';
import path from 'path';
import fs from 'fs';
import { whisperService } from '../src/whisper-service';

/**
 * Verifies the STT engine end-to-end WITHOUT a microphone: macOS `say` renders
 * a known phrase to a 16 kHz mono WAV (exactly the format whisper.cpp needs),
 * then whisper transcribes it. Proves the binary + model work together.
 */
async function main() {
  if (!whisperService.initialize()) {
    console.error('✗ Whisper not ready — binary or model missing. See logs.');
    process.exit(1);
  }

  const wav = path.join(os.tmpdir(), 'mect-stt-test.wav');
  const phrase = 'Hola, esta es una prueba de reconocimiento de voz.';
  console.log('Generating 16 kHz test audio with `say`:', phrase);
  await execa('say', [
    '-v', 'Paulina',
    '--data-format=LEI16@16000',
    '--file-format=WAVE',
    '-o', wav,
    phrase,
  ]);

  console.log('Transcribing with whisper.cpp...');
  const transcript = await whisperService.transcribe(wav);
  fs.promises.unlink(wav).catch(() => {});

  console.log('\n  Expected : ', phrase);
  console.log('  Got      : ', transcript);
  console.log(transcript ? '\n✓ STT test complete' : '\n✗ STT produced no text');
  process.exit(transcript ? 0 : 1);
}

main().catch((e) => {
  console.error('✗ STT test failed:', e);
  process.exit(1);
});
