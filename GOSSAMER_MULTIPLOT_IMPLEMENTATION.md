# Gossamer Multi-Plot Implementation - Complete! ✅

## What Was Implemented

### Multiple Historical Runs (Gossamer1-5)
The system now supports up to 5 gossamer runs simultaneously:
- **Gossamer1**: Current run (full publish stage color)
- **Gossamer2**: Previous run (#b0b0b0 - medium gray)
- **Gossamer3**: Older run (#c0c0c0 - lighter gray)  
- **Gossamer4**: Older still (#d0d0d0 - very light gray)
- **Gossamer5**: Oldest (#e0e0e0 - extremely light gray)

Each historical run "fades into the past" with progressively lighter gray shades.

### Shaded Band (Min/Max Range)
- Shows the envelope between minimum and maximum scores across all runs
- Rendered **behind everything** (no hover interference)
- Very light gray (#f5f5f5) so it's subtle but visible
- Only displayed when 2+ runs exist and have overlapping beats

### Proper Z-Ordering
SVG elements are rendered in this order (back to front):
1. **Band** (behind everything)
2. **Historical runs** (oldest to newest, so newest historical is on top)
3. **Current line** (Gossamer1, on top of historical)
4. **Spokes**
5. **Beat outlines**
6. **Dots** (on top, never obscured)

### Missing Value Handling
- **Current run (Gossamer1)**: Missing scores default to 0, shown as red dots
- **Historical runs (Gossamer2-5)**: Missing scores are skipped (line breaks, no dot)

## How to Use

### 1. Add Historical Scores
In your Plot note frontmatter, add additional Gossamer fields:

```yaml
---
Class: Plot
Plot System: Save The Cat
Gossamer1: 84  # Current score
Gossamer2: 72  # Previous iteration
Gossamer3: 65  # Older iteration
Gossamer4: 58  # Even older
Gossamer5: 50  # Oldest
---
```

### 2. Toggle Gossamer Mode
- Press your Gossamer toggle hotkey
- The system will automatically:
  - Load Gossamer1 as the current run
  - Load Gossamer2-5 as historical runs (if they exist)
  - Calculate and display the min/max band
  - Log to console what it found

### 3. Check Console Output
Open the developer console (Cmd+Option+I or F12) and look for:
```
[Gossamer Build] Processing 15 plot notes with Plot System: Save The Cat
[Gossamer Beat Order] Found 15 plot beats
[Gossamer Multi] Loaded Gossamer2 with 15 beats
[Gossamer Multi] Loaded Gossamer3 with 12 beats
[Gossamer Multi] Min/max band calculated with 15 beats
[Gossamer Multi] Loaded 3 runs: Current + 2 historical
```

## Visual Design

### Colors
- **Current (Gossamer1)**: Uses full **Publish Stage colors**
  - Zero: #ff4444 (red)
  - Author: #ffa500 (orange)  
  - House: #ffd700 (gold)
  - Press: #90ee90 (green)

- **Historical (Gossamer2-5)**: Grayscale gradient
  - Gossamer2: #b0b0b0 (medium gray)
  - Gossamer3: #c0c0c0 (lighter)
  - Gossamer4: #d0d0d0 (very light)
  - Gossamer5: #e0e0e0 (extremely light)

- **Band**: #f5f5f5 (very light gray, subtle background)

### Line Styles
- All lines use the same **Bezier smoothing**
- All lines have the same **stroke width** (2px)
- No dashed lines or opacity changes - only color differentiation

## Technical Details

### New Functions
- `buildRunFromGossamerField()` - Generic builder for any Gossamer field
- `buildAllGossamerRuns()` - Orchestrates building all runs + min/max calculation
- Updated `renderGossamerLayer()` - Accepts colored overlays and renders in proper order

### Data Flow
1. **Toggle Gossamer Mode** → `GossamerCommands.ts`
2. **Build All Runs** → `buildAllGossamerRuns()` in `gossamer.ts`
3. **Store on Plugin** → `_gossamerLastRun`, `_gossamerHistoricalRuns`, `_gossamerMinMax`
4. **Render Timeline** → `TimelineRenderer.ts` passes data to `gossamerLayer.ts`
5. **Draw SVG** → Proper z-order, colors, and band

### Storage
- Current run: `plugin._gossamerLastRun`
- Historical runs: `plugin._gossamerHistoricalRuns[]`
- Min/max band: `plugin._gossamerMinMax`

## Testing Checklist

- [ ] Add Gossamer2-5 values to a few plot notes
- [ ] Toggle Gossamer mode
- [ ] Verify console shows multiple runs loaded
- [ ] Check that historical runs appear as lighter gray lines
- [ ] Check that band appears behind everything (light gray)
- [ ] Hover over dots - verify no interference from band
- [ ] Check that newer historical runs are darker than older ones
- [ ] Verify current run (Gossamer1) is in full color
- [ ] Add Gossamer values to only some plot notes in historical runs
- [ ] Verify those runs have line breaks where data is missing

## Future Enhancements (Optional)

1. **Date-based labels**: Use actual dates instead of "Gossamer2", "Gossamer3"
2. **Toggle historical runs**: Setting to show/hide individual historical runs
3. **Configurable colors**: Let users choose historical run colors
4. **More runs**: Support Gossamer6-10 if needed
5. **Historical dots**: Option to show smaller dots on historical runs
6. **Band color options**: Use lighter publish stage colors instead of gray

## Files Modified

- `src/utils/gossamer.ts` - Added multi-run builder and min/max calculation
- `src/renderer/gossamerLayer.ts` - Updated to render colored overlays with proper z-order
- `src/GossamerCommands.ts` - Call new builder and store all runs
- `src/renderer/TimelineRenderer.ts` - Pass historical runs and band to renderer
- `src/main.ts` - Removed debug logging
- `src/styles.css` - Updated overlay and band styles

---

**Status**: ✅ Complete and ready to test!

The system now supports multiple historical gossamer runs with proper visual hierarchy, z-ordering, and a subtle min/max band. All runs are automatically loaded when you toggle Gossamer mode.

