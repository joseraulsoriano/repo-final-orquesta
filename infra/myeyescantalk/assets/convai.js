// ElevenLabs Conversational AI — renderer side.
// The SDK (loaded as the global `ElevenLabsClient` from elevenlabs-client.js)
// handles the microphone, turn-taking, streaming STT/LLM/TTS, and playback.
// We only wire the client tools to the main process (macOS control).

let conversation = null;

const TOOL_NAMES = [
  'open_app', 'open_website', 'set_volume', 'read_screen', 'get_screen_context',
  'type_text', 'press_keys', 'click_element', 'click', 'quit_app',
];

async function startConversation(signedUrl) {
  if (conversation) return;
  const SDK = window.ElevenLabsClient;
  if (!SDK || !SDK.Conversation) {
    window.mect.convError('SDK no cargó (ElevenLabsClient ausente).');
    return;
  }

  // Each client tool just forwards to the main process and returns its result.
  const clientTools = {};
  for (const name of TOOL_NAMES) {
    clientTools[name] = async (params) => {
      try {
        return await window.mect.runTool(name, params || {});
      } catch (e) {
        return 'Error al ejecutar la acción.';
      }
    };
  }

  try {
    conversation = await SDK.Conversation.startSession({
      signedUrl,
      clientTools,
      // Reduce echo/feedback: cancel the device's own playback and suppress
      // steady background noise so a playing video isn't heard as your voice.
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      onConnect: () => {
        window.mect.convStatus('connected');
        window.mect.trayState('connected');
      },
      onDisconnect: (d) => {
        conversation = null;
        window.mect.convStatus('disconnected: ' + JSON.stringify(d || {}));
        window.mect.trayState('idle');
      },
      onError: (m) => window.mect.convError(String(m)),
      onMessage: (p) => {
        if (p && p.message) {
          window.mect.addHistory({ role: p.source === 'user' ? 'user' : 'assistant', text: p.message });
        }
      },
      onModeChange: (m) => {
        const mode = (m && m.mode) || '';
        window.mect.convStatus('mode: ' + mode);
        window.mect.trayState(mode); // 'listening' | 'speaking'
      },
    });
    window.mect.convStatus('session started');
  } catch (e) {
    window.mect.convError('startSession: ' + String((e && e.message) || e));
  }
}

window.mect.onConvStart((url) => { startConversation(url); });
