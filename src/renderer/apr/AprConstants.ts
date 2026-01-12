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
 * Preset thresholds for Teaser Reveal
 * Each number is the % at which that level unlocks
 * Order: scenes → colors → acts → subplots (full)
 */
export const TEASER_PRESETS: Record<Exclude<TeaserPreset, 'custom'>, TeaserThresholds> = {
    slow: {
        scenes: 15,    // Show scene cells at 15%
        colors: 30,    // Show status colors at 30%
        acts: 55,      // Show act divisions at 55%
        subplots: 80,  // Show subplot rings at 80%
    },
    standard: {
        scenes: 10,    // Show scene cells at 10%
        colors: 25,    // Show status colors at 25%
        acts: 50,      // Show act divisions at 50%
        subplots: 75,  // Show subplot rings at 75%
    },
    fast: {
        scenes: 5,     // Show scene cells at 5%
        colors: 15,    // Show status colors at 15%
        acts: 35,      // Show act divisions at 35%
        subplots: 60,  // Show subplot rings at 60%
    },
};

/**
 * Reveal level labels with icons (matching publication stage icons)
 * Order: bar → scenes → colors → acts → full
 */
export const TEASER_LEVEL_INFO: Record<TeaserRevealLevel, { label: string; icon: string; description: string }> = {
    bar: {
        label: 'Teaser',
        icon: 'circle',        // Minimal: just a ring
        description: 'Progress ring only, no scene details',
    },
    scenes: {
        label: 'Scenes',
        icon: 'sprout',        // Zero stage icon: first sign of life
        description: 'Scene cells visible (void colors)',
    },
    colors: {
        label: 'Colors',
        icon: 'tree-pine',     // Author stage icon: growing
        description: 'Status/stage colors revealed',
    },
    acts: {
        label: 'Structure',
        icon: 'trees',         // House stage icon: forest
        description: 'Act divisions appear',
    },
    subplots: {
        label: 'Full',
        icon: 'shell',         // Press stage icon: complete
        description: 'All subplots visible',
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

/**
 * Calculate which reveal level is active based on current progress
 * Order: bar → scenes → colors → acts → subplots (full)
 */
export function getTeaserRevealLevel(progress: number, thresholds: TeaserThresholds): TeaserRevealLevel {
    if (progress >= thresholds.subplots) return 'subplots';
    if (progress >= thresholds.acts) return 'acts';
    if (progress >= thresholds.colors) return 'colors';
    if (progress >= thresholds.scenes) return 'scenes';
    return 'bar';
}

/**
 * Convert reveal level to reveal options for APR renderer
 * Order: bar → scenes → colors → acts → subplots (full)
 */
export function teaserLevelToRevealOptions(level: TeaserRevealLevel): {
    showScenes: boolean;
    showActs: boolean;
    showSubplots: boolean;
    showStatusColors: boolean;
} {
    switch (level) {
        case 'bar':
            // Just progress ring, no details
            return { showScenes: false, showActs: false, showSubplots: false, showStatusColors: false };
        case 'scenes':
            // Scene cells visible but void colors (no status coloring)
            return { showScenes: true, showActs: false, showSubplots: false, showStatusColors: false };
        case 'colors':
            // Scenes with status/stage colors, single ring, no acts
            return { showScenes: true, showActs: false, showSubplots: false, showStatusColors: true };
        case 'acts':
            // Scenes + colors + act divisions, still single ring
            return { showScenes: true, showActs: true, showSubplots: false, showStatusColors: true };
        case 'subplots':
            // Full view: scenes + colors + acts + subplots
            return { showScenes: true, showActs: true, showSubplots: true, showStatusColors: true };
    }
}

// =============================================================================
// APR PROGRESS CALCULATION (Weighted Stage-Based)
// =============================================================================
// This is intentionally separate from:
// - TimelineMetricsService (estimated completion tick in main timeline)
// - Settings progression preview
// APR uses a simpler weighted approach suitable for fan-facing progress.

/**
 * Stage weights for APR progress calculation.
 * Represents how "complete" a scene is based on its publish stage.
 */
const APR_STAGE_WEIGHTS: Record<string, number> = {
    'zero': 0.25,      // First draft complete
    'author': 0.50,    // Author revision complete
    'house': 0.75,     // Editor/house revision complete  
    'press': 1.00,     // Ready for publication
};

/**
 * Calculate APR progress using weighted publish stage approach.
 * 
 * Each scene contributes based on its Publish Stage:
 * - Zero = 25%, Author = 50%, House = 75%, Press = 100%
 * 
 * This gives fans a more realistic view of multi-stage publishing progress
 * rather than just counting "done" scenes.
 * 
 * @param scenes - Array of timeline items (scenes)
 * @returns Progress percentage (0-100)
 */
export function calculateAprProgress(scenes: Array<{ 
    itemType?: string; 
    publishStage?: string | string[];
    status?: string | string[];
}>): number {
    // Filter to real scenes only (not beats/backdrops)
    const realScenes = scenes.filter(s => s.itemType === 'Scene' || !s.itemType);
    if (realScenes.length === 0) return 0;

    let totalWeight = 0;

    realScenes.forEach(scene => {
        // Get publish stage (handle array or string)
        const rawStage = Array.isArray(scene.publishStage) 
            ? scene.publishStage[0] 
            : scene.publishStage;
        const stage = (rawStage || '').toString().trim().toLowerCase();
        
        // Get weight for this stage (default to 0 for unknown/empty)
        const weight = APR_STAGE_WEIGHTS[stage] ?? 0;
        totalWeight += weight;
    });

    // Calculate percentage (each scene at Press = 100% contribution)
    const maxPossible = realScenes.length; // All at Press = 100%
    return Math.round((totalWeight / maxPossible) * 100);
}
