## Zero draft mode

Zero draft mode helps you capture edits for completed scenes at Stage Zero before opening the note.

### What it does

- When enabled, clicking a scene where Publish Stage is Zero and Status is Complete opens a small dialog instead of the note.
- The dialog shows a large input area prefilled from the scene’s `Pending Edits` frontmatter (if present).
- You can type new edits and click OK to save back to `Pending Edits` using Obsidian’s `processFrontMatter`.

### Buttons

- OK: Overwrites `Pending Edits` with the current input. If you cleared previously non‑empty content, a confirmation asks to delete it (the key remains with an empty string).
- Cancel: Closes the dialog. If there are unsaved changes, you’ll be asked to confirm discarding them.
- Override (red): Opens the note without saving. If there are unsaved changes, you’ll be asked to confirm discarding them first.

### Matching logic

- Case‑insensitive for both keys and values.
- Default values if missing: `Publish Stage` → `Zero`, `Status` → `Todo`.
- Intercepts only when `Publish Stage` = `Zero` AND `Status` = `Complete`.

### How to enable/disable

- Go to Settings → Zero draft mode and toggle it on or off.

### Frontmatter fields used

- `Pending Edits` (read/write)
- `Publish Stage` (read)
- `Status` (read)

All frontmatter writes are performed via `app.fileManager.processFrontMatter`, following Obsidian’s standards.


