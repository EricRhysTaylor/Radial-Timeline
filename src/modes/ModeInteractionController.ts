/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

/**
 * Mode Interaction Controller
 * 
 * Manages event handler registration and cleanup for different timeline modes.
 * Ensures clean transitions between modes without handler conflicts.
 */

import type { RadialTimelineView } from '../view/TimeLineView';
import type { ModeDefinition } from './ModeDefinition';
import { TimelineMode } from './ModeDefinition';

/**
 * Registered handler tracking
 */
interface RegisteredHandler {
    element: Element;
    event: string;
    handler: EventListener;
    removeFunction: () => void;
}

/**
 * Mode Interaction Controller
 */
export class ModeInteractionController {
    // SAFE: View reference passed at construction, tied to view lifecycle, cleaned on view destroy
    private view: RadialTimelineView; // SAFE: Per-view-instance, managed by view lifecycle
    private handlers: RegisteredHandler[] = [];
    private currentMode: TimelineMode | null = null;
    
    constructor(view: RadialTimelineView) {
        this.view = view;
    }
    
    /**
     * Setup interaction handlers for a mode
     * Cleans up previous mode handlers first
     * @param mode - The mode definition to setup
     * @param svg - The SVG element to attach handlers to
     */
    async setupMode(mode: ModeDefinition, svg: SVGSVGElement): Promise<void> {
        // Clean up previous mode handlers
        this.cleanup();
        
        this.currentMode = mode.id;
        
        // Setup handlers based on mode type
        switch (mode.id) {
            case TimelineMode.NARRATIVE:
                await this.setupAllScenesHandlers(svg);
                break;
                
            case TimelineMode.SUBPLOT:
                await this.setupMainPlotHandlers(svg);
                break;
                
            case TimelineMode.GOSSAMER:
                await this.setupGossamerHandlers(svg);
                break;
                
            case TimelineMode.CHRONOLOGUE:
                await this.setupChronologueHandlers(svg);
                break;
        }
    }
    
    /**
     * Clean up all registered handlers
     */
    cleanup(): void {
        // Execute all remove functions
        this.handlers.forEach(handler => {
            try {
                handler.removeFunction();
            } catch (e) {
                // Error removing handler
            }
        });
        
        // Clear the handlers array
        this.handlers = [];
        this.currentMode = null;
    }
    
    /**
     * Register a handler for tracking and cleanup
     */
    private registerHandler(
        element: Element,
        event: string,
        handler: EventListener,
        removeFunction: () => void
    ): void {
        this.handlers.push({
            element,
            event,
            handler,
            removeFunction
        });
    }
    
    /**
     * Setup handlers for All Scenes mode
     */
    private async setupAllScenesHandlers(svg: SVGSVGElement): Promise<void> {
        // Import and use existing All Scenes mode setup
        const { setupAllScenesDelegatedHover, setupSceneInteractions, setupOuterRingDrag } = await import('../view/modes/AllScenesMode');
        
        // Setup delegated hover
        const container = (this.view as any).containerEl as HTMLElement;
        if (container) {
            setupAllScenesDelegatedHover(this.view as any, container, this.view.sceneData || []);
        }
        
        // Setup scene interactions for each scene group
        const sceneGroups = svg.querySelectorAll('.rt-scene-group');
        sceneGroups.forEach(group => {
            setupSceneInteractions(this.view as any, group, svg, this.view.sceneData || []);
        });

        // Setup drag-to-reorder on the outer ring (narrative mode only)
        setupOuterRingDrag(this.view as any, svg);
    }
    
    /**
     * Setup handlers for Main Plot mode
     */
    private async setupMainPlotHandlers(svg: SVGSVGElement): Promise<void> {
        // Import and use existing Main Plot mode setup
        const { setupMainPlotMode } = await import('../view/modes/MainPlotMode');
        setupMainPlotMode(this.view as any, svg);
    }
    
    /**
     * Setup handlers for Gossamer mode
     */
    private async setupGossamerHandlers(svg: SVGSVGElement): Promise<void> {
        // Import and use existing Gossamer mode setup
        const { setupGossamerMode } = await import('../view/modes/GossamerMode');
        setupGossamerMode(this.view, svg);
    }
    
    /**
     * Setup handlers for Chronologue mode
     */
    private async setupChronologueHandlers(svg: SVGSVGElement): Promise<void> {
        // Import and use existing Chronologue mode setup
        const { setupChronologueMode } = await import('../view/modes/ChronologueMode');
        
        // Calculate outer radius from SVG viewBox or fallback to default
        const viewBox = svg.getAttribute('viewBox');
        let outerRadius = 300; // Default fallback
        if (viewBox) {
            const [, , width, height] = viewBox.split(' ').map(parseFloat);
            const size = Math.min(width, height);
            const margin = 50; // Approximate margin
            outerRadius = size / 2 - margin;
        }
        
        // Pass scenes and outer radius to chronologue mode setup
        // Pass the actual view instance directly (don't spread - it breaks methods like registerDomEvent)
        // Add scenes and outerRadius as properties on the view temporarily
        const view = this.view as any;
        view.scenes = this.view.sceneData || [];
        view.outerRadius = outerRadius;
        setupChronologueMode(view, svg);
    }
    
    /**
     * Get the current mode this controller is managing
     */
    getCurrentMode(): TimelineMode | null {
        return this.currentMode;
    }
}

/**
 * Create a ModeInteractionController instance
 */
export function createInteractionController(view: RadialTimelineView): ModeInteractionController {
    return new ModeInteractionController(view);
}

