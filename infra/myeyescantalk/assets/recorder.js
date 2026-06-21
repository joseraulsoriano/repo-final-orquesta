// Microphone capture in the renderer (Web Audio API).
// Records raw PCM, downsamples to 16 kHz mono 16-bit, encodes a WAV, and sends
// the bytes to the main process. macOS has no CLI recorder, so this is the
// dependency-free way to feed whisper.cpp.

let recording = false;
let chunks = [];
let audioCtx = null;
let source = null;
let processor = null;
let stream = null;

// Endpointing: stop recording as soon as the user stops talking, instead of a
// fixed window — this cuts the biggest chunk of per-turn latency. Tune the
// thresholds if it cuts you off or waits too long.
const REC_START_RMS = 0.02;      // speech considered "started" above this
const REC_VOICE_RMS = 0.009;     // count even quiet sound as "still talking"
const REC_END_SILENCE_MS = 1600; // tolerate natural pauses so it doesn't cut you off
const REC_NO_SPEECH_MS = 6000;   // give you time to start speaking after the beep

let recTimer = null;

window.mect.onRecordStart(async (maxMs) => {
  if (recording) return;
  try {
    recording = true;
    chunks = [];
    const startedAt = Date.now();
    let speechStarted = false;
    let lastVoiceAt = startedAt;

    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });

    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') await audioCtx.resume();

    source = audioCtx.createMediaStreamSource(stream);
    processor = audioCtx.createScriptProcessor(4096, 1, 1);
    const mute = audioCtx.createGain();
    mute.gain.value = 0;
    source.connect(processor);
    processor.connect(mute);
    mute.connect(audioCtx.destination);

    processor.onaudioprocess = (e) => {
      if (!recording) return;
      const d = e.inputBuffer.getChannelData(0);
      chunks.push(new Float32Array(d));
      let sum = 0;
      for (let i = 0; i < d.length; i++) sum += d[i] * d[i];
      const rms = Math.sqrt(sum / d.length);
      if (rms > REC_START_RMS) {
        speechStarted = true;
        lastVoiceAt = Date.now();
      } else if (rms > REC_VOICE_RMS && speechStarted) {
        lastVoiceAt = Date.now();
      }
    };

    // Decide when to stop: end-of-speech silence, no-speech timeout, or hard cap.
    recTimer = setInterval(() => {
      if (!recording) return;
      const now = Date.now();
      if (now - startedAt >= (maxMs || 10000)) return stopAndSend();
      if (!speechStarted && now - startedAt >= REC_NO_SPEECH_MS) return stopAndSend();
      if (speechStarted && now - lastVoiceAt >= REC_END_SILENCE_MS) return stopAndSend();
    }, 150);
  } catch (err) {
    recording = false;
    window.mect.sendError(String((err && err.message) || err));
  }
});

function stopAndSend() {
  if (!recording) return;
  recording = false;
  if (recTimer) { clearInterval(recTimer); recTimer = null; }

  const inRate = audioCtx ? audioCtx.sampleRate : 48000;
  try {

    if (processor) processor.disconnect();
    if (source) source.disconnect();
  } catch (_) { }
  if (stream) stream.getTracks().forEach((t) => t.stop());

  // Merge captured chunks.
  let len = 0;
  for (const c of chunks) len += c.length;
  const pcm = new Float32Array(len);
  let off = 0;
  for (const c of chunks) {
    pcm.set(c, off);
    off += c.length;
  }

  const wav = encodeWav(pcm, inRate, 16000);
  window.mect.sendAudio(wav);

  if (audioCtx) audioCtx.close();
  chunks = [];
}

// ── Wake-word listening ───────────────────────────────────────────────────
// Continuously monitor the mic. When a speech burst is detected (RMS above a
// threshold), send the last ~2.5s window to main, which transcribes it with
// whisper and checks for the wake phrase. Energy-gating avoids transcribing
// silence. Tune WAKE_RMS_THRESHOLD if it triggers too easily / not enough.
const WAKE_RMS_THRESHOLD = 0.035; // higher so faint sounds ("ah") don't trigger
const WAKE_WINDOW_SEC = 1.6;  // shorter window → faster reaction to "asistente"
const WAKE_CHECK_MS = 600;    // check more often
const WAKE_COOLDOWN_MS = 1000;

const wake = { active: false, ctx: null, src: null, proc: null, stream: null, buf: [], timer: null, cooldown: false };

