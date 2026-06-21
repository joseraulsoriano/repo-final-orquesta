import execa = require('execa');
import { logger } from './logger';

export interface ProcessConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  maxRestarts?: number;
  restartDelay?: number; // ms
}

export class Supervisor {
  private processes: Map<string, { process: any; restartCount: number; config: ProcessConfig }> = new Map();
  private restartTimeouts: Map<string, NodeJS.Timeout> = new Map();

  async spawn(config: ProcessConfig): Promise<void> {
    const { name, command, args = [], env = {}, maxRestarts = 5, restartDelay = 1000 } = config;

    if (this.processes.has(name)) {
      logger.warn(`Process ${name} already running`);
      return;
    }

    try {
      logger.info(`Spawning ${name}`, { command, args });
      const subprocess = execa(command, args, {
        env: { ...process.env, ...env },
        stdio: 'pipe',
      });

      subprocess.stdout?.on('data', (data: Buffer) => {
        logger.debug(`[${name}] stdout`, { output: data.toString().trim() });
      });

      subprocess.stderr?.on('data', (data: Buffer) => {
        logger.debug(`[${name}] stderr`, { output: data.toString().trim() });
      });

      this.processes.set(name, { process: subprocess, restartCount: 0, config });
      logger.info(`${name} spawned successfully`, { pid: subprocess.pid });
    } catch (error) {
      logger.error(`Failed to spawn ${name}`, { error: (error as Error).message });
      throw error;
    }
  }

  async kill(name: string): Promise<void> {
    const entry = this.processes.get(name);
    if (!entry) {
      logger.warn(`Process ${name} not found`);
      return;
    }

    try {
      entry.process.kill();
      this.processes.delete(name);
      logger.info(`Killed process ${name}`);
    } catch (error) {
      logger.error(`Failed to kill ${name}`, { error: (error as Error).message });
    }
  }

  async killAll(): Promise<void> {
    for (const name of this.processes.keys()) {
      await this.kill(name);
    }
  }

  async getStatus(name: string): Promise<boolean> {
    const entry = this.processes.get(name);
    if (!entry) return false;
    try {
      return !entry.process.killed;
    } catch {
      return false;
    }
  }

  getAllProcesses(): string[] {
    return Array.from(this.processes.keys());
  }
}

export const supervisor = new Supervisor();
