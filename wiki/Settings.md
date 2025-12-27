Access via Obsidian **Settings → Community Plugins → Radial Timeline**.

Below is the **current settings order** as implemented in `src/settings/SettingsTab.ts`.

### Source path
*   **Source path**: Root folder for your manuscript scene files (e.g., `Book 1`). Leave blank to scan the entire vault.
*   **Show source path as title**: When on, uses the source folder name as the work title; when off shows “Work in Progress”.

### Publication and progress
*   **Target completion date**: Optional target (YYYY-MM-DD). Marker appears on the outer ring.
*   **Zero draft mode**: Intercepts clicks on scenes with `Publish Stage: Zero` + `Status: Complete` so you can capture `Pending Edits` without opening the note.
*   **Show completion estimate**: Toggles the predicted completion tick on the timeline (based on your writing pace).

### Point of view
*   **Global POV**: Default POV mode applied across scenes; scene-level `POV:` overrides it.
*   **Scene level YAML overrides**: Supported `POV:` values and multi-carrier shorthand.

### Chronologue mode settings
*   **Chronologue duration arc cap**: Choose a max duration for scaling duration arcs (or auto).
*   **Discontinuity gap threshold**: Controls when the ∞ symbol appears in Shift mode (auto default is 3× median gap; you can override with values like “4 days”, “1 week”, “30 minutes”).

### Acts
*   **Act count**: Minimum 3. Applies to Narrative/Subplot/Gossamer layouts and the `Act:` values used in Scene and Beat YAML.
*   **Act labels (optional)**: Comma-separated labels (extra labels ignored; missing/empty entries fall back to defaults).
*   **Show act labels**: Number-only act markers when off (your “numbering toggle”).

### Story beats system
*   **Story beats system**: Save The Cat, Hero’s Journey, Story Grid, or **Custom**.
*   **Custom story beat system** (Custom only): Name your system and edit the beat list. Beats can be drag-reordered, renamed, deleted, and assigned to an act.
*   **Create story beat template notes**: Generates beat note templates in your source path.

### Scene YAML templates & remapping
*   **Custom Metadata Mapping**: Map your vault’s frontmatter keys to Radial Timeline system keys (useful for pre-existing notes / legacy YAML).
*   **Advanced YAML editor**: Toggle the Advanced template editor to add/reorder optional YAML keys while keeping required base keys locked.

See also: [[Advanced-YAML]] and [[YAML-Frontmatter]].

### Planetary Time
*   **Enable planetary time**: Turns on Planetary Time features.
*   **Active profile**: Select which custom calendar to use.
*   **Profiles**: Create/manage calendars (hours/day, days/week, days/year, epoch offset + labels, optional month/weekday names).

### AI LLM for scene analysis
*   **Enable AI LLM features**: Shows/hides AI commands and AI hover visuals (metadata stays untouched when off).
*   **AI prompt role & context template**: Manage templates used for prompt generation (Scene analysis + Gossamer).
*   **Model**: Pick a curated model (Anthropic/Gemini/OpenAI) or a Local/OpenAI-compatible endpoint.
*   **API logging**: Writes request/response logs into your AI output folder (see Advanced).

### Advanced
*   **AI output folder**: Where AI logs and generated files (including manuscripts) are saved (default `AI`).
*   **Auto-expand clipped scene titles**
*   **Timeline readability scale**
*   **Metadata refresh debounce (ms)**
*   **Reset subplot color precedence**

### Visual customization
*   **Publishing stage colors**
*   **Subplot ring colors** (16 ring palette)
