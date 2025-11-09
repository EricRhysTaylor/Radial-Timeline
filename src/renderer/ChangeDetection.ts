/**
 * Radial Timeline Plugin for Obsidian — Change Detection
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import type { Scene } from '../main';

/**
 * Types of changes that can trigger renders
 */
export enum ChangeType {
    NONE = 'none',
    SCENE_DATA = 'scene_data',        // Scenes added/removed/modified
    OPEN_FILES = 'open_files',        // Files opened/closed
    SEARCH = 'search',                // Search term changed
    MODE = 'mode',                    // View mode changed
    SETTINGS = 'settings',            // Settings changed
    TIME = 'time',                    // Time-based (year progress, month)
    GOSSAMER = 'gossamer',            // Gossamer data updated
    DOMINANT_SUBPLOT = 'dominant_subplot',  // Dominant subplot changed (scene colors only)
    SYNOPSIS = 'synopsis',            // Synopsis text changed
}

/**
 * Snapshot of timeline state for change detection
 */
export interface TimelineSnapshot {
    // Scene data
    sceneCount: number;
    sceneHash: string;
    
    // UI state
    openFilePaths: Set<string>;
    searchActive: boolean;
    searchResults: Set<string>;
    currentMode: string;
    
    // Time-based
    currentMonth: number;
    currentDate: string; // YYYY-MM-DD
    
    // Settings that affect rendering
    sortByWhen: boolean;
    showEstimate: boolean;
    aiEnabled: boolean;
    targetDate: string | undefined;
    chronologueDurationCap: string | undefined;
    publishStageColorsHash: string;
    subplotColorsHash: string;
    dominantSubplotsHash: string;
    
    // Gossamer
    gossamerRunExists: boolean;
    
    timestamp: number;
}

/**
 * Result of change detection
 */
export interface ChangeDetectionResult {
    hasChanges: boolean;
    changeTypes: Set<ChangeType>;
    canUseSelectiveUpdate: boolean;
    updateStrategy: 'full' | 'selective' | 'none';
}

/**
 * Create a snapshot of current timeline state
 */
