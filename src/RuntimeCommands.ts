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
import { isNonSceneItem } from './utils/sceneHelpers';
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
    const processedPaths = new Set<string>();

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
            if (isNonSceneItem(s)) return false;
            const sub = s.subplot && s.subplot.trim() ? s.subplot.trim().toLowerCase() : 'main plot';
            return sub === normalizedFilter;
        });
    } else {
        // All scenes
        targetScenes = scenes.filter(s => !isNonSceneItem(s));
    }

    // Filter by status
    targetScenes = targetScenes.filter(scene => matchesStatusFilter(scene, statusFilters));

    // Filter by existing runtime if not overriding
    for (const scene of targetScenes) {
        if (!scene.path) continue;
        
        // Deduplicate: scenes with multiple subplots appear multiple times in getSceneData
        if (processedPaths.has(scene.path)) continue;
        processedPaths.add(scene.path);

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

    for (const scene of scenes) {
        if (modal.isAborted()) {
            break;
        }

        try {
            const runtimeSettings = getRuntimeSettings(plugin.settings, scene.runtimeProfileId || defaultProfileId);
            const localResult = estimateRuntime(scene.body, runtimeSettings);
            
            let runtimeSeconds: number;
            
            if (mode === 'ai') {
                // AI mode: send scene to AI for estimation
                modal.setStatusMessage(`AI analyzing: ${scene.title}`);
                const aiResult = await estimateSceneWithAi(plugin, scene, localResult, runtimeSettings);
                
                if (aiResult.success && typeof aiResult.runtimeSeconds === 'number') {
                    runtimeSeconds = aiResult.runtimeSeconds;
                } else {
                    // Fall back to local if AI fails
                    runtimeSeconds = localResult.totalSeconds;
                    console.warn(`AI estimation failed for ${scene.title}, using local estimate`);
                }
            } else {
                // Local mode: use algorithmic estimation
                runtimeSeconds = localResult.totalSeconds;
            }
            
            // Update file frontmatter with the runtime
            const success = await updateSceneRuntime(plugin, scene.file, runtimeSeconds);
            
            if (success) {
                processed++;
                totalRuntime += runtimeSeconds;
                modal.updateProgress(processed, scenes.length, scene.title, runtimeSeconds);
            } else {
                errors++;
            }
        } catch (e) {
            console.error(`Error processing ${scene.path}:`, e);
            errors++;
        }
    }

    const modeLabel = mode === 'ai' ? 'AI' : 'Local';
    const message = errors > 0
        ? `${modeLabel} estimation complete. ${processed} scenes updated, ${errors} errors.`
        : `${modeLabel} estimation complete! ${processed} scenes updated. Total: ${formatRuntimeValue(totalRuntime)}`;

    new Notice(message);

    // Refresh timeline after processing
    plugin.getTimelineViews().forEach(v => v.refreshTimeline());

    return {
        message,
        localTotalSeconds: totalRuntime,
    };
}

/**
 * Extract JSON from AI response content
 */
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

interface SceneAiResult {
    success: boolean;
    runtimeSeconds?: number;
    error?: string;
}

/**
 * Estimate a single scene's runtime using AI
 * Sends scene content along with local stats for AI to analyze
 */
async function estimateSceneWithAi(
    plugin: RadialTimelinePlugin,
    scene: SceneToProcess,
    localResult: ReturnType<typeof estimateRuntime>,
    settings: ReturnType<typeof getRuntimeSettings>
): Promise<SceneAiResult> {
    const contentType = settings.contentType || 'novel';
    const isScreenplay = contentType === 'screenplay';
    
    // Build context for AI
    const payload = {
        sceneTitle: scene.title,
        contentType,
        localEstimate: {
            totalSeconds: localResult.totalSeconds,
            formattedTime: formatRuntimeValue(localResult.totalSeconds),
            wordCount: localResult.dialogueWords + localResult.actionWords,
            dialogueWords: localResult.dialogueWords,
            actionWords: localResult.actionWords,
            directiveSeconds: localResult.directiveSeconds,
            directives: localResult.directiveCounts,
        },
        settings: {
            narrationWpm: settings.narrationWpm,
            dialogueWpm: settings.dialogueWpm,
            actionWpm: settings.actionWpm,
            beatSeconds: settings.beatSeconds,
            pauseSeconds: settings.pauseSeconds,
            longPauseSeconds: settings.longPauseSeconds,
            momentSeconds: settings.momentSeconds,
            silenceSeconds: settings.silenceSeconds,
        },
        sceneContent: scene.body,
    };

    const systemPrompt = isScreenplay
        ? `You are an expert script supervisor estimating screen time for screenplay scenes. Analyze the scene content, considering dialogue pacing, action sequences, visual beats, and dramatic pauses. The local algorithm provides a baseline using word counts and parenthetical timings. Your job is to refine this estimate based on your understanding of how the scene would actually play on screen. Return ONLY valid JSON.`
        : `You are an expert audiobook producer estimating narration time. Analyze the scene content, considering dialogue pacing, descriptive passages, emotional beats, and natural reading rhythm. The local algorithm provides a baseline using word counts and timing directives. Your job is to refine this estimate based on how a professional narrator would actually perform this scene. Return ONLY valid JSON.`;

    const userPrompt = `Estimate the runtime for this scene in seconds.

Scene: "${scene.title}"
Content Type: ${contentType}

LOCAL ALGORITHM ESTIMATE:
- Total: ${localResult.totalSeconds} seconds (${formatRuntimeValue(localResult.totalSeconds)})
- Word count: ${localResult.dialogueWords + localResult.actionWords} words
${isScreenplay ? `- Dialogue words: ${localResult.dialogueWords}
- Action/description words: ${localResult.actionWords}` : `- Narration words: ${localResult.dialogueWords + localResult.actionWords}`}
- Timing directives: ${localResult.directiveSeconds} seconds from ${Object.entries(localResult.directiveCounts).map(([k, v]) => `${k}(${v})`).join(', ') || 'none'}

CONFIGURED RATES:
${isScreenplay ? `- Dialogue: ${settings.dialogueWpm} wpm
- Action: ${settings.actionWpm} wpm` : `- Narration: ${settings.narrationWpm} wpm`}

SCENE CONTENT:
${scene.body}

---
Analyze the scene and provide your runtime estimate. Consider:
- Pacing and rhythm of dialogue
- ${isScreenplay ? 'Visual action that takes screen time beyond word count' : 'Descriptive passages that may be read slower for atmosphere'}
- Emotional moments that warrant natural pauses
- Whether the local estimate seems accurate, too short, or too long

Return JSON only: {"runtimeSeconds": number, "reasoning": "brief explanation"}`;

    try {
        const response = await callProvider(plugin, {
            systemPrompt,
            userPrompt,
            maxTokens: 500,
            temperature: 0.3,
        });

        if (!response.success || !response.content) {
            return { success: false, error: 'AI request failed' };
        }

        const parsed = extractJsonFromContent(response.content) as
            | { runtimeSeconds?: number; estimatedSeconds?: number; totalSeconds?: number; seconds?: number }
            | null;

        // Try various field names the AI might use
        const seconds = parsed?.runtimeSeconds ?? parsed?.estimatedSeconds ?? parsed?.totalSeconds ?? parsed?.seconds;

        if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0) {
            return { success: true, runtimeSeconds: Math.round(seconds) };
        }

        return { success: false, error: 'AI response missing runtimeSeconds' };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
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
