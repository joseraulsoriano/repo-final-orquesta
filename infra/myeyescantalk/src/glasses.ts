import execa = require('execa');
import { logger } from '../electron/logger';
import { appConfig } from './app-config';

/**
 * Ray-Ban Meta glasses integration.
 *
 * macOS forbids programmatic PAIRING (a one-time manual step), but once paired
 * we can auto-CONNECT (blueutil) and ROUTE audio in/out to them
 * (SwitchAudioSource). Devices are matched by a configurable name substring —
 * never hard-coded — defaulting to Ray-Ban / Meta.
 */

const DEFAULT_MATCH = /ray-?ban|meta/i;

function glassesPattern(): RegExp {
  const configured = appConfig.get('glassesName');
  return configured ? new RegExp(String(configured), 'i') : DEFAULT_MATCH;
}

function has(bin: string): boolean {
  try {
    require('child_process').execSync(`command -v ${bin}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function audioDevices(kind: 'input' | 'output'): Promise<string[]> {
  try {
    const { stdout } = await execa('SwitchAudioSource', ['-a', '-t', kind]);
    return stdout.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/** Name of the glasses as an audio device, if currently present. */
async function findGlassesAudioName(): Promise<string | null> {
  const re = glassesPattern();
  const all = [...(await audioDevices('output')), ...(await audioDevices('input'))];
  return all.find((name) => re.test(name)) || null;
}

/** If the glasses are paired but disconnected, connect them (blueutil). */
async function connectIfPaired(): Promise<void> {
  if (!has('blueutil')) return;
  try {
    const { stdout } = await execa('blueutil', ['--paired']);
    const re = glassesPattern();
    for (const line of stdout.split('\n')) {
      if (re.test(line)) {
        const m = line.match(/address:\s*([0-9a-fA-F:-]+)/);
        if (m) {
          logger.info('Connecting glasses', { address: m[1] });
          await execa('blueutil', ['--connect', m[1]]).catch(() => {});
          await new Promise((r) => setTimeout(r, 2500)); // let it connect + appear
          return;
        }
      }
    }
  } catch (error) {
    logger.warn('blueutil paired lookup failed', { error: (error as Error).message });
  }
}

export interface GlassesResult {
  routed: boolean;
  device?: string;
  paired: boolean;
}

/**
 * Ensure the glasses are connected and the default audio in/out is routed to
 * them. Returns what happened so the caller can speak the right thing.
 */
export async function routeToGlasses(): Promise<GlassesResult> {
  await connectIfPaired();

  const name = await findGlassesAudioName();
  if (!name) {
    // Are they at least paired (so the user just needs to power them on)?
    let paired = false;
    if (has('blueutil')) {
      try {
        const { stdout } = await execa('blueutil', ['--paired']);
        paired = glassesPattern().test(stdout);
      } catch {
        /* ignore */
      }
    }
    return { routed: false, paired };
  }

  if (!has('SwitchAudioSource')) {
    logger.warn('SwitchAudioSource missing — cannot route to glasses');
    return { routed: false, paired: true, device: name };
  }

  try {
    await execa('SwitchAudioSource', ['-t', 'output', '-s', name]);
    await execa('SwitchAudioSource', ['-t', 'input', '-s', name]);
    appConfig.set('audioInput', name);
    appConfig.set('audioOutput', name);
    logger.info('Routed audio to glasses', { device: name });
    return { routed: true, device: name, paired: true };
  } catch (error) {
    logger.error('Failed to route audio to glasses', { error: (error as Error).message });
    return { routed: false, paired: true, device: name };
  }
}
