# CSS Drift Debt

Generated: 2026-04-26T21:18:39.006Z

Snapshot of every WARN-level drift hit at the time of baseline reset. Work through these to ratchet the baseline down. After fixing a batch, run `npm run css-drift -- --maintenance --update-baseline` to lock in the new lower ceiling.

> **Note on counts:** this report scans only the _source_ CSS files under `src/styles/`. The drift check also scans the bundled `styles.css` output (auto-generated from sources), so its totals are roughly 2× these. Fixing a hit here will remove both copies after the next `npm run build`.

Regenerate this report anytime with: `node scripts/css-drift-report.mjs`.

## Totals

- **Total WARN hits:** 139
- `spacing-px`: 0
- `raw-hex`: 0
- `shadow-rgba`: 0
- `rt-legacy`: 139

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

## `rt-legacy` (139)


### src/styles/modal.css (99)

```
src/styles/modal.css:60: margin-right: auto;
}

/* ert-modal-actions base consolidated in rt-ui.css */

.ert-pulse-modal .ert-modal-actions {
src/styles/modal.css:792: margin-bottom: 20px;
}

/* rt-gossamer-proc-section-title replaced by rt-section-title in base.css */

.ert-gossamer-proc-manuscript-info {
src/styles/modal.css:1273: background: var(--ert-gossamer-progress-fill-error);
  box-shadow: var(--ert-gossamer-progress-glow-error);
}

.rt-gossamer-score-table {
src/styles/modal.css:1278: width: 100%;
  border-collapse: collapse;
  margin-top: 12px;
  color: var(--text-normal);
  font-size: 0.95rem;
}

.rt-gossamer-score-table th,
.rt-gossamer-score-table td {
src/styles/modal.css:1287: padding: var(--ert-pad-cozy);
  text-align: left;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.rt-gossamer-score-table th {
src/styles/modal.css:1293: font-size: 0.9rem;
  color: var(--text-muted);
}

.rt-gossamer-score-table tr:last-child td {
src/styles/modal.css:1298: border-bottom: none;
}

.rt-gossamer-score-cta {
src/styles/modal.css:1302: display: flex;
  gap: var(--ert-gap-cozy);
  flex-wrap: wrap;
}

.rt-gossamer-score-cta .mod-warning {
src/styles/modal.css:1308: color: var(--text-warning);
  border-color: rgba(255, 165, 0, 0.4);
}

.rt-gossamer-score-cta .mod-success {
src/styles/modal.css:1313: color: var(--text-success);
}

.rt-gossamer-score-cta .mod-error {
src/styles/modal.css:1317: color: var(--text-error);
}

.rt-gossamer-score-cta .rt-warning-label {
src/styles/modal.css:1321: display: inline-flex;
  align-items: center;
  gap: var(--ert-gap-tight);
  padding: var(--ert-pad-tight) var(--ert-pad-cozy);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.02);
  font-size: 0.85rem;
  color: var(--text-normal);
}

.rt-gossamer-score-table tr .rt-warning-label {
src/styles/modal.css:1487: color: var(--text-normal);
  font-weight: 700;
}

.rt-gossamer-score-label {
src/styles/modal.css:1492: font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--text-normal);
}

.rt-gossamer-score-value {
src/styles/modal.css:1500: font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-normal);
}

.rt-gossamer-score-line {
src/styles/modal.css:1506: display: flex;
  align-items: center;
  gap: var(--ert-gap-sm);
  margin: var(--ert-gap-xs) 0;
}

.rt-gossamer-score-line svg {
src/styles/modal.css:1513: width: 24px;
  height: 24px;
}

.rt-gossamer-score-line text {
src/styles/modal.css:1518: fill: var(--text-normal);
}

.rt-gossamer-score-line .rt-gossamer-score-value {
src/styles/modal.css:1522: margin-left: auto;
}

.rt-gossamer-score-line [data-item-type=title] {
src/styles/modal.css:1526: fill: var(--rt-max-publish-stage-color);
  stroke: white;
  stroke-width: 0.07em;
  paint-order: stroke;
  font-size: 40px;
  font-weight: 700;
}

.rt-gossamer-score-format-info {
src/styles/modal.css:1535: margin-bottom: 12px;
  padding: var(--ert-pad-xs);
  background-color: var(--background-secondary);
  border-radius: 4px;
  font-size: 12px;
  color: var(--text-muted);
}

.rt-plot-system-selected {
src/styles/modal.css:1544: color: var(--text-success);
  font-weight: 500;
}

.rt-gossamer-options-container {
src/styles/modal.css:1549: display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--ert-gap-xl);
  margin: var(--ert-pad-comfy) 0;
}

.rt-gossamer-option-col {
src/styles/modal.css:1556: display: flex;
  flex-direction: column;
  gap: var(--ert-gap-sm);
}

.rt-gossamer-checkbox-row {
src/styles/modal.css:1562: display: flex;
  align-items: center;
  gap: var(--ert-gap-sm);
}

.rt-gossamer-checkbox {
src/styles/modal.css:1568: width: 18px;
  height: 18px;
  cursor: pointer;
  flex-shrink: 0;
}

.rt-gossamer-option-label {
src/styles/modal.css:1575: font-weight: 500;
  font-size: 14px;
  cursor: pointer;
}

.rt-gossamer-option-description {
src/styles/modal.css:1581: font-size: 12px;
  color: var(--text-muted);
  line-height: 1.4;
  padding-left: 26px;
}

/* -------------------------------------------------------------------------- */
/* AUTHOR PROGRESS REPORT (APR) MODAL                                          */
/* -------------------------------------------------------------------------- */

/* APR Modal uses standard ert-modal-shell + ert-modal-container pattern */
/* Sizing handled via inline styles in the modal class */

/* APR Badge - social media theme */
.rt-apr-badge {
src/styles/modal.css:1596: display: inline-flex;
  align-items: center;
  gap: var(--ert-gap-tight);
  padding: var(--ert-pad-tight) var(--ert-pad-sm);
  border-radius: 8px;
  background: rgba(var(--rt-social-color-rgb, 255, 212, 29), 0.15);
  border: 1px solid rgba(var(--rt-social-color-rgb, 255, 212, 29), 0.3);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--rt-social-color);
  margin-bottom: 8px;
}

.rt-apr-badge .ert-modal-badge-icon {
src/styles/modal.css:1612: display: inline-flex;
  align-items: center;
}

.rt-apr-badge .ert-modal-badge-icon svg {
src/styles/modal.css:1617: width: 14px;
  height: 14px;
  stroke: var(--rt-social-color);
}

/* Color swatch (modal scope) */
.ert-ui.ert-scope--modal .ert-swatch {
src/styles/modal.css:2085: display: flex;
  align-items: center;
  gap: var(--ert-gap-sm);
}

/* Refresh Alert */
.rt-apr-refresh-alert {
src/styles/modal.css:2092: display: flex;
  align-items: center;
  gap: var(--ert-gap-cozy);
  padding: var(--ert-pad-sm) var(--ert-pad-md);
  background: rgba(255, 140, 0, 0.12);
  border: 1px solid rgba(255, 140, 0, 0.3);
  border-radius: 12px;
  color: var(--text-warning);
  font-size: 0.9rem;
  margin-bottom: 16px;
}

.rt-apr-refresh-icon svg {
src/styles/modal.css:2105: width: 18px;
  height: 18px;
  stroke: var(--text-warning);
}

/* Reveal Section - compact checkbox grid */
.rt-apr-reveal-section {
src/styles/modal.css:2112: margin-bottom: 16px;
  padding: var(--ert-pad-md) var(--ert-pad-lg);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
}

.rt-apr-reveal-title {
src/styles/modal.css:2120: margin: 0 0 var(--ert-gap-xs);
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-normal);
  letter-spacing: 0.02em;
}

.rt-apr-reveal-desc {
src/styles/modal.css:2128: margin: 0 0 var(--ert-pad-loose);
  font-size: 0.85rem;
  color: var(--text-muted);
  line-height: 1.4;
}

.rt-apr-checkbox-grid {
src/styles/modal.css:2135: display: flex;
  flex-wrap: wrap;
  gap: var(--ert-gap-sm);
}

.rt-apr-checkbox-item {
src/styles/modal.css:2141: display: flex;
  align-items: center;
  gap: var(--ert-gap-tight);
  padding: var(--ert-pad-tight) var(--ert-pad-cozy);
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.rt-apr-checkbox-item:hover {
src/styles/modal.css:2153: background: rgba(255, 255, 255, 0.07);
  border-color: rgba(255, 255, 255, 0.15);
}

.rt-apr-checkbox-item input[type="checkbox"] {
src/styles/modal.css:2158: width: 14px;
  height: 14px;
  cursor: pointer;
  accent-color: var(--rt-social-color);
  flex-shrink: 0;
  margin: 0;
}

.rt-apr-checkbox-item label {
src/styles/modal.css:2167: font-size: 0.8rem;
  color: var(--text-normal);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}

/* Mode Section */
.rt-apr-mode-section {
src/styles/modal.css:2176: margin-bottom: 16px;
}

.rt-apr-mode-selector {
src/styles/modal.css:2180: display: flex;
  gap: var(--ert-gap-sm);
  flex-wrap: wrap;
}

.rt-apr-mode-btn,
.rt-apr-size-btn {
src/styles/modal.css:2187: padding: var(--ert-pad-xs) var(--ert-pad-md);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-muted);
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.rt-apr-mode-btn:hover,
.rt-apr-size-btn:hover {
src/styles/modal.css:2200: background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.2);
}

.rt-apr-mode-btn.rt-active,
.rt-apr-size-btn.rt-active {
src/styles/modal.css:2206: background: rgba(var(--rt-social-color-rgb, 255, 212, 29), 0.2);
  border-color: var(--rt-social-color);
  color: var(--rt-social-color);
}

/* Size Section */
.rt-apr-size-section {
src/styles/modal.css:2213: margin-bottom: 16px;
}

.rt-apr-size-selector {
src/styles/modal.css:2217: display: flex;
  gap: var(--ert-gap-sm);
  flex-wrap: wrap;
  margin-bottom: 8px;
}

/* Side-by-side preview row */
.rt-apr-preview-row {
src/styles/modal.css:2225: display: flex;
  gap: var(--ert-gap-md);
  margin: var(--ert-pad-md) 0;
  justify-content: center;
}

.rt-apr-preview-card {
src/styles/modal.css:2232: --rt-apr-preview-active-glow: 0 0 12px color-mix(in srgb, var(--rt-social-color) 25%, transparent);
  flex: 1;
  max-width: 200px;
  background: rgba(0, 0, 0, 0.35);
  border-radius: 10px;
  border: 2px solid rgba(255, 255, 255, 0.1);
  padding: var(--ert-pad-cozy);
  cursor: pointer;
  transition: border-color 0.15s, transform 0.1s, box-shadow 0.15s;
}

.rt-apr-preview-card:hover {
src/styles/modal.css:2244: border-color: rgba(255, 255, 255, 0.25);
  transform: translateY(-2px);
}

.rt-apr-preview-card.is-locked {
src/styles/modal.css:2249: cursor: default;
  opacity: 0.7;
}

.rt-apr-preview-card.is-locked:hover {
src/styles/modal.css:2254: border-color: rgba(255, 255, 255, 0.1);
  transform: none;
  box-shadow: none;
}

.rt-apr-preview-card.rt-active {
src/styles/modal.css:2260: border-color: var(--rt-social-color);
  box-shadow: var(--rt-apr-preview-active-glow);
}

.rt-apr-preview-thumb {
src/styles/modal.css:2265: display: flex;
  justify-content: center;
  align-items: center;
  background: rgba(0, 0, 0, 0.25);
  border-radius: 6px;
  min-height: 120px;
  max-height: 150px;
  overflow: hidden;
  margin-bottom: 8px;
}

.rt-apr-preview-thumb svg {
src/styles/modal.css:2277: width: 100%;
  height: auto;
  max-height: 140px;
}

.rt-apr-preview-label {
src/styles/modal.css:2283: text-align: center;
  display: flex;
  flex-direction: column;
  gap: var(--ert-gap-2xs);
}

.rt-apr-preview-label strong {
src/styles/modal.css:2290: font-size: 0.95rem;
  color: var(--text-normal);
}

.rt-apr-preview-dims {
src/styles/modal.css:2295: font-size: 0.75rem;
  color: var(--text-muted);
  font-family: var(--font-monospace);
}

.rt-apr-preview-dims sup {
src/styles/modal.css:2301: font-size: 0.65em;
  line-height: 0;
  vertical-align: super;
}

.rt-apr-preview-usecase {
src/styles/modal.css:2307: font-size: 0.7rem;
  color: var(--text-faint);
}

/* Density tip note */
.rt-apr-density-note {
src/styles/modal.css:2313: display: flex;
  align-items: flex-start;
  gap: var(--ert-gap-sm);
  font-size: 0.8rem;
  color: var(--text-muted);
  background: rgba(255, 212, 29, 0.08);
  padding: var(--ert-pad-cozy) var(--ert-pad-sm);
  border-radius: 8px;
  border-left: 3px solid var(--rt-social-color);
}

.rt-apr-density-icon {
src/styles/modal.css:2325: flex-shrink: 0;
  margin-top: 1px;
}

.rt-apr-density-icon svg {
src/styles/modal.css:2330: width: 14px;
  height: 14px;
  color: var(--rt-social-color);
}

.rt-apr-loading,
.rt-apr-empty {
src/styles/modal.css:2337: text-align: center;
  color: var(--text-muted);
  font-size: 0.95rem;
  padding: var(--ert-pad-3xl);
}

.rt-apr-error {
src/styles/modal.css:2344: text-align: center;
  color: var(--text-error);
  font-size: 0.95rem;
  padding: var(--ert-pad-3xl);
}

/* Identity Section */
.rt-apr-identity-section {
src/styles/modal.css:2352: margin-bottom: 16px;
}

.rt-apr-identity-section .setting-item {
src/styles/modal.css:2356: padding: var(--ert-pad-cozy) 0;
  border-top: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.rt-apr-identity-section .setting-item:last-child {
src/styles/modal.css:2362: border-bottom: none;
}

/* Actions Section */
.rt-apr-actions-section {
src/styles/modal.css:2367: margin-bottom: 16px;
}

.rt-apr-tabs-container {
src/styles/modal.css:2371: display: flex;
  gap: var(--ert-gap-sm);
  margin-bottom: 12px;
}

.rt-apr-tab {
src/styles/modal.css:2377: display: inline-flex;
  align-items: center;
  gap: var(--ert-gap-tight);
  padding: var(--ert-pad-xs) var(--ert-pad-loose);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-muted);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.rt-apr-tab:hover {
src/styles/modal.css:2392: background: rgba(255, 255, 255, 0.06);
}

.rt-apr-tab.rt-active {
src/styles/modal.css:2396: background: rgba(var(--rt-social-color-rgb, 255, 212, 29), 0.15);
  border-color: rgba(var(--rt-social-color-rgb, 255, 212, 29), 0.4);
  color: var(--rt-social-color);
}

.rt-apr-tab svg {
src/styles/modal.css:2402: width: 14px;
  height: 14px;
}

.rt-apr-actions-content {
src/styles/modal.css:2407: padding: var(--ert-pad-sm) 0;
}

.rt-apr-tab-desc {
src/styles/modal.css:2411: margin: 0 0 var(--ert-pad-sm);
  color: var(--text-muted);
  font-size: 0.9rem;
  line-height: 1.5;
}

.rt-apr-embed-codes {
src/styles/modal.css:2418: margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.rt-apr-embed-codes h5 {
src/styles/modal.css:2424: margin: 0 0 var(--ert-pad-cozy);
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-normal);
}

.rt-apr-embed-codes .rt-row {
src/styles/modal.css:2431: display: flex;
  gap: var(--ert-gap-sm);
  flex-wrap: wrap;
}

/* Section titles in APR modal */
.rt-apr-modal .rt-section-title {
src/styles/modal.css:2438: margin: 0 0 var(--ert-pad-sm);
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-normal);
  letter-spacing: 0.02em;
  border-bottom: none;
}

/* Row utility */
.rt-apr-modal .rt-row {
src/styles/modal.css:2448: display: flex;
  gap: var(--ert-gap-cozy);
  flex-wrap: wrap;
}

/* Synopsis Controls */
.rt-synopsis-controls {
src/styles/modal.css:2455: padding: var(--ert-pad-roomy) var(--ert-pad-lg);
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: var(--ert-gap-lg);
}

.rt-synopsis-control {
src/styles/modal.css:2463: display: flex;
  flex-direction: column;
  gap: var(--ert-gap-tight);
}

/* Two-column row layout for synopsis controls */
.rt-synopsis-control--row {
src/styles/modal.css:2485: margin: 0;
  align-self: center;
}

.rt-synopsis-control-right {
src/styles/modal.css:2490: display: inline-flex;
  align-items: center;
  gap: var(--ert-gap-md);
  flex-shrink: 0;
}

.rt-synopsis-control-info {
src/styles/modal.css:2497: display: flex;
  flex-direction: column;
  gap: var(--ert-gap-xs);
  flex: 1;
  min-width: 0;
}

.rt-synopsis-control-label {
src/styles/modal.css:2505: font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-normal);
  letter-spacing: 0.01em;
}

.rt-synopsis-control-input {
src/styles/modal.css:2512: width: var(--ert-input-width-3digit);
  min-width: var(--ert-input-width-3digit);
  padding: var(--ert-control-pad-y) var(--ert-control-pad-x);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-normal);
  font-size: 0.95rem;
  font-family: var(--font-monospace);
  flex-shrink: 0;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.rt-synopsis-control-input:focus {
src/styles/modal.css:2527: outline: none;
  border-color: var(--interactive-accent);
  background: rgba(255, 255, 255, 0.08);
}

.rt-synopsis-control-help {
src/styles/modal.css:2533: font-size: 0.85rem;
  color: var(--text-muted);
  line-height: 1.5;
  margin-top: 0;
}

.rt-synopsis-control-help .rt-synopsis-control-link {
src/styles/modal.css:2540: color: var(--interactive-accent);
  text-decoration: none;
  font-weight: 500;
}

.rt-synopsis-control-help .rt-synopsis-control-link:hover {
src/styles/modal.css:2546: text-decoration: underline;
}

.rt-synopsis-control-divider {
src/styles/modal.css:2550: border: none;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  margin: var(--ert-gap-xs) 0;
}

.rt-synopsis-threshold-warning {
src/styles/modal.css:2556: display: none;
  padding: var(--ert-pad-sm) var(--ert-pad-loose);
  margin-top: 8px;
  border-radius: 6px;
  background: rgba(255, 165, 0, 0.1);
  border: 1px solid rgba(255, 165, 0, 0.3);
  color: var(--text-warning);
  font-size: 0.85rem;
  line-height: 1.5;
}

.rt-synopsis-threshold-warning.is-visible {
src/styles/modal.css:2572: .rt-synopsis-control-right {
src/styles/modal.css:2578: grid-template-columns: auto minmax(0, 1fr);
    row-gap: var(--ert-gap-cozy);
  }

  .ert-synopsis-control--three-col .rt-synopsis-control-input {
src/styles/modal.css:2583: grid-column: 2;
    justify-self: end;
  }
}

.ert-ui.ert-scope--modal .ert-glass-card,
.ert-ui.ert-scope--modal .rt-card-glass,
.ert-ui .ert-scope--modal .ert-glass-card,
.ert-ui .ert-scope--modal .rt-card-glass {
```

