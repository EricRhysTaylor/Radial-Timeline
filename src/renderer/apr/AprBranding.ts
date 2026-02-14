/**
 * APR Branding - Perimeter text rendering for Author Progress Reports
 * 
 * Renders the repeating book title/author text around the outer edge.
 */

import { APR_TEXT_COLORS, APR_BRANDING_TUNING, APR_CENTER_METRIC } from './AprConstants';
import { computeAprLayout, type AprLayoutSpec } from './aprLayout';
import { getAprPreset, type AprSize } from './aprPresets';

const cssVar = (name: string, fallback: string) => `var(${name}-override, var(${name}, ${fallback}))`;
const italicAttr = (isItalic?: boolean) => (isItalic ? 'font-style="italic"' : ''); // SAFE: inline style used for SVG font-style attribute

// Portable SVG helpers: bypass CSS vars for standalone exports (Figma, Illustrator, etc.)
const resolveColor = (portable: boolean) =>
    (name: string, fallback: string): string =>
        portable ? fallback : cssVar(name, fallback);

const resolveOpacity = (portable: boolean) =>
    (varExpr: string, fallback: string): string =>
        portable ? fallback : varExpr;

const escapeXmlAttr = (value: string): string =>
    value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

const escapeXmlText = (value: string): string =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

type TextBoxMetrics = {
    ascent: number;
    descent: number;
};

let aprMetricsCanvas: HTMLCanvasElement | null | undefined;

function getAprMetricsContext(): CanvasRenderingContext2D | null {
    if (typeof document === 'undefined') return null;
    if (aprMetricsCanvas === undefined) {
        aprMetricsCanvas = document.createElement('canvas');
    }
    return aprMetricsCanvas?.getContext('2d') ?? null;
}

function quoteFontFamily(fontFamily: string): string {
    const trimmed = fontFamily.trim();
    if (!trimmed) return 'sans-serif';
    return trimmed
        .split(',')
        .map(part => part.trim())
        .filter(Boolean)
        .map(part => {
            if (part.startsWith('"') || part.startsWith("'")) return part;
            return /\s/.test(part) ? `"${part}"` : part;
        })
        .join(', ');
}

function measureTextBoxMetrics(
    sample: string,
    fontFamily: string,
    fontWeight: number,
    fontItalic: boolean,
    fontSize: number
): TextBoxMetrics | null {
    const ctx = getAprMetricsContext();
    if (!ctx) return null;

    const family = quoteFontFamily(fontFamily);
    ctx.font = `${fontItalic ? 'italic' : 'normal'} ${fontWeight} ${fontSize}px ${family}, sans-serif`;

    const metrics = ctx.measureText(sample || '0');
    const actualAscent = Number(metrics.actualBoundingBoxAscent ?? 0);
    const actualDescent = Number(metrics.actualBoundingBoxDescent ?? 0);
    if (actualAscent > 0 || actualDescent > 0) {
        return {
            ascent: actualAscent,
            descent: actualDescent
        };
    }

    const emAscent = Number((metrics as TextMetrics & { emHeightAscent?: number }).emHeightAscent ?? 0);
    const emDescent = Number((metrics as TextMetrics & { emHeightDescent?: number }).emHeightDescent ?? 0);
    if (emAscent > 0 || emDescent > 0) {
        return {
            ascent: emAscent,
            descent: emDescent
        };
    }

    return null;
}

