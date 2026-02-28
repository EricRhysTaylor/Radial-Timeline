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
 * Redistribute angles for scenes in an act when one is expanded.
 *
 * Uses an "anchored" approach: the hovered scene keeps its original start angle
 * and expands forward. Only elements AFTER the hovered scene are compressed.
 * Elements before it stay at their original positions.
 *
 * This prevents hover flickering: since the expanded scene's path always covers
 * its original angular range, the pointer (which entered via the original path)
 * remains inside the expanded path after redistribution.
 */
export function redistributeAngles(
    elements: SceneAngleData[],
    hoveredId: string,
    targetSize: number,
    actStartAngle: number,
    actEndAngle?: number
): RedistributionResult[] {
    const hoveredIdx = elements.findIndex(e => e.id === hoveredId);
    if (hoveredIdx === -1) {
        return elements.map(e => ({ id: e.id, newStartAngle: e.startAngle, newEndAngle: e.endAngle }));
    }

    const hovered = elements[hoveredIdx];

    // Total act space from authoritative boundaries
    const totalActSpace = (typeof actEndAngle === 'number')
        ? (actEndAngle - actStartAngle)
        : elements.reduce((sum, el) => sum + (el.endAngle - el.startAngle), 0);
    const effectiveActEnd = actStartAngle + totalActSpace;

    // Anchor: hovered scene keeps its original start angle, expands forward
    const hoveredNewStart = hovered.startAngle;
    const maxForwardSpace = effectiveActEnd - hoveredNewStart;
    const clampedTarget = Math.min(targetSize, maxForwardSpace);
    const hoveredNewEnd = hoveredNewStart + clampedTarget;

    // --- Elements AFTER the hovered scene: compress into remaining space ---
    const afterElements = elements.slice(hoveredIdx + 1);
    const spaceAfter = Math.max(effectiveActEnd - hoveredNewEnd, 0);

    const afterBeats = afterElements.filter(e => !e.isScene);
    const afterScenes = afterElements.filter(e => e.isScene);
    const afterBeatSpace = afterBeats.reduce((sum, e) => sum + (e.endAngle - e.startAngle), 0);
    const afterBeatScale = (afterBeatSpace > spaceAfter && afterBeatSpace > 0)
        ? (spaceAfter / afterBeatSpace) : 1;
    const afterTotalBeatSpace = afterBeatSpace * afterBeatScale;
    const afterSceneSpace = Math.max(spaceAfter - afterTotalBeatSpace, 0);
    const afterSceneSize = afterScenes.length > 0 ? (afterSceneSpace / afterScenes.length) : 0;

    // --- Build results ---
    const results: RedistributionResult[] = [];

    // Before hovered: keep original positions (no path shift → no spurious hover)
    for (let i = 0; i < hoveredIdx; i++) {
        results.push({
            id: elements[i].id,
            newStartAngle: elements[i].startAngle,
            newEndAngle: elements[i].endAngle
        });
    }

    // Hovered scene: anchored at original start
    results.push({
        id: hovered.id,
        newStartAngle: hoveredNewStart,
        newEndAngle: hoveredNewEnd
    });

    // After hovered: compressed into remaining space
    let currentAngle = hoveredNewEnd;
    for (let i = hoveredIdx + 1; i < elements.length; i++) {
        const el = elements[i];
        let size: number;
        if (el.isScene) {
            size = afterSceneSize;
        } else {
            size = (el.endAngle - el.startAngle) * afterBeatScale;
        }
        results.push({
            id: el.id,
            newStartAngle: currentAngle,
            newEndAngle: currentAngle + size
        });
        currentAngle += size;
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
