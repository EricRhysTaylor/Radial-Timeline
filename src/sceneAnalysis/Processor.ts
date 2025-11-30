/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import { Notice, type Vault } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import type { SceneAnalysisProcessingModal, ProcessingMode, SceneQueueItem } from '../modals/SceneAnalysisProcessingModal';
import { buildTripletsByIndex } from './TripletBuilder';
import { updateSceneAnalysis } from './FileUpdater';
import { createAiRunner } from './RequestRunner';
import {
    getAllSceneData,
    compareScenesByOrder,
    getSubplotNamesFromFM,
    hasBeenProcessedForBeats,
    hasProcessableContent,
    getPulseUpdateFlag
} from './data';
import { normalizeBooleanValue } from '../utils/sceneHelpers';
import { buildSceneAnalysisPrompt } from '../ai/prompts/sceneAnalysis';
import { parseGptResult } from './responseParsing';
import { callAiProvider } from './aiProvider';
import type { SceneData } from './types';

function buildQueueItem(scene: SceneData): SceneQueueItem {
    const hasNumber = typeof scene.sceneNumber === 'number' && !Number.isNaN(scene.sceneNumber);
    const label = hasNumber ? `#${scene.sceneNumber}` : scene.file.basename;
    const detail = hasNumber ? scene.file.basename : undefined;
    return {
        id: scene.file.path,
        label,
        detail
    };
}

export async function processWithModal(
    plugin: RadialTimelinePlugin,
    vault: Vault,
    mode: ProcessingMode,
    modal: SceneAnalysisProcessingModal
): Promise<void> {
    const isResuming = plugin.settings._isResuming || false;
    if (isResuming) {
        plugin.settings._isResuming = false;
        await plugin.saveSettings();
    }

    const allScenes = await getAllSceneData(plugin, vault);
    allScenes.sort(compareScenesByOrder);
    if (allScenes.length < 1) {
        throw new Error('No valid scenes found in the specified source path.');
    }

    const processableScenes = allScenes.filter(scene => {
        if (mode === 'flagged') {
            const pulseUpdateFlag = getPulseUpdateFlag(scene.frontmatter);
            return normalizeBooleanValue(pulseUpdateFlag);
        }
        return hasProcessableContent(scene.frontmatter);
    });

    const processableContentScenes = allScenes.filter(scene => hasProcessableContent(scene.frontmatter));
    const triplets = buildTripletsByIndex(processableContentScenes, processableScenes, (s) => s.file.path);

    const tasks = triplets.map(triplet => {
        const pulseUpdateFlag = getPulseUpdateFlag(triplet.current.frontmatter);
        const isFlagged = normalizeBooleanValue(pulseUpdateFlag);
        let shouldProcess = false;

        if (mode === 'flagged') {
            shouldProcess = isFlagged;
        } else if (mode === 'force-all') {
            shouldProcess = isResuming
                ? !hasBeenProcessedForBeats(triplet.current.frontmatter, { todayOnly: true })
                : true;
        } else if (mode === 'unprocessed') {
            shouldProcess = isResuming
                ? !hasBeenProcessedForBeats(triplet.current.frontmatter, { todayOnly: true })
                : !hasBeenProcessedForBeats(triplet.current.frontmatter);
        }

        return { triplet, shouldProcess };
    });

    const queueItems = tasks
        .filter(task => task.shouldProcess)
        .map(task => buildQueueItem(task.triplet.current));
    if (modal && typeof modal.setProcessingQueue === 'function') {
        modal.setProcessingQueue(queueItems);
    }

    const totalToProcess = queueItems.length;
    let processedCount = 0;

    for (const { triplet, shouldProcess } of tasks) {
        if (modal.isAborted()) {
            await plugin.saveSettings();
            throw new Error('Processing aborted by user');
        }

        if (!shouldProcess) continue;

        const prevBody = triplet.prev ? triplet.prev.body : null;
        const currentBody = triplet.current.body;
        const nextBody = triplet.next ? triplet.next.body : null;
        const prevNum = triplet.prev ? String(triplet.prev.sceneNumber ?? 'N/A') : 'N/A';
        const currentNum = String(triplet.current.sceneNumber ?? 'N/A');
        const nextNum = triplet.next ? String(triplet.next.sceneNumber ?? 'N/A') : 'N/A';

        if (modal && typeof modal.setTripletInfo === 'function') {
            modal.setTripletInfo(prevNum, currentNum, nextNum, triplet.current.file.path, triplet.current.file.basename);
        }

        // Use default context for scene analysis to avoid blending with story beat templates
        const userPrompt = buildSceneAnalysisPrompt(prevBody, currentBody, nextBody, prevNum, currentNum, nextNum);

        const sceneNameForLog = triplet.current.file.basename;
        const tripletForLog = { prev: prevNum, current: currentNum, next: nextNum };
        const runAi = createAiRunner(plugin, vault, callAiProvider);
        const aiResult = await runAi(userPrompt, null, 'processByManuscriptOrder', sceneNameForLog, tripletForLog);

        if (aiResult.result) {
            const parsedAnalysis = parseGptResult(aiResult.result, plugin);
            if (parsedAnalysis) {
                if (!triplet.prev) parsedAnalysis['previousSceneAnalysis'] = '';
                if (!triplet.next) parsedAnalysis['nextSceneAnalysis'] = '';

                const success = await updateSceneAnalysis(vault, triplet.current.file, parsedAnalysis, plugin, aiResult.modelIdUsed);
                if (success) {
                    processedCount++;
                    modal.updateProgress(processedCount, totalToProcess, triplet.current.file.basename);
                    await plugin.saveSettings();
                } else {
                    modal.addError(`Failed to update file for scene ${triplet.current.sceneNumber}: ${triplet.current.file.path}`);
                }
            } else {
                modal.addError(`Failed to parse AI response for scene ${triplet.current.sceneNumber}: ${triplet.current.file.path}`);
            }
        } else {
            modal.addError(`AI processing failed for scene ${triplet.current.sceneNumber}: ${triplet.current.file.path}`);
        }
    }

    await plugin.saveSettings();
}

