import '../src/load-env';
import { ClaudeAgent } from '../openclaw-plugin/claude-agent';
import { startCommandServer } from '../electron/command-server';
import { logger } from '../electron/logger';

/**
 * Servidor de comandos STANDALONE — corre el ingress voz→acción SIN arrancar
 * Electron (las acciones macOS no lo necesitan). Ideal para probar el puente:
 *   npm run command
 *   curl -XPOST localhost:8788/command -H 'content-type: application/json' \
 *        -d '{"text":"abre mi correo"}'
 */
if (!ClaudeAgent.isConfigured()) {
  logger.error('Falta ANTHROPIC_API_KEY en .env / .env.local');
  process.exit(1);
}

// Sin loop de confirmación hablada: lo riesgoso NO se ejecuta; el agente
// devuelve esa información en el texto de respuesta.
const agent = new ClaudeAgent(async () => false);

startCommandServer((text) => agent.sendToAgent(text, (paso) => logger.info('[command] paso', { paso })));
logger.info('Listo. Manda transcripts a POST /command con {"text":"..."}.');
