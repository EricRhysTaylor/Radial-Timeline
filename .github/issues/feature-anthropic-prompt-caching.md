---
title: "Implement Prompt Caching (anthropic)"
labels: ai-feature, anthropic, p0
---

## Feature: Prompt Caching

**Provider:** anthropic
**Category:** cost-optimization
**Maturity:** ga
**ROI Category:** cost
**Implementation Complexity:** medium

## Description

Cache system prompts and large content blocks using cache_control markers. Subsequent requests pay only for cache reads (~90% cheaper). Requires content block array format for system prompt.

## Documentation

https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching

## Relevant Plugin Features

- gossamer
- inquiry
- sceneAnalysis

## Implementation Notes

System prompt sent as plain string in anthropicApi.ts. Needs content block array with cache_control: { type: 'ephemeral' } on evidence blocks. Gossamer and Inquiry send identical evidence across calls — caching would save ~90% on input tokens.

## Source Files

- `src/api/anthropicApi.ts`
- `src/ai/providers/anthropicProvider.ts`
- `src/api/providerRouter.ts`

## Blockers

- Requires anthropic-system-content-blocks to be implemented first
