Once you have
  [onboarded](https://wearables.developer.meta.com/docs/onboarding-and-organization-
  management),
  you can create a project or manage existing ones in
  [Meta Wearables Developer Center](https://wearables.developer.meta.com/).

  ## Use this page with AI

  Copy this prompt into your AI coding tool to connect project configuration to app setup:

  ```text
  Use https://wearables.developer.meta.com/docs/develop/dat/manage-projects/, then use the
  Wearables MCP endpoint https://mcp.developer.meta.com/wearables to call search_dat_docs fo
  current Wearables Developer Center project guidance. Inspect my app configuration first,
  then list the exact project, application ID, client token, bundle ID or package name, icon
  permission justification, and version fields I need before editing code. Keep secrets out of
  source control and identify the local verification steps.
  ```

  ## Projects

  You can create new projects or manage your existing ones directly in the Wearables Developer
  Center.

  ## Create a project

  1. Click **New project**.
  2. Give your project a name (what you want to call it) and a brief description (what it
  does).

  ## Configuration

  You can connect your own mobile apps with your Meta wearable device by defining the app
  details.

  1. Click **Configuration** in the project sidebar.
  1. Add the requested details for a mobile app you want to integrate with Meta wearable
  devices.

  ### Application ID integration

  To register your application successfully (without using Developer Mode), you must include
  the Wearables Application ID in your app’s manifest and pass it in the registration call.
  Copy and paste the integration details into your iOS or Android application build to
  complete this step.

  If your bundle ID and package name are different for iOS and Android, respectively (e.g.,
  com.myapp.android vs. com.myapp.ios), you will need to create two separate apps — one that
  defines only the Android platform and another that defines only the iOS platform.

  > **Note:** A hyphen `-` is *not* supported for iOS bundle IDs.

  ## Product listing

  **App name and icon**

  - You need to provide your app's name and an icon.
  - The icon must be in PNG or JPEG format.
  - Separate icons for dark and light mode are supported.
  - The maximum supported dimensions for the icon are 200x200 pixels.

  These details will also be visible to other users in the Meta AI app when they
  [adjust permissions](https://wearables.developer.meta.com/docs/set-up-release-
  channels#manage-permissions-for-connected-apps).

  ## Permissions

  If your app or project needs access to device functionality like the camera or microphone,
  you must provide a justification in the **Permissions** tab. This justification is for
  Meta's internal review only and is not shown to end-users. Reviewers use your explanation to
  determine if the permission is necessary and appropriate for your app's functionality.

  > **Note:** Available permissions include camera, microphone, and voice invocation. New
  device capabilities may be added in future iterations.
