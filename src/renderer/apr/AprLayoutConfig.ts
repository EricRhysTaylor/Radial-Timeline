/**
 * APR Layout Configuration - derived layout shim (deprecated).
 * Use aprPresets + aprLayout directly for new work.
 */

import { computeAprLayout, type AprLayoutSpec } from './aprLayout';
import { getAprPreset, type AprSize } from './aprPresets';

export { APR_COLORS, APR_TEXT_COLORS } from './AprConstants';
export type { AprSize, AprLayoutSpec };

export const APR_LAYOUT: Record<AprSize, AprLayoutSpec> = {
    thumb: computeAprLayout(getAprPreset('thumb'), { percent: 0 }),
    small: computeAprLayout(getAprPreset('small'), { percent: 0 }),
    medium: computeAprLayout(getAprPreset('medium'), { percent: 0 }),
    large: computeAprLayout(getAprPreset('large'), { percent: 0 }),
};

export function getPreset(size: AprSize): AprLayoutSpec {
    return APR_LAYOUT[size];
}

// =============================================================================
// FONTS - Easy to swap
// =============================================================================

export const APR_FONTS = {
    // Primary branding font (book title, author, badge text)
    branding: "var(--font-interface, system-ui, sans-serif)",

    // Center percent font
    percent: "var(--font-interface, system-ui, sans-serif)",

    // Badge font (set to same as branding for consistency, or use pixel font)
    rtBadge: "var(--font-interface, system-ui, sans-serif)",
    // Alternative: "'04b03b', monospace" for pixel font
} as const;
