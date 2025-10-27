/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */
import { Scene } from '../main';
import { parseWhenField } from './date';

export interface PluginRendererFacade {
    settings: {
        publishStageColors: Record<string, string>;
        debug: boolean;
        targetCompletionDate?: string;
        enableAiSceneAnalysis: boolean;
        showEstimate?: boolean;
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
 */
export function extractGradeFromScene(
    scene: Scene, 
    sceneId: string, 
    sceneGrades: Map<string, string>, 
    plugin: PluginRendererFacade
): void {
    if (scene["currentSceneAnalysis"]) {
        try {
            const firstLineCurrentAnalysis = scene["currentSceneAnalysis"].split('\n')[0]?.trim() || '';
            // Updated regex to match "[Number] [GradeLetter] / [Comment]" with optional YAML list marker
            const gradeMatch = firstLineCurrentAnalysis.match(/^-?\s*(?:\d+(?:\.\d+)?\s+)?([ABC])(?![A-Za-z0-9])/i);
            if (gradeMatch && gradeMatch[1]) {
                const grade = gradeMatch[1].toUpperCase();
                sceneGrades.set(sceneId, grade);
            }
        } catch (e) {
            // Silently handle errors per plugin guidelines
        }
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
        // Parse When fields
        const aWhen = parseWhenField(typeof a.when === 'string' ? a.when : '');
        const bWhen = parseWhenField(typeof b.when === 'string' ? b.when : '');
        
        // If both have When fields, sort by date
        if (aWhen && bWhen) {
            const timeDiff = aWhen.getTime() - bWhen.getTime();
            if (timeDiff !== 0) return timeDiff;
            
            // If same time, maintain stable sort by title
            return (a.title || '').localeCompare(b.title || '');
        }
        
        // If only one has When field, the one without goes first
        if (aWhen && !bWhen) return 1;
        if (!aWhen && bWhen) return -1;
        
        // If neither has When field, fall back to manuscript order
        return sortByManuscriptOrder(a, b);
    });
}

/**
 * Sort scenes by manuscript order (prefix number, then alphanumeric)
 */
function sortByManuscriptOrder(a: Scene, b: Scene): number {
    const aTitle = a.title || '';
    const bTitle = b.title || '';
    
    // Extract prefix numbers
    const aMatch = aTitle.match(/^(\d+(?:\.\d+)?)\s*/);
    const bMatch = bTitle.match(/^(\d+(?:\.\d+)?)\s*/);
    
    // If both have prefix numbers, sort numerically
    if (aMatch && bMatch) {
        const aNum = parseFloat(aMatch[1]);
        const bNum = parseFloat(bMatch[1]);
        const numDiff = aNum - bNum;
        if (numDiff !== 0) return numDiff;
        
        // If numbers are equal, sort by full title
        return aTitle.localeCompare(bTitle);
    }
    
    // If only one has prefix number, it comes first
    if (aMatch && !bMatch) return -1;
    if (!aMatch && bMatch) return 1;
    
    // If neither has prefix number, sort alphanumerically
    return aTitle.localeCompare(bTitle);
}
