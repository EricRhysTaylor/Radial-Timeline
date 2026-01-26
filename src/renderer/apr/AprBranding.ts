/**
 * APR Branding - Perimeter text rendering for Author Progress Reports
 * 
 * Renders the repeating book title/author text around the outer edge.
 */

import { getPreset, APR_TEXT_COLORS, AprSize } from './AprLayoutConfig';

const cssVar = (name: string, fallback: string) => `var(${name}-override, var(${name}, ${fallback}))`;
const italicAttr = (isItalic?: boolean) => (isItalic ? 'font-style="italic"' : ''); // SAFE: inline style used for SVG font-style attribute

export interface AprBrandingOptions {
    bookTitle: string;
    authorName?: string;
    authorUrl?: string;
    size: AprSize;
    bookAuthorColor?: string;
    authorColor?: string;
    // Book Title font settings
    bookTitleFontFamily?: string;
    bookTitleFontWeight?: number;
    bookTitleFontItalic?: boolean;
    bookTitleFontSize?: number;
    // Author Name font settings
    authorNameFontFamily?: string;
    authorNameFontWeight?: number;
    authorNameFontItalic?: boolean;
    authorNameFontSize?: number;
}

/**
 * Generate the perimeter branding SVG elements
 * Creates a continuous text ring of book/author (badges handled separately)
 * 
 * Uses SVG textLength to force text to fill exactly 360° with no gap or overlap.
 */
export function renderAprBranding(options: AprBrandingOptions): string {
    const {
        bookTitle, authorName, authorUrl, size, bookAuthorColor, authorColor,
        bookTitleFontFamily = 'Inter', bookTitleFontWeight = 400, bookTitleFontItalic = false, bookTitleFontSize,
        authorNameFontFamily = 'Inter', authorNameFontWeight = 400, authorNameFontItalic = false, authorNameFontSize
    } = options;
    const preset = getPreset(size);
    const { brandingRadius, brandingFontSize } = preset;

    // Use custom font sizes if provided, otherwise use preset defaults
    const bookTitleSize = bookTitleFontSize ?? brandingFontSize;
    const authorNameSize = authorNameFontSize ?? brandingFontSize;
    // Fallback to Press stage green if no color provided (matches RT default)
    const bookColor = bookAuthorColor || '#6FB971';
    const authColor = authorColor || bookColor; // Default to book color if not specified

    // Build the repeating title segment
    const separator = ' ~ ';
    const bookTitleUpper = bookTitle.toUpperCase();
    const authorNameUpper = authorName?.toUpperCase() || '';
    const bullet = ' • ';

    // Calculate exact circumference
    const circumference = 2 * Math.PI * brandingRadius;

    // Estimate segment width for repetition calculation
    const baseCharWidth = bookTitleSize * 0.55;
    const singleSegment = authorName
        ? `${bookTitleUpper}${bullet}${authorNameUpper}${separator}`
        : `${bookTitleUpper}${separator}`;
    const segmentBaseWidth = singleSegment.length * baseCharWidth;
    const idealReps = Math.round(circumference / segmentBaseWidth);
    const repetitions = Math.max(4, Math.min(10, idealReps));

    // Full circle path starting from top (12 o'clock) going clockwise
    const circlePathId = 'apr-branding-circle';
    const circlePath = `M ${brandingRadius} 0 A ${brandingRadius} ${brandingRadius} 0 1 1 -${brandingRadius} 0 A ${brandingRadius} ${brandingRadius} 0 1 1 ${brandingRadius} 0`;

    const brandingDefs = `
        <defs>
            <path id="${circlePathId}" d="${circlePath}" />
        </defs>
    `;

    // Build text content with tspan elements for separate colors and fonts
    // textLength applies spacing to the entire text content including all tspan children
    const hasAuthor = authorName && authorName.trim().length > 0;
    let textContent = '';
    for (let i = 0; i < repetitions; i++) {
        // Book title with its own font settings (using SVG attributes, not inline styles)
        textContent += `<tspan fill="${cssVar('--apr-book-title-color', bookColor)}" font-family="${bookTitleFontFamily}" font-weight="${bookTitleFontWeight}" ${italicAttr(bookTitleFontItalic)}>${bookTitleUpper}</tspan>`; // SAFE: inline style used for SVG attribute font-style in template string
        if (hasAuthor) {
            // Author name with its own font settings (using SVG attributes, not inline styles)
            textContent += `<tspan fill="${cssVar('--apr-author-color', authColor)}" font-family="${authorNameFontFamily}" font-weight="${authorNameFontWeight}" ${italicAttr(authorNameFontItalic)}>${bullet}${authorNameUpper}</tspan>`; // SAFE: inline style used for SVG attribute font-style in template string
        }
        // Separator uses book title font (using SVG attributes, not inline styles)
        textContent += `<tspan fill="${cssVar('--apr-book-title-color', bookColor)}" font-family="${bookTitleFontFamily}" font-weight="${bookTitleFontWeight}" ${italicAttr(bookTitleFontItalic)}>${separator}</tspan>`; // SAFE: inline style used for SVG attribute font-style in template string
    }

    // Use average font size for the text element (textLength needs a consistent base)
    const avgFontSize = hasAuthor ? (bookTitleSize + authorNameSize) / 2 : bookTitleSize;

    const brandingText = `
        <text 
            font-family="${bookTitleFontFamily}" 
            font-size="${avgFontSize}" 
            font-weight="${bookTitleFontWeight}" 
            ${italicAttr(bookTitleFontItalic)}
            textLength="${circumference.toFixed(2)}"
            lengthAdjust="spacing">
            <textPath href="#${circlePathId}" startOffset="0%">
                ${textContent}
            </textPath>
        </text>
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
        </g>
    `;
}

