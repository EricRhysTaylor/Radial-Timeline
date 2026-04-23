# CSS Drift Debt

Generated: 2026-04-23T15:11:35.782Z

Snapshot of every WARN-level drift hit at the time of baseline reset. Work through these to ratchet the baseline down. After fixing a batch, run `npm run css-drift -- --maintenance --update-baseline` to lock in the new lower ceiling.

> **Note on counts:** this report scans only the _source_ CSS files under `src/styles/`. The drift check also scans the bundled `styles.css` output (auto-generated from sources), so its totals are roughly 2× these. Fixing a hit here will remove both copies after the next `npm run build`.

Regenerate this report anytime with: `node scripts/css-drift-report.mjs`.

## Totals

- **Total WARN hits:** 346
- `spacing-px`: 0
- `raw-hex`: 0
- `shadow-rgba`: 0
- `rt-legacy`: 346

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

## `rt-legacy` (346)


### src/styles/modal.css (296)

```
src/styles/modal.css:1: /* Template Dialog - Simple modals for save/delete/confirm actions */
.rt-template-dialog {
src/styles/modal.css:2: --ert-group-gap: var(--ert-gap-sm);
}

.rt-template-dialog .rt-glass-card.rt-sub-card {
src/styles/modal.css:6: padding: var(--ert-pad-md);
  gap: var(--ert-gap-sm);
}

.rt-template-dialog .rt-manuscript-group-setting {
src/styles/modal.css:11: padding: 0;
}

.rt-template-dialog .rt-sub-card-note {
src/styles/modal.css:15: margin-top: 0;
  padding: 0;
  color: var(--text-muted);
  font-size: 0.85rem;
  line-height: 1.5;
}

/* Consolidated badge pattern - all badges with identical styling grouped together */
.rt-scene-analysis-badge,
.rt-subplot-picker-badge {
src/styles/modal.css:25: display: inline-block;
  padding: var(--ert-pad-tight) var(--ert-pad-sm);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 8px;
}

/* Consolidated meta-item base pattern */
.rt-pulse-hero-meta-item {
src/styles/modal.css:40: display: inline-flex;
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
src/styles/modal.css:74: margin-right: auto;
}

/* ert-modal-actions base consolidated in rt-ui.css */

.rt-pulse-modal .ert-modal-actions {
src/styles/modal.css:116: width: 14px;
  height: 14px;
  stroke: var(--ert-modal-pro-accent);
  stroke-width: 2;
  fill: none;
}

/* Rename Subplot Modal sizing */
.rt-rename-subplot-modal.modal {
src/styles/modal.css:125: width: min(640px, 92vw);
  max-height: 92vh;
}

.rt-ai-context-actions {
src/styles/modal.css:130: display: flex;
  gap: var(--ert-gap-sm);
  justify-content: flex-end;
  margin-top: 20px;
  padding-top: 0;
}

/* AI Context Template Modal Styles */
.rt-ai-context-info {
src/styles/modal.css:139: margin: var(--ert-gap-tight) 0 var(--ert-pad-md) 0;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.4;
}

.rt-ai-context-selector-section {
src/styles/modal.css:146: margin-bottom: 16px;
}

.rt-ai-context-label {
src/styles/modal.css:150: font-weight: 600;
  margin-bottom: 6px;
  color: var(--text-normal);
}

.rt-ai-context-selector-row {
src/styles/modal.css:156: display: flex;
  gap: var(--ert-gap-sm);
  margin-bottom: 8px;
}

.rt-ai-context-selector-row .dropdown {
src/styles/modal.css:162: flex: 1;
  min-width: 200px;
}

.rt-ai-context-button-row {
src/styles/modal.css:167: display: flex;
  gap: var(--ert-gap-tight);
  flex-wrap: wrap;
}

.rt-ai-context-editor-section {
src/styles/modal.css:173: margin-bottom: 16px;
}

.rt-ai-context-textarea {
src/styles/modal.css:177: width: 100%;
  min-height: 150px;
  resize: vertical;
  font-family: var(--font-monospace);
  font-size: 13px;
  padding: var(--ert-pad-xs);
}

.rt-ai-context-textarea:disabled {
src/styles/modal.css:186: opacity: 0.6;
  cursor: not-allowed;
  background-color: var(--background-modifier-border);
}

.rt-ai-context-preview-section {
src/styles/modal.css:192: margin-bottom: 16px;
}

.rt-ai-context-preview {
src/styles/modal.css:196: background-color: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 4px;
  padding: var(--ert-pad-cozy);
  font-family: var(--font-monospace);
  font-size: 12px;
  color: var(--text-muted);
  white-space: pre-wrap;
  max-height: 120px;
  overflow-y: auto;
}

.rt-scene-analysis-modal {
src/styles/modal.css:209: display: flex;
  flex-direction: column;
  gap: var(--ert-gap-lg);
}

/* rt-scene-analysis-badge - consolidated above with ert-modal-badge */

.rt-scene-analysis-meta {
src/styles/modal.css:217: margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: var(--ert-gap-cozy);
}

.rt-scene-analysis-meta-item {
src/styles/modal.css:224: display: inline-block;
  padding: var(--ert-pad-xs) var(--ert-pad-loose);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 0.85rem;
  color: var(--text-muted);
  line-height: 1.4;
}

.rt-scene-analysis-modal .rt-glass-card {
src/styles/modal.css:235: background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  box-shadow: none;
}

.rt-pulse-modal-shell.modal {
src/styles/modal.css:242: width: min(760px, 92vw);
  max-height: 92vh;
}

.rt-pulse-modal {
src/styles/modal.css:247: position: relative;
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

.rt-pulse-modal.rt-gossamer-score-modal {
src/styles/modal.css:267: padding: 0;
}

.rt-pulse-modal::before {
src/styles/modal.css:271: content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 15% 10%, rgba(255, 255, 255, 0.08), transparent 52%),
    radial-gradient(circle at 85% 5%, rgba(247, 176, 92, 0.1), transparent 42%);
  pointer-events: none;
}

.rt-pulse-modal>* {
src/styles/modal.css:280: position: relative;
  z-index: 1;
}

/* rt-glass-card base consolidated in base.css */

.rt-gossamer-score-modal .rt-glass-card {
src/styles/modal.css:287: padding: var(--ert-pad-sm) var(--ert-pad-loose);
}

.rt-subplot-management-input-label {
src/styles/modal.css:291: margin-bottom: 8px;
  color: var(--text-muted);
}

.rt-subplot-management-input {
src/styles/modal.css:296: width: 100%;
  padding: var(--ert-pad-xs);
  border-radius: 4px;
  border: 1px solid var(--background-modifier-border);
  background: var(--background-primary);
  color: var(--text-normal);
}

.ert-modal-shell.modal:has(.rt-manage-subplots-modal) {
src/styles/modal.css:305: width: min(700px, 90vw);
  max-height: calc(92vh - 100px);
}

.rt-manage-subplots-modal {
src/styles/modal.css:310: display: flex;
  flex-direction: column;
  gap: var(--ert-gap-lg);
  height: 100%;
  min-height: calc(80vh - 100px);
  max-height: calc(90vh - 100px);
}

/* Height-safe shells for tall modals */
.rt-manuscript-modal,
.rt-gossamer-processing-modal,
.rt-book-designer-modal {
src/styles/modal.css:322: display: flex;
  flex-direction: column;
  gap: var(--ert-gap-lg);
  max-height: 92vh;
  min-height: 0;
}

.rt-manuscript-modal {
src/styles/modal.css:330: overflow-y: auto;
  overflow-x: hidden;
  scrollbar-gutter: stable;
  overscroll-behavior: contain;
  contain: paint;
}

.rt-gossamer-processing-modal {
src/styles/modal.css:338: overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  contain: paint;
}

.rt-book-designer-modal .rt-card-stack {
src/styles/modal.css:345: flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 6px;
  scrollbar-gutter: stable;
  overscroll-behavior: contain;
  contain: paint;
}

/* Planetary Time Modal */
.rt-planetary-modal-result {
src/styles/modal.css:357: margin-top: 0;
  font-weight: 700;
  font-size: 1.2rem;
  color: var(--text-normal);
  background: rgba(255, 255, 255, 0.04);
  padding: var(--ert-pad-sm) var(--ert-pad-md);
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--ert-gap-cozy);
}

.rt-planetary-modal .setting-item {
src/styles/modal.css:372: border-top: none;
  border-bottom: none;
  padding: var(--ert-pad-sm) 0;
}

.rt-planetary-modal .setting-item + .setting-item {
src/styles/modal.css:378: border-top: 1px solid rgba(255, 255, 255, 0.08);
}

/* Match date and time inputs to the same theme style */
.rt-planetary-modal input[type="date"],
.rt-planetary-modal input[type="time"] {
src/styles/modal.css:384: background-color: var(--background-primary-alt);
  color: var(--text-normal);
  border: 1px solid var(--background-modifier-border);
  border-radius: var(--input-radius);
  padding: var(--size-2-3) var(--size-4-3);
  font-size: var(--font-ui-medium);
  color-scheme: dark;
}

.rt-planetary-modal input[type="date"]::-webkit-calendar-picker-indicator,
.rt-planetary-modal input[type="time"]::-webkit-calendar-picker-indicator {
src/styles/modal.css:395: filter: invert(0.7) sepia(0.3) hue-rotate(10deg);
  opacity: 0.7;
}

.rt-planetary-modal .ert-modal-header {
src/styles/modal.css:400: padding-bottom: 12px;
  margin-bottom: 0;
  border-bottom: none;
}

.rt-planetary-modal-result-row {
src/styles/modal.css:406: display: flex;
  align-items: center;
  gap: var(--ert-gap-cozy);
  margin-top: 18px;
}

.rt-planetary-modal-result-row .rt-planetary-modal-result {
src/styles/modal.css:413: flex: 1;
  margin-top: 0;
}

.rt-planetary-result-icon {
src/styles/modal.css:418: display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.rt-planetary-result-icon svg {
src/styles/modal.css:425: width: 18px;
  height: 18px;
  opacity: 0.85;
  transform: translateY(0);
}

.rt-planetary-result-text {
src/styles/modal.css:432: flex: 1;
  text-align: center;
}

/* rt-drag-confirm-modal width controlled via inline styles in DragConfirmModal.ts */

.rt-drag-confirm-list {
src/styles/modal.css:439: display: flex;
  flex-direction: column;
  gap: var(--ert-gap-sm);
  margin: 0;
}

.rt-drag-confirm-section {
src/styles/modal.css:446: display: flex;
  flex-direction: column;
  gap: var(--ert-gap-cozy);
}

.rt-drag-confirm-history-frame {
src/styles/modal.css:452: background: none;
  border: none;
  border-radius: 0;
  padding: 0;
}

.rt-drag-confirm-history-list {
src/styles/modal.css:459: display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  max-height: 340px;
  overflow-y: auto;
  overflow-x: hidden;
  padding: var(--ert-pad-tight) var(--ert-gap-xs) var(--ert-pad-tight) var(--ert-gap-xs);
}

.rt-drag-confirm-section-title {
src/styles/modal.css:470: font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  padding: 0 var(--ert-gap-2xs);
}

.rt-drag-confirm-row {
src/styles/modal.css:479: display: flex;
  align-items: center;
  gap: var(--ert-gap-lg);
  padding: var(--ert-pad-sm);
  background-color: var(--background-secondary);
  border-radius: 8px;
  border: 1px solid var(--background-modifier-border);
}

.rt-drag-confirm-row-icon {
src/styles/modal.css:489: display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.9;
  color: var(--rt-confirm-accent, var(--text-normal));
}

.rt-drag-confirm-row-icon svg {
src/styles/modal.css:497: width: 24px;
  height: 24px;
}

.rt-drag-confirm-row-text {
src/styles/modal.css:502: font-size: 1.05em;
  line-height: 1.4;
}

/* Default inline arrow — used by the "Recent moves" rows. Small and muted. */
.rt-drag-confirm-inline-icon {
src/styles/modal.css:508: display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  margin: 0 var(--ert-gap-tight);
  vertical-align: text-bottom;
  color: var(--text-muted);
  opacity: 0.86;
}

.rt-drag-confirm-inline-icon svg {
src/styles/modal.css:520: width: 14px;
  height: 14px;
  display: block;
}

/* Current move summary row — larger, thicker, tinted with the subplot accent.
 * Scoped by the row-text parent so history rows keep the small treatment. */
.rt-drag-confirm-row-text .rt-drag-confirm-inline-icon {
src/styles/modal.css:528: width: 20px;
  height: 20px;
  margin: 0 var(--ert-gap-sm);
  vertical-align: -0.28em;
  color: var(--rt-confirm-accent, var(--text-muted));
  opacity: 1;
}

.rt-drag-confirm-row-text .rt-drag-confirm-inline-icon svg {
src/styles/modal.css:537: width: 20px;
  height: 20px;
  stroke-width: 2.5;
}

.rt-drag-confirm-impact-grid {
src/styles/modal.css:543: display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--ert-gap-cozy);
}

.rt-drag-confirm-impact-card {
src/styles/modal.css:549: display: flex;
  align-items: flex-start;
  gap: var(--ert-gap-md);
  padding: var(--ert-pad-cozy) var(--ert-pad-sm);
  background-color: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 8px;
}

.rt-drag-confirm-impact-text {
src/styles/modal.css:559: display: flex;
  flex-direction: column;
  gap: var(--ert-gap-2xs);
}

.rt-drag-confirm-impact-label {
src/styles/modal.css:565: font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.rt-drag-confirm-impact-value {
src/styles/modal.css:573: font-size: 0.96rem;
  line-height: 1.35;
  color: var(--text-normal);
}

.rt-drag-confirm-history-item {
src/styles/modal.css:579: display: flex;
  flex-direction: column;
  justify-content: center;
  text-align: left;
  box-sizing: border-box;
  padding: var(--ert-pad-sm) var(--ert-pad-loose);
  margin-bottom: 8px;
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  cursor: pointer;
}

.rt-drag-confirm-history-item:hover {
src/styles/modal.css:593: border-color: rgba(255, 255, 255, 0.18);
}

.rt-drag-confirm-history-item:focus-visible {
src/styles/modal.css:597: outline: none;
  border-color: rgba(255, 255, 255, 0.18);
}

.rt-drag-confirm-history-header {
src/styles/modal.css:602: display: flex;
  align-items: flex-start;
  gap: var(--ert-gap-sm);
  min-width: 0;
}

.rt-drag-confirm-history-icon {
src/styles/modal.css:609: flex: 0 0 auto;
  width: 14px;
  height: 14px;
  color: var(--text-muted);
  opacity: 0.82;
  margin-top: 2px;
}

.rt-drag-confirm-history-icon svg {
src/styles/modal.css:618: width: 14px;
  height: 14px;
  display: block;
}

.rt-drag-confirm-history-summary {
src/styles/modal.css:624: font-size: 0.88em;
  line-height: 1.35;
  color: var(--text-normal);
  min-width: 0;
}

.rt-drag-confirm-history-meta {
src/styles/modal.css:631: font-size: 0.78em;
  line-height: 1.35;
  color: var(--text-muted);
  margin-top: 2px;
  font-weight: 600;
}

.rt-drag-confirm-row.is-status-row {
src/styles/modal.css:639: border-style: dashed;
}

.rt-drag-confirm-row.is-status-row.is-hidden {
src/styles/modal.css:643: display: none;
}

.rt-drag-confirm-row.is-status-row.is-live {
src/styles/modal.css:647: border-color: color-mix(in srgb, var(--rt-confirm-accent, var(--interactive-accent)) 42%, var(--background-modifier-border));
  background: color-mix(in srgb, var(--rt-confirm-accent, var(--interactive-accent)) 10%, var(--background-secondary));
}

.rt-drag-confirm-row.is-status-row.is-complete {
src/styles/modal.css:652: border-color: color-mix(in srgb, var(--text-success) 38%, var(--background-modifier-border));
  background: color-mix(in srgb, var(--text-success) 10%, var(--background-secondary));
}

.rt-drag-confirm-row.is-status-row.is-error {
src/styles/modal.css:662: font-size: 0.98em;
  color: var(--text-normal);
}

.rt-drag-confirm-modal .ert-modal-actions .is-hidden-action {
src/styles/modal.css:667: display: none;
}

.rt-drag-confirm-modal .modal-close-button.is-locked-close {
src/styles/modal.css:671: visibility: hidden;
  pointer-events: none;
}

.ert-ui.ert-scope--modal .rt-drag-confirm-modal .ert-modal-badge {
src/styles/modal.css:676: color: var(--rt-confirm-accent, var(--text-muted));
  border-color: color-mix(in srgb, var(--rt-confirm-accent, var(--interactive-accent)) 45%, var(--background-modifier-border));
  background: color-mix(in srgb, var(--rt-confirm-accent, var(--interactive-accent)) 12%, var(--background-secondary));
}

.ert-ui.ert-scope--modal .rt-drag-confirm-modal .ert-modal-title {
src/styles/modal.css:682: background: linear-gradient(90deg,
      var(--rt-confirm-accent, var(--text-normal)),
      color-mix(in srgb, var(--rt-confirm-accent, var(--text-normal)) 66%, var(--text-faint) 34%));
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.ert-ui.ert-scope--modal .rt-drag-confirm-modal .rt-mod-cta {
src/styles/modal.css:691: background-color: var(--rt-confirm-accent, var(--interactive-accent));
}

.rt-text-input-modal-field {
src/styles/modal.css:695: width: 100%;
  margin-bottom: 12px;
  padding: var(--ert-pad-xs);
}

.rt-text-input-modal-buttons {
src/styles/modal.css:701: display: flex;
  gap: var(--ert-gap-sm);
  justify-content: flex-end;
}

.rt-subplot-picker-modal {
src/styles/modal.css:707: gap: var(--ert-gap-roomy);
}

.rt-subplot-picker-hero-stats {
src/styles/modal.css:711: display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--ert-gap-md);
  margin-top: 16px;
  margin-bottom: 20px;
  width: 100%;
}

.rt-subplot-picker-hero-stat {
src/styles/modal.css:720: padding: var(--ert-pad-cozy) var(--ert-pad-sm);
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  gap: var(--ert-gap-xs);
}

.rt-subplot-picker-hero-label {
src/styles/modal.css:730: font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.rt-subplot-picker-hero-value {
src/styles/modal.css:737: font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-normal);
}

.rt-subplot-picker-grid {
src/styles/modal.css:749: .rt-subplot-picker-grid {
src/styles/modal.css:750: grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.rt-subplot-picker-card {
src/styles/modal.css:755: display: flex;
  flex-direction: column;
  gap: var(--ert-gap-md);
}

.rt-subplot-picker-info {
src/styles/modal.css:761: margin: 0;
  color: var(--text-normal);
  font-size: 0.95rem;
  line-height: 1.5;
}

.rt-subplot-picker-hint {
src/styles/modal.css:768: margin: 0;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.rt-subplot-picker-label {
src/styles/modal.css:774: display: block;
  margin-bottom: 6px;
  color: var(--text-normal);
  font-weight: 600;
  font-size: 0.85rem;
}

.rt-subplot-picker-select {
src/styles/modal.css:782: display: flex;
  flex-direction: column;
  gap: var(--ert-gap-tight);
  margin-bottom: 16px;
}

.rt-subplot-picker-dropdown .dropdown {
src/styles/modal.css:789: width: 100%;
  font-size: 0.95rem;
}

.rt-subplot-picker-stats {
src/styles/modal.css:794: border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  padding: var(--ert-pad-sm) var(--ert-pad-md);
  display: flex;
  flex-direction: column;
  gap: var(--ert-gap-tight);
}

.rt-subplot-picker-stats-line {
src/styles/modal.css:804: font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-normal);
}

.rt-subplot-picker-summary {
src/styles/modal.css:810: margin-top: 10px;
  font-size: 0.78rem;
  color: var(--text-muted);
}

/* rt-subplot-picker-badge - consolidated at top with ert-modal-badge */

/* AI Prompt & Context advanced panel — wrap long lines instead of horizontal scroll. */
.ert-ai-advanced-pre {
src/styles/modal.css:819: white-space: pre-wrap;
  word-break: break-word;
  overflow-x: hidden;
}

/* Gossamer / Pulse modal overrides */
.rt-gossamer-score-modal .rt-pulse-progress-hero {
src/styles/modal.css:826: padding: var(--ert-pad-sm) var(--ert-pad-loose);
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow: none;
  border-radius: 12px;
  margin-bottom: 12px;
}

.rt-gossamer-score-modal .rt-pulse-progress-hero::after {
src/styles/modal.css:835: display: none;
}

.rt-gossamer-score-modal .rt-pulse-progress-body {
src/styles/modal.css:839: gap: var(--ert-gap-cozy);
  margin-top: 12px;
}

.rt-gossamer-score-modal .rt-pulse-progress-card {
src/styles/modal.css:844: padding: var(--ert-pad-md) var(--ert-pad-roomy);
  gap: var(--ert-gap-md);
}

.rt-gossamer-proc-modal {
src/styles/modal.css:849: padding: 0;
}

.rt-gossamer-proc-modal .rt-pulse-progress-body {
src/styles/modal.css:853: margin-top: 8px;
  overflow-y: visible;
  width: 100%;
}

.rt-gossamer-proc-info-section,
.rt-gossamer-proc-status-section {
src/styles/modal.css:860: margin-bottom: 20px;
}

/* rt-gossamer-proc-section-title replaced by rt-section-title in base.css */

.rt-gossamer-proc-manuscript-info {
src/styles/modal.css:866: margin-top: 12px;
}

.rt-gossamer-proc-stats {
src/styles/modal.css:870: display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--ert-gap-md);
}

.rt-gossamer-proc-stat-item {
src/styles/modal.css:876: background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: var(--ert-pad-sm) var(--ert-pad-md);
  display: flex;
  flex-direction: column;
  gap: var(--ert-gap-xs);
}

.rt-gossamer-proc-stat-label {
src/styles/modal.css:886: font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

.rt-gossamer-proc-stat-value {
src/styles/modal.css:893: font-size: 1.2rem;
  font-weight: 600;
  color: var(--text-normal);
}

.rt-gossamer-proc-stat-row {
src/styles/modal.css:899: font-size: 13px;
  color: var(--text-normal);
  display: flex;
  gap: var(--ert-gap-sm);
}

.rt-gossamer-proc-iterative-note {
src/styles/modal.css:906: margin-top: 8px;
  padding: var(--ert-pad-xs) var(--ert-pad-sm);
  background-color: var(--background-secondary);
  border-radius: 4px;
  border-left: 3px solid var(--interactive-accent);
  font-weight: 500;
}

.rt-gossamer-proc-status-text {
src/styles/modal.css:915: padding: var(--ert-pad-cozy) var(--ert-pad-sm);
  background-color: var(--background-secondary);
  border-radius: 4px;
  font-size: 13px;
  color: var(--text-normal);
  min-height: 40px;
  display: flex;
  align-items: center;
}

.rt-gossamer-proc-api-status {
src/styles/modal.css:926: margin-top: 8px;
  padding: 0 var(--ert-gap-2xs);
  font-size: 13px;
  color: var(--text-muted);
  min-height: 0;
  display: flex;
  align-items: center;
}

.rt-gossamer-proc-error-header {
src/styles/modal.css:936: font-weight: 600;
  color: var(--text-error);
  margin-bottom: 8px;
}

.rt-gossamer-proc-error-item {
src/styles/modal.css:942: font-size: 0.85rem;
  color: var(--text-error);
  margin-bottom: 4px;
}

.rt-gossamer-proc-beat-system-info {
src/styles/modal.css:948: font-weight: 600;
  color: var(--text-normal);
  margin-bottom: 12px;
}

.rt-gossamer-progress-container {
src/styles/modal.css:954: margin: var(--ert-pad-lg) 0;
}

.rt-gossamer-progress-bg {
src/styles/modal.css:958: width: 100%;
  height: 24px;
  background-color: var(--background-secondary);
  border-radius: 12px;
  overflow: hidden;
  position: relative;
}

.rt-gossamer-progress-bar {
src/styles/modal.css:967: height: 100%;
  background: linear-gradient(90deg, var(--interactive-accent), var(--interactive-accent-hover));
  border-radius: 12px;
  transition: width 0.5s ease;
  position: relative;
  width: var(--progress-width, 0%);
}

.rt-gossamer-progress-bar::after {
src/styles/modal.css:976: content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2) 50%, transparent);
  animation: progress-shine 2s infinite;
}

.rt-gossamer-progress-bar.rt-progress-complete::after {
src/styles/modal.css:987: animation: none;
}

.rt-gossamer-actions {
src/styles/modal.css:991: margin-top: 20px;
  display: flex;
  gap: var(--ert-gap-cozy);
  justify-content: flex-end;
}

.rt-beat-placement-modal {
src/styles/modal.css:998: padding: 0;
}

.rt-beat-placement-modal .rt-beats-info {
src/styles/modal.css:1002: margin: var(--ert-gap-tight) 0 var(--ert-pad-lg) 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.5;
}

.rt-beat-placement-modal .rt-manuscript-section {
src/styles/modal.css:1009: margin-bottom: 20px;
}

.rt-beat-placement-modal .rt-manuscript-section h3 {
src/styles/modal.css:1013: font-size: 14px;
  font-weight: 600;
  color: var(--text-normal);
  margin: 0 0 var(--ert-pad-cozy) 0;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--background-modifier-border);
}

.rt-beat-placement-modal .rt-manuscript-details {
src/styles/modal.css:1022: padding: var(--ert-pad-sm);
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
src/styles/modal.css:1034: margin-bottom: 20px;
  padding: var(--ert-pad-sm);
  background-color: rgba(255, 165, 0, 0.1);
  border: 1px solid rgba(255, 165, 0, 0.3);
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-normal);
  line-height: 1.5;
}

.rt-beat-placement-modal .ert-modal-buttons {
src/styles/modal.css:1045: margin-top: 20px;
  display: flex;
  gap: var(--ert-gap-cozy);
  justify-content: flex-end;
}

.rt-beat-placement-modal .rt-status-text {
src/styles/modal.css:1052: padding: var(--ert-pad-cozy) var(--ert-pad-sm);
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
src/styles/modal.css:1064: padding: var(--ert-pad-cozy) var(--ert-pad-sm);
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
src/styles/modal.css:1076: margin: var(--ert-pad-lg) 0;
}

.rt-beat-placement-modal .rt-beat-placement-progress-bg {
src/styles/modal.css:1080: width: 100%;
  height: 24px;
  background-color: var(--background-secondary);
  border-radius: 12px;
  overflow: hidden;
  position: relative;
}

.rt-beat-placement-modal .rt-beat-placement-progress-bar {
src/styles/modal.css:1089: height: 100%;
  background: linear-gradient(90deg, var(--interactive-accent), var(--interactive-accent-hover));
  border-radius: 12px;
  transition: width 0.5s ease;
  position: relative;
  width: var(--progress-width, 0%);
}

.rt-beat-placement-modal .rt-beat-placement-progress-bar::after {
src/styles/modal.css:1098: content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2) 50%, transparent);
  animation: progress-shine 2s infinite;
}

.rt-beat-placement-modal .rt-beat-placement-progress-bar.rt-progress-complete::after {
src/styles/modal.css:1109: animation: none;
}

.rt-beat-placement-modal .rt-error-list {
src/styles/modal.css:1113: margin-top: 12px;
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
src/styles/modal.css:1125: margin: 0;
  line-height: 1.4;
}

.rt-beat-placement-modal .rt-error-item:last-child {
src/styles/modal.css:1130: margin-bottom: 0;
}

.rt-gossamer-assembly-modal .rt-gossamer-title {
src/styles/modal.css:1134: margin-bottom: 20px;
}

.rt-gossamer-assembly-modal .rt-gossamer-progress {
src/styles/modal.css:1138: margin-bottom: 20px;
}

.rt-gossamer-assembly-modal .rt-gossamer-progress-title {
src/styles/modal.css:1142: margin-bottom: 10px;
}

.rt-gossamer-assembly-modal .rt-gossamer-progress-status {
src/styles/modal.css:1146: font-family: var(--font-monospace);
  padding: var(--ert-pad-cozy);
  background-color: var(--background-secondary);
  border-radius: 4px;
  min-height: 60px;
}

.rt-gossamer-assembly-modal .rt-gossamer-summary {
src/styles/modal.css:1154: margin-bottom: 20px;
}

.rt-gossamer-assembly-modal .rt-gossamer-summary-title {
src/styles/modal.css:1158: margin-bottom: var(--ert-pad-comfy);
}

.rt-gossamer-assembly-modal .rt-gossamer-summary-content {
src/styles/modal.css:1162: font-family: var(--font-monospace);
  padding: var(--ert-pad-comfy);
  background-color: var(--background-secondary);
  border-radius: 4px;
  line-height: 1.8;
}

.rt-gossamer-assembly-modal .rt-gossamer-warning {
src/styles/modal.css:1170: margin-top: var(--ert-pad-comfy);
  padding: var(--ert-pad-cozy);
  background-color: var(--background-modifier-error);
  border-radius: 4px;
  color: var(--text-on-accent);
}

.rt-gossamer-assembly-modal .rt-gossamer-buttons {
src/styles/modal.css:1178: margin-top: 20px;
  display: flex;
  gap: var(--ert-gap-cozy);
  justify-content: flex-end;
}

.rt-gossamer-assembly-modal .rt-gossamer-buttons.rt-hidden {
src/styles/modal.css:1185: display: none;
}

.rt-gossamer-assembly-modal .rt-hidden {
src/styles/modal.css:1189: display: none;
}

.rt-gossamer-score-modal {
src/styles/modal.css:1193: padding:
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
.rt-gossamer-score-modal .rt-container {
src/styles/modal.css:1208: flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding-right: 8px;
  display: flex;
  flex-direction: column;
  gap: var(--ert-gap-lg);
}

.rt-gossamer-warning {
src/styles/modal.css:1218: margin: 0;
  padding: var(--ert-pad-sm) var(--ert-pad-md);
  color: var(--text-normal);
  background: rgba(255, 136, 56, 0.14);
  border-radius: 12px;
  border: 1px solid rgba(255, 136, 56, 0.3);
  font-size: 0.9rem;
  line-height: 1.5;
}

.rt-gossamer-simple-header {
src/styles/modal.css:1229: display: flex;
  flex-direction: column;
  gap: var(--ert-gap-tight);
  padding: var(--ert-pad-md) var(--ert-pad-lg) var(--ert-pad-sm);
}

.rt-gossamer-simple-badge {
src/styles/modal.css:1236: display: inline-flex;
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
src/styles/modal.css:1251: font-size: 1.6rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--text-normal);
  margin: 0;
}

.rt-gossamer-score-subtitle {
src/styles/modal.css:1259: margin: 0;
  color: var(--text-muted);
  font-size: 0.95rem;
  line-height: 1.5;
}

.rt-gossamer-simple-meta {
src/styles/modal.css:1266: display: flex;
  flex-wrap: wrap;
  gap: var(--ert-gap-sm);
  margin-top: 8px;
}

/* rt-pulse-hero-meta-item - consolidated above with ert-modal-meta-item */
/* rt-pulse-hero-meta-item-warning - warning override consolidated above */

.rt-gossamer-score-cards {
src/styles/modal.css:1276: display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--ert-gap-loose);
}

.rt-gossamer-score-card {
src/styles/modal.css:1282: padding: var(--ert-pad-loose) var(--ert-pad-md);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.rt-gossamer-score-card-title {
src/styles/modal.css:1289: display: flex;
  align-items: center;
  gap: var(--ert-gap-tight);
  margin: 0 0 var(--ert-pad-cozy);
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-normal);
}

.rt-gossamer-score-card-value {
src/styles/modal.css:1299: margin: 0;
  font-size: 1.8rem;
  font-weight: 700;
  color: var(--text-normal);
}

.rt-gossamer-score-card-meta {
src/styles/modal.css:1306: margin: var(--ert-gap-tight) 0 0;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.rt-gossamer-score-card-progress {
src/styles/modal.css:1312: --rt-gossamer-progress-fill-running: linear-gradient(90deg, #ff9900, #ff5e00);
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
src/styles/modal.css:1327: height: 100%;
  width: var(--progress-width, 0%);
  background: var(--rt-gossamer-progress-fill-running);
  border-radius: 4px;
  transition: width 0.3s ease-out;
  box-shadow: var(--rt-gossamer-progress-glow-running);
}

.rt-gossamer-score-card-progress-bar.rt-progress-complete {
src/styles/modal.css:1336: background: var(--rt-gossamer-progress-fill-complete);
  box-shadow: var(--rt-gossamer-progress-glow-complete);
}

.rt-gossamer-score-card-progress-bar.rt-progress-error {
src/styles/modal.css:1341: background: var(--rt-gossamer-progress-fill-error);
  box-shadow: var(--rt-gossamer-progress-glow-error);
}

.rt-gossamer-score-table {
src/styles/modal.css:1346: width: 100%;
  border-collapse: collapse;
  margin-top: 12px;
  color: var(--text-normal);
  font-size: 0.95rem;
}

.rt-gossamer-score-table th,
.rt-gossamer-score-table td {
src/styles/modal.css:1355: padding: var(--ert-pad-cozy);
  text-align: left;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.rt-gossamer-score-table th {
src/styles/modal.css:1361: font-size: 0.9rem;
  color: var(--text-muted);
}

.rt-gossamer-score-table tr:last-child td {
src/styles/modal.css:1366: border-bottom: none;
}

.rt-gossamer-score-cta {
src/styles/modal.css:1370: display: flex;
  gap: var(--ert-gap-cozy);
  flex-wrap: wrap;
}

.rt-gossamer-score-cta .mod-warning {
src/styles/modal.css:1376: color: var(--text-warning);
  border-color: rgba(255, 165, 0, 0.4);
}

.rt-gossamer-score-cta .mod-success {
src/styles/modal.css:1381: color: var(--text-success);
}

.rt-gossamer-score-cta .mod-error {
src/styles/modal.css:1385: color: var(--text-error);
}

.rt-gossamer-score-cta .rt-warning-label {
src/styles/modal.css:1389: display: inline-flex;
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
src/styles/modal.css:1401: margin-top: 4px;
}

/* Keep score label/value readable on hover in the manual update modal */
.rt-gossamer-score-modal .rt-gossamer-score-item-container:hover .rt-gossamer-score-value,
.rt-gossamer-score-modal .rt-gossamer-score-item-container:hover .rt-gossamer-score-label {
src/styles/modal.css:1407: color: var(--text-normal);
}

.rt-purge-issues-grid {
src/styles/modal.css:1411: display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--ert-gap-cozy);
}

.rt-purge-issue-card {
src/styles/modal.css:1417: padding: var(--ert-pad-cozy) var(--ert-pad-sm);
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
}

.rt-purge-issue-title {
src/styles/modal.css:1424: margin: 0 0 var(--ert-pad-tight);
  font-size: 0.95rem;
  font-weight: 700;
}

.rt-purge-issue-note {
src/styles/modal.css:1430: margin: 0;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.rt-gossamer-score-modal .ert-modal-actions {
src/styles/modal.css:1436: margin-top: 12px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ert-gap-cozy);
}

.rt-gossamer-score-modal .ert-modal-actions.rt-inline-actions {
src/styles/modal.css:1444: justify-content: space-between;
  align-items: center;
}

.rt-gossamer-score-modal .rt-purge-issues {
src/styles/modal.css:1449: margin-top: 12px;
}

.rt-gossamer-score-modal .rt-purge-issues-title {
src/styles/modal.css:1453: margin: 0 0 var(--ert-pad-tight);
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-normal);
}

.rt-gossamer-score-modal .rt-purge-issues-list {
src/styles/modal.css:1460: list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ert-gap-tight);
}

.rt-gossamer-score-modal .rt-purge-issues-item {
src/styles/modal.css:1469: display: flex;
  flex-wrap: wrap;
  gap: var(--ert-gap-tight);
  align-items: flex-start;
  color: var(--text-muted);
  line-height: 1.35;
}

.rt-gossamer-score-modal .rt-purge-issues-item strong {
src/styles/modal.css:1478: color: var(--text-normal);
}

.rt-gossamer-score-modal .rt-purge-issues-footnote {
src/styles/modal.css:1482: margin-top: 6px;
  color: var(--text-muted);
  font-size: 0.85rem;
}

.rt-purge-confirm-card {
src/styles/modal.css:1488: padding: var(--ert-pad-md) var(--ert-pad-roomy);
  display: flex;
  flex-direction: column;
  gap: var(--ert-gap-cozy);
}

.rt-purge-confirm-modal .ert-modal-subtitle {
src/styles/modal.css:1495: margin-bottom: 12px;
}

.rt-purge-message {
src/styles/modal.css:1499: font-size: 1rem;
  color: var(--text-normal);
  line-height: 1.5;
}

.rt-purge-message-secondary {
src/styles/modal.css:1505: color: var(--text-muted);
}

.rt-purge-message + .rt-purge-message {
src/styles/modal.css:1509: margin-top: 12px;
}

.rt-purge-details {
src/styles/modal.css:1513: display: flex;
  flex-direction: column;
  gap: var(--ert-gap-sm);
  color: var(--text-normal);
}

.rt-purge-danger {
src/styles/modal.css:1520: color: var(--text-normal);
  font-weight: 700;
}

.rt-purge-list {
src/styles/modal.css:1525: margin: 0;
  padding-left: 20px;
  color: var(--text-normal);
  line-height: 1.4;
}

.rt-purge-list li {
src/styles/modal.css:1532: margin: calc(var(--ert-gap-3xs) + var(--ert-gap-2xs)) 0;
}

.rt-purge-list code {
src/styles/modal.css:1536: font-family: var(--font-monospace);
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: var(--ert-gap-2xs) var(--ert-gap-tight);
  color: var(--text-normal);
}

.rt-purge-warning {
src/styles/modal.css:1545: color: var(--text-normal);
  font-weight: 700;
}

.rt-gossamer-score-label {
src/styles/modal.css:1550: font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--text-normal);
}

.rt-gossamer-score-value {
src/styles/modal.css:1558: font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-normal);
}

.rt-gossamer-score-line {
src/styles/modal.css:1564: display: flex;
  align-items: center;
  gap: var(--ert-gap-sm);
  margin: var(--ert-gap-xs) 0;
}

.rt-gossamer-score-line svg {
src/styles/modal.css:1571: width: 24px;
  height: 24px;
}

.rt-gossamer-score-line text {
src/styles/modal.css:1576: fill: var(--text-normal);
}

.rt-gossamer-score-line .rt-gossamer-score-value {
src/styles/modal.css:1580: margin-left: auto;
}

.rt-gossamer-score-line [data-item-type=title] {
src/styles/modal.css:1584: fill: var(--rt-max-publish-stage-color);
  stroke: white;
  stroke-width: 0.07em;
  paint-order: stroke;
  font-size: 40px;
  font-weight: 700;
}

.rt-gossamer-score-format-info {
src/styles/modal.css:1593: margin-bottom: 12px;
  padding: var(--ert-pad-xs);
  background-color: var(--background-secondary);
  border-radius: 4px;
  font-size: 12px;
  color: var(--text-muted);
}

.rt-plot-system-selected {
src/styles/modal.css:1602: color: var(--text-success);
  font-weight: 500;
}

.rt-gossamer-options-container {
src/styles/modal.css:1607: display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--ert-gap-xl);
  margin: var(--ert-pad-comfy) 0;
}

.rt-gossamer-option-col {
src/styles/modal.css:1614: display: flex;
  flex-direction: column;
  gap: var(--ert-gap-sm);
}

.rt-gossamer-checkbox-row {
src/styles/modal.css:1620: display: flex;
  align-items: center;
  gap: var(--ert-gap-sm);
}

.rt-gossamer-checkbox {
src/styles/modal.css:1626: width: 18px;
  height: 18px;
  cursor: pointer;
  flex-shrink: 0;
}

.rt-gossamer-option-label {
src/styles/modal.css:1633: font-weight: 500;
  font-size: 14px;
  cursor: pointer;
}

.rt-gossamer-option-description {
src/styles/modal.css:1639: font-size: 12px;
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
src/styles/modal.css:1654: display: inline-flex;
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
src/styles/modal.css:1670: display: inline-flex;
  align-items: center;
}

.rt-apr-badge .ert-modal-badge-icon svg {
src/styles/modal.css:1675: width: 14px;
  height: 14px;
  stroke: var(--rt-social-color);
}

/* Color swatch (modal scope) */
.ert-ui.ert-scope--modal .ert-swatch {
src/styles/modal.css:2143: display: flex;
  align-items: center;
  gap: var(--ert-gap-sm);
}

/* Refresh Alert */
.rt-apr-refresh-alert {
src/styles/modal.css:2150: display: flex;
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
src/styles/modal.css:2163: width: 18px;
  height: 18px;
  stroke: var(--text-warning);
}

/* Reveal Section - compact checkbox grid */
.rt-apr-reveal-section {
src/styles/modal.css:2170: margin-bottom: 16px;
  padding: var(--ert-pad-md) var(--ert-pad-lg);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
}

.rt-apr-reveal-title {
src/styles/modal.css:2178: margin: 0 0 var(--ert-gap-xs);
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-normal);
  letter-spacing: 0.02em;
}

.rt-apr-reveal-desc {
src/styles/modal.css:2186: margin: 0 0 var(--ert-pad-loose);
  font-size: 0.85rem;
  color: var(--text-muted);
  line-height: 1.4;
}

.rt-apr-checkbox-grid {
src/styles/modal.css:2193: display: flex;
  flex-wrap: wrap;
  gap: var(--ert-gap-sm);
}

.rt-apr-checkbox-item {
src/styles/modal.css:2199: display: flex;
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
src/styles/modal.css:2211: background: rgba(255, 255, 255, 0.07);
  border-color: rgba(255, 255, 255, 0.15);
}

.rt-apr-checkbox-item input[type="checkbox"] {
src/styles/modal.css:2216: width: 14px;
  height: 14px;
  cursor: pointer;
  accent-color: var(--rt-social-color);
  flex-shrink: 0;
  margin: 0;
}

.rt-apr-checkbox-item label {
src/styles/modal.css:2225: font-size: 0.8rem;
  color: var(--text-normal);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}

/* Mode Section */
.rt-apr-mode-section {
src/styles/modal.css:2234: margin-bottom: 16px;
}

.rt-apr-mode-selector {
src/styles/modal.css:2238: display: flex;
  gap: var(--ert-gap-sm);
  flex-wrap: wrap;
}

.rt-apr-mode-btn,
.rt-apr-size-btn {
src/styles/modal.css:2245: padding: var(--ert-pad-xs) var(--ert-pad-md);
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
src/styles/modal.css:2258: background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.2);
}

.rt-apr-mode-btn.rt-active,
.rt-apr-size-btn.rt-active {
src/styles/modal.css:2264: background: rgba(var(--rt-social-color-rgb, 255, 212, 29), 0.2);
  border-color: var(--rt-social-color);
  color: var(--rt-social-color);
}

/* Size Section */
.rt-apr-size-section {
src/styles/modal.css:2271: margin-bottom: 16px;
}

.rt-apr-size-selector {
src/styles/modal.css:2275: display: flex;
  gap: var(--ert-gap-sm);
  flex-wrap: wrap;
  margin-bottom: 8px;
}

/* Side-by-side preview row */
.rt-apr-preview-row {
src/styles/modal.css:2283: display: flex;
  gap: var(--ert-gap-md);
  margin: var(--ert-pad-md) 0;
  justify-content: center;
}

.rt-apr-preview-card {
src/styles/modal.css:2290: --rt-apr-preview-active-glow: 0 0 12px color-mix(in srgb, var(--rt-social-color) 25%, transparent);
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
src/styles/modal.css:2302: border-color: rgba(255, 255, 255, 0.25);
  transform: translateY(-2px);
}

.rt-apr-preview-card.is-locked {
src/styles/modal.css:2307: cursor: default;
  opacity: 0.7;
}

.rt-apr-preview-card.is-locked:hover {
src/styles/modal.css:2312: border-color: rgba(255, 255, 255, 0.1);
  transform: none;
  box-shadow: none;
}

.rt-apr-preview-card.rt-active {
src/styles/modal.css:2318: border-color: var(--rt-social-color);
  box-shadow: var(--rt-apr-preview-active-glow);
}

.rt-apr-preview-thumb {
src/styles/modal.css:2323: display: flex;
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
src/styles/modal.css:2335: width: 100%;
  height: auto;
  max-height: 140px;
}

.rt-apr-preview-label {
src/styles/modal.css:2341: text-align: center;
  display: flex;
  flex-direction: column;
  gap: var(--ert-gap-2xs);
}

.rt-apr-preview-label strong {
src/styles/modal.css:2348: font-size: 0.95rem;
  color: var(--text-normal);
}

.rt-apr-preview-dims {
src/styles/modal.css:2353: font-size: 0.75rem;
  color: var(--text-muted);
  font-family: var(--font-monospace);
}

.rt-apr-preview-dims sup {
src/styles/modal.css:2359: font-size: 0.65em;
  line-height: 0;
  vertical-align: super;
}

.rt-apr-preview-usecase {
src/styles/modal.css:2365: font-size: 0.7rem;
  color: var(--text-faint);
}

/* Density tip note */
.rt-apr-density-note {
src/styles/modal.css:2371: display: flex;
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
src/styles/modal.css:2383: flex-shrink: 0;
  margin-top: 1px;
}

.rt-apr-density-icon svg {
src/styles/modal.css:2388: width: 14px;
  height: 14px;
  color: var(--rt-social-color);
}

.rt-apr-loading,
.rt-apr-empty {
src/styles/modal.css:2395: text-align: center;
  color: var(--text-muted);
  font-size: 0.95rem;
  padding: var(--ert-pad-3xl);
}

.rt-apr-error {
src/styles/modal.css:2402: text-align: center;
  color: var(--text-error);
  font-size: 0.95rem;
  padding: var(--ert-pad-3xl);
}

/* Identity Section */
.rt-apr-identity-section {
src/styles/modal.css:2410: margin-bottom: 16px;
}

.rt-apr-identity-section .setting-item {
src/styles/modal.css:2414: padding: var(--ert-pad-cozy) 0;
  border-top: none;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.rt-apr-identity-section .setting-item:last-child {
src/styles/modal.css:2420: border-bottom: none;
}

/* Actions Section */
.rt-apr-actions-section {
src/styles/modal.css:2425: margin-bottom: 16px;
}

.rt-apr-tabs-container {
src/styles/modal.css:2429: display: flex;
  gap: var(--ert-gap-sm);
  margin-bottom: 12px;
}

.rt-apr-tab {
src/styles/modal.css:2435: display: inline-flex;
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
src/styles/modal.css:2450: background: rgba(255, 255, 255, 0.06);
}

.rt-apr-tab.rt-active {
src/styles/modal.css:2454: background: rgba(var(--rt-social-color-rgb, 255, 212, 29), 0.15);
  border-color: rgba(var(--rt-social-color-rgb, 255, 212, 29), 0.4);
  color: var(--rt-social-color);
}

.rt-apr-tab svg {
src/styles/modal.css:2460: width: 14px;
  height: 14px;
}

.rt-apr-actions-content {
src/styles/modal.css:2465: padding: var(--ert-pad-sm) 0;
}

.rt-apr-tab-desc {
src/styles/modal.css:2469: margin: 0 0 var(--ert-pad-sm);
  color: var(--text-muted);
  font-size: 0.9rem;
  line-height: 1.5;
}

.rt-apr-embed-codes {
src/styles/modal.css:2476: margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.rt-apr-embed-codes h5 {
src/styles/modal.css:2482: margin: 0 0 var(--ert-pad-cozy);
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-normal);
}

.rt-apr-embed-codes .rt-row {
src/styles/modal.css:2489: display: flex;
  gap: var(--ert-gap-sm);
  flex-wrap: wrap;
}

/* Section titles in APR modal */
.rt-apr-modal .rt-section-title {
src/styles/modal.css:2496: margin: 0 0 var(--ert-pad-sm);
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-normal);
  letter-spacing: 0.02em;
  border-bottom: none;
}

/* Row utility */
.rt-apr-modal .rt-row {
src/styles/modal.css:2506: display: flex;
  gap: var(--ert-gap-cozy);
  flex-wrap: wrap;
}

/* Synopsis Controls */
.rt-synopsis-controls {
src/styles/modal.css:2513: padding: var(--ert-pad-roomy) var(--ert-pad-lg);
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: var(--ert-gap-lg);
}

.rt-synopsis-control {
src/styles/modal.css:2521: display: flex;
  flex-direction: column;
  gap: var(--ert-gap-tight);
}

/* Two-column row layout for synopsis controls */
.rt-synopsis-control--row {
src/styles/modal.css:2543: margin: 0;
  align-self: center;
}

.rt-synopsis-control-right {
src/styles/modal.css:2548: display: inline-flex;
  align-items: center;
  gap: var(--ert-gap-md);
  flex-shrink: 0;
}

.rt-synopsis-control-info {
src/styles/modal.css:2555: display: flex;
  flex-direction: column;
  gap: var(--ert-gap-xs);
  flex: 1;
  min-width: 0;
}

.rt-synopsis-control-label {
src/styles/modal.css:2563: font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-normal);
  letter-spacing: 0.01em;
}

.rt-synopsis-control-input {
src/styles/modal.css:2570: width: var(--ert-input-width-3digit);
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
src/styles/modal.css:2585: outline: none;
  border-color: var(--interactive-accent);
  background: rgba(255, 255, 255, 0.08);
}

.rt-synopsis-control-help {
src/styles/modal.css:2591: font-size: 0.85rem;
  color: var(--text-muted);
  line-height: 1.5;
  margin-top: 0;
}

.rt-synopsis-control-help .rt-synopsis-control-link {
src/styles/modal.css:2598: color: var(--interactive-accent);
  text-decoration: none;
  font-weight: 500;
}

.rt-synopsis-control-help .rt-synopsis-control-link:hover {
src/styles/modal.css:2604: text-decoration: underline;
}

.rt-synopsis-control-divider {
src/styles/modal.css:2608: border: none;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  margin: var(--ert-gap-xs) 0;
}

.rt-synopsis-threshold-warning {
src/styles/modal.css:2614: display: none;
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
src/styles/modal.css:2630: .rt-synopsis-control-right {
src/styles/modal.css:2636: grid-template-columns: auto minmax(0, 1fr);
    row-gap: var(--ert-gap-cozy);
  }

  .ert-synopsis-control--three-col .rt-synopsis-control-input {
src/styles/modal.css:2641: grid-column: 2;
    justify-self: end;
  }
}

.ert-ui.ert-scope--modal .rt-glass-card,
.ert-ui.ert-scope--modal .rt-card-glass,
.ert-ui .ert-scope--modal .rt-glass-card,
.ert-ui .ert-scope--modal .rt-card-glass {
```

