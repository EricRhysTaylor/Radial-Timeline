# Advanced YAML & Data Integrity

The Advanced YAML editor lets you tailor the Advanced scene template while keeping required base keys intact. Add, remove, or reorder optional fields to match your workflow (e.g., Story Grid values, Dramatica signposts).

## How it works

1. Enable **Settings → Scene YAML templates & remapping → Advanced YAML editor**.
2. Required base keys (Class, Act, When, Duration, Synopsis, Subplot, Character, Status, Publish Stage, Due, Pending Edits, Pulse Update) stay locked and auto-included in order.
3. Optional keys from the Advanced template can be:
   - Drag-reordered with the grip handle.
   - Renamed or deleted.
   - Added via the “Add key” row (values accept text or comma-separated lists).
4. Click the rotate/restore icon to revert the Advanced template back to the shipped defaults.
5. Book Designer and **Create advanced scene note** will use your customized Advanced template whenever you pick **Advanced**.


## Point of View

<a name="point-of-view"></a>

You can control how Point of View (POV) is displayed on the timeline in **Settings → Point of view**.

*   **Global POV**: Sets the default POV mode for all scenes (e.g., "First-person", "Third-person limited").
*   **Scene Level Override**: You can override the global setting for individual scenes by adding a `POV:` key to the scene's YAML frontmatter.

**Common POV Keywords:**
*   `pov: first` (¹ marker)
*   `pov: third` (³ marker)
*   `pov: omni` (Omni³ marker)
*   `pov: two` / `pov: all` (Mark multiple characters)

See [[YAML-Frontmatter#pov-keywords]] for the full list of supported values.

## Data Integrity & Backups

When heavily customizing YAML keys or using advanced plugins, it is crucial to protect your work against data loss or corruption.

**Recommendation:**
Use a reliable backup solution.
*   **Obsidian Sync**: Ensure "Plugin settings" and "Active core/community plugins" are checked in your Sync settings to back up your Radial Timeline configuration.
*   **External Backups**: If using third-party sync (Dropbox, Drive), consider keeping a local backup or using the **Local File History** core plugin.

**Mac/iCloud Users:**
To prevent iCloud sync conflicts from corrupting plugin data, you can append `.nosync` to folder names (e.g., `radial-backups.nosync`) to exclude them from iCloud syncing while keeping them in your vault.
