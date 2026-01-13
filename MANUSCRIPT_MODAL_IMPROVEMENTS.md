# Manuscript Export Modal Improvements

## Overview
The Manuscript Export Modal needs better context, icons, previews, and template guidance to help authors understand their options.

---

## 1. ICONS NEEDED

### Section Headers (Lucide Icons)
- **Export Type**: `file-text` (Manuscript) / `list` (Outline)
- **Manuscript Preset**: `book-open` (Novel) / `film` (Screenplay) / `mic` (Podcast)
- **Outline Preset**: `layout-list` (Beat sheet) / `tv` (Episode rundown) / `clipboard-list` (Shooting schedule) / `sticky-note` (Index cards)
- **Scene Ordering**: `arrow-down` (Narrative) / `arrow-up` (Reverse) / `calendar` (Chronological) / `calendar-clock` (Reverse chrono)
- **Table of Contents**: `list-ordered` / `list` / `x` (none)
- **Output Format**: `file-text` (Markdown) / `file-type` (DOCX) / `file-text` (PDF) / `table` (CSV) / `code` (JSON)
- **Word Count Update**: `hash`
- **Subplot Filter**: `filter`
- **Scene Range**: `sliders-horizontal`

### Preset Dropdown Icons
Add icons next to preset names in dropdowns (like Book Designer modal does):
- Novel: `book-open`
- Screenplay: `film`  
- Podcast: `mic`
- Beat sheet: `layout-list`
- Episode rundown: `tv`
- Shooting schedule: `clipboard-list`
- Index cards: `sticky-note`

---

## 2. IMPROVED DESCRIPTIONS & HELP TEXT

### Manuscript Presets (Currently Very Vague)

**Current:**
- "Screenplay (Pandoc template)"
- "Podcast script (Pandoc template)"
- "Novel manuscript"

**Recommended:**
- **Novel**: "Traditional book manuscript format. Scenes become chapters/sections. For publishing, editing, or sharing."
- **Screenplay**: "Industry-standard screenplay format (slug lines, dialogue, action). Requires Pandoc template for DOCX/PDF. Best for film/TV scripts."
- **Podcast**: "Audio script format with host/guest cues, timing, and segments. Requires Pandoc template for DOCX/PDF. Best for podcast episodes."

### Outline Presets (Need Better Context)

**Beat Sheet** (Add description):
- "Blake Snyder's Save the Cat structure. Simple numbered list of scenes. Best for story structure planning."

**Episode Rundown** (Add description):
- "TV-style scene list with timing. Each scene numbered with runtime. Best for episodic content planning."

**Shooting Schedule** (Add description):
- "Production-ready table with scenes, locations, timing, subplots. Includes session planning estimates if configured. Best for film/TV production."

**Index Cards** (Add description):
- "Scene metadata as structured data (CSV/JSON). Includes runtime, word counts, synopsis. Best for external tools, scripts, or databases."

### Table of Contents Options (Clarify)

**Markdown links**: "Clickable scene anchors. Best for Obsidian navigation or markdown readers."

**Plain text**: "Simple text list. Best for AI processing, printing, or simple documents."

**No TOC**: "Start with scenes immediately. Best for continuous reading or further processing."

### Output Formats (Add Tooltips/Descriptions)

**Markdown**: "Obsidian-compatible `.md` files. Always available, no setup required."

**DOCX**: "Microsoft Word format. Requires Pandoc installed. Uses template if configured in Settings → Pro."

**PDF**: "Portable document format. Requires Pandoc + LaTeX installed. Uses template if configured in Settings → Pro."

**CSV**: "Spreadsheet-compatible data. Best for outlines (beat sheets, index cards)."

**JSON**: "Machine-readable data. Best for outlines, integrations, or custom scripts."

---

## 3. PREVIEW AREAS NEEDED

### High Priority Previews

1. **Manuscript Preset Preview** (Most Critical)
   - Show 3-5 line sample of what each preset output looks like
   - **Novel**: Show simple markdown heading + text
   - **Screenplay**: Show slug line + character + dialogue format (even if just mockup)
   - **Podcast**: Show segment + host/guest format (even if just mockup)
   - **Location**: Below preset dropdown, collapsible preview panel

2. **Outline Preset Preview** (High Value)
   - Show 3-4 line sample of each outline format
   - **Beat sheet**: `1. Opening Image\n2. Theme Stated\n...`
   - **Episode rundown**: `1. Cold Open · Jan 1 [2:30]\n2. Theme Song [0:15]\n...`
   - **Shooting schedule**: Mini table preview
   - **Index cards**: Show JSON structure sample or CSV header row
   - **Location**: Below outline preset dropdown, collapsible

