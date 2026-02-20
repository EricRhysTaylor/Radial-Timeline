/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Summary Refresh Command Helper
 * Handles logic for the "Summary refresh" command.
 *
 * Summary = extended AI-generated scene analysis (≈200–300 words, configurable) — primary artifact for Inquiry corpus.
 * Hover blurb = concise scene text (strict word-capped), persisted to the legacy `Synopsis` key when enabled.
 */

import { Vault, Notice, TFile } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { SceneAnalysisProcessingModal, type ProcessingMode, type SceneQueueItem } from '../modals/SceneAnalysisProcessingModal';
import { getAllSceneData, compareScenesByOrder, getSummaryUpdateFlag } from './data';
import { classifySynopsis } from './synopsisQuality';
import { buildSummaryPrompt, buildSynopsisPrompt } from '../ai/prompts/synopsis';
import { createAiRunner } from './RequestRunner';
import { callAiProvider } from './aiProvider';
import type { SceneData } from './types';
import { parseSceneTitle, decodeHtmlEntities } from '../utils/text';
import { normalizeBooleanValue } from '../utils/sceneHelpers';
import { getSynopsisGenerationWordLimit, truncateToWordLimit } from '../utils/synopsisLimits';

/**
 * Check freshness: is the scene's Due/Completed date newer than the last AI update timestamp?
 */
function isSummaryStale(scene: SceneData, plugin: RadialTimelinePlugin): boolean {
    const timestamps = plugin.settings.aiUpdateTimestamps?.[scene.file.path];
    if (!timestamps?.summaryUpdated) return true; // Never updated → stale

    const lastUpdated = new Date(timestamps.summaryUpdated);
    if (isNaN(lastUpdated.getTime())) return true;

    // Check Due date
    const dueRaw = scene.frontmatter.Due;
    if (dueRaw) {
        const dueDate = new Date(String(dueRaw));
        if (!isNaN(dueDate.getTime()) && dueDate > lastUpdated) return true;
    }

    // Check Completed date (Status changing to Complete typically updates Due)
    return false;
}

function getCurrentModelId(plugin: RadialTimelinePlugin): string {
    const provider = plugin.settings.defaultAiProvider || 'openai';
    if (provider === 'anthropic') {
        return plugin.settings.anthropicModelId || 'claude-sonnet-4-5-20250929';
    }
    if (provider === 'gemini') {
        return plugin.settings.geminiModelId || 'gemini-3-pro-preview';
    }
    if (provider === 'local') {
        return plugin.settings.localModelId || 'local-model';
    }
    return plugin.settings.openaiModelId || 'gpt-5.1-chat-latest';
}

function setCaseInsensitiveField(frontmatter: Record<string, unknown>, key: string, value: string): void {
    const lowerKey = key.toLowerCase();
    for (const existingKey of Object.keys(frontmatter)) {
        if (existingKey.toLowerCase() === lowerKey && existingKey !== key) {
            delete frontmatter[existingKey];
        }
    }
    frontmatter[key] = value;
}

function placeSummaryAfterSynopsis(frontmatter: Record<string, unknown>): void {
    const keys = Object.keys(frontmatter);
    const summaryKey = keys.find(key => key.toLowerCase() === 'summary');
    const synopsisKey = keys.find(key => key.toLowerCase() === 'synopsis');
    if (!summaryKey || !synopsisKey) return;

    const summaryIndex = keys.indexOf(summaryKey);
    const synopsisIndex = keys.indexOf(synopsisKey);
    if (summaryIndex === synopsisIndex + 1) return;

    const reorderedKeys = keys.filter(key => key !== summaryKey);
    reorderedKeys.splice(reorderedKeys.indexOf(synopsisKey) + 1, 0, summaryKey);

    const snapshot: Record<string, unknown> = {};
    for (const key of reorderedKeys) {
        snapshot[key] = frontmatter[key];
    }
    for (const key of Object.keys(frontmatter)) {
        delete frontmatter[key];
    }
    Object.assign(frontmatter, snapshot);
}

