## Overview

Device audio uses two Bluetooth profiles:

| Profile | Direction | Quality | Use case |
|---------|-----------|---------|----------|
| **A2DP** (Advanced Audio Distribution Profile) | Output only | High quality (44.1/48 kHz stereo) | Music, media playback, TTS |
| **HFP** (Hands-Free Profile) | Bidirectional | 8 kHz mono | Voice capture from the glasses microphone |

In HFP mode, the wearable's microphones use beamforming to isolate the wearer's voice, which significantly reduces the volume of ambient sounds and other speakers. This is expected behavior, not a bug.

## Use this page with AI

Copy this prompt into your AI coding tool to add or debug DAT audio routing:

```text
Use https://wearables.developer.meta.com/docs/develop/dat/microphones-and-speakers/, then use the Wearables MCP endpoint https://mcp.developer.meta.com/wearables to call search_dat_docs for current DAT microphone and speaker guidance. Inspect my audio code first, then make the smallest fix for the selected profile: A2DP for output or HFP for microphone input. Preserve the ordering constraints with DAT camera streaming, verify route selection, and run the relevant local checks.
```

## Choose a profile

Use **A2DP** when you only need to play audio to the glasses, since it provides significantly higher fidelity than HFP. Use **HFP** when you need microphone input from the wearer. The two profiles are mutually exclusive: activating HFP switches the glasses away from A2DP, and audio output quality drops to 8 kHz mono for the duration of the session.

Wearables Device Access Toolkit sessions share microphone and speaker access with the system Bluetooth stack on the glasses.

## iOS

### A2DP (output only) — Play audio to the glasses

A2DP is the high-quality Bluetooth media route on iOS. Configure your app for playback, and the system can route output to paired glasses automatically.

```swift
import AVFoundation

let audioSession = AVAudioSession.sharedInstance()
try audioSession.setCategory(.playback, mode: .default, options: [])
try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
```

Use `AVAudioPlayer`, `AVSpeechSynthesizer`, or any standard audio API to play audio, then verify the active route before assuming output is on the glasses.

```swift
let player = try AVAudioPlayer(contentsOf: audioFileURL)
player.play()
```

#### Verify the route

```swift
let hasA2DPOutput = audioSession.currentRoute.outputs.contains {
    $0.portType == .bluetoothA2DP
}
```

### HFP (bidirectional) — Capture audio from the glasses microphone

HFP requires more setup than A2DP. Use `.allowBluetoothHFP` for microphone capture; A2DP output options do not provide microphone access. If your SDK only exposes the older `.allowBluetooth` option, use that option for HFP.

**Ordering constraint:** When using HFP with a DAT camera stream, the HFP microphone must be fully configured before the stream starts. The correct ordering is:

1. Add the DAT camera stream to the session.
2. Configure and start the HFP microphone. Wait for the route to settle.
3. Start the DAT camera stream.

Starting the DAT stream before HFP is ready can cause the audio route to fail silently.

#### Configure the audio session

```swift
import AVFoundation

// Request microphone permission
let granted = await withCheckedContinuation { continuation in
    AVAudioApplication.requestRecordPermission { granted in
        continuation.resume(returning: granted)
    }
}
guard granted else { return }

// Configure the session for HFP
let audioSession = AVAudioSession.sharedInstance()
try audioSession.setCategory(.playAndRecord, mode: .default, options: [.allowBluetoothHFP])
try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
```

#### Select glasses as the preferred input

The system may have multiple Bluetooth inputs available. Find the HFP port that corresponds to the glasses and set it as the preferred input.

```swift
if let hfpInput = audioSession.availableInputs?.first(where: { $0.portType == .bluetoothHFP }) {
    try audioSession.setPreferredInput(hfpInput)
}
```

#### Capture audio with `AVAudioEngine`

Install a tap on the audio engine's input node to receive raw PCM buffers from the glasses microphone.

```swift
let audioEngine = AVAudioEngine()
let inputNode = audioEngine.inputNode
let format = inputNode.inputFormat(forBus: 0)

inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
    // Forward the buffer to your audio pipeline (e.g., LiveKit, a file writer, etc.)
    handleAudioBuffer(buffer)
}

audioEngine.prepare()
try audioEngine.start()
```

#### Wait for the route to settle

After starting the audio engine, the Bluetooth HFP route needs time to stabilize. After waiting, verify the route is active before starting the DAT stream.

```swift
// Allow the Bluetooth HFP route to settle
try await Task.sleep(nanoseconds: 2 * NSEC_PER_SEC)

// Verify HFP is actually routed
let hasHFPRoute = audioSession.currentRoute.inputs.contains { $0.portType == .bluetoothHFP }
guard hasHFPRoute else {
    audioEngine.stop()
    try audioSession.setActive(false, options: .notifyOthersOnDeactivation)
    throw MyError.hfpRouteUnavailable
}
```

#### Teardown

When you're done capturing, call `removeTap(onBus:)` to stop receiving input buffers, then deactivate the session. If you need to return to A2DP playback, reconfigure the audio session with `.playback` category after deactivation.

```swift
inputNode.removeTap(onBus: 0)
audioEngine.stop()
try audioSession.setActive(false, options: .notifyOthersOnDeactivation)
```

## Android

```kotlin
import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build

private fun routeAudioToBluetooth(context: Context): Boolean {
  if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
    return false
  }

  val audioManager = context.getSystemService(AudioManager::class.java)

  // Get list of currently available devices
  val devices = audioManager.availableCommunicationDevices

  // User chooses one of the devices from the list.
  val userSelectedDeviceType = AudioDeviceInfo.TYPE_BLUETOOTH_SCO

  val selectedDevice = devices.firstOrNull { device ->
    device.type == userSelectedDeviceType
  }

  if (selectedDevice == null) {
    return false
  }

  audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
  return audioManager.setCommunicationDevice(selectedDevice)
}
```

For guidance on how to use audio in your app, refer to the corresponding iOS API and Android API docs:

- iOS API: [AVAudioSession](https://developer.apple.com/documentation/AVFAudio/AVAudioSession)

- Android API: [AudioManager](https://developer.android.com/reference/android/media/AudioManager)