### src/styles/legacy/rt-ui-legacy.css (50)

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

/* Legacy settings input validation styles (modals) */
.rt-setting-input-success {
src/styles/legacy/rt-ui-legacy.css:28: border-color: var(--text-success);
  background-color: color-mix(in srgb, var(--text-success) 10%, transparent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--text-success) 20%, transparent);
}

.rt-setting-input-error {
src/styles/legacy/rt-ui-legacy.css:34: border-color: var(--text-error);
  background-color: color-mix(in srgb, var(--text-error) 10%, transparent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--text-error) 20%, transparent);
}

/* -------------------------------------------------------------------------- */
/* MIGRATED FROM settings.css (rt-* selectors)                                */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/* PROFESSIONAL SECTION                                                       */
/* -------------------------------------------------------------------------- */

.ert-settings-root .rt-professional-header-toggle .setting-item-control {
src/styles/legacy/rt-ui-legacy.css:89: background-color: var(--background-primary);
  padding: 1em;
  border-radius: 5px;
  overflow-x: auto;
  margin: 1em 0;
}

/* Input sizing utilities (shared across settings) */
.rt-input-xs {
src/styles/legacy/rt-ui-legacy.css:98: width: var(--rt-input-width-xs);
  min-width: var(--rt-input-width-xs);
}

