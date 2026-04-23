## Radial Timeline 6.0.0

This is a major rollup release from `5.0.2` to `6.0.0`.

Release 6 turns Radial Timeline into a much broader author workflow platform. What began as a radial manuscript view now reaches further into story analysis, progress sharing, structure design, publishing preparation, and AI-assisted review. This release adds a second major view, a much deeper set of scene and beat workflows, richer author-facing exports, and a fully rebuilt settings and documentation experience.

For authors, the practical difference is simple: you can now do much more of your planning, diagnosis, presentation, and manuscript preparation inside one coherent system instead of splitting that work across separate tools and ad hoc notes.

### Highlights

- Added the **Author Progress Report (APR)** system for spoiler-safe progress graphics with custom styling, export controls, reveal options, and Pro campaign workflows.
- Added **Inquiry**, a second major view alongside the timeline for big-picture manuscript analysis across a book or saga, with a glyph, minimap, corpus controls, and structured prompt workflows.
- Expanded **story structure and note management** with scene, beat, and backdrop property editors, custom beat systems, saved beat sets, backdrops, and micro-backdrop rings.
- Added **drag-to-reorder in Narrative mode** with optional ripple rename, a recent-moves overlay, and persistent move history logs so structural edits are easier to track and audit.
- Upgraded **Gossamer Mode** into a multi-signal, multi-run scoring system with run filtering, signal switching, saved history, and richer AI/manual workflows.
- Rebuilt the **settings experience** into distinct tabs for Core, Social, Inquiry, Publishing, AI, Advanced, and Pro, with stronger visual separation and integrated wiki/help linking.

### Author Progress Report

- Added a dedicated **Author Progress Report** workflow for creating public-facing, spoiler-safe progress graphics you can actually share without exposing the story itself.
- Supports three tracking modes:
  - **Stage Tracking**
  - **Full Manuscript**
  - **Date Goal**
- Supports custom visual styling for colors, typography, contrast, background handling, and branding treatment, so the presentation can match your public-facing identity instead of looking like a generic utility export.
- Supports multiple output sizes plus export format selection.
- APR exports support **PNG or SVG**, with export-quality controls including higher-resolution output.
- Pro adds **Campaign Manager** support for multiple APR campaigns with independent export paths, schedules, refresh reminders, sizes, and teaser behavior.
- Added **Teaser Reveal** with slow, standard, fast, or custom thresholds so public graphics can progressively reveal more detail over time.

In practical author terms, APR is designed for Kickstarter updates, newsletters, social posts, website embeds, campaign pages, and other situations where you want to communicate progress clearly while preserving mystery.

### Inquiry View

- Added **Inquiry** as a separate view in addition to the Radial Timeline.
- Inquiry analyzes manuscript structure at a higher level across a **Book** or **Saga** scope.
- Added the Inquiry **glyph** with **Flow** and **Depth** rings plus zone-based prompt controls.
- Added the Inquiry **minimap**, which surfaces scene citations and context across the scanned corpus.
- Added **Corpus Manager** style overrides and settings-driven corpus controls for what gets sent to AI.
- Inquiry supports material-mode control over manuscript inputs, including sending:
  - full note bodies
  - summaries only
  - or excluding selected classes entirely
- Inquiry supports configurable scan folders, class scope, and question sets.
- Added built-in prompt sets plus **custom questions** per zone.
- Core supports a smaller custom-question allowance; Pro unlocks additional question slots.
- Inquiry artifacts can be saved, and findings can optionally be written back into scene action-note fields.

This is the part of Release 6 that most clearly changes the scale of what RT can do. Inquiry is not just a different screen. It is a different mode of authorship: one built for stepping back, examining the whole manuscript, reviewing structural pressure points, and scanning for continuity, escalation, loose ends, and thematic gaps across one book or an entire saga.

### Story Structure and Metadata Management

- Expanded scene metadata control through the **Scene properties editor**, which lets you add, remove, rename, and reorder optional advanced scene fields while preserving required core keys.
- Expanded beat-note control through the **Beat properties editor**, including hover-field selection and per-system storage of beat metadata preferences.
- Added **Backdrop properties editor** support for extending backdrop note metadata.
- Added and hardened **custom metadata remapping** so legacy or custom frontmatter keys can map into RT canonical keys without rewriting files.
- Story beat support now includes:
  - built-in preset systems
  - custom beat systems
  - drag reorder for beats
  - create/merge workflows
  - saved beat sets for switching among multiple custom systems in the same project
- Added and expanded **Backdrop** and **Micro-backdrop** support for lighter-weight context layers and larger historical/worldbuilding movements in Chronologue workflows.

This matters because many authors do not work from a single fixed method. Some use classic beat sheets, some use custom structures, some track world-state shifts, some rely on detailed YAML fields, and some are bringing in pre-existing note systems. Release 6 pushes much harder toward meeting authors where they already are instead of forcing them into one rigid metadata model.

