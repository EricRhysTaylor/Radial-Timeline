/**
 * APR Branding - Perimeter text rendering for Author Progress Reports
 * 
 * Renders the repeating book title around the outer edge with one instance
 * of Radial Timeline branding replacing one iteration near the bottom.
 */

import { getPreset, APR_TEXT_COLORS, APR_FONTS, AprSize } from './AprLayoutConfig';

export interface AprBrandingOptions {
    bookTitle: string;
    authorName?: string;
    authorUrl?: string;
    size: AprSize;
    bookAuthorColor?: string;
    authorColor?: string;
    engineColor?: string;
}

/**
 * Generate the perimeter branding SVG elements
 * Creates a continuous text ring of book/author, plus a minimal RT badge at bottom-right
 * 
 * Uses SVG textLength to force text to fill exactly 360° with no gap or overlap.
 */
export function renderAprBranding(options: AprBrandingOptions): string {
    const { bookTitle, authorName, authorUrl, size, bookAuthorColor, authorColor, engineColor } = options;
    const preset = getPreset(size);
    const { brandingRadius, brandingFontSize, rtBrandingFontSize } = preset;
    
    const rtUrl = 'https://radialtimeline.com';
    // Fallback to Press stage green if no color provided (matches RT default)
    const bookColor = bookAuthorColor || '#6FB971';
    const authColor = authorColor || bookColor; // Default to book color if not specified
    const engColor = engineColor || APR_TEXT_COLORS.primary;
    
    // Build the repeating title segment
    const separator = ' ~ ';
    const bookTitleUpper = bookTitle.toUpperCase();
    const authorNameUpper = authorName?.toUpperCase() || '';
    const bullet = ' • ';
    
    // Calculate exact circumference
    const circumference = 2 * Math.PI * brandingRadius;
    
    // Estimate segment width for repetition calculation
    const baseCharWidth = brandingFontSize * 0.55;
    const singleSegment = authorName 
        ? `${bookTitleUpper}${bullet}${authorNameUpper}${separator}`
        : `${bookTitleUpper}${separator}`;
    const segmentBaseWidth = singleSegment.length * baseCharWidth;
    const idealReps = Math.round(circumference / segmentBaseWidth);
    const repetitions = Math.max(4, Math.min(10, idealReps));
    
    // Full circle path starting from top (12 o'clock) going clockwise
    const circlePathId = 'apr-branding-circle';
    const circlePath = `M 0 -${brandingRadius} A ${brandingRadius} ${brandingRadius} 0 1 1 0 ${brandingRadius} A ${brandingRadius} ${brandingRadius} 0 1 1 0 -${brandingRadius}`;
    
    const brandingDefs = `
        <defs>
            <path id="${circlePathId}" d="${circlePath}" />
        </defs>
    `;
    
    // Build text content with tspan elements for separate colors
    // textLength applies spacing to the entire text content including all tspan children
    const hasAuthor = authorName && authorName.trim().length > 0;
    let textContent = '';
    for (let i = 0; i < repetitions; i++) {
        textContent += `<tspan fill="${bookColor}">${bookTitleUpper}</tspan>`;
        if (hasAuthor) {
            textContent += `<tspan fill="${authColor}">${bullet}${authorNameUpper}</tspan>`;
        }
        textContent += `<tspan fill="${bookColor}">${separator}</tspan>`;
    }
    
    const brandingText = `
        <text 
            font-family="${APR_FONTS.branding}" 
            font-size="${brandingFontSize}" 
            font-weight="700" 
            textLength="${circumference.toFixed(2)}"
            lengthAdjust="spacing">
            <textPath href="#${circlePathId}" startOffset="0%">
                ${textContent}
            </textPath>
        </text>
    `;
    
    // Minimal RT badge at bottom-right corner (outside the ring)
    // Position uses preset-specific offset for proper scaling at each size
    const half = preset.svgSize / 2;
    const rtX = half - preset.rtCornerOffset;
    const rtY = half - preset.rtCornerOffset;
    // Use rtBrandingFontSize which is set to multiples of 8 for crisp pixel font rendering
    const rtFontSize = rtBrandingFontSize;
    
    const rtBadge = `
        <a href="${rtUrl}" target="_blank" rel="noopener" class="rt-apr-rt-badge">
            <text 
                x="${rtX.toFixed(2)}" 
                y="${rtY.toFixed(2)}" 
                text-anchor="end" 
                dominant-baseline="auto"
                font-family="${APR_FONTS.rtBadge}" 
                font-size="${rtFontSize}" 
                font-weight="700"
                fill="${engColor}"
                opacity="0.7">
                RT
            </text>
        </a>
    `;
    
    // Large clickable hotspot covering the entire timeline for author URL
    // Place it behind everything but in front of background
    const timelineHotspot = authorUrl?.trim() ? `
        <a href="${authorUrl}" target="_blank" rel="noopener" class="apr-timeline-hotspot">
            <circle cx="0" cy="0" r="${brandingRadius}" fill="transparent" />
        </a>
    ` : '';
    
    return `
        <g class="apr-branding">
            ${timelineHotspot}
            ${brandingDefs}
            ${brandingText}
            ${rtBadge}
        </g>
    `;
}

/**
 * Render the large center percentage
 */
export function renderAprCenterPercent(
    percent: number, 
    size: AprSize, 
    innerRadius: number,
    numberColor?: string,
    symbolColor?: string
): string {
    const preset = getPreset(size);
    // Fallback to Press stage green if colors not provided
    const defaultColor = '#6FB971';
    const numColor = numberColor || defaultColor;
    const symColor = symbolColor || defaultColor;
    
    const numStr = String(percent);
    const charCount = numStr.length;

    // Calculate font size: use max size, but fit to inner circle
    const maxFont = preset.centerFontSize;
    // Get width multipliers from preset configuration
    const maxWidthMultiplier = charCount === 1 
        ? preset.percentWidthMultiplier1Digit 
        : (charCount === 2 ? preset.percentWidthMultiplier2Digit : preset.percentWidthMultiplier3Digit);
    const maxWidth = innerRadius * maxWidthMultiplier;
    // Character width estimate from preset
    const fitFont = maxWidth / (preset.percentCharWidthRatio * charCount);
    const fontSize = Math.min(fitFont, maxFont);

    const ghostFontSize = innerRadius * preset.percentSymbolSizeMultiplier;
    const ghostOpacity = preset.percentSymbolOpacity;
    const numberOpacity = preset.percentNumberOpacity;
    // Use preset-specific offsets for proper scaling at each size
    const ghostYOffset = preset.ghostYOffset;
    const numberYOffset = preset.centerYOffset;

    return `
        <g class="apr-center-percent">
            <text 
                x="0" 
                y="${ghostYOffset}" 
                text-anchor="middle" 
                dominant-baseline="middle"
                font-family="${APR_FONTS.percent}" 
                font-weight="800" 
                font-size="${ghostFontSize}" 
                fill="${symColor}"
                opacity="${ghostOpacity}">
                %
            </text>
            <text 
                x="0" 
                y="${numberYOffset}" 
                text-anchor="middle" 
                dominant-baseline="middle"
                font-family="${APR_FONTS.percent}" 
                font-weight="800" 
                font-size="${fontSize}" 
                letter-spacing="${preset.percentLetterSpacing}"
                fill="${numColor}"
                opacity="${numberOpacity}">
                ${numStr}
            </text>
        </g>
    `;
}
