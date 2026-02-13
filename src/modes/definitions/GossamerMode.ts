/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import { Notice } from 'obsidian';
import { ModeDefinition, TimelineMode } from '../ModeDefinition';
import { resolveSelectedBeatModel } from '../../utils/beatsInputNormalize';

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
        outerRingContent: 'narrative',
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
        acronym: 'GOSS',
        tooltip: 'Gossamer mode — momentum analysis (requires beat notes)',
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
            const selectedSystem = resolveSelectedBeatModel(plugin.settings.beatSystem, plugin.settings.customBeatSystemName) ?? '';
            const systemHint = selectedSystem
                ? `No "${selectedSystem}" beat notes found in your vault. Create beat notes with "Class: Beat" and "Beat Model: ${selectedSystem}" in frontmatter.`
                : 'No story beats found. Create notes with frontmatter "Class: Beat".';
            new Notice(`Cannot enter Gossamer mode. ${systemHint}`, 8000);
            throw new Error('Cannot enter Gossamer mode: No story beats found');
        }
        
        // Build and store Gossamer runs
        const { buildAllGossamerRuns } = await import('../../utils/gossamer');
        const { setBaseModeAllScenes, resetRotation } = await import('../../GossamerCommands');
        
        const selectedBeatModel = resolveSelectedBeatModel(plugin.settings.beatSystem, plugin.settings.customBeatSystemName);
        const allRuns = buildAllGossamerRuns(scenes as any, selectedBeatModel);
        
        if (allRuns.current.beats.length === 0) {
            const systemHint = selectedBeatModel
                ? `No beat notes found matching "${selectedBeatModel}". Check that your beat notes have "Beat Model: ${selectedBeatModel}" in frontmatter.`
                : 'No story beat notes could be matched. Ensure notes have "Class: Beat" in frontmatter.';
            new Notice(`Cannot enter Gossamer mode. ${systemHint}`, 8000);
            throw new Error(`Cannot enter Gossamer mode: No beats found for system: ${selectedBeatModel}`);
        }
        
        // Show info message if no scores exist (graceful, not a warning)
        if (!allRuns.hasAnyScores) {
            new Notice('No Gossamer scores found. Showing ideal ranges and spokes. Add scores using "Gossamer enter momentum scores" command.');
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
