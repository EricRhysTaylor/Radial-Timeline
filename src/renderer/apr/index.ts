/**
 * APR (Author Progress Report) Module
 * 
 * Dedicated renderer for shareable, spoiler-safe progress graphics.
 */

export { createAprSVG, type AprRenderOptions, type AprRenderResult } from './AprRenderer';
export { 
    APR_VIEW_MODE_LABELS,
    type AprViewMode 
} from './AprConstants';
export { 
    APR_LAYOUT,
    getPreset, 
    APR_COLORS, 
    APR_TEXT_COLORS, 
    APR_FONTS,
    type AprSize 
} from './AprLayoutConfig';
export { renderAprBranding, renderAprCenterPercent } from './AprBranding';
