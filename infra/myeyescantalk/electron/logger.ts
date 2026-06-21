import winston from 'winston';
import path from 'path';
import os from 'os';
import fs from 'fs';

const logsDir = path.join(os.homedir(), '.myeyescantalk', 'logs');

if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'myeyescantalk' },
  transports: [
    new winston.transports.File({ filename: path.join(logsDir, 'error.log'), level: 'error' }),
    new winston.transports.File({ filename: path.join(logsDir, 'combined.log') }),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(({ level, message, timestamp, ...meta }) => {
        const metaStr = Object.keys(meta).length > 0 ? JSON.stringify(meta, null, 2) : '';
        return `${timestamp} [${level}] ${message} ${metaStr}`;
      })
    ),
  }));
}

type Level = 'info' | 'warn' | 'error';
type SpeakFn = (message: string, level: Level) => void;

// The TTS layer registers itself here via setSpeaker(). Kept as a hook so the
// logger has no dependency on the audio stack (avoids a circular import) and so
// logging works even before TTS is initialized.
let speaker: SpeakFn | null = null;

export const setSpeaker = (fn: SpeakFn): void => {
  speaker = fn;
};

/**
 * Log a message AND speak it aloud. This is the backbone of the
 * accessibility-first contract: every state, prompt, and error the user needs
 * to know is emitted through here so it is always audible.
 */
export const logAndSpeak = (message: string, level: Level = 'info') => {
  logger[level](message);
  if (speaker) {
    try {
      speaker(message, level);
    } catch {
      // Never let a TTS failure break control flow.
    }
  } else {
    // TTS not wired yet (very early boot) — surface to console so nothing is lost.
    console.log(`[SPEAK] ${message}`);
  }
};