export async function processBySubplotOrder(
    plugin: RadialTimelinePlugin,
    vault: Vault
): Promise<void> {
    const notice = new Notice('Processing Subplot: Getting scene data...', 0);

    try {
        const allScenes = await getAllSceneData(plugin, vault);
        if (allScenes.length < 1) {
            new Notice('No valid scenes found in the specified source path.');
            notice.hide();
            return;
        }

        const scenesBySubplot: Record<string, SceneData[]> = {};
        allScenes.forEach(scene => {
            const subplotList = getSubplotNamesFromFM(scene.frontmatter);
            subplotList.forEach(subplotKey => {
                if (!subplotKey) return;
                if (!scenesBySubplot[subplotKey]) scenesBySubplot[subplotKey] = [];
                if (!scenesBySubplot[subplotKey].some(s => s.file.path === scene.file.path)) {
                    scenesBySubplot[subplotKey].push(scene);
                }
            });
        });

        const subplotNames = Object.keys(scenesBySubplot);
        if (subplotNames.length === 0) {
            new Notice('No scenes with subplots found.');
            notice.hide();
            return;
        }

        let totalProcessedCount = 0;
        let totalTripletsAcrossSubplots = 0;
        subplotNames.forEach(subplotName => {
            const scenes = scenesBySubplot[subplotName];
            scenes.sort(compareScenesByOrder);
            const validScenes = scenes.filter(scene => {
                const pulseUpdate = getPulseUpdateFlag(scene.frontmatter);
                if (normalizeBooleanValue(pulseUpdate) && !hasProcessableContent(scene.frontmatter)) {
                    const msg = `Scene ${scene.sceneNumber ?? scene.file.basename} (subplot ${subplotName}) has Pulse Update set but Status is not working/complete. Skipping.`;
                    new Notice(msg, 6000);
                }
                return hasProcessableContent(scene.frontmatter) && normalizeBooleanValue(pulseUpdate);
            });
            totalTripletsAcrossSubplots += validScenes.length;
        });

        notice.setMessage(`Analyzing ${totalTripletsAcrossSubplots} scenes for subplot order...`);

        for (const subplotName of subplotNames) {
            const scenes = scenesBySubplot[subplotName];
            scenes.sort(compareScenesByOrder);

            const orderedScenes = scenes.slice().sort(compareScenesByOrder);
            const processableContentScenes = orderedScenes.filter(scene => hasProcessableContent(scene.frontmatter));
            const flaggedInOrder = orderedScenes.filter(s =>
                hasProcessableContent(s.frontmatter) &&
                normalizeBooleanValue(getPulseUpdateFlag(s.frontmatter))
            );
            const triplets = buildTripletsByIndex(processableContentScenes, flaggedInOrder, (s) => s.file.path);

            for (const triplet of triplets) {
                const pulseUpdateFlag = getPulseUpdateFlag(triplet.current.frontmatter);
                if (!normalizeBooleanValue(pulseUpdateFlag)) {
                    continue;
                }

                notice.setMessage(`Processing scene ${triplet.current.sceneNumber} (${totalProcessedCount + 1}/${totalTripletsAcrossSubplots}) - Subplot: '${subplotName}'...`);

                const prevBody = triplet.prev ? triplet.prev.body : null;
                const currentBody = triplet.current.body;
                const nextBody = triplet.next ? triplet.next.body : null;
                const prevNum = triplet.prev ? String(triplet.prev.sceneNumber ?? 'N/A') : 'N/A';
                const currentNum = String(triplet.current.sceneNumber ?? 'N/A');
                const nextNum = triplet.next ? String(triplet.next.sceneNumber ?? 'N/A') : 'N/A';

                const contextPrompt = getActiveContextPrompt(plugin);
                const userPrompt = buildSceneAnalysisPrompt(prevBody, currentBody, nextBody, prevNum, currentNum, nextNum, contextPrompt);

                const sceneNameForLog = triplet.current.file.basename;
                const tripletForLog = { prev: prevNum, current: currentNum, next: nextNum };
                const runAi = createAiRunner(plugin, vault, callAiProvider);
                const aiResult = await runAi(userPrompt, subplotName, 'processBySubplotOrder', sceneNameForLog, tripletForLog);

                if (aiResult.result) {
                    const parsedAnalysis = parseGptResult(aiResult.result, plugin);
                    if (parsedAnalysis) {
                        if (!triplet.prev) parsedAnalysis['previousSceneAnalysis'] = '';
                        if (!triplet.next) parsedAnalysis['nextSceneAnalysis'] = '';

                        const updated = await updateSceneAnalysis(vault, triplet.current.file, parsedAnalysis, plugin, aiResult.modelIdUsed);
                        if (updated) {
                            await plugin.saveSettings();
                        }
                    }
                }

                totalProcessedCount++;
                notice.setMessage(`Progress: ${totalProcessedCount}/${totalTripletsAcrossSubplots} scenes processed...`);
                await new Promise(resolve => window.setTimeout(resolve, 200));
            }
        }

        await plugin.saveSettings();
        notice.hide();
        new Notice(`Subplot order processing complete: ${totalProcessedCount}/${totalTripletsAcrossSubplots} triplets processed.`);
        plugin.refreshTimelineIfNeeded(null);
    } catch (error) {
        console.error('[API Beats][processBySubplotOrder] Error during processing:', error);
        notice.hide();
        new Notice('Error processing subplots. Check console for details.');
    }
}

