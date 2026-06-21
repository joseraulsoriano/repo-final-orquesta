import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_FILE = path.join(os.homedir(), '.myeyescantalk', 'app.config.json');

export interface AppConfig {
  version: string;
  setupComplete: boolean;
  language: string; // primary UI/narration language ('es')
  audioInput?: string; // preferred input device name
  audioOutput?: string; // preferred output device name
  elevenLabsApiKey?: string; // ElevenLabs API key (cloud TTS)
  elevenVoiceId?: string; // resolved/overridden ElevenLabs voice id
  glassesName?: string; // name substring to match the glasses (default: ray-ban/meta)
}

const DEFAULT_CONFIG: AppConfig = {
  version: '0.1.0',
  setupComplete: false,
  language: 'es',
};

export class Config {
  private config: AppConfig;

  constructor() {
    this.config = this.load();
  }

  private load(): AppConfig {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
        return JSON.parse(data);
      }
    } catch (error) {
      // Ignore parse errors, use defaults
    }
    return { ...DEFAULT_CONFIG };
  }

  save(): void {
    const dir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2));
  }

  get(key: keyof AppConfig): any {
    return (this.config as any)[key];
  }

  set(key: keyof AppConfig, value: any): void {
    (this.config as any)[key] = value;
    this.save();
  }

  isFirstRun(): boolean {
    return !this.config.setupComplete;
  }

  markSetupComplete(): void {
    this.set('setupComplete', true);
  }
}

export const appConfig = new Config();
