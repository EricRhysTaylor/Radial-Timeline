### Minimal Scene (Required Fields)

```yaml
Class: Scene              # Type: Scene or Beat
Act: 1                    # Which act (1-3)
When:                     # Story chronology date (YYYY-MM-DD 12:34pm)
Duration:                 # How long the scene lasts (e.g., "45 seconds", "45s", "45sec", "2 hours", "3days")
Synopsis:                 # Brief description of what happens in this scene
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
  - "[[Protagonist]]"       #Obsidian wikilink format to click through to a note
  - "Mentor"
  - Child One                #No link
Place:
  - "[[Castle]]"            #Obsidian wikilink
  - "Forest"
  - Planet Nine
```

**POV keywords**:
*   `pov: first` — first listed character gets a `¹` marker.
*   `pov: second` / `pov: you` — inserts `You²` ahead of the cast.
*   `pov: omni` — shows `Omni³` to signal an omniscient narrator.
*   `pov: objective` — shows `Narrator°` for camera-eye scenes.
*   `pov: two`, `pov: 4`, `pov: count`, `pov: all` — highlight multiple carriers.

### Standard Beat

```yaml
Class: Beat                   # Formerly Plot, Deprecated
Act: 1
When:                         # Optional: Story timeline date for chronological positioning (YYYY-MM-DD HH:MM)
Description: The first impression of your story. A snapshot before the journey begins.
Beat Model: Save The Cat
Range: 0-20
Gossamer1: 12                 # First run (oldest) - Up to 30 evaluation passes
Gossamer1 Justification: 
Gossamer2: 21                 # Second run (most recent in this example)
Gossamer2 Justification: 
```

### Backdrop

```yaml
Class: Backdrop                   # Used for special context events that move the plot. Appears under All Scenes outer ring in Chronologue mode.
When:                             # Start Date time (YYYY-MM-DD HH:MM)
End:                              # End Date time (YYYY-MM-DD HH:MM)
Synopsis: What this special backdrop is and how it relates to the story.

```

### Advanced Scene YAML

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
  - "[[Character 1]]"
Place:
  - "[[Earth]]"
Status: Todo
Publish Stage: Zero
Due:
Pending Edits:
Iterations:                           # Edit iteration count (deprecated: was "Revision")
Type:                                 #Story Grid: Scene type (Inciting Incident, Progressive Complication, Crisis, Climax, Resolution)
Shift:                                #Story Grid: Value shift (e.g. Life to Death, Hope to Despair)
Questions:                            #Analysis Block
Reader Emotion:
Internal: How do the characters change?
Total Time:
Words:                                #Statistics
Runtime:                              # Technical runtime (screenplay time / reading time, e.g., "2:30", "45s")
Pulse Update: No
Synopsis Update:
```

**Tip for Advanced Methodologies (e.g., Dramatica):**
You can customize this template in **Settings > Scene YAML templates & remapping** to include specific fields for your system. For example, a Dramatica user might add:
```yaml
dramatica:
  MC: 1
  OS: 2
```


### Custom Metadata Mapping

If your vault already uses different frontmatter keys for scene metadata, you can map them to Radial Timeline's system keys in **Settings → Custom Metadata Mapping**.

Example: If you use `Timeline: 2024-01-01` instead of `When: 2024-01-01`, create a mapping from `Timeline` to `When`.