export function createSnapshot(
    scenes: Scene[],
    openFilePaths: Set<string>,
    searchActive: boolean,
    searchResults: Set<string>,
    currentMode: string,
    settings: any, // SAFE: any type used for settings object with dynamic properties from plugin
    gossamerRun: any // SAFE: any type used for gossamer run data structure
): TimelineSnapshot {
    // Create comprehensive hash of scene data that includes all rendering-relevant fields
    const sceneHash = scenes
        .map(s => {
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
                s.Description || '',
                // Range field (rendered in Gossamer mode)
                s.Range || '',
                (s.Character || []).length,
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
    
    // Hash color settings to detect changes
    const publishStageColorsHash = settings.publishStageColors 
        ? JSON.stringify(settings.publishStageColors)
        : '';
    const subplotColorsHash = settings.subplotColors 
        ? JSON.stringify(settings.subplotColors)
        : '';
    const dominantSubplotsHash = settings.dominantSubplots
        ? JSON.stringify(settings.dominantSubplots)
        : '';
    
    const now = new Date();
    
    return {
        sceneCount: scenes.length,
        sceneHash,
        openFilePaths: new Set(openFilePaths),
        searchActive,
        searchResults: new Set(searchResults),
        currentMode,
        currentMonth: now.getMonth(),
        currentDate: now.toISOString().split('T')[0],
        sortByWhen: settings.sortByWhenDate ?? false,
        showEstimate: settings.showEstimate ?? true,
        aiEnabled: settings.enableAiSceneAnalysis ?? false,
        targetDate: settings.targetCompletionDate,
        chronologueDurationCap: settings.chronologueDurationCapSelection,
        publishStageColorsHash,
        subplotColorsHash,
        dominantSubplotsHash,
        gossamerRunExists: !!gossamerRun,
        timestamp: Date.now()
    };
}

/**
 * Compare two snapshots and detect what changed
 */
export function detectChanges(
    prev: TimelineSnapshot | null,
    current: TimelineSnapshot
): ChangeDetectionResult {
    const changeTypes = new Set<ChangeType>();
    
    if (!prev) {
        // First render - always full render
        return {
            hasChanges: true,
            changeTypes: new Set([ChangeType.SCENE_DATA]),
            canUseSelectiveUpdate: false,
            updateStrategy: 'full'
        };
    }
    
    // Detect scene data changes
    if (prev.sceneHash !== current.sceneHash || prev.sceneCount !== current.sceneCount) {
        changeTypes.add(ChangeType.SCENE_DATA);
    }
    
    // Detect open file changes
    if (!setsEqual(prev.openFilePaths, current.openFilePaths)) {
        changeTypes.add(ChangeType.OPEN_FILES);
    }
    
    // Detect search changes
    if (prev.searchActive !== current.searchActive || !setsEqual(prev.searchResults, current.searchResults)) {
        changeTypes.add(ChangeType.SEARCH);
    }
    
    // Detect mode changes
    if (prev.currentMode !== current.currentMode) {
        changeTypes.add(ChangeType.MODE);
    }
    
    // Detect settings changes (excluding dominant subplots - handled separately)
    if (prev.sortByWhen !== current.sortByWhen || 
        prev.showEstimate !== current.showEstimate ||
        prev.aiEnabled !== current.aiEnabled ||
        prev.targetDate !== current.targetDate ||
        prev.chronologueDurationCap !== current.chronologueDurationCap ||
        prev.publishStageColorsHash !== current.publishStageColorsHash ||
        prev.subplotColorsHash !== current.subplotColorsHash) {
        changeTypes.add(ChangeType.SETTINGS);
    }
    
    // Detect dominant subplot changes separately (for selective update)
    if (prev.dominantSubplotsHash !== current.dominantSubplotsHash) {
        changeTypes.add(ChangeType.DOMINANT_SUBPLOT);
    }
    
    // Detect time changes
    if (prev.currentMonth !== current.currentMonth || prev.currentDate !== current.currentDate) {
        changeTypes.add(ChangeType.TIME);
    }
    
    // Detect gossamer changes
    if (prev.gossamerRunExists !== current.gossamerRunExists) {
        changeTypes.add(ChangeType.GOSSAMER);
    }
    
    // Determine update strategy
    const hasChanges = changeTypes.size > 0;
    
    // Selective updates are possible for certain change types only
    const selectiveChangeTypes = [
        ChangeType.OPEN_FILES, 
        ChangeType.SEARCH, 
        ChangeType.TIME,
        ChangeType.DOMINANT_SUBPLOT,  // DOM update for scene colors
        ChangeType.SYNOPSIS            // DOM update for synopsis text
    ];
    const canUseSelectiveUpdate = hasChanges && 
        Array.from(changeTypes).every(type => selectiveChangeTypes.includes(type));
    
    let updateStrategy: 'full' | 'selective' | 'none' = 'none';
    if (hasChanges) {
        updateStrategy = canUseSelectiveUpdate ? 'selective' : 'full';
    }
    
    return {
        hasChanges,
        changeTypes,
        canUseSelectiveUpdate,
        updateStrategy
    };
}

/**
 * Helper: Compare two sets for equality
 */
function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
    if (a.size !== b.size) return false;
    for (const item of a) {
        if (!b.has(item)) return false;
    }
    return true;
}

/**
 * Get a human-readable description of changes
 */
export function describeChanges(result: ChangeDetectionResult): string {
    if (!result.hasChanges) {
        return 'No changes detected';
    }
    
    const changes = Array.from(result.changeTypes).map(type => {
        switch (type) {
            case ChangeType.SCENE_DATA: return 'scene data';
            case ChangeType.OPEN_FILES: return 'open files';
            case ChangeType.SEARCH: return 'search';
            case ChangeType.MODE: return 'mode';
            case ChangeType.SETTINGS: return 'settings';
            case ChangeType.TIME: return 'time';
            case ChangeType.GOSSAMER: return 'gossamer';
            default: return type;
        }
    }).join(', ');
    
    return `Changes detected: ${changes} (strategy: ${result.updateStrategy})`;
}

