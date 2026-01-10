/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import { ModeDefinition, TimelineMode } from '../ModeDefinition';

/**
 * Publication Mode Definition (formerly Subplot)
 * 
 * Shows Main Plot scenes in the outer ring with publication stage/status coloring.
 * Each subplot stays on its own ring (no aggregated ring) to focus on progress tracking.
 * Beat notes are removed entirely from the timeline.
 * Non-Main-Plot elements are visually muted.
 */
export const PUBLICATION_MODE: ModeDefinition = {
    id: TimelineMode.PUBLICATION,
    name: 'Publication',
    description: 'Track stage/status per subplot: main plot in the outer ring, other subplots in their own rings with publication coloring',
    
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
        acronym: 'PUBL',
        tooltip: 'Switch to Publication mode',
        showInToggleButton: true,
        order: 2
    }
};


