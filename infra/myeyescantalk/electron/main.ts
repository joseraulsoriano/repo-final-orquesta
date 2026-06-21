import { app, BrowserWindow, session, ipcMain } from 'electron';
import { logger } from './logger';
import { bootSequence } from './boot-sequence';
import { ttsService } from '../src/tts-service';
import { setupTray } from './tray';
import { setupHistory } from './history';
import { startCommandServer } from './command-server';
import { ClaudeAgent } from '../openclaw-plugin/claude-agent';
import path from 'path';

let mainWindow: any = null;

async function createWindow() {
  // Hidden window: it runs the conversation SDK (mic/audio) but is never shown —
  // the only visible UI is the menu-bar indicator.
  mainWindow = new BrowserWindow({
    width: 360,
    height: 240,
    show: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false, // keep audio/SDK running while hidden
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // assets/ lives at the project root (not compiled into dist).
  mainWindow.loadFile(path.join(__dirname, '..', '..', 'assets', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function initialize() {
  try {
    logger.info('App initializing', { version: app.getVersion() });

    // Initialize TTS FIRST so every boot message is actually spoken aloud.
    // Uses macOS `say` (offline, native es_MX voice) immediately, upgrading to
    // Piper automatically once its voices are present.
    ttsService.initialize();

    // Boot sequence with all checks
    const bootSuccess = await bootSequence.run();

    if (!bootSuccess) {
      logger.error('Boot sequence failed, exiting');
      app.quit();
      return;
    }

    // Conversational AI (ElevenLabs voz-a-voz) DESACTIVADO a propósito: esta app
    // es solo voz→acción. No queremos un asistente que conteste hablando, ni que
    // anuncie por voz si falla. El único canal de entrada es el command-server.

    // INGRESS voz → acción: el puente (gafas → teléfono → STT) manda el
    // transcript a POST /command y esta computadora ejecuta la acción. Sin
    // voz-a-voz; lo riesgoso no se ejecuta (confirm = false) y se devuelve la info.
    if (ClaudeAgent.isConfigured()) {
      const agent = new ClaudeAgent(async () => false);
      startCommandServer((text) => agent.sendToAgent(text));
    } else {
      logger.warn('Ingress voz→acción no iniciado: falta ANTHROPIC_API_KEY');
    }

    logger.info('App ready');
  } catch (error) {
    logger.error('Initialization failed', { error: (error as Error).message });
    app.quit();
  }
}

app.on('ready', async () => {
  // Allow the renderer to use the microphone (the macOS system mic prompt still
  // gates actual access on first use).
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media');
  });
  // Surface any renderer-side mic errors (otherwise they're silently lost).
  ipcMain.on('record:error', (_e, msg: string) => logger.error('Renderer mic error', { msg }));
  // Conversation history store (viewable from the tray menu).
  setupHistory();
  // Menu-bar indicator (Siri-style). Registered before the window loads so it
  // receives the icon frames the renderer sends on startup.
  setupTray();
  // Menu-bar-only app: no Dock icon, just the indicator.
  if (app.dock) app.dock.hide();
  createWindow();
  await initialize();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Cleanup on exit
app.on('will-quit', () => {
  logger.info('App shutting down');
});
