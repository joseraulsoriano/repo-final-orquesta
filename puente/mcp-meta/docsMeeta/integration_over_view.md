## Overview

  The Wearables Device Access Toolkit lets your mobile app integrate with supported AI
  glasses. An integration establishes a session with the device so your app can access
  supported sensors on the user’s glasses. Users start a session from your app, and then
  interact through their glasses. They can:

    * Speak to your app through the device's microphones
    * Send video or photos from the device's camera
    * Pause, resume, or stop the session by tapping the glasses, taking them off, or closing
  the hinges
    * Play audio to the user through the device’s speakers

  ## Build with AI

  Copy this prompt into your AI coding tool to turn this overview into a first working
  integration slice:

  ```text
  Use https://wearables.developer.meta.com/docs/develop/dat/build-overview/, then use the
  Wearables MCP endpoint https://mcp.developer.meta.com/wearables to call search_dat_docs fo
  current Wearables Device Access Toolkit integration guidance. Inspect my app first, identify
  whether this should start as an iOS or Android integration, and build the smallest safe
  slice that registers the app, connects to the glasses, and starts a session. Keep the change
  scoped, call out required app identifiers or permissions, and run the relevant local checks.
  ```

  ## Supported devices

  Detailed support to devices and version of the Meta AI app and glasses firmware are locate
  in the [Version Dependencies](/docs/develop/dat/version-dependencies/) page.

  ## Integration lifecycle

  1. **Registration**: The user connects your app to their wearable device by tapping a call
  to-action in your app. This is a one‑time flow. After registration, your app can identify
  and connect to the user’s device when your app is open. The flow deeplinks the user to the
  Meta AI app for confirmation, then returns them to your app.
  2. **Permissions**: The first time your app attempts to access the user's camera, you must
  request permission. The user can allow always, allow once, or deny. Your app deeplinks the
  user to the Meta AI app to confirm the requested permission, and then Meta AI returns them
  to your app. Microphone access uses the Hands‑Free Profile (HFP), so you request those
  permissions through iOS or Android platform dialogs.
  3. **Session**: After registration and permissions, the user can start a session. During a
  session, the user engages with your app on their device.

  ## Sessions

  All integrations with Meta AI glasses run as sessions. Only one session can run on a devic
  at a time, and certain features are unavailable while your session is active. Users can
  pause, resume, or stop your session by closing the hinges, taking the glasses off (when wear
  detection is enabled), or tapping the glasses. Learn more in [Session
  lifecycle](/docs/develop/dat/lifecycle-events/).

  ## Key components

  `MWDATCore` is the foundation for your integration. It handles:
  - App registration with the user’s device and registration state
  - Device discovery and management
  - Permission requests and state management
  - Telemetry

  `MWDATCamera` handles camera access and:
  - Resolution and frame rate selection
  - Starting a video stream and sending/listening for pause, resume, and stop signals
  - Receiving frames from devices
  - Capturing a single frame during a stream and delivering it to your app
  - Photo format

  `MWDATDisplay` powers visual experiences on Meta Ray-Ban Display glasses, with support for
  - Content rendering with support for components like FlexBox, Text, Image, Button, and Ico
  - Video playback of MP4 clips on the glasses display

  For more, check out our **API reference documentation**:
  [iOS](https://wearables.developer.meta.com/docs/reference/ios_swift/dat/0.7),
  [Android](https://wearables.developer.meta.com/docs/reference/android/dat/0.7).

  ### Microphones and speakers

  Use mobile platform functions to access the device over Bluetooth. To use the device's
  microphones for input, use HFP (Hands-Free Profile). Audio is streamed as 8 kHz mono from
  the device to your app.

  ### App management

  After registration, your app appears in the user’s App Connections list in the Meta AI app
  where permissions can be unregistered or managed.

  ## Next steps

  - See real-world integration concepts on [our
  blog](https://developers.meta.com/blog/introducing-meta-wearables-device-access-toolkit/).
  - Start building your first integration with our step‑by‑step guides for
  [iOS](/docs/develop/dat/build-integration-ios/) and [Android](/docs/develop/dat/build-
  integration-android/).