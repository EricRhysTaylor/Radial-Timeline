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

## 2. All v5 → v6 migration shims

**Context:** v6 introduced a large data-model shift (BookProfile, new AI settings shape, secret-storage credentials, beat-system per-book, publishing model, internalized export folders, deprecated synopsis line limits, etc.). For the v5→v6 cycle, every load runs migration functions and tolerates legacy field shapes. By the time v7 ships, no live settings file should still be on a pre-v6 shape — anyone who has opened the plugin once on v6 has had their data rewritten and persisted in the new format.

**At v7, audit and remove the v5-era migration layer.** This is intentionally framed as an *audit checklist* rather than an enumeration, because the inventory will drift; rely on the grep commands below as the source of truth.

### Audit checklist

```bash
# Migration entry points (start here)
grep -n "migrate\|Migration\|stripLegacy" src/main.ts

# Files entirely dedicated to v5→v6 migration
ls src/migrations/                      # e.g. beatSettings.ts
grep -l "migrate\|Legacy" src/authorProgress/ src/ai/settings/

# Deprecated fields kept only for migration reads
grep -rn "@deprecated" src/ --include="*.ts"

# Field-level legacy fallbacks
grep -rn "Legacy\|legacy" src/ --include="*.ts" | grep -v test | grep -v Gossamer
```

### Removal pattern

For each `@deprecated Kept for migration` field in [src/types/settings.ts](../../../src/types/settings.ts):
1. Search the codebase for reads of that field. If the only reader is the migration function, remove both the field and the read.
2. If anything else still reads it, that's a real bug — fix that first.

For each migration function (`migrateAiSettings`, `migrateBeatSettings`, `migrateAuthorProgressSettings`, `migrateLegacyKeysToSecretStorage`, `migratePublishingModelState`, `syncLegacySourcePathFromActiveBook`, etc.):
1. Inline-comment what it converts FROM.
2. If "from" is a v5-era shape, delete the function and the call site.
3. If "from" is still possible at v7 (e.g., a v6.x intermediate shape that later changed), keep it and document why under section 1 / 3 / etc. of this doc.

### Why it's safe at v7

The v6.0 release wave already runs the migration on every load and persists the result. A user upgrading 5.x → 7.0 directly is the only edge case — and for that path, the right answer is "v7 requires v6.x as an intermediate step." Document that in release notes; don't carry six-year-old migration code forever.

### Likely candidates to confirm at v7 cutover

These are believed to be v5-era and removable at v7, but each should be verified during the audit. **Do not blindly delete from this list** — confirm each one is truly v5-era and that no v6-introduced code still depends on it.

- `src/migrations/beatSettings.ts` — entire file, plus `migrateBeatSettings` / `stripLegacyBeatSettings` calls in main.ts
- `src/ai/settings/migrateAiSettings.ts` — `migrateAiSettings` / `stripLegacyAiSettings` (verify the v5 AI shape it converts from)
- `migrateLegacyKeysToSecretStorage` in `src/ai/credentials/credentials.ts` — the pre-secret-storage key migration
- `migrateAuthorProgressSettings` legacy-defaults reading in `src/authorProgress/authorProgressConfig.ts` — but **keep** the new-field normalizers (`normalizeAprDefaultViewMode`, etc.) and the v6-era `'bar'` → `'ring'` migration (covered in section 1).
- `syncLegacySourcePathFromActiveBook` in `src/main.ts` (line ~219)
- `shouldSeedBookProfileFromLegacySettings` and the legacy `sourcePath` / `bookTitle` seeding path in `loadSettings`
- `convertExportProfileToLegacyManuscriptExportTemplate` / `migratePublishingModelState` (verify v6 doesn't still write legacy templates for compatibility)
- Legacy manuscript/outline folder migration block in `src/main.ts` (line ~746)
- `@deprecated` fields in `src/types/settings.ts` and `src/settings/defaults.ts` whose only readers are the above migration functions

## How to add entries here

When you add a migration shim or deprecation:

1. Add the inline comment `// TODO(v7): <one-line reason>` at the offending code.
2. Add a section here describing what to remove and why it's safe to remove then.

When you cut v7:

1. `grep -rn "TODO(v7)" src/` — find all marked code
2. Walk through each section in this doc, delete the marked code, delete the section.
3. Delete this file if empty.
