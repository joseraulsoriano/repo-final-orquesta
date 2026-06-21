setup

  ## Overview

  The Wearables Device Access Toolkit supports iOS and Android mobile platforms, with the same
  OS version requirements as the Meta AI app (iOS 15.2+ and Android 10+).

  Xcode 14.0+ is supported for iOS. Android Studio Flamingo or newer is supported for Android.

  ## Use this page with AI

                                                                                               Copy this prompt into your AI coding tool to prepare a local DAT development setup:

  ```text
  Use https://wearables.developer.meta.com/docs/develop/dat/getting-started-toolkit/, then use
  the Wearables MCP endpoint https://mcp.developer.meta.com/wearables to call search_dat_doc
  for current DAT setup guidance. Inspect my environment and app platform first, then produc
  the smallest setup checklist for SDK prerequisites, Meta AI app and glasses versions,
  Developer Mode, and Mock Device Kit fallback testing. Do not edit app code until the setup
   gaps and local verification steps are clear.
  ```

  ## Hardware requirements

  Currently, the SDK supports the Ray-Ban Meta (Gen 1 and Gen 2), Ray-Ban Meta Optics, and
  Meta Ray-Ban Display glasses. You can test with a simulated device using [Mock Device
  Kit](/docs/develop/dat/mock-device-kit/), or directly with a device. Detailed version
  support of the Meta AI app and glasses firmware is located in the [Version
  Dependencies](/docs/develop/dat/version-dependencies/) page.

  ## Setting up your glasses

    1. Ensure your versions of the Meta AI app and glasses software are in line with the
  version dependencies [outlined here](/docs/develop/dat/version-dependencies). Follow the
  instructions below to verify your current glasses version.
    1. Connect your glasses to the Meta AI app.
    1. Enable [developer mode](/docs/develop/dat/getting-started-toolkit#enable-developer-
  mode-in-the-meta-ai-app) in the Meta AI app. Developer mode allows your unpublished app to
  register and interact with your AI glasses without the need to submit it for publishing
  review. Your app appears under **Meta AI settings** > **App connections** > **Developer mode
  apps**. It also enables testing via invite-only [release channels](/docs/develop/dat/set-up-
  release-channels).

  ### Verify glasses software version

    1. In the Meta AI app, go to the Devices tab (the glasses icon at the bottom of the app)
  and select your device.
    2. Tap the gear icon to open **Device settings**.
    3. Tap **General** > **About** > **Version**.
    4. You should have the minimum supported version or above installed on your glasses, as
  outlined [here](/docs/develop/dat/version-dependencies/).
    5. If your version is below minimum support requirements, update your glasses software.

  ### Enable developer mode in the Meta AI app

    1. On your iOS or Android device, select **Settings** > **App Info**, and then tap the
  **App version** number five times to display the toggle for developer mode.
    2. Select the toggle to enable **Developer Mode**.
    3. Click **Enable** to confirm.

    **iOS**

    ![Image of enabling developer mode on an iOS device](/images/wearables-devmode-ios.png){
  width="296"}

    **Android**

    ![Image of enabling developer mode on an android device](/images/wearables-devmode-
  android.png){: width="296"}