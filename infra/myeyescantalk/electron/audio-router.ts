import execa = require('execa');
import { logger } from './logger';
import { AudioDevice } from '../src/types';
import { appConfig } from '../src/app-config';

export class AudioRouter {
  private devices: AudioDevice[] = [];

  async detectDevices(): Promise<AudioDevice[]> {
    try {
      const { stdout } = await execa('system_profiler', ['SPAudioDataType']);
      this.devices = this.parseAudioDevices(stdout);
      logger.info('Detected audio devices', { devices: this.devices });
      return this.devices;
    } catch (error) {
      logger.error('Failed to detect audio devices', { error: (error as Error).message });
      throw new Error('Audio device detection failed');
    }
  }

  private parseAudioDevices(output: string): AudioDevice[] {
    const devices: AudioDevice[] = [];
    const lines = output.split('\n');

    let currentDevice: Partial<AudioDevice> | null = null;
    let currentName = '';

    for (const line of lines) {
      const trimmed = line.trim();

      // Device name line (e.g., "ACCENTUM:" or "MacBook Air Microphone:")
      if (trimmed.endsWith(':') && !trimmed.startsWith('Input') && !trimmed.startsWith('Output')) {
        if (currentDevice && currentName) {
          currentDevice.name = currentName;
          if (this.isValidDevice(currentDevice)) {
            devices.push(currentDevice as AudioDevice);
          }
        }
        currentName = trimmed.slice(0, -1); // Remove trailing ':'
        currentDevice = {};
      }

      // Parse fields
      if (trimmed.startsWith('Input Channels:')) {
        currentDevice = { ...currentDevice, type: 'input' };
        currentDevice.channels = parseInt(trimmed.split(':')[1].trim(), 10);
      }
      if (trimmed.startsWith('Output Channels:')) {
        currentDevice = { ...currentDevice, type: 'output' };
        currentDevice.channels = parseInt(trimmed.split(':')[1].trim(), 10);
      }
      if (trimmed.startsWith('Transport:')) {
        const transport = trimmed.split(':')[1].trim() as 'Bluetooth' | 'Built-in' | 'Unknown';
        currentDevice = { ...currentDevice, transport };
      }
      if (trimmed.startsWith('Current SampleRate:')) {
        currentDevice!.sampleRate = parseInt(trimmed.split(':')[1].trim(), 10);
      }
      if (trimmed.startsWith('Default Input Device:') || trimmed.startsWith('Default Output Device:')) {
        if (trimmed.includes('Yes')) {
          currentDevice!.isDefault = true;
        }
      }
      if (trimmed.startsWith('Default System Output Device:')) {
        if (trimmed.includes('Yes')) {
          currentDevice!.isSystem = true;
        }
      }
    }

    // Add last device
    if (currentDevice && currentName) {
      currentDevice.name = currentName;
      if (this.isValidDevice(currentDevice)) {
        devices.push(currentDevice as AudioDevice);
      }
    }

    return devices;
  }

  private isValidDevice(device: Partial<AudioDevice>): boolean {
    return !!(device.name && device.type && device.transport && device.channels && device.sampleRate);
  }

  getInputDevices(): AudioDevice[] {
    return this.devices.filter((d) => d.type === 'input');
  }

  getOutputDevices(): AudioDevice[] {
    return this.devices.filter((d) => d.type === 'output');
  }

  getBluetoothDevices(): AudioDevice[] {
    return this.devices.filter((d) => d.transport === 'Bluetooth');
  }

  /** Persist the chosen input/output device names to the unified app config. */
  saveDevicePreference(input: string, output: string): void {
    appConfig.set('audioInput', input);
    appConfig.set('audioOutput', output);
    logger.info('Audio device preference saved', { input, output });
  }

  printDevices(): void {
    console.log('\n=== INPUT DEVICES ===');
    this.getInputDevices().forEach((d) => {
      console.log(`  ${d.name} (${d.transport}) - ${d.channels}ch @ ${d.sampleRate}Hz${d.isDefault ? ' [DEFAULT]' : ''}`);
    });

    console.log('\n=== OUTPUT DEVICES ===');
    this.getOutputDevices().forEach((d) => {
      console.log(`  ${d.name} (${d.transport}) - ${d.channels}ch @ ${d.sampleRate}Hz${d.isDefault ? ' [DEFAULT]' : ''}${d.isSystem ? ' [SYSTEM]' : ''}`);
    });
    console.log('');
  }
}

export const audioRouter = new AudioRouter();
