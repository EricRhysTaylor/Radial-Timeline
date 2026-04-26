# CSS Drift Debt

Generated: 2026-04-26T21:52:37.532Z

Snapshot of every WARN-level drift hit at the time of baseline reset. Work through these to ratchet the baseline down. After fixing a batch, run `npm run css-drift -- --maintenance --update-baseline` to lock in the new lower ceiling.

> **Note on counts:** this report scans only the _source_ CSS files under `src/styles/`. The drift check also scans the bundled `styles.css` output (auto-generated from sources), so its totals are roughly 2× these. Fixing a hit here will remove both copies after the next `npm run build`.

Regenerate this report anytime with: `node scripts/css-drift-report.mjs`.

## Totals

- **Total WARN hits:** 9
- `spacing-px`: 0
- `raw-hex`: 0
- `shadow-rgba`: 0
- `rt-legacy`: 9

## How to work a rule

1. Open the section below for the rule.
2. Fix one file's hits at a time (files are grouped together in line order).
3. Rebuild and re-run `npm run css-drift -- --maintenance` to confirm the count dropped.
4. When a batch is done, run `npm run css-drift -- --maintenance --update-baseline`.

### Fix hints per rule

- `spacing-px` — replace literal `padding/margin/gap: Npx` with `var(--ert-pad-*)` / `var(--ert-gap-*)` tokens. See `src/styles/variables.css` for the token table.
- `raw-hex` — replace hex colors with theme vars (`var(--text-*)`, `var(--background-*)`) or ERT tokens. Hex is OK inside `--var:` declarations in `variables.css`.
- `shadow-rgba` — replace raw `rgba(...)` in `box-shadow` with `color-mix(in srgb, var(--...) N%, transparent)` or an ERT shadow token.
- `rt-legacy` — rename `.rt-*` selector to `.ert-*` (and update TS class usage) or relocate to `src/styles/legacy/rt-ui-legacy.css`. Note: `legacy/rt-ui-legacy.css` is itself scanned, so renaming beats relocating long-term.

## `spacing-px` (0)

_No hits. 🎉_

## `raw-hex` (0)

_No hits. 🎉_

## `shadow-rgba` (0)

_No hits. 🎉_

## `rt-legacy` (9)


### src/styles/modal.css (8)

```
src/styles/modal.css:1428: color: var(--text-normal);
  font-weight: 700;
}

.rt-gossamer-score-label {
src/styles/modal.css:1433: font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--text-normal);
}

.rt-gossamer-score-value {
src/styles/modal.css:1441: font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-normal);
}

.rt-gossamer-score-line {
src/styles/modal.css:1447: display: flex;
  align-items: center;
  gap: var(--ert-gap-sm);
  margin: var(--ert-gap-xs) 0;
}

.rt-gossamer-score-line svg {
src/styles/modal.css:1454: width: 24px;
  height: 24px;
}

.rt-gossamer-score-line text {
src/styles/modal.css:1459: fill: var(--text-normal);
}

.rt-gossamer-score-line .rt-gossamer-score-value {
src/styles/modal.css:1463: margin-left: auto;
}

.rt-gossamer-score-line [data-item-type=title] {
src/styles/modal.css:1467: fill: var(--rt-max-publish-stage-color);
  stroke: white;
  stroke-width: 0.07em;
  paint-order: stroke;
  font-size: 40px;
  font-weight: 700;
}

/* -------------------------------------------------------------------------- */
/* AUTHOR PROGRESS REPORT (APR) MODAL                                          */
/* -------------------------------------------------------------------------- */

/* APR Modal uses standard ert-modal-shell + ert-modal-container pattern */
/* Sizing handled via inline styles in the modal class */

/* APR Badge - social media theme */
.ert-apr-badge {
```

### src/styles/legacy/rt-ui-legacy.css (1)

```
src/styles/legacy/rt-ui-legacy.css:169: max-height: 200px;
  overflow-y: auto;
  margin-top: 12px;
}

/* Utility class for hiding elements */
.rt-hidden {
```
