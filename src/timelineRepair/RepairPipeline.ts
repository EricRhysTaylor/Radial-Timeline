/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 *
 * Timeline Repair Wizard - Pipeline Orchestrator
 * Coordinates Level 1 → Level 2 → Level 3 analysis.
 */

import type { TFile, Vault } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import type { TimelineItem } from '../types';
import type {
    RepairPipelineConfig,
    RepairPipelineResult,
    RepairSceneEntry
} from './types';
import { runPatternSync, type PatternSyncInput } from './patternSync';
import { runKeywordSweep } from './keywordSweep';
import { runAiTemporalParse } from './aiTemporalParse';

// ============================================================================
// Pipeline Execution
// ============================================================================

export interface PipelineCallbacks {
    /** Called when pipeline phase changes */
    onPhaseChange?: (phase: 'level1' | 'level2' | 'level3' | 'complete') => void;
    
    /** Called for Level 3 AI progress */
    onAiProgress?: (current: number, total: number, sceneName: string) => void;
    
    /** Abort signal for cancellation */
    abortSignal?: AbortSignal;
}

/**
 * Run the complete repair pipeline.
 * 
 * Flow:
 * 1. Level 1: Pattern Sync - deterministic baseline
 * 2. Level 2: Keyword Sweep - heuristic refinement (if enabled)
 * 3. Level 3: AI Parse - intelligent inference (if enabled)
 * 
 * @param scenes - Scenes in manuscript order
 * @param files - Corresponding TFile references
 * @param plugin - Plugin instance
 * @param config - Pipeline configuration
 * @param callbacks - Progress callbacks
 * @returns Pipeline result with entries and statistics
 */
export async function runRepairPipeline(
    scenes: TimelineItem[],
    files: Map<string, TFile>,
    plugin: RadialTimelinePlugin,
    config: RepairPipelineConfig,
    callbacks: PipelineCallbacks = {}
): Promise<RepairPipelineResult> {
    const vault = plugin.app.vault;
    
    // Build input for pattern sync
    const inputs: PatternSyncInput[] = [];
    for (let i = 0; i < scenes.length; i++) {
        const scene = scenes[i];
        const file = scene.path ? files.get(scene.path) : undefined;
        
        // Skip scenes without files
        if (!file) continue;
        
        // Apply scope filters
        if (config.subplotFilter && scene.subplot !== config.subplotFilter) continue;
        if (config.actFilter !== undefined && scene.actNumber !== config.actFilter) continue;
        
        inputs.push({
            scene,
            file,
            manuscriptIndex: i
        });
    }
    
    if (inputs.length === 0) {
        return createEmptyResult();
    }
    
    // ========================================================================
    // Level 1: Pattern Sync
    // ========================================================================
    callbacks.onPhaseChange?.('level1');
    
    let entries = runPatternSync(inputs, {
        anchorWhen: config.anchorWhen,
        anchorSceneIndex: config.anchorSceneIndex,
        patternPreset: config.patternPreset
    });
    
    const level1Count = entries.length;
    
    // Check for abort
    if (callbacks.abortSignal?.aborted) {
        return buildResult(entries, level1Count, 0, 0);
    }
    
    // ========================================================================
    // Level 2: Keyword Sweep
    // ========================================================================
    if (config.runLevel2) {
        callbacks.onPhaseChange?.('level2');
        
        entries = await runKeywordSweep(
            entries,
            (entry) => getSceneBodyText(vault, entry),
            { includeSynopsis: true }
        );
    }
    
    const level2Count = entries.filter(e => e.source === 'keyword').length;
    
    // Check for abort
    if (callbacks.abortSignal?.aborted) {
        return buildResult(entries, level1Count, level2Count, 0);
    }
    
    // ========================================================================
    // Level 3: AI Temporal Parse
    // ========================================================================
    let level3Count = 0;
    
    if (config.runLevel3) {
        callbacks.onPhaseChange?.('level3');
        
        const entriesBefore = entries.filter(e => e.source === 'ai').length;
        
        entries = await runAiTemporalParse(
            entries,
            plugin,
            (entry) => getSceneBodyText(vault, entry),
            {
                autoApplyThreshold: config.aiConfidenceThreshold,
                inferDuration: config.inferDuration,
                onProgress: callbacks.onAiProgress,
                abortSignal: callbacks.abortSignal
            }
        );
        
        level3Count = entries.filter(e => e.source === 'ai').length - entriesBefore;
    }
    
    callbacks.onPhaseChange?.('complete');
    
    return buildResult(entries, level1Count, level2Count, level3Count);
}

