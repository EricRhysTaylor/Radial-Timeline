# AI Model Curation Standard

Adding a provider model is an API integration, not a registry-only update.

## Required Curation Contract

Every curated cloud model must resolve to an explicit request profile through
`src/ai/registry/modelRequestProfiles.ts`.

The profile must define:

- request sampling support: `supportsTemperature`, `supportsTopP`
- structured output support: `supportsJsonSchema`
- reuse support: `supportsPromptCache`
- source support: `supportsCitations`, `supportsEvidenceDocuments`
- thinking controls: `supportsThinkingBudget`, `supportsDisableThinking`, `supportsReasoningEffort`
- provider endpoint preference when applicable, for example OpenAI Responses API

Provider defaults are allowed, but model-family exceptions must live in the
request profile layer, not in scattered provider adapters.

## New Model Checklist

Before a model is added to the picker or made latest-stable:

1. Verify official provider docs for endpoint, request parameters, response format, cache usage fields, context/output limits, and pricing.
2. Add or update the model registry entry and remote `scripts/models/registry.json`.
3. Add pricing, cache-read pricing, long-context thresholds, and dated snapshot pricing where applicable.
4. Add or update the request profile.
5. Add payload tests for the model's JSON run path and cache path.
6. Add negative tests for forbidden parameters.
7. Run model drift and pricing validation.
8. Run targeted provider, selector, pricing, and Inquiry execution tests.

## No Silent Compatibility

Do not rely on provider rejection to discover unsupported parameters.
The sanitizer must strip unsupported fields before dispatch, and adapter-level
guards must prevent direct legacy calls from bypassing the sanitizer.

Do not clear release-watch alerts for a new model until registry, pricing,
request profile, payload, cache, and selector tests all pass.
