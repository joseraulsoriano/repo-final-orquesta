#
  Overview

  The Wearables Device Access Toolkit separates app registration and device permissions. All
  permission grants occur through the Meta AI app. Permissions work across multiple linked
  wearables.

  Camera permissions are granted at the app level. However, each device will need to confirm
  permissions specifically, in turn allowing your app to support a set of devices with
  individual permissions.

  To create an integration, follow this guidance to build your first integration for
  [Android](/docs/develop/dat/build-integration-android/) or [iOS](/docs/develop/dat/build-
  integration-ios/).

  ## Use this page with AI

  Copy this prompt into your AI coding tool to wire registration and permissions:

  ```text
  Use https://wearables.developer.meta.com/docs/develop/dat/permissions-requests/, then use
  the Wearables MCP endpoint https://mcp.developer.meta.com/wearables to call search_dat_doc
  for current DAT registration and permission guidance. Inspect my app first, then add the
  smallest change that correctly separates app registration from device permission requests.
  Cover Allow once, Allow always, deny, multi-device behavior, and Developer Mode assumptions,
  and run the relevant local checks.
  ```

  ## Registration

  Your app registers with the Meta AI app to be an permitted integration. This establishes the
  connection between your app and the glasses platform. Registration happens once through Meta
  AI app with glasses connected. Users see your app name in the list of connected apps. They
  can unregister anytime through the Meta AI app. You can also implement an unregistration
  flow is desired.

  ## Device permissions

  After registration, request specific permissions (see possible values for
  [Android](https://wearables.developer.meta.com/docs/reference/android/dat/0.7/com_meta_weara
  ble_dat_core_types_permission#enumeration_constants) and
  [iOS](https://wearables.developer.meta.com/docs/reference/ios_swift/dat/0.7/mwdatcore_permis
  sion#enumeration_constants)). The Meta AI app runs the permission grant flow. Users choose
  **Allow once** (temporary) or **Allow always** (persistent).

  ### User experience flow

  ![Illustrating the user experience flow for permissions and using
  features.](/images/wearables-permissions-request-1.png)

  - Without registration, permission requests fail.
  - With registration but no permissions, your app connects but cannot access camera.

  ## Multi-device permission behavior

  Users can link multiple glasses to Meta AI. The toolkit handles this transparently.

  ### How it works

  Users can have multiple pairs of glasses. Permission granted on any linked device allows
  your app to use that feature. When checking permissions, Wearables Device Access Toolkit
  queries all connected devices. If any device has the permission granted, your app receives
  "granted" status.

  ### Practical implications

  You don't track which specific device has permissions. Permission checks return granted if
  _any_ connected device has approved. If all devices disconnect, permission checks will
  indicate unavailability. Users manage permissions per device in the Meta AI app.

  ## Distribution and registration

  Testing vs. production have different permission requirements. When developer mode is
  activated, registration is always allowed. When a build is distributed, users must be in the
  proper release channel to get the app. This is controlled by the `MWDAT` application ID.

  **Note:** For security purposes, only one 3rd party app can remain registered at a time in
  Developer Mode. Registering a new app will automatically unregister any previously
  registered app.

  - For setting up developer mode, see [Getting started with the Wearables Device Access
  Toolkit](/docs/develop/dat/getting-started-toolkit/).
  - For details on creating release channels, see [Manage projects in Developer
  Center](/docs/develop/dat/manage-projects/).
    - This page also explains where to find the `APPLICATION_ID` that must be added to your
  production manifest/bundle configuration.