function resolvePortableBaselineY(
    centerY: number,
    text: string,
    fontFamily: string,
    fontWeight: number,
    fontItalic: boolean,
    fontSize: number
): number {
    const measured = measureTextBoxMetrics(text, fontFamily, fontWeight, fontItalic, fontSize);
    if (measured) {
        const geometricOffset = (measured.ascent - measured.descent) / 2;
        return centerY + geometricOffset + (fontSize * APR_CENTER_METRIC.baselineOpticalShiftEm);
    }
    return centerY + (fontSize * APR_CENTER_METRIC.baselineFallbackEm);
}

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
    // Portable SVG mode
    portableSvg?: boolean;
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
        authorNameFontFamily = 'Inter', authorNameFontWeight = 400, authorNameFontItalic = false, authorNameFontSize,
        portableSvg = false
    } = options;
    
    const color = resolveColor(portableSvg);
    const resolvedLayout = options.layout ?? computeAprLayout(getAprPreset(size), { percent: 0 });
    // Use the actual text radius for accurate circumference calculation
    const brandingRadius = resolvedLayout.branding.radius ?? resolvedLayout.ringOuterR;
    if (!resolvedLayout.preset.enableText || !brandingRadius) return '';
    const { fontSize: brandingFontSize, letterSpacing: brandingLetterSpacing } = resolvedLayout.branding;

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
    const bookTitleEscaped = escapeXmlText(bookTitleUpper);
    const authorNameEscaped = escapeXmlText(authorNameUpper);
    const separatorEscaped = escapeXmlText(separator);

    // Calculate exact circumference
    const circumference = 2 * Math.PI * brandingRadius;

    const hasAuthor = authorNameUpper.trim().length > 0;
    const avgFontSize = hasAuthor ? (bookTitleSize + authorNameSize) / 2 : bookTitleSize;
    const baseLetterSpacing = brandingLetterSpacing.trim();
    const baseSpacingEm = baseLetterSpacing.endsWith('em') ? Number.parseFloat(baseLetterSpacing) : 0;
    const spacingEm = Number.isFinite(baseSpacingEm) ? baseSpacingEm : 0;
    // 0.55 is a better estimate for uppercase letters than 0.5
    const baseCharWidth = avgFontSize * 0.55;

    const unitPattern = hasAuthor
        ? `${bookTitleUpper}${separator}${authorNameUpper}${separator}`
        : `${bookTitleUpper}${separator}`;

    const estimateTextWidth = (text: string) => {
        const charCount = Math.max(1, text.length);
        const spacingPx = spacingEm * avgFontSize;
        return charCount * baseCharWidth + Math.max(0, charCount - 1) * spacingPx;
    };

    let repeats = 1;
    const canMeasure = typeof document !== 'undefined' && typeof window !== 'undefined';
    let measuredUnitWidth: number | null = null;
    if (canMeasure) {
        try {
            const span = document.createElement('span');
            const inlineStyle = [
                'position:absolute',
                'visibility:hidden',
                'white-space:nowrap',
                `font-family:${bookTitleFontFamily}`,
                `font-weight:${bookTitleFontWeight}`,
                `font-size:${avgFontSize}px`,
                `letter-spacing:${brandingLetterSpacing}`,
                `font-style:${bookTitleFontItalic ? 'italic' : 'normal'}`
            ].join(';');
            span.setAttribute('style', inlineStyle);
            span.textContent = unitPattern;
            document.body.appendChild(span);
            // Use actual measured width without inflation factor
            const unitWidth = span.getBoundingClientRect().width;
            document.body.removeChild(span);
            if (unitWidth > 0) {
                measuredUnitWidth = unitWidth;
            }
        } catch {
            // fall back to headless estimate
        }
    }
    const unitWidth = measuredUnitWidth ?? estimateTextWidth(unitPattern);
    let safeUnitWidth = unitWidth;
    if (unitWidth > 0) {
        // Inflate measured width by safety buffer for font rendering differences
        safeUnitWidth = unitWidth * APR_BRANDING_TUNING.measurementSafetyBuffer;

        // Use floor to get complete pattern repeats only (never cut mid-word)
        repeats = Math.max(2, Math.floor(circumference / safeUnitWidth));
    }

    // Calculate the gap left after complete pattern repeats using the SAFE width
    // This ensures we don't add too much spacing which would cause overlap
    const totalTextWidth = repeats * safeUnitWidth;
    const gap = circumference - totalTextWidth;
    const totalChars = repeats * unitPattern.length;

    // Parse limits from tuning config
    const minSpacingEm = Number.parseFloat(APR_BRANDING_TUNING.minLetterSpacing) || 0;
    const maxSpacingEm = Number.parseFloat(APR_BRANDING_TUNING.maxLetterSpacing) || 1;

    // Convert base letter-spacing from em to px, add gap distribution, convert back
    const baseSpacingPx = spacingEm * avgFontSize;
    const additionalSpacingPerChar = totalChars > 1 ? gap / totalChars : 0;
    const adjustedSpacingPx = baseSpacingPx + additionalSpacingPerChar;
    const rawAdjustedEm = adjustedSpacingPx / avgFontSize;

    // Clamp the final spacing to the user-defined range
    const clampedEm = Math.max(minSpacingEm, Math.min(maxSpacingEm, rawAdjustedEm));
    const adjustedLetterSpacing = `${clampedEm.toFixed(4)}em`;



    // Start at beginning of path so text fills the full circle
    // (startOffset > 0 would leave a gap since textPath doesn't loop)
    const startOffset = '0%';

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
    const bookTspanStart = `<tspan fill="${color('--apr-book-title-color', bookColor)}" font-family="${escapeXmlAttr(bookTitleFontFamily)}" font-weight="${bookTitleFontWeight}" font-size="${bookTitleSize}" ${italicAttr(bookTitleFontItalic)}>`;
    const authorTspanStart = `<tspan fill="${color('--apr-author-color', authColor)}" font-family="${escapeXmlAttr(authorNameFontFamily)}" font-weight="${authorNameFontWeight}" font-size="${authorNameSize}" ${italicAttr(authorNameFontItalic)}>`;
    const endTspan = `</tspan>`;

    for (let i = 0; i < repeats; i += 1) {
        textContent += `${bookTspanStart}${bookTitleEscaped}${endTspan}`;
        textContent += `${bookTspanStart}${separatorEscaped}${endTspan}`;
        if (hasAuthor) {
            textContent += `${authorTspanStart}${authorNameEscaped}${endTspan}`;
            textContent += `${bookTspanStart}${separatorEscaped}${endTspan}`;
        }
    }

    // Build the SVG text element - IMPORTANT: minimize whitespace since xml:space="preserve"
    // causes all whitespace to be rendered as actual space characters on the path
    const brandingText = `<text font-family="${escapeXmlAttr(bookTitleFontFamily)}" font-size="${avgFontSize}" font-weight="${bookTitleFontWeight}" ${italicAttr(bookTitleFontItalic)} letter-spacing="${adjustedLetterSpacing}" xml:space="preserve"><textPath href="#${circlePathId}" startOffset="${startOffset}">${textContent}</textPath></text>`;



    // Large clickable hotspot covering the entire timeline for author URL
    // Place it behind everything but in front of background
    const timelineHotspot = authorUrl?.trim() ? `
        <a href="${escapeXmlAttr(authorUrl)}" target="_blank" rel="noopener" class="apr-timeline-hotspot">
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
    badgeColor?: string;
    countdownColor?: string;
    rtAttributionColor?: string;
    // Portable SVG mode
    portableSvg?: boolean;
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
        rtBadgeFontSize,
        badgeColor,
        countdownColor,
        rtAttributionColor,
        portableSvg = false
    } = options;

    if (!showStageBadge && !showRtAttribution) return '';

    const color = resolveColor(portableSvg);
    const opacity = resolveOpacity(portableSvg);

    const resolvedLayout = options.layout ?? computeAprLayout(getAprPreset(size), { percent: 0 });
    if (!resolvedLayout.preset.enableText) return '';

    const half = resolvedLayout.outerPx / 2;
    const badgeSize = rtBadgeFontSize ?? resolvedLayout.badge.fontSize;
    const stageText = getStageBadgeText(resolvedLayout, stageLabel);
    const stageTextEscaped = escapeXmlText(stageText);
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
    const stageFill = color('--apr-stage-badge-color', badgeColor || APR_TEXT_COLORS.primary);
    const stageOpacity = opacity('var(--apr-stage-badge-opacity, 0.88)', '0.88');
    const countdownFill = color('--apr-countdown-color', countdownColor || badgeColor || APR_TEXT_COLORS.primary);
    const countdownOpacity = opacity('var(--apr-countdown-opacity, 0.7)', '0.7');
    const rtFill = color('--apr-rt-attrib-color', rtAttributionColor || badgeColor || APR_TEXT_COLORS.primary);
    const rtOpacity = opacity('var(--apr-rt-attrib-opacity, 0.35)', '0.35');
    const badgeFontFamilyEscaped = escapeXmlAttr(rtBadgeFontFamily);

    const stageBadge = showStageBadge ? `
        <text 
            class="apr-stage-badge__text"
            x="${stageX.toFixed(2)}" 
            y="${stageY.toFixed(2)}" 
            text-anchor="end" 
            dominant-baseline="text-after-edge"
            font-family="${badgeFontFamilyEscaped}" 
            font-size="${badgeSize}" 
            font-weight="${rtBadgeFontWeight}"
            ${italicAttr(rtBadgeFontItalic)}
            letter-spacing="${stageLetterSpacing}"
            fill="${stageFill}"
            opacity="${stageOpacity}">
            ${stageTextEscaped}
        </text>
    ` : '';

    const countdown = revealCountdownDays && revealCountdownDays > 0 && showStageBadge ? `
        <text
            class="apr-reveal-countdown"
            x="${countdownX.toFixed(2)}"
            y="${stageY.toFixed(2)}"
            text-anchor="end"
            dominant-baseline="text-after-edge"
            font-family="${badgeFontFamilyEscaped}"
            font-size="${countdownFontSize}"
            font-weight="${rtBadgeFontWeight}"
            ${italicAttr(rtBadgeFontItalic)}
            letter-spacing="${countdownLetterSpacing}"
            fill="${countdownFill}"
            opacity="${countdownOpacity}">
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
                font-family="${badgeFontFamilyEscaped}" 
                font-size="${Math.max(6, Math.round(badgeSize * 0.75))}" 
                font-weight="${rtBadgeFontWeight}"
                ${italicAttr(rtBadgeFontItalic)}
                fill="${rtFill}"
                opacity="${rtOpacity}">
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
    percentNumberFontSize1Digit?: number;
    percentNumberFontSize2Digit?: number;
    percentNumberFontSize3Digit?: number;
    // Portable SVG mode
    portableSvg?: boolean;
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

    const portableSvg = options?.portableSvg ?? false;
    const color = resolveColor(portableSvg);

    // Fallback to Press stage green if colors not provided
    const defaultColor = '#6FB971';
    const numColor = numberColor || defaultColor;
    const symColor = symbolColor || defaultColor;

    const valueText = String(Math.round(percent));
    const digitMatches = valueText.match(/\d/g);
    const digitCount = digitMatches ? digitMatches.length : 1;
    const digits: 1 | 2 | 3 = digitCount <= 1 ? 1 : digitCount === 2 ? 2 : 3;
    const sizeOverride = digits === 1
        ? options?.percentNumberFontSize1Digit
        : digits === 2
            ? options?.percentNumberFontSize2Digit
            : options?.percentNumberFontSize3Digit;
    const baseNumberPx = layout.centerLabel.numberPx;
    const numberPx = Math.max(1, sizeOverride ?? baseNumberPx);
    const scaleRatio = baseNumberPx > 0 ? numberPx / baseNumberPx : 1;
    const percentPx = Math.max(1, layout.centerLabel.percentPx * APR_CENTER_METRIC.percentSizeScale);
    const centerDy = layout.centerLabel.dyPx * scaleRatio;
    const numberWidthPx = numberPx * APR_CENTER_METRIC.digitWidthEm * digits;
    const percentGapPx = numberPx * APR_CENTER_METRIC.percentGapEm;
    const numberX = APR_CENTER_METRIC.numberOpticalNudgeByDigitsPx[digits];
    const percentOffsetPx = ((numberWidthPx / 2) + percentGapPx) * APR_CENTER_METRIC.percentAnchorFactor;
    const percentX = numberX + percentOffsetPx;
    const fontFamily = APR_CENTER_METRIC.fontFamily;
    const fontFamilyEscaped = escapeXmlAttr(fontFamily);
    const numberY = resolvePortableBaselineY(
        centerDy + APR_CENTER_METRIC.numberDyPx,
        valueText,
        fontFamily,
        APR_CENTER_METRIC.numberWeight,
        false,
        numberPx
    );
    const percentY = resolvePortableBaselineY(
        APR_CENTER_METRIC.percentDyPx + layout.centerLabel.percentBaselineShiftPx + APR_CENTER_METRIC.percentBaselineShiftPx,
        '%',
        fontFamily,
        APR_CENTER_METRIC.percentWeight,
        false,
        percentPx
    );

    return `
        <g class="apr-center-percent" transform="translate(0 0)">
            <text 
                x="${percentX}"
                y="${percentY}"
                text-anchor="middle"
                font-family="${fontFamilyEscaped}"
                font-weight="${APR_CENTER_METRIC.percentWeight}"
                font-size="${percentPx}"
                fill="${color('--apr-percent-symbol-color', symColor)}"
                fill-opacity="0.3">
                %
            </text>
            <text 
                x="${numberX}"
                y="${numberY}"
                text-anchor="middle"
                font-family="${fontFamilyEscaped}"
                font-weight="${APR_CENTER_METRIC.numberWeight}"
                font-size="${numberPx}"
                letter-spacing="${layout.centerLabel.letterSpacing}"
                fill="${color('--apr-percent-number-color', numColor)}">
                ${valueText}
            </text>
        </g>
    `;
}
