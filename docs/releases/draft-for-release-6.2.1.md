## Radial Timeline 6.2.1

This is a focused refinement release for Inquiry, writing-session controls, and the AI model catalog.

### New Features

1. Added Claude Opus 4.8 support.
   - Opus 4.8 is now the current Anthropic Opus option for Inquiry and AI analysis.
   - Opus 4.7 remains available as the previous Opus continuity option.
2. Improved Pending Edits action items in Inquiry briefings.
   - Briefings now keep evidence findings separate from pending action items.
   - Empty "No Action Items" messaging is scoped to completed passes instead of appearing too early.
   - Pending Author Actions now use zone-aware empty-state copy.
3. Refined the writing-session count popover.
   - Session history and prior-run context are preserved more reliably.
   - Session save details handle dates and notes more cleanly.
   - The save-session note field is wider and easier to use.
4. Added a Gossamer full-reset action.
   - The Gossamer score modal now includes a "Delete all" option for clearing saved scores.

### Improvements

- Improved Inquiry force-rerun behavior so cache context and prior run history are preserved.
- Improved Inquiry diagnostics for citation outcomes, invalid responses, and repair states.
- Improved export panel wording and list examples for clearer manuscript-export setup.
- Auto-adopted manuscript beats into an empty workspace on load.
- Fresh installs now skip upgrade alerts and release-note prompts intended only for existing vaults.
- Strengthened model-promotion rules, request-profile metadata, and one-back model continuity handling.

### Bug Fixes

- Fixed Opus 4.8 response-shape issues that could corrupt nested tool inputs or echo schema example values.
- Fixed Inquiry briefings that could duplicate action-led scene notes or show contentless AI finding placeholders.
- Fixed Inquiry cases where evidence findings were mixed into Pending Edits action items.
- Fixed an Inquiry crash from SVG question markers calling `isShown`.
- Fixed stale provider-snapshot lag blocking curated models.
- Fixed export panel selected-scene confusion after closing scenes and restarting Obsidian.
- Fixed session-save date handling issues.
- Fixed Gossamer footer button spacing.
