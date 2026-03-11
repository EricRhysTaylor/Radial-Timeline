# AI Strategy Adapter Roadmap (March 2026)

## Purpose
Concrete status map for RT provider adapters and an execution roadmap to align capability claims with real runtime behavior.

## Current Adapter Reality

| Provider | Runtime adapter lane in RT | Direct manuscript citations (Inquiry workflow) | Grounded/tool attribution | Multi-turn lane before final response | Context class in RT model registry |
| --- | --- | --- | --- | --- | --- |
| Anthropic | `Messages API` via `callAnthropicApi` | Available in RT (document blocks + citations) | Not wired in RT | Not modeled as a separate pre-response lane in RT | 200k default in current RT registry |
| OpenAI | `Chat Completions API` via `callOpenAiApi` | Not wired in RT manuscript flow | Provider-supported (annotation citations), not wired in RT | Provider lane exists on Responses API; RT gap | 1,050,000 |
| Google Gemini | `generateContent` via `callGeminiApi` | Not available in RT manuscript flow | Provider-supported (grounding metadata), not wired in RT | Multi-turn/interaction lane not modeled in RT adapter | 1,048,576 |

## File-Level Evidence

- Anthropic manuscript citation flow:
  - `src/api/anthropicApi.ts` (`buildAnthropicUserContent`, `citations.enabled`, citation mapping)
  - `src/ai/runtime/aiClient.ts` (`useDocumentBlocks` branch for Inquiry)
- OpenAI current lane:
  - `src/api/openaiApi.ts` (`/v1/chat/completions` only)
  - `src/ai/providers/openaiProvider.ts` (routes through `callProvider` -> Chat Completions path)
- Gemini current lane:
  - `src/api/geminiApi.ts` (`models/*:generateContent` only)
  - `src/ai/providers/googleProvider.ts`
- Capability abstraction currently overloaded:
  - `src/ai/types.ts` (`EngineCapabilities.sources` single axis)
  - `src/ai/caps/engineCapabilities.ts` (`sources` used as one composite signal)

## Gap Statement

- RT currently has one mature attribution workflow: Anthropic direct manuscript citations for Inquiry.
- OpenAI and Gemini both have attribution-capable provider features, but RT does not map those outputs into Inquiry source UX yet.
- GPT-5.4 Pro positioning in provider docs is on a Responses API lane that RT does not yet use.

## Roadmap (Ordered)

### Phase 1 (now): Truthful Strategy + Matrix Surfaces
- Completed in this pass:
  - AI Strategy copy/pills now show support status explicitly (`available in RT` vs `provider-supported, not integrated`).
  - OpenAI GPT-5.4 Pro Responses API lane shown as a support-status gap.
- Files:
  - `src/settings/sections/AiSection.ts`
  - `src/data/aiModels.ts`

### Phase 2 (completed): Capability Model Normalization
- Split attribution into separate dimensions:
  - `directManuscriptCitations`
  - `groundedToolAttribution`
- Kept legacy `sources` as a backward-compat alias of `directManuscriptCitations`.
- Migrated Inquiry advisory citation preference checks to the direct-manuscript axis.
- Files changed:
  - `src/ai/types.ts`
  - `src/ai/caps/engineCapabilities.ts`
  - `src/inquiry/services/inquiryAdvisory.ts`

### Phase 3: OpenAI Responses Adapter
- Add Responses API execution path and model-lane routing rules.
- Keep Chat Completions path for compatible models while migrating.
- Add explicit per-model lane metadata to prevent silent fallback claims.
- Files to change:
  - `src/api/openaiApi.ts` (or new `openaiResponsesApi.ts`)
  - `src/ai/providers/openaiProvider.ts`
  - `src/ai/runtime/aiClient.ts`
  - `src/ai/registry/builtinModels.ts`

### Phase 4: Gemini Grounding Mapping
- Add grounding/tool config to Gemini request path when enabled.
- Parse grounding metadata into a normalized attribution object.
- Render grounded attribution separately from manuscript citations in Inquiry UI.
- Files to change:
  - `src/api/geminiApi.ts`
  - `src/ai/types.ts`
  - `src/inquiry/services/inquirySources.ts` and related renderers

## Acceptance Criteria for “Parity Claims”

Do not claim parity for a provider until all are true:
1. Adapter path is implemented in RT runtime (not just provider docs).
2. Response metadata is parsed into normalized attribution structures.
3. Inquiry UI renders that attribution in the source panel.
4. Strategy matrix marks status `available` (not `provider-supported, not integrated`).
