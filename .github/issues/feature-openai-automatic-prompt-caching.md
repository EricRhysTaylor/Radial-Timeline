---
title: "Implement Automatic Prompt Caching (openai)"
labels: ai-feature, openai, p0
---

## Feature: Automatic Prompt Caching

**Provider:** openai
**Category:** cost-optimization
**Maturity:** ga
**ROI Category:** cost
**Implementation Complexity:** low

## Description

Automatic 50% discount on cached input tokens for prompts >1024 tokens with identical prefixes. Requires stable system message prefix — currently defeated by system/user concatenation.

## Documentation

https://platform.openai.com/docs/guides/prompt-caching

## Relevant Plugin Features

- gossamer
- inquiry
- sceneAnalysis

## Implementation Notes

OpenAI automatically caches prompts >1024 tokens with stable prefixes (50% discount). Currently DEFEATED because openaiApi.ts line 82 concatenates system+user into a single user message. Fix: separate into system and user messages for non-reasoning models.

## Source Files

- `src/api/openaiApi.ts`

## Blockers

None
