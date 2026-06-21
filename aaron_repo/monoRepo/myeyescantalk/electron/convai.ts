import { ipcMain, desktopCapturer, screen } from 'electron';
import execa = require('execa');
import Anthropic from '@anthropic-ai/sdk';
import { logger } from './logger';
import { openApp, openUrl, webSearch, changeVolume, setMuted } from '../src/system-tools';
import { getFrontmost } from '../src/screen-context';

/**
 * ElevenLabs Conversational AI integration (main-process side).
 *
 * The realtime voice loop (mic, VAD/turn-taking, STT, LLM, TTS, interruptions)
 * runs inside the ElevenLabs agent over a single WebSocket — the renderer SDK
 * handles audio. Here we only execute the agent's "client tools": the actual
 * macOS control, plus screen reading via Claude vision.
 */

const MOD_MAP: Record<string, string> = {
  command: 'command down', cmd: 'command down',
  option: 'option down', alt: 'option down',
  control: 'control down', ctrl: 'control down',
  shift: 'shift down',
};
const KEY_CODES: Record<string, number> = {
  return: 36, enter: 36, tab: 48, space: 49, escape: 53, esc: 53,
  delete: 51, backspace: 51, up: 126, down: 125, left: 123, right: 124,
};

/**
 * Capture the primary screen via Electron's desktopCapturer (this is what
 * triggers the macOS Screen Recording permission prompt — the `screencapture`
 * CLI does not). Returns a base64 PNG plus its pixel size for coordinate mapping.
 */
// Fast vision model for reading the screen (lower latency than Sonnet).
const VISION_FAST = 'claude-haiku-4-5';
const VISION_PRECISE = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

async function captureScreenImage(): Promise<{ data: string; width: number; height: number } | null> {
  const display = screen.getPrimaryDisplay();
  // Capture at native pixels (points × scaleFactor) for detail; capped so it
  // stays fast. Retry once because the first frame can come back empty.
  const scale = display.scaleFactor || 1;
  const w = Math.min(2200, Math.round(display.size.width * scale));
  const h = Math.min(1400, Math.round(display.size.height * scale));
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: w, height: h } });
      const src = sources.find((s) => String(s.display_id) === String(display.id)) || sources[0];
      if (src && !src.thumbnail.isEmpty()) {
        const size = src.thumbnail.getSize();
        return { data: src.thumbnail.toPNG().toString('base64'), width: size.width, height: size.height };
      }
    } catch (err) {
      logger.error('captureScreenImage failed', { attempt, error: (err as Error).message });
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

function claude(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

/** Read the screen aloud using Claude vision; returns a Spanish description. */
async function describeScreen(): Promise<string> {
  const shot = await captureScreenImage();
  if (!shot) return 'No pude ver la pantalla. Activa el permiso de Grabación de pantalla y reinicia.';
  if (!process.env.ANTHROPIC_API_KEY) return 'No puedo describir la pantalla sin la clave de Claude.';
  try {
    const resp = await claude().messages.create({
      model: VISION_FAST,
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: shot.data } },
            {
              type: 'text',
              text: 'Eres los ojos de una persona ciega. Describe en español, claro y útil, lo que hay en esta pantalla: qué aplicación es, el contenido principal (correos, mensajes, texto, títulos), y qué botones o acciones hay disponibles. Sin markdown, en frases habladas.',
            },
          ],
        },
      ],
    });
    const out =
      resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join(' ')
        .trim() || 'No distinguí nada claro en la pantalla.';
    logger.info('describeScreen', { size: `${shot.width}x${shot.height}`, preview: out.slice(0, 100) });
    return out;
  } catch (err) {
    logger.error('describeScreen failed', { error: (err as Error).message });
    return 'Tuve un problema al leer la pantalla.';
  }
}

/** Find an element by description (Claude vision) and click it. */
async function clickElement(description: string): Promise<string> {
  const shot = await captureScreenImage();
  if (!shot) return 'No pude ver la pantalla. Activa el permiso de Grabación de pantalla.';
  if (!process.env.ANTHROPIC_API_KEY) return 'No puedo localizar elementos sin la clave de Claude.';
  try {
    const resp = await claude().messages.create({
      model: VISION_PRECISE,
      max_tokens: 80,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: shot.data } },
            {
              type: 'text',
              text: `La imagen mide ${shot.width} por ${shot.height} pixeles. Devuelve SOLO un JSON con el centro del elemento a tocar para: "${description}". Formato exacto: {"x": número, "y": número}. Si no lo encuentras: {"error": "no encontrado"}.`,
            },
          ],
        },
      ],
    });
    const text = resp.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join(' ');
    const m = text.match(/\{[^}]*\}/);
    if (!m) return 'No pude ubicar ese elemento.';
    const obj = JSON.parse(m[0]);
    if (obj.error || typeof obj.x !== 'number') return `No encontré "${description}" en la pantalla.`;
    // Map image pixels → screen points, then click.
    const pts = screen.getPrimaryDisplay().size;
    const px = Math.round((obj.x * pts.width) / shot.width);
    const py = Math.round((obj.y * pts.height) / shot.height);
    await execa('cliclick', [`c:${px},${py}`]);
    logger.info('clickElement', { description, px, py });
    return `Listo, hice clic en ${description}.`;
  } catch (err) {
    logger.error('clickElement failed', { error: (err as Error).message });
    return 'No pude hacer clic. Revisa el permiso de Accesibilidad.';
  }
}

