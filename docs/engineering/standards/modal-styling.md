# Modal Styling

## Status
This document is **deprecated as a primary source of truth**.

Read `ui-architecture.md` first for the current modal shell contract.

## Current Modal Contract
New shared modal shell work should follow:
- `ert-ui`
- `ert-scope--modal`
- `ert-modal-shell` on `modalEl`
- `ert-modal-container` on `contentEl`

Sizing remains an inline-style exception on `modalEl`:

```ts
if (modalEl) {
  // SAFE: Modal sizing via inline styles (Obsidian pattern)
  modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell');
  modalEl.style.width = '720px';
  modalEl.style.maxWidth = '92vw';
}

contentEl.addClass('ert-modal-container', 'ert-stack');
```

## Legacy Context
Older `rt-*` modal patterns such as `rt-pulse-modal-shell`, `rt-pulse-modal`, and `rt-gossamer-*` structures still exist in parts of the codebase.

Those patterns are:
- **legacy**
- **tolerated during migration**
- **not the current shared modal standard**

Do not use this document as justification for adding new pre-ERT modal shells.
