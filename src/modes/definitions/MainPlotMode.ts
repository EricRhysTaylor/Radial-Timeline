/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import { ModeDefinition, TimelineMode } from '../ModeDefinition';

/**
 * Main Plot Mode Definition
 * 
 * Shows only Main Plot scenes in the outer ring with publish stage coloring.
 * Beat notes are removed entirely from the timeline.
 * Non-plot elements are visually muted.
 */
export const MAIN_PLOT_MODE: ModeDefinition = {
    id: TimelineMode.MAIN_PLOT,
    name: 'Main Plot',
    description: 'View only Main Plot scenes with publish stage coloring throughout',
    
    rendering: {
        outerRingContent: 'main-plot-only',
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
        tooltip: 'Switch to All Scenes mode',
        showInToggleButton: true,
        order: 2
    }
};

