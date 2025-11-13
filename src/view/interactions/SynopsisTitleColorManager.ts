/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

/**
 * Manages dynamic scene title text colors in synopsis based on mode and hover context
 */

/**
 * Get the color for the first subplot in the ordered subplot list
 * Uses the same logic as subplot coloring in synopsis
 */
function getFirstSubplotColor(synopsis: Element, sceneId: string): string | null {
    // Find the subplot metadata text element
    const subplotText = synopsis.querySelector('.rt-metadata-text tspan[data-item-type="subplot"]');
    if (!subplotText) return null;
    
    // Get the color from the CSS custom property
    const subplotTspan = subplotText as SVGTSpanElement;
    const color = subplotTspan.style.getPropertyValue('--rt-dynamic-color');
    if (color && color.trim()) return color.trim();
    
    // Fallback: try to extract from the subplot label
    try {
        const sceneGroup = document.getElementById(sceneId)?.closest('.rt-scene-group') as HTMLElement | null;
        if (sceneGroup) {
            const idxAttr = sceneGroup.getAttribute('data-subplot-index');
            if (idxAttr) {
                const idx = Math.max(0, parseInt(idxAttr, 10)) % 15;
                const varName = `--rt-subplot-colors-${idx}`;
                const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
                if (value) return value;
            }
        }
    } catch {}
    
    return null;
}

/**
 * Get the publish stage color from CSS variables
 */
function getPublishStageColor(stage: string): string {
    // Normalize stage name
    const normalizedStage = stage || 'Zero';
    const varName = `--rt-publishStageColors-${normalizedStage}`;
    const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    return value || '#808080';
}

/**
 * Extract publish stage from scene YAML via synopsis data attribute
 */
function getPublishStageFromSynopsis(synopsis: Element): string {
    const scenePath = synopsis.getAttribute('data-for-scene');
    if (!scenePath) return 'Zero';
    
    // Try to find the scene group with this ID
    try {
        const sceneGroup = document.getElementById(scenePath)?.closest('.rt-scene-group') as HTMLElement | null;
        if (sceneGroup) {
            const pathAttr = sceneGroup.getAttribute('data-path');
            if (pathAttr) {
                const decodedPath = decodeURIComponent(pathAttr);
                // Get file from vault to read frontmatter
                const app = (window as any).app;
                if (app?.vault && app?.metadataCache) {
                    const file = app.vault.getAbstractFileByPath(decodedPath);
                    if (file) {
                        const cache = app.metadataCache.getFileCache(file);
                        const fm = cache?.frontmatter;
                        if (fm && fm['Publish Stage']) {
                            return String(fm['Publish Stage']);
                        }
                    }
                }
            }
        }
    } catch {}
    
    return 'Zero';
}

/**
 * Update scene title color in synopsis based on mode
 * @param synopsis - The synopsis SVG group element
 * @param sceneId - The scene ID for looking up metadata
 * @param mode - Current timeline mode ('narrative', 'chronologue', 'subplot')
 */
export function updateSynopsisTitleColor(synopsis: Element, sceneId: string, mode: string): void {
    // Find all title tspans in the synopsis
    const titleTspans = synopsis.querySelectorAll('.rt-scene-title-bold[data-item-type="title"]');
    if (titleTspans.length === 0) return;
    
    let titleColor: string | null = null;
    
    // Determine color based on mode
    if (mode === 'narrative' || mode === 'chronologue') {
        // Use subplot color from first subplot in ordered list
        titleColor = getFirstSubplotColor(synopsis, sceneId);
    } else if (mode === 'subplot') {
        // Use publish stage color
        const stage = getPublishStageFromSynopsis(synopsis);
        titleColor = getPublishStageColor(stage);
    }
    
    // Apply the color to all title tspans if we found one
    if (titleColor) {
        titleTspans.forEach(tspan => {
            (tspan as SVGTSpanElement).style.setProperty('--rt-dynamic-color', titleColor);
        });
    }
}

/**
 * Reset scene title color to default (publish stage color)
 * @param synopsis - The synopsis SVG group element
 */
export function resetSynopsisTitleColor(synopsis: Element): void {
    // Find all title tspans in the synopsis
    const titleTspans = synopsis.querySelectorAll('.rt-scene-title-bold[data-item-type="title"]');
    if (titleTspans.length === 0) return;
    
    // Get the original publish stage color from CSS variable
    // The default is set via --rt-max-publish-stage-color in styles.css
    const defaultColor = getComputedStyle(document.documentElement).getPropertyValue('--rt-max-publish-stage-color').trim();
    
    if (defaultColor) {
        titleTspans.forEach(tspan => {
            (tspan as SVGTSpanElement).style.setProperty('--rt-dynamic-color', defaultColor);
        });
    }
}

