# CSS Drift Debt

Generated: 2026-04-26T19:42:23.218Z

Snapshot of every WARN-level drift hit at the time of baseline reset. Work through these to ratchet the baseline down. After fixing a batch, run `npm run css-drift -- --maintenance --update-baseline` to lock in the new lower ceiling.

> **Note on counts:** this report scans only the _source_ CSS files under `src/styles/`. The drift check also scans the bundled `styles.css` output (auto-generated from sources), so its totals are roughly 2× these. Fixing a hit here will remove both copies after the next `npm run build`.

Regenerate this report anytime with: `node scripts/css-drift-report.mjs`.

## Totals

- **Total WARN hits:** 209
- `spacing-px`: 0
- `raw-hex`: 0
- `shadow-rgba`: 0
- `rt-legacy`: 209

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

## `rt-legacy` (209)


### src/styles/modal.css (169)

```
src/styles/modal.css:15: margin-top: 0;
  padding: 0;
  color: var(--text-muted);
  font-size: 0.85rem;
  line-height: 1.5;
}

/* Consolidated meta-item base pattern */
.rt-pulse-hero-meta-item {
src/styles/modal.css:24: display: inline-flex;
  align-items: center;
  gap: var(--ert-gap-tight);
  padding: var(--ert-pad-tight) var(--ert-pad-sm);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-muted);
}

/* Warning variant - inherits base + warning colors */
.rt-pulse-hero-meta-item-warning {
src/styles/modal.css:58: margin-right: auto;
}

/* ert-modal-actions base consolidated in rt-ui.css */

.rt-pulse-modal .ert-modal-actions {
src/styles/modal.css:144: display: inline-block;
  padding: var(--ert-pad-xs) var(--ert-pad-loose);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 0.85rem;
  color: var(--text-muted);
  line-height: 1.4;
}

.ert-scene-analysis-modal .rt-glass-card {
src/styles/modal.css:162: margin: var(--ert-gap-md) 0;
  padding: var(--ert-pad-sm) var(--ert-pad-md);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  font-size: 0.9em;
  color: var(--text-muted);
  line-height: 1.45;
}

.rt-pulse-modal-shell.modal {
src/styles/modal.css:172: width: min(760px, 92vw);
  max-height: 92vh;
}

.rt-pulse-modal {
src/styles/modal.css:177: position: relative;
  padding:
    calc(var(--ert-pad-xl) + var(--ert-gap-2xs))
    var(--ert-pad-2xl)
    calc(var(--ert-pad-lg) + var(--ert-gap-2xs));
  border-radius: 24px;
  background: linear-gradient(145deg, rgba(16, 16, 21, 0.95), rgba(36, 28, 24, 0.92));
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: none;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  max-height: calc(92vh - 40px);
  scrollbar-gutter: stable;
  overscroll-behavior: contain;
  contain: paint;
}

.rt-pulse-modal.ert-gossamer-score-modal {
src/styles/modal.css:197: padding: 0;
}

.rt-pulse-modal::before {
src/styles/modal.css:201: content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 15% 10%, rgba(255, 255, 255, 0.08), transparent 52%),
    radial-gradient(circle at 85% 5%, rgba(247, 176, 92, 0.1), transparent 42%);
  pointer-events: none;
}

.rt-pulse-modal>* {
src/styles/modal.css:210: position: relative;
  z-index: 1;
}

/* rt-glass-card base consolidated in base.css */

.ert-gossamer-score-modal .rt-glass-card {
src/styles/modal.css:240: display: flex;
  flex-direction: column;
  gap: var(--ert-gap-lg);
  height: 100%;
  min-height: calc(80vh - 100px);
  max-height: calc(90vh - 100px);
}

/* Height-safe shells for tall modals */
.rt-manuscript-modal,
.ert-gossamer-processing-modal,
.rt-book-designer-modal {
src/styles/modal.css:252: display: flex;
  flex-direction: column;
  gap: var(--ert-gap-lg);
  max-height: 92vh;
  min-height: 0;
}

.rt-manuscript-modal {
src/styles/modal.css:268: overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  contain: paint;
}

.rt-book-designer-modal .rt-card-stack {
src/styles/modal.css:621: background-color: var(--rt-confirm-accent, var(--interactive-accent));
}

.rt-text-input-modal-field {
src/styles/modal.css:625: width: 100%;
  margin-bottom: 12px;
  padding: var(--ert-pad-xs);
}

.rt-text-input-modal-buttons {
src/styles/modal.css:749: white-space: pre-wrap;
  word-break: break-word;
  overflow-x: hidden;
}

/* Gossamer / Pulse modal overrides */
.ert-gossamer-score-modal .rt-pulse-progress-hero {
src/styles/modal.css:756: padding: var(--ert-pad-sm) var(--ert-pad-loose);
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow: none;
  border-radius: 12px;
  margin-bottom: 12px;
}

.ert-gossamer-score-modal .rt-pulse-progress-hero::after {
src/styles/modal.css:765: display: none;
}

.ert-gossamer-score-modal .rt-pulse-progress-body {
src/styles/modal.css:769: gap: var(--ert-gap-cozy);
  margin-top: 12px;
}

.ert-gossamer-score-modal .rt-pulse-progress-card {
src/styles/modal.css:779: padding: 0;
}

.ert-gossamer-proc-modal .rt-pulse-progress-body {
src/styles/modal.css:790: margin-bottom: 20px;
}

/* rt-gossamer-proc-section-title replaced by rt-section-title in base.css */

.ert-gossamer-proc-manuscript-info {
src/styles/modal.css:878: font-weight: 600;
  color: var(--text-normal);
  margin-bottom: 12px;
}

.rt-gossamer-progress-container {
src/styles/modal.css:884: margin: var(--ert-pad-lg) 0;
}

.rt-gossamer-progress-bg {
src/styles/modal.css:888: width: 100%;
  height: 24px;
  background-color: var(--background-secondary);
  border-radius: 12px;
  overflow: hidden;
  position: relative;
}

.rt-gossamer-progress-bar {
src/styles/modal.css:897: height: 100%;
  background: linear-gradient(90deg, var(--interactive-accent), var(--interactive-accent-hover));
  border-radius: 12px;
  transition: width 0.5s ease;
  position: relative;
  width: var(--progress-width, 0%);
}

.rt-gossamer-progress-bar::after {
src/styles/modal.css:906: content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2) 50%, transparent);
  animation: progress-shine 2s infinite;
}

.rt-gossamer-progress-bar.rt-progress-complete::after {
src/styles/modal.css:917: animation: none;
}

.rt-gossamer-actions {
src/styles/modal.css:921: margin-top: 20px;
  display: flex;
  gap: var(--ert-gap-cozy);
  justify-content: flex-end;
}

.rt-beat-placement-modal {
src/styles/modal.css:928: padding: 0;
}

.rt-beat-placement-modal .rt-beats-info {
src/styles/modal.css:932: margin: var(--ert-gap-tight) 0 var(--ert-pad-lg) 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.5;
}

.rt-beat-placement-modal .rt-manuscript-section {
src/styles/modal.css:939: margin-bottom: 20px;
}

.rt-beat-placement-modal .rt-manuscript-section h3 {
src/styles/modal.css:943: font-size: 14px;
  font-weight: 600;
  color: var(--text-normal);
  margin: 0 0 var(--ert-pad-cozy) 0;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--background-modifier-border);
}

.rt-beat-placement-modal .rt-manuscript-details {
src/styles/modal.css:952: padding: var(--ert-pad-sm);
  background-color: var(--background-secondary);
  border-radius: 6px;
  border-left: 4px solid var(--interactive-accent);
  display: flex;
  flex-direction: column;
  gap: var(--ert-gap-tight);
  font-size: 13px;
  color: var(--text-normal);
}

.rt-beat-placement-modal .rt-api-warning {
src/styles/modal.css:964: margin-bottom: 20px;
  padding: var(--ert-pad-sm);
  background-color: rgba(255, 165, 0, 0.1);
  border: 1px solid rgba(255, 165, 0, 0.3);
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-normal);
  line-height: 1.5;
}

.rt-beat-placement-modal .ert-modal-buttons {
src/styles/modal.css:975: margin-top: 20px;
  display: flex;
  gap: var(--ert-gap-cozy);
  justify-content: flex-end;
}

.rt-beat-placement-modal .rt-status-text {
src/styles/modal.css:982: padding: var(--ert-pad-cozy) var(--ert-pad-sm);
  background-color: var(--background-secondary);
  border-radius: 4px;
  font-size: 13px;
  color: var(--text-normal);
  min-height: 40px;
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}

.rt-beat-placement-modal .rt-api-status {
src/styles/modal.css:994: padding: var(--ert-pad-cozy) var(--ert-pad-sm);
  background-color: var(--background-secondary);
  border-radius: 4px;
  font-size: 13px;
  color: var(--text-muted);
  min-height: 40px;
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}

.rt-beat-placement-modal .rt-beat-placement-progress-container {
src/styles/modal.css:1006: margin: var(--ert-pad-lg) 0;
}

.rt-beat-placement-modal .rt-beat-placement-progress-bg {
src/styles/modal.css:1010: width: 100%;
  height: 24px;
  background-color: var(--background-secondary);
  border-radius: 12px;
  overflow: hidden;
  position: relative;
}

.rt-beat-placement-modal .rt-beat-placement-progress-bar {
src/styles/modal.css:1019: height: 100%;
  background: linear-gradient(90deg, var(--interactive-accent), var(--interactive-accent-hover));
  border-radius: 12px;
  transition: width 0.5s ease;
  position: relative;
  width: var(--progress-width, 0%);
}

.rt-beat-placement-modal .rt-beat-placement-progress-bar::after {
src/styles/modal.css:1028: content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2) 50%, transparent);
  animation: progress-shine 2s infinite;
}

.rt-beat-placement-modal .rt-beat-placement-progress-bar.rt-progress-complete::after {
src/styles/modal.css:1039: animation: none;
}

.rt-beat-placement-modal .rt-error-list {
src/styles/modal.css:1043: margin-top: 12px;
  padding: var(--ert-pad-cozy) var(--ert-pad-sm);
  background-color: rgba(255, 92, 92, 0.1);
  border: 1px solid rgba(255, 92, 92, 0.2);
  border-radius: 8px;
  color: var(--text-normal);
  display: flex;
  flex-direction: column;
  gap: var(--ert-gap-tight);
}

.rt-beat-placement-modal .rt-error-item {
src/styles/modal.css:1055: margin: 0;
  line-height: 1.4;
}

.rt-beat-placement-modal .rt-error-item:last-child {
src/styles/modal.css:1060: margin-bottom: 0;
}

.rt-gossamer-assembly-modal .rt-gossamer-title {
src/styles/modal.css:1064: margin-bottom: 20px;
}

.rt-gossamer-assembly-modal .rt-gossamer-progress {
src/styles/modal.css:1068: margin-bottom: 20px;
}

.rt-gossamer-assembly-modal .rt-gossamer-progress-title {
src/styles/modal.css:1072: margin-bottom: 10px;
}

.rt-gossamer-assembly-modal .rt-gossamer-progress-status {
src/styles/modal.css:1076: font-family: var(--font-monospace);
  padding: var(--ert-pad-cozy);
  background-color: var(--background-secondary);
  border-radius: 4px;
  min-height: 60px;
}

.rt-gossamer-assembly-modal .rt-gossamer-summary {
src/styles/modal.css:1084: margin-bottom: 20px;
}

.rt-gossamer-assembly-modal .rt-gossamer-summary-title {
src/styles/modal.css:1088: margin-bottom: var(--ert-pad-comfy);
}

.rt-gossamer-assembly-modal .rt-gossamer-summary-content {
src/styles/modal.css:1092: font-family: var(--font-monospace);
  padding: var(--ert-pad-comfy);
  background-color: var(--background-secondary);
  border-radius: 4px;
  line-height: 1.8;
}

.rt-gossamer-assembly-modal .rt-gossamer-warning {
src/styles/modal.css:1100: margin-top: var(--ert-pad-comfy);
  padding: var(--ert-pad-cozy);
  background-color: var(--background-modifier-error);
  border-radius: 4px;
  color: var(--text-on-accent);
}

.rt-gossamer-assembly-modal .rt-gossamer-buttons {
src/styles/modal.css:1108: margin-top: 20px;
  display: flex;
  gap: var(--ert-gap-cozy);
  justify-content: flex-end;
}

.rt-gossamer-assembly-modal .rt-gossamer-buttons.rt-hidden {
src/styles/modal.css:1115: display: none;
}

.rt-gossamer-assembly-modal .rt-hidden {
src/styles/modal.css:1123: padding:
    calc(var(--ert-pad-xl) + var(--ert-gap-2xs))
    calc(var(--ert-pad-2xl) + var(--ert-pad-lg))
    calc(var(--ert-pad-lg) + var(--ert-gap-2xs));
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: var(--ert-gap-roomy);
  max-height: 92vh;
  min-height: 0;
  overflow: hidden;
}

/* Scrollable container for beat entries */
.ert-gossamer-score-modal .rt-container {
src/styles/modal.css:1148: margin: 0;
  padding: var(--ert-pad-sm) var(--ert-pad-md);
  color: var(--text-normal);
  background: rgba(255, 136, 56, 0.14);
  border-radius: 12px;
  border: 1px solid rgba(255, 136, 56, 0.3);
  font-size: 0.9rem;
  line-height: 1.5;
}

.rt-gossamer-simple-header {
src/styles/modal.css:1159: display: flex;
  flex-direction: column;
  gap: var(--ert-gap-tight);
  padding: var(--ert-pad-md) var(--ert-pad-lg) var(--ert-pad-sm);
}

.rt-gossamer-simple-badge {
src/styles/modal.css:1166: display: inline-flex;
  align-items: center;
  gap: var(--ert-gap-tight);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.7rem;
  padding: var(--ert-pad-tight) var(--ert-pad-sm);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-muted);
  font-weight: 600;
}

.rt-gossamer-hero-system {
src/styles/modal.css:1181: font-size: 1.6rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text-normal);
  margin: 0;
}

.rt-gossamer-score-subtitle {
src/styles/modal.css:1189: margin: 0;
  color: var(--text-muted);
  font-size: 0.95rem;
  line-height: 1.5;
}

.rt-gossamer-simple-meta {
src/styles/modal.css:1196: display: flex;
  flex-wrap: wrap;
  gap: var(--ert-gap-sm);
  margin-top: 8px;
}

/* rt-pulse-hero-meta-item - consolidated above with ert-modal-meta-item */
/* rt-pulse-hero-meta-item-warning - warning override consolidated above */

.rt-gossamer-score-cards {
src/styles/modal.css:1206: display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--ert-gap-loose);
}

.rt-gossamer-score-card {
src/styles/modal.css:1212: padding: var(--ert-pad-loose) var(--ert-pad-md);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.rt-gossamer-score-card-title {
src/styles/modal.css:1219: display: flex;
  align-items: center;
  gap: var(--ert-gap-tight);
  margin: 0 0 var(--ert-pad-cozy);
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-normal);
}

.rt-gossamer-score-card-value {
src/styles/modal.css:1229: margin: 0;
  font-size: 1.8rem;
  font-weight: 700;
  color: var(--text-normal);
}

.rt-gossamer-score-card-meta {
src/styles/modal.css:1236: margin: var(--ert-gap-tight) 0 0;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.rt-gossamer-score-card-progress {
src/styles/modal.css:1242: --rt-gossamer-progress-fill-running: linear-gradient(90deg, #ff9900, #ff5e00);
  --rt-gossamer-progress-fill-complete: linear-gradient(90deg, #31d47b, #0fb069);
  --rt-gossamer-progress-fill-error: linear-gradient(90deg, #ff5f6d, #d7263d);
  --rt-gossamer-progress-glow-running: 0 0 10px color-mix(in srgb, #ff9900 30%, transparent);
  --rt-gossamer-progress-glow-complete: 0 0 10px color-mix(in srgb, #31d47b 45%, transparent);
  --rt-gossamer-progress-glow-error: 0 0 12px color-mix(in srgb, #d7263d 45%, transparent);
  margin-top: 12px;
  width: 100%;
  height: 8px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 4px;
  overflow: hidden;
}

.rt-gossamer-score-card-progress-bar {
src/styles/modal.css:1257: height: 100%;
  width: var(--progress-width, 0%);
  background: var(--rt-gossamer-progress-fill-running);
  border-radius: 4px;
  transition: width 0.3s ease-out;
  box-shadow: var(--rt-gossamer-progress-glow-running);
}

.rt-gossamer-score-card-progress-bar.rt-progress-complete {
src/styles/modal.css:1266: background: var(--rt-gossamer-progress-fill-complete);
  box-shadow: var(--rt-gossamer-progress-glow-complete);
}

.rt-gossamer-score-card-progress-bar.rt-progress-error {
src/styles/modal.css:1271: background: var(--rt-gossamer-progress-fill-error);
  box-shadow: var(--rt-gossamer-progress-glow-error);
}

.rt-gossamer-score-table {
src/styles/modal.css:1276: width: 100%;
  border-collapse: collapse;
  margin-top: 12px;
  color: var(--text-normal);
  font-size: 0.95rem;
}

.rt-gossamer-score-table th,
.rt-gossamer-score-table td {
src/styles/modal.css:1285: padding: var(--ert-pad-cozy);
  text-align: left;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.rt-gossamer-score-table th {
src/styles/modal.css:1291: font-size: 0.9rem;
  color: var(--text-muted);
}

.rt-gossamer-score-table tr:last-child td {
src/styles/modal.css:1296: border-bottom: none;
}

.rt-gossamer-score-cta {
src/styles/modal.css:1300: display: flex;
  gap: var(--ert-gap-cozy);
  flex-wrap: wrap;
}

.rt-gossamer-score-cta .mod-warning {
src/styles/modal.css:1306: color: var(--text-warning);
  border-color: rgba(255, 165, 0, 0.4);
}

.rt-gossamer-score-cta .mod-success {
src/styles/modal.css:1311: color: var(--text-success);
}

.rt-gossamer-score-cta .mod-error {
src/styles/modal.css:1315: color: var(--text-error);
}

.rt-gossamer-score-cta .rt-warning-label {
src/styles/modal.css:1319: display: inline-flex;
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
src/styles/modal.css:1331: margin-top: 4px;
}

/* Keep score label/value readable on hover in the manual update modal */
.ert-gossamer-score-modal .rt-gossamer-score-item-container:hover .rt-gossamer-score-value,
.ert-gossamer-score-modal .rt-gossamer-score-item-container:hover .rt-gossamer-score-label {
src/styles/modal.css:1366: margin-top: 12px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ert-gap-cozy);
}

.ert-gossamer-score-modal .ert-modal-actions.rt-inline-actions {
src/styles/modal.css:1475: color: var(--text-normal);
  font-weight: 700;
}

.rt-gossamer-score-label {
src/styles/modal.css:1480: font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--text-normal);
}

.rt-gossamer-score-value {
src/styles/modal.css:1488: font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-normal);
}

.rt-gossamer-score-line {
src/styles/modal.css:1494: display: flex;
  align-items: center;
  gap: var(--ert-gap-sm);
  margin: var(--ert-gap-xs) 0;
}

.rt-gossamer-score-line svg {
src/styles/modal.css:1501: width: 24px;
  height: 24px;
}

.rt-gossamer-score-line text {
src/styles/modal.css:1506: fill: var(--text-normal);
}

.rt-gossamer-score-line .rt-gossamer-score-value {
src/styles/modal.css:1510: margin-left: auto;
}

.rt-gossamer-score-line [data-item-type=title] {
src/styles/modal.css:1514: fill: var(--rt-max-publish-stage-color);
  stroke: white;
  stroke-width: 0.07em;
  paint-order: stroke;
  font-size: 40px;
  font-weight: 700;
}

.rt-gossamer-score-format-info {
src/styles/modal.css:1523: margin-bottom: 12px;
  padding: var(--ert-pad-xs);
  background-color: var(--background-secondary);
  border-radius: 4px;
  font-size: 12px;
  color: var(--text-muted);
}

.rt-plot-system-selected {
src/styles/modal.css:1532: color: var(--text-success);
  font-weight: 500;
}

.rt-gossamer-options-container {
src/styles/modal.css:1537: display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--ert-gap-xl);
  margin: var(--ert-pad-comfy) 0;
}

.rt-gossamer-option-col {
src/styles/modal.css:1544: display: flex;
  flex-direction: column;
  gap: var(--ert-gap-sm);
}

.rt-gossamer-checkbox-row {
src/styles/modal.css:1550: display: flex;
  align-items: center;
  gap: var(--ert-gap-sm);
}

.rt-gossamer-checkbox {
src/styles/modal.css:1556: width: 18px;
  height: 18px;
  cursor: pointer;
  flex-shrink: 0;
}

.rt-gossamer-option-label {
src/styles/modal.css:1563: font-weight: 500;
  font-size: 14px;
  cursor: pointer;
}

.rt-gossamer-option-description {
src/styles/modal.css:1569: font-size: 12px;
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
src/styles/modal.css:1584: display: inline-flex;
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
src/styles/modal.css:1600: display: inline-flex;
  align-items: center;
}

.rt-apr-badge .ert-modal-badge-icon svg {
src/styles/modal.css:1605: width: 14px;
  height: 14px;
  stroke: var(--rt-social-color);
}

/* Color swatch (modal scope) */
.ert-ui.ert-scope--modal .ert-swatch {
src/styles/modal.css:2073: display: flex;
  align-items: center;
  gap: var(--ert-gap-sm);
}

/* Refresh Alert */
.rt-apr-refresh-alert {
src/styles/modal.css:2080: display: flex;
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
src/styles/modal.css:2093: width: 18px;
  height: 18px;
  stroke: var(--text-warning);
}

/* Reveal Section - compact checkbox grid */
.rt-apr-reveal-section {
src/styles/modal.css:2100: margin-bottom: 16px;
  padding: var(--ert-pad-md) var(--ert-pad-lg);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
}

.rt-apr-reveal-title {
src/styles/modal.css:2108: margin: 0 0 var(--ert-gap-xs);
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-normal);
  letter-spacing: 0.02em;
}

.rt-apr-reveal-desc {
src/styles/modal.css:2116: margin: 0 0 var(--ert-pad-loose);
  font-size: 0.85rem;
  color: var(--text-muted);
  line-height: 1.4;
}

.rt-apr-checkbox-grid {
src/styles/modal.css:2123: display: flex;
  flex-wrap: wrap;
  gap: var(--ert-gap-sm);
}

.rt-apr-checkbox-item {
src/styles/modal.css:2129: display: flex;
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
src/styles/modal.css:2141: background: rgba(255, 255, 255, 0.07);
  border-color: rgba(255, 255, 255, 0.15);
}

.rt-apr-checkbox-item input[type="checkbox"] {
src/styles/modal.css:2146: width: 14px;
  height: 14px;
  cursor: pointer;
  accent-color: var(--rt-social-color);
  flex-shrink: 0;
  margin: 0;
}

.rt-apr-checkbox-item label {
src/styles/modal.css:2155: font-size: 0.8rem;
  color: var(--text-normal);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}

/* Mode Section */
.rt-apr-mode-section {
src/styles/modal.css:2164: margin-bottom: 16px;
}

.rt-apr-mode-selector {
src/styles/modal.css:2168: display: flex;
  gap: var(--ert-gap-sm);
  flex-wrap: wrap;
}

.rt-apr-mode-btn,
.rt-apr-size-btn {
src/styles/modal.css:2175: padding: var(--ert-pad-xs) var(--ert-pad-md);
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
src/styles/modal.css:2188: background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.2);
}

.rt-apr-mode-btn.rt-active,
.rt-apr-size-btn.rt-active {
src/styles/modal.css:2194: background: rgba(var(--rt-social-color-rgb, 255, 212, 29), 0.2);
  border-color: var(--rt-social-color);
  color: var(--rt-social-color);
}

/* Size Section */
.rt-apr-size-section {
src/styles/modal.css:2201: margin-bottom: 16px;
}

.rt-apr-size-selector {
src/styles/modal.css:2205: display: flex;
  gap: var(--ert-gap-sm);
  flex-wrap: wrap;
  margin-bottom: 8px;
}

/* Side-by-side preview row */
.rt-apr-preview-row {
src/styles/modal.css:2213: display: flex;
  gap: var(--ert-gap-md);
  margin: var(--ert-pad-md) 0;
  justify-content: center;
}

.rt-apr-preview-card {
src/styles/modal.css:2220: --rt-apr-preview-active-glow: 0 0 12px color-mix(in srgb, var(--rt-social-color) 25%, transparent);
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
src/styles/modal.css:2232: border-color: rgba(255, 255, 255, 0.25);
  transform: translateY(-2px);
}

.rt-apr-preview-card.is-locked {
src/styles/modal.css:2237: cursor: default;
  opacity: 0.7;
}

.rt-apr-preview-card.is-locked:hover {
src/styles/modal.css:2242: border-color: rgba(255, 255, 255, 0.1);
  transform: none;
  box-shadow: none;
}

.rt-apr-preview-card.rt-active {
src/styles/modal.css:2248: border-color: var(--rt-social-color);
  box-shadow: var(--rt-apr-preview-active-glow);
}

.rt-apr-preview-thumb {
src/styles/modal.css:2253: display: flex;
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
src/styles/modal.css:2265: width: 100%;
  height: auto;
  max-height: 140px;
}

.rt-apr-preview-label {
src/styles/modal.css:2271: text-align: center;
  display: flex;
  flex-direction: column;
  gap: var(--ert-gap-2xs);
}

.rt-apr-preview-label strong {
src/styles/modal.css:2278: font-size: 0.95rem;
  color: var(--text-normal);
}

.rt-apr-preview-dims {
src/styles/modal.css:2283: font-size: 0.75rem;
  color: var(--text-muted);
  font-family: var(--font-monospace);
}

.rt-apr-preview-dims sup {
src/styles/modal.css:2289: font-size: 0.65em;
  line-height: 0;
  vertical-align: super;
}

.rt-apr-preview-usecase {
src/styles/modal.css:2295: font-size: 0.7rem;
  color: var(--text-faint);
}

/* Density tip note */
.rt-apr-density-note {
src/styles/modal.css:2301: display: flex;
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
src/styles/modal.css:2313: flex-shrink: 0;
  margin-top: 1px;
}

.rt-apr-density-icon svg {
src/styles/modal.css:2318: width: 14px;
  height: 14px;
  color: var(--rt-social-color);
}

.rt-apr-loading,
.rt-apr-empty {
src/styles/modal.css:2325: text-align: center;
  color: var(--text-muted);
  font-size: 0.95rem;
  padding: var(--ert-pad-3xl);
}

.rt-apr-error {
src/styles/modal.css:2332: text-align: center;
  color: var(--text-error);
  font-size: 0.95rem;
  padding: var(--ert-pad-3xl);
}

/* Identity Section */
.rt-apr-identity-section {
src/styles/modal.css:2340: margin-bottom: 16px;
}

.rt-apr-identity-section .setting-item {
src/styles/modal.css:2344: padding: var(--ert-pad-cozy) 0;
  border-top: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.rt-apr-identity-section .setting-item:last-child {
src/styles/modal.css:2350: border-bottom: none;
}

/* Actions Section */
.rt-apr-actions-section {
src/styles/modal.css:2355: margin-bottom: 16px;
}

.rt-apr-tabs-container {
src/styles/modal.css:2359: display: flex;
  gap: var(--ert-gap-sm);
  margin-bottom: 12px;
}

.rt-apr-tab {
src/styles/modal.css:2365: display: inline-flex;
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
src/styles/modal.css:2380: background: rgba(255, 255, 255, 0.06);
}

.rt-apr-tab.rt-active {
src/styles/modal.css:2384: background: rgba(var(--rt-social-color-rgb, 255, 212, 29), 0.15);
  border-color: rgba(var(--rt-social-color-rgb, 255, 212, 29), 0.4);
  color: var(--rt-social-color);
}

.rt-apr-tab svg {
src/styles/modal.css:2390: width: 14px;
  height: 14px;
}

.rt-apr-actions-content {
src/styles/modal.css:2395: padding: var(--ert-pad-sm) 0;
}

.rt-apr-tab-desc {
src/styles/modal.css:2399: margin: 0 0 var(--ert-pad-sm);
  color: var(--text-muted);
  font-size: 0.9rem;
  line-height: 1.5;
}

.rt-apr-embed-codes {
src/styles/modal.css:2406: margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.rt-apr-embed-codes h5 {
src/styles/modal.css:2412: margin: 0 0 var(--ert-pad-cozy);
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-normal);
}

.rt-apr-embed-codes .rt-row {
src/styles/modal.css:2419: display: flex;
  gap: var(--ert-gap-sm);
  flex-wrap: wrap;
}

/* Section titles in APR modal */
.rt-apr-modal .rt-section-title {
src/styles/modal.css:2426: margin: 0 0 var(--ert-pad-sm);
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-normal);
  letter-spacing: 0.02em;
  border-bottom: none;
}

/* Row utility */
.rt-apr-modal .rt-row {
src/styles/modal.css:2436: display: flex;
  gap: var(--ert-gap-cozy);
  flex-wrap: wrap;
}

/* Synopsis Controls */
.rt-synopsis-controls {
src/styles/modal.css:2443: padding: var(--ert-pad-roomy) var(--ert-pad-lg);
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: var(--ert-gap-lg);
}

.rt-synopsis-control {
src/styles/modal.css:2451: display: flex;
  flex-direction: column;
  gap: var(--ert-gap-tight);
}

/* Two-column row layout for synopsis controls */
.rt-synopsis-control--row {
src/styles/modal.css:2473: margin: 0;
  align-self: center;
}

.rt-synopsis-control-right {
src/styles/modal.css:2478: display: inline-flex;
  align-items: center;
  gap: var(--ert-gap-md);
  flex-shrink: 0;
}

.rt-synopsis-control-info {
src/styles/modal.css:2485: display: flex;
  flex-direction: column;
  gap: var(--ert-gap-xs);
  flex: 1;
  min-width: 0;
}

.rt-synopsis-control-label {
src/styles/modal.css:2493: font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-normal);
  letter-spacing: 0.01em;
}

.rt-synopsis-control-input {
src/styles/modal.css:2500: width: var(--ert-input-width-3digit);
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
src/styles/modal.css:2515: outline: none;
  border-color: var(--interactive-accent);
  background: rgba(255, 255, 255, 0.08);
}

.rt-synopsis-control-help {
src/styles/modal.css:2521: font-size: 0.85rem;
  color: var(--text-muted);
  line-height: 1.5;
  margin-top: 0;
}

.rt-synopsis-control-help .rt-synopsis-control-link {
src/styles/modal.css:2528: color: var(--interactive-accent);
  text-decoration: none;
  font-weight: 500;
}

.rt-synopsis-control-help .rt-synopsis-control-link:hover {
src/styles/modal.css:2534: text-decoration: underline;
}

.rt-synopsis-control-divider {
src/styles/modal.css:2538: border: none;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  margin: var(--ert-gap-xs) 0;
}

.rt-synopsis-threshold-warning {
src/styles/modal.css:2544: display: none;
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
src/styles/modal.css:2560: .rt-synopsis-control-right {
src/styles/modal.css:2566: grid-template-columns: auto minmax(0, 1fr);
    row-gap: var(--ert-gap-cozy);
  }

  .ert-synopsis-control--three-col .rt-synopsis-control-input {
src/styles/modal.css:2571: grid-column: 2;
    justify-self: end;
  }
}

.ert-ui.ert-scope--modal .rt-glass-card,
.ert-ui.ert-scope--modal .rt-card-glass,
.ert-ui .ert-scope--modal .rt-glass-card,
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
