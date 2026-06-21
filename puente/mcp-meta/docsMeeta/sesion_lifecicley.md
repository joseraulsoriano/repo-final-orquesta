## Overview

  The Wearables Device Access Toolkit runs inside sessions. Meta AI glasses expose two
  experience types:

  - **Device sessions** grant sustained access to device sensors and outputs.
  - **Transactions** are short, system-owned interactions (for example, notifications or "He
  Meta").

  When your app requests a device session, the glasses grant or revoke access as needed, the
  app observes state, and the system decides when to change it.

  ## Use this page with AI

  Copy this prompt into your AI coding tool to harden session lifecycle handling:

  ```text
  Use https://wearables.developer.meta.com/docs/develop/dat/lifecycle-events/, then use the
  Wearables MCP endpoint https://mcp.developer.meta.com/wearables to call search_dat_docs fo
  current DAT session lifecycle guidance. Inspect my session code first, then add the smallest
  lifecycle fix for RUNNING, PAUSED, and STOPPED states, including interruption handling and
  resource cleanup. Avoid assuming transition reasons, keep UI state explicit, and run the
  relevant local checks.
  ```

  ## Device session states

  `SessionState` is device-driven and delivered asynchronously. On Android, observe the stat
  using
  [`getDeviceSessionState()`](https://wearables.developer.meta.com/docs/reference/android/dat/
  0.7/com_meta_wearable_dat_core_wearables#getdevicesessionstate). On iOS, use
  [`addDeviceSessionStateListener()`](https://wearables.developer.meta.com/docs/reference/ios_
  swift/dat/0.7/mwdatcore_wearablesinterface#adddevicesessionstatelistener).

  | State              | Meaning                                   | App expectation
  |
  |--------------------|--------------------------------------------|-------------------------
  --------------|
  | `STOPPED`          | Session is inactive and not reconnecting.  | Free resources. Wait for
  user action. |
  | `RUNNING`          | Session is active and streaming data.      | Perform live work.
  |
  | `PAUSED`          | Session is temporarily suspended.          | Hold work. Paths may
  resume.          |

  **Note:** &nbsp;`SessionState` does not expose the reason for a transition.

  Observe the `SessionState` and react without assuming the cause of a change.

  **Android**

  ```kotlin
  Wearables.getDeviceSessionState(deviceId).collect { state ->
      when (state) {
          SessionState.RUNNING -> onRunning()
          SessionState.PAUSED -> onPaused()
          SessionState.STOPPED -> onStopped()
      }
  }
  ```

  **iOS**

  ```swift
  let token = await Wearables.shared.addDeviceSessionStateListener(
      forDeviceId: deviceId,
      listener: { state in
          switch state {
          case .running: onRunning()
          case .paused: onPaused()
          case .stopped: onStopped()
          default: break
          }
      }
  )
  ```

  Recommended reactions:

  - On `RUNNING`, confirm UI shows that the device session is live.
  - On `PAUSED`, keep the connection and wait for `RUNNING` or `STOPPED`.
  - On `STOPPED`, release device resources and allow the user to restart.

  ## Common device session transitions

  The device can change `SessionState` when:

  - The user performs a system gesture that opens another experience.
  - Another app or system feature starts a device session.
  - The user removes or folds the glasses, disconnecting Bluetooth.
  - The user removes the app from the Meta AI app.
  - Connectivity between the Meta AI app and the glasses drops.

  Many events lead to `STOPPED`, while some gestures pause a session and later resume it.

  ## Pause and resume

  When `SessionState` changes to `PAUSED`:

  - The device keeps the connection alive.
  - Streams stop delivering data while paused.
  - The device resumes streaming by returning to `RUNNING`.

  Your app should not attempt to restart a device session while it is paused.

  ## Device availability

  Use device metadata to detect availability. Hinge position is not exposed, but it influences
  connectivity. Again, for an Android integration:

  **Android**

  ```kotlin
  Wearables.devicesMetadata[deviceId]?.collect { metadata ->
      if (metadata.available) {
          onDeviceAvailable()
      } else {
          onDeviceUnavailable()
      }
  }
  ```

  **iOS**

  ```swift
  let token = Wearables.shared.deviceForIdentifier(deviceId).addLinkStateListener { linkStat
  in
      if linkState == .connected {
          onDeviceAvailable()
      } else {
          onDeviceUnavailable()
      }
  }
  ```



  Expected effects:

  - Closing the hinges disconnects Bluetooth, stops active streams, and forces `SessionState
  to `STOPPED`.
  - Opening the hinges restores Bluetooth when the glasses are nearby, but does not restart
  the device session. Start a new session after the device becomes available/connected.

  ## Implementation checklist

  - Subscribe to `getDeviceSessionState`/`addDeviceSessionStateListener` and handle all
  `SessionState` values.
  - Monitor device availability before starting work.
  - Release resources only after receiving `STOPPED` or loss of availability.
  - Rely only on observable state rather than inferring transition causes.