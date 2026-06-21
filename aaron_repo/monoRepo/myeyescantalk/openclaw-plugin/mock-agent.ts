import { Agent } from './agent-interface';
import { logger } from '../electron/logger';

interface Intent {
  test: RegExp;
  reply: (m: RegExpMatchArray, raw: string) => string;
}

/**
 * Phase-1 mock agent. It does NOT actually perform actions yet, but it
 * recognizes each spoken order and replies with a natural, command-specific
 * confirmation in Spanish (e.g. "Abriendo tu correo") instead of a generic
 * echo. This is the bridge until the real agent (UI-TARS/OpenClaw) is wired.
 *
 * NOTE: input is normalized to lowercase WITHOUT accents before matching, so
 * every pattern below must be written accent-free (e.g. "musica", "que").
 */
export class MockAgent implements Agent {
  private intents: Intent[] = [
    { test: /\b(correo|email|e-mail|gmail|outlook|bandeja)\b/, reply: () => 'Abriendo tu correo.' },
    { test: /\bwhats?app\b/, reply: () => 'Abriendo WhatsApp.' },
    { test: /\b(navegador|chrome|safari|firefox|internet|web)\b/, reply: () => 'Abriendo el navegador.' },
    { test: /\b(mensajes?|sms|imessage)\b/, reply: () => 'Abriendo tus mensajes.' },
    { test: /\b(calendario|agenda)\b/, reply: () => 'Abriendo tu calendario.' },
    { test: /\b(musica|spotify|cancion|reproduce|pon)\b/, reply: () => 'Reproduciendo música.' },
    { test: /\bvolumen\b.*\b(sube|arriba|alto|mas)\b|\b(sube|subir|aumenta)\b.*\bvolumen\b/, reply: () => 'Subiendo el volumen.' },
    { test: /\bvolumen\b.*\b(baja|abajo|bajo)\b|\b(baja|bajar|disminuye)\b.*\bvolumen\b/, reply: () => 'Bajando el volumen.' },
    { test: /\b(silencio|mutea|mute|calla)\b/, reply: () => 'Silenciando el audio.' },
    { test: /\b(que\s+hora|la\s+hora)\b/, reply: () => this.tellTime() },
    { test: /\b(que\s+(dia|fecha)|fecha\s+de\s+hoy|dia\s+de\s+hoy)\b/, reply: () => this.tellDate() },
    { test: /\b(clima|tiempo|temperatura)\b/, reply: () => 'Déjame revisar el clima por ti.' },
    { test: /\bbusca(r|me)?\b\s+(.+)/, reply: (m) => `Buscando ${this.clean(m[2])}.` },
    { test: /\b(llama(r|me)?|marca)\b\s+(a\s+)?(.+)/, reply: (m) => `Llamando a ${this.clean(m[4])}.` },
    { test: /\b(escribe|redacta|manda|envia)\b\s+(.+)/, reply: (m) => `De acuerdo, redactando: ${this.clean(m[2])}.` },
    { test: /\b(recuerdame|recordatorio)\b\s+(.+)/, reply: (m) => `Anotado. Te recordaré ${this.clean(m[2])}.` },
    { test: /\b(abre|abrir|inicia|lanza)\b\s+(la\s+app\s+|el\s+|la\s+|mi\s+|mis\s+)?(.+)/, reply: (m) => `Abriendo ${this.clean(m[3])}.` },
    { test: /\b(gracias)\b/, reply: () => 'Con gusto. ¿Algo más?' },
    { test: /\b(hola|buenos\s+dias|buenas\s+tardes|buenas\s+noches)\b/, reply: () => 'Hola. ¿En qué te ayudo?' },
    { test: /\b(adios|hasta\s+luego|chau|bye)\b/, reply: () => 'Hasta luego.' },
  ];

  async sendToAgent(text: string): Promise<string> {
    logger.info('Mock agent received', { input: text });
    const normalized = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''); // accent-insensitive matching

    // Match on normalized text to pick the intent, but extract entities from the
    // raw (accented) text so names like "mamá" keep their accents when spoken.
    const rawLower = text.toLowerCase();
    let reply = '';
    for (const intent of this.intents) {
      const m = normalized.match(intent.test);
      if (m) {
        const mRaw = rawLower.match(intent.test);
        reply = intent.reply(mRaw || m, text);
        break;
      }
    }
    if (!reply) {
      // Unknown order — acknowledge naturally instead of echoing verbatim.
      reply = 'De acuerdo, déjame ayudarte con eso.';
    }

    logger.info('Mock agent replying', { output: reply });
    return reply;
  }

  private tellTime(): string {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes().toString().padStart(2, '0');
    return `Son las ${h} con ${m} minutos.`;
  }

  private tellDate(): string {
    const fecha = new Date().toLocaleDateString('es-MX', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    return `Hoy es ${fecha}.`;
  }

  /** Trim trailing punctuation/filler from a captured entity. */
  private clean(s: string): string {
    return (s || '').replace(/[.?!,]+$/g, '').trim();
  }
}
