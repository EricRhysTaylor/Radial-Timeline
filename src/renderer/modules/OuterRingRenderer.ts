/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

/**
 * Outer Ring Renderer
 * 
 * Handles rendering of the outermost ring with different strategies based on mode:
 * - all-scenes: All scenes from all subplots in manuscript order
 * - main-plot-only: Only Main Plot subplot scenes
 * - chronological: Scenes ordered by story chronology (future)
 */

import type { Scene } from '../../main';
import type {
    RenderingContext,
    RenderingResult,
    ScenePosition
} from './BaseRenderingTypes';
import type { OuterRingContent } from '../../modes/ModeDefinition';
import {
    buildCellArcPath,
    computeScenePositions,
    makeSceneId,
    getSubplotColor,
    renderVoidCell,
    calculateVoidSpace,
    encodePathForSvg
} from './RenderingUtils';
import { sortScenesChronologically } from '../../utils/sceneHelpers';

/**
 * Render the outer ring based on the specified content strategy
 */
export function renderOuterRing(
    context: RenderingContext,
    contentStrategy: OuterRingContent
): RenderingResult {
    switch (contentStrategy) {
        case 'all-scenes':
            return renderAllScenesOuterRing(context);
        case 'main-plot-only':
            return renderMainPlotOuterRing(context);
        case 'chronologue':
            return renderChronologueOuterRing(context);
        default:
            // Fallback to all-scenes
            return renderAllScenesOuterRing(context);
    }
}

/**
 * Render outer ring with all scenes from all subplots (All Scenes mode)
 */
function renderAllScenesOuterRing(context: RenderingContext): RenderingResult {
    const { scenes, ring, act, plugin, masterSubplotOrder } = context;
    let svg = '';
    
    // Filter scenes for this act
    const actScenes = scenes.filter(s => {
        const sceneAct = s.actNumber !== undefined ? s.actNumber - 1 : 0;
        return sceneAct === act.actIndex;
    });
    
    // Deduplicate scenes by path (and plot beats by title+act)
    const seenPaths = new Set<string>();
    const seenPlotKeys = new Set<string>();
    const combined: Scene[] = [];
    
    actScenes.forEach(s => {
        if (s.itemType === 'Plot') {
            const pKey = `${String(s.title || '')}::${String(s.actNumber ?? '')}`;
            if (seenPlotKeys.has(pKey)) return;
            seenPlotKeys.add(pKey);
            combined.push(s);
        } else {
            const key = s.path || `${s.title || ''}::${String(s.when || '')}`;
            if (seenPaths.has(key)) return;
            seenPaths.add(key);
            combined.push(s);
        }
    });
    
    // Compute positions
    const scenePositions = computeScenePositions(combined, act.startAngle, act.endAngle);
    
    // Render each scene
    combined.forEach((scene, idx) => {
        const position = scenePositions.get(idx);
        if (!position) return;
        
        const sceneId = makeSceneId(act.actIndex, ring.ringIndex, idx, true, true);
        const encodedPath = scene.path ? encodePathForSvg(scene.path) : '';
        
        // Determine color based on scene type
        let color: string;
        if (scene.itemType === 'Plot') {
            color = '#E6E6E6'; // Gray for plot beats
        } else {
            // Subplot color for regular scenes
            const subplotName = scene.subplot || 'Main Plot';
            color = getSubplotColor(subplotName, masterSubplotOrder);
        }
        
        // Extend plot slices slightly beyond the outer ring
        const effectiveOuterR = scene.itemType === 'Plot' 
            ? ring.outerRadius + 2 
            : ring.outerRadius;
        
        const arcPath = buildCellArcPath(
            ring.innerRadius,
            effectiveOuterR,
            position.startAngle,
            position.endAngle
        );
        
        // Build scene group with data attributes
        const groupClass = scene.itemType === 'Plot' ? 'rt-scene-group beats' : 'rt-scene-group';
        const itemType = scene.itemType === 'Plot' ? 'Beat' : 'Scene';
        svg += `<g class="${groupClass}" data-path="${encodedPath}" data-item-type="${itemType}">`;
        svg += `<path id="${sceneId}" d="${arcPath}" fill="${color}" class="rt-scene-path"/>`;
        
        // Add scene title for non-beat scenes
        if (scene.itemType !== 'Plot' && scene.title) {
            // Scene title rendering would go here
            // (Keeping it simple for now - full implementation would include textPath, etc.)
        }
        
        svg += `</g>`;
    });
    
    // Fill remaining space with void cells
    const voidSpace = calculateVoidSpace(scenePositions, act.endAngle - act.startAngle);
    if (voidSpace > 0.001) {
        const lastPosition = scenePositions.get(combined.length - 1);
        const voidStartAngle = lastPosition ? lastPosition.endAngle : act.startAngle;
        svg += renderVoidCell(ring.innerRadius, ring.outerRadius, voidStartAngle, act.endAngle);
    }
    
    return {
        svg,
        metadata: {
            sceneCount: combined.length,
            plotBeatCount: combined.filter(s => s.itemType === 'Plot').length,
            hasVoidCells: voidSpace > 0.001
        }
    };
}

/**
 * Render outer ring with only Main Plot scenes (Main Plot mode)
 */
