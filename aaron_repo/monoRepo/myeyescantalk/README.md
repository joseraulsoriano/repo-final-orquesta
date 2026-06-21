# My Eyes Can Talk 🎙️
## Voice-First Eyes-Free Assistant for Blind Users (macOS, Electron)

Phase 1: Scaffold + Audio Detection + Mock Agent Loop

---

## What's Built in Phase 1

### ✅ Core Infrastructure
- **Electron scaffold** with TypeScript + error handling
- **Process Supervisor**: lifecycle management for child processes (execa + restart-on-crash)
- **Structured Logging**: Winston logger to `~/.myeyescantalk/logs/`
- **Config Persistence**: `~/.myeyescantalk/config.json` for user preferences

### ✅ Audio System
- **Dynamic Audio Detection**: parses `system_profiler SPAudioDataType` to detect input/output devices
- **Bluetooth Priority**: auto-detects Bluetooth devices (tested with ACCENTUM)
- **Fallback to Built-in**: seamlessly falls back to Mac microphone + speakers
- **Config Saving**: remembers user's audio preference across sessions

### ✅ Boot Sequence
- Placeholder spoken greeting (Phase 2: will use `afplay` with Piper-generated WAV)
- Audio device detection + confirmation (Phase 1: auto-selects BT, Phase 2: waits for spoken yes/no)
- Health checks (Phase 1: mocked, Phase 2: real Ollama + whisper + Piper checks)
- Failure handling with spoken errors + retry with backoff

### ✅ Mock Agent Loop
- **Agent Interface**: minimal stub for Phase 2 OpenClaw integration
- **Mock Replies**: returns cheerful canned responses
- **End-to-End Voiced Loop**: (Phase 2) wake word → STT → agent → TTS

### ✅ Scripts
- `npm run check:ollama` — verify Ollama installation
- `npm run test:audio` — test audio device detection
- `npm run download:model` — download UI-TARS-7B with progress + mmproj verification
- `npm run download:voices` — (Phase 2) download Piper voices
- `npm run generate:greeting` — (Phase 2) generate greeting WAV with Piper

---

## Prerequisites

