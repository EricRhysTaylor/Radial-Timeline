/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */
import type { TimelineItem } from '../types';
import type { GlobalPovMode } from '../types/settings';
import { parseWhenField } from './date';

const STATUSES_REQUIRING_WHEN = new Set(['working', 'complete']);

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
 * Check if a Class field represents a story beat
 * Accepts both "Plot" (legacy) and "Beat" (recommended), case-insensitive
 */
export function isStoryBeat(classValue: unknown): boolean {
    if (typeof classValue !== 'string') return false;
    const normalized = classValue.toLowerCase().trim();
    return normalized === 'plot' || normalized === 'beat';
}

/**
 * Check if a scene is a beat note (supports both new 'Beat' and legacy 'Plot' itemType)
 */
export function isBeatNote(scene: TimelineItem | { itemType?: string }): boolean {
    return scene.itemType === 'Beat' || scene.itemType === 'Plot';
}

/**
 * Sort scenes based on plugin settings
 * @param scenes - Scenes to sort
 * @param sortByWhen - If true, sort by When date; if false, sort by manuscript order
 * @param forceChronological - If true, always use chronological sort (for Chronologue mode)
 */
export function sortScenes(
    scenes: TimelineItem[], 
    sortByWhen: boolean, 
    forceChronological: boolean = false
): TimelineItem[] {
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
        subplotColors: string[];
        targetCompletionDate?: string;
        enableAiSceneAnalysis: boolean;
        showEstimate?: boolean;
        chronologueDurationCapSelection?: string;
        dominantSubplots?: Record<string, string>;
        discontinuityThreshold?: string;
        globalPovMode?: GlobalPovMode;
    };
    searchActive: boolean;
    searchResults: Set<string>;
    searchTerm: string;
    openScenePaths: Set<string>;
    desaturateColor(hex: string, amount: number): string;
    calculateCompletionEstimate(scenes: TimelineItem[]): { date: Date | null; total: number; remaining: number; rate: number } | null;
    synopsisManager: { generateElement: (scene: TimelineItem, contentLines: string[], sceneId: string, subplotIndexResolver?: (name: string) => number) => SVGGElement };
    latestStatusCounts?: Record<string, number>;
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
    scene: TimelineItem, 
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
export function getSceneState(scene: TimelineItem, plugin: PluginRendererFacade): SceneState {
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

function normalizeStatusValue(status: TimelineItem['status']): string | null {
    if (!status) return null;
    if (Array.isArray(status)) {
        for (const entry of status) {
            if (typeof entry === 'string') {
                const trimmed = entry.trim();
                if (trimmed) return trimmed;
            }
        }
        return null;
    }
    if (typeof status === 'string') {
        const trimmed = status.trim();
        return trimmed || null;
    }
    return null;
}

export function shouldDisplayMissingWhenWarning(scene?: TimelineItem): boolean {
    if (!scene || !scene.missingWhen) return false;
    const normalizedStatus = normalizeStatusValue(scene.status);
    if (!normalizedStatus) return false;
    return STATUSES_REQUIRING_WHEN.has(normalizedStatus.toLowerCase());
}

/**
 * Sort scenes chronologically by their When field
 * Scenes without When field fall back to manuscript order (prefix number, then alphanumeric)
 */
export function sortScenesChronologically(scenes: TimelineItem[]): TimelineItem[] {
    return scenes.slice().sort((a, b) => {
        // Parse When fields - handle both Date objects and strings
        const aWhen = a.when instanceof Date ? a.when : parseWhenField(typeof a.when === 'string' ? a.when : '');
        const bWhen = b.when instanceof Date ? b.when : parseWhenField(typeof b.when === 'string' ? b.when : '');
        const aHasWhen = !!(aWhen && !isNaN(aWhen.getTime()));
        const bHasWhen = !!(bWhen && !isNaN(bWhen.getTime()));
        
        // If both have When fields, sort by date
        if (aHasWhen && bHasWhen && aWhen && bWhen) {
            const timeDiff = aWhen.getTime() - bWhen.getTime();
            if (timeDiff !== 0) return timeDiff;
            
            // If same time, fall back to manuscript order (scene number)
            return sortByManuscriptOrder(a, b);
        }
        
        // If neither has a valid When, fall back to manuscript order
        if (!aHasWhen && !bHasWhen) {
            return sortByManuscriptOrder(a, b);
        }
        
        // Scenes missing When should be surfaced earliest (placed at beginning)
        if (!aHasWhen && bHasWhen) return -1;
        if (aHasWhen && !bHasWhen) return 1;
        
        return 0;
    });
}

/**
 * Extract a numeric position from a scene or beat note for sorting
 * Returns the filename prefix number (e.g., "01 Scene" → 1)
 * Returns Infinity if no prefix found (sorts to end)
 */
export function extractPosition(item: TimelineItem): number {
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
export function sortByManuscriptOrder(a: TimelineItem, b: TimelineItem): number {
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
