/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import { ModeDefinition, TimelineMode } from '../ModeDefinition';

/**
 * Gossamer Mode Definition
 * 
 * Overlays Gossamer score analysis on top of All Scenes rendering.
 * Shows dots on radial spokes representing current scores, with historical
 * dots, confidence bands, and beat outlines. Non-plot elements are muted.
 */
export const GOSSAMER_MODE: ModeDefinition = {
    id: TimelineMode.GOSSAMER,
    name: 'Gossamer',
    description: 'Gossamer score analysis overlay with beat tracking and historical data',
    
    rendering: {
        outerRingContent: 'all-scenes',
        innerRingContent: 'subplot-scenes',
        plotBeatDisplay: 'outer-ring-slices',
        sceneColoring: 'subplot',
        numberSquares: 'full',
        overlayLayers: [
            'gossamer-dots',
            'gossamer-spokes',
            'gossamer-outlines',
            'confidence-band'
        ],
        visualMuting: ['non-plot']
    },
    
    interactions: {
        hoverBehavior: 'gossamer-bidirectional',
        clickBehavior: 'gossamer-open-file',
        enableZeroDraftMode: false, // Gossamer mode has its own click behavior
        exitBehavior: 'click-background',
        // Custom handlers are registered in GossamerMode.ts in view/modes
    },
    
    ui: {
        tooltip: 'Switch to Gossamer mode',
        showInToggleButton: true, // Show in mode toggle button
        order: 3
    },
    
    // Lifecycle hooks
    onEnter: async (view) => {
        // Import and run the Gossamer initialization
        const { toggleGossamerMode } = await import('../../GossamerCommands');
        // Use the plugin from the view to call toggleGossamerMode
        // This will handle all the Gossamer setup (building runs, checking scores, etc.)
        const plugin = view.plugin;
        
        // Get current scenes
        const scenes = await plugin.getSceneData();
        const beatNotes = scenes.filter(s => s.itemType === 'Beat' || s.itemType === 'Plot');
        
        if (beatNotes.length === 0) {
            // No beats found, cannot enter Gossamer mode
            // Switch back to ALL_SCENES
            view.currentMode = TimelineMode.ALL_SCENES;
            return;
        }
        
        // Build and store Gossamer runs
        const { buildAllGossamerRuns } = await import('../../utils/gossamer');
        const { setBaseModeAllScenes, resetRotation } = await import('../../GossamerCommands');
        
        const selectedBeatModel = plugin.settings.beatSystem?.trim() || undefined;
        const allRuns = buildAllGossamerRuns(scenes as any, selectedBeatModel);
        
        // Store runs on plugin
        (plugin as any)._gossamerLastRun = allRuns.current;
        (plugin as any)._gossamerHistoricalRuns = allRuns.historical;
        (plugin as any)._gossamerMinMax = allRuns.minMax;
        
        // Setup mode
        setBaseModeAllScenes(plugin);
        resetRotation(plugin);
        plugin.clearSearch();
        
        // Set interaction mode to gossamer
        (view as any).interactionMode = 'gossamer';
    },
    
    onExit: async (view) => {
        // This is called when exiting Gossamer mode
        // Future: migrate cleanup logic here
    }
};

