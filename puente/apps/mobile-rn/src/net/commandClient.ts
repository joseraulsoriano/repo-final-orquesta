import { COMMAND_BASE_URL, COMMAND_TOKEN } from "../config";

export interface CommandResponse {
  speech: string;
  ok?: boolean;
  error?: string;
}

/** POST /command → myeyescantalk en el Mac (flow 06). */
export class CommandClient {
  constructor(
    private readonly baseUrl: string = COMMAND_BASE_URL,
    private readonly token: string = COMMAND_TOKEN
  ) {}

  async runCommand(text: string): Promise<string> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.token) headers["x-puente-token"] = this.token;

    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/command`, {
      method: "POST",
      headers,
      body: JSON.stringify({ text }),
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`Command ${res.status}: ${body.slice(0, 200)}`);
    const parsed = JSON.parse(body) as CommandResponse;
    return parsed.speech?.trim() || "Listo.";
  }
}
