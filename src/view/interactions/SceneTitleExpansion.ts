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
    const NUM_ACTS = Math.max(3, totalActs);
    return {
        start: (actNumber * 2 * Math.PI / NUM_ACTS) - Math.PI / 2,
        end: ((actNumber + 1) * 2 * Math.PI / NUM_ACTS) - Math.PI / 2
    };
}

/**
 * Redistribute angles for scenes in an act when one is expanded.
 *
 * All other scenes shrink equally to make room for the expanded scene.
 * Elements are packed from actStartAngle maintaining their original order.
 */
export function redistributeAngles(
    elements: SceneAngleData[],
    hoveredId: string,
    targetSize: number,
    actStartAngle: number,
    actEndAngle?: number
): RedistributionResult[] {
    // Separate scenes from beat slices
    const scenes = elements.filter(e => e.isScene);
    const beats = elements.filter(e => !e.isScene);

    // Calculate beat space (beats keep original size, but clamp if rounding would overflow the act)
    const rawBeatSpace = beats.reduce((sum, beat) => sum + (beat.endAngle - beat.startAngle), 0);

    // Calculate total act space using configured act boundaries when provided
    // This avoids accumulated rounding loss from per-scene data attributes.
    const totalActSpace = (typeof actEndAngle === 'number')
        ? (actEndAngle - actStartAngle)
        : elements.reduce((sum, el) => sum + (el.endAngle - el.startAngle), 0);

    // If beats would overrun the act span (rare), scale them down proportionally
    const beatScale = (rawBeatSpace > totalActSpace && rawBeatSpace > 0)
        ? (totalActSpace / rawBeatSpace)
        : 1;
    const totalBeatSpace = rawBeatSpace * beatScale;

    // Space available for scenes after subtracting beat space
    const availableSceneSpace = Math.max(totalActSpace - totalBeatSpace, 0);
    const safeTargetSize = Math.min(targetSize, availableSceneSpace);
    const otherSceneCount = Math.max(scenes.length - 1, 0);
    const spaceForOtherScenes = Math.max(availableSceneSpace - safeTargetSize, 0);
    const sizePerOtherScene = otherSceneCount > 0 ? (spaceForOtherScenes / otherSceneCount) : 0;

    // Redistribute elements maintaining their order
    const results: RedistributionResult[] = [];
    let currentAngle = actStartAngle;

    for (const element of elements) {
        let newStart = currentAngle;
        let newEnd: number;

        if (element.id === hoveredId) {
            // Expanded scene (bounded by available space in the act)
            newEnd = currentAngle + safeTargetSize;
        } else if (element.isScene) {
            // Other scenes (compressed)
            newEnd = currentAngle + sizePerOtherScene;
        } else {
            // Beat slice (keep original size, scaled only if beats would overflow the act)
            const originalSize = element.endAngle - element.startAngle;
            newEnd = currentAngle + (originalSize * beatScale);
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
    // Match renderer path shape (SceneArcs.sceneArcPath) to avoid post-hover gaps against act spokes.
    const formatNumber = (n: number) => Number(n.toFixed(2)).toString();
    const outerRadiusFmt = formatNumber(outerRadius);
    const innerRadiusFmt = formatNumber(innerRadius);
    const startCosOuter = formatNumber(outerRadius * Math.cos(startAngle));
    const startSinOuter = formatNumber(outerRadius * Math.sin(startAngle));
    const endCosOuter = formatNumber(outerRadius * Math.cos(endAngle));
    const endSinOuter = formatNumber(outerRadius * Math.sin(endAngle));
    const startCosInner = formatNumber(innerRadius * Math.cos(startAngle));
    const startSinInner = formatNumber(innerRadius * Math.sin(startAngle));
    const endCosInner = formatNumber(innerRadius * Math.cos(endAngle));
    const endSinInner = formatNumber(innerRadius * Math.sin(endAngle));

    // Keep large-arc flag at 0 (matches renderer) so geometry remains identical pre/post hover.
    return `
        M ${startCosInner} ${startSinInner}
        L ${startCosOuter} ${startSinOuter}
        A ${outerRadiusFmt} ${outerRadiusFmt} 0 0 1 ${endCosOuter} ${endSinOuter}
        L ${endCosInner} ${endSinInner}
        A ${innerRadiusFmt} ${innerRadiusFmt} 0 0 0 ${startCosInner} ${startSinInner}
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