.rt-input-sm {
src/styles/legacy/rt-ui-legacy.css:103: width: var(--rt-input-width-sm);
  min-width: var(--rt-input-width-sm);
}

.rt-input-lg {
src/styles/legacy/rt-ui-legacy.css:108: width: var(--rt-input-width-lg);
  min-width: var(--rt-input-width-lg);
}

.rt-input-full {
src/styles/legacy/rt-ui-legacy.css:113: width: 100%;
  min-width: var(--rt-input-width-xl);
}

.ert-settings-root .setting-item .setting-item-control .rt-input-full {
src/styles/legacy/rt-ui-legacy.css:118: width: 100%;
  min-width: var(--rt-input-width-xl);
}

/* Default sizing for settings inputs (override with utilities above when needed) */
.ert-settings-root .setting-item .setting-item-control input[type="text"]:not(.rt-input-xs):not(.rt-input-sm):not(.rt-input-md):not(.rt-input-lg):not(.rt-input-full):not(.ert-input--xs):not(.ert-input--2digit):not(.ert-input--sm):not(.ert-input--md):not(.ert-input--lg):not(.ert-input--xl):not(.ert-input--full):not(.ert-hex-input),
.ert-settings-root .setting-item .setting-item-control input[type="number"]:not(.rt-input-xs):not(.rt-input-sm):not(.rt-input-md):not(.rt-input-lg):not(.rt-input-full):not(.ert-input--xs):not(.ert-input--2digit):not(.ert-input--sm):not(.ert-input--md):not(.ert-input--lg):not(.ert-input--xl):not(.ert-input--full),
.ert-settings-root .setting-item .setting-item-control input[type="password"]:not(.rt-input-xs):not(.rt-input-sm):not(.rt-input-md):not(.rt-input-lg):not(.rt-input-full):not(.ert-input--xs):not(.ert-input--2digit):not(.ert-input--sm):not(.ert-input--md):not(.ert-input--lg):not(.ert-input--xl):not(.ert-input--full) {
src/styles/legacy/rt-ui-legacy.css:126: width: var(--rt-input-width-md);
  max-width: 100%;
}