async function persistSummaryForScene(
    plugin: RadialTimelinePlugin,
    scenePath: string,
    summaryText: string,
    synopsisText?: string
): Promise<{ summary: string; synopsis?: string }> {
    const file = plugin.app.vault.getAbstractFileByPath(scenePath);
    if (!(file instanceof TFile)) {
        throw new Error(`Scene file not found: ${scenePath}`);
    }

    const summary = String(summaryText ?? '').trim();
    const synopsis = synopsisText ? String(synopsisText).trim() : undefined;
    const modelId = getCurrentModelId(plugin);
    const now = new Date();
    const isoNow = now.toISOString();
    const timestamp = now.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    } as Intl.DateTimeFormatOptions);

    await plugin.app.fileManager.processFrontMatter(file, (fm) => {
        const frontmatter = fm as Record<string, unknown>;

        // Write canonical keys and clean up case-variant duplicates.
        setCaseInsensitiveField(frontmatter, 'Summary', summary);
        if (synopsis) {
            setCaseInsensitiveField(frontmatter, 'Synopsis', synopsis);
        }

        // Keep Summary adjacent to the legacy Synopsis key for readability in frontmatter.
        placeSummaryAfterSynopsis(frontmatter);

        // Normalize update markers onto Summary Update while preserving legacy-key compatibility.
        const summaryUpdateKeys = ['Summary Update', 'SummaryUpdate', 'summaryupdate'];
        const legacyKeys = ['Synopsis Update', 'SynopsisUpdate', 'synopsisupdate'];

        let updatedFlag = false;
        for (const key of summaryUpdateKeys) {
            if (key in frontmatter) {
                frontmatter[key] = `${timestamp} by ${modelId}`;
                updatedFlag = true;
                break;
            }
        }
        if (!updatedFlag) {
            for (const key of legacyKeys) {
                if (key in frontmatter) {
                    delete frontmatter[key];
                    frontmatter['Summary Update'] = `${timestamp} by ${modelId}`;
                    updatedFlag = true;
                    break;
                }
            }
        }
        if (!updatedFlag) {
            frontmatter['Summary Update'] = `${timestamp} by ${modelId}`;
        }
    });

    // Track internal timestamps per scene so stale checks remain accurate.
    if (!plugin.settings.aiUpdateTimestamps) {
        plugin.settings.aiUpdateTimestamps = {};
    }
    const sceneTimestamps = plugin.settings.aiUpdateTimestamps[scenePath] ?? {};
    sceneTimestamps.summaryUpdated = isoNow;
    if (synopsis) {
        sceneTimestamps.synopsisUpdated = isoNow;
    }
    plugin.settings.aiUpdateTimestamps[scenePath] = sceneTimestamps;
    try {
        await plugin.saveSettings();
    } catch (error) {
        // Frontmatter writes are already committed; keep processing even if settings persistence fails.
        console.warn('Failed to persist summary timestamp settings:', error);
    }

    return { summary, synopsis };
}

export async function calculateSynopsisSceneCount(
    plugin: RadialTimelinePlugin,
    vault: Vault,
    mode: ProcessingMode,
    weakThreshold?: number
): Promise<number> {
    try {
        const allScenes = await getAllSceneData(plugin, vault);
        const threshold = weakThreshold ?? plugin.settings.synopsisWeakThreshold ?? 75;

        const isFlagged = (scene: SceneData) =>
            normalizeBooleanValue(getSummaryUpdateFlag(scene.frontmatter));

        let count = 0;
        for (const scene of allScenes) {
            // Scene selection now targets the Summary field
            const currentSummary = scene.frontmatter.Summary;
            const quality = classifySynopsis(currentSummary, threshold);

            if (mode === 'synopsis-flagged') {
                if (isFlagged(scene)) count++;
            } else if (mode === 'synopsis-missing-weak') {
                // Enhanced: missing, weak, OR stale (Due date > last AI update)
                if (quality === 'missing' || quality === 'weak' || isSummaryStale(scene, plugin)) count++;
            } else if (mode === 'synopsis-missing') {
                if (quality === 'missing') count++;
            } else if (mode === 'synopsis-all') {
                count++;
            }
        }
        return count;
    } catch (error) {
        console.error('Error calculating synopsis count:', error);
        return 0;
    }
}

