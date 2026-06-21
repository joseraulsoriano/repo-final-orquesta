import '../src/load-env';
import { ClaudeAgent } from '../openclaw-plugin/claude-agent';

/**
 * Prueba de UN disparo del cerebro voz→acción, sin servidor ni Electron:
 *   npm run voice -- "abre mi correo"
 * Razona, ejecuta la acción en esta computadora y imprime lo que haría/dijo.
 */
async function main(): Promise<void> {
  const text = process.argv.slice(2).join(' ').trim() || 'abre mi correo';
  if (!ClaudeAgent.isConfigured()) {
    console.error('Falta ANTHROPIC_API_KEY en .env / .env.local');
    process.exit(1);
  }
  // Lo riesgoso no se ejecuta; se devuelve la info.
  const agent = new ClaudeAgent(async () => false);
  console.log(`[entrada] ${text}`);
  const out = await agent.sendToAgent(text, (paso) => console.log('[paso]', paso));
  console.log('\n[resultado]', out);
}

main().catch((e) => {
  console.error('[error]', (e as Error).message);
  process.exit(1);
});