.ert-settings-root .setting-item .setting-item-control textarea {
src/styles/legacy/rt-ui-legacy.css:131: width: 100%;
}

.ert-settings-root .setting-item .setting-item-control textarea.rt-input-lg {
src/styles/legacy/rt-ui-legacy.css:135: width: var(--rt-input-width-lg);
  min-width: var(--rt-input-width-lg);
  max-width: 100%;
}

/* Align settings rows to the top when descriptions wrap */

.ert-settings-root .setting-item.setting-item-heading .setting-item-name {
src/styles/legacy/rt-ui-legacy.css:170: align-self: center;
  margin-top: 0;
}

.rt-template-actions {
src/styles/legacy/rt-ui-legacy.css:200: font-weight: 600;
  color: var(--rt-pro-color);
}

.ert-runtime-hint {
src/styles/legacy/rt-ui-legacy.css:223: max-height: 200px;
  overflow-y: auto;
  margin-top: 12px;
}

/* Utility class for hiding elements */
.rt-hidden {
src/styles/legacy/rt-ui-legacy.css:243: margin-bottom: 12px;
}

/* Runtime sections use glass-card but without heavy dropshadow */
.rt-glass-card.ert-runtime-section {
src/styles/legacy/rt-ui-legacy.css:248: box-shadow: none;
}