export async function processSubplotWithModal(
    plugin: RadialTimelinePlugin,
    vault: Vault,
    subplotName: string,
    modal: SceneAnalysisProcessingModal
): Promise<void> {
    const allScenes = await getAllSceneData(plugin, vault);
    if (allScenes.length < 1) {
        throw new Error('No valid scenes found in the specified source path.');
    }

    const filtered = allScenes.filter(scene => getSubplotNamesFromFM(scene.frontmatter).includes(subplotName));
    if (filtered.length === 0) {
        throw new Error(`No scenes found for subplot "${subplotName}".`);
    }

    filtered.sort(compareScenesByOrder);

    const validScenes = filtered.filter(scene => {
        const pulseUpdate = getPulseUpdateFlag(scene.frontmatter);
        return hasProcessableContent(scene.frontmatter) && normalizeBooleanValue(pulseUpdate);
    });

    if (validScenes.length === 0) {
        throw new Error(`No flagged scenes (Pulse Update: Yes/True/1) with content found for "${subplotName}".`);
    }

    const contextScenes = filtered.filter(scene => hasProcessableContent(scene.frontmatter));
    const triplets = buildTripletsByIndex(contextScenes, validScenes, (s) => s.file.path);
    const isResuming = plugin.settings._isResuming || false;
    if (isResuming) {
        plugin.settings._isResuming = false;
        await plugin.saveSettings();
    }

    const subplotTasks = triplets.map(triplet => {
        const alreadyProcessed = hasBeenProcessedForBeats(triplet.current.frontmatter, { todayOnly: true });
        const shouldProcess = isResuming ? !alreadyProcessed : true;
        return { triplet, shouldProcess };
    });
    const queueItems = subplotTasks
        .filter(task => task.shouldProcess)
        .map(task => buildQueueItem(task.triplet.current));
    if (modal && typeof modal.setProcessingQueue === 'function') {
        modal.setProcessingQueue(queueItems);
    }
    const total = queueItems.length;
    let processedCount = 0;

    for (const { triplet, shouldProcess } of subplotTasks) {
        if (modal.isAborted()) {
            await plugin.saveSettings();
            throw new Error('Processing aborted by user');
        }

        if (!shouldProcess) continue;

        const sceneName = triplet.current.file.basename;

        const prevBody = triplet.prev ? triplet.prev.body : null;
        const currentBody = triplet.current.body;
        const nextBody = triplet.next ? triplet.next.body : null;
        const prevNum = triplet.prev ? String(triplet.prev.sceneNumber ?? 'N/A') : 'N/A';
        const currentNum = String(triplet.current.sceneNumber ?? 'N/A');
        const nextNum = triplet.next ? String(triplet.next.sceneNumber ?? 'N/A') : 'N/A';

        if (modal && typeof modal.setTripletInfo === 'function') {
            modal.setTripletInfo(prevNum, currentNum, nextNum, triplet.current.file.path, sceneName);
        }

        // Use default context for scene analysis to avoid blending with story beat templates
        const userPrompt = buildSceneAnalysisPrompt(prevBody, currentBody, nextBody, prevNum, currentNum, nextNum);

        const sceneNameForLog = triplet.current.file.basename;
        const tripletForLog = { prev: prevNum, current: currentNum, next: nextNum };
        const runAi = createAiRunner(plugin, vault, callAiProvider);
        // Use subplotName, 'processBySubplotOrder', sceneNameForLog, tripletForLog
        const aiResult = await runAi(userPrompt, subplotName, 'processBySubplotOrder', sceneNameForLog, tripletForLog);

        if (aiResult.result) {
            const parsedAnalysis = parseGptResult(aiResult.result, plugin);
            if (parsedAnalysis) {
                if (!triplet.prev) parsedAnalysis['previousSceneAnalysis'] = '';
                if (!triplet.next) parsedAnalysis['nextSceneAnalysis'] = '';

                const success = await updateSceneAnalysis(vault, triplet.current.file, parsedAnalysis, plugin, aiResult.modelIdUsed);
                if (success) {
                    processedCount++;
                    modal.updateProgress(processedCount, total, sceneName);
                } else {
                    modal.addError(`Failed to update file for scene ${triplet.current.sceneNumber}: ${triplet.current.file.path}`);
                }
            } else {
                modal.addError(`Failed to parse AI response for scene ${triplet.current.sceneNumber}: ${triplet.current.file.path}`);
            }
        } else {
            modal.addError(`AI processing failed for scene ${triplet.current.sceneNumber}: ${triplet.current.file.path}`);
        }
    }

    await plugin.saveSettings();
}

