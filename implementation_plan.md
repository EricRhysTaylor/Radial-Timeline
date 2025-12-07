# Implementation Plan - UI Refinements

## Objective
Refine the UI of the Radial Timeline plugin by addressing pixelated images in settings, adjusting the version indicator styling, and adding a stroke to scene titles.

## User Review Required

> [!IMPORTANT]
> **Action Required**: Please verify the changes on both Mac (Retina) and PC/standard displays.

- **Look for**:
    - [ ] `README.md` images in Settings > Radial Timeline should look crisp (not pixelated) on Windows.
    - [ ] Version indicator (bottom-right) text should be centered with the icon.
    - [ ] Version indicator icon (bug/alert) should be 24px and use a 1px stroke.
    - [ ] Scene titles in the timeline view should have a subtle black stroke/shadow for readability.

## Proposed Changes

### Settings Image Rendering
- **File**: `src/styles.css`
- **Change**: Add `image-rendering: auto` and `high-quality` to `.rt-manuscript-readme-container img` to fix pixelation on high-DPI Windows displays.

### Version Indicator Styling
- **File**: `src/styles.css`
    - Increase `.rt-version-text` font size to `20px` (scaled down visually or used as base for pixel font).
    - Set `text-anchor: middle` for centering.
    - Adjust stroke width for icons to `1px`.
- **File**: `src/renderer/components/VersionIndicator.ts`
    - Update icon positioning variables (`iconX`, `iconY`) to center the icon below the text.
    - Update icon scale to `1.0` (24px).
    - Update SVG stroke-width attribute.
    - Expand hit area for better clickability.



## Verification Plan

### Automated Tests
- N/A (Visual changes only)

### Manual Verification
1.  **Settings Images**: Open Obsidian Settings > Radial Timeline. Check the images in the README section. They should not be pixelated.
2.  **Version Indicator**: Look at the bottom right of the timeline view.
    - Text "vX.X.X" or "NEW RELEASE".
    - Icon (Bug or Alert) below it.
    - Text and Icon should be strictly centered horizontally.
    - Icon stroke should be thin (1px).

