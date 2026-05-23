# AI Model Curation Standard

Adding a provider model is an API integration, not a registry-only update.

**Read [`model-promotion.md`](model-promotion.md) first.** That document defines *when* a model is allowed to enter the catalog at all. This document defines *how* to add it once promotion has been approved. Adding a model that doesn't pass the promotion policy is not allowed even if the curation checklist below is met.

## Required Curation Contract

Every curated cloud model must resolve to an explicit request profile through
`src/ai/registry/modelRequestProfiles.ts`.

The profile must define:

- request sampling support: `supportsTemperature`, `supportsTopP`
- structured output support: `supportsJsonSchema`
- reuse support: `supportsPromptCache`
- source support: `supportsCitations`, `supportsEvidenceDocuments`
- thinking controls: `supportsThinkingBudget`, `supportsReasoningEffort`
- provider endpoint preference when applicable, for example OpenAI Responses API

Provider defaults are allowed, but model-family exceptions must live in the
request profile layer, not in scattered provider adapters.

## New Model Checklist

Before a model is added to the picker:

1. Verify official provider docs for endpoint, request parameters, response format, cache usage fields, context/output limits, and pricing.
2. Add the model registry entry to `src/ai/registry/builtinModels.ts` and remove the entry it replaces (per the promotion policy — promotions are atomic swaps, not accretions).
3. Update `scripts/models/registry.json` to match.
4. Add pricing, cache-read pricing, and long-context thresholds in `src/ai/cost/providerPricing.ts`.
5. Add or update the curated picker entry in `src/data/aiModels.ts`.
6. Add or update the request profile in `src/ai/registry/modelRequestProfiles.ts`.
7. Run `npm run gates` — the catalog dispatch contract test in `src/ai/registry/modelCatalogContract.test.ts` auto-iterates `BUILTIN_MODELS` so the new model's capabilities are exercised through the sanitizer immediately.
8. Run a real Inquiry against the new model on a real corpus to confirm end-to-end behavior. The contract test pins capability-to-dispatch flow; only a live run catches provider-specific runtime surprises like the Gemini 3.5 Flash thinking-budget gap.

## No Silent Compatibility

Do not rely on provider rejection to discover unsupported parameters.
The sanitizer must strip unsupported fields before dispatch, and adapter-level
guards must prevent direct legacy calls from bypassing the sanitizer.

Do not clear release-watch alerts for a new model until registry, pricing,
request profile, and the catalog dispatch contract test all pass.

## See also

- [`model-promotion.md`](model-promotion.md) — when a model is allowed to enter the catalog
- [`code-doctrine.md`](code-doctrine.md) — § Prefer One Canonical Path, § Fail Clearly Instead of Falling Back
- [`inquiry-critical-path-rules.md`](inquiry-critical-path-rules.md) — capabilities, fallback, and silent-substitution rules on the AI critical path
