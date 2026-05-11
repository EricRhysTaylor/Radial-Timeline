---
title: v7 Removals
status: pending
target-version: 7.0.0
---

# Things to remove at version 7

Migration shims and deprecated fallbacks kept for users upgrading from v6.x. When cutting v7, search the codebase for `TODO(v7)` to find every touch point.

## 1. Teaser reveal value rename: `'bar'` → `'ring'`

**Context:** During v6.0.x, the internal `TeaserRevealLevel` value `'bar'` was renamed to `'ring'` to match the user-facing "Ring" label. A one-way migration converts any saved `'bar'` to `'ring'` on settings load.

**At v7, remove:**

- `normalizeAprDefaultViewMode()` in [src/authorProgress/authorProgressConfig.ts](../../../src/authorProgress/authorProgressConfig.ts) — specifically the `if (value === 'bar') return 'ring';` line. The function itself can stay; just drop the legacy branch.
- Any `TODO(v7)` comments referencing this rename.

**Why it's safe at v7:** Anyone running v7 will have loaded their settings under v6.x at least once, which silently rewrites `'bar'` → `'ring'` and persists. By the time v7 ships, no live settings file should still contain `'bar'`. Users who skip v6.x entirely (jumping from v5 or earlier directly to v7) wouldn't have `aprDefaultViewMode` at all — it's a v6-era field.

## How to add entries here

When you add a migration shim or deprecation:

1. Add the inline comment `// TODO(v7): <one-line reason>` at the offending code.
2. Add a section here describing what to remove and why it's safe to remove then.

When you cut v7:

1. `grep -rn "TODO(v7)" src/` — find all marked code
2. Walk through each section in this doc, delete the marked code, delete the section.
3. Delete this file if empty.
