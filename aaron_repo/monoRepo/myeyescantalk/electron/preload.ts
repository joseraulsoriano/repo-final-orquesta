import { contextBridge, ipcRenderer } from 'electron';

// Safe bridge between the renderer (mic capture) and the main process.
// The renderer cannot touch Node directly (contextIsolation), so we expose only
// these narrow channels.
contextBridge.exposeInMainWorld('mect', {
  // ── Push-to-talk capture ──
  // Main asks the renderer to record for `ms` milliseconds.
  onRecordStart: (cb: (ms: number) => void) =>
    ipcRenderer.on('record:start', (_e, ms: number) => cb(ms)),
  // Renderer returns the captured 16 kHz mono WAV (ArrayBuffer).
  sendAudio: (buf: ArrayBuffer) => ipcRenderer.send('record:audio', buf),
  // Renderer reports a capture error (e.g. mic permission denied).
  sendError: (msg: string) => ipcRenderer.send('record:error', msg),

  // ── Wake-word listening ──
  // Main toggles continuous wake listening on/off.
  onWakeListen: (cb: () => void) => ipcRenderer.on('wake:listen', () => cb()),
  onWakeIdle: (cb: () => void) => ipcRenderer.on('wake:idle', () => cb()),
  // Renderer sends a speech-burst window (16 kHz WAV) to be checked for the wake phrase.
  sendWakeCandidate: (buf: ArrayBuffer) => ipcRenderer.send('wake:candidate', buf),

  // ── Barge-in (interrupt the assistant by speaking) ──
  onBargeOn: (cb: () => void) => ipcRenderer.on('barge:on', () => cb()),
  onBargeOff: (cb: () => void) => ipcRenderer.on('barge:off', () => cb()),
  sendBargeHit: () => ipcRenderer.send('barge:hit'),

  // ── Conversational AI ──
  onConvStart: (cb: (signedUrl: string) => void) =>
    ipcRenderer.on('convai:start', (_e, url: string) => cb(url)),
  runTool: (name: string, params: any): Promise<string> =>
    ipcRenderer.invoke('tool:run', { name, params }),
  convStatus: (msg: string) => ipcRenderer.send('convai:status', msg),
  convError: (msg: string) => ipcRenderer.send('convai:error', msg),

  // ── Menu-bar indicator ──
  trayFrames: (frames: string[], idle: string) => ipcRenderer.send('tray:frames', { frames, idle }),
  trayState: (state: string) => ipcRenderer.send('tray:state', state),

  // ── Conversation history ──
  addHistory: (entry: { role: string; text: string }) => ipcRenderer.send('history:add', entry),
  getHistory: (): Promise<any[]> => ipcRenderer.invoke('history:get'),
  onHistoryUpdate: (cb: (items: any[]) => void) =>
    ipcRenderer.on('history:update', (_e, items) => cb(items)),
});
