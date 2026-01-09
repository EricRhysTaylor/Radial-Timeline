/**
 * APR (Author Progress Report) Layout Constants
 * 
 * Dedicated dimensions for the simplified, shareable APR graphics.
 * These are independent of the main timeline renderer.
 */

// =============================================================================
// SIZE PRESETS
// =============================================================================

export type AprSize = 'compact' | 'standard' | 'large';

export const APR_SIZE_PRESETS = {
    compact: {
        svgSize: 600,
        innerRadius: 120,
        outerRadius: 280,
        brandingRadius: 290,
        rtBrandingRadius: 265,
        centerFontSize: 72,
        brandingFontSize: 14,
        rtBrandingFontSize: 10,
        spokeWidth: 2,
        borderWidth: 1.5,
        actSpokeWidth: 3,
    },
    standard: {
        svgSize: 800,
        innerRadius: 160,
        outerRadius: 370,
        brandingRadius: 385,
        rtBrandingRadius: 350,
        centerFontSize: 96,
        brandingFontSize: 18,
        rtBrandingFontSize: 12,
        spokeWidth: 2.5,
        borderWidth: 2,
        actSpokeWidth: 4,
    },
    large: {
        svgSize: 1000,
        innerRadius: 200,
        outerRadius: 460,
        brandingRadius: 480,
        rtBrandingRadius: 435,
        centerFontSize: 120,
        brandingFontSize: 22,
        rtBrandingFontSize: 14,
        spokeWidth: 3,
        borderWidth: 2.5,
        actSpokeWidth: 5,
    },
} as const;

// =============================================================================
// APR VIEW MODES
// =============================================================================

export type AprViewMode = 'full' | 'scenes' | 'momentum';

export const APR_VIEW_MODE_LABELS: Record<AprViewMode, string> = {
    full: 'Full Structure',
    scenes: 'Scenes Only',
    momentum: 'Momentum Only',
};

// =============================================================================
// COLORS & STYLING
// =============================================================================

/** Stage/status colors for APR (same as main timeline) */
export const APR_STAGE_COLORS = {
    draft: '#6b7280',      // gray-500
    revised: '#3b82f6',    // blue-500
    edited: '#8b5cf6',     // violet-500
    proofed: '#f59e0b',    // amber-500
    published: '#22c55e',  // green-500
    default: '#4b5563',    // gray-600
} as const;

/** Fallback status colors when no stage defined */
export const APR_STATUS_COLORS = {
    complete: '#22c55e',   // green
    active: '#3b82f6',     // blue
    pending: '#6b7280',    // gray
} as const;

/** Scene border/spoke colors */
export const APR_STRUCTURAL_COLORS = {
    spoke: 'rgba(255, 255, 255, 0.4)',
    actSpoke: 'rgba(255, 255, 255, 0.7)',
    border: 'rgba(255, 255, 255, 0.25)',
    centerHole: '#0a0a0a',
    background: 'transparent',
} as const;

/** Branding text colors */
export const APR_TEXT_COLORS = {
    primary: '#e5e5e5',
    secondary: 'rgba(255, 255, 255, 0.6)',
    rtBranding: 'rgba(255, 212, 29, 0.7)', // Social media yellow
} as const;

// =============================================================================
// MOMENTUM BAR CONSTANTS (for "Momentum Only" mode)
// =============================================================================

export const APR_MOMENTUM_BAR = {
    width: 0.7,           // 70% of SVG width
    height: 24,           // Bar height in px
    borderRadius: 12,     // Rounded ends
    yOffset: 60,          // Distance below center
    trackColor: 'rgba(255, 255, 255, 0.1)',
    fillColor: '#22c55e', // Green progress
} as const;

// =============================================================================
// GEOMETRY HELPERS
// =============================================================================

/** Gap between scenes (radians) */
export const APR_SCENE_GAP_RAD = 0.008;

/** Minimum arc angle for very small scenes (radians) */
export const APR_MIN_SCENE_ARC_RAD = 0.02;