/* ert-runtime-section-header replaced by rt-section-title in base.css */

.ert-runtime-section-desc {
src/styles/legacy/rt-ui-legacy.css:254: font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 12px;
}

/* ert-runtime-scope-layout, ert-runtime-scope-info, ert-runtime-scope-controls, ert-runtime-scope-row
   replaced by rt-row and rt-stack utilities in base.css */

.ert-runtime-dropdown-container {
src/styles/legacy/rt-ui-legacy.css:304: color: var(--text-muted);
  font-style: italic;
}

/* ert-runtime-status-row replaced by rt-row rt-row-loose rt-row-wrap in base.css */

.ert-runtime-status-checkbox {
src/styles/legacy/rt-ui-legacy.css:355: color: var(--rt-pro-color);
}

.ert-runtime-accordion-icon {
src/styles/legacy/rt-ui-legacy.css:419: font-size: 11px;
  color: var(--text-faint);
  margin-top: 12px;
  font-style: italic;
}

/* Books settings (moved from rt-ui.css during ERT migration) */

/* "+" add-book button in heading (ert-iconBtn ert-mod-cta base) */
.rt-books-add-btn--pulse {
src/styles/legacy/rt-ui-legacy.css:429: box-shadow: 0 0 0 1px color-mix(in srgb, var(--text-success) 28%, transparent);
}