/**
 * Get the body text of a scene file (excluding frontmatter).
 */
async function getSceneBodyText(vault: Vault, entry: RepairSceneEntry): Promise<string> {
    try {
        const content = await vault.cachedRead(entry.file);
        
        // Strip frontmatter
        const fmMatch = content.match(/^---\n[\s\S]*?\n---\n?/);
        if (fmMatch) {
            return content.slice(fmMatch[0].length);
        }
        
        return content;
    } catch {
        return '';
    }
}

/**
 * Build the pipeline result object.
 */
function buildResult(
    entries: RepairSceneEntry[],
    level1Applied: number,
    level2Refined: number,
    level3Refined: number
): RepairPipelineResult {
    return {
        entries,
        totalScenes: entries.length,
        scenesChanged: entries.filter(e => e.isChanged).length,
        scenesNeedingReview: entries.filter(e => e.needsReview).length,
        scenesWithBackwardTime: entries.filter(e => e.hasBackwardTime).length,
        scenesWithLargeGaps: entries.filter(e => e.hasLargeGap).length,
        level1Applied,
        level2Refined,
        level3Refined
    };
}

/**
 * Create an empty result for edge cases.
 */
function createEmptyResult(): RepairPipelineResult {
    return {
        entries: [],
        totalScenes: 0,
        scenesChanged: 0,
        scenesNeedingReview: 0,
        scenesWithBackwardTime: 0,
        scenesWithLargeGaps: 0,
        level1Applied: 0,
        level2Refined: 0,
        level3Refined: 0
    };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Collect scenes and their file references from plugin data.
 * Returns scenes in manuscript order.
 */
export async function collectScenesForRepair(
    plugin: RadialTimelinePlugin
): Promise<{ scenes: TimelineItem[]; files: Map<string, TFile> }> {
    // Get scenes in manuscript order
    const scenes = await plugin.getSceneData();
    
    // Build file map
    const files = new Map<string, TFile>();
    for (const scene of scenes) {
        if (scene.path) {
            const tfile = plugin.app.vault.getFileByPath(scene.path);
            if (tfile) {
                files.set(scene.path, tfile);
            }
        }
    }
    
    return { scenes, files };
}

/**
 * Filter scenes by subplot.
 */
export function filterBySubplot(
    scenes: TimelineItem[],
    subplot: string
): TimelineItem[] {
    return scenes.filter(s => s.subplot === subplot);
}

/**
 * Filter scenes by act.
 */
export function filterByAct(
    scenes: TimelineItem[],
    actNumber: number
): TimelineItem[] {
    return scenes.filter(s => s.actNumber === actNumber);
}

/**
 * Get unique subplots from scenes.
 */
export function getUniqueSubplots(scenes: TimelineItem[]): string[] {
    const subplots = new Set<string>();
    for (const scene of scenes) {
        if (scene.subplot) {
            subplots.add(scene.subplot);
        }
    }
    return Array.from(subplots).sort();
}

/**
 * Get unique acts from scenes.
 */
export function getUniqueActs(scenes: TimelineItem[]): number[] {
    const acts = new Set<number>();
    for (const scene of scenes) {
        if (scene.actNumber !== undefined) {
            acts.add(scene.actNumber);
        }
    }
    return Array.from(acts).sort((a, b) => a - b);
}