### Required (install now)
1. **Ollama**: Download from [ollama.ai](https://ollama.ai)
   ```bash
   npm run check:ollama
   ```
   The app will guide you if it's missing.

2. **macOS 12+** with Bluetooth audio support (Ray-Ban Meta glasses or other BT headset)

3. **Node.js 20+** (for development)

### Bundled Binaries (Phase 2)
- whisper.cpp (STT)
- Piper (TTS)
- openWakeWord (wake-word detection)

---

## Setup & Run

### 1. Install Dependencies
```bash
npm install
```

### 2. Verify Audio Devices
```bash
npm run test:audio
```
Should detect your Bluetooth device + Mac built-in audio.

### 3. Check Ollama
```bash
npm run check:ollama
```
If Ollama is missing, download it from [ollama.ai](https://ollama.ai).

### 4. Download the Model (optional for Phase 1 testing)
Once Ollama is running:
```bash
npm run download:model
```
This downloads UI-TARS-7B (Q4_K_M, ~4.4 GB) and verifies the `.mmproj` file is present.

### 5. Build TypeScript
```bash
npm run build:ts
```

### 6. Run the App (Phase 1 mock demo)
```bash
npm run dev
```
This will:
1. Play a greeting ("Iniciando…")
2. Detect and confirm your audio device (ACCENTUM or built-in)
3. Run health checks
4. Say "Listo. ¿Cómo te puedo ayudar?"
5. Simulate a few mock interactions (spoken echo test)

---

## Project Structure

```
myeyescantalk/
├── electron/                 # Electron main process + orchestration
│   ├── main.ts              # App entry point
│   ├── boot-sequence.ts     # Startup flow + health checks
│   ├── audio-router.ts      # Audio device detection + routing
│   ├── supervisor.ts        # Process lifecycle management
│   ├── logger.ts            # Winston logger
│   └── voice-loop.ts        # STT → Agent → TTS loop (mock Phase 1)
├── openclaw-plugin/         # Agent interface (Phase 2: full OpenClaw SDK)
│   ├── agent-interface.ts   # Minimal stub (sendToAgent: string → Promise<string>)
│   └── mock-agent.ts        # Phase 1: canned replies
├── sidecars/                # Bundled binaries (Phase 2)
│   ├── ollama/              # (external, not bundled)
│   ├── whisper.cpp/         # (Phase 2)
│   ├── piper/               # (Phase 2)
│   └── openWakeWord/        # (Phase 2)
├── assets/
│   ├── audio/               # WAVs (greeting, errors — Phase 2)
│   ├── voices/              # Piper voice GGUFs (Phase 2)
│   └── index.html           # Minimal UI
├── src/
│   └── types.ts             # Shared TypeScript interfaces
├── scripts/
│   ├── check-ollama.ts      # Verify Ollama installed
│   ├── download-model.ts    # UI-TARS download + checksum + mmproj check
│   └── test-audio-detection.ts  # Test audio device parsing
├── dist/                    # Compiled JS (gitignored)
├── package.json
├── tsconfig.json
└── README.md
```

---

## Known Limitations & Risks (Phase 1)

### Audio Routing
- ⚠️ **Phase 1**: Bluetooth device auto-selected; Phase 2 will add spoken confirmation
- ⚠️ **HFP Mic Exposure**: Verify that your Bluetooth device exposes both speaker + microphone on macOS. If only speaker is exposed, app falls back to Mac mic (asymmetric audio).

### Model & Vision
- ⚠️ **CRITICAL**: UI-TARS is multimodal and requires `.mmproj` file alongside `.gguf`. If missing, the model will compile but be **completely blind**. Download script verifies this post-download.
- Phase 2 will test vision on first boot.

### Permissions
- ⚠️ **Phase 2**: Will require Screen Recording + Accessibility permissions (macOS will prompt user)
- ⚠️ **SMAppService (autostart)**: Phase 2 will register at runtime with spoken consent; currently skipped

### TTS & Wake Word
- Phase 1: all output is *logged* and *printed to console* as `[SPEAK]` markers
- Phase 2: will pipe to Piper (actual voice)
- Phase 2: will activate openWakeWord listening

---

## Next Steps (Phase 2)

1. **Whisper.cpp Integration**: real STT (audio stream → text)
2. **Piper TTS**: real spoken output (text → audio via afplay)
3. **openWakeWord**: listen for "Hey, assistant" (or custom wake word)
4. **Health Checks**: verify Ollama, whisper, Piper alive (HTTP checks)
5. **Full Boot Sequence**: integrate all sidecars + spoken progress
6. **OpenClaw Gateway + Voice Plugin**: real agent integration (not mocked)
7. **Screen Reader**: macOS Accessibility API to read screen content
8. **SMAppService**: autostart at login with user consent
9. **Prerecorded Greeting**: generate with Piper on first run

---

## Debugging

### View Logs
```bash
tail -f ~/.myeyescantalk/logs/combined.log
```

### Audio Device Names
```bash
npm run test:audio
```

### Verify Ollama + Model
```bash
ollama list    # Should show UI-TARS after download
ollama serve   # Start Ollama (run separately)
curl http://localhost:11434/api/tags  # Check model is loaded
```

---

## Tech Stack

| Component | Version | Notes |
|-----------|---------|-------|
| Electron | ^27.0.0 | Main app container |
| TypeScript | ^5.3.3 | Type safety |
| Winston | ^3.11.0 | Structured logging |
| execa | ^6.1.0 | Process spawning |
| Ollama | Latest | Model serving (not bundled) |
| whisper.cpp | Phase 2 | STT (bundled) |
| Piper | Phase 2 | TTS (bundled) |
| openWakeWord | Phase 2 | Wake-word detection |
| OpenClaw | Phase 2 | Agentic runtime |

---

## Environment Variables

Optional:
- `LOG_LEVEL`: `debug` | `info` | `warn` | `error` (default: `info`)
- `NODE_ENV`: `development` | `production`

---

## Contributing

This is a personal accessibility project. If you have feedback or find issues, open a discussion or issue.

---

## License

TBD (likely Apache-2.0 or MIT)
