/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */
import { Scene } from '../main';
import { parseWhenField } from './date';

/**
 * Normalize a value to a boolean
 * Handles various input types (boolean, string, number)
 */
export function normalizeBooleanValue(value: unknown): boolean {
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'string') {
        const lower = value.toLowerCase().trim();
        // Handle empty string or just whitespace as false
        if (lower === '' || lower === ' ') {
            return false;
        }
        return lower === 'yes' || lower === 'true' || lower === '1';
    }
    if (typeof value === 'number') {
        return value === 1;
    }
    // Handle null, undefined, or any other falsy value as false
    return false;
}

/**
 * Check if a scene is a beat note (supports both new 'Beat' and legacy 'Plot' itemType)
 */
export function isBeatNote(scene: Scene | { itemType?: string }): boolean {
    return scene.itemType === 'Beat' || scene.itemType === 'Plot';
}

/**
 * Sort scenes based on plugin settings
 * @param scenes - Scenes to sort
 * @param sortByWhen - If true, sort by When date; if false, sort by manuscript order
 * @param forceChronological - If true, always use chronological sort (for Chronologue mode)
 */
export function sortScenes(
    scenes: Scene[], 
    sortByWhen: boolean, 
    forceChronological: boolean = false
): Scene[] {
    // When sorting by manuscript order, treat beats and scenes together
    if (!forceChronological && !sortByWhen) {
        return scenes.slice().sort(sortByManuscriptOrder);
    }
    
    // When sorting chronologically (by When date):
    // Both beats and scenes can have When dates and should be sorted together
    return sortScenesChronologically(scenes);
}

export interface PluginRendererFacade {
    settings: {
        publishStageColors: Record<string, string>;
        targetCompletionDate?: string;
        enableAiSceneAnalysis: boolean;
        showEstimate?: boolean;
        chronologueDurationCapSelection?: string;
        dominantSubplots?: Record<string, string>;
    };
    searchActive: boolean;
    searchResults: Set<string>;
    searchTerm: string;
    openScenePaths: Set<string>;
    desaturateColor(hex: string, amount: number): string;
    lightenColor(hex: string, percent: number): string;
    darkenColor(hex: string, percent: number): string;
    calculateCompletionEstimate(scenes: Scene[]): { date: Date; total: number; remaining: number; rate: number } | null;
    log<T>(message: string, data?: T): void;
    synopsisManager: { generateElement: (scene: Scene, contentLines: string[], sceneId: string, subplotIndexResolver?: (name: string) => number) => SVGGElement };
    safeSvgText(text: string): string;
    latestStatusCounts?: Record<string, number>;
    splitIntoBalancedLines: (text: string, maxWidth: number) => string[];
}

export interface SceneState {
    isSceneOpen: boolean;
    isSearchMatch: boolean;
    hasEdits: boolean;
}

/**
 * Helper function to extract AI scene analysis grades from scenes
 * Only processes if AI features are enabled to avoid performance overhead
 * Optimized with caching to avoid repeated string operations
 */
export function extractGradeFromScene(
    scene: Scene, 
    sceneId: string, 
    sceneGrades: Map<string, string>, 
    plugin: PluginRendererFacade
): void {
    // Early return if AI features disabled - avoid all string processing
    if (!plugin.settings.enableAiSceneAnalysis) return;
    
    const analysisText = scene["currentSceneAnalysis"];
    if (!analysisText) return;
    
    try {
        // Optimize: only split once and get first line
        const firstLine = typeof analysisText === 'string' 
            ? analysisText.substring(0, analysisText.indexOf('\n') > -1 ? analysisText.indexOf('\n') : analysisText.length).trim()
            : '';
        
        if (!firstLine) return;
        
        // Updated regex to match "[Number] [GradeLetter] / [Comment]" with optional YAML list marker
        const gradeMatch = firstLine.match(/^-?\s*(?:\d+(?:\.\d+)?\s+)?([ABC])(?![A-Za-z0-9])/i);
        if (gradeMatch && gradeMatch[1]) {
            sceneGrades.set(sceneId, gradeMatch[1].toUpperCase());
        }
    } catch (e) {
        // Silently handle errors per plugin guidelines
    }
}

