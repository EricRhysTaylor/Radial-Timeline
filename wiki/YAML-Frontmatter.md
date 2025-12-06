### Minimal Scene (Required Fields)

```yaml
---
Class: Scene              # Type: Scene or Beat
Act: 1                    # Which act (1-3)
When:                     # Story chronology date (YYYY-MM-DD 12:34pm)
Duration:                 # How long the scene lasts (e.g., "45 seconds", "45s", "45sec", "2 hours", "3days")
Synopsis:                 # Brief description of what happens in this scene
Status: Todo              # Scene status (Todo/Working/Complete)
Subplot: Main Plot        # Single subplot (or use array format below for multiple)
Character:                # Characters in the scene (use array format below for multiple)
POV:                      # blank, first, you, third, omni, narrator, two, all, count
Place:                    # Location where scene takes place (use array format for multiple)
Due:                      # Target completion date (YYYY-MM-DD)
Publish Stage: Zero       # Revision stage (Zero/Author/House/Press)
Revision:                 # Revision count (leave blank until stage > zero)
Pending Edits:            # Notes for future revisions (especially for zero draft mode)
Words:                    # Scene word count
Pulse Update:             # AI-generated scene pulse analysis flag
---
```

**For multiple subplots or characters, use YAML list format:**
```yaml
Subplot:
  - Main Plot
  - Romance Arc
Character:
  - "[[Protagonist]]"       #Obsidian wikilink format to click through to a note
  - "Mentor"
  - Child One                #No link
Place:
  - "[[Castle]]"            #wikilink
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
---
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
---
```