async function startWake() {
  if (wake.active) return;
  try {
    wake.active = true;
    wake.buf = [];
    wake.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    wake.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (wake.ctx.state === 'suspended') await wake.ctx.resume();
    wake.src = wake.ctx.createMediaStreamSource(wake.stream);
    wake.proc = wake.ctx.createScriptProcessor(4096, 1, 1);
    const mute = wake.ctx.createGain();
    mute.gain.value = 0;
    wake.src.connect(wake.proc);
    wake.proc.connect(mute);
    mute.connect(wake.ctx.destination);

    const rate = wake.ctx.sampleRate;
    const maxSamples = Math.floor(rate * WAKE_WINDOW_SEC);
    wake.proc.onaudioprocess = (e) => {
      if (!wake.active) return;
      wake.buf.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      let total = 0;
      for (const c of wake.buf) total += c.length;
      while (total > maxSamples && wake.buf.length > 1) {
        total -= wake.buf[0].length;
        wake.buf.shift();
      }
    };

    wake.timer = setInterval(() => {
      if (!wake.active || wake.cooldown) return;
      let sum = 0, n = 0;
      for (const c of wake.buf) {
        for (let i = 0; i < c.length; i++) sum += c[i] * c[i];
        n += c.length;
      }
      const rms = n ? Math.sqrt(sum / n) : 0;
      if (rms > WAKE_RMS_THRESHOLD) {
        let len = 0;
        for (const c of wake.buf) len += c.length;
        const pcm = new Float32Array(len);
        let o = 0;
        for (const c of wake.buf) { pcm.set(c, o); o += c.length; }
        window.mect.sendWakeCandidate(encodeWav(pcm, rate, 16000));
        wake.cooldown = true;
        setTimeout(() => { wake.cooldown = false; }, WAKE_COOLDOWN_MS);
      }
    }, WAKE_CHECK_MS);
  } catch (err) {
    wake.active = false;
    window.mect.sendError('wake: ' + String((err && err.message) || err));
  }
}

function stopWake() {
  if (!wake.active) return;
  wake.active = false;
  if (wake.timer) clearInterval(wake.timer);
  try {
    if (wake.proc) wake.proc.disconnect();
    if (wake.src) wake.src.disconnect();
  } catch (_) { }
  if (wake.stream) wake.stream.getTracks().forEach((t) => t.stop());
  if (wake.ctx) wake.ctx.close();
  wake.buf = [];
}

window.mect.onWakeListen(() => { startWake(); });
window.mect.onWakeIdle(() => { stopWake(); });

// ── Barge-in: detect the user speaking WHILE the assistant talks, so she stops
// and listens. Energy-based with a high threshold + sustained requirement to
// resist the assistant's own audio (echo). Tune BARGE_RMS_THRESHOLD on-device.
const BARGE_RMS_THRESHOLD = 0.11; // loud, close speech only — resists noise/echo
const BARGE_SUSTAIN_FRAMES = 6;   // ~0.3s of sustained speech before interrupting
const barge = { active: false, ctx: null, src: null, proc: null, stream: null, hits: 0, fired: false };

async function startBarge() {
  if (barge.active) return;
  try {
    barge.active = true;
    barge.hits = 0;
    barge.fired = false;
    barge.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    barge.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (barge.ctx.state === 'suspended') await barge.ctx.resume();
    barge.src = barge.ctx.createMediaStreamSource(barge.stream);
    barge.proc = barge.ctx.createScriptProcessor(2048, 1, 1);
    const mute = barge.ctx.createGain();
    mute.gain.value = 0;
    barge.src.connect(barge.proc);
    barge.proc.connect(mute);
    mute.connect(barge.ctx.destination);
    barge.proc.onaudioprocess = (e) => {
      if (!barge.active || barge.fired) return;
      const d = e.inputBuffer.getChannelData(0);
      let sum = 0;
      for (let i = 0; i < d.length; i++) sum += d[i] * d[i];
      const rms = Math.sqrt(sum / d.length);
      if (rms > BARGE_RMS_THRESHOLD) {
        barge.hits++;
        if (barge.hits >= BARGE_SUSTAIN_FRAMES) {
          barge.fired = true;
          window.mect.sendBargeHit();
        }
      } else {
        barge.hits = 0;
      }
    };
  } catch (err) {
    barge.active = false;
    window.mect.sendError('barge: ' + String((err && err.message) || err));
  }
}

function stopBarge() {
  if (!barge.active) return;
  barge.active = false;
  try {
    if (barge.proc) barge.proc.disconnect();
    if (barge.src) barge.src.disconnect();
  } catch (_) { }
  if (barge.stream) barge.stream.getTracks().forEach((t) => t.stop());
  if (barge.ctx) barge.ctx.close();
}

window.mect.onBargeOn(() => { startBarge(); });
window.mect.onBargeOff(() => { stopBarge(); });

// Float32 PCM @ inRate → 16 kHz mono 16-bit WAV (ArrayBuffer).
function encodeWav(samples, inRate, outRate) {
  const ratio = inRate / outRate;
  const outLen = Math.max(1, Math.floor(samples.length / ratio));
  const down = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    down[i] = samples[Math.floor(i * ratio)] || 0;
  }

  const buffer = new ArrayBuffer(44 + down.length * 2);
  const view = new DataView(buffer);
  const writeStr = (off, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + down.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, outRate, true);
  view.setUint32(28, outRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, down.length * 2, true);

  let off = 44;
  for (let i = 0; i < down.length; i++) {
    const s = Math.max(-1, Math.min(1, down[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return buffer;
}
