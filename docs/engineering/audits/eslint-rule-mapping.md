# Quality-Gate → Official ESLint Rule Mapping

Decision artifact for the gate-tooling overhaul. Built **before** any deletion so
project doctrine is not mistaken for generic Obsidian guidance that
`eslint-plugin-obsidianmd` now owns.

Status: **planning / report-only**. No checks removed yet. Nothing is deleted
until step 3 (ESLint adopted as a real gate) has run report-only long enough to
know the blast radius.

## Preconditions discovered

- `eslint@^8.57.1` and `@typescript-eslint/*@^6.21.0` are in `devDependencies`,
  but **no ESLint config file exists** (`.eslintrc*` / `eslint.config.*` absent)
  and **`eslint-plugin-obsidianmd` is not installed**. `npm run audit:eslint`
  therefore lints against no rules and is non-blocking (`|| true`).
- The official plugin targets **flat config / ESLint 9**. Adopting it implies an
  **ESLint 8→9 and typescript-eslint 6→8 upgrade** — fold that into step 3's scope.
- Existing CI: `.github/workflows/pricing-check.yml` (blocking, pricing only) and
  `.github/workflows/sanitation-audit.yml` (non-blocking). No blocking
  lint/typecheck/build/test workflow on push/PR yet (step 5).

## Legend

- **REPLACE** — official AST rule supersedes our regex; delete ours once ESLint gate is blocking.
- **CORE** — covered by an ESLint core or `@typescript-eslint` rule (not the Obsidian plugin); enable that rule, delete ours.
- **KEEP** — project doctrine or security check the official plugin does **not** cover. Stays.
- **GAIN** — official rule with **no** current equivalent; new coverage we pick up for free.

---

## code-quality-check.mjs

| Custom check (line) | Official rule | Verdict | Notes |
|---|---|---|---|
| `innerHTML` / `outerHTML` assignment (16–17) | *(none — plugin has no innerHTML rule)* | **KEEP** | Security/XSS. Dedupe with compliance-check's `innerHTML`/`outerHTML` (same intent, two scripts). |
| inline `style=` / `.style.prop=` (18–21) | `no-static-styles-assignment` | **REPLACE** | Direct match. |
| `document.createElement(...).style=` (21) | `no-static-styles-assignment` | **REPLACE** | Same rule. |
| `getLeaf().openFile()` (22) | *(none exact)* | **KEEP** | Our workspace.openLinkText preference; not generic. |
| `: any` type (48) | `@typescript-eslint/no-explicit-any` | **CORE** | Type-checked rule catches `as any`, `any[]`, generics our regex misses. |
| CSS class must be `ert-`/`is-`/`has-` prefixed (72–125) | *(none)* | **KEEP** | **ERT design-system doctrine. Do not delete.** |
| `settings.css` scoped under `.rt-settings-root` (207–231) | *(none)* | **KEEP** | Project scoping doctrine. |

## compliance-check.mjs — source-scan rules

| Rule id | Official rule | Verdict | Notes |
|---|---|---|---|
| `innerHTML`, `outerHTML`, `svg-innerHTML-reassignment` | *(none)* | **KEEP** | Security; consolidate with code-quality-check. |
| `eval` | core `no-eval` | **CORE** | |
| `new-function` | core `no-new-func` | **CORE** | |
| `node-core-import`, `node-core-require` | `no-nodejs-modules` | **REPLACE** | |
| `console-log` | core `no-console` | **CORE** | |
| `nodejs-timeout-type`, `bare-timeout-call` | `prefer-window-timers` | **REPLACE** | Auto-fixable upstream. |
| `var-declaration` | core `no-var` | **CORE** | |
| `platform-import-check` | `platform` | **REPLACE** | |
| `detach-leaves-in-onunload` | `detach-leaves` | **REPLACE** | Direct match, **auto-fixable** upstream. |
| `persistent-view-reference` | `no-view-references-in-plugin` | **REPLACE** | Direct match; retires our look-ahead heuristic. |
| `markdown-render-source` | `no-plugin-as-component` | **REPLACE** | Overlapping intent; confirm coverage before deleting. |
| `raw-addEventListener` | *(none)* | **KEEP** | registerDomEvent guidance; our heuristic is fragile but unique. |
| `observer-without-cleanup`, `animation-frame-without-cleanup`, `interval-without-register` | *(none)* | **KEEP** | Lifecycle-leak heuristics; fragile, but no upstream equivalent. |
| `fetch`, `xhr`, `fetch-without-signal` | *(none)* | **KEEP** | requestUrl preference + abort-signal; project. |
| `adapter` (vault.adapter) | *(partial: `vault/iterate`, trash rules)* | **KEEP** | Not equivalent; keep. |
| `normalize-path-missing` | *(none)* | **KEEP** | Project. |
| `requestUrl-import` | *(none)* | **KEEP** | Project. |
| `secret-openai`, `secret-anthropic`, `secret-google` | *(none)* | **KEEP** | Secret scanning; security. |
| `deprecated-frontmatter-props` | *(none)* | **KEEP** | Project. |

