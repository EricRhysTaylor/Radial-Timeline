/**
 * APR Branding - Perimeter text rendering for Author Progress Reports
 * 
 * Renders the repeating book title around the outer edge and
 * Radial Timeline branding on the inner edge of the branding ring.
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
 */
export function renderAprBranding(options: AprBrandingOptions): string {
    const { bookTitle, authorName, authorUrl, size, bookAuthorColor, engineColor } = options;
    const preset = APR_SIZE_PRESETS[size];
    const { svgSize, brandingRadius, rtBrandingRadius, brandingFontSize, rtBrandingFontSize } = preset;
    
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
    // Approximate: circumference / (avg char width * segment length)
    const circumference = 2 * Math.PI * brandingRadius;
    const avgCharWidth = brandingFontSize * 0.55; // Approximate for uppercase
    const segmentWidth = titleSegment.length * avgCharWidth + (separator.length * avgCharWidth);
    const repetitions = Math.ceil(circumference / segmentWidth) + 1;
    
    // Build the full repeating string
    const fullBrandingText = Array(repetitions).fill(titleSegment).join(separator);
    const fullEngineText = Array(repetitions).fill(engineSegment).join(separator);
    
    // Create arc paths for text
    // Top arc (clockwise from left to right)
    const topArcId = 'apr-branding-top';
    const bottomArcId = 'apr-branding-bottom';
    const rtArcId = 'apr-rt-branding';
    
    // Top arc path (upper semicircle, text reads left-to-right)
    const topArcPath = `M -${brandingRadius} 0 A ${brandingRadius} ${brandingRadius} 0 0 1 ${brandingRadius} 0`;
    
    // Bottom arc path (lower semicircle, text reads left-to-right on the inside)
    const bottomArcPath = `M ${brandingRadius} 0 A ${brandingRadius} ${brandingRadius} 0 0 1 -${brandingRadius} 0`;
    
    // RT branding arc (inside, bottom portion)
    const rtArcPath = `M ${rtBrandingRadius} 0 A ${rtBrandingRadius} ${rtBrandingRadius} 0 0 1 -${rtBrandingRadius} 0`;
    
    // Wrap in link if URL provided
    const wrapLink = (url: string | undefined, content: string): string => {
        if (!url?.trim()) return content;
        return `<a href="${url}" target="_blank" rel="noopener">${content}</a>`;
    };
    
    const brandingDefs = `
        <defs>
            <path id="${topArcId}" d="${topArcPath}" />
            <path id="${bottomArcId}" d="${bottomArcPath}" />
            <path id="${rtArcId}" d="${rtArcPath}" />
        </defs>
    `;
    
    const topBrandingText = `
        <text 
            font-family="var(--font-interface, system-ui, sans-serif)" 
            font-size="${brandingFontSize}" 
            font-weight="700" 
            fill="${baColor}" 
            letter-spacing="0.15em">
            <textPath href="#${topArcId}" startOffset="0%" side="right">
                ${fullBrandingText}
            </textPath>
        </text>
    `;
    
    const bottomBrandingText = `
        <text 
            font-family="var(--font-interface, system-ui, sans-serif)" 
            font-size="${brandingFontSize}" 
            font-weight="700" 
            fill="${engColor}" 
            letter-spacing="0.15em">
            <textPath href="#${bottomArcId}" startOffset="0%" side="right">
                ${fullEngineText}
            </textPath>
        </text>
    `;
    
    // Radial Timeline branding at bottom inside
    const rtBrandingText = `
        <text 
            font-family="var(--font-interface, system-ui, sans-serif)" 
            font-size="${rtBrandingFontSize}" 
            font-weight="600" 
            fill="${APR_TEXT_COLORS.rtBranding}" 
            letter-spacing="0.1em">
            <textPath href="#${rtArcId}" startOffset="50%" text-anchor="middle" side="right">
                RADIAL TIMELINE™
            </textPath>
        </text>
    `;
    
    return `
        <g class="apr-branding">
            ${brandingDefs}
            
            <!-- Book title branding - top arc -->
            ${wrapLink(authorUrl, topBrandingText)}
            
            <!-- Book title branding - bottom arc -->
            ${wrapLink(authorUrl, bottomBrandingText)}
            
            <!-- Radial Timeline branding - inside bottom -->
            ${wrapLink(rtUrl, rtBrandingText)}
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
    const targetDiameter = innerRadius * 1.8;
    const baseFont = preset.centerFontSize * 1.1;
    const fitFont = targetDiameter / (0.6 * charCount);
    const fontSize = Math.min(fitFont, baseFont);

    const ghostFontSize = innerRadius * 1.35;
    const ghostOpacity = 0.12;
    const yOffset = fontSize * 0.32;

    return `
        <g class="apr-center-percent">
            <text 
                x="0" 
                y="${ghostFontSize * 0.32}" 
                text-anchor="middle" 
                font-family="var(--font-interface, system-ui, sans-serif)" 
                font-weight="800" 
                font-size="${ghostFontSize}" 
                fill="${pressColor}"
                opacity="${ghostOpacity}">
                %
            </text>
            <text 
                x="0" 
                y="${yOffset}" 
                text-anchor="middle" 
                font-family="var(--font-interface, system-ui, sans-serif)" 
                font-weight="800" 
                font-size="${fontSize}" 
                fill="${pressColor}"
                stroke="rgba(0,0,0,0.55)"
                stroke-width="2"
                paint-order="stroke fill"
                filter="url(#aprPercentShadow)"
                opacity="0.95">
                ${numStr}
            </text>
        </g>
    `;
}
