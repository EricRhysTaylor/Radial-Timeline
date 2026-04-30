# CSS Namespace Policy

Use this document when adding new classes, new feature chrome, or new view-specific UI.

## Default Rule

New UI classes should use `ert-*`.

That applies to:
- settings rows
- modal shells and internals
- buttons, badges, pills, panels, tooltips
- legends
- overlays
- empty states
- loading states
- control bars
- other non-SVG app chrome

If a new feature needs new CSS and it is not a renderer primitive, the default answer is `ert-*`.

## Exception Rule

`rt-*` is only acceptable when extending an explicitly accepted legacy island.

That means:
- the file or subsystem is listed in the namespace allowlist
- the new selector belongs to the same renderer island
- the new selector is not just app chrome that happens to live near the renderer

Do not use `rt-*` just because nearby files already contain `rt-*`.

## Decision Rule

Before adding CSS, answer this:

1. Is this app chrome?
- legend
- tooltip
- floating panel
- button cluster
- status pill
- empty/loading/error block
- modal-like overlay

If yes: use `ert-*`.

2. Is this a renderer primitive?
- SVG scene path
- scene number square
- radial spokes
- ring segments
- renderer-only hit target
- existing legacy drawing primitive

If yes: it may remain in a legacy `rt-*` island if that island is allowlisted.

## Timeline-Specific Rule

Radial Timeline currently has two realities:

- legacy renderer primitives still use `rt-*`
- new Timeline chrome should use `ert-timeline-*`

Examples of Timeline chrome:
- legends
- legend triggers
- hover help panels
- toolbar-style controls
- status/summary panels
- non-SVG floating UI

Examples of Timeline renderer primitives:
- scene arcs
- month spokes
- subplot ring labels
- scene-number squares
- beat dots

Practical rule:
- if it is a new legend or panel in the Timeline view, use `ert-timeline-*`
- if it is a new SVG primitive inside the old renderer island, follow the allowlisted legacy rules

## New Subsystems

If a new feature/view genuinely needs its own namespace:

1. declare it in the namespace allowlist first
2. document whether it is chrome or renderer
3. add a lock script if needed

Do not invent a new prefix ad hoc in implementation.

## Namespace Allowlist

The machine-readable allowlist lives at:

- [scripts/css-namespace-allowlist.json](/Users/ericrhystaylor/Documents/RT%20LLC/CodeBase/radial-timeline/scripts/css-namespace-allowlist.json)

That file defines:
- which files are accepted legacy islands
- which `rt-*` prefixes are tolerated there
- which areas are expected to use `ert-*` for new work

## Short Rule For LLM Work

When unsure:
- new shared UI or view chrome: `ert-*`
- old SVG renderer primitive inside an allowlisted island: maybe `rt-*`
- otherwise: stop and look at the allowlist before adding classes
