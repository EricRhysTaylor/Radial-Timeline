# Settings Reference

Access via Obsidian **Settings → Community Plugins → Radial Timeline**.

This page serves as a comprehensive reference for all plugin settings.

<a name="general"></a>
### Source path
*   **Source path**: The root folder in your vault containing your manuscript scene files (e.g., `Book 1`). Leave blank to scan the entire vault.
*   **Show source path as title**: When enabled, the timeline uses the source folder name as the central title. When disabled, it displays "Work in Progress".

<a name="publication"></a>
### Publication and progress
Manage your project's milestones and status tracking.
*   **Target completion date**: Set an optional target date (YYYY-MM-DD). A marker will appear on the outer ring of the timeline.
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

<a name="pov"></a>
### Point of view
Control how narrative perspective is visualized.
*   **Global POV**: Sets a default Point of View mode (e.g., First Person, Third Person) for the entire project.
*   **Scene level YAML overrides**: You can override the global default on a per-scene basis using the `POV` YAML key.

> [!NOTE]
> See [[Advanced-YAML#point-of-view]] for configuration details and supported keywords.

<a name="chronologue"></a>
### Chronologue mode settings
Configure the time-based visualization of your story.
*   **Chronologue duration arc cap**: Determines the maximum duration used for scaling the "duration arcs" (outer ring segments). Can be set to "Auto" or specific timeframes.
*   **Discontinuity gap threshold**: Controls the sensitivity of the Shift Mode (Time gaps). When the gap between scenes exceeds this threshold, an ∞ symbol appears. Default is auto-calculated (3× median gap).

> [!NOTE]
> Read more about [[Chronologue-Mode]].

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
*   **Create story beat template notes**: A utility button to generate empty beat notes in your source folder based on the selected system.

> [!NOTE]
> Learn more about using beats in [[Gossamer-Mode]].

<a name="yaml-templates"></a>
### Scene YAML templates & remapping
Manage how Radial Timeline reads and writes metadata.
*   **Custom Metadata Mapping**: Map existing frontmatter keys in your vault (e.g., `story_date`) to the system keys (e.g., `When`) without changing your files.
*   **Advanced YAML editor**: Enable this to customize the "Advanced" scene template. You can add, remove, or reorder optional fields while keeping the required system keys intact.

> [!NOTE]
> *   For template customization: [[Advanced-YAML]]
> *   For a full list of keys: [[YAML-Frontmatter]]

<a name="planetary-time"></a>
### Planetary Time
Configure custom calendars for sci-fi and fantasy worlds.
*   **Enable planetary time**: Activates the planetary time conversion features.
*   **Active profile**: Selects which custom calendar profile is currently active.
*   **Profiles**: Create and edit profiles. define day length, year length, epoch offsets, and custom month/day names.

> [!NOTE]
> See [[Chronologue-Mode#planetary-time]] for usage details.

<a name="ai"></a>
### AI LLM for scene analysis
Configure the AI assistant for narrative analysis.
*   **Enable AI LLM features**: Toggles AI commands and visual indicators.
*   **AI prompt role & context template**: Customize the system prompt and context sent to the AI.
*   **Show previous and next scene analysis**: When enabled, scene hover metadata includes the AI pulse for neighboring scenes. Disable for a more compact view.
*   **Model**: Select your preferred LLM (Anthropic Claude, Google Gemini, OpenAI GPT, or Local/Ollama). Models marked "Latest" auto-update to the newest version.
*   **API keys**: Enter your API key for the selected provider (Anthropic, Gemini, or OpenAI).

**Local LLM settings** (visible when Local/Ollama is selected):
*   **Local LLM Base URL**: The API endpoint. For Ollama, use `http://localhost:11434/v1`. For LM Studio, use `http://localhost:1234/v1`.
*   **Model ID**: The exact model name your server expects (e.g., "llama3", "mistral-7b").
*   **Custom Instructions**: Additional instructions added to the start of the prompt for fine-tuning local model behavior.
*   **Bypass scene hover metadata yaml writes**: When enabled, local LLM analysis skips writing to the scene note and saves results in the RAW AI log instead. Recommended for local models.
*   **API Key (Optional)**: Required by some servers; usually ignored for local tools like Ollama.

*   **Log AI interactions to file**: When enabled, saves detailed JSON logs of every AI request and response to the AI output folder.

> [!NOTE]
> Learn how to interpret the analysis in [[AI-Analysis]].

<a name="advanced"></a>
### Advanced
Technical configuration and file handling.
*   **AI output folder**: The folder where AI logs, manuscripts, and analysis files are saved. Default is `AI`.
*   **Auto-expand clipped scene titles**: Automatically expands truncated text in the radial view on hover.
*   **Timeline readability scale**: Adjusts the global font size of the timeline (Normal or Large).
*   **Show backdrop ring**: Display the backdrop ring in Chronologue mode. When disabled, the ring space is reclaimed for subplot rings.
*   **Metadata refresh debounce**: Technical setting to adjust how often the timeline refreshes while typing (default 1000ms).
*   **Reset subplot color precedence**: Clears manually assigned dominant subplot colors.

<a name="colors"></a>
### Visual customization
*   **Publishing stage colors**: Customize the colors used for the publishing stages (Zero Draft, Author's Draft, House Edit, Press Ready).
*   **Subplot ring colors**: Customize the 16-color palette used for subplots.

<a name="professional"></a>
### Pro · Signature ✦
Professional tools for serious writers.

The Signature tier unlocks advanced capabilities for professional workflows. During the Open Beta, all Pro features are available free to early adopters.

**Pro features include:**
*   **Runtime Estimation** — Screen time, audiobook duration, and manuscript length analysis with custom profiles
*   **Pro Exports** — Manuscript generation via Pandoc for screenplay, podcast, and novel formats
*   **Chronologue Runtime Mode** — Blue wireframe sub-mode showing scene runtime duration arcs

**Export & Pandoc settings:**
*   **Pandoc binary path**: Optional custom path to your pandoc executable. If blank, system PATH is used.
*   **Enable fallback Pandoc**: Attempt a secondary bundled/portable pandoc if the primary is missing.
*   **Fallback Pandoc path**: Path to a portable/bundled pandoc binary.
*   **Pandoc templates**: Custom LaTeX templates for Screenplay, Podcast Script, and Novel Manuscript formats.

> [!NOTE]
> See [[Signature]] for full Pro feature documentation.

---

## Hardware Recommendations

The radial timeline is designed for high pixel density displays (around 200 ppi or higher) for optimal visual quality.
*   All Apple Retina displays — 2x pixel density.
*   Recommend Windows systems with 4k displays or higher. (Tested on 1080p 2550x1440)
*   Tablets.

If you're experiencing visual quality issues on Windows, please check your display scaling settings.
