# Beat Audit + Heal — Current Behavior

## Overview

Beat Audit checks beat note health against the active beat system. Beat Heal (Repair) updates existing beat notes to match the configured beat list. Both operate on **structural correctness only** — they do not treat filename prefix numbers as errors.

## 1. What Beat Audit checks today

| Check | Description |
|-------|-------------|
| **Beat order** | Matching is by **canonical beat name** (normalized title; prefix numbers are stripped for matching). Order in the list is reflected by Act and position; the audit does not flag ordering issues except where duplicates or missing beats apply. |
| **Act placement** | Each expected beat has an Act. The audit compares the existing note's frontmatter `Act` to the expected Act. Mismatch = **misaligned**. |
| **Duplicates** | Multiple beat notes that normalize to the same canonical name. Flagged as **duplicate**; must be resolved manually (delete or rename one). |
| **Missing** | Expected beats with no matching note in the vault. Flagged as **new** (not yet created). |
| **Missing Beat Model** | Beat notes that match expected names but lack `Beat Model` (or have a different one). Can be repaired via Heal. |

**Synced** = one matching note, canonical name matches, and Act matches. Prefix number in the filename is **not** checked.

## 2. What Beat Heal / Repair changes

| Updated | Description |
|---------|-------------|
| **Act** | Frontmatter `Act` is set to the expected Act. |
| **Beat Model** | Frontmatter `Beat Model` is set to the active system name. |
| **Class** | Frontmatter `Class` is set to `Beat` if missing. |

| Never overwritten | User-edited content is preserved. |
|-------------------|-------------------------------|
| Purpose | Not touched. |
| Custom YAML fields | Not touched. |
| Body content | Not touched. |

| Conflicts | Resolution |
|-----------|------------|
| Duplicates | Skipped; must be resolved manually. |
| Target path already exists | Skipped; conflict reported. |
| No matching note | Skipped (nothing to repair). |

Heal updates frontmatter only. It does **not** rename files or change filename prefix numbers.

## 3. How Beat Audit / Heal treats beat prefix numbers (CRITICAL)

**Beat prefix numbers are presentation-only** and expected to change as manuscripts evolve (scenes added, acts rebalanced, etc.). They are generated and normalized during Assemble / Export, not policed during Audit.

> **Rule**: Beat prefix numbers are **not** audited as errors and are **never** healed as part of Beat Audit / Heal.

- A beat note with a "wrong" prefix number (e.g. `5.01 Midpoint` when the scene distribution suggests `7.01`) is **not** flagged as misaligned if its Act is correct.
- A beat note with no prefix number (e.g. `Midpoint.md`) is **not** flagged as misaligned if its Act is correct.
- Repair does **not** rename files to fix prefix numbers; it only updates frontmatter (`Act`, `Beat Model`, `Class`).

Prefix numbers are generated during note creation and can be updated manually or during Assemble/Export workflows. They are **not** part of the Beat Audit / Heal correctness model.