3. **TOC Format Preview** (Medium Priority)
   - Show 3-line sample of each TOC format
   - **Markdown**: `- [Scene 1](#scene-1-title)`
   - **Plain**: `- Scene 1 Title`
   - **None**: "(No table of contents)"
   - **Location**: Below TOC pills, inline preview

4. **Output Format Info Panel** (Medium Priority)
   - Show requirements/status:
   - Markdown: ✅ "Always available"
   - DOCX: ⚠️ "Requires Pandoc" + template status
   - PDF: ⚠️ "Requires Pandoc + LaTeX" + template status
   - **Location**: Small info box below format pills

### Preview Implementation Pattern

```typescript
// Collapsible preview panel pattern
const previewToggle = card.createDiv({ cls: 'rt-manuscript-preview-toggle' });
previewToggle.createSpan({ text: 'Preview' });
const previewIcon = previewToggle.createSpan();
setIcon(previewIcon, 'chevron-down');
const previewPanel = card.createDiv({ cls: 'rt-manuscript-preview-panel', attr: { style: 'display: none;' } });

previewToggle.onClickEvent(() => {
  const isOpen = previewPanel.style.display !== 'none';
  previewPanel.style.display = isOpen ? 'none' : 'block';
  setIcon(previewIcon, isOpen ? 'chevron-down' : 'chevron-up');
});
```

---

## 4. PREDEFINED TEMPLATES

### Where Templates Should Be Created

**Current Location**: Settings → Professional → Pandoc templates (user-entered paths)

**Recommended**: Add template library/gallery

1. **Built-in Template Examples** (Optional)
   - Create `templates/` folder in plugin directory with examples:
   - `novel-standard.tex` - Basic novel template
   - `screenplay-us.tex` - US screenplay format
   - `screenplay-uk.tex` - UK screenplay format  
   - `podcast-standard.tex` - Basic podcast script
   - User can copy these to their vault and customize

2. **Template Gallery in Settings** (Better UX)
   - Add "Template Gallery" section in Settings → Professional
   - List available templates with descriptions
   - "Copy to vault" button for each
   - Templates stored in `Radial Timeline/Templates/` folder
   - User then references them in Pandoc templates settings

3. **Template Preview in Modal** (If template selected)
   - Show template path/name below format selection
   - Link to "Open template" or "Edit template"
   - Show template status: ✅ Found / ⚠️ Not found

### Template Creation Recommendations

**For User**: Create templates in `Radial Timeline/Templates/` folder:
- `novel-manuscript.tex` - Your novel template
- `screenplay-hollywood.tex` - Screenplay template
- `podcast-format.tex` - Podcast template

**Template Structure Guidance** (Add to wiki/docs):
- Templates should use Pandoc variables: `$body$`, `$title$`, etc.
- For screenplays: Use appropriate formatting (Courier, margins, etc.)
- For podcasts: Include segment markers, timing cues
- For novels: Standard manuscript format (12pt, double-spaced, etc.)

---

## 5. CONTEXTUAL HELP

### Help Icons (Info Icons Next to Headings)

Add `info` icon next to:
- Manuscript preset (explain what each format is)
- Outline preset (explain use cases)
- TOC format (explain differences)
- Output format (explain requirements)
- Word count update (explain what it does)

**Pattern**: 
```typescript
const heading = card.createDiv({ cls: 'rt-sub-card-head' });
heading.createSpan({ text: t('manuscriptModal.manuscriptPresetHeading') });
const helpIcon = heading.createSpan({ cls: 'rt-help-icon-inline' });
setIcon(helpIcon, 'info');
setTooltip(helpIcon, 'Detailed help text here');
```

### Expandable Info Panels

For complex settings, add "Learn more" links:
- **Pandoc templates**: "What is a Pandoc template? → Wiki"
- **Session planning**: "How session planning works → Wiki"
- **Outline formats**: "When to use each format → Wiki"

---

## 6. PRIORITY IMPLEMENTATION ORDER

### Phase 1: Critical (Do First)
1. ✅ Add icons to preset dropdowns (visual clarity)
2. ✅ Improve manuscript preset descriptions (explain differences)
3. ✅ Add manuscript preset preview (show what output looks like)
4. ✅ Add outline preset descriptions

### Phase 2: High Value
5. ✅ Add TOC format preview
6. ✅ Add help icons with tooltips
7. ✅ Improve output format descriptions
8. ✅ Add template status/requirements panel

### Phase 3: Nice to Have
9. ✅ Create template gallery in settings
10. ✅ Add "Learn more" wiki links
11. ✅ Add outline preset previews
12. ✅ Template preview in modal

