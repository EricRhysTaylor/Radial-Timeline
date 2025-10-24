/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

/**
 * Mode Rendering Helpers
 * 
 * Helper functions to make rendering decisions based on the active mode definition.
 */

import { TimelineMode } from '../../modes/ModeDefinition';
import { getModeDefinition } from '../../modes/ModeRegistry';
import type { PluginFacade } from './BaseRenderingTypes';

/**
 * Check if story beats should be shown in the outer ring
 * 
 * @param plugin - Plugin facade with settings
 * @returns true if beats should be shown, false if they should be hidden/removed
 */
export function shouldRenderStoryBeats(plugin: PluginFacade): boolean {
    const currentMode = plugin.settings.currentMode || TimelineMode.ALL_SCENES;
    const modeDef = getModeDefinition(currentMode as TimelineMode);
    
    // Check if beats are shown in this mode
    return modeDef.rendering.plotBeatDisplay !== 'none';
}

/**
 * Check if subplot rings should be shown
 * 
 * @param plugin - Plugin facade with settings
 * @returns true if subplot rings should be shown, false if hidden
 */
export function shouldShowSubplotRings(plugin: PluginFacade): boolean {
    const currentMode = plugin.settings.currentMode || TimelineMode.ALL_SCENES;
    const modeDef = getModeDefinition(currentMode as TimelineMode);
    
    // Check if inner rings are visible (not hidden)
    return modeDef.rendering.innerRingContent !== 'hidden';
}

/**
 * Check if all scenes should be shown in the outer ring
 * (vs. only main plot scenes)
 * 
 * @param plugin - Plugin facade with settings
 * @returns true if all scenes shown, false if only main plot
 */
export function shouldShowAllScenesInOuterRing(plugin: PluginFacade): boolean {
    const currentMode = plugin.settings.currentMode || TimelineMode.ALL_SCENES;
    const modeDef = getModeDefinition(currentMode as TimelineMode);
    
    // Check outer ring content setting
    // 'all-scenes' → true, 'main-plot-only' → false
    return modeDef.rendering.outerRingContent === 'all-scenes';
}

/**
 * Check if the inner ring should show scene content
 * 
 * @param plugin - Plugin facade with settings
 * @returns true if inner rings show content, false if hidden/empty
 */
export function shouldShowInnerRingContent(plugin: PluginFacade): boolean {
    const currentMode = plugin.settings.currentMode || TimelineMode.ALL_SCENES;
    const modeDef = getModeDefinition(currentMode as TimelineMode);
    
    // Inner rings show content unless hidden
    return modeDef.rendering.innerRingContent !== 'hidden';
}

/**
 * Get the subplot label text for a given subplot name and ring position
 * 
 * @param plugin - Plugin facade with settings
 * @param subplot - Subplot name
 * @param isOuterRing - Whether this is the outer ring
 * @returns Label text (uppercase)
 */
export function getSubplotLabelText(plugin: PluginFacade, subplot: string, isOuterRing: boolean): string {
    if (isOuterRing && shouldShowAllScenesInOuterRing(plugin)) {
        return 'ALL SCENES';
    }
    return subplot.toUpperCase();
}