.rt-books-panel {
src/styles/legacy/rt-ui-legacy.css:433: gap: var(--ert-gap-sm);
}

/* Book card: single-row Setting with bordered card look */
.rt-book-card.setting-item {
src/styles/legacy/rt-ui-legacy.css:438: display: grid;
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
src/styles/legacy/rt-ui-legacy.css:454: opacity: 1;
  pointer-events: auto;
}

.rt-book-card.setting-item.is-active {
src/styles/legacy/rt-ui-legacy.css:459: border-color: color-mix(in srgb, var(--text-success) 50%, transparent);
}

.rt-book-card.setting-item.rt-book-card--link-broken {
src/styles/legacy/rt-ui-legacy.css:463: border-color: color-mix(in srgb, var(--text-error) 42%, var(--background-modifier-border));
  background: color-mix(in srgb, var(--text-error) 6%, var(--background-primary));
}

/* Name column: status icon + title stacked above desc */
.rt-book-card__name {
src/styles/legacy/rt-ui-legacy.css:469: display: flex;
  align-items: center;
  gap: var(--ert-gap-sm);
}

.rt-book-card .setting-item-info {
src/styles/legacy/rt-ui-legacy.css:475: min-width: 0;
}

.rt-book-card .setting-item-control {
src/styles/legacy/rt-ui-legacy.css:479: min-width: 0;
}

