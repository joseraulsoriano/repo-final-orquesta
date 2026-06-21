export interface AudioDevice {
  name: string;
  type: 'input' | 'output';
  transport: 'Bluetooth' | 'Built-in' | 'Unknown';
  sampleRate: number;
  channels: number;
  isDefault?: boolean;
  isSystem?: boolean;
}
