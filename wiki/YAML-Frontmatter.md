# Scene YAML (Basic + Advanced)

This page covers scene metadata (basic and advanced), beat notes, and backdrop notes. Radial Timeline reads metadata from **Obsidian properties** (YAML frontmatter) at the top of each note. If you prefer to keep things light, you can start with only the minimal fields and fill the rest later.

## Minimal Scene (Required Fields)

```yaml
Class: Scene              # Type: Scene
Act: 1                    # Which act (1-3)
When:                     # Story chronology date (YYYY-MM-DD 12:34pm)
Duration:                 # How long the scene lasts (e.g., "45 seconds", "45s", "45sec", "2 hours", "3days")
Synopsis:                 # Concise present-tense snapshot for hovers/outlines (1-3 sentences)
Summary:                  # Longform scene expansion (events, emotional turns, subtext, outcome)
Subplot: Main Plot        # Single subplot (or use array format below for multiple)
Character:                # Characters in the scene (use array format below for multiple)
POV:                      # blank, first, you, third, omni, narrator, two, all, count
Status: Todo              # Scene status (Todo/Working/Complete)
Publish Stage: Zero       # Publication stage (Zero/Author/House/Press)
Due:                      # Target completion date (YYYY-MM-DD). When setting Scene to Complete, change this to that day's date for better novel completion estimate
Pending Edits:            # Notes for next revision (especially for zero draft mode)
Pulse Update:             # AI-generated scene pulse analysis flag
```

**For multiple subplots or characters, use YAML list format:**
```yaml
Subplot:
  - Main Plot
  - Subplot 1
Character:
  - "Protagonist"
  - "Mentor"
  - "Child One"
Place:
  - "Castle"
  - "Forest"
  - "Planet Nine"
```

Obsidian links are supported in properties. Use the double-bracket wikilink format inside quotes if you want a field to link to a note.

## POV Keywords

*   `pov: first` — first listed character gets a `¹` marker.
*   `pov: second` / `pov: you` — inserts `You²` ahead of the cast.
*   `pov: omni` — shows `Omni³` to signal an omniscient narrator.
*   `pov: objective` — shows `Narrator°` for camera-eye scenes.
*   `pov: two`, `pov: 4`, `pov: count`, `pov: all` — highlight multiple carriers.

You can control how POV is displayed in **Settings → Point of view**.

<a name="advanced-scene-template"></a>
## Advanced Scene Set

The Advanced Scene Set adds optional fields for deeper workflows (Story Grid, Dramatica, custom analysis, and more). This set is **customizable**.

```yaml
Class: Scene
Act: 1
When: 2085-01-01 1:30pm
Duration: 6 hours
Synopsis: What happens in a few lines.
Subplot:
  - Subplot 1
  - Subplot 2
Character:
  - "Character 1"
Place:
  - "Earth"
Status: Todo
Publish Stage: Zero
Due:
Pending Edits:
Iteration:                            # Edit iteration count (deprecated: was "Revision")
Type:                                 # Story Grid: Scene type (Inciting Incident, Progressive Complication, Crisis, Climax, Resolution)
Shift:                                # Story Grid: Value shift (e.g. Life to Death, Hope to Despair)
Questions:                            # Analysis Block
Reader Emotion:
Internal: How do the characters change?
Total Time:
Words:                                # Statistics
Runtime:                              # Technical runtime (screenplay time / reading time, e.g., "2:30", "45s")
Pulse Update: No
Summary Update:
```

<a name="advanced-yaml-editor"></a>
### Scene Properties Editor

The Scene properties editor lets you tailor the Advanced Scene Set while keeping required base keys intact. Add, remove, or reorder optional fields to match your workflow.

*   Enable **Settings → Scene sets & remapping → Scene properties editor**.
*   Required base keys stay locked and auto-included in order.
*   Optional keys can be drag-reordered, renamed, deleted, or added.
*   Use the restore icon to revert to the shipped defaults.

## Beat Notes (YAML)

```yaml
Class: Beat                   # Formerly Plot, Deprecated
Act: 1
Purpose: Why this beat exists in the structure (1-2 sentences, avoid retelling scene events).
Beat Model: Save The Cat
Range: 0-20
Gossamer1: 12                 # First run (oldest) - Up to 30 evaluation passes
Gossamer1 Justification:
Gossamer2: 21                 # Second run (most recent in this example)
Gossamer2 Justification:
```

> **Beat semantics**: Beats are structural, not temporal. They do not use the `When` field — ordering comes from Act assignment and filename prefix.

Beat notes have their own **Beat properties editor** in **Settings → Story beats system**. Use it to add custom keys and choose which fields appear in beat hovers. Beat properties are stored per beat system.

## Backdrop Notes (YAML)

```yaml
Class: Backdrop                   # Used for special context events that move the plot. Appears as a dedicated ring in Chronologue mode. See also micro-backdrop rings for lighter-weight context.
When:                             # Start Date time (YYYY-MM-DD HH:MM)
End:                              # End Date time (YYYY-MM-DD HH:MM)
Context: Static world context this backdrop represents (no scene-level unfolding).
```

Backdrop notes can be extended using the **Backdrop properties editor** in Settings.

## YAML Managers in Settings

*   **Scene properties editor**: Customize the Advanced Scene Set (optional fields and hover metadata).
*   **Beat properties editor**: Customize beat note fields and beat hover metadata.
*   **Custom Metadata Mapping**: Map your existing keys to Radial Timeline keys without rewriting your files.

See [[Settings#yaml-templates]] and [[Settings#story-beats]] for configuration details.

## Custom Metadata Mapping

If your vault already uses different frontmatter keys for scene metadata, you can map them to Radial Timeline's system keys in **Settings → Custom Metadata Mapping**.

Example: If you use `Timeline: 2024-01-01` instead of `When: 2024-01-01`, create a mapping from `Timeline` to `When`.

## Backwards Compatibility

The plugin automatically recognizes legacy field names, so you don't need to update existing scene notes when field names change:

| Current Name | Legacy Names (still work) |
|--------------|---------------------------|
| `Iteration:` | `Revision:`, `Iterations:` |
| `Purpose:` | `Description:` |
| `Context:` | `Synopsis:` (Backdrop only) |

Beat notes do not use `When:` — they are ordered structurally by Act and filename prefix.

Existing notes with old field names will continue to work. Only new notes created from sets will use the current field names.
