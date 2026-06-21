## Distribute

  When you’re ready for people to try your project, you need to
  [set up release channels](https://wearables.developer.meta.com/docs/set-up-release-
  channels).

  Device Access Toolkit v0.7 and later automatically generate a corresponding Device Access
  Toolkit application for each new version. Builds usually complete within 10 minutes, but may
  take up to 30 minutes. Use a version with a release channel only after its Device Access
  Toolkit app finishes building. Monitor build status in the Distribution dashboard:

  - **N/A:** Version is missing build artifact.
  - **In Progress:** Device Access Toolkit application is still building.
  - **Ready:** Device Access Toolkit application is ready to distribute.
  - **Failed:** Device Access Toolkit application build failed.

  Builds rarely fail. Create a new version to resolve build failures.

  > **Note:** Existing projects created before SDK v0.7 must publish a new
  > version if build status is not shown as 'Ready', even if no other project details have
  changed.

  ## Remove a project

  When you no longer need a project, you can remove it from the Meta Wearables Developer
  Center. Removed projects are kept for a recovery period before they are permanently deleted,
  so you can restore a project if you change your mind during this time.

  ### Before you remove a project

  Before you can remove a project, make sure it has no active version on the production
  release channel. If a version is currently distributed on the production channel, remove
  that version from the channel first. See [Manage versions and release
  channels](https://wearables.developer.meta.com/docs/set-up-release-channels) for details.

  > **Note:** Users who have already connected to your application will still have access
  until they manually disconnect their device.

  ### Remove a project

  1. Open your project from the dashboard.
  2. Go to **Overview** and click **Remove project**.
  3. To confirm, type the project name exactly as it's shown.
  4. Click **Remove**.

  After you remove a project, it no longer appears in your active projects list. You can fin
  it under the **Deleted projects** view from your organization dashboard.

  ### Recovery window

  Removed projects are kept for **180 days**. During this period, you can restore the projec
  and return it to development mode. After 180 days, the project and its configuration are
  permanently deleted and can no longer be recovered.

  ### Restore a removed project

  1. From your organization dashboard, open the **Deleted projects** view.
  2. Locate the project you want to restore.
  3. Click **Restore**.

  The restored project returns to development mode. You can continue editing its
  configuration, create new versions, and assign them to release channels as usual. Production
  release channels and previously distributed versions are not automatically re-published;
  review your distribution setup before sharing the project with testers again.
