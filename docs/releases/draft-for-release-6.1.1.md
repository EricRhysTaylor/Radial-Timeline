## Radial Timeline 6.1.1

Thank you to **Fioretin** for taking the time to send thoughtful feedback in [GitHub Discussions #11](https://github.com/EricRhysTaylor/Radial-Timeline/discussions/11). This release includes several improvements shaped by that kind of direct user reporting.

This release focuses on AI reliability, Inquiry and Gossamer polish, faster timeline editing, and cleaner support workflows.

### New Features

1. Added a built-in bug report workflow.
   - Capture or attach a screenshot.
   - Paste an image from the clipboard without focusing a field first.
   - Send the report to GitHub, or use the email fallback if you do not have a GitHub account.
2. Added timeline chapter markers from the scene right-click menu.
   - Set or clear a `Chapter:` marker directly from a scene.
   - Review the current chapter containers before saving.
   - Keep publishing structure aligned with the Narrative timeline.
3. Improved writing session tracking.
   - Added typed-word counting and session word targets.
   - Cleaned up the session save modal.
   - Added restart-after-completion flow for the session timer.

### Visual Highlights

**Bug report workflow**

<img src="https://raw.githubusercontent.com/EricRhysTaylor/Radial-Timeline/master/wiki/images/panel-report-bug.png" alt="Bug report workflow" width="600">

**Chapter right-click menu**

<img src="https://raw.githubusercontent.com/EricRhysTaylor/Radial-Timeline/master/wiki/images/menu-rightclick-chapter.png" alt="Chapter right-click menu" width="282">

**Set chapter marker**

<img src="https://raw.githubusercontent.com/EricRhysTaylor/Radial-Timeline/master/wiki/images/modal-set-chapter.png" alt="Set chapter marker modal" width="600">

**Writing session control**

<img src="https://raw.githubusercontent.com/EricRhysTaylor/Radial-Timeline/master/wiki/images/ui-count-popover.png" alt="Writing session control popover" width="600">

### Improvements

- Hardened AI model routing and provider handling, including Claude Opus 4.7, Gemini, local LLM capability checks, model availability gates, and stricter request profiles.
- Improved AI cost and token estimates across Settings AI, Inquiry, and Gossamer so previews better reflect what will be sent.
- Improved Gossamer AI analysis with response validation, safer frontmatter writes, clearer progress/error states, and better handling for beat purpose text.
- Improved Inquiry briefing behavior, including sorted findings/action items, compact briefing fingerprints, cache-state recovery, and more reliable reopened sessions.
- Improved Settings → Publish wording and PDF template/font guidance.
- Improved Chronologue defaults so the planetary calendar sub-mode can open first when configured.

### Bug Fixes

- Fixed AI privacy flags so disabled remote calls are honored.
- Fixed model dispatch so unavailable models are blocked before burning quota on provider errors.
- Fixed Gossamer scoring cases where the wrong prompt shape, missing Beat Purpose, or malformed AI responses could produce bad run data.
- Fixed Inquiry cache and estimate edge cases that could leave stale, missing, or misleading status in the view.
- Fixed timeline/session UI regressions, including tab count animation direction and Gossamer score text overlap.
