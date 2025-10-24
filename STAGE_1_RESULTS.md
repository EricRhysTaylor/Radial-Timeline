# Stage 1 Testing Results - Baseline Verification

**Date**: [Fill in date]  
**Obsidian Version**: [e.g., v1.4.16]  
**macOS Version**: [e.g., 25.0.0]  
**Plugin Version**: Current development build  

**Goal**: Verify all existing functionality still works with new architecture code in place but not yet active.

---

## Test Environment Setup

- [ ] Plugin compiled successfully (`npx tsc --noEmit`)
- [ ] Plugin loaded in Obsidian without errors
- [ ] Test vault has:
  - [ ] Multiple scenes with `Class: Scene`
  - [ ] Multiple story beats with `Class: Beat` or `Class: Plot`
  - [ ] Scenes in multiple subplots
  - [ ] Scenes with dates spanning several months
  - [ ] At least one Gossamer score

---

## 1.1 All Scenes Mode

### Display
- [ ] Toggle to All Scenes mode (button works)
- [ ] All scenes are visible in outer ring
- [ ] Story beats show in outer ring as slices
- [ ] Subplot rings are visible (correct number of rings)
- [ ] Acts/months grid displays correctly
- [ ] Progress indicators show correctly

### Scene Interactions
- [ ] Hover on scene slice → synopsis tooltip appears
- [ ] Hover on scene slice → tooltip has correct content
- [ ] Click on scene slice → correct file opens
- [ ] Hover out → tooltip disappears

### Story Beat Interactions
- [ ] Hover on beat slice → synopsis tooltip appears
- [ ] Hover on beat slice → tooltip has correct content
- [ ] Click on beat slice → correct file opens
- [ ] Beat slices visually distinct from scene slices

### Other Features
- [ ] Search functionality works (can find scenes)
- [ ] Rotation works (drag to rotate)
- [ ] Mode persists after closing/reopening view

### Issues Found
```
[If none, write "None"]

Example:
- Issue: Tooltip not showing for scenes in subplot 3
- Severity: High
- Steps: 1. Open All Scenes mode, 2. Hover over any scene in third ring
- Expected: Tooltip appears
- Actual: No tooltip
```

---

## 1.2 Main Plot Mode

### Display
- [ ] Toggle to Main Plot mode (button works)
- [ ] Only main plot scenes are visible in outer ring
- [ ] Story beats are REMOVED from timeline (not visible at all)
- [ ] Subplot rings are hidden
- [ ] Single outer ring only
- [ ] Acts/months grid displays correctly
- [ ] Progress indicators show correctly

### Scene Interactions
- [ ] Hover on scene slice → synopsis tooltip appears
- [ ] Hover on scene slice → tooltip has correct content
- [ ] Click on scene slice → correct file opens
- [ ] No beat interactions possible (beats not shown)

### Other Features
- [ ] Search functionality works (finds main plot scenes only)
- [ ] Rotation works (drag to rotate)
- [ ] Mode persists after closing/reopening view

### Issues Found
```
[If none, write "None"]
```

---

## 1.3 Gossamer Mode

### Display
- [ ] Toggle to Gossamer mode (button works)
- [ ] Gossamer overlay appears (arcs/lines between beats)
- [ ] Story beats are visible in outer ring
- [ ] Subplot rings are visible
- [ ] Scenes are muted (lower opacity/different styling)
- [ ] Gossamer colors match scores
- [ ] Acts/months grid displays correctly

### Story Beat Interactions
- [ ] Hover on beat → gossamer score tooltip appears
- [ ] Hover on beat → tooltip shows synopsis
- [ ] Hover on beat → tooltip shows beat-to-beat connections
- [ ] Click on beat → correct file opens
- [ ] Beat highlighting works on hover

### Scene Behavior
- [ ] Scenes are visually muted
- [ ] Scenes do NOT respond to hover (no tooltips)
- [ ] Scenes do NOT respond to click (cannot open)

