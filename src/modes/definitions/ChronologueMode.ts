/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import { ModeDefinition, TimelineMode } from '../ModeDefinition';

/**
 * Chronologue Mode Definition
 * 
 * Shows scenes in chronological story order based on their When field.
 * The outer ring displays scenes sorted by story chronology with proportional
 * time visualization via the outer arc timeline.
 */
export const CHRONOLOGUE_MODE: ModeDefinition = {
    id: TimelineMode.CHRONOLOGUE,
    name: 'Chronologue',
    description: 'View scenes in chronological story order based on When field',
    
    rendering: {
        outerRingContent: 'chronologue',
        innerRingContent: 'chronologue',
        plotBeatDisplay: 'none',
        sceneColoring: 'subplot',
        numberSquares: 'full',
        overlayLayers: ['chronological-timeline'],
        visualMuting: []
    },
    
    interactions: {
        hoverBehavior: 'standard-scene-hover',
        clickBehavior: 'open-scene-file',
        enableZeroDraftMode: true,
        exitBehavior: 'toggle-button'
    },
    
    ui: {
        tooltip: 'Switch to Chronologue mode',
        showInToggleButton: true,
        order: 3
    }
};
