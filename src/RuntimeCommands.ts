/*
 * Radial Timeline Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 * 
 * Runtime Estimation Commands
 */

import { TFile, Notice } from 'obsidian';
import type RadialTimelinePlugin from './main';
import { RuntimeProcessingModal, type RuntimeScope, type RuntimeStatusFilters, type RuntimeMode, type RuntimeProcessResult } from './modals/RuntimeProcessingModal';
import { estimateRuntime, getRuntimeSettings, formatRuntimeValue, parseRuntimeField } from './utils/runtimeEstimator';
import { isBeatNote } from './utils/sceneHelpers';
import { normalizeStatus } from './utils/text';
import type { TimelineItem } from './types';
import { callProvider } from './api/providerRouter';
import { isProfessionalActive } from './settings/sections/ProfessionalSection';

interface SceneToProcess {
    file: TFile;
    path: string;
    title: string;
    subplot?: string;
    existingRuntime?: string;
    runtimeProfileId?: string;
    body: string;
}

interface SceneRuntimeSnapshot {
    title: string;
    path: string;
    runtimeSeconds: number;
    dialogueWords: number;
    actionWords: number;
    directiveSeconds: number;
    directiveCounts: Record<string, number>;
    sample?: string;
}

interface AiEstimateResult {
    success: boolean;
    aiSeconds?: number;
    provider?: string;
    modelId?: string;
    rationale?: string;
    error?: string;
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
            runtimeProfileId: scene.RuntimeProfile,
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
    mode: RuntimeMode,
    modal: RuntimeProcessingModal
): Promise<RuntimeProcessResult> {
    const scenes = await getScenesForScope(plugin, scope, subplotFilter, overrideExisting, statusFilters);
    
    if (scenes.length === 0) {
        new Notice('No scenes to process.');
        return { message: 'No scenes to process.' };
    }

    modal.setTotalCount(scenes.length);
    const defaultProfileId = plugin.settings.defaultRuntimeProfileId;

    let processed = 0;
    let totalRuntime = 0;
    let errors = 0;
    const sceneStats: SceneRuntimeSnapshot[] = [];

    for (const scene of scenes) {
        if (modal.isAborted()) {
            break;
        }

        try {
            // Estimate runtime from content
            const runtimeSettings = getRuntimeSettings(plugin.settings, scene.runtimeProfileId || defaultProfileId);
            const result = estimateRuntime(scene.body, runtimeSettings);
            
            // Update file frontmatter
            const success = await updateSceneRuntime(plugin, scene.file, result.totalSeconds);
            
            if (success) {
                processed++;
                totalRuntime += result.totalSeconds;
                const sample = mode === 'local' ? undefined : truncateText(scene.body, mode === 'ai-full' ? 1200 : 400);
                sceneStats.push({
                    title: scene.title,
                    path: scene.path,
                    runtimeSeconds: result.totalSeconds,
                    dialogueWords: result.dialogueWords,
                    actionWords: result.actionWords,
                    directiveSeconds: result.directiveSeconds,
                    directiveCounts: result.directiveCounts,
                    sample,
                });
                modal.updateProgress(processed, scenes.length, scene.title, result.totalSeconds);
            } else {
                errors++;
            }
        } catch (e) {
            console.error(`Error processing ${scene.path}:`, e);
            errors++;
        }
    }
    
    let aiResult: AiEstimateResult | undefined;
    if (mode !== 'local') {
        modal.setStatusMessage('Preparing AI runtime estimate...');
        aiResult = await estimateRuntimeWithAi(plugin, sceneStats, getRuntimeSettings(plugin.settings, defaultProfileId), mode);
    }

    const message = errors > 0
        ? `Runtime estimation complete. ${processed} scenes updated, ${errors} errors.`
        : `Runtime estimation complete! ${processed} scenes updated. Total: ${formatRuntimeValue(totalRuntime)}`;

    new Notice(message);

    // Refresh timeline AFTER all processing (including AI estimate) completes
    // Use direct refresh on all views to bypass debounce for immediate visual feedback
    plugin.getTimelineViews().forEach(v => v.refreshTimeline());

    return {
        message,
        localTotalSeconds: totalRuntime,
        aiResult: aiResult ? { ...aiResult } : undefined,
    };
}

function truncateText(text: string, maxChars: number): string {
    if (!text) return '';
    if (text.length <= maxChars) return text;
    return `${text.slice(0, maxChars)}…`;
}

function aggregateStats(scenes: SceneRuntimeSnapshot[]) {
    return scenes.reduce(
        (acc, scene) => {
            acc.dialogueWords += scene.dialogueWords;
            acc.actionWords += scene.actionWords;
            acc.directiveSeconds += scene.directiveSeconds;
            Object.entries(scene.directiveCounts).forEach(([key, value]) => {
                acc.directiveCounts[key] = (acc.directiveCounts[key] || 0) + value;
            });
            acc.localSeconds += scene.runtimeSeconds;
            return acc;
        },
        { dialogueWords: 0, actionWords: 0, directiveSeconds: 0, directiveCounts: {} as Record<string, number>, localSeconds: 0 }
    );
}

