/**
 * APR Layout Configuration - QUICK TUNING TEMPLATE
 * 
 * Edit values here to fine-tune each size preset.
 * All key positioning and sizing parameters are consolidated in one place.
 * 
 * WORKFLOW:
 * 1. Edit values in this file
 * 2. Run: node esbuild.config.mjs (builds in ~1s)
 * 3. Open APR modal in Obsidian to see changes
 * 4. Repeat until satisfied
 * 
 * SCALING GUIDE:
 * - Small (150px) = 1x base
 * - Medium (300px) = 2x base  
 * - Large (450px) = 3x base
 */

export type AprSize = 'small' | 'medium' | 'large';

// =============================================================================
// MAIN SIZE PRESETS - Edit these values directly
// =============================================================================

export const APR_LAYOUT = {
    // ─────────────────────────────────────────────────────────────────────────
    // SMALL (150×150) - Widgets, sidebars, inline embeds
    // ─────────────────────────────────────────────────────────────────────────
    small: {
        // Canvas
        svgSize: 150,
        
        // Ring geometry
        innerRadius: 20,           // Center hole radius
        outerRadius: 68,           // Outer edge of scene ring
        
        // Branding positions
        brandingRadius: 70,        // Radius for book/author text path
        
        // Font sizes (in px)
        bookAuthorFontSize: 7,     // Book title + author name on perimeter
        rtBadgeFontSize: 7,        // RT badge (match to bookAuthorFontSize for consistency)
        centerPercentFontSize: 20, // The big % number in center
        
        // RT Badge positioning (bottom-right corner)
        rtBadgeOffsetX: 8,         // Inset from right edge
        rtBadgeOffsetY: 8,         // Inset from bottom edge
        
        // Center percent positioning
        percentYOffset: 8,         // Y offset for the number (positive = down)
        percentSymbolYOffset: 11,  // Y offset for ghost % symbol
        
        // Stroke widths
        spokeWidth: 0.75,
        borderWidth: 0.5,
        actSpokeWidth: 1,
        
        // Letter spacing for branding text
        brandingLetterSpacing: '0.12em',
        
        // Pattern scaling (1.0 = default pattern size, smaller = denser)
        patternScale: 0.25,        // Very dense for tiny size
    },
    
    // ─────────────────────────────────────────────────────────────────────────
    // MEDIUM (300×300) - Social posts, newsletters
    // ─────────────────────────────────────────────────────────────────────────
    medium: {
        // Canvas
        svgSize: 300,
        
        // Ring geometry
        innerRadius: 50,
        outerRadius: 136,
        
        // Branding positions
        brandingRadius: 140,
        
        // Font sizes
        bookAuthorFontSize: 14,
        rtBadgeFontSize: 14,       // Match book/author for consistency
        centerPercentFontSize: 48,
        
        // RT Badge positioning
        rtBadgeOffsetX: 16,
        rtBadgeOffsetY: 16,
        
        // Center percent positioning
        percentYOffset: 16,
        percentSymbolYOffset: 22,
        
        // Stroke widths
        spokeWidth: 1,
        borderWidth: 1,
        actSpokeWidth: 1.5,
        
        // Letter spacing
        brandingLetterSpacing: '0.15em',
        
        // Pattern scaling (1.0 = default pattern size, smaller = denser)
        patternScale: 0.4,         // Medium density
    },
    
    // ─────────────────────────────────────────────────────────────────────────
    // LARGE (450×450) - Website embeds, high-DPI displays
    // ─────────────────────────────────────────────────────────────────────────
    large: {
        // Canvas
        svgSize: 450,
        
        // Ring geometry
        innerRadius: 80,
        outerRadius: 204,
        
        // Branding positions
        brandingRadius: 208,
        
        // Font sizes
        bookAuthorFontSize: 21,
        rtBadgeFontSize: 21,       // Match book/author for consistency
        centerPercentFontSize: 72,
        
        // RT Badge positioning
        rtBadgeOffsetX: 24,
        rtBadgeOffsetY: 24,
        
        // Center percent positioning
        percentYOffset: 24,
        percentSymbolYOffset: 33,
        
        // Stroke widths
        spokeWidth: 1.5,
        borderWidth: 1.5,
        actSpokeWidth: 2.5,
        
        // Letter spacing
        brandingLetterSpacing: '0.15em',
        
        // Pattern scaling (1.0 = default pattern size, smaller = denser)
        patternScale: 0.55,        // Slightly denser than default
    },
} as const;

// =============================================================================
// DERIVED ACCESSORS - Don't edit these, they just provide compatibility
// =============================================================================

export function getPreset(size: AprSize) {
    const p = APR_LAYOUT[size];
    return {
        // Original field names for backwards compatibility
        svgSize: p.svgSize,
        innerRadius: p.innerRadius,
        outerRadius: p.outerRadius,
        brandingRadius: p.brandingRadius,
        brandingFontSize: p.bookAuthorFontSize,
        rtBrandingFontSize: p.rtBadgeFontSize,
        centerFontSize: p.centerPercentFontSize,
        rtCornerOffset: p.rtBadgeOffsetX, // Used for X positioning
        centerYOffset: p.percentYOffset,
        ghostYOffset: p.percentSymbolYOffset,
        spokeWidth: p.spokeWidth,
        borderWidth: p.borderWidth,
        actSpokeWidth: p.actSpokeWidth,
        brandingLetterSpacing: p.brandingLetterSpacing,
        patternScale: p.patternScale,
    };
}

// =============================================================================
// COLOR PALETTE - Structural colors for dark/light themes
// =============================================================================

export const APR_COLORS = {
    void: '#e8e8e8',           // Light gray for empty/void cells
    sceneNeutral: '#9ca3af',   // Neutral gray when colors disabled
} as const;

export const APR_TEXT_COLORS = {
    primary: '#e5e5e5',
    secondary: 'rgba(255, 255, 255, 0.6)',
    rtBranding: 'rgba(255, 212, 29, 0.7)', // Social media yellow
} as const;

// =============================================================================
// FONTS - Easy to swap
// =============================================================================

export const APR_FONTS = {
    // Primary branding font (book title, author, RT badge)
    branding: "var(--font-interface, system-ui, sans-serif)",
    
    // Center percent font  
    percent: "var(--font-interface, system-ui, sans-serif)",
    
    // RT badge font (set to same as branding for consistency, or use pixel font)
    rtBadge: "var(--font-interface, system-ui, sans-serif)",
    // Alternative: "'04b03b', monospace" for pixel font
} as const;
