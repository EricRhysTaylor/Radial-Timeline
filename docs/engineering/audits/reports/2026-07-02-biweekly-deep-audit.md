# Biweekly Deep Audit

- Version: 6.2.6
- Branch: master
- Upstream: origin/master
- Baseline: HEAD~1 (e8d08e65)
- Risk Level: Low

## Files Changed
- docs/engineering/audits/reports/2026-07-02-friday-release-gate.md
- scripts/models/feature-audit.json
- scripts/models/latest-aliases.json
- scripts/models/model-drift-report.json
- Major systems touched: scripts(3), docs(1)

## Recent Commits
- d8ee1b33 2026-07-02 [backup] 2026-07-02 09:17 — scripts(3), docs(1) — --quiet — 4 files — +90/-3
- e8d08e65 2026-07-02 [backup] 2026-07-02 09:16 — scripts(3), docs(1) — --quiet — 4 files — +72/-3
- 4559466b 2026-07-02 [backup] 2026-07-02 09:15 — scripts(3) — --quiet — 3 files — +3/-3
- 4d47854e 2026-07-02 [backup] 2026-07-02 09:01 — scripts(3), src(1) — --quiet --note Community tab copy: positive next-step guidance — 4 files — +47/-37
- 921da277 2026-07-02 [backup] 2026-07-02 08:54 — scripts(3), src(1) — --quiet automatic backup after build — 4 files — +82/-48
- e0837327 2026-07-01 [backup] 2026-07-01 19:36 — scripts(3) — --quiet — 3 files — +3/-3
- 1c779ff6 2026-07-01 [backup] 2026-07-01 19:25 — scripts(3) — --quiet automatic backup after build — 3 files — +4/-4
- 18801652 2026-07-01 [backup] 2026-07-01 19:23 — wiki(21), scripts(4), src(4) — --quiet automatic backup after build — 30 files — +103/-35
- 0ba1526b 2026-06-28 [backup] 2026-06-28 09:27 — scripts(3) — --quiet automatic backup after build — 3 files — +3/-3
- a68e181d 2026-06-27 [backup] 2026-06-27 20:09 — scripts(3) — --quiet automatic backup after build — 3 files — +3/-3
- 72bbea26 2026-06-27 Add Community Share wiki page
- a3a888ec 2026-06-27 [backup] 2026-06-27 18:03 — scripts(4) — --quiet automatic backup after build — 4 files — +7/-7
- 8d69cc09 2026-06-27 Match Community hero layout to the Core hero
- d5a88d18 2026-06-27 Sentence-case Community Share UI copy; fix label test pins
- 96ad2689 2026-06-27 Tighten settings nav labels and fix Community tab spacing
- 6fdd012f 2026-06-27 Wire Community Share safety controls
- e8d10f1d 2026-06-27 Wire Community Share manual publish
- 2f0744cf 2026-06-27 Add Community Share complete preview
- 34df386d 2026-06-27 Wire Community Share activation confirm
- 73c995da 2026-06-27 Add Community Share settings tab shell

## Validation Gates
- AI model drift: Pass (37ms)
- API feature audit: Pass (62ms)
- Model coverage: Pass (24ms)
- CSS duplicates: Pass (37ms)
- Production build: Pass (4.4s)
  > node show-scripts.mjs --quiet && node scripts/check-social-ert-lock.mjs --quiet && node scripts/check-inquiry-ert-lock.mjs --quiet && node scripts/check-modal-settings-ert-lock.mjs --quiet && node scripts/check-timeline-chrome-ert-lock.mjs --quiet && npx tsc --noEmit && node code-quality-check.mjs src/main.ts src/styles/settings.css --quiet && node check-css-duplicates.mjs --quiet && node esbuild.config.mjs production && node check-css-duplicates.mjs --quiet
  Build copied to: Author/New/Fresh/Jane Austen/Sherlock Holmes/P&P/Timelapse/release
  Production build complete!
- Code quality: Pass (187ms)
  ✅ Code quality check passed!
  📖 See docs/engineering/standards/code-standards.md for full guidelines.
- Obsidian review: Pass (254ms)
  - README and privacy/security disclosures are present.
  - Runtime network/platform/filesystem checks passed.
  - Release eyeball checklist is present.
- Obsidian lint baseline: Pass (6.5s)
    - @typescript-eslint/no-unnecessary-type-assertion: 0 (baseline 0, delta 0)
    - @typescript-eslint/no-floating-promises: 0 (baseline 0, delta 0)
  [obsidian-lint-enforced] PASS: selected Obsidian lint debt did not increase.
- Obsidian lint (report-only): Pass (14.5s)
  Obsidian lint (report-only): 324 problems total, 4 from obsidianmd rules — top: prefer-active-doc(3), commands/no-plugin-id-in-command-id(1). See .gate-logs/eslint-obsidian.json.
- CSS drift: Pass (425ms)
    - shadow-rgba: 44 (baseline 44, delta +0)
    - rt-legacy: 1131 (baseline 1131, delta +0)
  ✅ CSS drift gate passed.
- Compliance: Pass (545ms)
  Compliance: delta -1. See the compliance log.
- Spec coverage: Pass (100ms)
  Allow-listed:  17/50
  Failures:      0/50
  ✅ Audit passed.
- Unit tests: Pass (2.4s)
        Tests  2531 passed | 2 skipped (2533)
     Start at  09:18:13
     Duration  2.13s (transform 6.87s, setup 798ms, import 12.63s, tests 1.95s, environment 17ms)

## Changed-Code Scope
- 4 changed file(s) across: scripts(3), docs(1).
- Scope only. This audit does not perform automated changed-code defect analysis; see Validation Gates above for pass/fail.

## Critical Risks
- None.

## Notices
- None.

- Overall Repository Health: Excellent
- Ship Readiness: Ship

## Recommended Actions
### Do Now
- None.
### Schedule Later
- Obsidian lint (report-only): 324 problems total, 4 from obsidianmd rules — top: prefer-active-doc(3), commands/no-plugin-id-in-command-id(1). See .gate-logs/eslint-obsidian.json.
- Compliance: delta -1. See the compliance log.
### Ignore
- None.
