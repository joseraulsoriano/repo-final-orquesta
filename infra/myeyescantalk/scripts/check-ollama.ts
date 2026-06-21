import execa = require('execa');
import { logger } from '../electron/logger';

async function checkOllama(): Promise<boolean> {
  try {
    const { stdout } = await execa('ollama', ['--version']);
    logger.info('Ollama is installed', { version: stdout });
    console.log(`✓ Ollama found: ${stdout.trim()}`);
    return true;
  } catch (error) {
    logger.error('Ollama not found', { error: (error as Error).message });
    console.error('✗ Ollama is not installed');
    console.error('  Download from: https://ollama.ai');
    return false;
  }
}

checkOllama().then((found) => {
  process.exit(found ? 0 : 1);
});
