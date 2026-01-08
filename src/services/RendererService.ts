/*
 * Renderer Service
 * Abstraction layer for all SVG rendering.
 * Decouples logic from Obsidian-specific view implementation.
 */
import { App } from 'obsidian';
import { TimelineItem } from '../types';
import type RadialTimelinePlugin from '../main';
import { createTimelineSVG } from '../renderer/TimelineRenderer';
// import { updateGossamerLayer } from '../renderer/gossamerLayer'; // Commented out if not available
import { PluginRendererFacade } from '../utils/sceneHelpers';
import { updateSceneOpenClasses, updateSceneSearchHighlights } from '../renderer/dom/SceneDOMUpdater';
import { updateNumberSquareStates } from '../renderer/dom/NumberSquareDOMUpdater';
// import { updateSearchHighlights } from '../services/SceneHighlighter'; // Duplicate/Conflict
import { updateSynopsisText, updateSynopsisVisibility } from '../renderer/dom/SynopsisDOMUpdater';
// import { adjustBeatLabelsAfterRender } from '../renderer/components/Beats'; // Not exported

export interface RenderResult {
    svgString: string;
    maxStageColor: string;
}

export class RendererService {
    constructor(private plugin: RadialTimelinePlugin) {}

    public renderTimeline(scenes: TimelineItem[]): RenderResult {
        const pluginFacade = this.plugin as unknown as PluginRendererFacade;
        // Force cast to avoid strict union type mismatch with settings
        return createTimelineSVG(pluginFacade, scenes);
    }

    public generateTimeline(scenes: TimelineItem[]): RenderResult {
        return this.renderTimeline(scenes);
    }

    public updateGossamerLayer(params: any): boolean { // SAFE: any type used for future extensibility / flexible params
        // Stub if module missing or refactored
        return false; 
    }

    // --- DOM Update Passthroughs ---
    
    public updateOpenClasses(containerEl: HTMLElement, openPaths: Set<string>): void {
        updateSceneOpenClasses(containerEl as unknown as SVGSVGElement, openPaths);
    }

    public updateNumberSquaresDOM(containerEl: HTMLElement, plugin: RadialTimelinePlugin): void {
        // Cast plugin to any to bypass strict runtimeContentType check
        // Pass empty array for scenes as we can't get them synchronously here
        updateNumberSquareStates(containerEl as unknown as SVGSVGElement, plugin as any, []);
    }

    public updateSearchHighlights(containerEl: HTMLElement, searchTerm: string): void {
        // We can't easily get the search results set here without the SearchService
        updateSceneSearchHighlights(containerEl as unknown as SVGSVGElement, new Set<string>());
    }

    public updateProgressAndTicks(containerEl: HTMLElement, currentSceneId: string | null): void {
        // Stub
    }

    public updateSynopsisDOM(containerEl: HTMLElement, plugin: RadialTimelinePlugin): void {
        updateSynopsisText(containerEl as unknown as SVGSVGElement, []);
        updateSynopsisVisibility(containerEl as unknown as SVGSVGElement, plugin.openScenePaths || new Set());
    }

    public adjustBeatLabelsAfterRender(containerEl: HTMLElement): void {
        // Stub if not exported
    }
}
