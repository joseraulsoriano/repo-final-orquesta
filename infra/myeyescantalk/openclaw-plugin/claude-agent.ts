import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../electron/logger';
import { Agent } from './agent-interface';
import { TOOLS, executeTool } from '../src/agent-tools';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8';

const SYSTEM = `Eres un asistente de voz para una persona ciega que usa una Mac. TODO lo que respondas se reproduce en voz alta.
- Responde SIEMPRE en español, breve y claro. Sin markdown, sin emojis, sin listas con viñetas: frases habladas.
- Puedes controlar la computadora y VER la pantalla con la herramienta read_screen. Úsala para leer correos, mensajes, documentos o describir lo que hay en pantalla. Esa es tu función más importante.
- Para navegar usa el teclado (Tab, flechas, Enter) cuando sea posible; es más confiable que el clic.
- SEGURIDAD: antes de cualquier acción que envíe, borre, compre, publique, o cierre una app con trabajo sin guardar, DEBES llamar primero a confirm_action con una descripción clara, y solo continuar si el usuario confirma.
- Al terminar, di en una o dos frases qué hiciste o cuál es la respuesta. Si algo no se pudo, dilo con claridad y ofrece una alternativa.`;

/**
 * The real reasoning brain: Claude with tool use + vision. Runs a manual
 * agentic loop so destructive actions can be gated through spoken confirmation
 * (the confirm_action tool calls back into the voice loop).
 */
export class ClaudeAgent implements Agent {
  private client: Anthropic | null = null;

  constructor(private confirm: (question: string) => Promise<boolean>) {}

  static isConfigured(): boolean {
    return !!process.env.ANTHROPIC_API_KEY;
  }

  private getClient(): Anthropic {
    if (!this.client) this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return this.client;
  }

  async sendToAgent(text: string, onProgress?: (text: string) => void): Promise<string> {
    const client = this.getClient();
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: text }];
    let finalText = '';

    // Cache the system prompt + tool list so they're not re-processed every turn.
    const cachedTools = TOOLS.map((t, i) =>
      i === TOOLS.length - 1 ? { ...t, cache_control: { type: 'ephemeral' } } : t
    );

    // Bounded agentic loop: reason → call tools → observe → repeat.
    for (let step = 0; step < 8; step++) {
      const params: any = {
        model: MODEL,
        max_tokens: 1024,
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        tools: cachedTools,
        messages,
      };
      // Adaptive thinking + low effort for snappy voice turns (Opus/Sonnet only;
      // these params 400 on Haiku, so guard by model family).
      if (/opus|sonnet/.test(MODEL)) {
        params.thinking = { type: 'adaptive' };
        params.output_config = { effort: 'low' };
      }

      const resp = (await client.messages.create(params)) as Anthropic.Message;

      const said = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join(' ')
        .trim();

      if (resp.stop_reason !== 'tool_use') {
        if (said) finalText = said;
        break;
      }

      // More steps coming — narrate this step so the user isn't left in silence.
      if (said && onProgress) onProgress(said);

      // Echo the full assistant turn back (preserves thinking + tool_use blocks).
      messages.push({ role: 'assistant', content: resp.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of resp.content) {
        if (block.type === 'tool_use') {
          let content: any;
          let isError = false;
          try {
            content = await executeTool(block.name, block.input, { confirm: this.confirm });
          } catch (e) {
            content = `Error: ${(e as Error).message}`;
            isError = true;
            logger.error('Tool execution error', { tool: block.name, error: (e as Error).message });
          }
          toolResults.push({ type: 'tool_result', tool_use_id: block.id, content, is_error: isError });
        }
      }
      messages.push({ role: 'user', content: toolResults });
    }

    return finalText || 'Listo.';
  }
}
