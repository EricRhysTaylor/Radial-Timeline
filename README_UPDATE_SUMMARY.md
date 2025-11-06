# README Update Summary - Version 3.1.1

## Changes Made to README.md

### 1. ✅ Updated "What It Does" Section (Lines 37-41)
**Changed from:** Generic mention of "four types of timelines"
**Changed to:** Explicit description of the four critical timeline types:
- **Chronological time** (when events happen in your story's world)
- **Narrative time** (the sequence you reveal events to readers)  
- **Author time** (your real-world writing progress toward completion)
- **Publishing time** (manuscript revision stages from Zero draft through Press-ready)

### 2. ✅ Integrated Keyboard Shortcuts Throughout
**Instead of:** Separate keyboard shortcuts section
**Implemented:** Keyboard shortcuts integrated into each relevant section:
- Core Workflows sections now show keys in bold (key **1**, **2**, **3**, **4**)
- Each mode description includes keyboard number in heading
- Natural integration: "keyboard **3**" instead of "key 3"

### 3. ✅ Enhanced Chronologue Mode Description (Lines 169-180)
**Major additions:**
- **Shift Mode terminology**: "X-ray/wireframe/skeleton view revealing the chronological backbone"
- **Discontinuity detection**: "Discontinuities marked with ∞ symbol" with explanation
- Detailed shift mode workflow (click button → select scenes → see elapsed time)
- Color-coded arc description (Zero purple → Press green)
- Added tip about using shift mode to analyze temporal structure
- Linked to Advanced settings for duration arc cap configuration

**Key feature highlight:** Automatic detection and display of large time jumps between scenes in shift mode

### 4. ✅ Updated View Modes Section (Lines 163-191)
Enhanced each mode description to connect to timeline types:

**All Scenes Mode (keyboard 1):**
- Links to **Narrative time** (reading order) and **Author time** (completion progress)

**Main Plot Mode (keyboard 2):**
- Emphasizes **Publishing time** (revision stages)
- Zero → Author → House → Press tracking

**Chronologue Mode (keyboard 3):**
- Focuses on **Chronological time** (event sequences in story-world)
- Comprehensive shift mode documentation
- Discontinuity detection with infinity symbols

**Gossamer Mode (keyboard 4):**
- Retained existing description
- No timeline type (focuses on narrative momentum)

### 5. ✅ Corrected Advanced Settings Section (Lines 217-222)
**Updated to match actual code implementation:**

1. **Chronologue duration arc cap** (FIRST - matches code order)
   - Detailed explanation of proportional scaling
   - Auto-selection based on longest scene

2. **Auto-expand clipped scene titles** (SECOND)
   - Clarified workflow benefit

3. **Show estimated completion date** (THIRD)
   - Simplified description

4. **Metadata refresh debounce** (SECOND TO LAST)
   - Added millisecond notation
   - Included default value (10000ms)

5. **Scene ordering based on When date** (LAST - GRAYED OUT)
   - Marked as "*Coming soon*"
   - Noted as in development
   - Removed incorrect functionality description (this feature is disabled in current version)

### 6. ✅ Removed Release Notes Section
**Action:** Did NOT add release notes to README as requested
**Reasoning:** Release notes functionality exists in-app only, not appropriate for README

---

## What's New in Version 3.1.x (From Git History)

### Major Features Added Since 3.0.0 (October 14, 2025):

1. **Multi-Mode System Refactor**
   - Keyboard shortcuts: 1, 2, 3, 4 for instant mode switching
   - Page-style mode toggle controls with visual icons
   - Complete architectural refactoring to modular mode system

2. **Chronologue Shift Mode Enhancements**
   - **Shift button** with keyboard Shift activation
   - **X-ray/wireframe/skeleton view** revealing chronological backbone
   - **Discontinuity markers** (∞ symbol) for large time gaps
   - Color-coded elapsed time arcs (Zero purple → Press green)
   - Automatic tick overlap hiding

3. **Release Notes System** (In-App Only)
   - Release notes modal
   - "What's New" section in settings
   - Version tracking and "Mark as Read" functionality

4. **Performance Optimizations**
   - Mode-specific YAML filtering
   - Single-view refresh system
   - 10-second default debounce for metadata
   - Reduced regex usage
   - Performance logging

5. **Advanced Settings Reorganization**
   - Chronologue duration arc cap moved to first position
   - Scene ordering by When date disabled (coming soon)
   - Clearer descriptions and workflow explanations

6. **Terminology Standardization**
   - "Plot" → "Beats" for Save the Cat story beats
   - "Beats Analysis" → "Scene Analysis" 
   - `Class: Beat` and `Beat Model: Save The Cat` standardization

7. **Visual/UI Improvements**
   - Chronologue start/end ticks color-aligned to date labels
   - Three radius constants for different arc types
   - Improved Page & Shift icon scaling
   - Synopsis formatting with perfect date/time/duration display
   - Dynamic baseline font size adjustments

8. **Bug Fixes**
   - Fixed Gossamer exit to Main Plot mode
   - Fixed keyboard shortcut binding (1,2,3,4)
   - Fixed scene title auto-expand behavior
   - Fixed AI beats analysis boundary conditions
   - Fixed Story Beats display based on Settings

---

## GitHub Release Notes Recommendations

### For version 3.1.1 release on GitHub:

```markdown
## Radial Timeline 3.1.1

### Highlights

Experience your story's temporal structure like never before with **Chronologue Mode's X-ray view**. Press Shift to reveal the chronological backbone of your narrative—complete with discontinuity detection showing time gaps between scenes with ∞ symbols.

### What's New

**🔍 Chronologue Shift Mode (X-ray View)**
- Press **Shift** or click the shift button to reveal chronological structure
- Automatic discontinuity detection: Large time jumps marked with ∞ symbol
- Color-coded elapsed time arcs between scenes (Zero purple → Press green)
- Smart tick overlap hiding for clean visualization

**⌨️ Keyboard Shortcuts**
- **1** - All Scenes Mode (Narrative + Author time)
- **2** - Main Plot Mode (Publishing time)  
- **3** - Chronologue Mode (Chronological time)
- **4** - Gossamer Mode (momentum analysis)
- **Shift** - Toggle x-ray view in Chronologue mode

**🎯 Four Timeline Types Visualized**
Radial Timeline now explicitly captures and displays all four critical timeline types simultaneously:
- **Chronological time**: When events happen in your story's world
- **Narrative time**: The sequence you reveal events to readers
- **Author time**: Your real-world writing progress toward completion  
- **Publishing time**: Manuscript revision stages (Zero → Press)

**⚡ Performance Optimizations**
- Mode-specific YAML filtering for faster rendering
- Single-view refresh system
- 10-second metadata debounce (default)
- Reduced regex usage for better performance

**🔧 Advanced Settings Reorganization**
- Chronologue duration arc cap now first (auto-selects based on longest scene)
- Show estimated completion date toggle
- Scene ordering by When date (coming soon - currently disabled)

**📚 Release Notes System**
- In-app "What's New" section in settings
- Full release notes modal with markdown rendering
- Track which releases you've reviewed

### Bug Fixes
- Fixed Gossamer mode exit to Main Plot
- Fixed keyboard shortcuts binding (1,2,3,4)
- Fixed scene title auto-expand behavior
- Fixed AI scene analysis boundary conditions
- Fixed Story Beats display based on Settings selection

### Documentation
- README updated with four timeline types explanation
- Shift mode documentation (x-ray/wireframe/skeleton view)
- Integrated keyboard shortcuts throughout docs
- Advanced settings descriptions now match code implementation

---

**Full Changelog**: [v3.1.0...v3.1.1](https://github.com/EricRhysTaylor/radial-timeline/compare/v3.1.0...v3.1.1)
```

---

## Next Steps

1. ✅ **README.md updated** with all requested changes
2. ⏭️ **Update release/github-release.json** with content above
3. ⏭️ **Create GitHub release** for v3.1.1 with these notes
4. ⏭️ **Verify manifest.json** version is 3.1.1
5. ⏭️ **Test in Obsidian** to ensure all features work as documented

---

## Files Modified

- `/Users/ericrhystaylor/Documents/Code Projects/radial-timeline/README.md`
  - Lines 37-41: What It Does section
  - Lines 137-138: Tracking Progress mode shortcuts
  - Lines 145-147: Gossamer mode shortcuts
  - Lines 156-157: Finding & Navigating mode shortcuts
  - Lines 163-191: View modes via primary navigation (major expansion)
  - Lines 217-222: Advanced settings (corrected order and descriptions)

---

## Verification Checklist

- [x] Four timeline types clearly explained in "What It Does"
- [x] Keyboard shortcuts integrated (not separate section)
- [x] Shift mode described as "x-ray/wireframe/skeleton view"
- [x] Discontinuity markers (∞) documented
- [x] Advanced settings match actual code implementation
- [x] No release notes section in README
- [x] All mode descriptions link to appropriate timeline type
- [x] Chronologue duration arc cap explained
- [x] "Scene ordering by When date" marked as coming soon








