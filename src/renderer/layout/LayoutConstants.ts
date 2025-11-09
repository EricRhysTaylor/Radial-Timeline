/**
 * Radial Timeline Plugin for Obsidian — Layout Constants
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 * 
 * Central configuration for all timeline geometry and layout dimensions.
 * Adjust these values to tune the visual appearance and spacing of timeline elements.
 */

// =============================================================================
// SVG CANVAS
// =============================================================================

/** Total SVG canvas size (1600px = 800px radius) */
export const SVG_SIZE = 1600;

// =============================================================================
// RADII - CORE STRUCTURE
// =============================================================================

/** Where subplot rings start from center */
export const INNER_RADIUS = 200;

/** Where subplot rings end in Main Plot mode (more room since beats hidden) */
export const SUBPLOT_OUTER_RADIUS_MAINPLOT = 778;

/** Where subplot rings end in All Scenes and Gossamer modes */
export const SUBPLOT_OUTER_RADIUS_STANDARD = 766;

/** Where subplot rings end in Chronologue mode (smaller for time details) */
export const SUBPLOT_OUTER_RADIUS_CHRONOLOGUE = 750;

// =============================================================================
// RADII - OUTER LABELS AND TICKS
// =============================================================================

/** Where month labels are positioned on outer edge */
export const MONTH_LABEL_RADIUS = 790;

/** Where chronologue boundary start/end dates are positioned */
export const CHRONOLOGUE_DATE_RADIUS = 792;

/** Outer edge of month tick marks */
export const MONTH_TICK_END = 799;

/** Inner edge of month tick marks */
export const MONTH_TICK_START = 764;

/** Where act labels are positioned (px from center) */
export const ACT_LABEL_RADIUS = 790;

// =============================================================================
// RADII - CHRONOLOGUE ARCS
// =============================================================================

/** Absolute radius for chronologue duration arcs (750 + 8px offset) */
export const CHRONOLOGUE_DURATION_ARC_RADIUS = 758;

/** Absolute radius for elapsed time arc (SHIFT mode) - based on standard outer radius */
export const ELAPSED_ARC_RADIUS = 766;

/** Length of elapsed time arc endpoint markers (px) */
export const ELAPSED_TICK_LENGTH = 14;

// =============================================================================
// INSETS AND OFFSETS
// =============================================================================

/** Fixed pixels inward from scene's outer boundary for title path */
export const SCENE_TITLE_INSET = 22;

/** Pixels inward from subplot outer radius for synopsis text positioning */
export const SYNOPSIS_INSET = 0;

/** Inset from outer scene edge for story beat labels */
export const BEAT_TITLE_INSET = -3;

/** Small start nudge for text paths (radians) */
export const TEXTPATH_START_NUDGE_RAD = 0.02;

// =============================================================================
// DEPRECATED - TO BE REMOVED
// =============================================================================

/** @deprecated Not used anymore - month labels positioned explicitly */
export const MONTH_TEXT_INSET = 13;

/** @deprecated Not used anymore - tick marks positioned explicitly */
export const MONTH_TICK_TERMINAL = 35;

// =============================================================================
// SIZING
// =============================================================================

/** Maximum text width for synopsis text (px) */
export const MAX_TEXT_WIDTH = 500;

/** Width of plot beat slices at a given radius (px, converted to radians via PLOT_PIXEL_WIDTH / middleRadius) */
export const PLOT_PIXEL_WIDTH = 18;

// =============================================================================
// TEXT RENDERING - BEAT LABELS
// =============================================================================
// Note: Font sizes and styling should be defined in styles.css (.rt-storybeat-title)
// These constants are for geometric calculations only

/** Beat label font size in px - must match .rt-storybeat-title in CSS */
export const BEAT_FONT_PX = 9;

/** Approximate character width in em (for beat label width estimation) */
export const CHAR_WIDTH_EM = 0.62;

/** Additional letter spacing in em (for beat label width estimation) */
export const LETTER_SPACING_EM = 0.07;

/** Generous multiplier for initial render estimation */
export const ESTIMATE_FUDGE_RENDER = 1.35;

/** Extra pixels added to estimated beat label width */
export const PADDING_RENDER_PX = 24;

/** Gap used when checking beat label overlaps (px) */
export const ANGULAR_GAP_PX = 16;

