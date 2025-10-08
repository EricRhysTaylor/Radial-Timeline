/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */
import { Scene } from '../main';

export interface PluginRendererFacade {
    settings: {
        publishStageColors: Record<string, string>;
        debug: boolean;
        targetCompletionDate?: string;
        outerRingAllScenes?: boolean;
        enableAiBeats: boolean;
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
 * Helper function to extract AI grades from scenes
 */
export function extractGradeFromScene(
    scene: Scene, 
    sceneId: string, 
    sceneGrades: Map<string, string>, 
    plugin: PluginRendererFacade
): void {
    if (scene["2beats"]) {
        try {
            const firstLine2Beats = scene["2beats"].split('\n')[0]?.trim() || '';
            // Updated regex to match "[Number] [GradeLetter] / [Comment]" with optional YAML list marker
            const gradeMatch = firstLine2Beats.match(/^-?\s*(?:\d+(?:\.\d+)?\s+)?([ABC])(?![A-Za-z0-9])/i);
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
