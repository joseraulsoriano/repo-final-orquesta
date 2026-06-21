import { CrossingClient } from "../net/crossingClient";
import { CommandClient } from "../net/commandClient";
import { WorkerClient } from "../net/workerClient";
import { GlassesBridge } from "../dat/glassesBridge";
import { SuperFlow } from "./superFlow";
import { moduleSwitchIntent, PuenteModule } from "./puenteModule";

export type ModuleChangeHandler = (module: PuenteModule) => void;

/**
 * Enruta una sesión DAT al módulo activo (super / cruce / guía / mac).
 * Paridad con mobile-ios ModuleRouter.
 */
export class ModuleRouter {
  activeModule: PuenteModule = "supermercado";
  private running = false;
  private abort = false;

  constructor(
    private readonly worker: WorkerClient,
    private readonly bridge: GlassesBridge,
    private readonly superFlow: SuperFlow,
    private readonly crossing: CrossingClient,
    private readonly command: CommandClient,
    private readonly onModuleChanged?: ModuleChangeHandler,
    private readonly onLog?: (s: string) => void
  ) {}

  async switchModule(to: PuenteModule): Promise<void> {
    if (to === this.activeModule) return;
    this.stopCurrent();
    this.activeModule = to;
    this.onModuleChanged?.(to);
    try {
      await this.worker.sessionObserve({
        type: "module_switch",
        module: to,
      });
    } catch {
      /* non-blocking */
    }
    await this.startActive();
  }

  async startActive(): Promise<void> {
    this.abort = false;
    this.running = true;
    switch (this.activeModule) {
      case "supermercado":
        await Promise.all([
          this.superFlow.startSentidoContinuo(),
          this.superFlow.startLiveMic(),
        ]);
        break;
      case "cruce":
        await this.runCrossingLoop();
        break;
      case "guia":
        this.onLog?.("[guia] mic activo — usa /agents/guide desde iOS como referencia");
        await this.superFlow.startLiveMic();
        break;
      case "mac":
        await this.runMacLoop();
        break;
    }
    this.running = false;
  }

  stopAll(): void {
    this.abort = true;
    this.stopCurrent();
    this.crossing.disconnect();
  }

  private stopCurrent(): void {
    this.abort = true;
    this.superFlow.stopLiveMic();
    this.superFlow.stopSentidoContinuo();
  }

  private async runCrossingLoop(): Promise<void> {
    try {
      await this.crossing.connect();
    } catch (e) {
      this.onLog?.(`[cruce:error] ${(e as Error).message}`);
    }
    while (!this.abort && this.activeModule === "cruce") {
      try {
        const frame = await this.bridge.captureFrameJpegBase64();
        const res = await this.crossing.analyzeFrame(frame);
        if (res.skipped || res.error) continue;
        if (res.alert) this.bridge.vibrate(400);
        if (res.speech?.trim()) {
          const audio = await this.worker.tts(res.speech);
          await this.bridge.playTts(audio);
        }
      } catch (e) {
        this.onLog?.(`[cruce:error] ${(e as Error).message}`);
        await sleep(2000);
      }
      await sleep(500);
    }
  }

  private async runMacLoop(): Promise<void> {
    while (!this.abort && this.activeModule === "mac") {
      try {
        const text = (await this.bridge.listenOnce(() => !this.abort && this.activeModule === "mac")).trim();
        if (!text) continue;
        const mod = moduleSwitchIntent(text);
        if (mod) {
          await this.switchModule(mod);
          return;
        }
        const speech = await this.command.runCommand(text);
        if (speech) {
          const audio = await this.worker.tts(speech);
          await this.bridge.playTts(audio);
        }
      } catch (e) {
        this.onLog?.(`[mac:error] ${(e as Error).message}`);
        await sleep(800);
      }
    }
  }

  tryHandleModuleSwitch(transcript: string): Promise<boolean> {
    const mod = moduleSwitchIntent(transcript);
    if (!mod) return Promise.resolve(false);
    return this.switchModule(mod).then(() => true);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
