/**
 * APR Branding - Perimeter text rendering for Author Progress Reports
 * 
 * Renders the repeating book title/author text around the outer edge.
 */

import { APR_TEXT_COLORS } from './AprConstants';
import { computeAprLayout, type AprLayoutSpec } from './aprLayout';
import { getAprPreset, type AprSize } from './aprPresets';

const cssVar = (name: string, fallback: string) => `var(${name}-override, var(${name}, ${fallback}))`;
const italicAttr = (isItalic?: boolean) => (isItalic ? 'font-style="italic"' : ''); // SAFE: inline style used for SVG font-style attribute

export interface AprBrandingOptions {
    bookTitle: string;
    authorName?: string;
    authorUrl?: string;
    size: AprSize;
    layout?: AprLayoutSpec;
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
    const resolvedLayout = options.layout ?? computeAprLayout(getAprPreset(size), { percent: 0 });
    if (!resolvedLayout.preset.enableText || !resolvedLayout.branding.radius) return '';
    const { radius: brandingRadius, fontSize: brandingFontSize, letterSpacing: brandingLetterSpacing } = resolvedLayout.branding;

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

    // Calculate exact circumference
    const circumference = 2 * Math.PI * brandingRadius;

    const hasAuthor = authorNameUpper.trim().length > 0;
    const unitPattern = hasAuthor
        ? `${bookTitleUpper}${separator}${authorNameUpper}${separator}`
        : `${bookTitleUpper}${separator}`;

    // Measure unit length to determine optimal repeats
    let repeats = 1;
    const avgFontSize = hasAuthor ? (bookTitleSize + authorNameSize) / 2 : bookTitleSize;

