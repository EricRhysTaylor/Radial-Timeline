# Manuscript export

`Manuscript export` opens the export modal for compiled manuscript and outline outputs.

Use it when you want to assemble your notes into a deliverable artifact instead of working scene-by-scene in the timeline.

<div style="text-align: center; margin: 20px 0;">
  <img src="images/Manuscript export.png" alt="Manuscript export modal" style="width: 560px; max-width: 100%; border-radius: 8px;" />
  <div style="font-size: 0.85em; margin-top: 8px; color: #666;">Manuscript export — filtering, ordering, range, and output controls</div>
</div>

## What It Can Export

The export workflow can produce:

*   compiled Markdown manuscripts
*   PDF manuscripts
*   outline-style exports
*   filtered or ranged exports by order and subplot

Core includes compiled Markdown and Pandoc PDF export with bundled Core layouts. Pro adds additional bundled layouts and deeper publishing customization.

The modal supports ordering, selection range, output presets, and publishing-oriented layout decisions in one place.

## PDF Layouts

For PDF exports, choose a novel PDF layout from the layout picker. The selected layout controls the page style, required font checks, chapter opener behavior, and whether the export prints Part pages.

The preview cards show the expected chapter, part, and body-page structure before export. Export checks report missing Pandoc, LaTeX, bundled fonts, and layout-token problems before you generate the PDF.

The selected novel PDF layout is remembered per book. Narrative Mode uses that setting to show publishing-aware **C** and **P** placards on the timeline when chapter markers are enabled.

## Related Docs

*   [Publishing](Publishing)
*   [Workflow Overview](Core-Workflows#exporting-a-manuscript)
