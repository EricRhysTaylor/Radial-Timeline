# Phase 2 Progress: Extract Rendering Modules

## Status: Architecture Complete, Full Implementation In Progress

Phase 2 aims to extract rendering logic from the monolithic `TimelineRenderer.ts` into modular, mode-driven components. This will make it easy to add new modes without modifying existing rendering code.

## What's Been Completed ✅

### 1. Base Rendering Types (`src/renderer/modules/BaseRenderingTypes.ts`)

Created comprehensive type definitions for the modular rendering system:

```typescript
// Core interfaces
- RingGeometry: Ring dimensions and position
- ActGeometry: Act angular boundaries
- ScenePosition: Scene placement information
- RenderingContext: Complete context for rendering
- PluginFacade: Minimal plugin interface
- RenderingResult: Standardized result format

// Grouping types
- ScenesByActAndSubplot
- PlotsBySubplot
```

**Purpose:** Provides type-safe contracts for all rendering modules

### 2. Rendering Utilities (`src/renderer/modules/RenderingUtils.ts`)

Created shared utility functions used across all renderers:

```typescript
// Path generation
- buildCellArcPath(): Generate SVG arc paths
- formatNumber(): Format coordinates for SVG

// Scene positioning
- computeScenePositions(): Distribute scenes in angular space
- makeSceneId(): Generate consistent scene IDs

// Scene filtering
- shouldIncludeScene(): Mode-aware scene filtering
- filterScenesForMode(): Apply filtering logic

// Helpers
- getSubplotColor(): Resolve subplot colors from CSS
- renderVoidCell(): Render empty space
- calculateVoidSpace(): Compute remaining angular space
- encodePathForSvg() / decodePathFromSvg(): Safe path encoding
```

**Purpose:** Eliminates code duplication and provides reusable primitives

### 3. Outer Ring Renderer (`src/renderer/modules/OuterRingRenderer.ts`)

Created **strategy-based outer ring renderer** with mode-specific implementations:

```typescript
renderOuterRing(context, contentStrategy) {
    switch (contentStrategy) {
        case 'all-scenes':
            return renderAllScenesOuterRing(context);
        case 'main-plot-only':
            return renderMainPlotOuterRing(context);
        case 'chronological':
            // Future implementation
        default:
            return renderAllScenesOuterRing(context);
    }
}
```

**Implemented strategies:**
- **All Scenes:** All scenes from all subplots in manuscript order with subplot colors
- **Main Plot:** Only Main Plot scenes with publish stage colors, plot beats excluded
- **Chronological:** Placeholder for future implementation

**Purpose:** Pluggable outer ring strategies based on mode configuration

### 4. Mode Definition Updates

Updated mode definitions to reflect correct behavior:
- `PlotBeatDisplay` type updated: removed `'empty-rings'`, now just `'outer-ring-slices' | 'none'`
- `MAIN_PLOT_MODE` definition updated: `plotBeatDisplay: 'none'`
- Documentation updated: Main Plot mode **removes** plot beats entirely

## Architecture Benefits Already Achieved

### 1. **Separation of Concerns**
- Type definitions separate from logic
- Utilities separate from strategies
- Each mode strategy is independent

### 2. **Strategy Pattern**
```typescript
// Before (scattered if/else):
if (outerRingAllScenes) {
    // All scenes logic mixed with rendering
} else {
    // Main plot logic mixed with rendering
}

// After (clean strategy):
const mode = getModeDefinition(currentMode);
const result = renderOuterRing(context, mode.rendering.outerRingContent);
```

### 3. **Type Safety**
- All interfaces are strongly typed
- Mode configurations are type-checked
- No runtime type errors

### 4. **Testability**
- Each module can be tested in isolation
- Strategies can be unit tested
- No need to mock entire plugin

### 5. **Extensibility**
Adding Chronology mode now requires:
1. Implement `renderChronologicalOuterRing()`
2. Add case to strategy switch
3. Done - no existing code modified

## What's Not Yet Complete ❌

The current implementation is an **architectural proof-of-concept**. The simplified outer ring renderer doesn't include:

