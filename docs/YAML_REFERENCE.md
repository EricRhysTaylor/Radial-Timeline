# YAML Field Reference

Complete guide to frontmatter fields used in Radial Timeline. This YAML must be placed at the front of each scene or beat note before any other text.

## Quick Reference

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `Class` | String | File type: `Scene` or `Beat` |
| `Act` | Number | Story act (1-3) |
| `Status` | String | Workflow: `Todo`, `Working`, or `Complete` |
| `Subplot` | Array | One or more plot threads (default: `Main Plot`) |

### Commonly Used Fields

| Field | Type | Description |
|-------|------|-------------|
| `When` | Date | In-world date (YYYY-MM-DD or ISO format) |
| `Synopsis` | String | Brief description of what happens |
| `Character` | Array | Characters on stage (link to character notes) |
| `Publish Stage` | String | `Zero`, `Author`, `House`, or `Press` |
| `Revision` | Number | Revision count (leave blank until stage > zero) |
| `Due` | Date | Deadline for this scene (YYYY-MM-DD) |

---

## Scene Examples

### Minimal Scene

The bare minimum required to render a scene on the timeline:

```yaml
---
Class: Scene
Act: 1
Status: Todo
Subplot: Main Plot
---
```

### Standard Scene

Typical scene with common metadata:

```yaml
---
Class: Scene
Act: 1
When: 2000-01-31
Synopsis: The protagonist discovers a mysterious artifact.
Subplot:
  - Main Plot
  - Plot 2
Character:
  - "[[Protagonist A]]"
  - "[[Mentor B]]"
Status: Todo
Publish Stage: Zero
Due: 2025-01-31
Book: Book 1 A New Beginning
---
```

### Advanced Scene with AI Beats

Full scene with AI triplet analysis, Story Grid fields, and tracking metadata:

```yaml
---
# Required fields
Class: Scene
Act: 1
When: 2000-01-31
Duration: 0

Synopsis: Explain concisely what happens in this scene.

Subplot:
  - Main Plot
  - Plot 2

Character:
  - "[[protagonist a]]"
  - "[[mentor b]]"

Place:
  - "[[earth]]"

Status: Todo
Publish Stage: Zero
Revision:
Due: 2026-01-31
Pending Edits:

# Story Grid Analysis
Type:     # revelation / turning point / confrontation / decision / setup / payoff / inciting incident / deepening
Shift:    # Polarity change: + / - (or +/- if it flips both ways)
Questions:     # What is the reader wondering?
Reader Emotion:     # curious / shocked / uneasy / hopeful / betrayed / triumphant
Internal:     # How do the character change? (e.g., from trusting → suspicious)

# Optional tracking
Total Time: 0.0     # Writing/production time spent (hours in decimal)
Words: 0
Book: Book 1 A New Beginning
Support Files:

# AI-Generated Beats (triplets)
previousSceneAnalysis:
  - 12 Inciting clue + / Raises stakes for the protagonist. Secondary suspicion grows
currentSceneAnalysis:
  - 13 A / Excellent pacing in the confrontation [br] Cut repetition in second paragraph
  - Follow-up + / Ally reveals motive
nextSceneAnalysis:
  - 14 Setback ? / Plan fails at the last moment New approach needed
Beats Update: Yes
---
```

---

## Beat Examples

### Standard Beat (Save the Cat)

```yaml
---
Class: Beat
Act: 1
When:                         # Optional: Story timeline date (YYYY-MM-DD HH:MM)
Description: The first impression of your story. A snapshot of the protagonist's life before the journey begins. This 'before' picture sets up the world and establishes what will change by the end. Show the protagonist in their everyday life, revealing the flaw or gap that will be addressed.
Beat Model: Save The Cat
Range: 0-10                   # Momentum range for this beat
Gossamer1: 12
---
```

> **Note**: Beat notes can be ordered two ways:
> - **Manuscript order** (default): Uses Act field and filename prefix (e.g., `01 Opening Image.md`)
> - **Chronological order**: Add `When` field to position beats at specific story timeline dates
> - Enable "Sort by When date" (Settings → Advanced) to position beats chronologically alongside scenes

### Beat with Historical Gossamer Tracking

```yaml
---
Class: Beat
Act: 1
When: 2026-01-15 08:00        # Story timeline position
Description: The first impression of your story. A snapshot of the protagonist's life before the journey begins.
Beat Model: Save The Cat
Range: 0-10
Gossamer1: 12    # Always the most recent score
Gossamer2: 8     # Second run forms a second line and range
Gossamer3: 4     # Third run for trend analysis
Gossamer4: 15    # Fourth run
Gossamer5: 6     # Oldest scores capped at Gossamer30
---
```

---

## Field Details

### Class
**Required** | Type: `Scene` or `Beat`

Identifies the file type for the plugin.

---

### Act
**Required** | Type: Number (1-3)

The story act this scene or beat belongs to.

---

### When
**Optional** | Type: Date

The in-world date when the scene OR beat takes place in your fictional timeline.

Supported formats:
- `2024-03-15` (simple date)
- `2024-03-15T14:30:00` (date with time)
- `2024-03-15 14:30` (readable date+time)

**Invalid examples:**
- `March 15, 2024` ❌
- `Day 1` ❌
- `Two weeks later` ❌

**Usage:**
- **Scenes**: Used by Chronologue Mode and "Sort by When date" to arrange scenes chronologically
- **Beats**: When added to beat notes, allows story beats to be positioned at specific points in the timeline when using chronological sorting
- **Sorting**: Enable "Sort by When date" (Settings → Advanced) to position both scenes and beats across the full 360° circle based on their `When` dates

