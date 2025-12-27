/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

/**
 * Scene Title Auto-Expansion - Pure Calculation Functions
 * 
 * These pure functions handle the mathematics of scene redistribution when
 * a scene title is too long to fit in its allocated space.
 * 
 * Separated from DOM manipulation to enable unit testing and reuse.
 */

export const HOVER_EXPAND_FACTOR = 1.05;
export const SCENE_TITLE_INSET = 22;
export const TEXTPATH_START_NUDGE_RAD = 0.02;
export const TEXTPATH_START_OFFSET_PX = 4;
export const PADDING_PX = 8;

export interface SceneAngleData {
    id: string;
    startAngle: number;
    endAngle: number;
    innerRadius: number;
    outerRadius: number;
    isScene: boolean; // true for scenes, false for beat slices
}

export interface RedistributionResult {
    id: string;
    newStartAngle: number;
    newEndAngle: number;
}

/**
 * Calculate if a scene title needs expansion
 */
export function needsExpansion(
    textWidth: number,
    currentArcLength: number,
    midRadius: number
): boolean {
    const angularNudgePx = TEXTPATH_START_NUDGE_RAD * midRadius;
    const requiredArcPx = textWidth + PADDING_PX + TEXTPATH_START_OFFSET_PX + angularNudgePx;
    return currentArcLength < requiredArcPx;
}

/**
 * Calculate target angular size for an expanded scene
 */
export function calculateTargetSize(
    textWidth: number,
    midRadius: number
): number {
    const angularNudgePx = TEXTPATH_START_NUDGE_RAD * midRadius;
    const requiredArcPx = textWidth + PADDING_PX + TEXTPATH_START_OFFSET_PX + angularNudgePx;
    const targetArcPx = requiredArcPx * HOVER_EXPAND_FACTOR;
    return targetArcPx / midRadius;
}

/**
 * Calculate act boundaries based on act number
 */
export function getActBoundaries(actNumber: number, totalActs: number = 3): { start: number; end: number } {
    if (actNumber === 0) {
        // Chronologue mode: full 360° circle starting at top
        return {
            start: -Math.PI / 2,
            end: -Math.PI / 2 + (2 * Math.PI)
        };
    } else {
        const NUM_ACTS = Math.max(3, totalActs);
        return {
            start: (actNumber * 2 * Math.PI / NUM_ACTS) - Math.PI / 2,
            end: ((actNumber + 1) * 2 * Math.PI / NUM_ACTS) - Math.PI / 2
        };
    }
}

/**
 * Redistribute angles for scenes in an act when one is expanded
 */
export function redistributeAngles(
    elements: SceneAngleData[],
    hoveredId: string,
    targetSize: number,
    actStartAngle: number
): RedistributionResult[] {
    // Separate scenes from beat slices
    const scenes = elements.filter(e => e.isScene);
    const beats = elements.filter(e => !e.isScene);
    
    // Calculate beat space (beats keep original size)
    const totalBeatSpace = beats.reduce((sum, beat) => 
        sum + (beat.endAngle - beat.startAngle), 0);
    
    // Calculate total act space
    const totalActSpace = elements.reduce((sum, el) => 
        sum + (el.endAngle - el.startAngle), 0);
    
    // Space available for scenes after subtracting beat space
    const availableSceneSpace = totalActSpace - totalBeatSpace;
    const spaceForOtherScenes = availableSceneSpace - targetSize;
    const sizePerOtherScene = spaceForOtherScenes / (scenes.length - 1);
    
    // Redistribute elements maintaining their order
    const results: RedistributionResult[] = [];
    let currentAngle = actStartAngle;
    
    for (const element of elements) {
        let newStart = currentAngle;
        let newEnd: number;
        
        if (element.id === hoveredId) {
            // Expanded scene
            newEnd = currentAngle + targetSize;
        } else if (element.isScene) {
            // Other scenes (compressed)
            newEnd = currentAngle + sizePerOtherScene;
        } else {
            // Beat slice (keep original size)
            const originalSize = element.endAngle - element.startAngle;
            newEnd = currentAngle + originalSize;
        }
        
        results.push({
            id: element.id,
            newStartAngle: newStart,
            newEndAngle: newEnd
        });
        
        currentAngle = newEnd;
    }
    
    return results;
}

/**
 * Build SVG arc path for a scene cell
 */
export function buildArcPath(
    innerRadius: number,
    outerRadius: number,
    startAngle: number,
    endAngle: number
): string {
    const formatNumber = (n: number) => n.toFixed(6);
    
    const largeArcFlag = (endAngle - startAngle) > Math.PI ? 1 : 0;
    
    return `
        M ${formatNumber(innerRadius * Math.cos(startAngle))} ${formatNumber(innerRadius * Math.sin(startAngle))}
        L ${formatNumber(outerRadius * Math.cos(startAngle))} ${formatNumber(outerRadius * Math.sin(startAngle))}
        A ${formatNumber(outerRadius)} ${formatNumber(outerRadius)} 0 ${largeArcFlag} 1 ${formatNumber(outerRadius * Math.cos(endAngle))} ${formatNumber(outerRadius * Math.sin(endAngle))}
        L ${formatNumber(innerRadius * Math.cos(endAngle))} ${formatNumber(innerRadius * Math.sin(endAngle))}
        A ${formatNumber(innerRadius)} ${formatNumber(innerRadius)} 0 ${largeArcFlag} 0 ${formatNumber(innerRadius * Math.cos(startAngle))} ${formatNumber(innerRadius * Math.sin(startAngle))}
    `;
}

/**
 * Build SVG text path for a scene title
 */
export function buildTextPath(
    radius: number,
    startAngle: number,
    endAngle: number
): string {
    const formatNumber = (n: number) => n.toFixed(6);
    const textStart = startAngle + TEXTPATH_START_NUDGE_RAD;
    const largeArcFlag = (endAngle - textStart) > Math.PI ? 1 : 0;
    
    return `M ${formatNumber(radius * Math.cos(textStart))} ${formatNumber(radius * Math.sin(textStart))} A ${formatNumber(radius)} ${formatNumber(radius)} 0 ${largeArcFlag} 1 ${formatNumber(radius * Math.cos(endAngle))} ${formatNumber(radius * Math.sin(endAngle))}`;
}