function renderMainPlotOuterRing(context: RenderingContext): RenderingResult {
    const { scenes, ring, act, plugin } = context;
    let svg = '';
    
    // Filter for Main Plot scenes only in this act
    const mainPlotScenes = scenes.filter(s => {
        const sceneAct = s.actNumber !== undefined ? s.actNumber - 1 : 0;
        const isMainPlot = !s.subplot || s.subplot.trim() === '' || s.subplot === 'Main Plot';
        const isNotBeatNote = s.itemType !== 'Plot'; // Exclude beat notes entirely
        return sceneAct === act.actIndex && isMainPlot && isNotBeatNote;
    });
    
    // Deduplicate by path
    const seenPaths = new Set<string>();
    const uniqueScenes: Scene[] = [];
    mainPlotScenes.forEach(s => {
        const key = s.path || `${s.title || ''}::${String(s.when || '')}`;
        if (seenPaths.has(key)) return;
        seenPaths.add(key);
        uniqueScenes.push(s);
    });
    
    // Compute positions
    const scenePositions = computeScenePositions(uniqueScenes, act.startAngle, act.endAngle);
    
    // Render each scene with publish stage coloring
    uniqueScenes.forEach((scene, idx) => {
        const position = scenePositions.get(idx);
        if (!position) return;
        
        const sceneId = makeSceneId(act.actIndex, ring.ringIndex, idx, true, true);
        const encodedPath = scene.path ? encodePathForSvg(scene.path) : '';
        
        // Use publish stage color
        const publishStage = (scene['Publish Stage'] || 'Zero') as string;
        const color = plugin.settings.publishStageColors[publishStage] 
            || plugin.settings.publishStageColors['Zero'] 
            || '#9E70CF';
        
        const arcPath = buildCellArcPath(
            ring.innerRadius,
            ring.outerRadius,
            position.startAngle,
            position.endAngle
        );
        
        // Build scene group
        svg += `<g class="rt-scene-group" data-path="${encodedPath}" data-item-type="Scene">`;
        svg += `<path id="${sceneId}" d="${arcPath}" fill="${color}" class="rt-scene-path"/>`;
        svg += `</g>`;
    });
    
    // Fill remaining space with void cells
    const voidSpace = calculateVoidSpace(scenePositions, act.endAngle - act.startAngle);
    if (voidSpace > 0.001) {
        const lastPosition = scenePositions.get(uniqueScenes.length - 1);
        const voidStartAngle = lastPosition ? lastPosition.endAngle : act.startAngle;
        svg += renderVoidCell(ring.innerRadius, ring.outerRadius, voidStartAngle, act.endAngle);
    }
    
    return {
        svg,
        metadata: {
            sceneCount: uniqueScenes.length,
            plotBeatCount: 0, // Beat notes are excluded in Main Plot mode
            hasVoidCells: voidSpace > 0.001
        }
    };
}

/**
 * Render outer ring with scenes in chronological order (Chronologue mode)
 */
function renderChronologueOuterRing(context: RenderingContext): RenderingResult {
    const { scenes, ring, act, plugin, masterSubplotOrder } = context;
    let svg = '';
    
    // Filter scenes for this act
    const actScenes = scenes.filter(s => {
        const sceneAct = s.actNumber !== undefined ? s.actNumber - 1 : 0;
        return sceneAct === act.actIndex;
    });
    
    // Sort scenes chronologically by When field
    const chronologicallySorted = sortScenesChronologically(actScenes);
    
    // Deduplicate scenes by path
    const seenPaths = new Set<string>();
    const uniqueScenes: Scene[] = [];
    
    chronologicallySorted.forEach(s => {
        const key = s.path || `${s.title || ''}::${String(s.when || '')}`;
        if (seenPaths.has(key)) return;
        seenPaths.add(key);
        uniqueScenes.push(s);
    });
    
    // Compute positions with equal spacing (for readability)
    const scenePositions = computeScenePositions(uniqueScenes, act.startAngle, act.endAngle);
    
    // Render each scene
    uniqueScenes.forEach((scene, idx) => {
        const position = scenePositions.get(idx);
        if (!position) return;
        
        const sceneId = makeSceneId(act.actIndex, ring.ringIndex, idx, true, true);
        const encodedPath = scene.path ? encodePathForSvg(scene.path) : '';
        
        // Determine color based on subplot
        const subplotName = scene.subplot || 'Main Plot';
        const color = getSubplotColor(subplotName, masterSubplotOrder);
        
        // Add warning class for scenes without When field
        const hasWhenField = scene.when && typeof scene.when === 'string' && (scene.when as string).trim() !== '';
        const groupClass = hasWhenField ? 'rt-scene-group' : 'rt-scene-group rt-chronologue-warning';
        
        const arcPath = buildCellArcPath(
            ring.innerRadius,
            ring.outerRadius,
            position.startAngle,
            position.endAngle
        );
        
        // Build scene group with data attributes
        svg += `<g class="${groupClass}" data-path="${encodedPath}" data-item-type="Scene">`;
        svg += `<path id="${sceneId}" d="${arcPath}" fill="${color}" class="rt-scene-path"/>`;
        
        // Add scene title
        if (scene.title) {
            // Scene title rendering would go here
            // (Keeping it simple for now - full implementation would include textPath, etc.)
        }
        
        svg += `</g>`;
    });
    
    // Fill remaining space with void cells
    const voidSpace = calculateVoidSpace(scenePositions, act.endAngle - act.startAngle);
    if (voidSpace > 0.001) {
        const lastPosition = scenePositions.get(uniqueScenes.length - 1);
        const voidStartAngle = lastPosition ? lastPosition.endAngle : act.startAngle;
        svg += renderVoidCell(ring.innerRadius, ring.outerRadius, voidStartAngle, act.endAngle);
    }
    
    return {
        svg,
        metadata: {
            sceneCount: uniqueScenes.length,
            plotBeatCount: 0, // No plot beats in Chronologue mode
            hasVoidCells: voidSpace > 0.001
        }
    };
}