export interface AprBadgeOptions {
    size: AprSize;
    stageLabel?: string;
    showStageBadge?: boolean;
    showRtAttribution?: boolean;
    revealCountdownDays?: number;
    rtBadgeFontFamily?: string;
    rtBadgeFontWeight?: number;
    rtBadgeFontItalic?: boolean;
    rtBadgeFontSize?: number;
}

export function renderAprBadges(options: AprBadgeOptions): string {
    const {
        size,
        stageLabel,
        showStageBadge = true,
        showRtAttribution = true,
        revealCountdownDays,
        rtBadgeFontFamily = 'Inter',
        rtBadgeFontWeight = 700,
        rtBadgeFontItalic = false,
        rtBadgeFontSize
    } = options;

    if (!showStageBadge && !showRtAttribution) return '';

    const preset = getPreset(size);
    const half = preset.svgSize / 2;
    const corner = preset.rtCornerOffset;
    const badgeSize = rtBadgeFontSize ?? preset.rtBrandingFontSize;
    const stageText = (stageLabel || 'Zero').trim().toUpperCase() || 'ZERO';

    const stageX = half - corner;
    const stageY = half - corner;

    const approxCharWidth = badgeSize * 0.6;
    const stageLabelWidth = stageText.length * approxCharWidth;
    const countdownGap = Math.max(4, Math.round(badgeSize * 0.35));
    const countdownFontSize = Math.max(6, Math.round(badgeSize * 0.7));
    const countdownX = stageX - stageLabelWidth - countdownGap;

    const stageBadge = showStageBadge ? `
        <text 
            class="apr-stage-badge__text"
            x="${stageX.toFixed(2)}" 
            y="${stageY.toFixed(2)}" 
            text-anchor="end" 
            dominant-baseline="auto"
            font-family="${rtBadgeFontFamily}" 
            font-size="${badgeSize}" 
            font-weight="${rtBadgeFontWeight}"
            ${italicAttr(rtBadgeFontItalic)}
            fill="${cssVar('--apr-stage-badge-color', APR_TEXT_COLORS.primary)}"
            opacity="var(--apr-stage-badge-opacity, 0.88)">
            ${stageText}
        </text>
    ` : '';

    const countdown = revealCountdownDays && revealCountdownDays > 0 && showStageBadge ? `
        <text
            class="apr-reveal-countdown"
            x="${countdownX.toFixed(2)}"
            y="${stageY.toFixed(2)}"
            text-anchor="end"
            dominant-baseline="auto"
            font-family="${rtBadgeFontFamily}"
            font-size="${countdownFontSize}"
            font-weight="${rtBadgeFontWeight}"
            ${italicAttr(rtBadgeFontItalic)}
            fill="${cssVar('--apr-countdown-color', APR_TEXT_COLORS.primary)}"
            opacity="var(--apr-countdown-opacity, 0.7)">
            ${revealCountdownDays}d
        </text>
    ` : '';

    const rtAttribution = showRtAttribution ? `
        <a href="https://radialtimeline.com" target="_blank" rel="noopener" class="apr-rt-attribution">
            <text 
                x="${(-half + corner).toFixed(2)}" 
                y="${(half - corner).toFixed(2)}" 
                text-anchor="start" 
                dominant-baseline="auto"
                font-family="${rtBadgeFontFamily}" 
                font-size="${Math.max(6, Math.round(badgeSize * 0.75))}" 
                font-weight="${rtBadgeFontWeight}"
                ${italicAttr(rtBadgeFontItalic)}
                fill="${cssVar('--apr-rt-attrib-color', APR_TEXT_COLORS.primary)}"
                opacity="var(--apr-rt-attrib-opacity, 0.35)">
                RT
            </text>
        </a>
    ` : '';

    return `
        <g class="apr-badges">
            ${countdown}
            ${stageBadge}
            ${rtAttribution}
        </g>
    `;
}

