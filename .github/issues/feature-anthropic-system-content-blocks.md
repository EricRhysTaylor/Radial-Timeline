---
title: "Implement System Content Blocks (anthropic)"
labels: ai-feature, anthropic, p0
---

## Feature: System Content Blocks

**Provider:** anthropic
**Category:** capability
**Maturity:** ga
**ROI Category:** capability
**Implementation Complexity:** low

## Description

Send system prompt as an array of typed content blocks instead of a plain string. Prerequisite for prompt caching and multi-part system instructions.

## Documentation

https://docs.anthropic.com/en/api/messages

## Relevant Plugin Features

- gossamer
- inquiry
- sceneAnalysis
- synopsis
- pulse

## Implementation Notes

callAnthropicApi sends system as a plain string (line 47: requestBody.system = systemPrompt). Must restructure to array of content blocks: [{ type: 'text', text: ... }]. Prerequisite for prompt caching.

## Source Files

- `src/api/anthropicApi.ts`

## Blockers

None
