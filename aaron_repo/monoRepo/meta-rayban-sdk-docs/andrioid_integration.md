## Overview

  This guide explains how to add Wearables Device Access Toolkit registration, streaming, an
  photo capture to an existing Android app. For a complete working sample, compare with the
  [provided sample app](https://github.com/facebook/meta-wearables-dat-
  android/tree/main/samples).

  ## Build with AI

  Copy this prompt into your AI coding tool to build a first Android integration slice from
  this guide:

  ```text
  Use https://wearables.developer.meta.com/docs/develop/dat/build-integration-android/, then
  use the Wearables MCP endpoint https://mcp.developer.meta.com/wearables to call
  search_dat_docs for current Android Wearables Device Access Toolkit setup, registration,
  permissions, session lifecycle, MockDeviceKit, and camera guidance. Inspect my Android app
  first, then add the smallest working DAT integration slice: manifest permissions and
  metadata, Gradle dependencies, SDK initialization, app registration launch, and connection
  lifecycle wiring. Call out application ID, client token, callback scheme, Developer Mode
  assumptions, and local verification steps before making larger changes.
  ```

  ## Prerequisites

  Complete the environment and glasses configuration steps in
  [Setup](/docs/develop/dat/getting-started-toolkit/).

  ## Step 1: Add manifest entries

  In your app's `AndroidManifest.xml`, add the permissions required to allow your app to
  communicate with the glasses through Bluetooth. The intent filter with the URI scheme is
  required so that the Meta AI app can callback to your application. The example below uses
  `myexampleapp` as a placeholder. Adjust the scheme to match your project.

  Provide the Wearables Device Access Toolkit with `APPLICATION_ID` and `CLIENT_TOKEN`
  metadata. Both are needed for **attestation** of your app, which ensures its authenticity,
  and they can be found in the Wearables Developer Center (see [Manage
  projects](/docs/develop/dat/manage-projects/)).

  While an App Signature is *not required* for attestation, the Meta AI app will use it to
  verify the authenticity of your app. If incorrect identifiers are used or your app is
  misconfigured, it won't connect, and you will receive an error.

  **Note:** App attestation is *not* used in Developer Mode, since these apps rely on local
  logic, rather than connecting to a release channel. If you are using Developer Mode, you can
  omit these values or simply use `0`.

  ```xml
  <manifest ...>
      <!-- Runtime permissions used by Device Access Toolkit -->
      <uses-permission android:name="android.permission.BLUETOOTH" />
      <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
      <uses-permission android:name="android.permission.INTERNET" />

      <!-- Required if you want to use your phone's camera as a mock device feed -->
      <uses-permission android:name="android.permission.CAMERA" />
      <uses-feature android:name="android.hardware.camera" android:required="false" />

      <application ...>
          <!-- Meta Wearables Device Access Toolkit Setup -->
          <!-- Without Developer Mode, these values need to be set with credentials from the
  app registered in Wearables Developer Center -->
          <meta-data
              android:name="com.meta.wearable.mwdat.APPLICATION_ID"
              android:value="${mwdat_application_id}"
              />
          <meta-data
              android:name="com.meta.wearable.mwdat.CLIENT_TOKEN"
              android:value="${mwdat_client_token}"
              />

          <!-- Enable the Device Access Toolkit App Model (DAM) -->
          <meta-data
              android:name="com.meta.wearable.mwdat.DAM_ENABLED"
              android:value="true"
              />

          <!-- Callback scheme Meta AI uses to return to your app -->
          <activity android:name=".MainActivity" ...>
              <intent-filter>
                  <action android:name="android.intent.action.VIEW" />
                  <category android:name="android.intent.category.DEFAULT" />
                  <category android:name="android.intent.category.BROWSABLE" />
                  <data android:scheme="myexampleapp" />
              </intent-filter>
          </activity>
      </application>
  </manifest>
  ```
  **Note:** Both the Device Access Toolkit App Model (DAM) flow and older flow are supported
  for camera functionality on Meta AI glasses.

  ## Step 2: Add the SDK to Gradle

  The Wearables Device Access Toolkit is distributed through [GitHub
  Packages](https://docs.github.com/en/packages/learn-github-packages/introduction-to-github
  packages).

  Add the Wearables Device Access Toolkit Maven repository to your app's Gradle repositories
  in `settings.gradle.kts`.

  ```kotlin
  val localProperties =
      Properties().apply {
          val localPropertiesPath = rootDir.toPath() / "local.properties"
          if (localPropertiesPath.exists()) {
              load(localPropertiesPath.inputStream())
          }
      }

  dependencyResolutionManagement {
      ...
      repositories {
          ...
          maven {
              url = uri("https://maven.pkg.github.com/facebook/meta-wearables-dat-android")
              credentials {
                  username = "" // not needed
                  password = System.getenv("GITHUB_TOKEN") ?:
  localProperties.getProperty("github_token")
              }
          }
      }
  }
  ```

  Next, declare the Wearables Device Access Toolkit artifacts in `libs.versions.toml`.
  Check the available versions in [GitHub
  Packages](https://github.com/orgs/facebook/packages?repo_name=meta-wearables-dat-android).

  ```toml
  [versions]
  mwdat = "0.7.0"

  [libraries]
  mwdat-core = { group = "com.meta.wearable", name = "mwdat-core", version.ref = "mwdat" }
  mwdat-camera = { group = "com.meta.wearable", name = "mwdat-camera", version.ref = "mwdat" }
  mwdat-mockdevice = { group = "com.meta.wearable", name = "mwdat-mockdevice", version.ref =
  "mwdat" }
  ```

  Then, add them as dependencies in your app's `build.gradle.kts`.

  ```kotlin
  dependencies {
      implementation(libs.mwdat.core)
      implementation(libs.mwdat.camera)
      implementation(libs.mwdat.mockdevice)
  }
  ```

  To build and install your app with the Wearables Device Access Toolkit, you need a persona
  access token (classic) with at least the **read:packages** scope in GitHub. Follow [these
  instructions](https://docs.github.com/en/authentication/keeping-your-account-and-data-
  secure/managing-your-personal-access-tokens#creating-a-personal-access-token-classic) to
  create a new personal access token (classic).

  Then, provide this personal access token following one of these two approaches:

  - In a terminal, set the environment variable `GITHUB_TOKEN` with your personal access
  token.

    ```bash
    export GITHUB_TOKEN=ghp...  # your personal access token (classic)

    ./gradlew installDebug  # from the directory of the actual project
    ```

  - Alternatively, you can create a `local.properties` file in the project root and set the
  key `github_token` with your personal access token. Then, in Android Studio, refresh the
  Gradle project by clicking **File** > **Sync Project with Gradle Files**.

    ```properties
    github_token=ghp...  # your personal access token (classic)
    ```

  ## Step 3: Initialize the SDK

  Initialize the SDK once per process at start up.

  ```kotlin
  Wearables.initialize(context)
  ```

  Invoking other Wearables Device Access Toolkit APIs before initialization yields
  [`WearablesError.NOT_INITIALIZED`](https://wearables.developer.meta.com/docs/reference/andro
  id/dat/0.7/com_meta_wearable_dat_core_types_wearableserror).

  For lifecycle placement guidance, read [Session lifecycle](/docs/develop/dat/lifecycle-
  events/).

  ## Step 4: Launch registration from your app

  Register your application with the Meta AI app either at startup or when the user wants to
  turn on your wearables integration.

  ```kotlin
  fun requestWearablesRegistration(activity: Activity) {
      Wearables.startRegistration(activity)
  }

  fun requestWearablesUnregistration(activity: Activity) {
      Wearables.startUnregistration(activity)
  }
  ```

  Observe registration and device updates.

  ```kotlin
  ...

  Wearables.registrationState.collect { state ->
      onState(state)
  }

  ...
  Wearables.devices.collect { devices ->
      onDevices(devices.toList())
  }
  ```

  ## Step 5: Manage camera permissions

  Before streaming, check the Wearables camera permission and launch the SDK contract if
  required.

  ```kotlin
  var permissionStatus = Wearables.checkPermissionStatus(Permission.CAMERA)
  if (permissionStatus == PermissionStatus.Granted) {
      // start streaming
  }
  permissionStatus = requestWearablesPermission(Permission.CAMERA)

  ...

  private var permissionContinuation: CancellableContinuation<PermissionStatus>? = null
  private val permissionMutex = Mutex()
  // Requesting wearable device permissions via the Meta AI app
  private val permissionsResultLauncher =
      registerForActivityResult(Wearables.RequestPermissionContract()) { result ->
          permissionContinuation?.resume(result)
          permissionContinuation = null
      }

  // Convenience method to make a permission request in a sequential manner
  // Uses a Mutex to ensure requests are processed one at a time, preventing race conditions
  suspend fun requestWearablesPermission(permission: Permission): PermissionStatus {
      return permissionMutex.withLock {
          suspendCancellableCoroutine { continuation ->
              permissionContinuation = continuation
              continuation.invokeOnCancellation { permissionContinuation = null }
              permissionsResultLauncher.launch(permission)
          }
      }
  }
  ```

  ## Step 6: Create device session

  Use
  [`createSession`](https://wearables.developer.meta.com/docs/reference/android/dat/0.7/com_me
  ta_wearable_dat_core_wearables#functions-public-methods) to create a device session and
  access the capabilities of a Meta Wearable Device. You can also add a stream to a previously
  created session.

  You can use
  [`AutoDeviceSelector`](https://wearables.developer.meta.com/docs/reference/android/dat/0.7/c
  om_meta_wearable_dat_core_selectors_autodeviceselector) to make a smart decision for the
  user to select a device. Alternatively, you can use
  [`SpecificDeviceSelector`](https://wearables.developer.meta.com/docs/reference/android/dat/0
  .7/com_meta_wearable_dat_core_selectors_specificdeviceselector) if you provide a UI for th
  user to select a device.

  ```kotlin
  val session = Wearables.createSession(AutoDeviceSelector()).getOrElse { error ->
      showError(error.description)
      return
  }
  session.start()
  ```

  ## Step 7: Start a camera stream

  Create a stream by adding it to an existing
  [`DeviceSession`](https://wearables.developer.meta.com/docs/reference/android/dat/0.7/com_me
  ta_wearable_dat_core_session_devicesession), and observe its state and display frames.

  You can request resolution and frame rate control using
  [`StreamConfiguration`](https://wearables.developer.meta.com/docs/reference/android/dat/0.7/
  com_meta_wearable_dat_camera_types_streamconfiguration). Valid `frameRate` values are `2`,
  `7`, `15`, `24`, or `30` FPS. `videoQuality` can be set to:

  - `HIGH`: 720 x 1280 pixels
  - `MEDIUM`: 504 x 896 pixels
  - `LOW`: 360 x 640 pixels

  [`StreamState`](https://wearables.developer.meta.com/docs/reference/android/dat/0.7/com_meta
  _wearable_dat_camera_types_streamstate) transitions through `STARTING`, `STARTED`,
  `STREAMING`, `STOPPING`, `STOPPED`, and `CLOSED`.

  Register callbacks to collect frames and state events.

  ```kotlin
  fun start(deviceId: DeviceIdentifier) {
      val config = StreamConfiguration(videoQuality = VideoQuality.MEDIUM, frameRate = 24)
      session.addStream(config).fold(
          onSuccess = { stream ->
              scope.launch {
                  stream.videoStream.collect { frame ->
                      displayFrame(frame)
                  }
              }

              scope.launch {
                  stream.state.collect { state ->
                      updateStreamUi(state)
                      if (state == StreamState.STOPPED) {
                          stopStream()
                      }
                  }
              }

              stream.start()
          },
          onFailure = { error, _ -> showError(error.description) },
      )
  }
  ```

  Resolution and frame rate are constrained by the Bluetooth Classic connection between the
  user’s phone and their AI glasses. To manage limited bandwidth, an automatic ladder reduce
  quality as needed. It first lowers the resolution by one step (for example, from `HIGH` to
  `MEDIUM`). If bandwidth remains constrained, it then reduces the frame rate (for example, 30
  to 24), but never below 15 fps.

  The image delivered to your app may appear lower quality than expected, even when the
  resolution reports `HIGH` or `MEDIUM`. This is due to per‑frame compression that adapts to
  available Bluetooth Classic bandwidth. Requesting a lower resolution, a lower frame rate, or
  both can yield higher visual quality with less compression loss.

  ## Step 8: Capture and share photos

  When a stream session is active, call
  [`capturePhoto`](https://wearables.developer.meta.com/docs/reference/android/dat/0.7/com_met
  a_wearable_dat_camera_stream#functions) and handle the returned
  [`PhotoData`](https://wearables.developer.meta.com/docs/reference/android/dat/0.7/com_meta_w
  earable_dat_camera_types_photodata). Add `app/src/main/res/xml/file_paths.xml` so that the
  FileProvider can expose cached images.

  ```kotlin
  stream.capturePhoto()
      .onSuccess { data ->
      ...
      }
      .onFailure(onError)
  ```

  ## Next steps

  - See details on permission flows in [Permissions and
  registration](/docs/develop/dat/permissions-requests/).
  - See details on session lifecycles in [Session lifecycle](/docs/develop/dat/lifecycle-
  events/).
  - Test without a device with [Mock Device Kit](/docs/develop/dat/testing-mdk-android/).
  - Compare against the [Android sample app](https://github.com/facebook/meta-wearables-dat-
  android/tree/main/samples).
  - Prepare for release with [Manage projects](/docs/develop/dat/manage-projects/) and [Set up
  release channels](/docs/develop/dat/set-up-release-channels/) in the Wearables Developer
  Center.