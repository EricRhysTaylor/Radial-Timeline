/**
 * APR Branding - Perimeter text rendering for Author Progress Reports
 * 
 * Renders the repeating book title around the outer edge with one instance
 * of Radial Timeline branding replacing one iteration near the bottom.
 */

import { APR_SIZE_PRESETS, APR_TEXT_COLORS, AprSize } from './AprConstants';

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
 */
export function renderAprBranding(options: AprBrandingOptions): string {
    const { bookTitle, authorName, authorUrl, size, bookAuthorColor, engineColor } = options;
    const preset = APR_SIZE_PRESETS[size];
    const { brandingRadius, brandingFontSize, rtBrandingFontSize } = preset;
    
    const rtUrl = 'https://radialtimeline.com';
    // Fallback to Press stage green if no color provided (matches RT default)
    const baColor = bookAuthorColor || '#6FB971';
    const engColor = engineColor || APR_TEXT_COLORS.primary;
    
    // Build the repeating title text
    const separator = ' ~ ';
    const pair = authorName 
        ? `${bookTitle.toUpperCase()} • ${authorName.toUpperCase()}`
        : bookTitle.toUpperCase();
    const titleSegment = pair;
    
    // Calculate how many repetitions we need to fill the circle
    const circumference = 2 * Math.PI * brandingRadius;
    const avgCharWidth = brandingFontSize * 0.55;
    const segmentWidth = titleSegment.length * avgCharWidth + (separator.length * avgCharWidth);
    const repetitions = Math.max(Math.ceil(circumference / segmentWidth), 4);
    
    // Build the full repeating string (all book/author, no engine text in the ring)
    const fullBrandingText = Array(repetitions).fill(titleSegment).join(separator);
    
    // Full circle path starting from top (12 o'clock) going clockwise
    // Clockwise (sweep-flag=1) places text on the OUTSIDE of the curve, readable at top
    const circlePathId = 'apr-branding-circle';
    const circlePath = `M 0 -${brandingRadius} A ${brandingRadius} ${brandingRadius} 0 1 1 0 ${brandingRadius} A ${brandingRadius} ${brandingRadius} 0 1 1 0 -${brandingRadius}`;
    
    const brandingDefs = `
        <defs>
            <path id="${circlePathId}" d="${circlePath}" />
        </defs>
    `;
    
    // Wrap in link if URL provided
    const wrapLink = (url: string | undefined, content: string): string => {
        if (!url?.trim()) return content;
        return `<a href="${url}" target="_blank" rel="noopener">${content}</a>`;
    };
    
    const brandingText = `
        <text 
            font-family="var(--font-interface, system-ui, sans-serif)" 
            font-size="${brandingFontSize}" 
            font-weight="700" 
            fill="${baColor}"
            letter-spacing="0.15em">
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
                font-family="'04b03b', monospace" 
                font-size="${rtFontSize}" 
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
    const preset = APR_SIZE_PRESETS[size];
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
                font-family="var(--font-interface, system-ui, sans-serif)" 
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
                font-family="var(--font-interface, system-ui, sans-serif)" 
                font-weight="800" 
                font-size="${fontSize}" 
                fill="${pressColor}"
                opacity="0.95">
                ${numStr}
            </text>
        </g>
    `;
}
