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
        brandingRadius: 288,
        rtBrandingRadius: 270,
        centerFontSize: 72,
        brandingFontSize: 22,
        rtBrandingFontSize: 16, // 8px base × 2 (pixel font requires multiples of 8)
        spokeWidth: 2,
        borderWidth: 1.5,
        actSpokeWidth: 3,
    },
    standard: {
        svgSize: 800,
        innerRadius: 160,
        outerRadius: 370,
        brandingRadius: 378,
        rtBrandingRadius: 356,
        centerFontSize: 96,
        brandingFontSize: 28,
        rtBrandingFontSize: 16, // 8px base × 2 (pixel font requires multiples of 8)
        spokeWidth: 2.5,
        borderWidth: 2,
        actSpokeWidth: 4,
    },
    large: {
        svgSize: 1000,
        innerRadius: 200,
        outerRadius: 460,
        brandingRadius: 468,
        rtBrandingRadius: 444,
        centerFontSize: 120,
        brandingFontSize: 34,
        rtBrandingFontSize: 24, // 8px base × 3 (pixel font requires multiples of 8)
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
    default: '#9ca3af',    // gray-400 (lighter neutral to avoid dark fills)
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

// =============================================================================
// MOMENTUM BUILDER (Progressive Reveal) PRESETS
// =============================================================================

import type { MomentumThresholds, MomentumPreset, MomentumRevealLevel } from '../../types/settings';

/**
 * Preset thresholds for Momentum Builder
 * Each number is the % at which that level unlocks
 */
export const MOMENTUM_PRESETS: Record<Exclude<MomentumPreset, 'custom'>, MomentumThresholds> = {
    slow: {
        scenes: 15,    // Show scene cells at 15%
        acts: 30,      // Show act divisions at 30%
        subplots: 60,  // Show subplot rings at 60%
        colors: 85,    // Show status colors at 85%
    },
    standard: {
        scenes: 10,    // Show scene cells at 10%
        acts: 25,      // Show act divisions at 25%
        subplots: 50,  // Show subplot rings at 50%
        colors: 75,    // Show status colors at 75%
    },
    fast: {
        scenes: 5,     // Show scene cells at 5%
        acts: 15,      // Show act divisions at 15%
        subplots: 35,  // Show subplot rings at 35%
        colors: 65,    // Show status colors at 65%
    },
};

/**
 * Reveal level labels with icons (matching publication stage icons)
 */
export const MOMENTUM_LEVEL_INFO: Record<MomentumRevealLevel, { label: string; icon: string; description: string }> = {
    bar: {
        label: 'Teaser',
        icon: 'circle',        // Minimal: just a ring
        description: 'Progress ring only, no scene details',
    },
    scenes: {
        label: 'Scenes',
        icon: 'sprout',        // Zero stage icon: first sign of life
        description: 'Individual scene cells visible',
    },
    acts: {
        label: 'Structure',
        icon: 'tree-pine',     // Author stage icon: growing
        description: 'Act divisions and spokes appear',
    },
    subplots: {
        label: 'Depth',
        icon: 'trees',         // House stage icon: forest
        description: 'Subplot rings expand',
    },
    colors: {
        label: 'Full Detail',
        icon: 'shell',         // Press stage icon: complete
        description: 'Status colors revealed',
    },
};

/**
 * Get thresholds for a given preset
 */
export function getMomentumThresholds(preset: MomentumPreset, customThresholds?: MomentumThresholds): MomentumThresholds {
    if (preset === 'custom' && customThresholds) {
        return customThresholds;
    }
    return MOMENTUM_PRESETS[preset === 'custom' ? 'standard' : preset];
}

/**
 * Calculate which reveal level is active based on current progress
 */
export function getMomentumRevealLevel(progress: number, thresholds: MomentumThresholds): MomentumRevealLevel {
    if (progress >= thresholds.colors) return 'colors';
    if (progress >= thresholds.subplots) return 'subplots';
    if (progress >= thresholds.acts) return 'acts';
    if (progress >= thresholds.scenes) return 'scenes';
    return 'bar';
}

/**
 * Convert reveal level to reveal options for APR renderer
 */
export function momentumLevelToRevealOptions(level: MomentumRevealLevel): {
    showScenes: boolean;
    showActs: boolean;
    showSubplots: boolean;
    showStatusColors: boolean;
} {
    switch (level) {
        case 'bar':
            return { showScenes: false, showActs: false, showSubplots: false, showStatusColors: false };
        case 'scenes':
            return { showScenes: true, showActs: false, showSubplots: false, showStatusColors: false };
        case 'acts':
            return { showScenes: true, showActs: true, showSubplots: false, showStatusColors: false };
        case 'subplots':
            return { showScenes: true, showActs: true, showSubplots: true, showStatusColors: false };
        case 'colors':
            return { showScenes: true, showActs: true, showSubplots: true, showStatusColors: true };
    }
}
