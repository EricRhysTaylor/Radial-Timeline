/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

/**
 * Mode Manager
 * 
 * Centralized mode switching logic with lifecycle management.
 * Handles transitions between timeline modes cleanly and predictably.
 */

import type { RadialTimelineView } from '../view/TimeLineView';
import type RadialTimelinePlugin from '../main';
import { TimelineMode, isTimelineMode } from './ModeDefinition';
import { getModeDefinition } from './ModeRegistry';

/**
 * Mode Manager - Handles all mode transitions and lifecycle
 */
export class ModeManager {
    private plugin: RadialTimelinePlugin;
    // SAFE: View reference passed at construction, tied to view lifecycle, cleaned on view destroy
    private view: RadialTimelineView; // SAFE: Per-view-instance, managed by view lifecycle
    
    constructor(plugin: RadialTimelinePlugin, view: RadialTimelineView) {
        this.plugin = plugin;
        this.view = view;
    }
    
    /**
     * Get the current mode from the view
     */
    getCurrentMode(): TimelineMode {
        const currentModeString = this.view.currentMode;
        
        // Validate and return as TimelineMode
        if (isTimelineMode(currentModeString)) {
            return currentModeString as TimelineMode;
        }
        
        // Fallback to ALL_SCENES if invalid
        return TimelineMode.ALL_SCENES;
    }
    
    /**
     * Switch to a new mode
     * Handles lifecycle: exit current → update state → enter new → refresh
     * If the new mode's onEnter hook throws an error, the mode switch is cancelled and reverted.
     */
    async switchMode(newMode: TimelineMode): Promise<void> {
        const currentMode = this.getCurrentMode();
        
        // No-op if already in this mode
        if (currentMode === newMode) {
            return;
        }
        
        const currentModeDefinition = getModeDefinition(currentMode);
        const newModeDefinition = getModeDefinition(newMode);
        
        // Execute exit lifecycle hook for current mode
        if (currentModeDefinition.onExit) {
            await currentModeDefinition.onExit(this.view);
        }
        
        // Update view's current mode
        this.view.currentMode = newMode;
        
        // Persist to settings
        this.plugin.settings.currentMode = newMode;
        await this.plugin.saveSettings();
        
        // Execute enter lifecycle hook for new mode
        // If it throws, revert the mode change
        if (newModeDefinition.onEnter) {
            try {
                await newModeDefinition.onEnter(this.view);
            } catch (error) {
                // Mode entry failed, revert to previous mode
                console.error(`[ModeManager] Failed to enter ${newMode}:`, error);
                this.view.currentMode = currentMode;
                this.plugin.settings.currentMode = currentMode;
                await this.plugin.saveSettings();
                
                // Don't refresh - stay in the current mode's state
                return;
            }
        }
        
        // Refresh the timeline to show the new mode
        await this.refreshTimeline();
    }
    
    /**
     * Toggle to the next mode in the toggle cycle
     * Only cycles through modes that have showInToggleButton = true
     */
    async toggleToNextMode(): Promise<void> {
        const currentMode = this.getCurrentMode();
        
        // Get toggleable modes
        const { getToggleableModes } = await import('./ModeRegistry');
        const toggleableModes = getToggleableModes();
        
        if (toggleableModes.length === 0) {
            // No toggleable modes, default to ALL_SCENES
            await this.switchMode(TimelineMode.ALL_SCENES);
            return;
        }
        
        // Find current mode in toggleable list
        const currentIndex = toggleableModes.findIndex(mode => mode.id === currentMode);
        
        if (currentIndex === -1) {
            // Current mode is not toggleable, switch to first toggleable mode
            await this.switchMode(toggleableModes[0].id);
            return;
        }
        
        // Cycle to next mode
        const nextIndex = (currentIndex + 1) % toggleableModes.length;
        await this.switchMode(toggleableModes[nextIndex].id);
    }
    
    /**
     * Check if a mode is currently active
     */
    isMode(mode: TimelineMode): boolean {
        return this.getCurrentMode() === mode;
    }
    
    /**
     * Refresh the timeline view
     * Uses the view's refresh method if available, otherwise triggers plugin refresh
     */
    private async refreshTimeline(): Promise<void> {
        // Try to use the view's direct refresh method first
        if (typeof (this.view as any).refreshTimeline === 'function') {
            await (this.view as any).refreshTimeline();
        } else {
            // Fallback to plugin's refresh
            this.plugin.refreshTimelineIfNeeded(null);
        }
    }
}

/**
 * Create a ModeManager instance for a view
 */
export function createModeManager(
    plugin: RadialTimelinePlugin,
    view: RadialTimelineView
): ModeManager {
    return new ModeManager(plugin, view);
}

