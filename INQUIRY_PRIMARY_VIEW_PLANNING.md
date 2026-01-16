# Inquiry Primary View Planning Document (Planning Stage)

## Overview
This document defines the planning-stage blueprint for the Inquiry Primary View in Radial Timeline. It translates the v1 Inquiry spec into UI structure, data flow, and implementation steps without changing any story files. Inquiry ships as a new view type, desktop-only for v1, and remains code-isolated from core timeline logic.

## Scope
In scope for this planning stage:
- Primary view layout, interactions, and visual bindings for Inquiry.
- State model, caching, and artifact generation flow for Inquiry sessions.
- Corpus boundary enforcement and evidence weighting integration.
- Error and empty-state handling aligned with the Inquiry output contract.
- New view type wiring (command palette + ribbon) and desktop-only gating.
- Inquiry-specific code structure and CSS separation.

Out of scope for this planning stage:
No prose rewriting, no background scanning, no auto-fix workflows, no updates to scene notes or scene YAML.

## Non-Negotiables (From Spec)
- The author writes all prose; AI never rewrites story text.
- Inquiry never modifies scene notes or scene YAML.
- Inquiry operates only on configured sources, not the full vault.
- All AI outputs are ephemeral unless saved as an Artifact.
- Canon precedence: scene, book outline, saga outline, references.

## Architecture and Code Boundaries
- Inquiry ships as a new view type inside the existing plugin.
- Inquiry code lives under `src/inquiry/*` with a dedicated `inquiry.css`.
- Shared utilities are limited to vault discovery, settings, billing/Pro gates, and common ERT UI tokens.
- Inquiry view logic, store, and helpers remain isolated from timeline modes.

## Platform Support
- Desktop-only for v1.
- Mobile shows a “Desktop required” message with actions:
  - Open Artifacts folder
  - View most recent Artifact (if present)
- Artifacts remain readable on mobile.

## Primary View Layout (High-Level)
The Inquiry Primary View is a focused inspector with a central glyph, dual rings, and three question zones. It replaces scrolling with navigation controls and a minimap.

```
| [Scale: Scene | Book | Saga]  [Mode: Flow | Depth]  [Artifact] |
|                                                                |
|  [Minimap strip / ticks]                       [Findings]      |
|                                                                |
|                 Setup   Pressure   Payoff      [Panel]         |
|                     \     |     /                               |
|                    [Center Glyph + Rings]                      |
|                                                                |
| [Prev/Next or Up/Down]  [Cache Status]  [Confidence]           |
```

Key elements:
- Center glyph shows scope marker: S#, B#, or Sigma for saga.
- Two rings render at all times: inner ring is Flow, outer ring is Depth.
- Three inquiry zones surround the glyph: Setup, Pressure, Payoff.
- Findings panel shows result summary, verdict, and structured findings list.
- Findings panel is right-hand split on desktop and collapses into a bottom drawer on narrow widths.

## Interaction Model
Primary interactions must be explicit, reversible, and non-destructive.

Mode and scope:
- Mode switch swaps available questions, orientation, and ring emphasis.
- Scale selector changes target scope without auto-running Inquiry.
- Navigation arrows move within scope or hierarchy based on mode.
- Minimap ticks allow drill-down and quick navigation.
- View is launched via command palette and ribbon.

Inquiry triggers:
- Hover a zone to reveal up to 10 question icons.
- Click an icon to run Inquiry or load cached session.
- Changing mode clears active Inquiry visuals but preserves cache.
- Artifact generation captures the active session and resets state.
- Question icons use Lucide and are semantic, not decorative.

## Inquiry Run Pipeline (UI Perspective)
The Primary View only orchestrates input, execution, and visualization.

Inputs:
- Target scope, target id, mode, selected question id, corpus fingerprint.
- Configured sources, weighting rules, and canon precedence.
- Custom question registry stored in plugin data.

Outputs:
- Strict JSON result contract with verdict and findings.
- At least one finding, even on errors or ambiguity.
- Evidence type, confidence, and severity used for UI binding.

## Corpus Fingerprint
- Computed as a hash of evidence file paths, modified timestamps, question id, and schema version.
- Stored in session cache and Artifact frontmatter.
- Not shown in the default UI; surfaced via a Details expander in the Findings panel.
- Cache entries are marked stale when the fingerprint changes and never auto-rerun.

## Visual Binding Rules
UI binds to Inquiry results without altering the underlying corpus.

Rings:
- Always render with neutral baseline when no active session.
- Fill uses metric value (0 to 1), color uses severity.
- Confidence shows via subtle styling (dashed ring or small badge).
- Palette is neutral, green, amber, red; no gradients for v1.
- Inquiry overrides ring context while active session is visible.

Findings:
- Group by zone or kind for scanability.
- Show evidence type and confidence per finding.
- Conflicts are visible and never silently overridden.

Status and errors:
- Soft failure renders low confidence and kind=unclear.
- Hard failure renders pulsing error state and kind=error.
- All failures still emit a valid result payload.

## State Model (Planning-Level)
The view owns display state and relies on services for execution.

Suggested state fields:
- scope, targetId, mode, activeQuestionId, activeSessionId.
- activeResult, activeZone, isRunning, lastError.
- cacheStatus, corpusFingerprint, settingsSnapshot, isNarrowLayout.

Session cache:
- LRU, max 30 sessions.
- Keyed by question id, scope, target id, mode, corpus fingerprint.
- Never auto-rerun; mark stale if question or corpus changes.

## Settings and Persistence
Inquiry relies on plugin settings and plugin data only.

Settings required:
- Inquiry sources configuration, enable cache, max sessions.
- Artifact folder path (default `Radial Timeline/Inquiry/Artifacts/`).
- Embed JSON payload in Artifacts toggle.
- Optional source folders for character, place, power references.

Persistence rules:
- Sessions and custom questions stored in plugin data.
- Artifacts written to vault only on explicit generate/save.
- Artifact folder auto-created if missing.
- Scene notes and YAML are never modified.

## Implementation Plan (Phased)
Phase 1: Structure and state
- Add new Inquiry view type with command palette and ribbon entry points.
- Create `src/inquiry/*` scaffolding and `inquiry.css`.
- Add Inquiry Primary View container and layout scaffolding.
- Implement view state model and service interfaces.
- Wire scale, mode, and navigation controls without Inquiry execution.
- Add minimap rendering and drill-down behavior.
- Add desktop-only gating with mobile message and artifact links.

Phase 2: Inquiry execution and rendering
- Integrate Inquiry runner and strict output parsing.
- Add zone hover and question icon interactions.
- Render summary, verdict, findings, and evidence metadata.
- Bind ring visuals to result severity and confidence.
- Add Details expander for corpus fingerprint and cache metadata.

Phase 3: Cache, artifacts, and settings
- Implement LRU session cache and staleness rules.
- Add artifact generation workflow and file output.
- Expose settings for sources, cache, artifact folder, and JSON embedding.
- Add error handling, fallback payloads, and UI states.

## Acceptance Criteria (Planning Stage)
- Inquiry launches as a new view type from command palette and ribbon.
- The Primary View can render at scene, book, and saga scale with navigation.
- Desktop renders a right-hand findings panel that collapses into a drawer when narrow.
- Mobile shows a desktop-only message with artifact links.
- Inquiry can be triggered and returns a strict result payload.
- Findings and verdict visualize severity and confidence consistently.
- Artifacts can be generated without modifying any story files and are stored in the configured folder.
- Cache behavior is predictable, capped, and visibly stale when needed.
