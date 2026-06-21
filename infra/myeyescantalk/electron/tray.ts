import { Tray, Menu, nativeImage, app, ipcMain } from 'electron';
import { logger } from './logger';
import { openHistoryWindow } from './history';

/**
 * Menu-bar indicator (Siri-style): an animated orange "audio bars" icon that
 * shows the assistant is listening/speaking. The blind user can't see it, but
 * it signals state to sighted people nearby. Frames are drawn in the renderer
 * (canvas) and sent here; we animate by swapping the Tray image.
 */

let tray: Tray | null = null;
let frames: Electron.NativeImage[] = [];
let idleImg: Electron.NativeImage | null = null;
let timer: NodeJS.Timeout | null = null;
let frame = 0;

export function setupTray(): void {
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip('Mis Ojos Pueden Hablar — asistente de voz');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Asistente de voz activo', enabled: false },
      { type: 'separator' },
      { label: 'Ver historial de la conversación', click: () => openHistoryWindow() },
      { type: 'separator' },
      { label: 'Salir', click: () => app.quit() },
    ])
  );

  ipcMain.on('tray:frames', (_e, payload: { frames: string[]; idle: string }) => {
    frames = (payload.frames || []).map((d) => nativeImage.createFromDataURL(d).resize({ width: 22, height: 22 }));
    idleImg = payload.idle
      ? nativeImage.createFromDataURL(payload.idle).resize({ width: 22, height: 22 })
      : frames[0] || null;
    if (tray && idleImg) tray.setImage(idleImg);
    logger.info('Tray frames loaded', { count: frames.length });
  });

  ipcMain.on('tray:state', (_e, state: string) => {
    setActive(state === 'listening' || state === 'speaking' || state === 'connected');
  });
}

function setActive(active: boolean): void {
  if (!tray) return;
  if (active) {
    if (timer || frames.length === 0) return;
    timer = setInterval(() => {
      tray!.setImage(frames[frame % frames.length]);
      frame++;
    }, 110);
  } else {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (idleImg) tray.setImage(idleImg);
  }
}
