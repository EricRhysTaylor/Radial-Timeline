# Settings Reference

Access via Obsidian **Settings → Community Plugins → Radial Timeline**.

This page serves as a comprehensive reference for all plugin settings.

## Settings Tabs

The settings interface is organized into four tabs:

*   **Pro** — Professional features including runtime estimation and manuscript exports
*   **Inquiry** — Corpus scanning, prompt libraries, and Inquiry automation
*   **Core** — Essential settings for timeline configuration, metadata, and workflow
*   **Social Media** — Author Progress Report (APR) for sharing your writing journey

Use the tab bar at the top of the settings panel to switch between sections.

## Pro Tab

<a name="professional"></a>
### Professional · Signature ✦
Professional tools for serious writers.

The Signature tier unlocks advanced capabilities for professional workflows. During the Open Beta, all Pro features are available free to early adopters.

**Pro features include:**
*   **Runtime Estimation** — Screen time, audiobook duration, and manuscript length analysis with custom profiles
*   **Pro Exports** — Manuscript generation via Pandoc for screenplay, podcast, and novel formats
*   **Chronologue Runtime Mode** — Blue wireframe sub-mode showing scene runtime duration arcs
*   **Campaign Manager** — Manage multiple Author Progress Report campaigns with independent refresh schedules and Teaser Reveal settings
*   **Teaser Reveal** — Progressive reveal system that automatically shows more timeline detail as your book progresses (Pro feature within Campaign Manager)

**License & access:**
*   **Open Beta**: Pro is active by default during the beta period.
*   **License key**: When paid licensing launches, enter your key here to unlock Pro features.

**Export & Pandoc settings:**
*   **Pandoc binary path**: Optional custom path to your pandoc executable. If blank, system PATH is used.
*   **Enable fallback Pandoc**: Attempt a secondary bundled/portable pandoc if the primary is missing.
*   **Fallback Pandoc path**: Path to a portable/bundled pandoc binary.
*   **Pandoc templates**: Custom LaTeX templates for Screenplay, Podcast Script, and Novel Manuscript formats.

> [!NOTE]
> Campaign Manager, Teaser Reveal, and Pandoc Manuscript Export (including templates) are undergoing final testing and will be available soon. During the Open Beta, all Pro features are free to early adopters.

> [!NOTE]
> See [[Signature]] for full Pro feature documentation.

<a name="runtime-estimation"></a>
### Runtime estimation ✦ Pro
Calculate screen time, audiobook duration, and manuscript length estimates.

*   **Enable runtime estimation**: Activates runtime calculations for scenes and the Chronologue Runtime Mode.
*   **Default runtime profile**: The profile used when no per-scene override is set.
*   **Edit profile**: Manage multiple profiles with different settings for various project types.
*   **Profile label**: Display name shown in pickers and the runtime modal.
*   **Content type**: Choose between Novel/Audiobook (unified narration pace) or Screenplay (separate dialogue/action pacing).

**Screenplay mode settings:**
*   **Dialogue words per minute**: Reading speed for quoted dialogue (default 160).
*   **Action words per minute**: Reading speed for scene descriptions (default 100).
*   **Parenthetical timings**: Seconds added for screenplay directives—(beat), (pause), (long pause), (a moment), (silence).

**Novel/Audiobook mode settings:**
*   **Narration words per minute**: Reading pace for all content (default 150).

**Session planning (optional):**
*   **Drafting words per minute**: Your writing speed for completion projections.
*   **Daily minutes available**: For "45 min/day" style time estimates.

*   **Runtime arc cap default**: Controls Chronologue Runtime Mode arc scaling. Lower values emphasize shorter scenes.

