The Core tab is the main structural control center for Radial Timeline. It covers manuscript scope, progress tracking, story beats, chronology, scene properties, POV, planetary time, and timeline color systems.

## General

*   **Source path**: The root folder in your vault containing your manuscript scene files (for example, `Book 1`). Leave blank to scan the entire vault.
*   **Show source path as title**: When enabled, the timeline uses the source folder name as the central title. When disabled, it displays `Work in Progress`.
*   **Logs & generated files output folder**: Storage location for AI logs and local LLM reports (default `Radial Timeline/Logs`).
*   **Export folder**: Destination for manuscript, outline, and cue card exports — Markdown, PDF, beat sheets, and index cards (default `Radial Timeline/Export`).

## Progress And Status

Manage your project milestones and status tracking.

**Stage target dates:**

*   **Zero target date**: Target completion date for the Zero Draft stage (`YYYY-MM-DD`).
*   **Author target date**: Target completion date for the Author's Draft stage. Must be after the Zero target date.
*   **House target date**: Target completion date for the House Edit stage. Must be after the Author target date.
*   **Press target date**: Target completion date for the Press Ready stage. Must be after the House target date.

Target dates are validated to ensure proper stage ordering. Overdue dates are highlighted in red. Each stage has its own color-coded marker on the timeline.

*   **Zero draft mode**: A focused mode for first-draft writing. Intercepts clicks on scenes with `Publish Stage = Zero` and `Status = Complete` to open a `Pending Edits` panel instead of the full note.
*   **Show completion estimate**: Toggles the predicted completion tick mark on the timeline.
*   **Completion estimate window (days)**: Rolling window (default 30, min 14, max 90) used to measure pace. Pace = completions in the active stage within the last N days / N (scenes/day).

**How the completion estimate works**

*   Scope: Only the active stage (highest stage with any incomplete scenes). Other stages do not affect pace or remaining.
*   Total scenes for the active stage: `max(unique stage scenes, highest scene number seen anywhere)`. This lets an early high-numbered scene (for example, `Scene 70`) set a floor even if few notes exist.
*   Remaining: Total - Completed (stage-scoped, deduped by path, clamped to `>= 0`).
*   Date: Requires at least 2 completed scenes in the window for a confident pace. With fewer, the geometry stays but the label shows `?`.
*   Staleness colors: fresh (`<= 7d`), warn (`8-10d`), late (`11-20d`), stalled (`>20d` or no pace/insufficient samples, red `?`).

> [!NOTE]
> Learn more in [Workflow Overview](Core-Workflows) and [Progress Mode](Progress-Mode).

<a name="runtime-estimation"></a>
## Runtime Estimation

Runtime estimation is a Pro workflow configured from the Core tab.

*   **Enable runtime estimation**: Activates runtime calculations for scenes and the Chronologue Runtime sub-mode.
*   **Default runtime profile**: The profile used when no per-scene override is set.
*   **Edit profile**: Manage multiple profiles with different settings for various project types.
*   **Profile label**: Display name shown in pickers and the runtime panel.
*   **Content type**: Choose between Novel/Audiobook (unified narration pace) or Screenplay (separate dialogue/action pacing).

**Screenplay mode settings:**

*   **Dialogue words per minute**: Reading speed for quoted dialogue (default 160).
*   **Action words per minute**: Reading speed for scene descriptions (default 100).
*   **Parenthetical timings**: Seconds added for screenplay directives such as `(beat)`, `(pause)`, `(long pause)`, `(a moment)`, `(silence)`.

**Novel/Audiobook mode settings:**

*   **Narration words per minute**: Reading pace for all content (default 150).

**Session planning (optional):**

*   **Drafting words per minute**: Your writing speed for completion projections.
*   **Daily minutes available**: For `45 min/day` style estimates.
*   **Runtime arc cap default**: Controls Chronologue Runtime sub-mode arc scaling. Lower values emphasize shorter scenes.

