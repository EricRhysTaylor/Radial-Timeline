---
name: ERT UI Refactor
description: Rules and patterns for refactoring UI components to the ERT archetype system.
---

# ERT UI Refactor Skill

This skill guides the refactoring of Obsidian plugin settings and modals to the Radial Timeline (ERT) UI system.

## Core Principles

1.  **Theme-First**: Respect Obsidian theme variables for surfaces, borders, and typography.
2.  **Scoped**: All custom styles MUST be under `.ert-ui`. Skins (e.g., `.ert-skin--social`) are nested under `.ert-ui`.
3.  **Tokens**: Use `--ert-*` tokens for spacing and rhythm. Avoid literal pixels.
4.  **Archetypes**: Use reusable layout patterns (`ert-panel`, `ert-row`, `ert-stack`). Do not use ad-hoc wrappers.
5.  **Additive**: Add accents (glows, borders) rather than replacing theme surfaces.
6.  **Preservation**: Do NOT delete legacy `rt-` styles or files until the entire refactor is verified and complete. Keep them in reserve.

## Refactoring Checklist

For each file (SettingsTab or Modal):

1.  **Add Scope Class**: Ensure the top-level container has `.ert-ui`.
    -   For Modals: Add to `contentEl` or a wrapper div.
    -   For Settings: Add to the main container.
2.  **Apply Archetypes**:
    -   Replace generic `div`s with `ert-panel`, `ert-row`, `ert-stack` where layout dictates.
    -   Use `ert-density--compact` for tighter spacing if needed.
3.  **Remove Legacy Styles**:
    -   Remove inline styles (except dynamic values).
    -   Remove `setting-item` or other Obsidian classes *if* creating a custom ERT component, BUT generic settings should generally strictly follow "Theme-First" and might just need the scope wrapper if they are standard. *Correction*: The guidelines say `❌ .setting-item { ... }` in CSS, meaning don't style them globally. But in HTML, we should use ERT archetypes if we want the ERT look.
    -   *Clarification*: If the element is a standard Obsidian setting (`new Setting(container)`), leave it as is unless replacing with a custom React/HTML ERT component. The guidelines seem to focus on *styling* bespoke components or wrapping standard ones.
4.  **Tokenize Spacing**:
    -   Ensure spacing uses vars like `var(--ert-row-gap)`.

## CSS Selectors (Reference)

-   **Scope**: `.ert-ui`
-   **Skins**: `.ert-skin--social`, `.ert-skin--pro` (apply to `.ert-ui` container or specific children).
-   **Archetypes**:
    -   `.ert-panel`: Card-like container.
    -   `.ert-row`: Flex row.
    -   `.ert-stack`: Vertical stack.

## Example Transformation

**Before:**
```typescript
const div = containerEl.createDiv();
div.addClass("my-custom-modal");
div.style.padding = "20px";
```

**After:**
```typescript
const div = containerEl.createDiv("ert-ui"); // Scope
div.addClass("ert-panel"); // Archetype
// Spacing handled by archetype or tokens in CSS, not inline style.
```
