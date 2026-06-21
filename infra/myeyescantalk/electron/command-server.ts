import http from 'http';
import { logger } from './logger';

/**
 * INGRESS voz → acción. El puente (gafas → teléfono → STT) manda el transcript
 * de texto aquí; el handler lo mete al cerebro (ClaudeAgent) que ejecuta la
 * acción en esta computadora. No hay voz-a-voz: la respuesta vuelve como texto.
 *
 * Multiplataforma: el servidor en sí es portable (Node http). Lo único atado al
 * SO son los ejecutores de acciones (src/system-tools.ts, hoy macOS).
 *
 * Contrato:
 *   POST /command   { "text": "abre mi correo" }  → 200 { "speech": "Abrí Mail." }
 *   GET  /health                                   → 200 { "ok": true }
 */
export interface CommandServerOpts {
  /** Puerto LAN (default COMMAND_PORT env o 8788). 8787 lo usa el worker. */
  port?: number;
  /** Interfaz a bindear. 0.0.0.0 = alcanzable desde el teléfono en la misma red. */
  host?: string;
  /** Secreto compartido opcional: si se define, exige header x-command-token. */
  token?: string;
}

const MAX_BODY_BYTES = 64 * 1024;

export function startCommandServer(
  handle: (text: string) => Promise<string>,
  opts: CommandServerOpts = {}
): http.Server {
  const port = opts.port ?? (Number(process.env.COMMAND_PORT) || 8788);
  const host = opts.host ?? '0.0.0.0';
  const token = opts.token ?? process.env.COMMAND_TOKEN;

  const server = http.createServer((req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(body));
    };

    const path = (req.url || '').split('?')[0];

    if (req.method === 'GET' && path === '/health') {
      return send(200, { ok: true });
    }
    if (req.method !== 'POST' || path !== '/command') {
      return send(404, { error: 'No encontrado' });
    }
    if (token && req.headers['x-command-token'] !== token) {
      return send(401, { error: 'No autorizado' });
    }

    let raw = '';
    let aborted = false;
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > MAX_BODY_BYTES) {
        aborted = true;
        send(413, { error: 'Cuerpo demasiado grande' });
        req.destroy();
      }
    });
    req.on('end', async () => {
      if (aborted) return;
      let text = '';
      try {
        const body = JSON.parse(raw || '{}');
        text = String(body.text ?? body.transcript ?? '').trim();
      } catch {
        return send(400, { error: 'JSON inválido' });
      }
      if (!text) return send(400, { error: 'Falta "text"' });

      logger.info('[command] recibido', { text });
      try {
        const speech = await handle(text);
        logger.info('[command] ejecutado', { speech });
        send(200, { speech });
      } catch (e) {
        logger.error('[command] error', { error: (e as Error).message });
        send(500, { error: (e as Error).message });
      }
    });
  });

  server.on('error', (e) => logger.error('[command] server error', { error: (e as Error).message }));
  server.listen(port, host, () => {
    logger.info(`[command] ingress voz→acción en http://${host}:${port}/command`);
  });
  return server;
}
