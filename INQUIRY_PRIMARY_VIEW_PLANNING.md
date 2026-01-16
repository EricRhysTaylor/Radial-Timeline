# Inquiry Primary View Planning Document (Planning Stage)

## Overview
This document defines the planning-stage blueprint for the Inquiry Primary View in Radial Timeline. It translates the v1 Inquiry spec into UI structure, data flow, and implementation steps without changing any story files.

## Scope
In scope for this planning stage:
- Primary view layout, interactions, and visual bindings for Inquiry.
- State model, caching, and artifact generation flow for Inquiry sessions.
- Corpus boundary enforcement and evidence weighting integration.
- Error and empty-state handling aligned with the Inquiry output contract.

Out of scope for this planning stage:
No prose rewriting, no background scanning, no auto-fix workflows, no updates to scene notes or scene YAML.

## Non-Negotiables (From Spec)
- The author writes all prose; AI never rewrites story text.
- Inquiry never modifies scene notes or scene YAML.
- Inquiry operates only on configured sources, not the full vault.
- All AI outputs are ephemeral unless saved as an Artifact.
- Canon precedence: scene, book outline, saga outline, references.

## Primary View Layout (High-Level)
The Inquiry Primary View is a focused inspector with a central glyph, dual rings, and three question zones. It replaces scrolling with navigation controls and a minimap.

```
| [Scale: Scene | Book | Saga]  [Mode: Flow | Depth]  [Artifact] |
|                                                                |
|  [Minimap strip / ticks]                                       |
|                                                                |
|                 Setup   Pressure   Payoff                      |
|                     \     |     /                               |
|                    [Center Glyph + Rings]                      |
|                                                                |
|  [Findings Panel]  Summary, Verdict, Findings, Evidence         |
|                                                                |
| [Prev/Next or Up/Down]  [Cache Status]  [Confidence]           |
```

Key elements:
- Center glyph shows scope marker: S#, B#, or Sigma for saga.
- Two rings render at all times: inner ring is Flow, outer ring is Depth.
- Three inquiry zones surround the glyph: Setup, Pressure, Payoff.
- Findings panel shows result summary, verdict, and structured findings list.

## Interaction Model
Primary interactions must be explicit, reversible, and non-destructive.

Mode and scope:
- Mode switch swaps available questions, orientation, and ring emphasis.
- Scale selector changes target scope without auto-running Inquiry.
- Navigation arrows move within scope or hierarchy based on mode.
- Minimap ticks allow drill-down and quick navigation.

Inquiry triggers:
- Hover a zone to reveal up to 10 question icons.
- Click an icon to run Inquiry or load cached session.
- Changing mode clears active Inquiry visuals but preserves cache.
- Artifact generation captures the active session and resets state.

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

## Visual Binding Rules
UI binds to Inquiry results without altering the underlying corpus.

Rings:
- Always render with neutral baseline when no active session.
- Fill uses confidence or completeness, color uses severity.
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
- cacheStatus, corpusFingerprint, settingsSnapshot.

Session cache:
- LRU, max 30 sessions.
- Keyed by question id, scope, target id, mode, corpus fingerprint.
- Never auto-rerun; mark stale if question or corpus changes.

## Settings and Persistence
Inquiry relies on plugin settings and plugin data only.

Settings required:
- Inquiry sources configuration, enable cache, max sessions.
- Embed JSON payload in Artifacts toggle.
- Optional source folders for character, place, power references.

Persistence rules:
- Sessions and custom questions stored in plugin data.
- Artifacts written to vault only on explicit generate/save.
- Scene notes and YAML are never modified.

## Implementation Plan (Phased)
Phase 1: Structure and state
- Add Inquiry Primary View container and layout scaffolding.
- Implement view state model and service interfaces.
- Wire scale, mode, and navigation controls without Inquiry execution.
- Add minimap rendering and drill-down behavior.

Phase 2: Inquiry execution and rendering
- Integrate Inquiry runner and strict output parsing.
- Add zone hover and question icon interactions.
- Render summary, verdict, findings, and evidence metadata.
- Bind ring visuals to result severity and confidence.

Phase 3: Cache, artifacts, and settings
- Implement LRU session cache and staleness rules.
- Add artifact generation workflow and file output.
- Expose settings for sources, cache, and JSON embedding.
- Add error handling, fallback payloads, and UI states.

## Open Questions
- Should Inquiry live as a new view type or a mode within the existing timeline view?
- Where does the Findings Panel live on smaller screens, and what is the mobile layout?
- What icon set and visual language should be used for question icons and ring states?
- How is corpus fingerprint computed and surfaced in UI?

## Acceptance Criteria (Planning Stage)
- The Primary View can render at scene, book, and saga scale with navigation.
- Inquiry can be triggered and returns a strict result payload.
- Findings and verdict visualize severity and confidence consistently.
- Artifacts can be generated without modifying any story files.
- Cache behavior is predictable, capped, and visibly stale when needed.
