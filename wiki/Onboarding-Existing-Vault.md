# Existing Vault Onboarding

Use this path when you already have scenes or a manuscript folder and want to hook them into Radial Timeline.

## Common Obsidian Setup Paths
Radial Timeline works well with a few common vault setups. Pick one and stick with it:

- Existing manuscript folder inside a larger vault.
- Multi-book vault with one folder per book plus shared worldbuilding.
- Multiple vaults, one per project, with shared templates.

This page covers the existing vault flow. If you are starting fresh, see [[Onboarding-Fresh-Vault|Fresh Vault Onboarding]].

## 1. Choose a source folder
1. Decide the folder that contains your scene notes.
2. Set **Source path** to that folder in Settings -> Core -> General.
3. Keep non-scene notes outside the Source path if you want them ignored.

## 2. Map your metadata
- Minimum fields for Timeline view: `Class: Scene`, `Act`, `Synopsis`, `Subplot`.
- Chronologue mode needs `When` and `Duration` to place scenes in time.
- Publication mode needs `Status` and `Publish Stage` for progress tracking.
- If your frontmatter uses different keys, use **Settings -> Custom Metadata Mapping**.

See [[YAML-Frontmatter|YAML Frontmatter]] for the full schema.

## 3. Normalize ordering
- Scene order uses the leading number in the scene title.
- Act is scoped; update `Act` when moving scenes across acts.
- Use Narrative mode drag and drop after each act has at least one scene.

## 4. Add story beats (optional but recommended)
- Pick a system in Settings -> Core -> Story beats system, or select **Custom** to define your own.
- For custom systems: name your system, add beats, assign to acts, and drag to reorder.
- Use **Create** to generate beat template notes, or **Merge** to realign existing files after changes.
- Switch to Gossamer mode to visualize momentum.

## 5. Verify with key features
- Search timeline to confirm your fields are indexed.
- Manage subplots to clean up naming.
- Chronologue Shift sub-mode to check time gaps.
- Inquiry for corpus-level issues.
