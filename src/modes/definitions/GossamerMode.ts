/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import { Notice } from 'obsidian';
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
        beatDisplay: 'outer-ring-slices',
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
        const plugin = view.plugin;
        
        // Get current scenes
        const scenes = await plugin.getSceneData();
        const beatNotes = scenes.filter(s => s.itemType === 'Beat' || s.itemType === 'Plot');
        
        if (beatNotes.length === 0) {
            // No beats found, cannot enter Gossamer mode
            new Notice('Cannot enter Gossamer mode: No story beats found. Create notes with frontmatter "Class: Beat" (or "Class: Plot" for backward compatibility).');
            throw new Error('Cannot enter Gossamer mode: No story beats found');
        }
        
        // Build and store Gossamer runs
        const { buildAllGossamerRuns } = await import('../../utils/gossamer');
        const { setBaseModeAllScenes, resetRotation } = await import('../../GossamerCommands');
        
        const selectedBeatModel = plugin.settings.beatSystem?.trim() || undefined;
        const allRuns = buildAllGossamerRuns(scenes as any, selectedBeatModel);
        
        if (allRuns.current.beats.length === 0) {
            const systemMsg = selectedBeatModel ? ` with Beat Model: ${selectedBeatModel}` : '';
            new Notice(`Cannot enter Gossamer mode: No story beat notes found${systemMsg}. Create notes with Class: Beat (or Class: Plot for backward compatibility).`);
            throw new Error(`Cannot enter Gossamer mode: No beats found for system: ${selectedBeatModel}`);
        }
        
        // Check if ALL beat notes are missing Gossamer1 scores
        const hasAnyScores = beatNotes.some(s => typeof s.Gossamer1 === 'number');
        if (!hasAnyScores) {
            new Notice('Warning: No Gossamer1 scores found in story beat notes. Defaulting all beats to 0. Add Gossamer1: <score> to your beat note frontmatter.');
        }
        
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

