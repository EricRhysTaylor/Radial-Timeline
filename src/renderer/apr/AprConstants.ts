/**
 * APR (Author Progress Report) Layout Constants
 * 
 * Dedicated dimensions for the simplified, shareable APR graphics.
 * These are independent of the main timeline renderer.
 */

// =============================================================================
// CORE RADII (single source of truth + size scaling)
// =============================================================================

export const APR_BASE_RADII = {
    // Base radii tuned for the 300px preset (MD)
    inner: 50,
    outer: 130,
    text: 134,
} as const;

export const APR_SIZE_SCALES = {
    sm150: 0.5,
    md300: 1,
    lg450: 1.5,
} as const;

export const APR_THUMB_RADII = {
    inner: 16,
    outer: 50,
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
// BRANDING TEXT TUNING (Manual Control)
// =============================================================================

export const APR_BRANDING_TUNING = {
    // Base spacing between characters (the starting point)
    baseLetterSpacing: '0.12em',

    // Minimum allowed spacing (prevents excessive squishing)
    minLetterSpacing: '0.05em',

    // Maximum allowed spacing (limits how much we stretch to fill gaps)
    // If exact fit requires more than this, we stop at this max and leave a visible gap at the seam.
    maxLetterSpacing: '0.50em',

    // Safety buffer for text measurement logic
    // Inflate measured width by this factor to account for font rendering discrepancies (SVG vs DOM)
    // 1.05 = 5% safety buffer
    measurementSafetyBuffer: 1.05,
} as const;

// =============================================================================
// COLORS & STYLING
// =============================================================================

/**
 * APR-specific colors (only what we customize, not stage/status colors)
 * Stage/status colors come from plugin settings (publishStageColors)
 */
export const APR_COLORS = {
    void: '#e8e8e8',           // Very light gray for empty/void cells (matches RT --rt-color-empty-selected)
    sceneNeutral: '#9ca3af',   // Neutral gray for scenes when colors are disabled
} as const;

/** Branding text colors */
export const APR_TEXT_COLORS = {
    primary: '#e5e5e5',
    secondary: 'rgba(255, 255, 255, 0.6)',
    rtBranding: 'rgba(255, 212, 29, 0.7)', // Social media yellow
} as const;

// =============================================================================
// FIXED STROKES (no dynamic sizing)
// =============================================================================

export const APR_FIXED_STROKES = {
    border: 1,
    actSpoke: 2,
    spoke: 1,
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

// =============================================================================
// TEASER REVEAL (Progressive Reveal) PRESETS
// =============================================================================

import type { TeaserThresholds, TeaserPreset, TeaserRevealLevel } from '../../types/settings';

/**
 * Preset thresholds for Teaser Reveal (4 stages)
 * Each number is the % at which that level unlocks
 * Order: bar (0%) → scenes → colors → full
 */
export const TEASER_PRESETS: Record<Exclude<TeaserPreset, 'custom'>, TeaserThresholds> = {
    slow: {
        scenes: 15,    // Show scene cells + acts at 15%
        colors: 40,    // Show full publish stage colors at 40%
        full: 70,      // Show subplot rings at 70%
    },
    standard: {
        scenes: 10,    // Show scene cells + acts at 10%
        colors: 30,    // Show full publish stage colors at 30%
        full: 60,      // Show subplot rings at 60%
    },
    fast: {
        scenes: 5,     // Show scene cells + acts at 5%
        colors: 20,    // Show full publish stage colors at 20%
        full: 45,      // Show subplot rings at 45%
    },
};

/**
 * Reveal level labels with icons (4 stages)
 * Order: bar → scenes → colors → full
 * 
 * STANDARDIZED LABELS (used everywhere in APR UI):
 * - Ring: Progress ring only
 * - Scenes: Scene structure visible
 * - Color: Publish stage colors visible
 * - Complete: All subplot rings visible
 */
export const TEASER_LEVEL_INFO: Record<TeaserRevealLevel, { label: string; icon: string; description: string }> = {
    bar: {
        label: 'Ring',
        icon: 'circle',        // Minimal: just a ring
        description: 'Progress ring only — maximum mystery',
    },
    scenes: {
        label: 'Scenes',
        icon: 'sprout',        // First sign of life
        description: 'Scene structure in grayscale with patterns',
    },
    colors: {
        label: 'Color',
        icon: 'tree-pine',     // Growing
        description: 'Publish stage colors revealed',
    },
    full: {
        label: 'Complete',
        icon: 'shell',         // Complete
        description: 'All subplot rings visible — complete picture',
    },
};

/**
 * Get thresholds for a given preset
 */
export function getTeaserThresholds(preset: TeaserPreset, customThresholds?: TeaserThresholds): TeaserThresholds {
    if (preset === 'custom' && customThresholds) {
        return customThresholds;
    }
    return TEASER_PRESETS[preset === 'custom' ? 'standard' : preset];
}

import type { TeaserDisabledStages } from '../../types/settings';

/**
 * Calculate which reveal level is active based on current progress
 * Respects disabled stages - skips them in the progression
 * Order: bar → scenes → colors → full
 */
export function getTeaserRevealLevel(
    progress: number,
    thresholds: TeaserThresholds,
    disabledStages?: TeaserDisabledStages
): TeaserRevealLevel {
    // Full is always the end state
    if (progress >= thresholds.full) return 'full';

    // Colors stage (if not disabled)
    if (progress >= thresholds.colors) {
        return disabledStages?.colors ? 'scenes' : 'colors';
    }

    // Scenes stage (if not disabled)
    if (progress >= thresholds.scenes) {
        return disabledStages?.scenes ? 'bar' : 'scenes';
    }

    return 'bar';
}

/**
 * Convert reveal level to reveal options for APR renderer
 * 
 * 4-stage progression:
 * - bar:    Progress ring only, no scenes
 * - scenes: Scene cells + acts, grayscale patterns, completed = gray
 * - colors: Full publish stage colors for all scenes
 * - full:   All subplot rings visible
 */
export function teaserLevelToRevealOptions(level: TeaserRevealLevel): {
    showScenes: boolean;
    showActs: boolean;
    showSubplots: boolean;
    showStatusColors: boolean;       // Show status colors (Todo, In Progress, etc.)
    showStageColors: boolean;        // Show publish stage colors (Zero, Author, House, Press)
    grayCompletedScenes: boolean;    // Gray out completed scenes (for SCENES stage)
    grayscaleScenes: boolean;        // Force grayscale rendering for scene colors
} {
    switch (level) {
        case 'bar':
            // Just progress ring, no details
            return {
                showScenes: false,
                showActs: false,
                showSubplots: false,
                showStatusColors: false,
                showStageColors: false,
                grayCompletedScenes: false,
                grayscaleScenes: false
            };
        case 'scenes':
            // Scene cells + acts, grayscale patterns, completed = gray
            return {
                showScenes: true,
                showActs: true,  // Acts bundled with scenes
                showSubplots: false,
                showStatusColors: true,   // Show Todo, In Progress, Overdue
                showStageColors: false,   // Don't show Zero/Author/House/Press
                grayCompletedScenes: true, // Gray out completed scenes
                grayscaleScenes: true
            };
        case 'colors':
            // Full colors including publish stage colors
            return {
                showScenes: true,
                showActs: true,
                showSubplots: false,
                showStatusColors: true,
                showStageColors: true,    // Now show all stage colors
                grayCompletedScenes: false,
                grayscaleScenes: false
            };
        case 'full':
            // Complete view with all subplot rings
            return {
                showScenes: true,
                showActs: true,
                showSubplots: true,
                showStatusColors: true,
                showStageColors: true,
                grayCompletedScenes: false,
                grayscaleScenes: false
            };
    }
}