function pickScenesForAi(scenes: SceneRuntimeSnapshot[], mode: RuntimeMode): SceneRuntimeSnapshot[] {
    const sorted = [...scenes].sort((a, b) => b.runtimeSeconds - a.runtimeSeconds);
    const limit = mode === 'ai-full' ? 24 : 12;
    return sorted.slice(0, limit);
}

function extractJsonFromContent(content: string): unknown {
    if (!content) return null;
    const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1] : content;
    try {
        return JSON.parse(candidate.trim());
    } catch (err) {
        // Try lenient parse by trimming leading/trailing text
        const firstBrace = candidate.indexOf('{');
        const lastBrace = candidate.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            try {
                return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
            } catch (e) {
                return null;
            }
        }
        return null;
    }
}

async function estimateRuntimeWithAi(
    plugin: RadialTimelinePlugin,
    sceneStats: SceneRuntimeSnapshot[],
    settings: ReturnType<typeof getRuntimeSettings>,
    mode: RuntimeMode
): Promise<AiEstimateResult> {
    if (sceneStats.length === 0) {
        return { success: false, error: 'No scenes available for AI estimate.' };
    }

    const selectedScenes = pickScenesForAi(sceneStats, mode);
    const omittedScenes = sceneStats.filter((s) => !selectedScenes.includes(s));
    const totalsAll = aggregateStats(sceneStats);
    const totalsOmitted = aggregateStats(omittedScenes);

    const payload = {
        mode,
        sceneCount: sceneStats.length,
        settings: {
            contentType: settings.contentType,
            dialogueWpm: settings.dialogueWpm,
            actionWpm: settings.actionWpm,
            narrationWpm: settings.narrationWpm,
            directives: {
                beatSeconds: settings.beatSeconds,
                pauseSeconds: settings.pauseSeconds,
                longPauseSeconds: settings.longPauseSeconds,
                momentSeconds: settings.momentSeconds,
                silenceSeconds: settings.silenceSeconds,
            },
        },
        totals: totalsAll,
        sampleScenes: selectedScenes.map((scene) => ({
            title: scene.title,
            path: scene.path,
            localRuntimeSeconds: scene.runtimeSeconds,
            dialogueWords: scene.dialogueWords,
            actionWords: scene.actionWords,
            directiveSeconds: scene.directiveSeconds,
            directives: scene.directiveCounts,
            sample: scene.sample,
        })),
        omittedSummary: {
            count: omittedScenes.length,
            totals: totalsOmitted,
        },
        note: 'Estimate total runtime (seconds). Prefer local math if confident; adjust using pacing intuition from stats/samples.',
    };

    const systemPrompt = [
        'You are a runtime estimator for novels and screenplays.',
        'Use provided per-scene stats to estimate total runtime in seconds.',
        'Return JSON: {"estimatedSeconds": number, "rationale": string, "confidence": 1-5}.',
        'Do not include prose outside JSON.',
    ].join(' ');

    const userPrompt = [
        'Runtime data follows as JSON.',
        'Account for pacing differences between dialogue and action.',
        'Adjust modestly for directive seconds if they seem over/under-weighted.',
        'Respond with JSON only.',
        JSON.stringify(payload, null, 2),
    ].join('\n\n');

    const response = await callProvider(plugin, {
        systemPrompt,
        userPrompt,
        maxTokens: 900,
        temperature: 0.25,
    });

    const provider = response?.provider || plugin.settings.defaultAiProvider || 'openai';
    const modelId = response?.modelId || '';

    if (!response.success || !response.content) {
        return {
            success: false,
            provider,
            modelId,
            error: 'AI request failed',
        };
    }

    const parsed = extractJsonFromContent(response.content) as
        | { estimatedSeconds?: number; totalSeconds?: number; rationale?: string; reasoning?: string; confidence?: number }
        | null;

    const aiSeconds =
        (parsed && typeof parsed.estimatedSeconds === 'number' && Number.isFinite(parsed.estimatedSeconds) && parsed.estimatedSeconds >= 0)
            ? parsed.estimatedSeconds
            : parsed && typeof parsed.totalSeconds === 'number' && Number.isFinite(parsed.totalSeconds) && parsed.totalSeconds >= 0
                ? parsed.totalSeconds
                : null;

    if (aiSeconds === null) {
        return {
            success: false,
            provider,
            modelId,
            rationale: response.content,
            error: 'AI response missing estimatedSeconds',
        };
    }

    return {
        success: true,
        aiSeconds: Math.round(aiSeconds),
        provider,
        modelId,
        rationale: parsed?.rationale || parsed?.reasoning || response.content,
    };
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
        (scope, subplotFilter, overrideExisting, statusFilters, mode) => {
            if (!modalInstance) {
                throw new Error('Modal not initialized');
            }
            return processScenes(plugin, scope, subplotFilter, overrideExisting, statusFilters, mode, modalInstance);
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
        checkCallback: (checking: boolean) => {
            // Only show command when Pro is active and runtime estimation is enabled
            const hasPro = isProfessionalActive(plugin);
            if (!hasPro || !plugin.settings.enableRuntimeEstimation) {
                return false;
            }
            if (!checking) {
                openRuntimeEstimator(plugin);
            }
            return true;
        },
    });
}
