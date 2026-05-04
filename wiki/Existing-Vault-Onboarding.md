Use this path when you already have scenes or a manuscript folder and want to hook them into Radial Timeline.

## Common Obsidian Setup Paths
Radial Timeline works well with a few common vault setups. Pick one and stick with it:

- Existing manuscript folder inside a larger vault.
- Multi-book vault with one folder per book plus shared worldbuilding.

This page covers the existing vault flow. If you are starting fresh, see [Fresh Vault Onboarding](Fresh-Vault-Onboarding).

## 1. Add a book profile
1. Decide which folder contains the scene notes for this book.
2. Open **Settings -> Core -> Books**.
3. Add a book profile, set its title, and link its **Source folder** to that manuscript folder.

## 2. Map your metadata
- Your scene notes should use the `Scene` note type.
- For Radial Timeline View, the main scene note properties are `Act`, `Synopsis`, and `Subplot`.
- Chronologue uses `When` and `Duration`.
- Progress uses `Status` and `Publish Stage`.
- If your vault uses different property names, use **Settings -> Advanced -> Configuration** and enable **Remap frontmatter field keys**.

See [Scene Properties (Core + Advanced)](YAML-Frontmatter) for the full schema.

## 3. Normalize ordering
- Scene order uses the leading number in the scene title.
- Act is scoped; update `Act` when moving scenes across acts.
- Use Narrative mode drag and drop after each act has at least one scene.

## 4. Add story beats (optional but recommended)
- Pick a system in Settings -> Core -> Story beats system, or select **Custom** to define your own.
- For custom systems: name your system, add beats, assign to acts, and drag to reorder.
- Use **Create** to generate beat set notes, or **Merge** to realign existing files after changes.
- Switch to Gossamer mode to compare beat-level scoring across the active signal.
