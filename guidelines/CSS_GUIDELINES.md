# Radial Timeline CSS Guidelines
**Scope:** Settings + Modals UI only (ERT UI)  
**Out of scope:** SVG renderers (Radial Timeline SVG, Inquiry, APR SVG output), canvas/visualization engines

---

## Vocabulary
- **Obsidian Theme**: User theme. Owns tactile surfaces (bevels), base colors, focus rings, native controls.
- **ERT UI**: Radial Timeline UI system (layout archetypes + components).
- **Skin**: Scoped accent styling layered over the theme (`ert-skin--social`, `ert-skin--pro`).
- **Archetype**: Reusable layout/surface pattern (`ert-panel`, `ert-row`, `ert-stack`, typography rows, etc.).

---

## Core Principles
1. **Theme-first**
   - Prefer Obsidian CSS variables for surfaces, borders, typography, shadows.
   - Avoid hardcoded colors and custom bevel stacks.

2. **Scoped by default**
   - All ERT UI CSS must live under `.ert-ui`.
   - Skin overrides must live under `.ert-ui .ert-skin--X`.

3. **Tokens, not pixels**
   - Use ERT tokens (`--ert-*`) for spacing and rhythm.
   - Avoid literal px except `0`.

4. **No one-off wrappers**
   - If layout/surface is special, create/extend an **archetype**.
   - Do not invent bespoke classes for spacing fixes.

5. **Additive styling**
   - Don't replace theme surfaces; add accents (border/outline/glow).
   - Preserve theme bevels/shadows, especially for pills/swatches.

---

## File Ownership
- `src/styles/rt-ui.css`: ERT UI system + skins + archetypes (primary).
- `src/styles/settings.css`: Minimal Obsidian wiring only.
- `src/styles/legacy/*.css`: Temporary legacy selectors only.

**Never add** `.rt-*` selectors to `rt-ui.css`.

---

## Selector Rules
### Required scoping
✅ `.ert-ui .ert-panel { ... }`  
✅ `.ert-ui.ert-skin--social .ert-panel { ... }`  
❌ `.setting-item { ... }`  
❌ `button { ... }`

### Specificity
- Keep selectors shallow.
- Avoid deep chains (e.g., `.ert-ui .ert-panel .setting-item-control input`).
- Use variants/skins instead of escalating specificity.

---

## Color Rules
### Hard bans
- No hex/rgb/rgba in component rules.
- No gradient literals on components.

### Allowed
- Raw colors only in **token declarations**.
- Prefer theme vars and `color-mix()` for subtle tinting.

---

## Spacing & Rhythm
- Use tokens:
  - `--ert-row-pad`
  - `--ert-row-gap`
  - `--ert-group-gap`
  - `--ert-control-h`
- Density changes via `ert-density--compact`, not ad-hoc margins.

---

## Components: Theme Presence Contract
### Native controls
- Theme owns background/border/shadow/focus.
- ERT may set height/padding/width only.

### Pills / Icon buttons / Chips
- Inherit theme surfaces.
- Accents are additive (ring/glow).
- Never flatten via `background` or `box-shadow` overrides.

### Color swatches
- Background shows actual color.
- Border/shadow/focus from theme vars.
- Accent ring on hover/active only.

---

## Skins & Nesting
- Skins are nestable.
- Nested skin wins (Pro inside Social stays Pro).
- Provide explicit nested overrides:
  - `.ert-ui.ert-skin--social .ert-skin--pro .ert-panel { ... }`

---

## Banned Practices
- `!important`
- Unscoped global selectors
- Raw colors outside tokens
- Flattening theme bevels
- New archetypes without documentation

---

## Migration Rules (rt-* → ert-*)
1. Bridge: add ERT classes alongside rt-*.
2. Move CSS to ERT selectors.
3. Remove rt-* once unused by CSS/JS.

---

## Review Checklist
- [ ] Scoped under `.ert-ui`
- [ ] No `!important`
- [ ] No raw colors outside tokens
- [ ] Tokenized spacing
- [ ] Theme bevel preserved
- [ ] Skins nest correctly

---

## Build Gate
Fail on:
- `!important`
- Unscoped `.setting-item` / `.modal`
- Raw colors outside tokens
- `.rt-*` selectors in `rt-ui.css`

Warn on:
- Literal px spacing
- Raw rgba shadows
