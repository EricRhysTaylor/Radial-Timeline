/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

/**
 * Update scene title color in synopsis based on mode
 */
export function updateSynopsisTitleColor(synopsis: Element, sceneId: string, mode: string): void {
    const titleTspans = synopsis.querySelectorAll('.rt-scene-title-bold[data-item-type="title"]');
    if (titleTspans.length === 0) return;
    
    let color: string | null = null;
    
    if (mode === 'narrative' || mode === 'chronologue') {
        // Get the subplot color from the ring the scene is displayed in
        const sceneGroup = document.getElementById(sceneId)?.closest('.rt-scene-group') as HTMLElement | null;
        if (sceneGroup) {
            const subplotIndex = sceneGroup.getAttribute('data-subplot-index');
            if (subplotIndex) {
                const idx = parseInt(subplotIndex, 10) % 15;
                const varName = `--rt-subplot-colors-${idx}`;
                color = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
            }
        }
    } else if (mode === 'subplot') {
        // Use the publish stage color stored on synopsis
        color = synopsis.getAttribute('data-stage-color');
    }
    
    if (color) {
        titleTspans.forEach(tspan => {
            (tspan as SVGTSpanElement).style.setProperty('--rt-dynamic-color', color);
        });
    }
}