### Narrative Reordering and Move History

- Added **drag-to-reorder scenes in Narrative mode** on the outer ring.
- Added **manuscript ripple rename** support to normalize scene and active-beat numeric prefixes after drag reorder when desired.
- Added a **recent drag move overlay** in Narrative mode.
- Added persistent **move history logging** so recent structural moves can be reviewed later in a generated log file.
- Move history records source/destination context, rename impact, and whether a move crossed acts or used ripple rename.

For authors doing real structural revision, this is one of the most practical changes in the release. You can move scenes visually, see what changed, keep a record of the change, and retrace your decisions later instead of relying on memory after a long editing session.

### Gossamer Mode

- Gossamer now supports four distinct scoring signals:
  - **Momentum**
  - **Tension**
  - **Activity**
  - **Interiority**
- Added richer **run history** with up to 30 stored slots per beat.
- Added **LATEST** vs. all-runs viewing plus per-run toggles in the Gossamer runs panel.
- Gossamer run metadata stores provider/model context, timestamps, signal, and stage metadata for saved runs.
- Added stronger manual scoring workflows through the **Gossamer score manager**.
- Added richer built-in AI scoring workflows for the active signal.
- Justifications are stored alongside scores, and Gossamer history can be normalized or cleaned up from the score manager.

Release 6 makes Gossamer feel much more like a serious diagnostic instrument rather than a one-off scoring overlay. Authors can compare multiple passes, separate different dimensions of narrative energy, and preserve those runs as part of an evolving editorial record.

### AI and Model Support

- Expanded AI settings and provider support across:
  - **OpenAI**
  - **Anthropic**
  - **Google**
  - **Local / OpenAI-compatible endpoints**, including Ollama-style setups
- Added stronger model-selection workflows, including support for provider/model registries and latest-lane selection behavior.
- Added token and pricing infrastructure for **cost estimation** and provider/model pricing awareness.
- Expanded verification, audit, and model snapshot tooling around supported providers and model capabilities.

For authors who are actively using AI inside RT, this release aims to make those workflows more legible and more controllable: clearer provider support, better model selection, better awareness of cost, and stronger infrastructure under the hood for keeping those systems current.

### Publishing and Export

- Expanded manuscript export into a more serious **publishing** workflow built around Pandoc/LaTeX templates.
- Added bundled template install, duplicate, and import workflows.
- Added chapter-aware and act-derived export structure, including support for chapter markers on scene, beat, or backdrop notes.
- Added stronger publishing validation around book metadata, matter files, templates, and export readiness.

This is part of a larger shift in RT from pure planning toward a more complete manuscript lifecycle. The tool is not only helping authors understand structure; it is increasingly helping them prepare outward-facing manuscript artifacts as well.

### Settings, UX, and Documentation

- Rebuilt settings into seven major tabs:
  - **Core**
  - **Social**
  - **Inquiry**
  - **Publishing**
  - **AI**
  - **Advanced**
  - **Pro**
- Added stronger visual separation, formatting, iconography, and ERT-based UI structure across the settings experience.
- Added integrated settings-to-wiki linking and broader in-product guidance.
- Expanded onboarding and documentation coverage across Welcome, fresh-vault onboarding, existing-vault onboarding, migration docs, commands, settings, inquiry, publishing, APR, and timeline modes.
- Added a large new screenshot/documentation set so the wiki reflects the current UI and workflows.

This overhaul matters because Release 6 introduces enough new surface area that the product had to become easier to navigate, easier to learn, and easier to explain. The settings and docs work are part of the release itself, not an afterthought.

### Pro Signature

- Release 6 also expands the set of advanced workflows grouped under **Pro Signature (Early Access)**.
- In the UI, Pro workflows are called out in **magenta** so they are visually distinct from Core workflows.
- Current Pro Signature workflows called out in the repo include:
  - **Inquiry+** with additional custom question slots
  - **Publishing exports** via Pandoc
  - **APR Campaigns**
  - **Chronologue Runtime sub-mode**
  - additional website-exclusive guided materials
- The repo also includes a **Pro access key** path marked as coming soon, with paid licensing planned after the current Early Access period.
- During Early Access, Pro workflows are available for preview while the longer-term Pro Signature subscription/licensing plan is being prepared.

The important author-facing distinction is that RT now has a clearer split between the broad free core and a set of more advanced signature workflows for authors who want deeper analysis, publishing, campaign, and high-resolution planning tools.

### Release Scope

- This is not a small patch release. It is a true major-version rollup from `5.0.2` to `6.0.0`.
- The tracked diff from `5.0.2` to current `HEAD` is roughly `226,057` added lines and `14,230` removed lines, before counting any additional uncommitted local edits you decide to ship.

That scale is reflected in the user experience. This release is not a light refinement of the previous version. It is a major expansion of the product’s scope, language, workflows, and author-facing capabilities.
