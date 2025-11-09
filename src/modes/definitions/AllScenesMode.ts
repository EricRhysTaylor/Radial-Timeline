/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import { ModeDefinition, TimelineMode } from '../ModeDefinition';

/**
 * All Scenes Mode Definition
 * 
 * Shows all scenes from all subplots in manuscript order.
 * The outer ring displays combined scenes with subplot colors,
 * while inner rings show subplot-specific scenes.
 */
export const ALL_SCENES_MODE: ModeDefinition = {
    id: TimelineMode.ALL_SCENES,
    name: 'All Scenes',
    description: 'View all scenes across all subplots in manuscript order with subplot coloring',
    
    rendering: {
        outerRingContent: 'all-scenes',
        innerRingContent: 'subplot-scenes',
        beatDisplay: 'outer-ring-slices',
        sceneColoring: 'subplot',
        numberSquares: 'full',
        overlayLayers: [],
        visualMuting: []
    },
    
    interactions: {
        hoverBehavior: 'standard-scene-hover',
        clickBehavior: 'open-scene-file',
        enableZeroDraftMode: true,
        exitBehavior: 'toggle-button'
    },
    
    ui: {
        tooltip: 'Switch to Main Plot mode',
        showInToggleButton: true,
        order: 1
    }
};