> [!NOTE]
> See [Pro](Pro) for the full runtime workflow and [Runtime](Chronologue-Mode#runtime-mode-pro) for the visualization.

<a name="story-beats-system"></a>
## Story Beats System

Configure the structural pacing guide for your story.

*   **Story beats system**: Select a preset structure (**Save The Cat**, **Hero's Journey**) or choose **Custom**.
*   **Custom story beat system editor**: Name your beat system, add beats, assign each beat to an act, and drag to reorder.
*   **Create sets**: Generate beat set notes in your source folder.
*   **Beat filename numbering**: Generated beat notes use decimal minor prefixes (for example, `7.01 Midpoint.md`) so scene integer slots remain canonical.
*   **Repair beat notes**: Updates frontmatter (`Act`, `Beat Model`, `Class`) only. Does not rename files.
*   **Beat properties editor**: Customize additional beat properties and choose which fields appear in beat hover metadata. Stored per beat system.
*   **Saved sets**: Save and switch between multiple custom beat systems.

> [!NOTE]
> Learn more in [Gossamer Mode](Gossamer-Mode) and [Beat Audit + Heal](Beat-Audit-Heal).

<a name="acts"></a>
## Acts

Configure the high-level structure of your narrative ring.

*   **Act count**: Sets the number of acts (minimum 3). This divides the Progress, Narrative, and Gossamer rings.
*   **Act labels**: Optional custom names for your acts.
*   **Show act labels**: Toggle to hide labels and show only act numbers.

> [!NOTE]
> See [Narrative Mode](Narrative-Mode) for how acts render in the timeline.

<a name="scene-properties-and-remapping"></a>
## Scene Properties And Remapping

Manage how Radial Timeline reads and maintains scene metadata.

*   **Custom Metadata Mapping**: Map existing frontmatter keys in your vault (for example, `story_date`) to RT system keys (for example, `When`) without changing your files.
*   **Scene properties editor**: Customize the advanced scene properties, add optional fields, and control hover metadata icons/order.

Important behavior:

*   RT-maintained scene normalization only manages the **core** and current **advanced** scene-property fields.
*   External or foreign YAML properties from other plugins or your own custom workflows are **not deleted** by scene-property maintenance.
*   During reorder, foreign keys stay anchored to the RT-managed item directly above them instead of being dumped into a generic end block.

> [!NOTE]
> Use [Scene Properties (Core + Advanced)](YAML-Frontmatter) for the full schema and examples.

## Chronologue Mode Settings

Configure the time-based visualization of your story.

*   **Chronologue duration arc cap**: Determines the maximum duration used for scaling the duration arcs. Can be `Auto` or a specific timeframe.
*   **Discontinuity gap threshold**: Controls the sensitivity of the Shift sub-mode. When the gap between scenes exceeds this threshold, an infinity symbol appears.

> [!NOTE]
> Read more in [Chronologue Mode](Chronologue-Mode).

<a name="point-of-view"></a>
## Point Of View

Control how narrative perspective is visualized.

*   **Global POV**: Sets a default POV mode for the entire project.
*   **Scene level YAML overrides**: Override the global default on a per-scene basis using the `POV` YAML key.

> [!NOTE]
> See [POV Keywords](YAML-Frontmatter#pov-keywords).

## Planetary Time

Configure custom calendars for sci-fi and fantasy worlds.

*   **Enable planetary time**: Activates planetary time conversion features.
*   **Active profile**: Selects which custom calendar profile is currently active.
*   **Profiles**: Create and edit profiles with day length, year length, epoch offsets, and custom month/day names.

> [!NOTE]
> See [Planetary Calendar](Chronologue-Mode#alt-sub-mode).

## Backdrop And Micro-backdrops

Configure the Chronologue backdrop ring and micro-backdrop rings.

*   **Show backdrop ring**: Display the backdrop ring in Chronologue mode.
*   **Micro backdrops**: Create thin ring segments with a title, color, and date range for eras, seasons, or milestones without creating full backdrop note files.

> [!NOTE]
> See [Backdrop](Chronologue-Mode#backdrop-notes-and-micro-backdrop-rings).

<a name="progress-stage-colors"></a>
## Progress Stage Colors

*   **Progress stage colors**: Customize the colors used for the progress stages (`Zero`, `Author`, `House`, `Press`).

## Subplot Ring Colors

*   **Subplot ring colors**: Customize the 16-color palette used for subplot rings.
