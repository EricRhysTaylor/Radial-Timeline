## Radial Timeline 6.0.2

This is a focused maintenance release following 6.0.1.

### Improvements

- Completed the ERT CSS migration across shared modal and settings surfaces.
- Reduced CSS drift debt from 261 warning hits to 9 and refreshed the maintenance baseline.
- Migrated Book Designer, Manuscript Export, Gossamer, Runtime, AI Pulse / Scene Analysis, Timeline Audit, Timeline Repair, and template-dialog styling toward ERT tokens and `ert-*` classes.
- Expanded localization coverage for Timeline and Inquiry UI strings, including English and Japanese keys for modes, grid labels, Inquiry runner states, tooltips, corpus controls, and interaction messages.
- Improved Inquiry polish around corpus overrides, target-scene handling, runner status text, estimate snapshots, modal labels, and mobile/help copy.
- Added release-gated builds so beta-only commands are excluded from public release assets.
- Improved Book Designer chrome with cleaner ERT cards, input sizing, status styling, and a direct wiki link in the modal badge.
- Refreshed AI/model metadata snapshots, aliases, and drift reports.
- Updated CSS architecture docs to make ERT the default for new shared UI work.

### Documentation

- Reorganized the wiki table of contents and workflow pages.
- Added or refreshed wiki pages for Inquiry, Local LLM, Summary Refresh, Search Timeline, Timeline Order, Timeline Audit, Gossamer workflows, Create Note, Manage Subplots, Manuscript Export, Runtime Estimator, and Planetary Time.
- Added updated screenshots for the major modal and workflow docs.
- Marked Inquiry Omnibus, Timeline Audit, and Timeline Order as beta/testing workflows in the wiki.
- Refined YAML and onboarding docs to match the current Book Designer and fresh-vault behavior.

### Bug Fixes

- Fixed public release builds so beta/development commands are gated out of packaged assets.
- Fixed release-note creation so `npm run release` can use a local `docs/releases/draft-for-release-<version>.md` draft when present.
- Fixed lingering modal CSS drift in Gossamer, AI Pulse, Runtime, Book Designer, and manuscript-related modal surfaces.
- Fixed Inquiry empty-scene targeting and interaction copy edge cases.
- Fixed Timeline Repair/Audit command visibility around beta release gating.
- Fixed stale docs references and screenshots left over from pre-ERT modal names.
