/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Synopsis Command Helper
 * Handles logic for the "Refresh Scene Synopses" command
 */

import { Vault, Notice, TFile } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { SceneAnalysisProcessingModal, type ProcessingMode, type SceneQueueItem } from '../modals/SceneAnalysisProcessingModal';
import { getAllSceneData, compareScenesByOrder, getSynopsisUpdateFlag, hasProcessableContent } from './data';
import { classifySynopsis, type SynopsisQuality } from './synopsisQuality';
import { buildSynopsisPrompt } from '../ai/prompts/synopsis';
import { createAiRunner } from './RequestRunner';
import { callAiProvider } from './aiProvider';
import type { SceneData } from './types';
import { parseSceneTitle, decodeHtmlEntities } from '../utils/text';
import { normalizeBooleanValue } from '../utils/sceneHelpers';

export async function calculateSynopsisSceneCount(
    plugin: RadialTimelinePlugin,
    vault: Vault,
    mode: ProcessingMode,
    weakThreshold?: number
): Promise<number> {
    try {
        const allScenes = await getAllSceneData(plugin, vault);
        // Only consider scenes visible in the current manuscript/timeline view (respects book scope if applicable)
        // getAllSceneData respects the plugin's source/book settings.

        // Get threshold from settings or parameter
        const threshold = weakThreshold ?? plugin.settings.synopsisWeakThreshold ?? 75;

        const isSynopsisFlagged = (scene: SceneData) =>
            normalizeBooleanValue(getSynopsisUpdateFlag(scene.frontmatter));

        let count = 0;
        for (const scene of allScenes) {
            const currentSynopsis = scene.frontmatter.Synopsis;
            const quality = classifySynopsis(currentSynopsis, threshold);

            if (mode === 'synopsis-flagged') {
                if (isSynopsisFlagged(scene)) count++;
            } else if (mode === 'synopsis-missing-weak') {
                if (quality === 'missing' || quality === 'weak') count++;
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

    // Filter scenes based on mode
    const scenesToProcess = allScenes.filter(scene => {
        const quality = classifySynopsis(scene.frontmatter.Synopsis, threshold);
        const isSynopsisFlagged = normalizeBooleanValue(getSynopsisUpdateFlag(scene.frontmatter));
        if (mode === 'synopsis-flagged') return isSynopsisFlagged;
        if (mode === 'synopsis-missing-weak') return quality === 'missing' || quality === 'weak';
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

    // --- PREVIEW PHASE ---
    // Instead of writing immediately, we store results in the modal state
    // The modal handles the "Apply" phase after this function completes (or via callback)
    // Actually, SceneAnalysisProcessingModal structure expects this function to be the "WORKER".
    // To support Preview -> Apply, we will:
    // 1. Collect all results here.
    // 2. Pass them to the modal via a new method `setPreviewResults(map)`.
    // 3. The modal then shows "Reference Apply" UI.

    // BUT: The existing modal closes/finishes when this promise resolves. 
    // We need to change the modal flow. 
    // For now, let's run the AI generation.

    let processedCount = 0;
    const results = new Map<string, string>(); // path -> newSynopsis

    for (const scene of scenesToProcess) {
        if (modal.isAborted()) break;

        const sceneName = scene.file.basename;
        const currentSynopsis = (scene.frontmatter.Synopsis as string) || '';

        // Show current item info (including old synopsis for preview)
        if (modal.setSynopsisPreview) {
            modal.setSynopsisPreview(currentSynopsis, 'Generating...');
        }

        // Build Prompt with target word count
        const prompt = buildSynopsisPrompt(
            scene.body,
            String(scene.sceneNumber || 'N/A'),
            target
        );

        // Run AI
        const runAi = createAiRunner(plugin, vault, callAiProvider);
        if (modal.startSceneAnimation) {
            // Use word count metric for estimation
            const words = typeof scene.frontmatter.Words === 'number' ? scene.frontmatter.Words : 500;
            modal.startSceneAnimation(words * 0.4, processedCount, scenesToProcess.length, sceneName);
        }

        try {
            const result = await runAi(prompt, null, 'synopsis', sceneName, undefined);

            if (result.result) {
                // Parse JSON
                let newSynopsis = '';
                try {
                    // Simple JSON extraction if the model wraps it in md blocks
                    const jsonMatch = result.result.match(/\{[\s\S]*\}/);
                    const jsonStr = jsonMatch ? jsonMatch[0] : result.result;
                    const parsed = JSON.parse(jsonStr);
                    newSynopsis = parsed.synopsis;
                } catch (e) {
                    console.error('Failed to parse synopsis JSON', e);
                    modal.addError(`JSON Parse Error: ${sceneName}`);
                    continue;
                }

                if (newSynopsis) {
                    results.set(scene.file.path, newSynopsis);
                    processedCount++;

                    // Update preview with final result
                    if (modal.setSynopsisPreview) {
                        modal.setSynopsisPreview(currentSynopsis, newSynopsis);
                    }
                    if (modal.updateProgress) {
                        modal.updateProgress(processedCount, scenesToProcess.length, sceneName);
                    }
                    if (modal.markQueueStatus) {
                        modal.markQueueStatus(scene.file.path, 'success');
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
        await new Promise(r => setTimeout(r, 100));
    }

    // Processing finished. Now trigger the "Apply" phase UI in the modal.
    if (!modal.isAborted() && results.size > 0 && modal.showApplyConfirmation) {
        modal.showApplyConfirmation(results);
    }
}
