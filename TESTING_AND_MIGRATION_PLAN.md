# Testing and Staged Migration Plan

**Status**: Phase 1-3 Complete (New Architecture Built)  
**Current State**: Dual system - Old code still runs, new architecture in place but not fully integrated  
**Goal**: Gradually migrate to new system, testing thoroughly at each stage

---

## Current Situation

### ✅ What We've Built (Phases 1-3)
- **New Mode Architecture**: `TimelineMode` enum, `ModeDefinition` interface
- **Mode Definitions**: All three current modes defined (`AllScenesMode.ts`, `MainPlotMode.ts`, `GossamerMode.ts`)
- **Mode Registry**: Central lookup for mode definitions
- **ModeManager**: Centralized mode switching logic
- **ModeInteractionController**: Centralized interaction management
- **Backward Compatibility**: `isStoryBeat()` helper for `Class: Plot` and `Class: Beat`

### 🔄 What's Still Using Old Code
- **Rendering Logic**: `TimelineRenderer.ts` still has mode-specific branching
- **Some Interactions**: Not all event handlers use the new controller yet
- **Legacy Properties**: `outerRingAllScenes` and `interactionMode` still exist
- **Direct Mode Checks**: Many `if (currentMode === 'gossamer')` checks in various files

---

## Testing & Migration Strategy

### Principle: "Keep the old working while testing the new"

We'll use **feature flags** and **parallel systems** to ensure the plugin keeps working while we migrate piece by piece.

---

## Stage 1: Baseline Testing (Current State)

**Goal**: Verify everything still works with the new code in place

### Test Cases

#### 1.1 All Scenes Mode
- [ ] Toggle to All Scenes mode
- [ ] Verify all scenes are visible in outer ring
- [ ] Verify story beats show in outer ring as slices
- [ ] Verify subplot rings are visible
- [ ] Hover on scene → shows synopsis
- [ ] Click on scene → opens file
- [ ] Hover on beat → shows synopsis
- [ ] Click on beat → opens file
- [ ] Search functionality works
- [ ] Rotation works

#### 1.2 Main Plot Mode
- [ ] Toggle to Main Plot mode
- [ ] Verify only main plot scenes are visible
- [ ] Verify story beats are REMOVED from timeline
- [ ] Verify subplot rings are hidden
- [ ] Hover on scene → shows synopsis
- [ ] Click on scene → opens file
- [ ] Search functionality works
- [ ] Rotation works

#### 1.3 Gossamer Mode
- [ ] Toggle to Gossamer mode
- [ ] Verify gossamer overlay appears
- [ ] Verify story beats are visible in outer ring
- [ ] Verify subplot rings are visible
- [ ] Hover on beat → shows gossamer score and synopsis
- [ ] Click on beat → opens file
- [ ] Scenes are muted (lower opacity)
- [ ] Gossamer score command works
- [ ] Exit Gossamer returns to previous mode

#### 1.4 Mode Transitions
- [ ] All Scenes → Main Plot → All Scenes
- [ ] All Scenes → Gossamer → All Scenes
- [ ] Main Plot → Gossamer → Main Plot
- [ ] Mode persists after closing/reopening view
- [ ] Mode button UI updates correctly

### How to Test
1. Open your vault with the plugin enabled
2. Open the Radial Timeline view
3. Work through each test case systematically
4. Document any issues in a `STAGE_1_RESULTS.md` file

---

## Stage 2: Enable ModeManager (Partial Migration)

**Goal**: Use ModeManager for mode switching, but keep old rendering logic

### Changes Required

#### 2.1 Update Mode Toggle to Use ModeManager
- ✅ Already done in `ModeToggleController.ts`
- Currently has fallback to old system

#### 2.2 Update GossamerCommands to Use ModeManager
```typescript
// In enterGossamerMode and exitGossamerMode
// Instead of directly setting view.currentMode
// Use: view.getModeManager()?.switchMode(TimelineMode.GOSSAMER)
```

#### 2.3 Add Mode Change Event
```typescript
// In ModeManager.switchMode
// Trigger a custom event that TimeLineView can listen to
// This will trigger re-render using the old render logic
```

### Test Cases (Same as Stage 1)
- Run all Stage 1 tests again
- Verify mode switching now goes through ModeManager
- Verify old rendering logic still works
- Check console for any errors

---

## Stage 3: Migrate Rendering Logic

**Goal**: Use mode definitions for rendering decisions

### 3.1 Create Feature Flag
```typescript
// In RadialTimelineSettings
useNewRenderingSystem: boolean; // default: false
```

### 3.2 Update TimelineRenderer
```typescript
// Add helper to check mode configuration
private shouldRenderStoryBeats(): boolean {
    if (this.plugin.settings.useNewRenderingSystem) {
        const modeDef = getModeDefinition(this.view.currentMode);
        return modeDef.rendering.beatDisplay !== 'none';
    }
    // Fall back to old logic
    return this.legacyCheckForBeats();
}
```

### 3.3 Gradual Rendering Migration
1. Migrate outer ring rendering
2. Migrate subplot ring visibility
3. Migrate story beat display
4. Migrate inner ring content

### Test Process
1. Enable `useNewRenderingSystem` flag
2. Run all Stage 1 tests
3. If issues found, debug and fix
4. If tests pass, document and proceed

---