    // SAFE: We are in a browser environment (Obsidian)
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
        try {
            // Use a DOM element to measure width, ensuring we capture correct font metrics
            const span = document.createElement('span');
            span.classList.add('rt-apr-measure-text');
            span.style.setProperty('--rt-apr-measure-font-family', bookTitleFontFamily);
            span.style.setProperty('--rt-apr-measure-font-weight', String(bookTitleFontWeight));
            span.style.setProperty('--rt-apr-measure-font-size', `${avgFontSize}px`);
            span.style.setProperty('--rt-apr-measure-letter-spacing', brandingLetterSpacing);
            span.style.setProperty('--rt-apr-measure-font-style', bookTitleFontItalic ? 'italic' : 'normal');
            span.textContent = unitPattern;

            document.body.appendChild(span);
            // Add a tiny buffer to avoid rounding errors causing an extra repeat that squishes too much
            const unitWidth = span.getBoundingClientRect().width * 1.05;
            document.body.removeChild(span);

            if (unitWidth > 0) {
                repeats = Math.round(circumference / unitWidth);
                if (repeats < 1) repeats = 1;
            }
        } catch (e) {
            console.warn('APR Branding: Failed to measure text width, defaulting to 1 repeat', e);
        }
    }

    // Full circle path starting from top (12 o'clock) going clockwise
    const circlePathId = 'apr-branding-circle';
    const circlePath = `M ${brandingRadius} 0 A ${brandingRadius} ${brandingRadius} 0 1 1 -${brandingRadius} 0 A ${brandingRadius} ${brandingRadius} 0 1 1 ${brandingRadius} 0`;

    const brandingDefs = `
        <defs>
            <path id="${circlePathId}" d="${circlePath}" />
        </defs>
    `;

    // Construct the seamless text content
    let textContent = '';
    const bookTspanStart = `<tspan fill="${cssVar('--apr-book-title-color', bookColor)}" font-family="${bookTitleFontFamily}" font-weight="${bookTitleFontWeight}" font-size="${bookTitleSize}" ${italicAttr(bookTitleFontItalic)}>`;
    const authorTspanStart = `<tspan fill="${cssVar('--apr-author-color', authColor)}" font-family="${authorNameFontFamily}" font-weight="${authorNameFontWeight}" font-size="${authorNameSize}" ${italicAttr(authorNameFontItalic)}>`;
    const endTspan = `</tspan>`;

    for (let i = 0; i < repeats; i++) {
        textContent += `${bookTspanStart}${bookTitleUpper}${endTspan}`;
        textContent += `${bookTspanStart}${separator}${endTspan}`; // Separator uses book title styling

        if (hasAuthor) {
            textContent += `${authorTspanStart}${authorNameUpper}${endTspan}`;
            textContent += `${bookTspanStart}${separator}${endTspan}`; // Separator match
        }
    }

    const brandingText = `
        <text 
            font-family="${bookTitleFontFamily}" 
            font-size="${avgFontSize}" 
            font-weight="${bookTitleFontWeight}" 
            ${italicAttr(bookTitleFontItalic)}
            letter-spacing="${brandingLetterSpacing}"
            xml:space="preserve">
            <textPath href="#${circlePathId}" startOffset="0%" textLength="${circumference.toFixed(2)}" lengthAdjust="spacing">
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
    layout?: AprLayoutSpec;
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

    const resolvedLayout = options.layout ?? computeAprLayout(getAprPreset(size), { percent: 0 });
    if (!resolvedLayout.preset.enableText) return '';

    const half = resolvedLayout.outerPx / 2;
    const badgeSize = rtBadgeFontSize ?? resolvedLayout.badge.fontSize;
    const stageText = getStageBadgeText(resolvedLayout, stageLabel);
    const stageLetterSpacing = resolvedLayout.badge.letterSpacing;
    const countdownLetterSpacing = resolvedLayout.badge.countdownLetterSpacing;

    const stageEdgeInset = Math.max(1, Math.round(resolvedLayout.strokes.ring));
    const stageX = half - stageEdgeInset;
    const stageY = half - stageEdgeInset;

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
            dominant-baseline="text-after-edge"
            font-family="${rtBadgeFontFamily}" 
            font-size="${badgeSize}" 
            font-weight="${rtBadgeFontWeight}"
            ${italicAttr(rtBadgeFontItalic)}
            letter-spacing="${stageLetterSpacing}"
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
            dominant-baseline="text-after-edge"
            font-family="${rtBadgeFontFamily}"
            font-size="${countdownFontSize}"
            font-weight="${rtBadgeFontWeight}"
            ${italicAttr(rtBadgeFontItalic)}
            letter-spacing="${countdownLetterSpacing}"
            fill="${cssVar('--apr-countdown-color', APR_TEXT_COLORS.primary)}"
            opacity="var(--apr-countdown-opacity, 0.7)">
            ${revealCountdownDays}d
        </text>
    ` : '';

    const rtAttribution = showRtAttribution ? `
        <a href="https://radialtimeline.com" target="_blank" rel="noopener" class="apr-rt-attribution">
            <text 
                x="${(-half + stageEdgeInset).toFixed(2)}" 
                y="${(half - stageEdgeInset).toFixed(2)}" 
                text-anchor="start" 
                dominant-baseline="text-after-edge"
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

function getStageBadgeText(layout: AprLayoutSpec, stageLabel?: string): string {
    const raw = (stageLabel || 'Zero').trim();
    const upper = raw.toUpperCase() || 'ZERO';
    if (layout.outerPx <= 300) {
        const shortMap: Record<string, string> = {
            ZERO: 'ZE',
            AUTHOR: 'AU',
            HOUSE: 'HO',
            PRESS: 'PR'
        };
        return shortMap[upper] ?? upper.slice(0, 2);
    }
    return upper;
}

/**
 * Options for center percent rendering
 */
export interface AprCenterPercentOptions {
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
    layout: AprLayoutSpec,
    numberColor?: string,
    symbolColor?: string,
    options?: Partial<AprCenterPercentOptions>
): string {
    if (!layout.centerLabel.enabled) return '';
    // Fallback to Press stage green if colors not provided
    const defaultColor = '#6FB971';
    const numColor = numberColor || defaultColor;
    const symColor = symbolColor || defaultColor;

    const percentNumberFontFamily = options?.percentNumberFontFamily || 'Inter';
    const percentNumberFontWeight = options?.percentNumberFontWeight ?? 800;
    const percentNumberFontItalic = options?.percentNumberFontItalic ?? false;
    const percentSymbolFontFamily = options?.percentSymbolFontFamily || percentNumberFontFamily;
    const percentSymbolFontWeight = options?.percentSymbolFontWeight ?? percentNumberFontWeight;
    const percentSymbolFontItalic = options?.percentSymbolFontItalic ?? percentNumberFontItalic;

    const numStr = String(Math.round(percent));
    const innerRadius = layout.ringInnerR;
    const percentPx = Math.max(1, innerRadius * 2);
    const numberPx = percentPx * 0.8;
    const percentDy = percentPx * 0.1;
    const numberDy = numberPx * 0.1;

    // SAFE: inline style used for SVG attribute font-style in template string
    return `
        <g class="apr-center-percent" transform="translate(0 0)">
            <text 
                x="0"
                y="0"
                text-anchor="middle" 
                dominant-baseline="middle"
                alignment-baseline="middle"
                dy="${percentDy}"
                font-family="${percentSymbolFontFamily}" 
                font-weight="${percentSymbolFontWeight}" 
                ${italicAttr(percentSymbolFontItalic)}
                font-size="${percentPx}"
                fill="${cssVar('--apr-percent-symbol-color', symColor)}">
                %
            </text>
            <text 
                x="0"
                y="0"
                text-anchor="middle" 
                dominant-baseline="middle"
                alignment-baseline="middle"
                dy="${numberDy}"
                font-family="${percentNumberFontFamily}" 
                font-weight="${percentNumberFontWeight}" 
                ${italicAttr(percentNumberFontItalic)}
                font-size="${numberPx}" 
                letter-spacing="${layout.centerLabel.letterSpacing}"
                fill="${cssVar('--apr-percent-number-color', numColor)}">
                ${numStr}
            </text>
        </g>
    `;
}
