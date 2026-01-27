/**
 * APR (Author Progress Report) Module
 * 
 * Dedicated renderer for shareable, spoiler-safe progress graphics.
 */

export { createAprSVG, type AprRenderOptions, type AprRenderResult } from './AprRenderer';
export { 
    APR_VIEW_MODE_LABELS,
    APR_COLORS,
    APR_TEXT_COLORS,
    type AprViewMode 
} from './AprConstants';
export { 
    APR_PRESETS,
    APR_SIZE_TO_PRESET,
    getAprPreset,
    type AprPreset,
    type AprPresetKey,
    type AprSize
} from './aprPresets';
export {
    computeAprLayout,
    CENTER_OPTICS,
    type AprLayoutSpec
} from './aprLayout';
export { APR_FONTS } from './AprLayoutConfig';
export { renderAprBranding, renderAprCenterPercent } from './AprBranding';
