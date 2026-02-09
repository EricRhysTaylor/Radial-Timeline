# Views

Radial Timeline registers two co-equal **views** in Obsidian, each with its own tab in the workspace. You can have both open side by side or switch between them like any Obsidian pane.

## Timeline View

The Timeline view is the primary visual workspace. It renders your manuscript as a radial layout and supports four **modes** that each answer a different creative question:

| Mode | Key | Focus |
| :--- | :--- | :--- |
| **Narrative** | `1` | Manuscript reading order — subplot colors, story beats, scene reordering |
| **Publication** | `2` | Writing status and revision stages — Todo/Working/Overdue, publish-stage colors |
| **Chronologue** | `3` | Story-world chronology — when events happen, elapsed time, duration arcs |
| **Gossamer** | `4` | Narrative momentum — story beat scores, pacing, tension mapping |

Chronologue mode also provides three **sub-modes** (Shift, Alt, Runtime) for deeper temporal analysis. See [[Timeline Modes]] for full details.

**Open**: Command palette → **Radial Timeline: Open**, or click the shell icon in the ribbon.

## Inquiry View

The Inquiry view is a dedicated analysis workspace for corpus-level story evaluation. Instead of looking at individual scenes, Inquiry scans your entire manuscript (or multi-book saga) and uses AI to surface structural signals, loose ends, continuity issues, and narrative gaps.

Inquiry organizes its analysis into three narrative zones (Setup, Pressure, Payoff) and produces two complementary scores — **Flow** (narrative momentum) and **Depth** (thematic substance) — visualized in a radial glyph. See [[Inquiry]] for full details.

**Open**: Command palette → **Radial Timeline: Open Inquiry**, or click the waves icon in the ribbon.

## Working with Both Views

The two views complement each other at different altitudes:

*   **Timeline view** — Scene-level work: writing, ordering, tracking status, and running [[AI-Pulse-Analysis|AI Pulse Triplet Analysis]] on individual scenes.
*   **Inquiry view** — Manuscript-level analysis: evaluating how scenes, subplots, and books work together as a system.

A typical workflow might be: draft and arrange scenes in the Timeline view, then open Inquiry to check the structural health of your manuscript. Findings from Inquiry can write action notes directly into your scene frontmatter, creating a feedback loop between the two views.

Both views share the same AI provider configuration (Settings → Core → AI) and the same source path, so they always analyze the same manuscript.
