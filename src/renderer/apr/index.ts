/**
 * APR (Author Progress Report) Module
 * 
 * Dedicated renderer for shareable, spoiler-safe progress graphics.
 */

export { createAprSVG, type AprRenderOptions, type AprRenderResult } from './AprRenderer';
export { 
    APR_SIZE_PRESETS, 
    APR_VIEW_MODE_LABELS,
    type AprSize, 
    type AprViewMode 
} from './AprConstants';
export { renderAprBranding, renderAprCenterPercent } from './AprBranding';
