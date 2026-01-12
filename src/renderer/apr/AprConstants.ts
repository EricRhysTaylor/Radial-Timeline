/**
 * APR (Author Progress Report) Layout Constants
 * 
 * Dedicated dimensions for the simplified, shareable APR graphics.
 * These are independent of the main timeline renderer.
 */

// =============================================================================
// SIZE PRESETS
// =============================================================================

export type AprSize = 'small' | 'medium' | 'large';

export const APR_SIZE_PRESETS = {
    // 150×150 - Like Brandon Sanderson's progress tracker
    // All dimensions at 1x base scale
    small: {
        svgSize: 150,
        innerRadius: 30,
        outerRadius: 68,
        brandingRadius: 72,
        rtBrandingRadius: 66,
        centerFontSize: 24,
        brandingFontSize: 7,
        rtBrandingFontSize: 8,  // Minimum for pixel font
        rtCornerOffset: 8,      // Offset from corner for RT badge
        centerYOffset: 8,       // Y offset for center percent number
        ghostYOffset: 11,       // Y offset for ghost % symbol
        spokeWidth: 0.75,
        borderWidth: 0.5,
        actSpokeWidth: 1,
    },
    // 300×300 - Standard social media / newsletter size
    // All dimensions at 2x base scale
    medium: {
        svgSize: 300,
        innerRadius: 60,
        outerRadius: 136,
        brandingRadius: 144,
        rtBrandingRadius: 132,
        centerFontSize: 48,
        brandingFontSize: 14,
        rtBrandingFontSize: 8,  // Keep at 8px for crisp pixel font
        rtCornerOffset: 16,     // 2x base
        centerYOffset: 16,      // 2x base
        ghostYOffset: 22,       // 2x base
        spokeWidth: 1,
        borderWidth: 1,
        actSpokeWidth: 1.5,
    },
    // 450×450 - Larger embed for websites
    // All dimensions at 3x base scale
    large: {
        svgSize: 450,
        innerRadius: 90,
        outerRadius: 204,
        brandingRadius: 216,
        rtBrandingRadius: 198,
        centerFontSize: 72,
        brandingFontSize: 21,
        rtBrandingFontSize: 16, // 2x base (8×2) for crisp pixel font at larger size
        rtCornerOffset: 24,     // 3x base
        centerYOffset: 24,      // 3x base
        ghostYOffset: 33,       // 3x base
        spokeWidth: 1.5,
        borderWidth: 1.5,
        actSpokeWidth: 2.5,
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
 */
export const TEASER_LEVEL_INFO: Record<TeaserRevealLevel, { label: string; icon: string; description: string }> = {
    bar: {
        label: 'Teaser',
        icon: 'circle',        // Minimal: just a ring
        description: 'Progress ring only — maximum mystery',
    },
    scenes: {
        label: 'Scenes',
        icon: 'sprout',        // First sign of life
        description: 'Active work visible, completed = gray, act structure shown',
    },
    colors: {
        label: 'Colors',
        icon: 'tree-pine',     // Growing
        description: 'Full publish stage colors revealed',
    },
    full: {
        label: 'Full',
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
 * - scenes: Scene cells + acts, status colors for active work, completed = gray
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
                grayCompletedScenes: false
            };
        case 'scenes':
            // Scene cells + acts, status colors for active work, completed = gray
            return { 
                showScenes: true, 
                showActs: true,  // Acts bundled with scenes
                showSubplots: false, 
                showStatusColors: true,   // Show Todo, In Progress, Overdue
                showStageColors: false,   // Don't show Zero/Author/House/Press
                grayCompletedScenes: true // Gray out completed scenes
            };
        case 'colors':
            // Full colors including publish stage colors
            return { 
                showScenes: true, 
                showActs: true, 
                showSubplots: false, 
                showStatusColors: true,
                showStageColors: true,    // Now show all stage colors
                grayCompletedScenes: false
            };
        case 'full':
            // Complete view with all subplot rings
            return { 
                showScenes: true, 
                showActs: true, 
                showSubplots: true, 
                showStatusColors: true,
                showStageColors: true,
                grayCompletedScenes: false
            };
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