/**
 * Options for center percent rendering
 */
export interface AprCenterPercentOptions {
    percent: number;
    size: AprSize;
    innerRadius: number;
    numberColor?: string;
    symbolColor?: string;
    // Percent Number font settings
    percentNumberFontFamily?: string;
    percentNumberFontWeight?: number;
    percentNumberFontItalic?: boolean;
    percentNumberFontSize1Digit?: number;
    percentNumberFontSize2Digit?: number;
    percentNumberFontSize3Digit?: number;
    // Percent Symbol font settings
    percentSymbolFontFamily?: string;
    percentSymbolFontWeight?: number;
    percentSymbolFontItalic?: boolean;
}

/**
 * Render the large center percentage
 */
export function renderAprCenterPercent(
    percent: number,
    size: AprSize,
    innerRadius: number,
    numberColor?: string,
    symbolColor?: string,
    percentFontWeight?: number,
    options?: Partial<AprCenterPercentOptions>
): string {
    const preset = getPreset(size);
    // Fallback to Press stage green if colors not provided
    const defaultColor = '#6FB971';
    const numColor = numberColor || defaultColor;
    const symColor = symbolColor || defaultColor;

    // Use options if provided, otherwise fall back to legacy percentFontWeight parameter
    const percentNumberFontFamily = options?.percentNumberFontFamily || 'Inter';
    const percentNumberFontWeight = options?.percentNumberFontWeight ?? percentFontWeight ?? 800;
    const percentNumberFontItalic = options?.percentNumberFontItalic ?? false;
    const percentSymbolFontFamily = options?.percentSymbolFontFamily || 'Inter';
    const percentSymbolFontWeight = options?.percentSymbolFontWeight ?? percentFontWeight ?? 800;
    const percentSymbolFontItalic = options?.percentSymbolFontItalic ?? false;

    const numStr = String(percent);
    const charCount = numStr.length;

    // Intelligent scaling algorithm:
    // Pinned to the user's preferred 3-digit density (width constraint) 
    // and 1-digit max height (height constraint).
    // Formula: Size = Min(MaxHeight, (Reference3DigitSize * 3) / CharCount)

    // Use the 1-digit size as the Max Height cap
    const maxHeight = options?.percentNumberFontSize1Digit ?? preset.centerNumberFontSize1Digit;

    // Use the 3-digit size as the Density Reference (width constraint)
    const refSize3 = options?.percentNumberFontSize3Digit ?? preset.centerNumberFontSize3Digit;

    // Calculate optimal size
    const fontSize = Math.min(maxHeight, (refSize3 * 3) / charCount);

    const ghostFontSize = innerRadius * preset.percentSymbolSizeMultiplier;
    const ghostOpacity = preset.percentSymbolOpacity;
    const numberOpacity = preset.percentNumberOpacity;
    // Use preset-specific offsets for proper scaling at each size
    const ghostYOffset = preset.ghostYOffset;
    const ghostXOffset = preset.ghostXOffset ?? 0;
    const numberYOffset = preset.centerYOffset;
    const numberXOffset = preset.centerXOffset ?? 0;

    // SAFE: inline style used for SVG attribute font-style in template string
    return `
        <g class="apr-center-percent">
            <text 
                x="${ghostXOffset}" 
                y="${ghostYOffset}" 
                text-anchor="middle" 
                dominant-baseline="middle"
                font-family="${percentSymbolFontFamily}" 
                font-weight="${percentSymbolFontWeight}" 
                ${italicAttr(percentSymbolFontItalic)}
                font-size="${ghostFontSize}" 
                fill="${cssVar('--apr-percent-symbol-color', symColor)}"
                opacity="${ghostOpacity}">
                %
            </text>
            <text 
                x="${numberXOffset}" 
                y="${numberYOffset}" 
                text-anchor="middle" 
                dominant-baseline="middle"
                font-family="${percentNumberFontFamily}" 
                font-weight="${percentNumberFontWeight}" 
                ${italicAttr(percentNumberFontItalic)}
                font-size="${fontSize}" 
                letter-spacing="${preset.percentLetterSpacing}"
                fill="${cssVar('--apr-percent-number-color', numColor)}"
                opacity="${numberOpacity}">
                ${numStr}
            </text>
        </g>
    `;
}
