/*
 * Radial Timeline Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 * 
 * Runtime Estimation Commands
 */

import { TFile, Notice } from 'obsidian';
import type RadialTimelinePlugin from './main';
import { RuntimeProcessingModal, type RuntimeScope, type RuntimeStatusFilters } from './modals/RuntimeProcessingModal';
import { estimateRuntime, getRuntimeSettings, formatRuntimeValue, parseRuntimeField } from './utils/runtimeEstimator';
import { isBeatNote } from './utils/sceneHelpers';
import { normalizeStatus } from './utils/text';
import type { TimelineItem } from './types';

interface SceneToProcess {
    file: TFile;
    path: string;
    title: string;
    subplot?: string;
    existingRuntime?: string;
    body: string;
}

/**
 * Check if a scene's status matches the filters
 */
function matchesStatusFilter(scene: TimelineItem, filters: RuntimeStatusFilters): boolean {
    const normalized = normalizeStatus(scene.status);
    
    // Map to our filter categories
    const isTodo = !normalized || normalized === 'Todo';
    const isWorking = normalized === 'Working';
    const isComplete = normalized === 'Completed';
    
    if (isTodo && filters.includeTodo) return true;
    if (isWorking && filters.includeWorking) return true;
    if (isComplete && filters.includeComplete) return true;
    
    return false;
}

/**
 * Get scene files matching the specified scope and status filters
 */
async function getScenesForScope(
    plugin: RadialTimelinePlugin,
    scope: RuntimeScope,
    subplotFilter: string | undefined,
    overrideExisting: boolean,
    statusFilters: RuntimeStatusFilters
): Promise<SceneToProcess[]> {
    const scenes = await plugin.getSceneData();
    const vault = plugin.app.vault;
    const result: SceneToProcess[] = [];

    // Build the list of scenes to process based on scope
    let targetScenes: TimelineItem[];

    if (scope === 'current') {
        // Only process the currently active file
        const activeFile = plugin.app.workspace.getActiveFile();
        if (!activeFile) {
            return [];
        }
        targetScenes = scenes.filter(s => s.path === activeFile.path);
    } else if (scope === 'subplot') {
        // Filter by subplot
        const normalizedFilter = (subplotFilter || 'Main Plot').trim().toLowerCase();
        targetScenes = scenes.filter(s => {
            if (isBeatNote(s)) return false;
            const sub = s.subplot && s.subplot.trim() ? s.subplot.trim().toLowerCase() : 'main plot';
            return sub === normalizedFilter;
        });
    } else {
        // All scenes
        targetScenes = scenes.filter(s => !isBeatNote(s));
    }

    // Filter by status
    targetScenes = targetScenes.filter(scene => matchesStatusFilter(scene, statusFilters));

    // Filter by existing runtime if not overriding
    for (const scene of targetScenes) {
        if (!scene.path) continue;

        const hasExistingRuntime = scene.Runtime && parseRuntimeField(scene.Runtime) !== null && parseRuntimeField(scene.Runtime)! > 0;
        
        // Skip if has existing runtime and we're not overriding
        if (hasExistingRuntime && !overrideExisting) {
            continue;
        }

        const file = vault.getAbstractFileByPath(scene.path);
        if (!(file instanceof TFile)) continue;

        // Read file content to get the body (excluding frontmatter)
        const content = await vault.read(file);
        const body = extractBody(content);

        result.push({
            file,
            path: scene.path,
            title: scene.title || file.basename,
            subplot: scene.subplot,
            existingRuntime: scene.Runtime,
            body,
        });
    }

    return result;
}

/**
 * Extract body content from file (excluding frontmatter)
 */
function extractBody(content: string): string {
    const frontmatterMatch = content.match(/^---\s*\n[\s\S]*?\n---\s*\n?/);
    if (frontmatterMatch) {
        return content.slice(frontmatterMatch[0].length);
    }
    return content;
}

/**
 * Update a scene file's Runtime field
 */
async function updateSceneRuntime(
    plugin: RadialTimelinePlugin,
    file: TFile,
    runtimeSeconds: number
): Promise<boolean> {
    try {
        const runtimeValue = formatRuntimeValue(runtimeSeconds);
        
        await plugin.app.fileManager.processFrontMatter(file, (fm) => {
            const fmObj = fm as Record<string, unknown>;
            fmObj['Runtime'] = runtimeValue;
        });
        
        return true;
    } catch (e) {
        console.error('[updateSceneRuntime] Error updating file:', e);
        return false;
    }
}

/**
 * Process scenes for runtime estimation
 */
async function processScenes(
    plugin: RadialTimelinePlugin,
    scope: RuntimeScope,
    subplotFilter: string | undefined,
    overrideExisting: boolean,
    statusFilters: RuntimeStatusFilters,
    modal: RuntimeProcessingModal
): Promise<void> {
    const scenes = await getScenesForScope(plugin, scope, subplotFilter, overrideExisting, statusFilters);
    
    if (scenes.length === 0) {
        new Notice('No scenes to process.');
        return;
    }

    modal.setTotalCount(scenes.length);
    const settings = getRuntimeSettings(plugin.settings);

    let processed = 0;
    let totalRuntime = 0;
    let errors = 0;

    for (const scene of scenes) {
        if (modal.isAborted()) {
            break;
        }

        try {
            // Estimate runtime from content
            const result = estimateRuntime(scene.body, settings);
            
            // Update file frontmatter
            const success = await updateSceneRuntime(plugin, scene.file, result.totalSeconds);
            
            if (success) {
                processed++;
                totalRuntime += result.totalSeconds;
                modal.updateProgress(processed, scenes.length, scene.title, result.totalSeconds);
            } else {
                errors++;
            }
        } catch (e) {
            console.error(`Error processing ${scene.path}:`, e);
            errors++;
        }
    }

    // Refresh timeline
    plugin.refreshTimelineIfNeeded(null);
    
    if (errors > 0) {
        new Notice(`Runtime estimation complete. ${processed} scenes updated, ${errors} errors.`);
    } else {
        new Notice(`Runtime estimation complete! ${processed} scenes updated. Total: ${formatRuntimeValue(totalRuntime)}`);
    }
}

/**
 * Get count of scenes matching scope and filters
 */
async function getSceneCount(
    plugin: RadialTimelinePlugin,
    scope: RuntimeScope,
    subplotFilter: string | undefined,
    overrideExisting: boolean,
    statusFilters: RuntimeStatusFilters
): Promise<number> {
    const scenes = await getScenesForScope(plugin, scope, subplotFilter, overrideExisting, statusFilters);
    return scenes.length;
}

/**
 * Open the Runtime Estimator modal
 */
export function openRuntimeEstimator(plugin: RadialTimelinePlugin): void {
    let modalInstance: RuntimeProcessingModal | null = null;
    
    const modal = new RuntimeProcessingModal(
        plugin.app,
        plugin,
        (scope, subplotFilter, overrideExisting, statusFilters) => 
            getSceneCount(plugin, scope, subplotFilter, overrideExisting, statusFilters),
        (scope, subplotFilter, overrideExisting, statusFilters) => {
            if (!modalInstance) {
                throw new Error('Modal not initialized');
            }
            return processScenes(plugin, scope, subplotFilter, overrideExisting, statusFilters, modalInstance);
        }
    );
    modalInstance = modal;
    modal.open();
}

/**
 * Register runtime commands
 */
export function registerRuntimeCommands(plugin: RadialTimelinePlugin): void {
    plugin.addCommand({
        id: 'runtime-estimator',
        name: 'Runtime estimator',
        callback: () => openRuntimeEstimator(plugin),
    });
}
