# Stage 2 Completion: Enable ModeManager

**Date**: October 24, 2025  
**Status**: ✅ Complete

---

## Objective

Enable `ModeManager` for mode switching while keeping the old rendering logic intact. This creates a "dual system" where mode switching goes through the new architecture, but rendering still uses the existing code paths.

---

## Changes Made

### 1. Updated `GossamerCommands.ts`

#### Import Statement
```typescript
import { TimelineMode } from './modes/ModeDefinition';
```

#### `enterGossamerMode()` Function
- Made function `async` to support ModeManager's async operations
- Added check for `ModeManager` availability via `view.getModeManager()`
- **New Path**: If `ModeManager` exists, use `modeManager.switchMode(TimelineMode.GOSSAMER)`
  - ModeManager handles: settings persistence, lifecycle hooks, and refresh
- **Legacy Path**: Falls back to direct property manipulation if `ModeManager` not available
- Wrapped selective update logic to only run in legacy mode (ModeManager handles refresh automatically)

#### `exitGossamerMode()` Function
- Made function `async` to support ModeManager's async operations
- Added check for `ModeManager` availability
- **New Path**: If `ModeManager` exists:
  - Restores base mode via `restoreBaseMode(plugin)`
  - Determines target mode from `outerRingAllScenes` setting
  - Uses `modeManager.switchMode()` to return to previous mode
  - Returns early (ModeManager handles cleanup)
- **Legacy Path**: Full legacy cleanup if `ModeManager` not available

---

## How It Works

### Mode Switching Flow (New Path)

1. **User Action**: Toggle button or Gossamer command
2. **ModeManager Check**: Code checks if `view.getModeManager()` exists
3. **If ModeManager Exists**:
   - `ModeManager.switchMode(newMode)` is called
   - ModeManager executes `onExit` lifecycle hook for current mode
   - ModeManager updates `view.currentMode` and syncs legacy properties
   - ModeManager persists to `plugin.settings.currentMode`
   - ModeManager executes `onEnter` lifecycle hook for new mode
   - ModeManager triggers `refreshTimeline()` to re-render
4. **If No ModeManager** (shouldn't happen, but safe):
   - Falls back to legacy mode switching
   - Direct property manipulation and manual refresh

### Backward Compatibility

✅ **Dual System in Place**:
- New code paths use `ModeManager`
- Old code paths still exist as fallback
- Both systems can coexist safely
- Plugin works with or without `ModeManager`

### What Still Uses Old Code

- **Rendering Logic**: `TimelineRenderer.ts` still has all mode-specific branching
- **Most Interactions**: Event handlers still use legacy setup
- **Settings**: Still updates `outerRingAllScenes` for backward compatibility

---

## Testing Checklist

Before proceeding to Stage 3, verify:

- [ ] All Scenes mode toggle works
- [ ] Main Plot mode toggle works
- [ ] Enter Gossamer mode works (via command or toggle)
- [ ] Exit Gossamer mode works (via command or toggle)
- [ ] Gossamer returns to correct previous mode
- [ ] Mode persists after closing/reopening view
- [ ] Mode persists after closing/reopening Obsidian
- [ ] No console errors
- [ ] No visual glitches during mode transitions
- [ ] Rendering looks identical to Stage 1

---

## Files Modified

1. **`src/GossamerCommands.ts`**
   - Added `TimelineMode` import
   - Updated `enterGossamerMode()` to use `ModeManager` (with fallback)
   - Updated `exitGossamerMode()` to use `ModeManager` (with fallback)

2. **`src/modes/ModeManager.ts`** (already existed from Phase 3)
   - Already handles mode switching and refresh

3. **`src/view/TimeLineView.ts`** (already existed from Phase 3)
   - Already has `modeManager` instance
   - Already has `getModeManager()` accessor
   - `refreshTimeline()` method already works

---

## Key Architectural Points

### Separation of Concerns

- **Mode Switching**: Now handled by `ModeManager` ✅
- **Rendering**: Still handled by `TimelineRenderer` (old code) 🔄
- **Interactions**: Still handled by legacy setup methods 🔄

### Migration Strategy

This stage demonstrates the **strangler fig pattern**:
- New functionality (mode management) wraps around old functionality
- Old functionality still works independently
- Gradual replacement without breaking changes
- Can rollback easily if issues arise

### Why This Approach?

1. **Safety**: If `ModeManager` has issues, legacy code takes over
2. **Testing**: Can verify mode switching works before touching rendering
3. **Incremental**: Small, testable changes
4. **Reversible**: Can easily revert without losing all progress

---

## Next Steps: Stage 3

Once Stage 2 testing is complete, Stage 3 will:

1. Add feature flag: `useNewRenderingSystem: boolean`
2. Update `TimelineRenderer.ts` to check mode definitions for rendering decisions
3. Gradually migrate rendering logic:
   - Outer ring rendering (story beats visibility)
   - Subplot ring visibility
   - Inner ring content
4. Keep feature flag `false` by default (manual opt-in for testing)
5. Run full Stage 1 test suite with flag enabled

---

## Success Criteria ✅

- [x] TypeScript compilation successful (no errors)
- [x] Backward compatibility maintained (legacy fallback exists)
- [x] Mode switching uses `ModeManager` when available
- [x] Gossamer enter/exit uses `ModeManager` when available
- [x] Code is clean and documented
- [ ] Manual testing complete (user must verify)

---

## Notes

- The `ModeManager` automatically calls `refreshTimeline()` after mode switches
- The `ModeManager` respects lifecycle hooks (`onEnter`, `onExit`) from mode definitions
- Legacy selective Gossamer layer updates still work in fallback mode
- Mode toggle button already uses `ModeManager` (from Phase 3)
- This stage does NOT change how anything is rendered, only how mode switches are coordinated

---

**Ready for User Testing**: Please test all mode switching scenarios and report any issues before we proceed to Stage 3.