> [!NOTE]
> See [[Signature]] for full Pro feature documentation and [[Chronologue-Mode#runtime-mode-pro]] for the Runtime Mode visualization.

## Inquiry Tab

<a name="inquiry"></a>
### Inquiry
Configure how Inquiry scans, stores, and annotates briefs.

**Artifacts & auto-save:**
*   **Artifact folder**: Where Inquiry briefs are stored when auto-save is enabled (default `Radial Timeline/Inquiry/Artifacts`).
*   **Embed JSON payload in Artifacts**: Includes the validated Inquiry JSON payload in the Artifact file.
*   **Auto-save Inquiry briefs**: Save a brief automatically after each successful Inquiry run.

**Action notes:**
*   **Write Inquiry action notes to scenes**: Append Inquiry action notes to the target YAML field on hit scenes.
*   **Action notes target YAML field**: Frontmatter field to receive Inquiry action notes (default `Revision`).

**Session cache:**
*   **Enable session cache**: Stores recent Inquiry runs for fast reloads.
*   **Max cached sessions**: Cap for stored Inquiry sessions (1–100).

<a name="inquiry-sources"></a>
#### Inquiry sources
*   **Inquiry class scope**: Limit which YAML classes Inquiry can scan (use `/` to allow all classes).
*   **Inquiry scan folders**: Limit scans to specific vault paths; supports wildcards and `/` for vault root.
*   **Class enablement & scope**: Toggle which classes are scanned and whether they apply to Book and/or Saga scopes.

<a name="inquiry-prompts"></a>
#### Inquiry prompts
*   **Default prompts**: Built-in prompt slots for Setup, Pressure, and Payoff zones.
*   **Custom questions**: Add and reorder custom prompts per zone; Pro unlocks extra slots.

<a name="inquiry-corpus"></a>
#### Corpus (CC)
*   **Thresholds**: Tune word-count tiers (Empty, Sketchy, Medium, Substantive) used in Corpus cards.
*   **Highlight completed docs with low substance**: Flags completed notes that remain in Empty or Sketchy tiers.

## Core Tab

<a name="general"></a>
### General
*   **Source path**: The root folder in your vault containing your manuscript scene files (e.g., `Book 1`). Leave blank to scan the entire vault.
*   **Show source path as title**: When enabled, the timeline uses the source folder name as the central title. When disabled, it displays "Work in Progress".
*   **AI output folder**: Storage location for AI logs and analysis files (default `Radial Timeline/AI Logs`).
*   **Manuscript output folder**: Destination for manuscript exports (default `Radial Timeline/Manuscript`).
*   **Outline output folder**: Destination for outline exports (default `Radial Timeline/Outline`).

<a name="pov"></a>
### Point of view
Control how narrative perspective is visualized.
*   **Global POV**: Sets a default Point of View mode (e.g., First Person, Third Person) for the entire project.
*   **Scene level YAML overrides**: You can override the global default on a per-scene basis using the `POV` YAML key.

> [!NOTE]
> See [[Advanced-YAML#point-of-view]] for configuration details and supported keywords.

<a name="acts"></a>
### Acts
Configure the high-level structure of your narrative ring.
*   **Act count**: Sets the number of acts (Minimum 3). This divides the Narrative, Subplot, and Gossamer timeline rings.
*   **Act labels**: (Optional) Define custom names for your acts (e.g., "Part 1, Part 2, Part 3").
*   **Show act labels**: Toggle to hide labels and show only act numbers.

> [!NOTE]
> See [[Narrative-Mode]] for details on the act structure.

<a name="story-beats"></a>
### Story beats system
Configure the structural pacing guide for your story.
*   **Story beats system**: Select a preset structure (**Save The Cat**, **Hero's Journey**, **Story Grid**) or choose **Custom**.
*   **Custom story beat system editor**: (Visible when "Custom" is selected) Define your own beat names and assign them to acts. Drag to reorder.
*   **Create story beat template notes**: Generate empty beat notes in your source folder based on the selected system.

> [!NOTE]
> Learn more about using beats in [[Gossamer-Mode]].

<a name="yaml-templates"></a>
### Scene YAML templates & remapping
Manage how Radial Timeline reads and writes metadata.
*   **Custom Metadata Mapping**: Map existing frontmatter keys in your vault (e.g., `story_date`) to the system keys (e.g., `When`) without changing your files.
*   **Advanced YAML editor**: Enable this to customize the advanced scene template, add optional fields, and control hover metadata icons/order.

> [!NOTE]
> *   For template customization: [[Advanced-YAML]]
> *   For a full list of keys: [[YAML-Frontmatter]]

<a name="publication"></a>
### Publication and progress
Manage your project's milestones and status tracking.

**Stage Target Dates:**
*   **Zero target date**: Target completion date for the Zero Draft stage (YYYY-MM-DD). A marker appears on the timeline when set.
*   **Author target date**: Target completion date for the Author's Draft stage. Must be after the Zero target date.
*   **House target date**: Target completion date for the House Edit stage. Must be after the Author target date.
*   **Press target date**: Target completion date for the Press Ready stage. Must be after the House target date.

Target dates are validated to ensure proper stage ordering. Overdue dates are highlighted in red. Each stage has its own color-coded marker on the timeline.

<a name="zero-draft-mode"></a>
*   **Zero draft mode**: A focused mode for reviewing. Intercepts clicks on scenes with `Publish Stage: Zero` and `Status: Complete` to open a "Pending Edits" modal instead of the full note.
*   **Show completion estimate**: Toggles the predicted completion tick mark on the timeline.
*   **Completion estimate window (days)**: Rolling window (default 30, min 14, max 90) used to measure pace. Pace = completions in the active publish stage within the last N days ÷ N (scenes/day).

**How the completion estimate works**
* Scope: Only the active publish stage (highest stage with any incomplete scenes). Other stages do not affect pace or remaining.
* Total scenes for the active stage: `max(unique stage scenes, highest scene number seen anywhere)`. This lets an early high-numbered scene (e.g., “Scene 70”) set a floor even if few notes exist.
* Remaining: Total − Completed (stage-scoped, deduped by path, clamped to ≥0).
* Date: Requires at least 2 completed scenes in the window for a confident pace. With fewer, the geometry stays but the label shows “?”.
* Staleness colors: fresh (≤7d, normal), warn (8–10d, orange), late (11–20d, red), stalled (>20d or no pace/insufficient samples, red “?”). Geometry is frozen until new completions update the pace.

> [!NOTE]
> Learn more about workflows in [[Core-Workflows]].

<a name="chronologue"></a>
### Chronologue mode settings
Configure the time-based visualization of your story.
*   **Chronologue duration arc cap**: Determines the maximum duration used for scaling the "duration arcs" (outer ring segments). Can be set to "Auto" or specific timeframes.
*   **Discontinuity gap threshold**: Controls the sensitivity of the Shift Mode (Time gaps). When the gap between scenes exceeds this threshold, an ∞ symbol appears. Default is auto-calculated (3× median gap).

> [!NOTE]
> Read more about [[Chronologue-Mode]].

<a name="backdrop"></a>
### Backdrop
Configure the Chronologue backdrop ring and microrings.
*   **Show backdrop ring**: Display the backdrop ring in Chronologue mode. When disabled, the ring space is reclaimed for subplot rings.
*   **Micro backdrops**: Create microrings with titles, colors, and date ranges to highlight context or epochs.

<a name="planetary-time"></a>
### Planetary Time
Configure custom calendars for sci-fi and fantasy worlds.
*   **Enable planetary time**: Activates the planetary time conversion features.
*   **Active profile**: Selects which custom calendar profile is currently active (includes a Mars template).
*   **Profiles**: Create and edit profiles. Define day length, year length, epoch offsets, and custom month/day names.

> [!NOTE]
> See [[Chronologue-Mode#planetary-time]] for usage details.

<a name="ai"></a>
### AI LLM for scene analysis
Configure the AI assistant for narrative analysis.
*   **Enable AI LLM features**: Toggles AI commands and visual indicators.
*   **AI prompt role & context template**: Customize the system prompt and context sent to the AI.
*   **Show previous and next scene analysis**: When enabled, scene hover metadata includes the AI pulse for neighboring scenes. Disable for a more compact view.
*   **Model**: Select your preferred LLM (Anthropic Claude, Google Gemini, OpenAI GPT, or Local/OpenAI-compatible).
*   **API keys**: Enter your API key for the selected provider (Anthropic, Gemini, or OpenAI).

**Local LLM settings** (visible when Local/OpenAI-compatible is selected):
*   **Local LLM Base URL**: The API endpoint. For Ollama, use `http://localhost:11434/v1`. For LM Studio, use `http://localhost:1234/v1`.
*   **Model ID**: The exact model name your server expects (e.g., "llama3", "mistral-7b").
*   **Custom Instructions**: Additional instructions added to the start of the prompt for fine-tuning local model behavior.
*   **Bypass scene hover metadata yaml writes**: When enabled, local LLM analysis skips writing to the scene note and saves results in the RAW AI log instead.
*   **API Key (Optional)**: Required by some servers; usually ignored for local tools like Ollama.

*   **Log AI interactions to file**: When enabled, saves detailed JSON logs for each AI request in the AI output folder.

> [!NOTE]
> Learn how to interpret the analysis in [[AI-Analysis]].

<a name="configuration"></a>
### Configuration
Technical configuration and file handling.
*   **Auto-expand clipped scene titles**: Automatically expands truncated text in the radial view on hover.
*   **Timeline readability scale**: Adjusts the global font size of the timeline (Normal or Large).
*   **Metadata refresh debounce**: Adjust how often the timeline refreshes while typing (default 10000ms).
*   **Reset subplot color precedence**: Clears manually assigned dominant subplot colors.

<a name="publishing-stage-colors"></a>
### Publishing stage colors
*   **Publishing stage colors**: Customize the colors used for the publishing stages (Zero Draft, Author's Draft, House Edit, Press Ready).

<a name="subplot-ring-colors"></a>
### Subplot ring colors
*   **Subplot ring colors**: Customize the 16-color palette used for subplot rings.

## Social Media Tab

<a name="social-media"></a>
### Social Media · Author Progress Report
Generate shareable, spoiler-safe progress graphics for social media, crowdfunding campaigns, and newsletters.

> [!NOTE]
> For detailed information about how APR works, see [[Author-Progress-Report]].

**Preview & Size:**
*   **Preview Size**: Choose Thumbnail (100×100px), Small (150×150px), Medium (300×300px), or Large (450×450px). This also sets the default export size and updates the preview in real time.

<a name="social-media-styling"></a>
#### Styling
*   **Transparent Mode (Recommended)**: No background fill—adapts to any page or app. Ideal for websites, blogs, and platforms that preserve SVG transparency.
*   **Background Color**: Bakes in a solid background. Use when transparency isn't reliable: email newsletters, Kickstarter, PDF exports, or platforms that rasterize SVGs.
*   **Theme Contrast**: Choose Light Strokes, Dark Strokes, or No Strokes to match your background.
*   **Link URL**: Where the graphic should link to (e.g., your website, Kickstarter, or shop).

<a name="social-media-theme"></a>
#### Theme
*   **Theme palette**: Applies curated colors across Title, Author, % Symbol, % Number, and RT Badge based on the Title color.
*   **Book Title**: Appears on your public report graphic.
*   **Author Name**: Appears alongside the title (e.g., "Title · Author").
*   **Typography & color overrides**: Fine-tune fonts, weights, and colors for title, author, percent number/symbol, and RT badge.

<a name="social-media-publishing"></a>
#### Publishing & Automation
*   **Update Frequency**: How often to auto-update the live embed file. Options: Manual Only, Daily, Weekly, or Monthly. "Manual" requires clicking the update button in the Author Progress Report modal.
*   **Refresh Alert Threshold**: Days before showing a refresh reminder in the timeline view (1-90 days, default 30). Only shown when Update Frequency is set to Manual.
*   **Embed File Path**: Location for the "Live Embed" SVG file. Must end with `.svg`. Default: `Radial Timeline/Social/progress.svg`.

**Campaign Manager** ✦ Pro:
Create multiple APR configurations for different platforms (Kickstarter, Patreon, Newsletter, Website) with independent refresh schedules.

*   **Quick Start Templates**: One-click setup for common platforms:
    *   Kickstarter (7-day refresh reminders)
    *   Patreon (14-day refresh reminders)
    *   Newsletter (14-day refresh reminders)
    *   Website (30-day refresh reminders)

*   **Per-Campaign Settings:**
    *   **Update Frequency**: Manual, Daily, Weekly, or Monthly auto-updates
    *   **Refresh Alert Threshold**: Days before showing refresh reminder (1-90 days)
    *   **Embed File Path**: Custom SVG path for each campaign
    *   **Export Size**: Thumbnail, Small, Medium, or Large
    *   **Manual Reveal Options**: Show/hide Subplots, Acts, Status, and Progress Percent (only when Teaser Reveal is disabled)

*   **Teaser Reveal** ✦ Pro:
    Automatically reveal more detail as your book progresses. Creates anticipation as your audience sees more of your timeline structure.

    *   **Enable Teaser Reveal**: Toggle progressive reveal on/off
    *   **Reveal Schedule**: Choose a preset or customize:
        *   **Slow**: Reveals at 15%, 40%, and 70% progress
        *   **Standard**: Reveals at 10%, 30%, and 60% progress (default)
        *   **Fast**: Reveals at 5%, 20%, and 45% progress
        *   **Custom**: Set your own thresholds (1-99%)
    
    *   **Reveal Stages:**
        *   **Teaser** (0%): Progress ring only
        *   **Scenes** (threshold 1): Scene cells appear (no colors)
        *   **Colors** (threshold 2): Scene cells with status colors
        *   **Full** (threshold 3): Complete timeline with subplots and acts
    
    *   **Stage Skipping**: Click on middle stages (Scenes, Colors) in the preview to skip them entirely, jumping directly to the next stage.

> [!NOTE]
> Campaign Manager and Teaser Reveal are undergoing final testing and will be available soon. During the Open Beta, all Pro features are free to early adopters.
