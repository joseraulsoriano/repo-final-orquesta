// Phase 1: Minimal stub for the agent interface
// Phase 2: Will implement full ChannelMessageActionAdapter from OpenClaw SDK

export interface Agent {
  /**
   * Process a spoken command. `onProgress` is called with short narration as
   * the agent works (e.g. "Déjame ver la pantalla.") so the user is never left
   * in silence. Returns the final spoken reply.
   */
  sendToAgent(text: string, onProgress?: (text: string) => void): Promise<string>;
}

export interface AgentConfig {
  // Phase 2: will expand with OpenClaw SDK config
}
