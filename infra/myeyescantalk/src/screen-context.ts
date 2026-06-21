import execa = require('execa');
import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger } from '../electron/logger';

/**
 * "Where am I" — reads the foreground app/window, and captures the screen for
 * the vision model so the assistant can read on-screen content aloud.
 * Reading window titles / controlling the UI needs macOS Accessibility
 * permission; screenshots need Screen Recording permission (macOS prompts once).
 */

export async function getFrontmost(): Promise<{ app: string; window: string }> {
  let app = '';
  let window = '';
  try {
    const r = await execa('osascript', [
      '-e',
      'tell application "System Events" to get name of first application process whose frontmost is true',
    ]);
    app = r.stdout.trim();
  } catch (e) {
    logger.warn('getFrontmost app failed', { error: (e as Error).message });
  }
  try {
    const r = await execa('osascript', [
      '-e',
      'tell application "System Events" to tell (first application process whose frontmost is true) to get name of front window',
    ]);
    window = r.stdout.trim();
  } catch {
    /* many apps have no titled front window — non-fatal */
  }
  return { app, window };
}

/** Capture the screen as a downscaled base64 PNG for the vision model. */
export async function captureScreen(): Promise<string | null> {
  const file = path.join(os.tmpdir(), `mect-shot-${Date.now()}.png`);
  try {
    await execa('screencapture', ['-x', '-t', 'png', file]); // -x = silent
    // Downscale to keep token cost / latency reasonable (max 1568px long edge).
    await execa('sips', ['-Z', '1568', file]).catch(() => {});
    const b64 = fs.readFileSync(file).toString('base64');
    return b64;
  } catch (e) {
    logger.error('Screen capture failed', { error: (e as Error).message });
    return null;
  } finally {
    fs.promises.unlink(file).catch(() => {});
  }
}
