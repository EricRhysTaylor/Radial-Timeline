# Modal UI & Styling Standards ("Gossamer Pulse")

To ensure visual consistency and a premium user experience, all new modals MUST follow the **"Gossamer Pulse"** design system. Do NOT use standard Obsidian styles or create new ad-hoc styles.

## 1. Modal Shell
*   **Class:** `rt-pulse-modal-shell` on `modalEl`.
*   **Inner Class:** `rt-pulse-modal` on `contentEl`.
*   **Dimensions:** Sized explicitly via inline styles (Obsidian safe pattern) to `width: 760px` / `maxWidth: 92vw` / `maxHeight: 92vh`.

## 2. Header Structure
All modals must use the `rt-gossamer-simple-header` layout.

```typescript
const hero = container.createDiv({ cls: 'rt-gossamer-simple-header' });

// Badge (Small Pill)
hero.createSpan({ cls: 'rt-gossamer-simple-badge', text: 'CATEGORY' });

// Title (Large System Font)
hero.createDiv({ cls: 'rt-gossamer-hero-system', text: 'Modal Title' });

// Subtitle (Muted Description)
hero.createDiv({ cls: 'rt-gossamer-score-subtitle', text: 'Brief description of what this modal does.' });

// Meta Data (Optional Row of details)
const meta = hero.createDiv({ cls: 'rt-gossamer-simple-meta' });
meta.createSpan({ cls: 'rt-pulse-hero-meta-item', text: 'Detail 1' });
```

## 3. Cards & Panels
Content should be grouped into "Glass Cards" rather than sitting on the plain background.

*   **Container Class:** `rt-pulse-glass-card`
*   **Section Heading:** `rt-manuscript-card-head` (inside the card)
*   **Explanatory Note:** `rt-manuscript-card-note` (muted text at bottom of card)

```typescript
const card = container.createDiv({ cls: 'rt-pulse-glass-card rt-manuscript-card' });
card.createDiv({ cls: 'rt-manuscript-card-head', text: 'Settings Group' });
// ... content ...
```

## 4. Interactive Elements (Pills)
Use "Pills" for toggle/selection groups instead of dropdowns or radio buttons when possible.

*   **Row Container:** `rt-manuscript-pill-row`
*   **Pill Item:** `rt-manuscript-pill`
*   **Active State:** `rt-is-active` class

## 5. Buttons (Actions)
Action buttons should live at the bottom in a dedicated container.

*   **Container:** `rt-beats-actions rt-manuscript-actions`
*   **Primary Button:** `.setCta()` (Obsidian API)
*   **Cancel Button:** Standard button.

---

## Example Implementation

Reference `src/modals/ManuscriptOptionsModal.ts` for the gold standard implementation of these patterns.

## Layout & CSS Rules

1. **Structure & Padding**
   - Keep descriptive text in a single `rt-pulse-info` block right after the hero.
   - Let CSS `gap` values define spacing. Avoid manual padding tweaks.

2. **Content Discipline**
   - Ensure the same phrase isn’t repeated in multiple places (hero subtitle vs card body).
   - Prefer reusable classes: `.rt-pulse-mode-option`, `.rt-pulse-ruler-*`, `.rt-pulse-actions`.

3. **Scroll Behavior**
   - Never apply fixed pixel heights to scroll areas. Use flex containers with `overflow-y:auto`.
   - Horizontal trackers belong inside `.rt-pulse-ruler-scroll`.

