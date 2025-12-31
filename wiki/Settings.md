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
*   **Show completion estimate**: Toggles the predicted completion tick mark on the timeline, calculated based on your recent writing pace.

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
*   **Model**: Select your preferred LLM (Anthropic Claude, Google Gemini, OpenAI GPT, or Local/Ollama).
*   **API logging**: When enabled, saves detailed JSON logs of every AI request and response to the AI output folder.

> [!NOTE]
> Learn how to interpret the analysis in [[AI-Analysis]].

<a name="advanced"></a>
### Advanced
Technical configuration and file handling.
*   **AI output folder**: The folder where AI logs, manuscripts, and analysis files are saved. Default is `AI`.
*   **Auto-expand clipped scene titles**: Automatically expands truncated text in the radial view on hover.
*   **Timeline readability scale**: Adjusts the global font size of the timeline (Normal or Large).
*   **Metadata refresh debounce**: Technical setting to adjust how often the timeline refreshes while typing (default 1000ms).
*   **Reset subplot color precedence**: Clears manually assigned dominant subplot colors.

<a name="colors"></a>
### Visual customization
*   **Publishing stage colors**: Customize the colors used for the publishing stages (Zero Draft, Author's Draft, House Edit, Press Ready).
*   **Subplot ring colors**: Customize the 16-color palette used for subplots.

---

## Hardware Recommendations

The radial timeline is designed for high pixel density displays (around 200 ppi or higher) for optimal visual quality.
*   All Apple Retina displays — 2x pixel density.
*   Recommend Windows systems with 4k displays or higher. (Tested on 1080p 2550x1440)
*   Tablets.

If you're experiencing visual quality issues on Windows, please check your display scaling settings.
