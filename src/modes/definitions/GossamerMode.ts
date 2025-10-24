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
        tooltip: 'Exit Gossamer mode',
        showInToggleButton: false, // Gossamer is activated via command palette, not toggle
        order: 3
    },
    
    // Lifecycle hooks
    onEnter: async (view) => {
        // This is called when entering Gossamer mode
        // The actual mode setup is handled in GossamerCommands.ts for now
        // Future: migrate that logic here
    },
    
    onExit: async (view) => {
        // This is called when exiting Gossamer mode
        // Future: migrate cleanup logic here
    }
};

