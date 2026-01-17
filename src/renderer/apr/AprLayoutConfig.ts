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
        // ─────────────────────────────────────────────────────────────────────
        // CANVAS
        // ─────────────────────────────────────────────────────────────────────
        svgSize: 150,
        
        // ─────────────────────────────────────────────────────────────────────
        // RING GEOMETRY (Scene rings)
        // ─────────────────────────────────────────────────────────────────────
        innerRadius: 20,           // Center hole radius
        outerRadius: 64,           // Outer edge of scene ring
        spokeWidth: 0.75,           // Width of radial spokes
        borderWidth: 0.5,           // Width of ring borders
        actSpokeWidth: 1,           // Width of act division spokes
        patternScale: 0.25,         // Pattern density (1.0 = default, smaller = denser)
        
        // ─────────────────────────────────────────────────────────────────────
        // CENTER NUMBER & PERCENT SYMBOL (Inner element)
        // ─────────────────────────────────────────────────────────────────────
        centerNumberFontSize1Digit: 38,  // Font size for single-digit numbers (e.g., "5")
        centerNumberFontSize2Digit: 28,  // Font size for double-digit numbers (e.g., "42")
        centerNumberFontSize3Digit: 24,  // Font size for triple-digit numbers (e.g., "100")
        centerNumberYOffset: 3.2,          // Y offset for the center number (positive = down)
        centerNumberOpacity: 1,  // Center number visibility: 0.0 = invisible, 1.0 = fully opaque
        centerNumberLetterSpacing: '-0.05em', // Letter spacing for multi-digit numbers
        percentSymbolYOffset: 4,   // Y offset for % symbol
        percentSymbolOpacity: 0.20, // % symbol visibility: 0.0 = invisible, 1.0 = fully opaque
        percentSymbolSizeMultiplier: 1.9, // % symbol size: 1.0 = small, 2.5 = large (relative to inner radius)
        
        // ─────────────────────────────────────────────────────────────────────
        // RT BADGE (Bottom-right corner)
        // ─────────────────────────────────────────────────────────────────────
        rtBadgeFontSize: 9,         // Font size for RT badge
        rtBadgeOffsetX: 8,           // Inset from right edge
        rtBadgeOffsetY: 8,           // Inset from bottom edge
        
        // ─────────────────────────────────────────────────────────────────────
        // BRANDING TEXT (Outermost - perimeter text)
        // ─────────────────────────────────────────────────────────────────────
        brandingRadius: 66,         // Radius for book/author text path
        bookAuthorFontSize: 9,      // Font size for book title + author name
        brandingLetterSpacing: '0.2em', // Letter spacing for branding text
    },
    
    // ─────────────────────────────────────────────────────────────────────────
    // MEDIUM (300×300) - Social posts, newsletters
    // ─────────────────────────────────────────────────────────────────────────
    medium: {
        // ─────────────────────────────────────────────────────────────────────
        // CANVAS
        // ─────────────────────────────────────────────────────────────────────
        svgSize: 300,
        
        // ─────────────────────────────────────────────────────────────────────
        // RING GEOMETRY (Scene rings)
        // ─────────────────────────────────────────────────────────────────────
        innerRadius: 50,
        outerRadius: 136,
        spokeWidth: 1,
        borderWidth: 1,
        actSpokeWidth: 1.5,
        patternScale: 0.4,         // Pattern density (1.0 = default, smaller = denser)
        
        // ─────────────────────────────────────────────────────────────────────
        // CENTER NUMBER & PERCENT SYMBOL (Inner element)
        // ─────────────────────────────────────────────────────────────────────
        centerNumberFontSize1Digit: 105,  // Font size for single-digit numbers (e.g., "5")
        centerNumberFontSize2Digit: 80,  // Font size for double-digit numbers (e.g., "42")
        centerNumberFontSize3Digit: 58,  // Font size for triple-digit numbers (e.g., "100")
        centerNumberYOffset: 8,          // Y offset for the center number (positive = down)
        centerNumberOpacity: 0.95,   // Center number visibility: 0.0 = invisible, 1.0 = fully opaque
        centerNumberLetterSpacing: '-0.05em', // Letter spacing for multi-digit numbers
        percentSymbolYOffset: 9.5,    // Y offset for % symbol
        percentSymbolOpacity: 0.20,   // % symbol visibility: 0.0 = invisible, 1.0 = fully opaque
        percentSymbolSizeMultiplier: 2, // % symbol size: 1.0 = small, 2.5 = large (relative to inner radius)
        
        // ─────────────────────────────────────────────────────────────────────
        // RT BADGE (Bottom-right corner)
        // ─────────────────────────────────────────────────────────────────────
        rtBadgeFontSize: 14,         // Font size for RT badge
        rtBadgeOffsetX: 16,          // Inset from right edge
        rtBadgeOffsetY: 16,          // Inset from bottom edge
        
        // ─────────────────────────────────────────────────────────────────────
        // BRANDING TEXT (Outermost - perimeter text)
        // ─────────────────────────────────────────────────────────────────────
        brandingRadius: 140,        // Radius for book/author text path
        bookAuthorFontSize: 14,     // Font size for book title + author name
        brandingLetterSpacing: '0.15em', // Letter spacing for branding text
    },
    
    // ─────────────────────────────────────────────────────────────────────────
    // LARGE (450×450) - Website embeds, high-DPI displays
    // ─────────────────────────────────────────────────────────────────────────
    large: {
        // ─────────────────────────────────────────────────────────────────────
        // CANVAS
        // ─────────────────────────────────────────────────────────────────────
        svgSize: 450,
        
        // ─────────────────────────────────────────────────────────────────────
        // RING GEOMETRY (Scene rings)
        // ─────────────────────────────────────────────────────────────────────
        innerRadius: 80,
        outerRadius: 200,
        spokeWidth: 1.5,
        borderWidth: 1.5,
        actSpokeWidth: 2.5,
        patternScale: 0.55,        // Pattern density (1.0 = default, smaller = denser)
        
        // ─────────────────────────────────────────────────────────────────────
        // CENTER NUMBER & PERCENT SYMBOL (Inner element)
        // ─────────────────────────────────────────────────────────────────────
        centerNumberFontSize1Digit: 150,  // Font size for single-digit numbers (e.g., "5")
        centerNumberFontSize2Digit: 115,  // Font size for double-digit numbers (e.g., "42")
        centerNumberFontSize3Digit: 96,  // Font size for triple-digit numbers (e.g., "100")
        centerNumberYOffset: 11,         // Y offset for the center number (positive = down)
        centerNumberOpacity: 0.95,   // Center number visibility: 0.0 = invisible, 1.0 = fully opaque
        centerNumberLetterSpacing: '-0.05em', // Letter spacing for multi-digit numbers (0 = natural spacing)
        percentSymbolYOffset: 15,   // Y offset for % symbol
        percentSymbolOpacity: 0.20,  // % symbol visibility: 0.0 = invisible, 1.0 = fully opaque
        percentSymbolSizeMultiplier: 2, // % symbol size: 1.0 = small, 2.5 = large (relative to inner radius)
        
        // ─────────────────────────────────────────────────────────────────────
        // RT BADGE (Bottom-right corner)
        // ─────────────────────────────────────────────────────────────────────
        rtBadgeFontSize: 21,         // Font size for RT badge
        rtBadgeOffsetX: 24,          // Inset from right edge
        rtBadgeOffsetY: 24,          // Inset from bottom edge
        
        // ─────────────────────────────────────────────────────────────────────
        // BRANDING TEXT (Outermost - perimeter text)
        // ─────────────────────────────────────────────────────────────────────
        brandingRadius: 206,        // Radius for book/author text path
        bookAuthorFontSize: 21,     // Font size for book title + author name
        brandingLetterSpacing: '0.15em', // Letter spacing for branding text
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
        centerYOffset: p.centerNumberYOffset,
        ghostYOffset: p.percentSymbolYOffset,
        spokeWidth: p.spokeWidth,
        borderWidth: p.borderWidth,
        actSpokeWidth: p.actSpokeWidth,
        brandingLetterSpacing: p.brandingLetterSpacing,
        patternScale: p.patternScale,
        rtCornerOffset: p.rtBadgeOffsetX, // Used for X positioning
        // Center number & percent symbol controls
        centerNumberFontSize1Digit: p.centerNumberFontSize1Digit,
        centerNumberFontSize2Digit: p.centerNumberFontSize2Digit,
        centerNumberFontSize3Digit: p.centerNumberFontSize3Digit,
        percentNumberOpacity: p.centerNumberOpacity,
        percentLetterSpacing: p.centerNumberLetterSpacing,
        percentSymbolOpacity: p.percentSymbolOpacity,
        percentSymbolSizeMultiplier: p.percentSymbolSizeMultiplier,
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
