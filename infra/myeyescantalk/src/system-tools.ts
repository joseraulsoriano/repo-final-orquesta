import execa = require('execa');
import { logger } from '../electron/logger';

/**
 * Real macOS actions — the assistant's "hands". Each is offline and
 * non-destructive (opening apps/sites, volume). Destructive actions
 * (send/delete/pay) are intentionally NOT here yet; they require the spoken
 * confirmation flow first.
 */

// Spanish words → macOS application names.
const APP_ALIASES: Record<string, string> = {
  correo: 'Mail',
  email: 'Mail',
  mail: 'Mail',
  mensajes: 'Messages',
  whatsapp: 'WhatsApp',
  navegador: 'Safari',
  safari: 'Safari',
  chrome: 'Google Chrome',
  calendario: 'Calendar',
  agenda: 'Calendar',
  musica: 'Music',
  spotify: 'Spotify',
  notas: 'Notes',
  recordatorios: 'Reminders',
  fotos: 'Photos',
  mapas: 'Maps',
  ajustes: 'System Settings',
  configuracion: 'System Settings',
  terminal: 'Terminal',
  archivos: 'Finder',
  finder: 'Finder',
};

/** Resolve a spoken app name to a macOS app, falling back to the name as-is. */
export function resolveApp(spoken: string): string {
  const key = spoken
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  return APP_ALIASES[key] || spoken.trim();
}

export async function openApp(appName: string): Promise<boolean> {
  const app = resolveApp(appName);
  try {
    await execa('open', ['-a', app]);
    logger.info('Opened app', { app });
    return true;
  } catch (error) {
    logger.error('openApp failed', { app, error: (error as Error).message });
    return false;
  }
}

export async function openUrl(url: string): Promise<boolean> {
  try {
    await execa('open', [url]);
    logger.info('Opened url', { url });
    return true;
  } catch (error) {
    logger.error('openUrl failed', { url, error: (error as Error).message });
    return false;
  }
}

export async function webSearch(query: string): Promise<boolean> {
  return openUrl(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
}

/** Adjust output volume by a relative delta (-100..100). Returns the new level. */
export async function changeVolume(delta: number): Promise<number | null> {
  try {
    const { stdout } = await execa('osascript', ['-e', 'output volume of (get volume settings)']);
    const current = parseInt(stdout.trim(), 10);
    const next = Math.max(0, Math.min(100, (isNaN(current) ? 50 : current) + delta));
    await execa('osascript', ['-e', `set volume output volume ${next}`]);
    logger.info('Volume changed', { from: current, to: next });
    return next;
  } catch (error) {
    logger.error('changeVolume failed', { error: (error as Error).message });
    return null;
  }
}

export async function setMuted(muted: boolean): Promise<boolean> {
  try {
    await execa('osascript', ['-e', `set volume ${muted ? 'with' : 'without'} output muted`]);
    return true;
  } catch (error) {
    logger.error('setMuted failed', { error: (error as Error).message });
    return false;
  }
}
