/**
 * APR Branding - Perimeter text rendering for Author Progress Reports
 * 
 * Renders the repeating book title around the outer edge with one instance
 * of Radial Timeline branding replacing one iteration near the bottom.
 */

import { APR_SIZE_PRESETS, APR_TEXT_COLORS, APR_STAGE_COLORS, AprSize } from './AprConstants';

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
 * Creates a continuous text ring where one segment is the engine branding
 */
export function renderAprBranding(options: AprBrandingOptions): string {
    const { bookTitle, authorName, authorUrl, size, bookAuthorColor, engineColor } = options;
    const preset = APR_SIZE_PRESETS[size];
    const { brandingRadius, brandingFontSize } = preset;
    
    const rtUrl = 'https://radialtimeline.com';
    const baColor = bookAuthorColor || APR_STAGE_COLORS.published;
    const engColor = engineColor || APR_TEXT_COLORS.primary;
    
    // Build the repeating title text
    const separator = ' ~ ';
    const pair = authorName 
        ? `${bookTitle.toUpperCase()} • ${authorName.toUpperCase()}`
        : bookTitle.toUpperCase();
    const titleSegment = pair;
    const engineSegment = 'RADIAL TIMELINE ENGINE';
    
    // Calculate how many repetitions we need to fill the circle
    const circumference = 2 * Math.PI * brandingRadius;
    const avgCharWidth = brandingFontSize * 0.55;
    const segmentWidth = titleSegment.length * avgCharWidth + (separator.length * avgCharWidth);
    const repetitions = Math.max(Math.ceil(circumference / segmentWidth), 4);
    
    // Build segments array with one engine segment replacing one book/author segment
    // Place the engine segment roughly at the bottom (around 75% of the way, which is ~270 degrees = bottom)
    const engineIndex = Math.floor(repetitions * 0.75);
    
    // Build tspan elements for each segment with appropriate colors
    const tspans: string[] = [];
    for (let i = 0; i < repetitions; i++) {
        const isEngine = (i === engineIndex);
        const text = isEngine ? engineSegment : titleSegment;
        const color = isEngine ? engColor : baColor;
        const url = isEngine ? rtUrl : authorUrl;
        
        // Add separator before (except first)
        if (i > 0) {
            tspans.push(`<tspan fill="${baColor}">${separator}</tspan>`);
        }
        
        // Add the segment with optional link
        if (url?.trim()) {
            tspans.push(`<a href="${url}" target="_blank" rel="noopener"><tspan fill="${color}">${text}</tspan></a>`);
        } else {
            tspans.push(`<tspan fill="${color}">${text}</tspan>`);
        }
    }
    
    // Full circle path starting from top (12 o'clock) going clockwise
    const circlePathId = 'apr-branding-circle';
    const circlePath = `M 0 -${brandingRadius} A ${brandingRadius} ${brandingRadius} 0 1 1 0 ${brandingRadius} A ${brandingRadius} ${brandingRadius} 0 1 1 0 -${brandingRadius}`;
    
    const brandingDefs = `
        <defs>
            <path id="${circlePathId}" d="${circlePath}" />
        </defs>
    `;
    
    const brandingText = `
        <text 
            font-family="var(--font-interface, system-ui, sans-serif)" 
            font-size="${brandingFontSize}" 
            font-weight="700" 
            letter-spacing="0.15em">
            <textPath href="#${circlePathId}" startOffset="0%">
                ${tspans.join('')}
            </textPath>
        </text>
    `;
    
    return `
        <g class="apr-branding">
            ${brandingDefs}
            ${brandingText}
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
    const pressColor = stageColors.Press || APR_STAGE_COLORS.published;
    const numStr = String(percent);
    const charCount = numStr.length;

    // Fit the number to the inner circle: rough width = fontSize * 0.6 * chars
    const targetDiameter = innerRadius * 2.3;
    const baseFont = preset.centerFontSize * 2.2;
    const fitFont = targetDiameter / (0.6 * charCount);
    const fontSize = Math.min(fitFont, baseFont);

    const ghostFontSize = innerRadius * 1.9;
    const ghostOpacity = 0.28;
    // Manual vertical offsets to visually center in the hole
    const ghostYOffset = 20; // % symbol down 20px
    const numberYOffset = 10; // number down 10px

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
