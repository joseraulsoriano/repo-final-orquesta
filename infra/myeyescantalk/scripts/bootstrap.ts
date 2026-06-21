import execa = require('execa');
import { audioRouter } from '../electron/audio-router';
import { logger } from '../electron/logger';
import fs from 'fs';
import path from 'path';
import os from 'os';

const checks = {
  node: false,
  npm: false,
  ollama: false,
  audio: false,
  config: false,
};

async function checkNode(): Promise<boolean> {
  try {
    const { stdout } = await execa('node', ['--version']);
    const version = stdout.trim();
    const major = parseInt(version.split('.')[0].slice(1), 10);
    if (major >= 20) {
      console.log(`✓ Node.js ${version}`);
      return true;
    } else {
      console.error(`✗ Node.js ${version} (need 20+)`);
      return false;
    }
  } catch {
    console.error('✗ Node.js not found');
    return false;
  }
}

async function checkNpm(): Promise<boolean> {
  try {
    const { stdout } = await execa('npm', ['--version']);
    console.log(`✓ npm ${stdout.trim()}`);
    return true;
  } catch {
    console.error('✗ npm not found');
    return false;
  }
}

async function checkOllama(): Promise<boolean> {
  try {
    const { stdout } = await execa('ollama', ['--version']);
    console.log(`✓ Ollama: ${stdout.trim()}`);
    return true;
  } catch {
    console.error('✗ Ollama not found');
    console.error('  → Download from: https://ollama.ai');
    return false;
  }
}

async function checkAudio(): Promise<boolean> {
  try {
    const devices = await audioRouter.detectDevices();
    const btDevices = audioRouter.getBluetoothDevices();
    const inputDevices = audioRouter.getInputDevices();
    const outputDevices = audioRouter.getOutputDevices();

    console.log(`✓ Audio: ${devices.length} devices`);
    if (btDevices.length > 0) {
      console.log(`  └─ Bluetooth: ${btDevices.map((d) => d.name).join(', ')}`);
    }
    console.log(`  └─ Input: ${inputDevices.map((d) => d.name).join(', ')}`);
    console.log(`  └─ Output: ${outputDevices.map((d) => d.name).join(', ')}`);
    return true;
  } catch (error) {
    console.error(`✗ Audio detection failed: ${(error as Error).message}`);
    return false;
  }
}

async function checkConfig(): Promise<boolean> {
  const logsDir = path.join(os.homedir(), '.myeyescantalk', 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  console.log(`✓ Config & logs: ${path.join(os.homedir(), '.myeyescantalk/')}`);
  return true;
}

async function main() {
  console.log('\n🔍 Bootstrapping My Eyes Can Talk...\n');

  const results = await Promise.all([
    checkNode(),
    checkNpm(),
    checkOllama(),
    checkAudio(),
    checkConfig(),
  ]);

  const [nodeOk, npmOk, ollamaOk, audioOk, configOk] = results;

  console.log('\n📋 Summary:');
  console.log(`  Node.js:     ${nodeOk ? '✓' : '✗'}`);
  console.log(`  npm:         ${npmOk ? '✓' : '✗'}`);
  console.log(`  Ollama:      ${ollamaOk ? '✓' : '⚠️ (optional)'}`);
  console.log(`  Audio:       ${audioOk ? '✓' : '✗'}`);
  console.log(`  Config:      ${configOk ? '✓' : '✗'}`);

  if (nodeOk && npmOk && audioOk && configOk) {
    console.log('\n✓ Bootstrap complete! Ready to run.\n');
    console.log('Next steps:');
    if (!ollamaOk) {
      console.log('  1. Install Ollama from https://ollama.ai');
    }
    console.log('  2. npm run build:ts   (compile TypeScript)');
    console.log('  3. npm run dev        (start the app)\n');
    process.exit(0);
  } else {
    console.log('\n✗ Bootstrap failed. Check errors above.\n');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Fatal error: ${error.message}`);
  process.exit(1);
});
