# Story Beats Metadata Update

## Issue Resolved

Plot beats were incorrectly being identified as part of the subplot system using `data-item-type="Plot"`. This created confusion between story structure beats (e.g., "Opening Image", "Catalyst", etc. from Save The Cat or other plot systems) and the subplot system.

## Changes Made

### 1. Clarified Terminology

**Story Beats** are now clearly distinguished from subplots:
- Story beats = structural plot points from beat systems (Save The Cat, Hero's Journey, etc.)
- Subplots = narrative threads (Main Plot, Romance, B-story, etc.)

### 2. Updated Metadata Attributes

**Before:**
```html
<g class="rt-scene-group" data-item-type="Plot">
```

**After:**
```html
<g class="rt-scene-group beats" data-item-type="Beat">
```

**Changes:**
- Added `beats` class to story beat elements
- Changed `data-item-type` from `"Plot"` to `"Beat"`
- This applies to all story beat slices in the timeline

### 3. Files Updated

#### Rendering Components
- `src/renderer/components/Plots.ts` - Updated to use `beats` class and `data-item-type="Beat"`
- `src/renderer/components/Scenes.ts` - Updated conditional rendering for beats
- `src/renderer/modules/OuterRingRenderer.ts` - Updated new modular renderer

#### Interaction Handlers
- `src/view/modes/AllScenesMode.ts` - Updated to check for `Beat` instead of `Plot`
- `src/view/modes/MainPlotMode.ts` - Updated all selectors and comments
- `src/view/modes/GossamerMode.ts` - Updated beat slice handling
- `src/view/TimeLineView.ts` - Updated Gossamer mode muting logic

#### Services
- `src/services/RendererService.ts` - Updated beat group selectors
- `src/GossamerCommands.ts` - Updated muting logic with clarifying comments

#### Styles
- `src/styles.css` - Updated all CSS selectors:
  - `.rt-scene-group.beats` class selectors
  - `[data-item-type="Beat"]` attribute selectors
  - Updated comments to say "story beats" instead of "plot slices"

### 4. Backward Compatibility

The internal data model (`itemType === 'Plot'`) remains unchanged for now to avoid breaking:
- Scene data parsing in `main.ts`
- Frontmatter processing
- Gossamer score calculations
- File filtering logic

The changes are primarily in the **rendered output** (SVG attributes and CSS) and **interaction handlers** (selectors).

### 5. CSS Selectors Updated

All story beat-specific selectors now use:
```css
/* Modern selector (recommended) */
.rt-scene-group.beats .rt-scene-path { }

/* Attribute selector (fallback) */
.rt-scene-group[data-item-type="Beat"] .rt-scene-path { }
```

Non-beat elements use:
```css
/* Exclude beats */
.rt-scene-group:not(.beats):not([data-item-type="Beat"]) .rt-scene-path { }
```

### 6. Comments Updated

All comments throughout the codebase have been updated to use accurate terminology:
- "Story beats" instead of "plot beats" or "plot slices"
- "Beat items" instead of "Plot items"
- Clear distinction that beats are story structure, not subplots

## Benefits

1. **Clarity**: Story structure beats are now clearly distinguished from the subplot system
2. **Maintainability**: Code comments and selectors accurately reflect the purpose
3. **Consistency**: The `beats` class provides a clear, semantic identifier
4. **Flexibility**: Can target story beats independently from subplots in CSS and JavaScript

## Testing Status

- ✅ TypeScript compilation: No errors
- ⏳ Runtime testing: Pending user verification

## What Users Will Notice

**No visible changes in behavior!** This is a **metadata/architecture update** that:
- Makes the code clearer and more maintainable
- Sets up better structure for future features
- Doesn't change how beats are displayed or function

The only difference is in the HTML/SVG markup (for developers inspecting the DOM):
- Old: `<g class="rt-scene-group" data-item-type="Plot">`
- New: `<g class="rt-scene-group beats" data-item-type="Beat">`

## Related Documents

- `MODE_ARCHITECTURE_ANALYSIS.md` - Updated to reflect correct beat terminology
- `PHASE_1_COMPLETION.md` - Documents mode system (Phase 1)
- `PHASE_2_PROGRESS.md` - Documents modular rendering (Phase 2)

## Next Steps

If desired, we could complete the transition by:
1. Updating internal data model (`itemType` type definition)
2. Changing frontmatter parsing to use "Beat" terminology
3. Updating documentation and user-facing text
4. But this is **optional** - the current changes are sufficient