## Stage 4: Migrate Interaction Logic

**Goal**: Use ModeInteractionController for all interactions

### 4.1 Update Feature Flag
```typescript
useNewInteractionSystem: boolean; // default: false
```

### 4.2 Update TimeLineView
```typescript
private setupInteractions(): void {
    if (this.plugin.settings.useNewInteractionSystem) {
        // Use ModeInteractionController
        this.interactionController?.setupMode(this.currentMode);
    } else {
        // Use old interaction setup
        this.setupLegacyInteractions();
    }
}
```

### 4.3 Migrate Interactions
1. All Scenes mode interactions
2. Main Plot mode interactions
3. Gossamer mode interactions
4. Search interactions
5. Rotation interactions

### Test Process
1. Enable `useNewInteractionSystem` flag
2. Run all Stage 1 tests
3. Test each interaction type thoroughly
4. Document any issues

---

## Stage 5: Full Integration Test

**Goal**: Run both systems enabled together

### 5.1 Enable All New Systems
```typescript
useNewRenderingSystem: true
useNewInteractionSystem: true
```

### 5.2 Comprehensive Testing
- Run all Stage 1 tests multiple times
- Test rapid mode switching
- Test with different vault configurations
- Test with large timelines (many scenes)
- Test with minimal timelines (few scenes)
- Test edge cases:
  - No story beats
  - Only story beats, no scenes
  - Missing frontmatter
  - Invalid frontmatter

### 5.3 Performance Testing
- Measure render time in old vs new system
- Check for memory leaks
- Profile interaction responsiveness

---

## Stage 6: Deprecation

**Goal**: Remove old code once new system is proven stable

### 6.1 Mark as Deprecated
```typescript
// Add deprecation notices to old methods
/** @deprecated Use ModeManager.switchMode instead */
private legacyModeSwitch(): void { ... }
```

### 6.2 Set New System as Default
```typescript
useNewRenderingSystem: true  // Default
useNewInteractionSystem: true  // Default
```

### 6.3 User Communication
- Add notice in README about the refactor
- Mention in changelog
- Keep old code for 1-2 releases as fallback

---

## Stage 7: Cleanup

**Goal**: Remove all legacy code

### 7.1 Remove Old Code
- [ ] Remove `outerRingAllScenes` property
- [ ] Remove `interactionMode` property
- [ ] Remove mode-specific if/else in TimelineRenderer
- [ ] Remove `useNewRenderingSystem` flag (always true)
- [ ] Remove `useNewInteractionSystem` flag (always true)
- [ ] Remove legacy interaction setup methods
- [ ] Remove deprecated method markers

### 7.2 Code Quality
- [ ] Run linter
- [ ] Run TypeScript type checking
- [ ] Remove unused imports
- [ ] Update documentation

### 7.3 Final Test
- Run all Stage 1 tests one more time
- Verify no old code remains
- Check bundle size (should be smaller or similar)

---

## Stage 8: Add Chronology Mode

**Goal**: Implement the 4th mode using the new system

Now that the new architecture is proven and stable, we can add Chronology mode using the clean, modular approach.

1. Create `modes/definitions/ChronologyMode.ts`
2. Implement chronological sorting logic
3. Implement any custom rendering needed
4. Implement any custom interactions
5. Register the mode
6. Test thoroughly

---

## Testing Checklist Template

Use this for each stage:

```markdown
## Stage [X] Testing Results

**Date**: [Date]
**Tester**: [Name]
**Environment**: [Obsidian version, OS]

### All Scenes Mode
- [ ] Displays correctly
- [ ] Interactions work
- [ ] No console errors

### Main Plot Mode
- [ ] Displays correctly
- [ ] Interactions work
- [ ] No console errors

### Gossamer Mode
- [ ] Displays correctly
- [ ] Interactions work
- [ ] No console errors

### Mode Transitions
- [ ] Smooth transitions
- [ ] State persists
- [ ] UI updates correctly

### Issues Found
1. [Issue description]
   - **Severity**: [Critical/High/Medium/Low]
   - **Steps to reproduce**: [Steps]
   - **Expected**: [Expected behavior]
   - **Actual**: [Actual behavior]

### Performance Notes
- Render time: [X ms]
- Interaction lag: [None/Minimal/Noticeable]
- Memory usage: [X MB]

### Decision
- [ ] ✅ Proceed to next stage
- [ ] 🔄 Fix issues and retest
- [ ] ❌ Rollback and reassess
```

---

## Risk Mitigation

### Backup Strategy
- Commit after each successful stage
- Tag releases: `v[X]-stage[Y]`
- Keep old code until Stage 7

### Rollback Plan
If critical issues found at any stage:
1. Revert to previous commit
2. Add failing test case
3. Fix issue in isolation
4. Rerun stage tests

### User Impact
- No impact until Stage 6 (new system becomes default)
- Users can opt-in to test new system earlier via feature flags
- Always maintain backward compatibility until Stage 7

---

## Next Immediate Action

**Recommended**: Start with **Stage 1 - Baseline Testing**

1. I'll create a `STAGE_1_RESULTS.md` file for you to document findings
2. You manually test all the test cases listed in Stage 1
3. Report back with any issues
4. Once Stage 1 is confirmed working, we proceed to Stage 2

Would you like me to create the Stage 1 results template file for you to fill in as you test?