/**
 * Helper function to check scene state
 */
export function getSceneState(scene: Scene, plugin: PluginRendererFacade): SceneState {
    const isSceneOpen = !!(scene.path && plugin.openScenePaths.has(scene.path));
    const isSearchMatch = !!(plugin.searchActive && scene.path && plugin.searchResults.has(scene.path));
    const hasEdits = !!(scene.pendingEdits && scene.pendingEdits.trim() !== '');
    return { isSceneOpen, isSearchMatch, hasEdits };
}

/**
 * Helper function to build square classes
 */
export function buildSquareClasses(
    isSceneOpen: boolean, 
    isSearchMatch: boolean, 
    hasEdits: boolean
): string {
    let classes = 'rt-number-square';
    if (isSceneOpen) classes += ' rt-scene-is-open';
    if (isSearchMatch) classes += ' rt-search-result';
    if (hasEdits) classes += ' rt-has-edits';
    return classes;
}

/**
 * Helper function to build text classes
 */
export function buildTextClasses(
    isSceneOpen: boolean, 
    isSearchMatch: boolean, 
    hasEdits: boolean
): string {
    let classes = 'rt-number-text';
    if (isSceneOpen) classes += ' rt-scene-is-open';
    if (isSearchMatch) classes += ' rt-search-result';
    if (hasEdits) classes += ' rt-has-edits';
    return classes;
}

/**
 * Sort scenes chronologically by their When field
 * Scenes without When field fall back to manuscript order (prefix number, then alphanumeric)
 */
export function sortScenesChronologically(scenes: Scene[]): Scene[] {
    return scenes.slice().sort((a, b) => {
        // Parse When fields - handle both Date objects and strings
        const aWhen = a.when instanceof Date ? a.when : parseWhenField(typeof a.when === 'string' ? a.when : '');
        const bWhen = b.when instanceof Date ? b.when : parseWhenField(typeof b.when === 'string' ? b.when : '');
        
        // If both have When fields, sort by date
        if (aWhen && bWhen) {
            const timeDiff = aWhen.getTime() - bWhen.getTime();
            if (timeDiff !== 0) return timeDiff;
            
            // If same time, fall back to manuscript order (scene number)
            return sortByManuscriptOrder(a, b);
        }
        
        // If only one has When field, the one with When comes first
        if (aWhen && !bWhen) return -1;
        if (!aWhen && bWhen) return 1;
        
        // If neither has When field, fall back to manuscript order
        return sortByManuscriptOrder(a, b);
    });
}

/**
 * Extract a numeric position from a scene or beat note for sorting
 * Returns the filename prefix number (e.g., "01 Scene" → 1)
 * Returns Infinity if no prefix found (sorts to end)
 */
export function extractPosition(item: Scene): number {
    const title = item.title || '';
    
    // Extract prefix number
    const prefixMatch = title.match(/^(\d+(?:\.\d+)?)\s*/);
    if (prefixMatch) {
        return parseFloat(prefixMatch[1]);
    }
    
    // No position found
    return Infinity;
}

/**
 * Sort scenes by manuscript order (prefix number, then alphanumeric)
 */
export function sortByManuscriptOrder(a: Scene, b: Scene): number {
    // Extract positions (prefix or Range for beats)
    const aPos = extractPosition(a);
    const bPos = extractPosition(b);
    
    // Sort by position
    if (aPos !== bPos) {
        // If both are Infinity (no position), fall back to alphanumeric
        if (aPos === Infinity && bPos === Infinity) {
            return (a.title || '').localeCompare(b.title || '');
        }
        return aPos - bPos;
    }
    
    // If positions are equal, sort by full title
    return (a.title || '').localeCompare(b.title || '');
}
