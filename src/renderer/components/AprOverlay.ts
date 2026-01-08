import { SVG_SIZE, INNER_RADIUS } from '../layout/LayoutConstants';

export function renderAprOverlay(params: {
    progressPercent: number;
    bookTitle: string;
    authorUrl: string;
}): string {
    const { progressPercent, bookTitle, authorUrl } = params;
    
    // 1. Center Percentage
    const centerText = `
        <text x="0" y="15" 
              text-anchor="middle" 
              font-family="var(--font-interface)" 
              font-weight="bold" 
              font-size="64" 
              fill="var(--text-normal)" 
              opacity="0.9">
            ${progressPercent}%
        </text>
    `;

    // 2. Perimeter Branding
    const outerR = (SVG_SIZE / 2) - 20; // 20px padding from edge
    const rtUrl = "https://www.radialtimeline.com"; 

    // Helper to wrap content in a link ONLY if URL is present
    const wrapLink = (url: string | undefined, content: string) => {
        if (!url || !url.trim()) return content;
        return `<a href="${url}" target="_blank" style="cursor: pointer;">${content}</a>`; // SAFE: inline style used for standalone SVG export
    };

    const topPathId = "apr-top-arc";
    const bottomPathId = "apr-bottom-arc";

    const topTextContent = `
        <text font-family="var(--font-interface)" font-size="16" font-weight="bold" fill="var(--text-normal)" letter-spacing="2">
            <textPath href="#${topPathId}" startOffset="50%" text-anchor="middle">
                ${bookTitle.toUpperCase()} — AUTHOR PROGRESS REPORT
            </textPath>
        </text>
    `;

    const bottomTextContent = `
        <text font-family="var(--font-interface)" font-size="12" fill="var(--text-muted)" letter-spacing="1">
            <textPath href="#${bottomPathId}" startOffset="50%" text-anchor="middle">
                PRESENTED BY THE RADIAL TIMELINE™
            </textPath>
        </text>
    `;

    const refinedBranding = `
        <defs>
            <path id="${topPathId}" d="M -${outerR} 0 A ${outerR} ${outerR} 0 0 1 ${outerR} 0" />
            <path id="${bottomPathId}" d="M ${outerR} 0 A ${outerR} ${outerR} 0 0 1 -${outerR} 0" />
        </defs>

        <!-- Top Arc: Book Title -->
        ${wrapLink(authorUrl, topTextContent)}

        <!-- Bottom Arc: Radial Timeline -->
        ${wrapLink(rtUrl, bottomTextContent)}
    `;

    return `
        <g class="apr-overlay">
            ${centerText}
            ${refinedBranding}
        </g>
    `;
}