### src/styles/legacy/rt-ui-legacy.css (40)

```
src/styles/legacy/rt-ui-legacy.css:1: /* Legacy rt-* selectors extracted from rt-ui.css during ERT migration. */


/* Pro Target Dropdown */
.rt-apr-pro-target .dropdown {
src/styles/legacy/rt-ui-legacy.css:5: background: color-mix(in srgb, var(--ert-pro-accent-color) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--ert-pro-accent-color) 30%, transparent);
  color: var(--text-normal);
  transition: all 0.2s ease;
  font-weight: 500;
}

.rt-apr-pro-target .dropdown:hover,
.rt-apr-pro-target .dropdown:focus {
src/styles/legacy/rt-ui-legacy.css:20: --rt-pro-color: var(--rt-pro-color-base);
  --rt-pro-color-rgb: 217, 70, 239;
  --rt-social-color: var(--rt-social-color-base);
  --rt-social-color-rgb: 255, 212, 29;
}

/* -------------------------------------------------------------------------- */
/* MIGRATED FROM settings.css (rt-* selectors)                                */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* PROFESSIONAL SECTION                                                       */
/* -------------------------------------------------------------------------- */

.ert-settings-root .rt-professional-header-toggle .setting-item-control {
src/styles/legacy/rt-ui-legacy.css:87: width: var(--rt-input-width-md);
  max-width: 100%;
}

.ert-settings-root .setting-item .setting-item-control textarea {
src/styles/legacy/rt-ui-legacy.css:96: width: var(--rt-input-width-lg);
  min-width: var(--rt-input-width-lg);
  max-width: 100%;
}

/* Align settings rows to the top when descriptions wrap */

.ert-settings-root .setting-item.setting-item-heading .setting-item-name {
src/styles/legacy/rt-ui-legacy.css:156: font-weight: 600;
  color: var(--rt-pro-color);
}

.ert-runtime-hint {
src/styles/legacy/rt-ui-legacy.css:179: max-height: 200px;
  overflow-y: auto;
  margin-top: 12px;
}

/* Utility class for hiding elements */
.rt-hidden {
src/styles/legacy/rt-ui-legacy.css:199: margin-bottom: 12px;
}

/* Runtime sections use glass-card but without heavy dropshadow */
.rt-glass-card.ert-runtime-section {
src/styles/legacy/rt-ui-legacy.css:204: box-shadow: none;
}

/* ert-runtime-section-header replaced by rt-section-title in base.css */

.ert-runtime-section-desc {
src/styles/legacy/rt-ui-legacy.css:210: font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 12px;
}

/* ert-runtime-scope-layout, ert-runtime-scope-info, ert-runtime-scope-controls, ert-runtime-scope-row
   replaced by rt-row and rt-stack utilities in base.css */

.ert-runtime-dropdown-container {
src/styles/legacy/rt-ui-legacy.css:260: color: var(--text-muted);
  font-style: italic;
}

/* ert-runtime-status-row replaced by rt-row rt-row-loose rt-row-wrap in base.css */

.ert-runtime-status-checkbox {
src/styles/legacy/rt-ui-legacy.css:311: color: var(--rt-pro-color);
}

.ert-runtime-accordion-icon {
src/styles/legacy/rt-ui-legacy.css:375: font-size: 11px;
  color: var(--text-faint);
  margin-top: 12px;
  font-style: italic;
}

/* Books settings (moved from rt-ui.css during ERT migration) */

/* "+" add-book button in heading (ert-iconBtn ert-mod-cta base) */
.rt-books-add-btn--pulse {
src/styles/legacy/rt-ui-legacy.css:385: box-shadow: 0 0 0 1px color-mix(in srgb, var(--text-success) 28%, transparent);
}

.rt-books-panel {
src/styles/legacy/rt-ui-legacy.css:389: gap: var(--ert-gap-sm);
}

/* Book card: single-row Setting with bordered card look */
.rt-book-card.setting-item {
src/styles/legacy/rt-ui-legacy.css:394: display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  column-gap: var(--ert-gap-md);
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--radius-m, 8px);
  padding: var(--ert-pad-xs) var(--ert-pad-sm);
  background: var(--background-primary);
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    opacity 0.15s ease;
}

/* Override generic .is-inactive muting — book cards must stay interactive */
.rt-book-card.setting-item.is-inactive {
src/styles/legacy/rt-ui-legacy.css:410: opacity: 1;
  pointer-events: auto;
}

.rt-book-card.setting-item.is-active {
src/styles/legacy/rt-ui-legacy.css:415: border-color: color-mix(in srgb, var(--text-success) 50%, transparent);
}

.rt-book-card.setting-item.rt-book-card--link-broken {
src/styles/legacy/rt-ui-legacy.css:419: border-color: color-mix(in srgb, var(--text-error) 42%, var(--background-modifier-border));
  background: color-mix(in srgb, var(--text-error) 6%, var(--background-primary));
}

/* Name column: status icon + title stacked above desc */
.rt-book-card__name {
src/styles/legacy/rt-ui-legacy.css:425: display: flex;
  align-items: center;
  gap: var(--ert-gap-sm);
}

.rt-book-card .setting-item-info {
src/styles/legacy/rt-ui-legacy.css:431: min-width: 0;
}

.rt-book-card .setting-item-control {
src/styles/legacy/rt-ui-legacy.css:435: min-width: 0;
}

.rt-book-card__drag {
src/styles/legacy/rt-ui-legacy.css:439: display: flex;
  align-items: center;
  justify-content: center;
  align-self: stretch;
  min-width: 28px;
  color: var(--text-faint);
  cursor: grab;
}

.rt-book-card__drag svg {
src/styles/legacy/rt-ui-legacy.css:449: width: 16px;
  height: 16px;
}

.rt-book-card__meta {
src/styles/legacy/rt-ui-legacy.css:454: letter-spacing: 0.02em;
}

.rt-book-card__status {
src/styles/legacy/rt-ui-legacy.css:458: display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--text-faint);
}

.rt-book-card__status svg {
src/styles/legacy/rt-ui-legacy.css:466: width: 16px;
  height: 16px;
}

.rt-book-card__status--active {
src/styles/legacy/rt-ui-legacy.css:471: color: var(--text-success);
}

.rt-book-card__status--invalid {
src/styles/legacy/rt-ui-legacy.css:475: color: var(--text-error);
}

/* Clickable row to activate inactive book */
.rt-book-card--clickable {
src/styles/legacy/rt-ui-legacy.css:480: cursor: pointer;
}

.rt-book-card--clickable:hover {
src/styles/legacy/rt-ui-legacy.css:484: border-color: color-mix(in srgb, var(--text-success) 40%, transparent);
}

.rt-book-card--clickable:hover .rt-book-card__status {
src/styles/legacy/rt-ui-legacy.css:488: color: var(--text-success);
}

.rt-book-card--clickable.rt-book-card--link-broken:hover {
src/styles/legacy/rt-ui-legacy.css:492: border-color: color-mix(in srgb, var(--text-error) 42%, var(--background-modifier-border));
}

.rt-book-card--clickable.rt-book-card--link-broken:hover .rt-book-card__status--invalid {
src/styles/legacy/rt-ui-legacy.css:496: color: var(--text-error);
}

.rt-book-card__stat--warn {
src/styles/legacy/rt-ui-legacy.css:500: color: var(--text-faint);
}

.rt-book-card__stat--invalid {
src/styles/legacy/rt-ui-legacy.css:504: color: var(--text-error);
}

.rt-book-card__trash.is-disabled {
src/styles/legacy/rt-ui-legacy.css:508: opacity: 0.3;
  pointer-events: none;
}

.rt-books-panel--dragging .rt-book-card .setting-item-control,
.rt-books-panel--dragging .rt-book-card .ert-book-name {
src/styles/legacy/rt-ui-legacy.css:514: pointer-events: none;
}

.rt-book-card.setting-item.is-dragging {
src/styles/legacy/rt-ui-legacy.css:518: opacity: 0.36;
  box-shadow: none;
}

.rt-book-card.setting-item.is-dragover {
src/styles/legacy/rt-ui-legacy.css:523: border-color: color-mix(in srgb, var(--interactive-accent) 72%, var(--background-modifier-border));
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--interactive-accent) 28%, transparent),
    inset 0 0 0 1px color-mix(in srgb, var(--interactive-accent) 16%, transparent);
}

.rt-book-card--dragPreview {
```
