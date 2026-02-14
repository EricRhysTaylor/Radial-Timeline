/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Summary Refresh Command Helper
 * Handles logic for the "Summary refresh" command.
 *
 * Summary = extended AI-generated scene analysis (≈200–300 words, configurable) — primary artifact for Inquiry corpus.
 * Synopsis = concise, skimmable navigation text (1–3 sentences) — optional for scene hovers.
 */

import { Vault, Notice, TFile } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { SceneAnalysisProcessingModal, type ProcessingMode, type SceneQueueItem } from '../modals/SceneAnalysisProcessingModal';
import { getAllSceneData, compareScenesByOrder, getSummaryUpdateFlag, hasProcessableContent } from './data';
import { classifySynopsis } from './synopsisQuality';
import { buildSummaryPrompt, buildSynopsisPrompt } from '../ai/prompts/synopsis';
import { createAiRunner } from './RequestRunner';
import { callAiProvider } from './aiProvider';
import type { SceneData } from './types';
import { parseSceneTitle, decodeHtmlEntities } from '../utils/text';
import { normalizeBooleanValue } from '../utils/sceneHelpers';

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
    // 1. Open Modal
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
        'synopsis' // Specify taskType
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
    const synopsisMaxLines = plugin.settings.synopsisGenerationMaxLines ?? 3;

    // Filter scenes based on mode — now targeting Summary field
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
    const summaryResults = new Map<string, string>(); // path -> newSummary
    const synopsisResults = new Map<string, string>(); // path -> newSynopsis (only if checkbox enabled)

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
                    summaryResults.set(scene.file.path, newSummary);
                    processedCount++;

                    // Update preview with final result
                    if (modal.setSynopsisPreview) {
                        modal.setSynopsisPreview(currentSummary, newSummary);
                    }
                    if (modal.updateProgress) {
                        modal.updateProgress(processedCount, scenesToProcess.length, sceneName);
                    }
                    if (modal.markQueueStatus) {
                        modal.markQueueStatus(scene.file.path, 'success');
                    }

                    // --- Step 2: Generate Synopsis (optional, only if checkbox enabled) ---
                    if (alsoUpdateSynopsis) {
                        try {
                            const synopsisPrompt = buildSynopsisPrompt(
                                scene.body,
                                String(scene.sceneNumber || 'N/A'),
                                synopsisMaxLines
                            );

                            const synopsisResult = await runAi(synopsisPrompt, null, 'synopsis', `${sceneName} (synopsis)`, undefined);

                            if (synopsisResult.result) {
                                const synJsonMatch = synopsisResult.result.match(/\{[\s\S]*\}/);
                                const synJsonStr = synJsonMatch ? synJsonMatch[0] : synopsisResult.result;
                                const synParsed = JSON.parse(synJsonStr);
                                const newSynopsis = synParsed.synopsis || '';
                                if (newSynopsis) {
                                    synopsisResults.set(scene.file.path, newSynopsis);
                                }
                            }
                        } catch (synErr) {
                            // Synopsis generation failure is non-fatal — Summary still succeeds
                            console.warn(`Synopsis generation failed for ${sceneName}:`, synErr);
                            modal.addWarning(`Synopsis generation failed for ${sceneName} (Summary was saved)`);
                        }
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

    // Processing finished. Store results in modal for Apply phase.
    if (!modal.isAborted() && summaryResults.size > 0) {
        modal.setSynopsisResults(summaryResults, synopsisResults);
    }
}
