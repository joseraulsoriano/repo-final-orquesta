import execa = require('execa');
import { logger } from '../electron/logger';
import fs from 'fs';
import os from 'os';
import path from 'path';

const MODEL_NAME = 'ui-tars';
const MODEL_PULL = 'hf.co/Mungert/UI-TARS-1.5-7B-GGUF:Q4_K_M';
const OLLAMA_DIR = path.join(os.homedir(), '.ollama', 'models');

async function checkModelExists(): Promise<boolean> {
  try {
    const { stdout } = await execa('ollama', ['list']);
    return stdout.includes('ui-tars') || stdout.includes('UI-TARS');
  } catch (error) {
    logger.error('Failed to list models', { error: (error as Error).message });
    return false;
  }
}

async function downloadModel(): Promise<boolean> {
  try {
    console.log(`\n📥 Downloading UI-TARS model (Q4_K_M, ~4.4 GB)...`);
    console.log(`   This may take several minutes. Desargando...`);
    console.log(`   Model will be stored in ${OLLAMA_DIR}\n`);

    const subprocess = execa('ollama', ['pull', MODEL_PULL], {
      stdio: 'inherit',
    });

    await subprocess;
    logger.info('Model download completed');
    return true;
  } catch (error) {
    logger.error('Model download failed', { error: (error as Error).message });
    console.error(`\n✗ Failed to download model: ${(error as Error).message}`);
    return false;
  }
}

async function verifyMmproj(): Promise<boolean> {
  // Check if .mmproj file exists alongside the model
  // This is critical for multimodal vision
  const possiblePaths = [
    path.join(OLLAMA_DIR, 'blobs'), // Ollama stores blobs here
    path.join(OLLAMA_DIR, 'ui-tars-1.5-7b-gguf'),
  ];

  for (const dirPath of possiblePaths) {
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath);
      const hasGguf = files.some((f) => f.endsWith('.gguf'));
      const hasMmproj = files.some((f) => f.endsWith('.mmproj'));

      if (hasGguf) {
        if (hasMmproj) {
          logger.info('✓ Model and mmproj verified', { path: dirPath });
          console.log('✓ Model files verified (GGUF + mmproj found)');
          return true;
        } else {
          logger.warn('GGUF found but mmproj missing!', { path: dirPath });
          console.warn('⚠ WARNING: GGUF found but mmproj (vision projector) is missing!');
          console.warn('  The model will appear to work but will be BLIND.');
          console.warn('  Verify that the downloaded model includes the .mmproj file.');
          return false;
        }
      }
    }
  }

  logger.warn('Could not verify model files in expected locations');
  console.warn('⚠ Could not fully verify model files. Check ~/.ollama/models manually.');
  return true; // Don't fail, let Ollama validate at runtime
}

async function main() {
  try {
    console.log('Checking if UI-TARS model already exists...');
    const exists = await checkModelExists();

    if (exists) {
      console.log('✓ UI-TARS model already downloaded');
      return;
    }

    const success = await downloadModel();
    if (!success) {
      process.exit(1);
    }

    console.log('\nVerifying model files...');
    const verified = await verifyMmproj();

    if (verified) {
      console.log('✓ Model ready for use');
    } else {
      console.warn('⚠ Model verification incomplete. Proceeding with caution.');
    }
  } catch (error) {
    logger.error('Unexpected error', { error: (error as Error).message });
    console.error(`✗ Error: ${(error as Error).message}`);
    process.exit(1);
  }
}

main();