### Gossamer Features
- [ ] Gossamer arcs render correctly
- [ ] Gossamer line weights reflect connection strength
- [ ] Gossamer Score command works
- [ ] Can generate new gossamer scores via AI

### Exit Gossamer
- [ ] Exit Gossamer command works
- [ ] Returns to previous mode (All Scenes or Main Plot)
- [ ] Overlay is removed
- [ ] Scene interactions restored

### Issues Found
```
[If none, write "None"]
```

---

## 1.4 Mode Transitions

### Mode Switching
- [ ] All Scenes → Main Plot (smooth transition)
- [ ] Main Plot → All Scenes (smooth transition)
- [ ] All Scenes → Gossamer (smooth transition)
- [ ] Gossamer → All Scenes (smooth transition)
- [ ] Main Plot → Gossamer (smooth transition)
- [ ] Gossamer → Main Plot (smooth transition)

### State Persistence
- [ ] Current mode persists after closing timeline view
- [ ] Current mode persists after closing/reopening Obsidian
- [ ] Rotation angle persists across mode changes
- [ ] Search state persists across mode changes (if applicable)

### UI Updates
- [ ] Mode button text/icon updates on toggle
- [ ] Mode button tooltip updates on toggle
- [ ] `data-current-mode` attribute updates on SVG element
- [ ] No visual glitches during transition

### Issues Found
```
[If none, write "None"]
```

---

## Console Check

### During Testing
- [ ] No errors in console during mode switches
- [ ] No errors in console during interactions
- [ ] No memory leak warnings
- [ ] Expected warnings only (if any)

### Expected Warnings (OK to see)
```
Example:
- "[Gossamer] No story beats found" if vault has no beats
```

### Unexpected Errors/Warnings
```
[List any unexpected console output here]
```

---

## Performance Check

### Render Time
- Timeline renders in: [X seconds]
- Mode switch takes: [X seconds]
- Acceptable? [ ] Yes [ ] No

### Responsiveness
- Hover interactions: [ ] Instant [ ] Slight delay [ ] Laggy
- Click interactions: [ ] Instant [ ] Slight delay [ ] Laggy
- Rotation: [ ] Smooth [ ] Acceptable [ ] Choppy

### Notes
```
[Any performance observations]
```

---

## Edge Cases

### No Story Beats
- [ ] Timeline displays correctly with only scenes
- [ ] No errors in console

### No Scenes
- [ ] Timeline displays correctly with only beats
- [ ] No errors in console

### Missing Frontmatter
- [ ] Files without `Class:` are ignored gracefully
- [ ] No errors in console

### Invalid Dates
- [ ] Files with invalid dates are handled gracefully
- [ ] No errors in console

---

## Overall Assessment

### Working Correctly
```
[List what's working well]
```

### Issues Found
```
[Summary of all issues, ranked by severity]

Example:
1. [Critical] Timeline doesn't render in Main Plot mode
2. [High] Gossamer tooltips show wrong content
3. [Medium] Mode button doesn't update text
4. [Low] Minor CSS styling issue
```

### Recommended Next Steps

Select one:
- [ ] ✅ **Proceed to Stage 2** - All tests passed, no critical issues
- [ ] 🔄 **Fix and Retest** - Issues found, need fixes before proceeding
- [ ] ❌ **Rollback and Reassess** - Critical failures, need to revert

### Additional Notes
```
[Any other observations, questions, or concerns]
```

---

## Sign-Off

**Tested by**: [Your name]  
**Date completed**: [Date]  
**Ready for Stage 2**: [ ] Yes [ ] No

---

## For Developer Use

### Issues to Address Before Stage 2
1. [Issue from above]
   - **File**: [Affected file]
   - **Fix**: [Proposed fix]
   - **Status**: [ ] Fixed [ ] In Progress [ ] Blocked


