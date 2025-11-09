/**
 * Radial Timeline Plugin for Obsidian — Number Square DOM Updater
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import type { Scene } from '../../main';
import type { PluginRendererFacade } from '../../utils/sceneHelpers';
import { getSceneState, buildSquareClasses, buildTextClasses } from '../../utils/sceneHelpers';

/**
 * Updates number square colors and classes without regenerating
 * Used for status changes, AI grade updates, etc.
 */
export function updateNumberSquareStates(
    svg: SVGSVGElement,
    plugin: PluginRendererFacade,
    scenes: Scene[]
): boolean {
    try {
        let updated = false;
        
        scenes.forEach(scene => {
            if (!scene.path) return;
            
            const encodedPath = encodeURIComponent(scene.path);
            
            // Find all number squares for this scene
            const sceneGroups = svg.querySelectorAll(`[data-path="${encodedPath}"]`);
            
            sceneGroups.forEach(group => {
                // Find the number square within this group
                const numberSquare = group.querySelector('.rt-number-square');
                const numberText = group.querySelector('.rt-number-text');
                
                if (!numberSquare || !numberText) return;
                
                // Get current state
                const { isSceneOpen, isSearchMatch, hasEdits } = getSceneState(scene, plugin);
                
                // Build new classes
                const newSquareClasses = buildSquareClasses(isSceneOpen, isSearchMatch, hasEdits);
                let newTextClasses = buildTextClasses(isSceneOpen, isSearchMatch, hasEdits);
                
                // Add AI grade if enabled
                if (plugin.settings.enableAiSceneAnalysis) {
                    // Try to extract grade from existing class
                    const existingClasses = numberText.getAttribute('class') || '';
                    const gradeMatch = existingClasses.match(/rt-grade-([A-F])/);
                    if (gradeMatch) {
                        newTextClasses += ` rt-grade-${gradeMatch[1]}`;
                    }
                }
                
                // Update square classes
                const currentSquareClasses = numberSquare.getAttribute('class');
                if (currentSquareClasses !== newSquareClasses) {
                    numberSquare.setAttribute('class', newSquareClasses);
                    updated = true;
                }
                
                // Update text classes
                const currentTextClasses = numberText.getAttribute('class');
                if (currentTextClasses !== newTextClasses) {
                    numberText.setAttribute('class', newTextClasses);
                    updated = true;
                }
            });
        });
        
        return updated;
    } catch (error) {
        console.error('[NumberSquareDOMUpdater] Failed to update number squares:', error);
        return false;
    }
}

/**
 * Updates AI grade colors on number squares
 */
export function updateNumberSquareGrades(
    svg: SVGSVGElement,
    sceneGrades: Map<string, string>
): boolean {
    try {
        let updated = false;
        
        sceneGrades.forEach((grade, sceneId) => {
            // Find the number text element by scene ID
            const numberText = svg.querySelector(`#${sceneId} .rt-number-text`);
            if (!numberText) return;
            
            const currentClasses = numberText.getAttribute('class') || '';
            
            // Remove old grade classes
            const withoutGrade = currentClasses.replace(/\s*rt-grade-[A-F]/g, '');
            
            // Add new grade class
            const newClasses = `${withoutGrade} rt-grade-${grade}`.trim();
            
            if (currentClasses !== newClasses) {
                numberText.setAttribute('class', newClasses);
                updated = true;
            }
        });
        
        return updated;
    } catch (error) {
        console.error('[NumberSquareDOMUpdater] Failed to update grades:', error);
        return false;
    }
}

