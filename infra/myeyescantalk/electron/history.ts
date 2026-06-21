import { BrowserWindow, ipcMain } from 'electron';
import path from 'path';

/** In-memory conversation history + a window to view it (for sighted users). */

export interface HistoryEntry {
  role: 'user' | 'assistant';
  text: string;
  ts: number;
}

const history: HistoryEntry[] = [];
let win: BrowserWindow | null = null;

export function setupHistory(): void {
  ipcMain.on('history:add', (_e, entry: { role: string; text: string }) => {
    const role = entry.role === 'user' ? 'user' : 'assistant';
    history.push({ role, text: String(entry.text || ''), ts: Date.now() });
    if (history.length > 500) history.shift();
    if (win && !win.isDestroyed()) win.webContents.send('history:update', history);
  });
  ipcMain.handle('history:get', () => history);
}

export function openHistoryWindow(): void {
  if (win && !win.isDestroyed()) {
    win.show();
    win.focus();
    return;
  }
  win = new BrowserWindow({
    width: 460,
    height: 620,
    title: 'Historial de la conversación',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#15130f',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  win.loadFile(path.join(__dirname, '..', '..', 'assets', 'history.html'));
  win.on('closed', () => {
    win = null;
  });
}
