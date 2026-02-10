import { SVG_SIZE, INNER_RADIUS, APR_BRANDING_RADIUS, APR_BRANDING_FONT_SIZE } from '../layout/LayoutConstants';
import { escapeXml } from '../../utils/svg';
import { DEFAULT_BOOK_TITLE } from '../../utils/books';

export function renderAprOverlay(params: {
    progressPercent: number;
    bookTitle: string;
    authorUrl: string;
    authorName?: string;
}): string {
    const { progressPercent, bookTitle, authorUrl, authorName } = params;
    
    // Center hole radius is INNER_RADIUS (200px)
    // Make percentage text large enough to fill most of the center
    const centerFontSize = Math.floor(INNER_RADIUS * 0.75); // ~150px
    
    // 1. Center Percentage - large and prominent
    const centerText = `
        <text x="0" y="${Math.floor(centerFontSize * 0.35)}" 
              text-anchor="middle" 
              font-family="var(--font-interface, system-ui, sans-serif)" 
              font-weight="800" 
              font-size="${centerFontSize}" 
              fill="var(--text-normal, #e5e5e5)" 
              opacity="0.95">
            ${progressPercent}%
        </text>
    `;

    // 2. Perimeter Branding - in the space between rings and edge
    // Use APR_BRANDING_RADIUS (640px) - between rings (520px outer) and edge (800px)
    const brandingR = APR_BRANDING_RADIUS;
    const outerR = (SVG_SIZE / 2) - 15; // 785px - just inside the edge for RT branding
    const rtUrl = "https://radialtimeline.com"; 

    // Build repeating title text - escape for XML safety
    const separator = ' ~ ';
    const safeTitle = escapeXml(bookTitle.toUpperCase()) || DEFAULT_BOOK_TITLE.toUpperCase();
    const safeAuthor = authorName ? escapeXml(authorName.toUpperCase()) : '';
    const titleSegment = safeAuthor 
        ? `${safeTitle}${separator}${safeAuthor}`
        : safeTitle;
    
    // Calculate repetitions to fill the circumference at the branding radius
    const circumference = 2 * Math.PI * brandingR;
    const avgCharWidth = APR_BRANDING_FONT_SIZE * 0.55; // font-size * avg width ratio
    const segmentWidth = (titleSegment.length + separator.length) * avgCharWidth;
    const repetitions = Math.ceil(circumference / segmentWidth) + 1;
    const fullBrandingText = Array(repetitions).fill(titleSegment).join(separator);

    // Helper to wrap content in a link
    const wrapLink = (url: string | undefined, content: string) => {
        if (!url?.trim()) return content;
        return `<a href="${url}" target="_blank" rel="noopener">${content}</a>`;
    };

    const topPathId = "apr-top-arc";
    const bottomPathId = "apr-bottom-arc";
    const rtPathId = "apr-rt-arc";

    // Use the defined APR branding font size (38px) - much larger for readability
    const brandingFontSize = APR_BRANDING_FONT_SIZE;
    const rtFontSize = 18; // RT branding also larger

    // Branding arcs at the dedicated branding radius (between rings and edge)
    const topArcPath = `M -${brandingR} 0 A ${brandingR} ${brandingR} 0 0 1 ${brandingR} 0`;
    const bottomArcPath = `M ${brandingR} 0 A ${brandingR} ${brandingR} 0 0 1 -${brandingR} 0`;
    // RT branding on the outer edge
    const rtArcPath = `M ${outerR} 0 A ${outerR} ${outerR} 0 0 1 -${outerR} 0`;

    const topTextContent = `
        <text font-family="var(--font-interface, system-ui, sans-serif)" font-size="${brandingFontSize}" font-weight="700" fill="var(--text-normal, #e5e5e5)" letter-spacing="0.15em">
            <textPath href="#${topPathId}" startOffset="0%">
                ${fullBrandingText}
            </textPath>
        </text>
    `;

    const bottomTextContent = `
        <text font-family="var(--font-interface, system-ui, sans-serif)" font-size="${brandingFontSize}" font-weight="700" fill="var(--text-normal, #e5e5e5)" letter-spacing="0.15em">
            <textPath href="#${bottomPathId}" startOffset="0%">
                ${fullBrandingText}
            </textPath>
        </text>
    `;

    const rtBrandingContent = `
        <text font-family="var(--font-interface, system-ui, sans-serif)" font-size="${rtFontSize}" font-weight="600" fill="rgba(255, 212, 29, 0.75)" letter-spacing="0.1em">
            <textPath href="#${rtPathId}" startOffset="50%" text-anchor="middle">
                RADIAL TIMELINE&#8482;
            </textPath>
        </text>
    `;

    const branding = `
        <defs>
            <path id="${topPathId}" d="${topArcPath}" />
            <path id="${bottomPathId}" d="${bottomArcPath}" />
            <path id="${rtPathId}" d="${rtArcPath}" />
        </defs>

        <!-- Top Arc: Repeating Book Title -->
        ${wrapLink(authorUrl, topTextContent)}

        <!-- Bottom Arc: Repeating Book Title -->
        ${wrapLink(authorUrl, bottomTextContent)}

        <!-- RT Branding: Inside bottom of inner radius -->
        ${wrapLink(rtUrl, rtBrandingContent)}
    `;

    return `
        <g class="apr-overlay">
            ${centerText}
            ${branding}
        </g>
    `;
}
