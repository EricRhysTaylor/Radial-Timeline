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
    // Estimate width per token (headless-safe, no DOM measurement)
    const avgFontSize = hasAuthor ? (bookTitleSize + authorNameSize) / 2 : bookTitleSize;
    const baseCharWidth = avgFontSize * 0.45;
    const baseLetterSpacing = brandingLetterSpacing.trim();
    const baseSpacingEm = baseLetterSpacing.endsWith('em') ? Number.parseFloat(baseLetterSpacing) : 0;
    const baselineSpacingEm = Number.isFinite(baseSpacingEm) ? baseSpacingEm * 0.7 : 0;
    const baselineLetterSpacing = baseLetterSpacing.endsWith('em')
        ? `${baselineSpacingEm.toFixed(3)}em`
        : brandingLetterSpacing;

    const estimateTextWidth = (text: string, spacingEm: number) => {
        const charCount = Math.max(1, text.length);
        const spacingPx = spacingEm * avgFontSize;
        return charCount * baseCharWidth + Math.max(0, charCount - 1) * spacingPx;
    };

    const bookWords = bookTitleUpper.trim().split(/\s+/).filter(Boolean);
    const authorWords = authorNameUpper.trim().split(/\s+/).filter(Boolean);
    const bookTokens = bookWords.map((word, idx) => ({
        kind: 'book' as const,
        text: idx < bookWords.length - 1 ? `${word} ` : word
    }));
    const authorTokens = authorWords.map((word, idx) => ({
        kind: 'author' as const,
        text: idx < authorWords.length - 1 ? `${word} ` : word
    }));
    const sepToken = { kind: 'sep' as const, text: separator };

    const patternTokens = hasAuthor
        ? [...bookTokens, sepToken, ...authorTokens, sepToken]
        : [...bookTokens, sepToken];

    const tokens: Array<{ kind: 'book' | 'author' | 'sep'; text: string }> = [];
    let estimatedWidth = 0;
    let repeats = 0;
    const maxRepeats = 20;
    while (estimatedWidth < circumference * 1.25 && repeats < maxRepeats) {
        for (const token of patternTokens) {
            tokens.push(token);
            estimatedWidth += estimateTextWidth(token.text, baselineSpacingEm);
        }
        repeats += 1;
    }

    if (tokens.length === 0) tokens.push(...patternTokens);

    const minSpacingEm = Math.max(0, baselineSpacingEm * 0.9);
    const maxSpacingEm = 0.28;
    let bestCandidate: { count: number; spacingEm: number; adjustment: number; endsWithSep: boolean } | null = null;
    let bestWithin: { count: number; spacingEm: number; adjustment: number; endsWithSep: boolean } | null = null;
    let runningChars = 0;

    for (let i = 0; i < tokens.length; i += 1) {
        runningChars += tokens[i].text.length;
        if (i < patternTokens.length - 1) continue;
        const spacingSlots = Math.max(1, runningChars - 1);
        const requiredSpacingEm = (circumference - runningChars * baseCharWidth) / (spacingSlots * avgFontSize);
        if (!Number.isFinite(requiredSpacingEm)) continue;
        const adjustment = Math.abs(requiredSpacingEm - baselineSpacingEm);
        const endsWithSep = tokens[i].kind === 'sep';
        const candidate = { count: i + 1, spacingEm: requiredSpacingEm, adjustment, endsWithSep };
        const within = requiredSpacingEm >= minSpacingEm && requiredSpacingEm <= maxSpacingEm;

        if (within) {
            if (!bestWithin || candidate.count > bestWithin.count ||
                (candidate.count === bestWithin.count && (candidate.adjustment < bestWithin.adjustment - 0.002 ||
                (Math.abs(candidate.adjustment - bestWithin.adjustment) <= 0.002 && candidate.endsWithSep && !bestWithin.endsWithSep)))) {
                bestWithin = candidate;
            }
        }

        if (!bestCandidate || candidate.adjustment < bestCandidate.adjustment - 0.002 ||
            (Math.abs(candidate.adjustment - bestCandidate.adjustment) <= 0.002 && candidate.endsWithSep && !bestCandidate.endsWithSep)) {
            bestCandidate = candidate;
        }
    }

    const chosen = bestWithin ?? bestCandidate;
    const finalTokens = chosen ? tokens.slice(0, chosen.count) : tokens;
    const finalSpacingEm = chosen
        ? Math.min(maxSpacingEm, Math.max(minSpacingEm, chosen.spacingEm))
        : baselineSpacingEm;
    const finalLetterSpacing = baseLetterSpacing.endsWith('em')
        ? `${finalSpacingEm.toFixed(3)}em`
        : baselineLetterSpacing;

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

    finalTokens.forEach(token => {
        const tspanStart = token.kind === 'author' ? authorTspanStart : bookTspanStart;
        textContent += `${tspanStart}${token.text}${endTspan}`;
    });

    const brandingText = `
        <text 
            font-family="${bookTitleFontFamily}" 
            font-size="${avgFontSize}" 
            font-weight="${bookTitleFontWeight}" 
            ${italicAttr(bookTitleFontItalic)}
            letter-spacing="${finalLetterSpacing}"
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
    const percentPx = Math.max(1, innerRadius * 1.8);
    const numberPx = Math.max(1, innerRadius * 1.6);
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
