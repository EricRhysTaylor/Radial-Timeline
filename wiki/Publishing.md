Radial Timeline turns your scene notes into a finished manuscript using **Pandoc** and **LaTeX**. You pick a template that defines the look of the page — fonts, headers, chapter openers, part dividers — and the plugin assembles your scenes into that format and hands the result to Pandoc to produce a PDF.

**Core includes Pandoc-based PDF export.** Core users can export PDFs with the bundled Core publishing layouts. **Pro** extends that system with extra templates and more advanced publishing customization.

This page covers:
- The template catalog (what's bundled and what each one looks like)
- Installing, duplicating, and importing templates
- The `Chapter:` field — how you mark chapter breaks
- Parts — how they're generated from Acts
- Setting up **Modern Classic** (advanced book-style structure)
- Act epigraphs, scene opener headings
- Exporting

> **Prerequisites**: Pandoc installed, and LaTeX installed for PDF output. See [Setting Up Pandoc Export](Core-Workflows#setting-up-pandoc-export) for the one-time install.

---

## Template Catalog

Bundled templates live in **Settings → Publish → PDF Styles**. Each row shows a status pill (**Installed** / **Not installed**), a preview card, and buttons for **Install** and **Duplicate**.

Core includes the standard publishing layouts needed for Pandoc PDF export. Pro adds additional advanced layouts and deeper template customization/import workflows.

### Novel templates

| Template | Structure | Best for |
|---|---|---|
| **Standard Manuscript** | Standard double-spaced submission format | Sending to agents / editors |
| **Contemporary Literary** | Book-style with Sorts Mill Goudy body, running headers, chapter openers | A finished book look with simple chapters |
| **Signature Literary** | Literary book style with refined typography | Polished prose fiction |
| **Modern Classic** | Full book structure — **Parts**, Chapters, act epigraphs, ornament scene breaks | Novels with act structure and multiple chapters per act |

### Other formats

| Template | Format |
|---|---|
| **Screenplay** | Industry-standard screenplay |
| **Podcast Script** | Audio script with structured cues |

---

## Installing a Template

1. Open **Settings → Publish → PDF Styles**.
2. Find the template you want in the list. If the pill says **Not installed**, click **Install**.
3. The plugin copies the template's `.tex` file into `Radial Timeline/Pandoc/` inside your vault. The pill changes to **Installed**.

Only installed templates can be used for export.

## Book Details and Matter Pages

**Auto configure publishing** is part of Core. It creates a Book Details note, BookMeta-backed page slots, and Core PDF layout files.

BookMeta-backed page slots are lightweight ordering notes. They usually have an empty body and use:

```yaml
---
Class: Frontmatter
Role: title-page
UseBookMeta: true
BodyMode: plain
---
```

`UseBookMeta: true` tells Radial Timeline to fill that page from Book Details. The physical note controls whether the page appears and where it sits in the manuscript order.

Standalone LaTeX matter notes are different. Use them only when you want the page body to be custom LaTeX:

```yaml
---
Class: Frontmatter
BodyMode: latex
---
```

Those notes keep their own page content and do not need BookMeta values.

## Duplicating a Template

Every bundled template has a **Duplicate** button next to Install. Duplicating copies the `.tex` into your vault under a new name (e.g., `rt_modern_classic-copy.tex`), gives it a new display name ("Modern Classic Copy"), and leaves the original untouched.

Use Duplicate when you want to tweak a bundled template — change margins, swap a font, add a custom title page — without losing the original. The copy shows the same preview card as the bundled template and accepts edits to its `.tex` file directly in your vault.

## Importing Your Own LaTeX Template

If you already have a LaTeX template you've built elsewhere, use **Import Template** in the PDF Styles section. The plugin:
1. Reads the `.tex` file you pick.
2. Runs detection to classify its style (literary, manuscript, chaptered).
3. Flags validation issues if the file looks incomplete.
4. Adds it to your template list as an imported layout.

Imported templates appear alongside bundled ones and can be assigned to any compatible format.

---

## The `Chapter:` Field

The `Chapter:` YAML frontmatter field is how you tell the exporter "this is where a new chapter starts."

Add it to the first scene, beat, or backdrop note that belongs to each chapter:

```yaml
---
Class: Scene
Chapter: The Homecoming
---
```

Key behaviors:

- **Shared across three note types.** Scenes, Beat notes, and Backdrop/context notes all accept `Chapter:`. The plugin walks the timeline in order; whichever note type appears first with a `Chapter:` value opens that chapter. This lets you anchor a chapter break on a beat card or a context note, not only on a scene.
- **First occurrence wins.** If five scenes share `Chapter: The Homecoming`, only the first one starts the chapter — the rest flow inside it.
- **Case-insensitive.** `Chapter`, `chapter`, `CHAPTER` all work.
- **Numbering is automatic.** You provide the title; the exporter supplies the number (`Chapter 1`, `Chapter 2`, …).

You do **not** need `Chapter:` on every scene. Only on the scene (or beat/backdrop) where a chapter begins.

---

## Parts — Derived from Acts

You don't type "Part I" anywhere. Parts are generated automatically from your **Acts**.

1. Set **Act count** in **Settings → Core → Acts** (e.g., 3). This is the canonical partition that also drives the timeline ring.
2. Set the `Act:` field on each scene (`Act: 1`, `Act: 2`, …). This is the same field the timeline reads to place the scene in its act segment, so what you see in the ring is what the export prints.
3. When the exporter crosses from Act 1 to Act 2, it emits a **Part II** divider page.

**Part ordering**: Part → Chapter → Scene.

- Part I contains all scenes whose `Act: 1` (with their chapters)
- Part II contains all scenes whose `Act: 2`
- Part III contains all scenes whose `Act: 3`

Not every template uses Parts. Only templates with `usesModernClassicStructure` (currently **Modern Classic**) print Part divider pages. Simpler templates ignore act boundaries and flow straight through.

> Beats are not used to determine acts for export. The export reads each scene's own `Act:` field directly, the same way the timeline ring does, so Parts in the PDF always match the act partitioning you see in Narrative mode.

---

## Setting Up Modern Classic

Modern Classic is the most structured bundled template. It produces a book-style manuscript with:

- **Part openers** on their own page (with Roman numerals: I, II, III)
- **Optional act epigraphs** — a quote + attribution printed after each Part page
- **Numbered chapter openers** from your `Chapter:` fields
- **Ornament scene breaks** between scenes inside a chapter (instead of scene numbers/titles)
- **Suppressed scene headings** — scenes flow as continuous prose separated by a centered ornament

Here's the full setup, step by step.

### Step 1 — Install Modern Classic

**Settings → Publish → PDF Styles → Modern Classic → Install**

The template file writes to `Radial Timeline/Pandoc/rt_modern_classic.tex` in your vault.

### Step 2 — Set your Act count

**Settings → Acts → Act count**

This is a global plugin setting (not a per-template one). Most novels use 3 acts; some use 4 or 5. Whatever you pick here is the number of Parts your book will have.

### Step 3 — Make sure your scenes carry an `Act:` value

Modern Classic generates Part breaks at every act-boundary transition in narrative order. It reads each scene's own `Act:` field directly (the same field the timeline ring uses to place the scene), so what you see partitioned in Narrative mode is exactly what gets printed as Parts.

If you used **Book Designer** to scaffold your manuscript, this is already set. Otherwise, check that every scene has a numeric `Act:` field (`1`, `2`, `3`, …) in its frontmatter.

See [Scene Properties](YAML-Frontmatter) for the full frontmatter schema.

### Step 4 — Add `Chapter:` markers

Decide where each chapter should begin. On the first scene (or beat/backdrop) of each chapter, add:

```yaml
Chapter: The Gathering Storm
```

You can have many chapters per act. There's no upper limit and no naming requirement — pick titles that fit your book.

### Step 5 — (Optional) Add act epigraphs

**Settings → Publish → PDF Styles → Modern Classic** → click the **+** button at the end of the row to expand special options → **Act epigraphs**.

For each act, fill in:
- **Quote** — the epigraph text
- **Attribution** — source line (e.g., "— Ursula K. Le Guin")

Epigraphs are **per-book** (stored against your active book profile), so different books can have different epigraphs using the same template. Leave them blank and the Part pages print without any quote.

### Step 6 — Assign Modern Classic to the Novel format

Open the export modal (Command Palette → **Manuscript export**). In the template dropdown for Novel, choose **Modern Classic**. The plugin remembers your last selection for next time.

### Step 7 — Export

Command Palette → **Manuscript export** → choose your options → **Export**.

The exporter:
1. Walks the timeline in narrative order.
2. Emits a **Part** divider every time a new act begins (with epigraph if you filled one in).
3. Emits a **Chapter** opener every time a new `Chapter:` value appears.
4. Emits scene prose separated by ornaments inside each chapter.
5. Hands the assembled markdown to Pandoc, which produces a PDF.

Output goes to `Radial Timeline/Export/` by default (configurable in Settings → Publish → Export folder).

### Minimum viable Modern Classic manuscript

The smallest setup that produces a valid Modern Classic PDF:

- Modern Classic **Installed**
- **Act count** set (default 3 is fine)
- At least one scene with an `Act:` field (`1`, `2`, …) — and one transition to a higher Act if you want a Part II
- At least one scene (anywhere) with a `Chapter:` value

Epigraphs, extra chapters, and multi-act structure are all optional refinements.

---

## Scene Opener Heading Options

Templates that have the **Scene opener heading options** capability let you choose how scene titles appear at the start of each scene. Available modes:

- **Scene number** — just the number (`3` or `Scene 3`)
- **Scene number + title** — `3 — Opening Beat` (default)
- **Title only** — `Opening Beat` (no number)

Find this in **Settings → Publish → PDF Styles → [template] → +** (expand) → **Scene openers**.

**Modern Classic ignores this setting** because it doesn't print scene headings — scenes are separated by ornaments and carry no label. If you want labeled scene openers, use Standard Manuscript, Contemporary Literary, or Signature Literary.

---

## Exporting a Manuscript

**Command Palette → Manuscript export**

The export modal lets you:
- Pick the output format (Novel, Screenplay, Podcast Script)
- Choose the template for that format
- Select which scenes to include (all, or filtered by act/subplot)
- Toggle Markdown-only vs. PDF

Files land in `Radial Timeline/Export/` unless you've set a custom export folder.

For the end-to-end export workflow and troubleshooting (Pandoc install, LaTeX issues), see [Export Workflow](Core-Workflows#exporting-a-manuscript).

---

## Troubleshooting

**Template shows "Not installed" after I clicked Install.** The `.tex` file couldn't be written — check that `Radial Timeline/Pandoc/` exists and is writable.

**Parts don't appear in my Modern Classic export.** Parts only emit when scenes cross an act boundary. Check that your scenes have `Act:` values in their frontmatter and that more than one act is represented in the selection.

**Chapter numbering is wrong.** The exporter numbers chapters by the order `Chapter:` values appear in the timeline. If a `Chapter:` value appears out of order, renumbering will reflect that. Check narrative order via [Timeline Modes](Timeline-Modes).

**Duplicated template looks different from the original.** If you're on an older plugin build, duplicates lost their preview card due to a bug. Update to the latest build — duplicates now render with the same preview card as the original and can be edited in place.

**Epigraph fields are greyed out.** Epigraphs are per-book. Make sure you have an **active book** selected before editing them.