.rt-book-card__drag {
src/styles/legacy/rt-ui-legacy.css:483: display: flex;
  align-items: center;
  justify-content: center;
  align-self: stretch;
  min-width: 28px;
  color: var(--text-faint);
  cursor: grab;
}

.rt-book-card__drag svg {
src/styles/legacy/rt-ui-legacy.css:493: width: 16px;
  height: 16px;
}

.rt-book-card__meta {
src/styles/legacy/rt-ui-legacy.css:498: letter-spacing: 0.02em;
}

.rt-book-card__status {
src/styles/legacy/rt-ui-legacy.css:502: display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--text-faint);
}

.rt-book-card__status svg {
src/styles/legacy/rt-ui-legacy.css:510: width: 16px;
  height: 16px;
}

.rt-book-card__status--active {
src/styles/legacy/rt-ui-legacy.css:515: color: var(--text-success);
}

.rt-book-card__status--invalid {
src/styles/legacy/rt-ui-legacy.css:519: color: var(--text-error);
}

/* Clickable row to activate inactive book */
.rt-book-card--clickable {
src/styles/legacy/rt-ui-legacy.css:524: cursor: pointer;
}

.rt-book-card--clickable:hover {
src/styles/legacy/rt-ui-legacy.css:528: border-color: color-mix(in srgb, var(--text-success) 40%, transparent);
}

