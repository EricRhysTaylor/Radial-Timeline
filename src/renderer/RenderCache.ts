/**
 * Radial Timeline Plugin for Obsidian — Render Cache
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import type { Scene } from '../main';

/**
 * Hash function for creating cache keys from scene arrays
 * Uses comprehensive scene data to detect any rendering-relevant changes
 */
function hashScenes(scenes: Scene[]): string {
    // Create a stable hash based on all fields that affect rendering
    return scenes
        .map(s => {
            // Include all fields that affect visual rendering
            const parts = [
                s.path || s.title || '',
                s.status || '',
                s.actNumber || '',
                s.subplot || '',
                s.number || '',
                s.when instanceof Date ? s.when.getTime() : (s.when || ''),
                s.Duration || '',
                s.due || '',
                s['Publish Stage'] || '',
                s.synopsis || '',
                // Pending Edits affects number square color (gray)
                s.pendingEdits || '',
                // For beat notes, include description
                s.Description || '',
                // Range field (rendered in Gossamer mode)
                s.Range || '',
                // Include character count (affects rendering)
                (s.Character || []).length,
                // Include location
                s.location || ''
            ];
            
            // Include all Gossamer fields (Gossamer1 through Gossamer30)
            for (let i = 1; i <= 30; i++) {
                const gossamerKey = `Gossamer${i}` as keyof Scene;
                parts.push((s[gossamerKey] as any) || '');
                
                // Include Gossamer justifications (rendered in Gossamer mode)
                const justificationKey = `Gossamer${i} Justification` as keyof Scene;
                parts.push((s[justificationKey] as any) || '');
            }
            
            return parts.join(':');
        })
        .join('|');
}

/**
 * Hash function for settings that affect rendering
 */
function hashSettings(settings: {
    currentMode?: string;
    sortByWhenDate?: boolean;
    showEstimate?: boolean;
    chronologueDurationCapSelection?: string;
    publishStageColors?: Record<string, string>;
    subplotColors?: string[];
    enableAiSceneAnalysis?: boolean;
    targetCompletionDate?: string;
    dominantSubplots?: Record<string, string>;
}): string {
    return JSON.stringify({
        mode: settings.currentMode,
        sort: settings.sortByWhenDate,
        estimate: settings.showEstimate,
        durationCap: settings.chronologueDurationCapSelection,
        // Include color values since they affect gradients and patterns
        stageColors: settings.publishStageColors,
        subplotColors: settings.subplotColors,
        // AI features toggle affects number square colors and synopsis
        aiEnabled: settings.enableAiSceneAnalysis,
        // Target completion date affects tick mark rendering
        targetDate: settings.targetCompletionDate,
        // Dominant subplot preferences affect scene colors in outer ring
        dominantSubplots: settings.dominantSubplots
    });
}

/**
 * Computed values that can be cached between renders
 */
export interface CachedComputations {
    // Scene grouping and ordering
    scenesByActAndSubplot: { [act: number]: { [subplot: string]: Scene[] } };
    masterSubplotOrder: string[];
    totalPlotNotes: number;
    plotIndexByKey: Map<string, number>;
    plotsBySubplot: Map<string, Scene[]>;
    
    // Ring geometry
    ringWidths: number[];
    ringStartRadii: number[];
    lineInnerRadius: number;
    
    // Time-based (changes infrequently)
    maxStageColor: string;
    
    // Cache metadata
    scenesHash: string;
    settingsHash: string;
    timestamp: number;
}

/**
 * Time-based values that change frequently and should NOT be cached
 * These are computed fresh on every render
 */
export interface DynamicValues {
    // Year progress (changes daily)
    yearProgress: number;
    currentMonthIndex: number;
    currentYearStartAngle: number;
    currentYearEndAngle: number;
    
    // Open files (changes per keystroke potentially)
    openScenePaths: Set<string>;
    
    // Search results
    searchResults: Set<string>;
}

/**
 * RenderCache manages expensive computations that can be reused between renders
 */
export class RenderCache {
    private cache: CachedComputations | null = null;
    
    /**
     * Check if cached computations are still valid
     */
    isValid(scenes: Scene[], settings: any): boolean { // SAFE: any type used for settings object with dynamic properties
        if (!this.cache) return false;
        
        const scenesHash = hashScenes(scenes);
        const settingsHash = hashSettings(settings);
        
        return (
            this.cache.scenesHash === scenesHash &&
            this.cache.settingsHash === settingsHash
        );
    }
    
    /**
     * Get cached computations if valid, otherwise return null
     */
    get(scenes: Scene[], settings: any): CachedComputations | null { // SAFE: any type used for settings object with dynamic properties
        if (this.isValid(scenes, settings)) {
            return this.cache;
        }
        return null;
    }
    
    /**
     * Store new cached computations
     */
    set(
        scenes: Scene[],
        settings: any, // SAFE: any type used for settings object with dynamic properties
        computations: Omit<CachedComputations, 'scenesHash' | 'settingsHash' | 'timestamp'>
    ): CachedComputations {
        this.cache = {
            ...computations,
            scenesHash: hashScenes(scenes),
            settingsHash: hashSettings(settings),
            timestamp: Date.now()
        };
        return this.cache;
    }
    
    /**
     * Clear the cache (force recomputation on next render)
     */
    clear(): void {
        this.cache = null;
    }
    
    /**
     * Get cache statistics for debugging
     */
    getStats(): { cached: boolean; age?: number; size?: number } {
        if (!this.cache) {
            return { cached: false };
        }
        
        return {
            cached: true,
            age: Date.now() - this.cache.timestamp,
            size: JSON.stringify(this.cache).length
        };
    }
}

/**
 * Global render cache instance (one per plugin instance)
 */
export const globalRenderCache = new RenderCache();

