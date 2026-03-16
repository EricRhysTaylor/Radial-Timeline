# CSS Guidelines

Use this document together with `ui-architecture.md`. This page explains current CSS scope boundaries and what the repo actually enforces today.

## Current Scope Contract

### Settings root
Shared settings shell CSS belongs under:
- `.ert-ui`
- `.ert-scope--settings`
- `.ert-settings-root` when the rule is specific to the settings subtree

### Modal root
Shared modal shell CSS belongs under:
- `.ert-ui`
- `.ert-scope--modal`
- `.ert-modal-shell`
- `.ert-modal-container`

Do not mix settings-root selectors and modal-root selectors casually. They are separate scopes with different shell expectations.

## File Ownership
- `src/styles/rt-ui.css`
  Active shared ERT shell, archetypes, tokens, skins, and current settings/modal contracts.
- `src/styles/settings.css`
  Minimal Obsidian wiring and narrow settings glue.
- `src/styles/modal.css`
  Legacy/supporting modal selectors still in use, but not the primary source of modal shell architecture.
- `src/styles/legacy/*.css`
  Legacy islands and extracted migration selectors.

## Current Naming Reality
- **Current**: shared shell work is `ert-*`.
- **Current**: `rt-ui.css` must not grow new `.rt-*` selectors.
- **Legacy / tolerated**: `.rt-*` still exists outside `rt-ui.css`, especially in domain islands and legacy files.

## Spacing and Layout
- stacks own spacing
- row/control archetypes own alignment
- margins are exceptions, not the default
- prefer ERT tokens and layout primitives over one-off wrappers

## Current Enforcement

### Verified by `npm run verify`
`npm run verify` currently runs:
1. `npm run build`
2. `npm run css-drift -- --maintenance`
3. standards checks
4. tests

### CSS drift checks
`scripts/css-drift-check.mjs` currently checks:

**Fail**
- `!important`
- unscoped global element selectors
- unscoped Obsidian selectors like `.setting-item` or `.modal`
- skin overreach (`.ert-skin--*` changing layout/typography instead of visual treatment)
- `.rt-*` selectors inside `src/styles/rt-ui.css`

**Warn in maintenance/migration modes**
- raw hex colors outside token lines
- legacy `.rt-*` selectors outside `rt-ui.css`
- literal `px` spacing
- raw `rgba()` shadows

This is the live behavior today. It is not a theoretical future gate.

## Additional Locks

### Inquiry lock
`scripts/check-inquiry-ert-lock.mjs` blocks `ert-inquiry-*` tokens in:
- `src/settings/**`
- `src/modals/**`
- `src/styles/rt-ui.css`

### Social lock
`scripts/check-social-ert-lock.mjs` blocks new `rt-*` backslide in specific Social settings render files, with a very small allowlist.

## Current vs Target-State Guidance
- **Current / enforced**: scope under `.ert-ui`, avoid `!important`, do not add `.rt-*` to `rt-ui.css`.
- **Current / enforced**: settings and modals use separate ERT scope roots.
- **Target-state guidance**: reduce remaining legacy `.rt-*` islands over time.
- **Tolerated migration reality**: legacy selectors still exist outside `rt-ui.css`.

## Practical Review Checklist
- Is the selector scoped under the correct ERT root?
- Is this settings CSS or modal CSS?
- Is this shared shell work or a legacy/domain island?
- Could this reuse an existing ERT archetype instead of inventing a wrapper?
- Does this avoid `!important` and preserve theme-native surfaces?
