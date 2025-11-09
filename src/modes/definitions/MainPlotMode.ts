/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import { ModeDefinition, TimelineMode } from '../ModeDefinition';

/**
 * Subplot Mode Definition
 * 
 * Shows Main Plot scenes in the outer ring with publish stage coloring.
 * Other subplots are shown in their respective inner rings.
 * Beat notes are removed entirely from the timeline.
 * Non-Main-Plot elements are visually muted.
 */
export const SUBPLOT_MODE: ModeDefinition = {
    id: TimelineMode.SUBPLOT,
    name: 'Subplot',
    description: 'View Main Plot scenes with publish stage coloring, other subplots in inner rings',
    
    rendering: {
        outerRingContent: 'subplot-only',
        innerRingContent: 'subplot-scenes',
        beatDisplay: 'none',
        sceneColoring: 'publish-stage',
        numberSquares: 'full',
        overlayLayers: [],
        visualMuting: ['non-main-plot']
    },
    
    interactions: {
        hoverBehavior: 'plot-only-hover',
        clickBehavior: 'open-plot-file',
        enableZeroDraftMode: true,
        exitBehavior: 'toggle-button'
    },
    
    ui: {
        acronym: 'SUBP',
        tooltip: 'Switch to Narrative mode',
        showInToggleButton: true,
        order: 2
    }
};


