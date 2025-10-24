/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

/**
 * Rendering Utilities
 * 
 * Shared utility functions used across rendering modules.
 */

import type { Scene } from '../../main';
import type { ScenePosition } from './BaseRenderingTypes';

/**
 * Format a number to a fixed precision for SVG paths
 */
export function formatNumber(n: number): string {
    return n.toFixed(3);
}

/**
 * Build a full ring cell arc path (inner->outer->outer arc->inner->inner arc)
 */
export function buildCellArcPath(
    innerR: number,
    outerR: number,
    startAngle: number,
    endAngle: number
): string {
    return `
        M ${formatNumber(innerR * Math.cos(startAngle))} ${formatNumber(innerR * Math.sin(startAngle))}
        L ${formatNumber(outerR * Math.cos(startAngle))} ${formatNumber(outerR * Math.sin(startAngle))}
        A ${formatNumber(outerR)} ${formatNumber(outerR)} 0 0 1 ${formatNumber(outerR * Math.cos(endAngle))} ${formatNumber(outerR * Math.sin(endAngle))}
        L ${formatNumber(innerR * Math.cos(endAngle))} ${formatNumber(innerR * Math.sin(endAngle))}
        A ${formatNumber(innerR)} ${formatNumber(innerR)} 0 0 0 ${formatNumber(innerR * Math.cos(startAngle))} ${formatNumber(innerR * Math.sin(startAngle))}
    `.trim();
}

/**
 * Compute angular positions for scenes in a cell
 * Distributes scenes evenly within the angular space
 */
export function computeScenePositions(
    scenes: Scene[],
    startAngle: number,
    endAngle: number
): Map<number, ScenePosition> {
    const positions = new Map<number, ScenePosition>();
    const totalAngularSpace = endAngle - startAngle;
    
    if (scenes.length === 0) {
        return positions;
    }
    
    const angularSizePerScene = totalAngularSpace / scenes.length;
    
    scenes.forEach((scene, idx) => {
        const sceneStartAngle = startAngle + (idx * angularSizePerScene);
        const sceneEndAngle = sceneStartAngle + angularSizePerScene;
        
        positions.set(idx, {
            scene,
            index: idx,
            startAngle: sceneStartAngle,
            endAngle: sceneEndAngle,
            angularSize: angularSizePerScene
        });
    });
    
    return positions;
}

/**
 * Generate a scene ID for SVG elements
 */
export function makeSceneId(
    actIndex: number,
    ringIndex: number,
    sceneIndex: number,
    includePrefix: boolean = true,
    useRingIndex: boolean = true
): string {
    const prefix = includePrefix ? 'scene-path-' : '';
    if (useRingIndex) {
        return `${prefix}${actIndex}-${ringIndex}-${sceneIndex}`;
    }
    return `${prefix}${actIndex}-${sceneIndex}`;
}

/**
 * Get subplot color from CSS variables
 */
export function getSubplotColor(subplotName: string, masterSubplotOrder: string[]): string {
    const idx = masterSubplotOrder.indexOf(subplotName);
    if (idx < 0) return '#EFBDEB'; // fallback
    
    const colorIdx = idx % 16;
    const varName = `--rt-subplot-colors-${colorIdx}`;
    const computed = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    return computed || '#EFBDEB';
}

/**
 * Determine if a scene should be filtered based on mode
 */
export function shouldIncludeScene(
    scene: Scene,
    isOuterRing: boolean,
    isAllScenesMode: boolean
): boolean {
    // Plot notes handling based on mode
    if (scene.itemType === 'Plot') {
        // In All Scenes mode: only show plot notes in outer ring
        if (isAllScenesMode) {
            return isOuterRing;
        }
        // In Main Plot mode: never show plot notes (they're removed)
        return false;
    }
    
    // Regular scenes: always include
    return true;
}

/**
 * Filter scenes based on mode configuration
 */
export function filterScenesForMode(
    scenes: Scene[],
    isOuterRing: boolean,
    isAllScenesMode: boolean
): Scene[] {
    return scenes.filter(scene => shouldIncludeScene(scene, isOuterRing, isAllScenesMode));
}

/**
 * Render a void cell (empty space filler)
 */
export function renderVoidCell(
    innerR: number,
    outerR: number,
    startAngle: number,
    endAngle: number
): string {
    const arcPath = buildCellArcPath(innerR, outerR, startAngle, endAngle);
    return `<path d="${arcPath}" class="rt-void-cell"/>`;
}

/**
 * Calculate remaining void space after scenes
 */
export function calculateVoidSpace(
    scenePositions: Map<number, ScenePosition>,
    totalAngularSpace: number
): number {
    const totalUsedSpace = Array.from(scenePositions.values())
        .reduce((sum, p) => sum + p.angularSize, 0);
    return totalAngularSpace - totalUsedSpace;
}

/**
 * Encode a file path for use in SVG data attributes
 */
export function encodePathForSvg(path: string): string {
    return encodeURIComponent(path);
}

/**
 * Decode a file path from SVG data attributes
 */
export function decodePathFromSvg(encodedPath: string): string {
    return decodeURIComponent(encodedPath);
}

