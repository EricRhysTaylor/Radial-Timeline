/**
 * APR Branding - Perimeter text rendering for Author Progress Reports
 * 
 * Renders the repeating book title around the outer edge and
 * Radial Timeline branding on the inner edge of the branding ring.
 */

import { APR_SIZE_PRESETS, APR_TEXT_COLORS, AprSize } from './AprConstants';

export interface AprBrandingOptions {
    bookTitle: string;
    authorName?: string;
    authorUrl?: string;
    size: AprSize;
}

/**
 * Generate the perimeter branding SVG elements
 */
export function renderAprBranding(options: AprBrandingOptions): string {
    const { bookTitle, authorName, authorUrl, size } = options;
    const preset = APR_SIZE_PRESETS[size];
    const { svgSize, brandingRadius, rtBrandingRadius, brandingFontSize, rtBrandingFontSize } = preset;
    
    const rtUrl = 'https://radialtimeline.com';
    
    // Build the repeating title text
    const separator = ' ~ ';
    const titleSegment = authorName 
        ? `${bookTitle.toUpperCase()}${separator}${authorName.toUpperCase()}`
        : bookTitle.toUpperCase();
    
    // Calculate how many repetitions we need to fill the circle
    // Approximate: circumference / (avg char width * segment length)
    const circumference = 2 * Math.PI * brandingRadius;
    const avgCharWidth = brandingFontSize * 0.55; // Approximate for uppercase
    const segmentWidth = titleSegment.length * avgCharWidth + (separator.length * avgCharWidth);
    const repetitions = Math.ceil(circumference / segmentWidth) + 1;
    
    // Build the full repeating string
    const fullBrandingText = Array(repetitions).fill(titleSegment).join(separator);
    
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
            fill="${APR_TEXT_COLORS.primary}" 
            letter-spacing="0.15em">
            <textPath href="#${topArcId}" startOffset="0%">
                ${fullBrandingText}
            </textPath>
        </text>
    `;
    
    const bottomBrandingText = `
        <text 
            font-family="var(--font-interface, system-ui, sans-serif)" 
            font-size="${brandingFontSize}" 
            font-weight="700" 
            fill="${APR_TEXT_COLORS.primary}" 
            letter-spacing="0.15em">
            <textPath href="#${bottomArcId}" startOffset="0%">
                ${fullBrandingText}
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
            <textPath href="#${rtArcId}" startOffset="50%" text-anchor="middle">
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
export function renderAprCenterPercent(percent: number, size: AprSize): string {
    const preset = APR_SIZE_PRESETS[size];
    const fontSize = preset.centerFontSize;
    
    // Position text slightly above center for visual balance
    const yOffset = fontSize * 0.35;
    
    return `
        <g class="apr-center-percent">
            <text 
                x="0" 
                y="${yOffset}" 
                text-anchor="middle" 
                font-family="var(--font-interface, system-ui, sans-serif)" 
                font-weight="800" 
                font-size="${fontSize}" 
                fill="${APR_TEXT_COLORS.primary}"
                opacity="0.95">
                ${percent}%
            </text>
        </g>
    `;
}
