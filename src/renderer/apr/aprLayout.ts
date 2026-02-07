/**
 * APR derived layout - compute all sizing from a minimal preset.
 */

import type { AprPreset } from './aprPresets';
import { APR_BASE_RADII, APR_SIZE_SCALES, APR_THUMB_RADII, APR_BRANDING_TUNING } from './AprConstants';

export type AprData = {
    percent?: number;
};

export type AprLayoutSpec = {
    preset: AprPreset;
    outerPx: number;
    outerR: number;
    safeInset: number;
    textBand: number;
    ringBand: number;
    ringOuterR: number;
    ringInnerR: number;
    ringThickness: number;
    textR: number | null;
    strokes: {
        ring: number;
        divider: number;
        spoke: number;
        actSpoke: number;
    };
    patternScale: number;
    branding: {
        radius: number | null;
        fontSize: number;
        letterSpacing: string;
    };
    badge: {
        fontSize: number;
        letterSpacing: string;
        countdownLetterSpacing: string;
    };
    centerLabel: {
        enabled: boolean;
        numberPx: number;
        percentPx: number;
        dyPx: number;
        percentDxPx: number;
        percentBaselineShiftPx: number;
        letterSpacing: string;
    };
};

// =============================================================================
// GLOBAL RATIOS (no per-preset pixel values)
// =============================================================================

export const kInset = 0.05;
export const kTextBand = 0.12;
export const kRingStroke = 0.01;
export const kDividerStroke = 0.004;
export const kCenterNumber = 0.24;
export const kPercent = 0.5;

export const CENTER_OPTICS = {
    yShiftEm: -0.04,
    percentDxEm: 0.08,
    percentBaselineShiftEm: 0.12,
} as const;

// =============================================================================
// HELPERS
// =============================================================================

const px = (outerPx: number, ratio: number) => outerPx * ratio;
const roundToHalf = (value: number) => Math.round(value * 2) / 2;
const stroke = (outerPx: number, ratio: number) => roundToHalf(outerPx * ratio);
const clampPx = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

// =============================================================================
// LAYOUT
// =============================================================================

export function computeAprLayout(preset: AprPreset, data: AprData = {}): AprLayoutSpec {
    const outerPx = preset.outerPx;
    const outerR = outerPx / 2;
    const safeInset = px(outerPx, kInset);
    const textBand = preset.enableText ? px(outerPx, kTextBand) : 0;
    const sizeScale = APR_SIZE_SCALES[preset.key as keyof typeof APR_SIZE_SCALES] ?? 1;
    const radii = preset.key === 'xs100'
        ? APR_THUMB_RADII
        : {
            inner: APR_BASE_RADII.inner * sizeScale,
            outer: APR_BASE_RADII.outer * sizeScale,
            text: APR_BASE_RADII.text * sizeScale,
        };
    const ringOuterR = radii.outer;
    const ringInnerR = radii.inner;
    const ringThickness = ringOuterR - ringInnerR;
    const ringBand = ringOuterR * 2;
    const textR = preset.enableText ? APR_BASE_RADII.text * sizeScale : null;

    // Fixed stroke widths as requested: 1px for 150px, 2px for 300px+
    const fixedStroke = outerPx <= 150 ? 1 : 2;

    const ringStroke = fixedStroke;
    const dividerStroke = fixedStroke;
    const spokeWidth = fixedStroke;
    const actSpokeWidth = fixedStroke;

    const patternScale = preset.density ?? (outerPx / 300) * 0.4;

    const brandingFontSize = preset.enableText ? clampPx(textBand * kPercent, 8, 42) : 0;
    const badgeFontSize = clampPx(outerPx * (kInset + kDividerStroke), 6, 32);

    const percentValue = Number.isFinite(data.percent) ? (data.percent as number) : 0;
    const percentText = String(Math.round(percentValue));
    const charCount = Math.max(1, percentText.length);
    const baseCenterNumberPx = clampPx(outerPx * kCenterNumber, 18, 120);
    const innerDiameter = ringInnerR * 2;
    const estimatedWidth = charCount * baseCenterNumberPx * kPercent;
    const fitScale = (innerDiameter > 0 && estimatedWidth > 0)
        ? Math.min(1, innerDiameter / estimatedWidth)
        : 1;
    const centerNumberPx = preset.enableCenterLabel
        ? clampPx(baseCenterNumberPx * fitScale, 18, 120)
        : 0;
    // % symbol sized to fill (and slightly overflow) the inner circle
    const centerPercentPx = preset.enableCenterLabel
        ? innerDiameter * 1.1
        : 0;

    const centerDyPx = preset.enableCenterLabel ? centerNumberPx * CENTER_OPTICS.yShiftEm : 0;
    // % symbol centered — no horizontal offset or baseline shift
    const percentDxPx = 0;
    const percentBaselineShiftPx = 0;

    return {
        preset,
        outerPx,
        outerR,
        safeInset,
        textBand,
        ringBand,
        ringOuterR,
        ringInnerR,
        ringThickness,
        textR,
        strokes: {
            ring: ringStroke,
            divider: dividerStroke,
            spoke: spokeWidth,
            actSpoke: actSpokeWidth,
        },
        patternScale,
        branding: {
            radius: textR,
            fontSize: brandingFontSize,
            letterSpacing: APR_BRANDING_TUNING.baseLetterSpacing,
        },
        badge: {
            fontSize: badgeFontSize,
            letterSpacing: '0.04em',
            countdownLetterSpacing: '0.04em',
        },
        centerLabel: {
            enabled: preset.enableCenterLabel,
            numberPx: centerNumberPx,
            percentPx: centerPercentPx,
            dyPx: centerDyPx,
            percentDxPx,
            percentBaselineShiftPx,
            letterSpacing: '-0.04em',
        },
    };
}