## compliance-check.mjs — manifest / release rules

| Rule id | Official rule | Verdict | Notes |
|---|---|---|---|
| `manifest-required`, `manifest-id-kebab`, `manifest-minApp`, `manifest-id-match` | `validate-manifest` | **REPLACE** | Confirm the plugin checks each field we do before deleting. |
| `release-version-match`, `pkg-version-match`, `release-artifacts`, `release-ignored` | *(none)* | **KEEP** | Our release/vault-copy process; not generic. |

## Whole-script verdicts (other gates)

| Script | Verdict | Notes |
|---|---|---|
| `scripts/fallback-gate.mjs` | **KEEP** | No-fallback doctrine. Core to RT engineering standards. |
| `scripts/css-drift-check.mjs` / `css-drift-report.mjs` | **KEEP** | CSS budget; ESLint does not lint CSS. (stylelint is a separate future option.) |
| `scripts/scan-ert-classes.mjs` | **KEEP** | ERT class-usage audit; project. |
| `scripts/audit-spec-coverage.mjs` | **KEEP** | DesignedStyleSpec coverage; project. |
| `scripts/check-*-ert-lock.mjs` (×4) | **KEEP → consolidate** | Project namespace locks. Merge 4 near-identical copies into 1 parameterized script (separate cleanup, not a delete). |
| `scripts/check-model-*`, `validate-pricing.mjs`, `check-model-coverage.mjs` | **KEEP** | Model/pricing consistency; project. |
| `scripts/check-translations.mjs` | **KEEP** | i18n coverage. (Replace internal `eval()` fallback during lib cleanup.) |
| `scripts/check-obsidian-review-readiness.mjs` | **KEEP (partial overlap)** | `validate-manifest` + `no-unsupported-api` overlap some fields; keep release-readiness shell. |
| `scripts/check-obsidian-version.mjs` | **KEEP** | minAppVersion freshness; informational. |

## New coverage GAINED by adopting the plugin

These have no current equivalent — pure upside:

- `ui/sentence-case`, `ui/sentence-case-json`, `ui/sentence-case-locale-module`
- `settings-tab/no-manual-html-headings`, `settings-tab/no-problematic-settings-headings`
- `no-unsupported-api` (APIs below `minAppVersion`)
- `commands/*` (command id/name hygiene), `no-default-hotkeys`
- `prefer-instanceof`, `no-tfile-tfolder-cast`, `prefer-active-doc`, `no-global-this`
- `validate-license`, `regex-lookbehind` (iOS), `editor-drop-paste`

## Net result

- **REPLACE/CORE (retire after ESLint is blocking):** ~13 checks — inline styles,
  `any`, node imports, console, timers, var, platform, detach-leaves, view refs,
  markdown-render, manifest validation.
- **KEEP (project doctrine / security):** ERT prefixes + settings scope, innerHTML
  family, fallback gate, css-drift, ERT locks, model/pricing/spec/i18n, secrets,
  lifecycle-leak heuristics, release/version checks.
- **GAIN:** ~15 new Obsidian-guideline rules currently unchecked.

Deletion happens **only** after step 3 has run ESLint report-only and the
REPLACE rows are confirmed to fire on the same violations ours catch.