.rt-book-card--clickable:hover .rt-book-card__status {
src/styles/legacy/rt-ui-legacy.css:532: color: var(--text-success);
}

.rt-book-card--clickable.rt-book-card--link-broken:hover {
src/styles/legacy/rt-ui-legacy.css:536: border-color: color-mix(in srgb, var(--text-error) 42%, var(--background-modifier-border));
}

.rt-book-card--clickable.rt-book-card--link-broken:hover .rt-book-card__status--invalid {
src/styles/legacy/rt-ui-legacy.css:540: color: var(--text-error);
}

.rt-book-card__stat--warn {
src/styles/legacy/rt-ui-legacy.css:544: color: var(--text-faint);
}

.rt-book-card__stat--invalid {
src/styles/legacy/rt-ui-legacy.css:548: color: var(--text-error);
}

.rt-book-card__trash.is-disabled {
src/styles/legacy/rt-ui-legacy.css:552: opacity: 0.3;
  pointer-events: none;
}

.rt-books-panel--dragging .rt-book-card .setting-item-control,
.rt-books-panel--dragging .rt-book-card .ert-book-name {
src/styles/legacy/rt-ui-legacy.css:558: pointer-events: none;
}

.rt-book-card.setting-item.is-dragging {
src/styles/legacy/rt-ui-legacy.css:562: opacity: 0.36;
  box-shadow: none;
}

.rt-book-card.setting-item.is-dragover {
src/styles/legacy/rt-ui-legacy.css:567: border-color: color-mix(in srgb, var(--interactive-accent) 72%, var(--background-modifier-border));
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--interactive-accent) 28%, transparent),
    inset 0 0 0 1px color-mix(in srgb, var(--interactive-accent) 16%, transparent);
}

.rt-book-card--dragPreview {
```