### Missing from OuterRingRenderer:
- ❌ Scene title rendering (textPath elements)
- ❌ Synopsis generation and positioning
- ❌ Number square rendering
- ❌ AI beats coloring integration
- ❌ Plot label rendering and adjustment
- ❌ Status-based coloring (Working/Todo patterns)
- ❌ Due date checking and overdue colors
- ❌ Open file highlighting
- ❌ Search result highlighting
- ❌ Zero Draft mode integration

### Not Yet Created:
- ❌ **InnerRingRenderer** module
- ❌ **PlotBeatRenderer** module  
- ❌ **SynopsisRenderer** module
- ❌ **NumberSquareRenderer** module

### Not Yet Refactored:
- ❌ Main `TimelineRenderer.ts` still uses old monolithic approach
- ❌ Existing code not yet updated to use new modules

## Completing Phase 2: Two Paths Forward

### Path A: Full Implementation (Comprehensive)
**Effort:** High (large refactor, ~2000+ lines of code to move)
**Timeline:** Several hours
**Risk:** Medium (breaking existing functionality)

**Tasks:**
1. Create InnerRingRenderer with subplot/chronological strategies
2. Create PlotBeatRenderer with conditional rendering
3. Create SynopsisRenderer for hover synopsis generation
4. Create NumberSquareRenderer for number square positioning
5. Move ALL rendering logic from TimelineRenderer.ts to modules
6. Update TimelineRenderer to orchestrate modules
7. Preserve all existing features (titles, synopsis, colors, etc.)
8. Comprehensive testing of all modes

**Result:** Fully modular, production-ready rendering system

### Path B: Incremental Integration (Pragmatic)
**Effort:** Low (leverage existing code)
**Timeline:** Quick
**Risk:** Low (minimal changes)

**Tasks:**
1. Keep current TimelineRenderer.ts as-is
2. Add mode-checking utility function:
   ```typescript
   function getShouldIncludeScene(scene, ring, mode) {
       return shouldIncludeScene(scene, ring.isOuterRing, mode === 'all-scenes');
   }
   ```
3. Use new utilities in existing renderer for scene filtering
4. Document the architecture for future refactors
5. Add new modes by extending existing patterns

**Result:** Architectural foundation in place, incremental migration over time

## Recommendation

Given that:
1. Phase 1 is complete and working (mode system)
2. The architectural patterns are established
3. Existing code works correctly
4. You want to add Chronology mode soon

I recommend **Path B** initially:
- Keep the working TimelineRenderer as-is
- Use the new utilities where helpful (scene filtering, positioning)
- When adding Chronology mode, implement it using the new module pattern
- Gradually migrate old code to new modules over time

This balances **progress** (getting architectural benefits) with **stability** (not breaking working code).

## Next Steps (Path B)

If we proceed with Path B:

1. ✅ **Keep current TimelineRenderer.ts** - It works, don't break it
2. **Add utility integration** - Use `filterScenesForMode()` in existing renderer
3. **Document the pattern** - Clear comments on how to add new modes
4. **Implement Chronology mode** - Use new module pattern as example
5. **Migrate incrementally** - Move pieces to modules as needed

## Next Steps (Path A)

If we proceed with Path A:

1. Create InnerRingRenderer module
2. Create PlotBeatRenderer module
3. Create SynopsisRenderer module
4. Create NumberSquareRenderer module
5. Refactor TimelineRenderer to orchestrate modules
6. Move all rendering logic to appropriate modules
7. Comprehensive testing
8. Update documentation

## Files Created So Far

```
src/renderer/modules/
├── BaseRenderingTypes.ts     ✅ Complete
├── RenderingUtils.ts          ✅ Complete
└── OuterRingRenderer.ts       ✅ Architecture complete (simplified)
```

## Testing Status

- ✅ TypeScript compilation: No errors
- ✅ Linting: No errors
- ⏳ Runtime testing: Not yet integrated into main renderer

## Conclusion

**Phase 2 architectural foundation is complete.** The modular rendering pattern is established and type-safe. The decision point is whether to:

**A)** Fully migrate all rendering code now (high effort, comprehensive)
**B)** Use the architecture incrementally (low effort, pragmatic)

Both paths achieve the goal of making modes modular and extensible. Path B gets there incrementally while maintaining stability.

**What would you like to do?**

