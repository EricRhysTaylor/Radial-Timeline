/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

/**
 * Mode Registry
 * 
 * Central registry for all available timeline modes.
 * Provides lookup and validation functions.
 */

import { ModeDefinition, TimelineMode } from './ModeDefinition';
import { ALL_SCENES_MODE } from './definitions/AllScenesMode';
import { MAIN_PLOT_MODE } from './definitions/MainPlotMode';
import { GOSSAMER_MODE } from './definitions/GossamerMode';
import { CHRONOLOGUE_MODE } from './definitions/ChronologueMode';

/**
 * Registry of all available modes
 */
const MODE_REGISTRY = new Map<TimelineMode, ModeDefinition>([
    [TimelineMode.ALL_SCENES, ALL_SCENES_MODE],
    [TimelineMode.MAIN_PLOT, MAIN_PLOT_MODE],
    [TimelineMode.CHRONOLOGUE, CHRONOLOGUE_MODE],
    [TimelineMode.GOSSAMER, GOSSAMER_MODE],
]);

/**
 * Get a mode definition by its ID
 */
export function getModeDefinition(mode: TimelineMode): ModeDefinition {
    const definition = MODE_REGISTRY.get(mode);
    if (!definition) {
        // Fallback to All Scenes mode if mode not found
        return ALL_SCENES_MODE;
    }
    return definition;
}

/**
 * Get all registered modes
 */
export function getAllModes(): ModeDefinition[] {
    return Array.from(MODE_REGISTRY.values());
}

/**
 * Get modes that should appear in the toggle button, sorted by order
 */
export function getToggleableModes(): ModeDefinition[] {
    return getAllModes()
        .filter(mode => mode.ui.showInToggleButton)
        .sort((a, b) => a.ui.order - b.ui.order);
}

/**
 * Get the next mode in the toggle cycle
 */
export function getNextToggleMode(currentMode: TimelineMode): TimelineMode {
    const toggleable = getToggleableModes();
    const currentIndex = toggleable.findIndex(mode => mode.id === currentMode);
    
    if (currentIndex === -1) {
        // Current mode is not toggleable, default to first toggleable mode
        return toggleable[0]?.id || TimelineMode.ALL_SCENES;
    }
    
    // Cycle to next mode
    const nextIndex = (currentIndex + 1) % toggleable.length;
    return toggleable[nextIndex].id;
}

/**
 * Check if a mode is registered
 */
export function isModeRegistered(mode: TimelineMode): boolean {
    return MODE_REGISTRY.has(mode);
}