---

### Synopsis
**Optional** | Type: String

Brief description of what happens in the scene. Displayed on hover in the timeline.

---

### Subplot
**Required** | Type: Array

One or more plot threads this scene belongs to. Default: `Main Plot`

Should be reserved for key scenes that advance the overall plot. Avoid overlapping scenes across multiple subplots except where truly appropriate.

Examples:
```yaml
Subplot: Main Plot              # Single subplot
Subplot:                        # Multiple subplots
  - Main Plot
  - Romance Arc
```

> **Important**: Avoid using commas within subplot names. The plugin uses comma-space (`, `) as a delimiter when processing subplot lists. For example, a subplot named "Chae Ban, Romance Arc" would be incorrectly split into two separate subplots.

---

### Character
**Optional** | Type: Array

Characters present in the scene. Use wiki links to character notes.

```yaml
Character:
  - "[[protagonist a]]"
  - "[[mentor b]]"
```

> **Important**: Avoid using commas within character names. The plugin uses comma-space (`, `) as a delimiter when processing character lists.

---

### Place
**Optional** | Type: Array

Location tags. Link to place notes using wiki links.

```yaml
Place:
  - "[[earth]]"
  - "[[space station]]"
```

---

### Status
**Required** | Type: String

Workflow status: `Todo`, `Working`, or `Complete`

Determines scene color coding in the timeline.

---

### Publish Stage
**Optional** | Type: String

Publication readiness: `Zero`, `Author`, `House`, or `Press`

- **Zero**: Draft stage
- **Author**: Ready for revision
- **House**: Reviewed and edited
- **Press**: Ready for publication

Used for color coding in Main Plot mode.

---

### Revision
**Optional** | Type: Number

Track how many times you've rewritten the scene. Leave blank until stage > zero, then increment with each revision.

---

### Due
**Optional** | Type: Date (YYYY-MM-DD)

Deadline for completing this scene. Scenes past their due date are marked as overdue in the timeline.

---

### Pending Edits
**Optional** | Type: String

Concrete revisions to address. Used by Zero Draft Mode to capture editing ideas without opening the scene file.

---

### Duration
**Optional** | Type: Number

How much story time passes (minutes, hours, days).

---

### Book
**Optional** | Type: String

Book project label for multi-book series.

---

## Story Grid Fields

### Type
Scene type classification:
- revelation
- turning point
- confrontation
- decision
- setup
- payoff
- inciting incident
- deepening

---

### Shift
Polarity change: `+`, `-`, or `+/-` (if it flips both ways)

---

### Questions
What is the reader wondering at this point?

---

### Reader Emotion
Expected emotional response: curious, shocked, uneasy, hopeful, betrayed, triumphant, etc.

---

### Internal
How do the characters change? (e.g., from trusting → suspicious)

---

## AI Scene Beats Analysis

### previousSceneAnalysis
**Auto-generated** | Type: Array

AI-generated analysis of the previous scene in the triplet.

```yaml
previousSceneAnalysis:
  - 12 Inciting clue + / Raises stakes for the protagonist
```

---

### currentSceneAnalysis
**Auto-generated** | Type: Array

AI-generated analysis of the current scene, includes a grade (A/B/C).

```yaml
currentSceneAnalysis:
  - 13 A / Excellent pacing [br] Cut repetition in second paragraph
```

Use `[br]` to force line breaks in timeline hover display.

---

### nextSceneAnalysis
**Auto-generated** | Type: Array

AI-generated analysis of the next scene in the triplet.

```yaml
nextSceneAnalysis:
  - 14 Setback ? / Plan fails at the last moment
```

---

### Beats Update
**Optional** | Type: String

Set to `Yes` to flag scene for AI beats triplet analysis. Used by Scene Analysis commands.

---

## Gossamer Fields

### Gossamer1-30
**Optional for Beats** | Type: Number (0-100)

Momentum scores for beat analysis in Gossamer view.

- `Gossamer1` is always the most recent score
- `Gossamer2-30` store historical runs
- Supports up to 30 historical tracking points
- Scores automatically shift when new analysis runs

```yaml
Gossamer1: 12    # Current
Gossamer2: 8     # Previous run
Gossamer3: 4     # 2 runs ago
```

---

## Beat Model
**Optional for Beats** | Type: String

The story beat system this beat belongs to:
- Save The Cat
- Hero's Journey
- Story Grid
- Custom

---

## Description
**Required for Beats** | Type: String

Explanation of what this story beat represents and its purpose in the narrative structure.

---

## Custom Fields

You can add any additional frontmatter fields for your personal writing process. The Radial Timeline plugin will safely ignore fields it doesn't recognize.

Example custom fields:
- `Total Time`: Writing/production time in hours
- `Words`: Scene word count
- `Support Files`: Attachments, references, research notes
- `POV`: Point of view character
- `Tone`: Scene mood or atmosphere

---

## Tips

1. **Start minimal**: Begin with just `Class`, `Act`, `Status`, and `Subplot`
2. **Add fields gradually**: Introduce more fields as your workflow develops
3. **Use templates**: Create scene/beat templates with your preferred fields
4. **Link liberally**: Use wiki links for characters, places, and cross-references
5. **AI beats**: Set `Beats Update: Yes` to include in analysis runs
6. **Manual line breaks**: Use `[br]` in AI beat text to control hover display wrapping
