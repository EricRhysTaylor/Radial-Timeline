/**
 * Radial Timeline Plugin for Obsidian — Subplot Label DOM Updater
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

/**
 * Updates subplot label text without regenerating
 * Used when mode changes and labels need to be updated (e.g., "ALL SCENES" vs "MAIN PLOT")
 */
export function updateSubplotLabels(
    svg: SVGSVGElement,
    newLabels: Map<string, string>
): boolean {
    try {
        let updated = false;
        
        newLabels.forEach((newText, subplotName) => {
            // Find label elements for this subplot
            const labelElements = svg.querySelectorAll(`[data-subplot-name="${subplotName}"] textPath`);
            
            labelElements.forEach(element => {
                const currentText = element.textContent || '';
                
                if (currentText !== newText) {
                    element.textContent = newText; // SAFE: textContent used for plain text
                    updated = true;
                }
            });
        });
        
        return updated;
    } catch (error) {
        console.error('[SubplotLabelDOMUpdater] Failed to update subplot labels:', error);
        return false;
    }
}

/**
 * Updates subplot label visibility based on mode
 */
export function updateSubplotLabelVisibility(
    svg: SVGSVGElement,
    visibleSubplots: Set<string>
): boolean {
    try {
        let updated = false;
        
        const labelGroups = svg.querySelectorAll('.rt-subplot-ring-label-text');
        
        labelGroups.forEach(group => {
            const subplotName = group.getAttribute('data-subplot-name');
            if (!subplotName) return;
            
            const shouldBeVisible = visibleSubplots.has(subplotName);
            const isCurrentlyVisible = group.getAttribute('opacity') !== '0';
            
            if (shouldBeVisible && !isCurrentlyVisible) {
                group.setAttribute('opacity', '1');
                updated = true;
            } else if (!shouldBeVisible && isCurrentlyVisible) {
                group.setAttribute('opacity', '0');
                updated = true;
            }
        });
        
        return updated;
    } catch (error) {
        console.error('[SubplotLabelDOMUpdater] Failed to update subplot label visibility:', error);
        return false;
    }
}

