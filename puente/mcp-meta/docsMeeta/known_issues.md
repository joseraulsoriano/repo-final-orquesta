## Use this page with AI

  Copy this prompt into your AI coding tool to triage a known DAT issue:

  ```text
  Use https://wearables.developer.meta.com/docs/develop/dat/knownissues/, then use the
  Wearables MCP endpoint https://mcp.developer.meta.com/wearables to call search_dat_docs fo
  current DAT known issues. Inspect my symptom, platform, SDK version, Meta AI app version,
  firmware version, and recent logs first. Match the symptom to a known issue or rule it out
  then recommend the smallest workaround or next debug step before changing code.
  ```

  ## Wearables Device Access Toolkit

  | Issue | Workaround |
  | --- | --- |
  |Device Access Toolkit Wearables App installation fails if the device battery is below
  10%.|Charge your glasses until the battery level exceeds 10%, then try again.|
  |Device Access Toolkit Wearables App installation may fail intermittently while setting or
  resetting device connections.|No current fix available. Future versions of Meta AI and
  Glasses firmware will include a more robust installation process.|
  |No “dismiss” option on “No connected devices” error dialog box on the iOS Meta AI
  app.|Restart the Meta AI app. To request the update again, ensure the glasses are connecte
  and navigate to request a new version from your app.|
  |It isn’t possible to reconfigure streaming in the same device session.|Close the device
  session and start a new one.|
  |Android SDK crashes intermittently when multiple captures are taken in quick succession o
  long-running streams (>1 min).|Close the device session and start a new one.|
  |Android Device Access Toolkit Wearables App transfer may fail silently if Wi-Fi is
  off.|Enable Wi-Fi and try again.|

  ## Wearables Developer Center

  | Issue | Workaround |
  | --- | --- |
  |Beta testing: Distribution functionality requires minimum firmware v125| Update glasses
  firmware to v125 or higher. |
  |Beta testing: Device Access Toolkit doesn’t currently allow for an application to have both
  a unique package name and a different bundle ID.|In the Wearables Developer Center,
  developers should set up individual applications for the iOS and Android platforms.|
  |Beta Testing: Device Access Toolkit currently doesn’t support the ‘-’  dash character in
  the iOS Bundle ID.|Don’t use this character in the Bundle ID.|
  |Beta testing: For v272, if the Meta AI app is connected to multiple devices, registering an
  app will install the Device Access Toolkit Wearables App only on one device.|All other
  devices will require manual installation of the DAT Wearables App from the Meta AI app.|
  | Email addresses of members invited to a release channel must already be associated with
  Meta account. | Verify anyone you invite to a release channel has set up a Meta account at
  [meta.ai](https://www.meta.ai/). |
  | Users logged into [developers.meta.com](https://developers.meta.com/) (Meta Horizon) may
  face an error with links from the Wearables Developer Center because it uses a different
  domain ([developer.meta.com](https://developer.meta.com/)). | Logout from
  [developers.meta.com](https://developers.meta.com/) before signing up for the Wearables
  Developer Center. |
