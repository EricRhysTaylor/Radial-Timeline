/**
 * Radial Timeline Plugin for Obsidian — Scene DOM Updater
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import type { TimelineItem } from '../../main';
import type { PluginRendererFacade } from '../../utils/sceneHelpers';

/**
 * Updates scene colors in the DOM without regenerating SVG
 * Used for dominant subplot changes
 */
export function updateSceneColors(
    svg: SVGSVGElement,
    plugin: PluginRendererFacade,
    changedScenes: TimelineItem[]
): boolean {
    try {
        const subplotColors = plugin.settings.subplotColors || [];
        const masterSubplotOrder = getMasterSubplotOrder(svg);
        
        let updated = false;
        
        changedScenes.forEach(scene => {
            if (!scene.path) return;
            
            // Find all scene groups for this path
            const encodedPath = encodeURIComponent(scene.path);
            const sceneGroups = svg.querySelectorAll(`[data-path="${encodedPath}"]`);
            
            sceneGroups.forEach(group => {
                // Get the subplot index
                const subplot = scene.subplot || 'Main Plot';
                const subplotIndex = masterSubplotOrder.indexOf(subplot);
                
                if (subplotIndex === -1) return;
                
                // Update the scene arc fill color
                const arc = group.querySelector('.rt-scene-arc');
                if (arc) {
                    const color = subplotColors[subplotIndex % subplotColors.length] || '#cccccc';
                    arc.setAttribute('fill', color);
                    updated = true;
                }
            });
        });
        
        return updated;
    } catch (error) {
        console.error('[SceneDOMUpdater] Failed to update scene colors:', error);
        return false;
    }
}

/**
 * Updates scene status classes (open/closed) in the DOM
 */
export function updateSceneOpenClasses(
    svg: SVGSVGElement,
    openScenePaths: Set<string>
): boolean {
    try {
        let updated = false;
        
        // Get all scene groups
        const sceneGroups = svg.querySelectorAll('.rt-scene-group');
        
        sceneGroups.forEach(group => {
            const encodedPath = group.getAttribute('data-path');
            if (!encodedPath) return;
            
            const path = decodeURIComponent(encodedPath);
            const isOpen = openScenePaths.has(path);
            
            // Update class
            if (isOpen && !group.classList.contains('is-open')) {
                group.classList.add('is-open');
                updated = true;
            } else if (!isOpen && group.classList.contains('is-open')) {
                group.classList.remove('is-open');
                updated = true;
            }
        });
        
        return updated;
    } catch (error) {
        console.error('[SceneDOMUpdater] Failed to update scene open classes:', error);
        return false;
    }
}

/**
 * Updates search match highlighting in the DOM
 */
export function updateSceneSearchHighlights(
    svg: SVGSVGElement,
    searchResults: Set<string>
): boolean {
    try {
        let updated = false;
        
        // Get all scene groups
        const sceneGroups = svg.querySelectorAll('.rt-scene-group');
        
        sceneGroups.forEach(group => {
            const encodedPath = group.getAttribute('data-path');
            if (!encodedPath) return;
            
            const path = decodeURIComponent(encodedPath);
            const isMatch = searchResults.has(path);
            
            // Update class
            if (isMatch && !group.classList.contains('is-search-match')) {
                group.classList.add('is-search-match');
                updated = true;
            } else if (!isMatch && group.classList.contains('is-search-match')) {
                group.classList.remove('is-search-match');
                updated = true;
            }
        });
        
        return updated;
    } catch (error) {
        console.error('[SceneDOMUpdater] Failed to update search highlights:', error);
        return false;
    }
}

/**
 * Helper: Extract master subplot order from SVG
 */
function getMasterSubplotOrder(svg: SVGSVGElement): string[] {
    const labels = svg.querySelectorAll('.rt-subplot-ring-label-text');
    return Array.from(labels)
        .map(label => label.getAttribute('data-subplot-name'))
        .filter((name): name is string => name !== null);
}

