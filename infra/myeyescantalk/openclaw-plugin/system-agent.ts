import { Agent } from './agent-interface';
import { logger } from '../electron/logger';
import { openApp, openUrl, webSearch, changeVolume, setMuted, resolveApp } from '../src/system-tools';

interface Skill {
  test: RegExp;
  run: (m: RegExpMatchArray, raw: string) => Promise<string>;
}

/**
 * The assistant's hands + a simple intent brain. Recognizes a spoken order,
 * EXECUTES the real macOS action, and returns a spoken result reflecting what
 * actually happened (success or failure).
 *
 * This is the interim brain. It will be replaced/augmented by an LLM that does
 * flexible reasoning + tool selection — but the tools (openApp, volume, etc.)
 * stay the same, so that upgrade is a drop-in.
 *
 * Input is normalized lowercase WITHOUT accents, so patterns are accent-free.
 */
export class SystemAgent implements Agent {
  private skills: Skill[] = [
    { test: /\b(correo|email|gmail|outlook|bandeja)\b/, run: () => this.app('Mail', 'tu correo') },
    { test: /\bwhats?app\b/, run: () => this.app('WhatsApp', 'WhatsApp') },
    { test: /\b(mensajes?|imessage)\b/, run: () => this.app('Messages', 'tus mensajes') },
    { test: /\b(calendario|agenda)\b/, run: () => this.app('Calendar', 'tu calendario') },
    { test: /\b(navegador|safari|internet)\b/, run: () => this.app('Safari', 'el navegador') },
    { test: /\bchrome\b/, run: () => this.app('Google Chrome', 'Chrome') },
    { test: /\b(notas)\b/, run: () => this.app('Notes', 'tus notas') },
    { test: /\b(recordatorios)\b/, run: () => this.app('Reminders', 'tus recordatorios') },
    { test: /\b(mapas)\b/, run: () => this.app('Maps', 'mapas') },
    { test: /\b(ajustes|configuracion)\b/, run: () => this.app('System Settings', 'los ajustes') },
    { test: /\b(musica|spotify|cancion|reproduce|pon)\b/, run: () => this.app('Music', 'la música') },

    { test: /\bvolumen\b.*\b(sube|arriba|alto|mas)\b|\b(sube|subir|aumenta)\b.*\bvolumen\b/, run: () => this.volume(+15) },
    { test: /\bvolumen\b.*\b(baja|abajo|bajo)\b|\b(baja|bajar|disminuye)\b.*\bvolumen\b/, run: () => this.volume(-15) },
    { test: /\b(silencio|mutea|mute|calla)\b/, run: () => this.mute(true) },
    { test: /\b(activa el sonido|quita el silencio|desmutea)\b/, run: () => this.mute(false) },

    { test: /\bbusca(r|me)?\b\s+(.+)/, run: (m) => this.search(m[2]) },
    { test: /\b(que\s+hora|la\s+hora)\b/, run: () => Promise.resolve(this.time()) },
    { test: /\b(que\s+(dia|fecha)|fecha\s+de\s+hoy|dia\s+de\s+hoy)\b/, run: () => Promise.resolve(this.date()) },

    // Generic "open X" — last, so specific apps above win.
    { test: /\b(abre|abrir|inicia|lanza)\b\s+(la\s+app\s+|el\s+|la\s+|mi\s+|mis\s+)?(.+)/, run: (m) => this.openNamed(m[3]) },
  ];

  async sendToAgent(text: string, _onProgress?: (text: string) => void): Promise<string> {
    logger.info('SystemAgent received', { input: text });
    const normalized = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    const rawLower = text.toLowerCase();

    let reply = 'De acuerdo, pero todavía no sé hacer eso.';
    for (const skill of this.skills) {
      const m = normalized.match(skill.test);
      if (m) {
        const mEntity = rawLower.match(skill.test) || m;
        reply = await skill.run(mEntity, text);
        break;
      }
    }
    logger.info('SystemAgent reply', { output: reply });
    return reply;
  }

  private async app(macApp: string, spokenName: string): Promise<string> {
    return (await openApp(macApp)) ? `Abriendo ${spokenName}.` : `No pude abrir ${spokenName}.`;
  }

  private async openNamed(spoken: string): Promise<string> {
    const name = this.clean(spoken);
    const app = resolveApp(name);
    return (await openApp(app)) ? `Abriendo ${name}.` : `No pude abrir ${name}.`;
  }

  private async search(query: string): Promise<string> {
    const q = this.clean(query);
    return (await webSearch(q)) ? `Buscando ${q}.` : `No pude hacer la búsqueda.`;
  }

  private async volume(delta: number): Promise<string> {
    const level = await changeVolume(delta);
    if (level === null) return 'No pude cambiar el volumen.';
    return delta > 0 ? `Volumen al ${level} por ciento.` : `Volumen al ${level} por ciento.`;
  }

  private async mute(muted: boolean): Promise<string> {
    const ok = await setMuted(muted);
    if (!ok) return 'No pude cambiar el sonido.';
    return muted ? 'Audio silenciado.' : 'Audio activado.';
  }

  private time(): string {
    const now = new Date();
    return `Son las ${now.getHours()} con ${now.getMinutes().toString().padStart(2, '0')} minutos.`;
  }

  private date(): string {
    return `Hoy es ${new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}.`;
  }

  private clean(s: string): string {
    return (s || '').replace(/[.?!,]+$/g, '').trim();
  }
}
