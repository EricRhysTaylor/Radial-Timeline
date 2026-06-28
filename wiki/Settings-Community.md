The Community tab connects Radial Timeline to the public Community area on the Radial Timeline website. It is designed for author-to-author progress sharing: public project shells, optional progress reports, and a clear view of what you chose to publish.

Community Share is opt-in. Nothing publishes from your vault until you connect the website, choose public fields, generate the Complete Preview, review it, and press **Publish report**.

## What Community Share Is For

Use Community Share when you want to show other writers what you are working on without exposing the private contents of your manuscript.

Launch scope:

*   Public author profile and project shell.
*   Public manual progress reports.
*   Field-by-field opt-ins.
*   Complete Preview before publishing.
*   Revoke, delete shared report data, and disconnect controls.

Future community features may include follows, timeline views, review circles, and editor/alpha-reader workflows. Those are not part of the launch publish path.

## What Never Leaves The Plugin

Community Share is intentionally narrower than a collaboration or manuscript-review system.

The plugin does **not** publish:

*   Manuscript text.
*   Scene paths.
*   Note paths.
*   File names or folder paths.
*   Vault paths.
*   Raw writing-session rows.
*   Exact public session timestamps.
*   API keys, license keys, or plugin secrets.

Only the public fields you explicitly select can be included in a report.

## Basic Setup

1. Open the website Community page and sign in.
2. Create or update your public author profile and public project shell.
3. Generate a one-time activation token on the website.
4. In Obsidian, open **Settings -> Community Plugins -> Radial Timeline -> Community**.
5. Paste the activation token and click **Connect**.
6. Turn on only the fields you want to share.
7. Generate the **Complete Preview**.
8. Review the preview.
9. Click **Publish report**.

Activation alone does not publish a report. It only connects this local vault/book to the website project you selected.

## Share Controls

### Audience

For launch, **Public** is the only publishable audience.

Other audience types, such as followers, trusted authors, and private links, are future features. They may appear in the UI to show the product direction, but they are disabled until the backend and privacy rules are ready.

### Report Tier

Tier 0 shares nothing. Launch-safe publishing uses tiers 1 through 4.

Tier 5 is reserved for future richer reports and remains disabled for launch.

### Field Opt-ins

Every field starts off. Turning on one field does not enable any other field.

Examples of launch-safe fields include:

*   Public project title or alias.
*   Public project description.
*   Project status.
*   Genre.
*   Report period.
*   Writing days.
*   Rounded minutes.
*   Rounded word totals.
*   Bucketed session count.
*   Coarse mode mix.

Sensitive future fields, such as real scene titles or exact session timestamps, are not included in the launch report.

## Complete Preview

The Complete Preview is the hard gate before publishing.

It shows the public report categories that will be sent to the website and records preview hashes so the plugin can detect stale changes. If you change audience, tier, or field opt-ins after generating a preview, the preview becomes stale and must be generated again before publishing.

## Publish And Safety Controls

*   **Publish report** sends the reviewed public report to the website.
*   **Revoke** removes the current public report from public viewing while keeping your connection.
*   **Delete shared data** removes the shared report payload JSON from the website. Minimal audit metadata may remain.
*   **Disconnect** removes the plugin's Community Share connection for this vault. Local writing data stays local.

## Relationship To APR

The [Author Progress Report](Author-Progress-Report) is a local visual/social export tool.

Community Share is different: it is a website-connected publish flow with account activation, field opt-ins, a Complete Preview, and remote revoke/delete/disconnect controls.

Use APR when you want a designed progress graphic. Use Community Share when you want a public author-to-author progress report on the Radial Timeline website.
