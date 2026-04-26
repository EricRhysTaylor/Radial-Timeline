## Radial Timeline 6.0.1

This is a bug-fix and polish release following the 6.0.0 major release.

It focuses on first-run onboarding, Book Designer reliability, AI Pulse triplet-analysis modal layout, Inquiry minimap polish, and CSS/UI drift cleanup.

### Highlights

- Fixed fresh-vault onboarding so the Welcome flow can create the initial **Book 1** project folder before authors create their first scene.
- Fixed Book Designer demo-project setup so generated demo books target the active book folder and avoid malformed YAML/frontmatter output.
- Improved the **Triplet Analysis / AI Pulse** processing modal completion layout: completion removes redundant meta pills, places log status inside the progress card, and keeps the AI Prompt & Context expander in the expected position.
- Corrected CSS drift in modal/settings surfaces, including ERT class alignment and release-note header spacing.
- Restored the Welcome screen background logo visibility.
- Fixed the Pro **Learn more** hero card link so it opens the intended wiki destination.

### Bug Fixes

- Fresh vaults now get a usable Book 1 path when the Welcome screen starts the first-scene workflow.
- Book Designer no longer requires authors to manually create the Book 1 folder before generating the nonlinear demo project.
- Demo-project generation now normalizes target paths and writes cleaner frontmatter, avoiding malformed YAML in generated notes.
- The AI Pulse completion state no longer leaves duplicated model/mode meta information in the modal header area.
- Pulse interaction-log messages now appear as a single compact status note in the progress card instead of as detached summary text.
- Inquiry minimap targeting no longer treats empty scene placeholders as focus targets.
- The Pro entitlement card's Learn more action now points to a valid wiki page.
- The Welcome screen logo and Settings release-note headings render with the intended spacing and visibility.

### Improvements

- Inquiry minimap icons now use clearer Lucide-style file, missing-file, and book glyphs.
- Inquiry corpus settings were simplified by removing the redundant "show low-substance notes/scenes" option; low-substance items remain visible automatically.
- AI model registry snapshots, aliases, and drift reports were refreshed as part of release maintenance.
- Modal and settings CSS were cleaned up to reduce drift from the ERT UI conventions.

### Maintenance

- Ran the backup-comment scan across the post-6.0.0 commits and folded the user-facing fixes into this patch note.
- Kept the release notes focused on shipped author-facing behavior rather than automatic build-backup churn.
