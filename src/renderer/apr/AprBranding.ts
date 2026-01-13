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
    engineColor?: string;
}

/**
 * Generate the perimeter branding SVG elements
 * Creates a continuous text ring of book/author, plus a minimal RT badge at bottom-right
 * 
 * Uses SVG textLength to force text to fill exactly 360° with no gap or overlap.
 */
export function renderAprBranding(options: AprBrandingOptions): string {
    const { bookTitle, authorName, authorUrl, size, bookAuthorColor, engineColor } = options;
    const preset = getPreset(size);
    const { brandingRadius, brandingFontSize, rtBrandingFontSize } = preset;
    
    const rtUrl = 'https://radialtimeline.com';
    // Fallback to Press stage green if no color provided (matches RT default)
    const baColor = bookAuthorColor || '#6FB971';
    const engColor = engineColor || APR_TEXT_COLORS.primary;
    
    // Build the repeating title segment
    const separator = ' ~ ';
    const pair = authorName 
        ? `${bookTitle.toUpperCase()} • ${authorName.toUpperCase()}`
        : bookTitle.toUpperCase();
    const singleSegment = pair + separator;
    
    // Calculate exact circumference
    const circumference = 2 * Math.PI * brandingRadius;
    
    // Estimate how many reps fit comfortably (rough estimate for count only)
    const baseCharWidth = brandingFontSize * 0.55;
    const segmentBaseWidth = singleSegment.length * baseCharWidth;
    const idealReps = Math.round(circumference / segmentBaseWidth);
    const repetitions = Math.max(4, Math.min(10, idealReps));
    
    // Build the full text - use separator between all segments for seamless wrap
    // The last separator connects back to the first segment visually
    const fullBrandingText = Array(repetitions).fill(pair).join(separator) + separator;
    
    // Full circle path starting from top (12 o'clock) going clockwise
    const circlePathId = 'apr-branding-circle';
    const circlePath = `M 0 -${brandingRadius} A ${brandingRadius} ${brandingRadius} 0 1 1 0 ${brandingRadius} A ${brandingRadius} ${brandingRadius} 0 1 1 0 -${brandingRadius}`;
    
    const brandingDefs = `
        <defs>
            <path id="${circlePathId}" d="${circlePath}" />
        </defs>
    `;
    
    // Use textLength to force the text to fill EXACTLY the circumference
    // lengthAdjust="spacing" adjusts only inter-character spacing, not glyph shapes
    const brandingText = `
        <text 
            font-family="${APR_FONTS.branding}" 
            font-size="${brandingFontSize}" 
            font-weight="700" 
            fill="${baColor}"
            textLength="${circumference.toFixed(2)}"
            lengthAdjust="spacing">
            <textPath href="#${circlePathId}" startOffset="0%">
                ${fullBrandingText}
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
    stageColors: Record<string, string>, 
    innerRadius: number
): string {
    const preset = getPreset(size);
    // Use Press stage color from settings (or default green)
    const pressColor = stageColors.Press || '#6FB971';
    const numStr = String(percent);
    const charCount = numStr.length;

    // Fit the number to the inner circle: rough width = fontSize * 0.6 * chars
    const targetDiameter = innerRadius * 2.3;
    const baseFont = preset.centerFontSize * 2.2;
    const fitFont = targetDiameter / (0.6 * charCount);
    const fontSize = Math.min(fitFont, baseFont);

    const ghostFontSize = innerRadius * 1.9;
    const ghostOpacity = 0.28;
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
                fill="${pressColor}"
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
                fill="${pressColor}"
                opacity="0.95">
                ${numStr}
            </text>
        </g>
    `;
}
