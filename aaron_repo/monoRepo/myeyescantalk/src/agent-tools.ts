import Anthropic from '@anthropic-ai/sdk';
import execa = require('execa');
import { logger } from '../electron/logger';
import { openApp, openUrl, webSearch, changeVolume, setMuted } from './system-tools';
import { getFrontmost, captureScreen } from './screen-context';

/** Tools the assistant can use. "Destructive" gating is done by the model via
 *  the confirm_action tool (see the system prompt), not per-tool flags. */
export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'confirm_action',
    description:
      'Ask the user to confirm out loud BEFORE doing anything that sends, deletes, buys, posts, or closes apps with unsaved work. Returns whether the user agreed.',
    input_schema: {
      type: 'object',
      properties: { description: { type: 'string', description: 'Qué se va a hacer, en español, breve.' } },
      required: ['description'],
    },
  },
  {
    name: 'get_screen_context',
    description: 'Get the frontmost application and its window title (a quick "where am I").',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'read_screen',
    description:
      'Take a screenshot and SEE the screen. Use this to read emails, messages, documents, buttons, or any on-screen content to the user.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'open_app',
    description: 'Open a macOS application by name (e.g. Mail, Safari, WhatsApp, Music).',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    },
  },
  {
    name: 'open_website',
    description: 'Open a website by URL, or search the web when given search terms.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'A URL or search terms.' } },
      required: ['query'],
    },
  },
  {
    name: 'set_volume',
    description: 'Change the system output volume.',
    input_schema: {
      type: 'object',
      properties: { action: { type: 'string', enum: ['up', 'down', 'mute', 'unmute'] } },
      required: ['action'],
    },
  },
  {
    name: 'get_datetime',
    description: 'Get the current time and date.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'type_text',
    description: 'Type text into the currently focused field.',
    input_schema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
  },
  {
    name: 'press_keys',
    description:
      'Press a key or shortcut. Examples: "return", "tab", "escape", "command+s", "command+w", "down". Use Tab/arrows/Return to navigate.',
    input_schema: {
      type: 'object',
      properties: { keys: { type: 'string' } },
      required: ['keys'],
    },
  },
  {
    name: 'click',
    description: 'Click the mouse at screen coordinates x,y (use read_screen first to locate the target).',
    input_schema: {
      type: 'object',
      properties: { x: { type: 'integer' }, y: { type: 'integer' } },
      required: ['x', 'y'],
    },
  },
  {
    name: 'quit_app',
    description: 'Quit an application. Confirm first if it may have unsaved work.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string' } },
      required: ['name'],
    },
  },
];

export interface ToolDeps {
  confirm: (question: string) => Promise<boolean>;
}

type ToolOutput = string | Anthropic.ContentBlockParam[];

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

export async function executeTool(name: string, input: any, deps: ToolDeps): Promise<ToolOutput> {
  logger.info('Tool call', { name, input });
  switch (name) {
    case 'confirm_action': {
      const ok = await deps.confirm(String(input.description || 'esta acción'));
      return ok ? 'El usuario confirmó. Procede.' : 'El usuario canceló. No realices la acción.';
    }
    case 'get_screen_context': {
      const { app, window } = await getFrontmost();
      if (!app) return 'No pude leer el contexto de la pantalla.';
      return `Aplicación al frente: ${app}${window ? `. Ventana: ${window}` : ''}.`;
    }
    case 'read_screen': {
      const b64 = await captureScreen();
      if (!b64) return 'No pude capturar la pantalla. Revisa el permiso de Grabación de pantalla.';
      return [
        { type: 'text', text: 'Esto es lo que hay en la pantalla ahora:' },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: b64 } },
      ];
    }
    case 'open_app':
      return (await openApp(String(input.name))) ? `Abrí ${input.name}.` : `No pude abrir ${input.name}.`;
    case 'open_website': {
      const q = String(input.query || '').trim();
      const isUrl = /^https?:\/\//i.test(q) || (/\.[a-z]{2,}/i.test(q) && !/\s/.test(q));
      const ok = isUrl ? await openUrl(q.startsWith('http') ? q : `https://${q}`) : await webSearch(q);
      return ok ? (isUrl ? `Abrí ${q}.` : `Busqué ${q}.`) : 'No pude abrir el sitio.';
    }
    case 'set_volume': {
      if (input.action === 'mute') return (await setMuted(true)) ? 'Silencié el audio.' : 'No pude silenciar.';
      if (input.action === 'unmute') return (await setMuted(false)) ? 'Activé el audio.' : 'No pude activar el audio.';
      const level = await changeVolume(input.action === 'down' ? -15 : 15);
      return level === null ? 'No pude cambiar el volumen.' : `Volumen al ${level} por ciento.`;
    }
    case 'get_datetime': {
      const now = new Date();
      const fecha = now.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
      return `Son las ${now.getHours()} con ${now.getMinutes().toString().padStart(2, '0')} minutos. Hoy es ${fecha}.`;
    }
    case 'type_text': {
      const safe = String(input.text || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      await execa('osascript', ['-e', `tell application "System Events" to keystroke "${safe}"`]);
      return 'Escrito.';
    }
    case 'press_keys': {
      const parts = String(input.keys || '').toLowerCase().split('+').map((s) => s.trim()).filter(Boolean);
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
    case 'click': {
      try {
        await execa('cliclick', [`c:${Math.round(input.x)},${Math.round(input.y)}`]);
        return 'Hice clic.';
      } catch {
        return 'No puedo hacer clic todavía (falta instalar cliclick). Intenta navegar con Tab y Enter.';
      }
    }
    case 'quit_app': {
      try {
        await execa('osascript', ['-e', `tell application "${String(input.name).replace(/"/g, '')}" to quit`]);
        return `Cerré ${input.name}.`;
      } catch {
        return `No pude cerrar ${input.name}.`;
      }
    }
    default:
      return `Herramienta desconocida: ${name}.`;
  }
}
