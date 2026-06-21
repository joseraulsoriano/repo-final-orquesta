import { app, BrowserWindow, session, ipcMain } from 'electron';
import { logger } from './logger';
import { bootSequence } from './boot-sequence';
import { ttsService } from '../src/tts-service';
import { startConversation } from './convai';
import { setupTray } from './tray';
import { setupHistory } from './history';
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

    // Start the realtime ElevenLabs Conversational AI session (mic, turn-taking,
    // STT, LLM, TTS all streamed by the agent; macOS control via client tools).
    const convOk = await startConversation(mainWindow);
    if (!convOk) {
      logger.error('Conversational AI failed to start');
      ttsService.initialize();
      ttsService.speak('No pude iniciar el asistente de voz. Revisa la configuración.', 'es');
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
