import { ttsService } from '../src/tts-service';

/**
 * Verifies the TTS pipeline audibly. Speaks Spanish then English. Uses Piper if
 * voices are installed, otherwise the macOS system voice (Paulina for es).
 */
async function main() {
  ttsService.initialize();
  const engine = await ttsService.activeEngine('es');
  console.log('>>> ACTIVE TTS ENGINE:', engine.toUpperCase());
  console.log('Piper available — es:', ttsService.hasPiper('es'), '| en:', ttsService.hasPiper('en'));
  console.log('Speaking Spanish...');
  await ttsService.speak('Hola, soy tu asistente. Esta es una prueba de voz en español.', 'es');
  console.log('Speaking English...');
  await ttsService.speak('Hello, this is an English voice test.', 'en');
  console.log('✓ TTS test complete');
}

main().catch((e) => {
  console.error('✗ TTS test failed:', e);
  process.exit(1);
});