/** Execute one client tool call from the agent. Always returns a spoken-friendly string. */
export async function executeConvTool(name: string, params: any): Promise<string> {
  logger.info('Conv tool', { name, params });
  try {
    switch (name) {
      case 'open_app':
        return (await openApp(String(params.name))) ? `Abrí ${params.name}.` : `No pude abrir ${params.name}.`;
      case 'open_website': {
        const q = String(params.query || '').trim();
        const isUrl = /^https?:\/\//i.test(q) || (/\.[a-z]{2,}/i.test(q) && !/\s/.test(q));
        const ok = isUrl ? await openUrl(q.startsWith('http') ? q : `https://${q}`) : await webSearch(q);
        return ok ? (isUrl ? `Abrí ${q}.` : `Busqué ${q}.`) : 'No pude abrir el sitio.';
      }
      case 'set_volume': {
        if (params.action === 'mute') return (await setMuted(true)) ? 'Audio silenciado.' : 'No pude silenciar.';
        if (params.action === 'unmute') return (await setMuted(false)) ? 'Audio activado.' : 'No pude.';
        const level = await changeVolume(params.action === 'down' ? -15 : 15);
        return level === null ? 'No pude cambiar el volumen.' : `Volumen al ${level} por ciento.`;
      }
      case 'read_screen':
        return await describeScreen();
      case 'get_screen_context': {
        const { app, window } = await getFrontmost();
        return app ? `Al frente está ${app}${window ? `, ventana ${window}` : ''}.` : 'No pude leer el contexto.';
      }
      case 'type_text': {
        const safe = String(params.text || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        await execa('osascript', ['-e', `tell application "System Events" to keystroke "${safe}"`]);
        return 'Escrito.';
      }
      case 'press_keys': {
        const parts = String(params.keys || '').toLowerCase().split('+').map((s) => s.trim()).filter(Boolean);
        const key = parts.pop() || '';
        const using = parts.map((m) => MOD_MAP[m]).filter(Boolean);
        const usingClause = using.length ? ` using {${using.join(', ')}}` : '';
        const script =
          KEY_CODES[key] !== undefined
            ? `tell application "System Events" to key code ${KEY_CODES[key]}${usingClause}`
            : `tell application "System Events" to keystroke "${key.replace(/"/g, '\\"')}"${usingClause}`;
        await execa('osascript', ['-e', script]);
        return 'Hecho.';
      }
      case 'click_element':
        return await clickElement(String(params.description || params.target || ''));
      case 'click': {
        try {
          await execa('cliclick', [`c:${Math.round(params.x)},${Math.round(params.y)}`]);
          return 'Hice clic.';
        } catch {
          return 'No pude hacer clic. Revisa el permiso de Accesibilidad.';
        }
      }
      case 'quit_app': {
        await execa('osascript', ['-e', `tell application "${String(params.name).replace(/"/g, '')}" to quit`]);
        return `Cerré ${params.name}.`;
      }
      default:
        return `No conozco la herramienta ${name}.`;
    }
  } catch (err) {
    logger.error('Conv tool error', { name, error: (err as Error).message });
    return 'Hubo un problema con esa acción.';
  }
}

/**
 * Start the realtime conversation: register the tool executor, fetch a signed
 * URL (private agent), and tell the renderer to open the session.
 */
export async function startConversation(win: any): Promise<boolean> {
  const key = process.env.ELEVENLABS_API_KEY;
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  if (!key || !agentId) {
    logger.error('Conversational AI not configured (need ELEVENLABS_API_KEY + ELEVENLABS_AGENT_ID)');
    return false;
  }

  ipcMain.handle('tool:run', async (_e, payload: { name: string; params: any }) =>
    executeConvTool(payload.name, payload.params || {})
  );
  ipcMain.on('convai:error', (_e, msg: string) => logger.error('Conv AI (renderer)', { msg }));
  ipcMain.on('convai:status', (_e, msg: string) => logger.info('Conv AI status', { msg }));

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`,
      { headers: { 'xi-api-key': key } }
    );
    if (!res.ok) {
      logger.error('Signed URL fetch failed', { status: res.status });
      return false;
    }
    const data: any = await res.json();
    const signedUrl = data.signed_url;
    const send = () => win.webContents.send('convai:start', signedUrl);
    if (win.webContents.isLoading()) {
      win.webContents.once('did-finish-load', send);
    } else {
      send();
    }
    logger.info('Conversation starting', { agentId });
    return true;
  } catch (err) {
    logger.error('startConversation failed', { error: (err as Error).message });
    return false;
  }
}