export async function processEntireSubplotWithModalInternal(
    plugin: RadialTimelinePlugin,
    vault: Vault,
    subplotName: string,
    modal: SceneAnalysisProcessingModal
): Promise<void> {
    const allScenes = await getAllSceneData(plugin, vault);
    if (allScenes.length < 1) {
        throw new Error('No valid scenes found in the specified source path.');
    }

    const filtered = allScenes.filter(scene => getSubplotNamesFromFM(scene.frontmatter).includes(subplotName));
    if (filtered.length === 0) {
        throw new Error(`No scenes found for subplot "${subplotName}".`);
    }

    filtered.sort(compareScenesByOrder);
    const isResuming = plugin.settings._isResuming || false;
    if (isResuming) {
        plugin.settings._isResuming = false;
        await plugin.saveSettings();
    }

    const triplets: { prev: SceneData | null; current: SceneData; next: SceneData | null }[] = [];
    for (let i = 0; i < filtered.length; i++) {
        const currentScene = filtered[i];
        const prevScene = i > 0 ? filtered[i - 1] : null;
        const nextScene = i < filtered.length - 1 ? filtered[i + 1] : null;
        triplets.push({ prev: prevScene, current: currentScene, next: nextScene });
    }

    const subplotTasks = triplets.map(triplet => {
        const alreadyProcessed = hasBeenProcessedForBeats(triplet.current.frontmatter, { todayOnly: true });
        const shouldProcess = isResuming ? !alreadyProcessed : true;
        return { triplet, shouldProcess };
    });
    const queueItems = subplotTasks
        .filter(task => task.shouldProcess)
        .map(task => buildQueueItem(task.triplet.current));
    if (modal && typeof modal.setProcessingQueue === 'function') {
        modal.setProcessingQueue(queueItems);
    }
    const total = queueItems.length;
    let processedCount = 0;

    for (const { triplet, shouldProcess } of subplotTasks) {
        if (modal.isAborted()) {
            await plugin.saveSettings();
            throw new Error('Processing aborted by user');
        }

        if (!shouldProcess) continue;

        const sceneName = triplet.current.file.basename;

        const prevBody = triplet.prev ? triplet.prev.body : null;
        const currentBody = triplet.current.body;
        const nextBody = triplet.next ? triplet.next.body : null;
        const prevNum = triplet.prev ? String(triplet.prev.sceneNumber ?? 'N/A') : 'N/A';
        const currentNum = String(triplet.current.sceneNumber ?? 'N/A');
        const nextNum = triplet.next ? String(triplet.next.sceneNumber ?? 'N/A') : 'N/A';

        if (modal && typeof modal.setTripletInfo === 'function') {
            modal.setTripletInfo(prevNum, currentNum, nextNum, triplet.current.file.path, sceneName);
        }

        // Use default context for scene analysis to avoid blending with story beat templates
        const userPrompt = buildSceneAnalysisPrompt(prevBody, currentBody, nextBody, prevNum, currentNum, nextNum);

        const sceneNameForLog = triplet.current.file.basename;
        const tripletForLog = { prev: prevNum, current: currentNum, next: nextNum };
        const runAi = createAiRunner(plugin, vault, callAiProvider);
        const aiResult = await runAi(userPrompt, subplotName, 'processEntireSubplot', sceneNameForLog, tripletForLog);

        if (aiResult.result) {
            const parsedAnalysis = parseGptResult(aiResult.result, plugin);
            if (parsedAnalysis) {
                if (!triplet.prev) parsedAnalysis['previousSceneAnalysis'] = '';
                if (!triplet.next) parsedAnalysis['nextSceneAnalysis'] = '';

                const success = await updateSceneAnalysis(vault, triplet.current.file, parsedAnalysis, plugin, aiResult.modelIdUsed);
                if (success) {
                    processedCount++;
                    modal.updateProgress(processedCount, total, sceneName);
                } else {
                    modal.addError(`Failed to update file for scene ${triplet.current.sceneNumber}: ${triplet.current.file.path}`);
                }
            } else {
                modal.addError(`Failed to parse AI response for scene ${triplet.current.sceneNumber}: ${triplet.current.file.path}`);
            }
        } else {
            modal.addError(`AI processing failed for scene ${triplet.current.sceneNumber}: ${triplet.current.file.path}`);
        }
    }

    await plugin.saveSettings();
}

export function getActiveContextPrompt(plugin: RadialTimelinePlugin): string | undefined {
    const templates = plugin.settings.aiContextTemplates || [];
    const activeId = plugin.settings.activeAiContextTemplateId;
    const active = templates.find(t => t.id === activeId);
    return active?.prompt;
}