export async function processSynopsisByManuscriptOrder(
    plugin: RadialTimelinePlugin,
    vault: Vault
): Promise<void> {
    // Reopen active modal state instead of creating a second run context.
    if (plugin.activeBeatsModal && plugin.activeBeatsModal.isProcessing) {
        plugin.activeBeatsModal.open();
        new Notice('Reopening active processing session...');
        return;
    }

    const modal = new SceneAnalysisProcessingModal(
        plugin.app,
        plugin,
        (mode, weakThreshold) => calculateSynopsisSceneCount(plugin, vault, mode, weakThreshold),
        async (mode, weakThreshold, targetWords) => {
            await runSynopsisBatch(plugin, vault, mode, modal, weakThreshold, targetWords);
        },
        undefined,
        undefined,
        undefined,
        'synopsis' // Legacy task identifier for Summary refresh mode.
    );
    modal.open();
}

async function runSynopsisBatch(
    plugin: RadialTimelinePlugin,
    vault: Vault,
    mode: ProcessingMode,
    modal: SceneAnalysisProcessingModal,
    weakThreshold?: number,
    targetWords?: number
): Promise<void> {
    const allScenes = await getAllSceneData(plugin, vault);
    allScenes.sort(compareScenesByOrder);

    // Get settings with fallbacks
    const threshold = weakThreshold ?? plugin.settings.synopsisWeakThreshold ?? 75;
    const target = targetWords ?? plugin.settings.synopsisTargetWords ?? 200;
    const alsoUpdateSynopsis = plugin.settings.alsoUpdateSynopsis ?? false;
    const synopsisMaxWords = getSynopsisGenerationWordLimit(plugin.settings);

    // Scene selection targets Summary quality and freshness gates.
    const scenesToProcess = allScenes.filter(scene => {
        const quality = classifySynopsis(scene.frontmatter.Summary, threshold);
        const isFlagged = normalizeBooleanValue(getSummaryUpdateFlag(scene.frontmatter));
        if (mode === 'synopsis-flagged') return isFlagged;
        if (mode === 'synopsis-missing-weak') return quality === 'missing' || quality === 'weak' || isSummaryStale(scene, plugin);
        if (mode === 'synopsis-missing') return quality === 'missing';
        if (mode === 'synopsis-all') return true;
        return false;
    });

    if (scenesToProcess.length === 0) {
        new Notice('No scenes found matching the selected criteria.');
        return;
    }

    // Initialize Queue
    const queueItems: SceneQueueItem[] = scenesToProcess.map(scene => {
        const rawTitle = typeof scene.frontmatter?.Title === 'string'
            ? scene.frontmatter.Title
            : scene.file.basename.replace(/\.md$/i, '');
        const parsed = parseSceneTitle(rawTitle, scene.sceneNumber ?? undefined);
        return {
            id: scene.file.path,
            label: parsed.number || String(scene.sceneNumber || ''),
            detail: decodeHtmlEntities(parsed.text || rawTitle)
        };
    });

    if (modal.setProcessingQueue) modal.setProcessingQueue(queueItems);

    let processedCount = 0;

    for (const scene of scenesToProcess) {
        if (modal.isAborted()) break;

        const sceneName = scene.file.basename;
        const currentSummary = (scene.frontmatter.Summary as string) || '';

        // Show current item info (including old summary for preview)
        if (modal.setSynopsisPreview) {
            modal.setSynopsisPreview(currentSummary, 'Generating...');
        }

        // --- Step 1: Generate Summary (primary artifact) ---
        const summaryPrompt = buildSummaryPrompt(
            scene.body,
            String(scene.sceneNumber || 'N/A'),
            target
        );

        const runAi = createAiRunner(plugin, vault, callAiProvider);
        if (modal.startSceneAnimation) {
            const words = typeof scene.frontmatter.Words === 'number' ? scene.frontmatter.Words : 500;
            modal.startSceneAnimation(words * 0.4, processedCount, scenesToProcess.length, sceneName);
        }

        try {
            const result = await runAi(summaryPrompt, null, 'synopsis', sceneName, undefined);

            if (result.result) {
                // Parse JSON
                let newSummary = '';
                try {
                    const jsonMatch = result.result.match(/\{[\s\S]*\}/);
                    const jsonStr = jsonMatch ? jsonMatch[0] : result.result;
                    const parsed = JSON.parse(jsonStr);
                    newSummary = parsed.summary || parsed.synopsis || ''; // Accept either key
                } catch (e) {
                    console.error('Failed to parse summary JSON', e);
                    modal.addError(`JSON Parse Error: ${sceneName}`);
                    continue;
                }

                if (newSummary) {
                    let newSynopsis: string | undefined;

                    // Optional second pass: generate the hover blurb (stored in the legacy Synopsis key).
                    if (alsoUpdateSynopsis) {
                        try {
                            const synopsisPrompt = buildSynopsisPrompt(
                                scene.body,
                                String(scene.sceneNumber || 'N/A'),
                                synopsisMaxWords
                            );

                            const synopsisResult = await runAi(synopsisPrompt, null, 'synopsis', `${sceneName} (synopsis)`, undefined);

                            if (synopsisResult.result) {
                                const synJsonMatch = synopsisResult.result.match(/\{[\s\S]*\}/);
                                const synJsonStr = synJsonMatch ? synJsonMatch[0] : synopsisResult.result;
                                const synParsed = JSON.parse(synJsonStr);
                                const parsedSynopsis = synParsed.synopsis || '';
                                if (parsedSynopsis) {
                                    newSynopsis = truncateToWordLimit(parsedSynopsis, synopsisMaxWords);
                                }
                            }
                        } catch (synErr) {
                            // Synopsis generation failure is non-fatal — Summary still succeeds.
                            console.warn(`Synopsis generation failed for ${sceneName}:`, synErr);
                            modal.addWarning(`Synopsis generation failed for ${sceneName} (Summary was saved)`);
                        }
                    }

                    try {
                        const persisted = await persistSummaryForScene(plugin, scene.file.path, newSummary, newSynopsis);
                        processedCount++;

                        // Update preview with final result
                        if (modal.setSynopsisPreview) {
                            modal.setSynopsisPreview(currentSummary, persisted.summary);
                        }
                        if (modal.updateProgress) {
                            modal.updateProgress(processedCount, scenesToProcess.length, sceneName);
                        }
                        if (modal.markQueueStatus) {
                            modal.markQueueStatus(scene.file.path, 'success');
                        }
                    } catch (saveError) {
                        const message = saveError instanceof Error ? saveError.message : String(saveError);
                        modal.addError(`Save error for ${sceneName}: ${message}`);
                        if (modal.markQueueStatus) modal.markQueueStatus(scene.file.path, 'error');
                    }
                } else {
                    modal.addError(`Empty result: ${sceneName}`);
                    if (modal.markQueueStatus) modal.markQueueStatus(scene.file.path, 'error');
                }
            } else {
                modal.addError(`AI Error: ${sceneName}`);
                if (modal.markQueueStatus) modal.markQueueStatus(scene.file.path, 'error');
            }
        } catch (err) {
            modal.addError(`Error processing ${sceneName}: ${err}`);
            if (modal.markQueueStatus) modal.markQueueStatus(scene.file.path, 'error');
        }

        // Small delay to let UI render
        await new Promise(r => window.setTimeout(r, 100));
    }

    // Results are written per-scene during processing; nothing left to apply at completion.
}
