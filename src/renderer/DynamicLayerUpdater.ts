/**
 * Radial Timeline Plugin for Obsidian — Dynamic Layer Updater
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import { renderProgressRing } from './components/ProgressRing';
import { renderTargetDateTick, type TargetTickEnhancedData } from './components/ProgressTicks';
import { renderEstimatedDateElements, renderEstimationArc } from './components/Progress';
import { dateToAngle } from '../utils/date';
import { isBeatNote, type PluginRendererFacade } from '../utils/sceneHelpers';
import { STAGE_ORDER } from '../utils/constants';
import type { TimelineItem } from '../types';

/**
 * Update only the year progress ring without full re-render
 * Removes old progress ring and replaces with new one
 */
export function updateYearProgressRing(svg: SVGSVGElement, progressRadius: number): boolean {
    try {
        // Calculate current year progress
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const yearProgress = (now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24 * 365);
        const currentYearStartAngle = -Math.PI / 2;
        
        // Find and remove old progress ring segments
        const oldSegments = svg.querySelectorAll('.progress-segment, .progress-ring-base');
        oldSegments.forEach(el => el.remove());
        
        // Find the timeline-root group (where progress ring should be)
        const timelineRoot = svg.querySelector('#timeline-root');
        if (!timelineRoot) return false;
        
        // Create temporary container for new progress ring
        const tempContainer = document.createElement('div');
        tempContainer.innerHTML = renderProgressRing({ // SAFE: innerHTML used for SVG fragment generation from trusted source
            progressRadius, 
            yearProgress, 
            currentYearStartAngle, 
            segmentCount: 6 
        });
        
        // Extract the generated elements and insert them at the beginning of timeline-root
        // (so they appear below other elements but above the background)
        const parser = new DOMParser();
        const doc = parser.parseFromString(tempContainer.innerHTML, 'image/svg+xml');
        const newElements = Array.from(doc.documentElement.children);
        
        // Insert at beginning of timeline-root (after defs but before scenes)
        newElements.forEach(el => {
            const imported = document.importNode(el, true);
            timelineRoot.insertBefore(imported, timelineRoot.firstChild);
        });
        
        return true;
    } catch (error) {
        console.error('[DynamicLayerUpdater] Failed to update year progress ring:', error);
        return false;
    }
}

/**
 * Calculate enhanced data for target tick tooltips.
 */
function calculateTargetTickEnhancedData(
    scenes: TimelineItem[],
    plugin: PluginRendererFacade
): TargetTickEnhancedData | undefined {
    const realScenes = scenes.filter(scene => !isBeatNote(scene));
    if (realScenes.length === 0) return undefined;
    
    const estimate = plugin.calculateCompletionEstimate(scenes);
    
    const stageRemaining: Record<typeof STAGE_ORDER[number], number> = {
        Zero: 0, Author: 0, House: 0, Press: 0
    };
    
    const normalizeStage = (raw: unknown): typeof STAGE_ORDER[number] => {
        const v = (raw ?? 'Zero').toString().trim().toLowerCase();
        const match = STAGE_ORDER.find(stage => stage.toLowerCase() === v);
        return match ?? 'Zero';
    };
    
    const isCompleted = (status: unknown): boolean => {
        const val = Array.isArray(status) ? status[0] : status;
        const normalized = (val ?? '').toString().trim().toLowerCase();
        return normalized === 'complete' || normalized === 'completed' || normalized === 'done';
    };
    
    const seenPaths = new Set<string>();
    for (const scene of realScenes) {
        if (scene.path && seenPaths.has(scene.path)) continue;
        if (scene.path) seenPaths.add(scene.path);
        if (!isCompleted(scene.status)) {
            const stage = normalizeStage(scene['Publish Stage']);
            stageRemaining[stage]++;
        }
    }
    
    return {
        stageRemaining,
        currentPace: estimate?.rate ?? 0,
        estimatedStage: (estimate?.stage as typeof STAGE_ORDER[number] | null) ?? null,
        estimatedDate: estimate?.date ?? null
    };
}

/**
 * Update target completion tick/marker without full re-render
 */
export function updateTargetDateTick(
    svg: SVGSVGElement, 
    plugin: PluginRendererFacade,
    progressRadius: number,
    scenes?: TimelineItem[]
): boolean {
    try {
        // Remove old target tick
        const oldTick = svg.querySelector('.target-completion-tick');
        if (oldTick) oldTick.remove();
        
        // Find timeline-root group
        const timelineRoot = svg.querySelector('#timeline-root');
        if (!timelineRoot) return false;
        
        // Calculate enhanced data for tooltips if scenes are available
        const enhancedData = scenes ? calculateTargetTickEnhancedData(scenes, plugin) : undefined;
        
        // Generate new target tick
        const newTickSvg = renderTargetDateTick({ plugin, progressRadius, dateToAngle, enhancedData });
        
        // Parse and insert
        const parser = new DOMParser();
        const doc = parser.parseFromString(newTickSvg, 'image/svg+xml');
        const newElements = Array.from(doc.documentElement.children);
        
        newElements.forEach(el => {
            const imported = document.importNode(el, true);
            timelineRoot.appendChild(imported);
        });
        
        return true;
    } catch (error) {
        console.error('[DynamicLayerUpdater] Failed to update target date tick:', error);
        return false;
    }
}

/**
 * Update estimation arc and tick without full re-render
 */
export function updateEstimationElements(
    svg: SVGSVGElement,
    plugin: PluginRendererFacade,
    progressRadius: number,
    scenes: TimelineItem[]
): boolean {
    try {
        // Remove old estimation elements
        const oldEstimation = svg.querySelectorAll('.estimation-arc, .rt-estimate-tick-group, .estimated-date-tick, .year-indicator-circle');
        oldEstimation.forEach(el => el.remove());
        
        // Calculate new estimation
        const estimateResult = plugin.calculateCompletionEstimate(scenes);
        if (!estimateResult) return true; // No estimation to show
        
        // Find timeline-root group
        const timelineRoot = svg.querySelector('#timeline-root');
        if (!timelineRoot) return false;
        
        // Generate new estimation elements
        const yearsDiff = estimateResult.date ? estimateResult.date.getFullYear() - new Date().getFullYear() : 0;
        let newEstimationSvg = '';
        
        if (estimateResult.date && yearsDiff <= 0) {
            newEstimationSvg += renderEstimationArc({ estimateDate: estimateResult.date, progressRadius });
        }
        newEstimationSvg += renderEstimatedDateElements({ estimate: estimateResult, progressRadius });
        
        // Parse and insert
        const parser = new DOMParser();
        const doc = parser.parseFromString(`<svg>${newEstimationSvg}</svg>`, 'image/svg+xml');
        const newElements = Array.from(doc.documentElement.children);
        
        newElements.forEach(el => {
            const imported = document.importNode(el, true);
            timelineRoot.appendChild(imported);
        });
        
        return true;
    } catch (error) {
        console.error('[DynamicLayerUpdater] Failed to update estimation elements:', error);
        return false;
    }
}

/**
 * Update all dynamic time-based elements without full re-render
 * Returns true if successful, false if full re-render is needed
 */
export function updateAllTimeBasedElements(
    svg: SVGSVGElement,
    plugin: PluginRendererFacade,
    progressRadius: number,
    scenes: TimelineItem[]
): boolean {
    const success = 
        updateYearProgressRing(svg, progressRadius) &&
        updateTargetDateTick(svg, plugin, progressRadius, scenes) &&
        updateEstimationElements(svg, plugin, progressRadius, scenes);
    
    return success;
}

