Radial Timeline turns your scene notes into a finished manuscript using **Pandoc** and **LaTeX**. You pick a template that defines the look of the page — fonts, headers, chapter openers, part dividers — and the plugin assembles your scenes into that format and hands the result to Pandoc to produce a PDF.

This page covers:
- The template catalog (what's bundled and what each one looks like)
- Installing, duplicating, and importing templates
- The `Chapter:` field — how you mark chapter breaks
- Parts — how they're generated from Acts
- Setting up **Modern Classic** (advanced book-style structure)
- Act epigraphs, scene opener headings
- Exporting

> **Prerequisites**: Pandoc installed, and LaTeX installed for PDF output. See [[Core-Workflows#setting-up-pandoc-export|Setting Up Pandoc Export]] for the one-time install.

---

## Template Catalog

Bundled templates live in **Settings → Publishing → PDF Styles**. Each row shows a status pill (**Installed** / **Not installed**), a preview card, and buttons for **Install** and **Duplicate**.

### Novel templates

| Template | Structure | Best for |
|---|---|---|
| **Basic Manuscript** | Standard double-spaced submission format | Sending to agents / editors |
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

1. Open **Settings → Publishing → PDF Styles**.
2. Find the template you want in the list. If the pill says **Not installed**, click **Install**.
3. The plugin copies the template's `.tex` file into `Radial Timeline/Pandoc/` inside your vault. The pill changes to **Installed**.

Only installed templates can be used for export.

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

1. Set **Act count** in **Settings** (e.g., 3).
2. Assign each scene to an act via its beat sheet (the `Beat:` field links a scene to a beat definition, and each beat belongs to an act).
3. When the exporter crosses from Act 1 to Act 2, it emits a **Part II** divider page.

**Part ordering**: Part → Chapter → Scene.

- Part I contains all scenes from Act 1 (with their chapters)
- Part II contains all scenes from Act 2
- Part III contains all scenes from Act 3

Not every template uses Parts. Only templates with `usesModernClassicStructure` (currently **Modern Classic**) print Part divider pages. Simpler templates ignore act boundaries and flow straight through.

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

**Settings → Publishing → PDF Styles → Modern Classic → Install**

The template file writes to `Radial Timeline/Pandoc/rt_modern_classic.tex` in your vault.

### Step 2 — Set your Act count

**Settings → Acts → Act count**

This is a global plugin setting (not a per-template one). Most novels use 3 acts; some use 4 or 5. Whatever you pick here is the number of Parts your book will have.

### Step 3 — Make sure your scenes are assigned to beats

Modern Classic generates Part breaks when the exporter sees scenes crossing an act boundary. It figures out which act a scene belongs to by following its `Beat:` field to a beat definition, which in turn has an `Act:` field.

If you used **Book Designer** to scaffold your manuscript, this is already done. Otherwise, check that:

- Each scene has a `Beat:` field pointing to a beat name.
- Each beat note has an `Act:` field (`1`, `2`, `3`, …).

See [[YAML-Frontmatter|Scene YAML]] for the full frontmatter schema.

### Step 4 — Add `Chapter:` markers

Decide where each chapter should begin. On the first scene (or beat/backdrop) of each chapter, add:

```yaml
Chapter: The Gathering Storm
```

You can have many chapters per act. There's no upper limit and no naming requirement — pick titles that fit your book.

### Step 5 — (Optional) Add act epigraphs

**Settings → Publishing → PDF Styles → Modern Classic** → click the **+** button at the end of the row to expand special options → **Act epigraphs**.

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

Output goes to `Radial Timeline/Export/` by default (configurable in Settings → Publishing → Export folder).

### Minimum viable Modern Classic manuscript

The smallest setup that produces a valid Modern Classic PDF:

- Modern Classic **Installed**
- **Act count** set (default 3 is fine)
- At least one scene with a `Beat:` and its beat with an `Act:`
- At least one scene (anywhere) with a `Chapter:` value

Epigraphs, extra chapters, and multi-act structure are all optional refinements.

---

## Scene Opener Heading Options

Templates that have the **Scene opener heading options** capability let you choose how scene titles appear at the start of each scene. Available modes:

- **Scene number** — just the number (`3` or `Scene 3`)
- **Scene number + title** — `3 — Opening Beat` (default)
- **Title only** — `Opening Beat` (no number)

Find this in **Settings → Publishing → PDF Styles → [template] → +** (expand) → **Scene openers**.

**Modern Classic ignores this setting** because it doesn't print scene headings — scenes are separated by ornaments and carry no label. If you want labeled scene openers, use Contemporary Literary, Signature Literary, or Basic Manuscript.

---

## Exporting a Manuscript

**Command Palette → Manuscript export**

The export modal lets you:
- Pick the output format (Novel, Screenplay, Podcast Script)
- Choose the template for that format
- Select which scenes to include (all, or filtered by act/subplot)
- Toggle Markdown-only vs. PDF

Files land in `Radial Timeline/Export/` unless you've set a custom export folder.

For the end-to-end export workflow and troubleshooting (Pandoc install, LaTeX issues), see [[Core-Workflows#exporting-a-manuscript|Export Workflow]].

---

## Troubleshooting

**Template shows "Not installed" after I clicked Install.** The `.tex` file couldn't be written — check that `Radial Timeline/Pandoc/` exists and is writable.

**Parts don't appear in my Modern Classic export.** Parts only emit when scenes cross an act boundary. Check that your scenes have `Beat:` fields, those beats have `Act:` fields, and your Act count is >1.

**Chapter numbering is wrong.** The exporter numbers chapters by the order `Chapter:` values appear in the timeline. If a `Chapter:` value appears out of order, renumbering will reflect that. Check narrative order via [[Timeline-Modes]].

**Duplicated template looks different from the original.** If you're on an older plugin build, duplicates lost their preview card due to a bug. Update to the latest build — duplicates now render with the same preview card as the original and can be edited in place.

**Epigraph fields are greyed out.** Epigraphs are per-book. Make sure you have an **active book** selected before editing them.
