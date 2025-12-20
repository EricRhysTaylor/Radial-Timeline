Access via Obsidian Settings → Community Plugins → Radial Timeline

### Source path
*   Root folder for scene files (e.g., `Book 1`). Leave blank to scan entire vault.

### Publication and progress
*   **Target completion date**: Optional target (YYYY-MM-DD). Marker appears on outer ring.
*   **Zero draft mode**: Prevents edits to completed zero-draft scenes to keep you moving forward.
    *   **What it does**: When you click a scene marked as `Publish Stage: Zero` and `Status: Complete`, instead of opening the file, a dialog appears.
    *   **Pending Edits**: The dialog lets you capture quick notes or edits into a `Pending Edits` frontmatter field without getting sucked into a full revision.
    *   **Override**: You can click the "Override" button (red) to force open the note if absolutely necessary.

### Metadata and mapping
*   **Enable custom metadata mapping**: Map your own frontmatter keys (e.g., `StoryLine`) to system keys (`Subplot`).
*   **Mappings**: Define multiple key pairs for legacy data support.

### Chronologue mode settings
*   **Chronologue duration arc cap**: Select maximum duration to display on scene duration arcs, or use "auto".
*   **Discontinuity gap threshold**: Controls when the ∞ symbol appears in shift mode. Auto-calculated as 3× the median time gap.

### Gossamer story beats system
*   **Story beats system**: Select story structure model (Save The Cat, Hero's Journey, Story Grid, or Custom).
*   **Create story beat template notes**: Generate template beat notes with YAML frontmatter.

### AI features
*   **AI Provider**: Choose Anthropic, Gemini, OpenAI, or Local/OpenAI Compatible.
*   **Local AI Support**: Connect to local LLMs (like Ollama or LM Studio).
*   **Contextual Prompt**: Customize AI analysis prompts.
*   **API Logging**: Track AI interactions.

### Planetary Time (Experimental)
*   **Enable planetary time**: Toggle to show planetary time features.
*   **Active Profile**: Select which custom calendar to use for conversions.
*   **Profiles**: Create and manage multiple calendar systems (e.g., "Mars", "Fantasy Realm").
    *   **Hours per day**: Length of a local day in Earth hours.
    *   **Days per week**: Number of days in a local week.
    *   **Days per year**: Number of local days in a local year.
    *   **Epoch Offset**: Number of Earth days to shift the start of your calendar (relative to 1970-01-01).
    *   **Month/Weekday Names**: Comma-separated lists of custom names.

### Advanced
*   **Auto-expand clipped scene titles**: Disable to prevent scene title expansion on hover. FYI: May make scene drag-and-drop a bit challenging as the scene will expand thus changing the location of the number square drag hotspot.
*   **Show completion estimate**: Toggle the predicted completion date tick on the timeline (based on your writing pace).
*   **Timeline readability scale**: Choose between normal and large UI elements for high-resolution displays.
*   **Metadata refresh debounce (ms)**: Delay before refreshing timeline after YAML frontmatter changes.

### Visual customization
*   **Publishing stage colors**: Customize colors for Zero, Author, House, Press stages.
*   **Ring colors**: Customize up to 16 subplot ring colors.
