## Radial Timeline 6.2.1

This release refines onboarding, Inquiry demo behavior, briefing/session recovery, provider-cache visibility, and the AI model catalog.

### New Features

1. Redesigned the Welcome screen.
   - Updated the welcome image and layout around three clearer hero cards.
   - Added a quick-start workflow block with command chips and stronger Book Manager/sample vault entry points.
   - Added a direct feedback link for sharing plugin experiences.
2. Added no-key Demo Mode for Inquiry.
   - Demo vault briefings can be opened and reviewed without an API key.
   - Read-only demo states now render calmly instead of looking like errors.
   - Demo zones remain clickable, with desaturated read-only styling.
3. Added Claude Opus 4.8 support.
   - Opus 4.8 is now the current Anthropic Opus option for Inquiry and AI analysis.
   - Opus 4.7 remains available as the previous Opus continuity option.
4. Improved Pending Edits action items in Inquiry briefings.
   - Briefings now keep evidence findings separate from pending action items.
   - Empty "No Action Items" messaging is scoped to completed passes instead of appearing too early.
   - Pending Author Actions now use zone-aware empty-state copy.
5. Added Inquiry session-state controls.
   - Briefing Manager can save and restore session state.
   - Inquiry session data now writes through a visible sidecar folder instead of a hidden dotfolder.
6. Refined the writing-session count popover.
   - Session history and prior-run context are preserved more reliably.
   - Session save details handle dates and notes more cleanly.
   - The save-session note field is wider and easier to use.
7. Added Gossamer provider-cache visibility.
   - Gossamer now surfaces provider-cache windows across the run workflow.
   - Next-run cache/cost projections are clearer after the first signal run.
8. Added a Gossamer full-reset action.
   - The Gossamer score modal now includes a "Delete all" option for clearing saved scores.

### Improvements

- Improved Welcome screen copy, spacing, card hierarchy, sample-vault labeling, and Book Manager navigation.
- Improved Inquiry engine button behavior so it opens the engine popover instead of jumping to Settings.
- Improved Inquiry force-rerun behavior so cache context and prior run history are preserved.
- Improved Inquiry diagnostics for citation outcomes, invalid responses, and repair states.
- Improved Inquiry guidance for context-sensitive reader-orientation recommendations.
- Improved Inquiry labels and briefing presentation by removing redundant Findings wrappers and keeping scene-note headlines clearer.
- Improved Gossamer cost reporting so last-run cost and next-run projection are separated.
- Improved Settings Publish template update behavior so the update button is more status-aware.
- Improved export panel wording and list examples for clearer manuscript-export setup.
- Auto-adopted manuscript beats into an empty workspace on load.
- Fresh installs now skip upgrade alerts and release-note prompts intended only for existing vaults.
- Strengthened model-promotion rules, request-profile metadata, and one-back model continuity handling.

### Bug Fixes

- Fixed Opus 4.8 response-shape issues that could corrupt nested tool inputs or echo schema example values.
- Fixed Inquiry briefings that could duplicate action-led scene notes or show contentless AI finding placeholders.
- Fixed Inquiry cases where evidence findings were mixed into Pending Edits action items.
- Fixed an Inquiry crash from SVG question markers calling `isShown`.
- Fixed Inquiry demo-vault rehydration and no-key states so saved briefings render as available results, not stale foreign-model priors.
- Fixed stale cache/cost badges appearing when no real API key is stored.
- Fixed Inquiry glyph marker tooltips to use Radial Timeline styling instead of native browser titles.
- Fixed stale provider-snapshot lag blocking curated models.
- Fixed export panel selected-scene confusion after closing scenes and restarting Obsidian.
- Fixed Welcome screen command chips, Book Manager scrolling, collapsed spacing, and sample-card labeling.
- Fixed the timeline tab title not refreshing after a book change.
- Fixed Publish template update history acknowledgement after installing template hotfixes.
- Fixed session-save date handling issues.
- Fixed Gossamer cache-window pill CSS drift and footer button spacing.

### Visual Highlights

**Updated Welcome screen**

<img src="https://raw.githubusercontent.com/EricRhysTaylor/Radial-Timeline/master/wiki/images/ui-welcome.png" alt="Updated Radial Timeline Welcome screen" width="600">