---

## 7. SPECIFIC UI CHANGES

### Manuscript Preset Section
```
┌─────────────────────────────────────────┐
│ Manuscript preset  [info icon]          │
│ [Dropdown: Novel ▼]  [Preview toggle ▼] │
│                                          │
│ [Preview Panel - when open]             │
│ ┌─────────────────────────────────────┐ │
│ │ Novel format preview:               │ │
│ │ ## Scene Title                      │ │
│ │                                     │ │
│ │ Scene content text...               │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### Output Format Section
```
┌─────────────────────────────────────────┐
│ Output format  [info icon]              │
│ [Markdown] [DOCX] [PDF]                 │
│                                          │
│ 📄 Markdown: Always available           │
│ ⚠️ DOCX: Requires Pandoc                │
│    Template: screenplay-hollywood.tex   │
│ ⚠️ PDF: Requires Pandoc + LaTeX         │
└─────────────────────────────────────────┘
```

### TOC Section
```
┌─────────────────────────────────────────┐
│ Table of contents  [info icon]          │
│ [Markdown links] [Plain text] [No TOC]  │
│                                          │
│ Preview:                                │
│ - [Scene 1](#scene-1-title)            │
│ - [Scene 2](#scene-2-title)            │
└─────────────────────────────────────────┘
```

---

## 8. TRANSLATION KEYS TO ADD

Add to `src/i18n/locales/en.ts`:

```typescript
manuscriptModal: {
  // ... existing keys ...
  
  // Preset descriptions
  presetNovelDesc: "Traditional book manuscript format...",
  presetScreenplayDesc: "Industry-standard screenplay format...",
  presetPodcastDesc: "Audio script format with host/guest cues...",
  
  // Outline descriptions
  outlineBeatSheetDesc: "Blake Snyder's Save the Cat structure...",
  outlineEpisodeRundownDesc: "TV-style scene list with timing...",
  outlineShootingScheduleDesc: "Production-ready table...",
  outlineIndexCardsDesc: "Scene metadata as structured data...",
  
  // Format descriptions
  formatMarkdownDesc: "Obsidian-compatible .md files...",
  formatDocxDesc: "Microsoft Word format. Requires Pandoc...",
  formatPdfDesc: "Portable document format. Requires Pandoc + LaTeX...",
  
  // Help text
  manuscriptPresetHelp: "Choose the format that matches your final output type...",
  tocFormatHelp: "Markdown links work in Obsidian. Plain text for AI/printing...",
  
  // Preview
  previewToggle: "Preview",
  previewNovel: "## Scene Title\n\nScene content...",
  previewScreenplay: "INT. LOCATION - DAY\n\nCHARACTER\nDialogue here.",
  // ... etc
}
```

---

## 9. TEMPLATE CREATION GUIDE

Create `docs/PANDOC_TEMPLATES.md`:

### What are Pandoc Templates?
Pandoc templates control how your manuscript looks in DOCX/PDF formats. They're LaTeX files (for PDF) or reference DOCX files.

### Creating Templates

1. **Novel Template** (`novel-manuscript.tex`):
   - 12pt font, double-spaced
   - 1-inch margins
   - Page numbers
   - Chapter headings

2. **Screenplay Template** (`screenplay-us.tex`):
   - Courier font, 12pt
   - Proper margins (1.5" left, 1" right/top/bottom)
   - Slug lines (INT./EXT. LOCATION - TIME)
   - Character names (ALL CAPS, centered)
   - Dialogue formatting

3. **Podcast Template** (`podcast-script.tex`):
   - Clear segment markers
   - Host/Guest labels
   - Timing cues
   - Music/audio cues

### Where to Put Templates
Store templates in: `Radial Timeline/Templates/`
Then reference them in Settings → Professional → Pandoc templates

### Resources
- [Pandoc Template Documentation](https://pandoc.org/MANUAL.html#templates)
- [LaTeX Screenplay Packages](https://www.ctan.org/topic/scrnplay)
- Example templates: (link to wiki/gallery)

---

## SUMMARY

**Most Critical Issues to Fix:**
1. Manuscript presets are indistinguishable - need descriptions + previews
2. No visual guidance on what each format produces
3. Template setup is unclear - need gallery/guide
4. Output format requirements not obvious

**Quick Wins:**
- Add icons to dropdowns (30 min)
- Improve preset descriptions (1 hour)
- Add preview panels (2-3 hours)
- Add help icons with tooltips (1 hour)

This will dramatically improve the author experience and reduce confusion about export options.
