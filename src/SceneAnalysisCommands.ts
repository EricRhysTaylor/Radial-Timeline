/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */
import RadialTimelinePlugin from './main';
import { App, Vault, Notice, stringifyYaml, Modal, ButtonComponent, TFile, getFrontMatterInfo, parseYaml } from 'obsidian';
import { sanitizeSourcePath, buildInitialSceneFilename } from './utils/sceneCreation';
import { SceneAnalysisProcessingModal, type ProcessingMode } from './modals/SceneAnalysisProcessingModal';
import { openOrRevealFileByPath } from './utils/fileUtils';
import { buildTripletsByIndex } from './sceneAnalysis/TripletBuilder';
import { updateSceneAnalysis } from './sceneAnalysis/FileUpdater';
import { createAiRunner } from './sceneAnalysis/RequestRunner';
import { normalizeBooleanValue } from './utils/sceneHelpers';
import {
    calculateSceneCount,
    calculateFlaggedCount,
    compareScenesByOrder,
    getAllSceneData,
    getSubplotNamesFromFM,
    hasBeenProcessedForBeats,
    hasProcessableContent
} from './sceneAnalysis/data';
import { callAiProvider } from './sceneAnalysis/aiProvider';
import { parseGptResult } from './sceneAnalysis/responseParsing';
import type { ParsedSceneAnalysis, SceneData } from './sceneAnalysis/types';
import { buildSceneAnalysisPrompt } from './ai/prompts/sceneAnalysis';

export { calculateSceneCount, calculateFlaggedCount, getDistinctSubplotNames } from './sceneAnalysis/data';

// Helper function to get the active AI context template prompt
function getActiveContextPrompt(plugin: RadialTimelinePlugin): string | undefined {
    const templates = plugin.settings.aiContextTemplates || [];
    const activeId = plugin.settings.activeAiContextTemplateId;
    const active = templates.find(t => t.id === activeId);
    return active?.prompt;
}

type FMInfo = {
    exists: boolean;
    frontmatter?: string;
    position?: { start?: { offset: number }, end?: { offset: number } };
};

async function updateSceneFile(
    vault: Vault, 
    scene: SceneData, 
    parsedAnalysis: ParsedSceneAnalysis, 
    plugin: RadialTimelinePlugin,
    modelIdUsed: string | null
): Promise<boolean> {

    try {
        // Helper to convert a multi-line "- item" string into array of strings
        const toArray = (block: string): string[] => {
            return block
                .split('\n')
                .map(s => s.replace(/^\s*-\s*/, '').trim())
                .filter(Boolean);
        };

        // Atomically update frontmatter
        await plugin.app.fileManager.processFrontMatter(scene.file, (fm) => {
            // Use a typed record view for safe index operations
            const fmObj = fm as Record<string, unknown>;
            delete fmObj['1beats'];
            delete fmObj['2beats'];
            delete fmObj['3beats'];

            // Always record last update timestamp/model in Beats Last Updated.
            // Use friendly local time format instead of ISO
            const now = new Date();
            const timestamp = now.toLocaleString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });
            const updatedValue = `${timestamp}${modelIdUsed ? ` by ${modelIdUsed}` : ' by Unknown Model'}`;
            fmObj['Beats Last Updated'] = updatedValue;

            // After a successful update, always set the processing flag to No/False
            // If lowercase beatsupdate exists, update it; otherwise use Beats Update
            if (Object.prototype.hasOwnProperty.call(fmObj, 'beatsupdate')) {
                fmObj['beatsupdate'] = false; // Use boolean false for consistency
            } else {
                // Always set Beats Update=False (canonical form) after processing
                fmObj['Beats Update'] = false;
            }

            const b1 = parsedAnalysis['previousSceneAnalysis']?.trim();
            const b2 = parsedAnalysis['currentSceneAnalysis']?.trim();
            const b3 = parsedAnalysis['nextSceneAnalysis']?.trim();
            
            if (b1) fmObj['previousSceneAnalysis'] = toArray(b1);
            if (b2) fmObj['currentSceneAnalysis'] = toArray(b2);
            if (b3) fmObj['nextSceneAnalysis'] = toArray(b3);
        });
        return true;
    } catch (error) {
        console.error(`[updateSceneFile] Error updating file:`, error);
        new Notice(`Error saving updates to ${scene.file.basename}`);
        return false;
    }
}

export async function processByManuscriptOrder(
    plugin: RadialTimelinePlugin,
    vault: Vault
): Promise<void> {
    // Create modal with scene count calculator
    const modal = new SceneAnalysisProcessingModal(
        plugin.app,
        plugin,
        (mode: ProcessingMode) => calculateSceneCount(plugin, vault, mode),
        async (mode: ProcessingMode) => {
            // This is the actual processing logic
            await processWithModal(plugin, vault, mode, modal);
        },
        'radial-timeline:update-beats-manuscript-order' // pass command ID for resume functionality
    );
    
    modal.open();
}

// Internal processing function that works with the modal
async function processWithModal(
    plugin: RadialTimelinePlugin,
    vault: Vault,
    mode: ProcessingMode,
    modal: SceneAnalysisProcessingModal
): Promise<void> {
    // Check if this is a resume operation
    const isResuming = plugin.settings._isResuming || false;
    
    // Clear the flag immediately after reading
    if (isResuming) {
        plugin.settings._isResuming = false;
        await plugin.saveSettings();
    }
    
    const allScenes = await getAllSceneData(plugin, vault);
    allScenes.sort(compareScenesByOrder);

    if (allScenes.length < 1) {
        throw new Error("No valid scenes found in the specified source path.");
    }

    // Filter scenes based on mode
    const processableScenes = allScenes.filter(scene => {
        // Flagged mode: must have Beats Update=Yes/True/1
        if (mode === 'flagged') {
            const beatsUpdateFlag = scene.frontmatter?.beatsupdate ?? scene.frontmatter?.BeatsUpdate ?? scene.frontmatter?.['Beats Update'];
            return normalizeBooleanValue(beatsUpdateFlag);
        }
        
        // Force-all and unprocessed modes: must have Status=Complete or Working
        return hasProcessableContent(scene.frontmatter);
    });

    // Build list of scenes with processable content (Status=Working or Complete) for context
    const processableContentScenes = allScenes.filter(scene => hasProcessableContent(scene.frontmatter));
    
    // Build triplets using only processable scenes for context, but only process flagged scenes
    const triplets = buildTripletsByIndex(processableContentScenes, processableScenes, (s) => s.file.path);

    let processedCount = 0;
    let totalToProcess = 0;
    
    // Calculate total based on mode AND resume state - MUST match the processing logic below
    for (const triplet of triplets) {
        const beatsUpdateFlag = triplet.current.frontmatter?.beatsupdate ?? triplet.current.frontmatter?.BeatsUpdate ?? triplet.current.frontmatter?.['Beats Update'];
        const isFlagged = normalizeBooleanValue(beatsUpdateFlag);
        
        if (mode === 'flagged') {
            // Flagged mode: count flagged scenes (resume doesn't change this)
            if (isFlagged) totalToProcess++;
        } else if (mode === 'force-all') {
            if (isResuming) {
                // Resume: only count scenes NOT processed today
                if (!hasBeenProcessedForBeats(triplet.current.frontmatter, { todayOnly: true })) {
                    totalToProcess++;
                }
            } else {
                // Initial: count all scenes
                totalToProcess++;
            }
        } else if (mode === 'unprocessed') {
            if (isResuming) {
                // Resume: only count scenes NOT processed today
                if (!hasBeenProcessedForBeats(triplet.current.frontmatter, { todayOnly: true })) {
                    totalToProcess++;
                }
            } else {
                // Initial: count scenes with no timestamp/beats
                if (!hasBeenProcessedForBeats(triplet.current.frontmatter)) {
                    totalToProcess++;
                }
            }
        }
    }

    // Process triplets
    for (const triplet of triplets) {
        // Check for abort signal
        if (modal.isAborted()) {
            await plugin.saveSettings();
            throw new Error('Processing aborted by user');
        }

        const currentScenePath = triplet.current.file.path;
        const tripletIdentifier = `${triplet.prev?.sceneNumber ?? 'Start'}-${triplet.current.sceneNumber}-${triplet.next?.sceneNumber ?? 'End'}`;
        const beatsUpdateFlag = triplet.current.frontmatter?.beatsupdate ?? triplet.current.frontmatter?.BeatsUpdate ?? triplet.current.frontmatter?.['Beats Update'];
        const isFlagged = normalizeBooleanValue(beatsUpdateFlag);
        
        // Determine if we should process this scene based on mode AND resume state
        let shouldProcess = false;
        
        if (mode === 'flagged') {
            // Flagged mode: just check the flag (resume doesn't change this)
            shouldProcess = isFlagged;
        } else if (mode === 'force-all') {
            if (isResuming) {
                // Resume: skip scenes processed today
                shouldProcess = !hasBeenProcessedForBeats(triplet.current.frontmatter, { todayOnly: true });
            } else {
                // Initial: process everything
                shouldProcess = true;
            }
        } else if (mode === 'unprocessed') {
            if (isResuming) {
                // Resume: skip scenes processed today
                shouldProcess = !hasBeenProcessedForBeats(triplet.current.frontmatter, { todayOnly: true });
            } else {
                // Initial: skip scenes with any timestamp/beats
                shouldProcess = !hasBeenProcessedForBeats(triplet.current.frontmatter);
            }
        }

        if (!shouldProcess) {
            continue;
        }

        // Update progress - use basename directly (already includes scene number)
        const sceneName = triplet.current.file.basename;
        modal.updateProgress(processedCount + 1, totalToProcess, sceneName);
        
        // For log filename, use the same basename
        const sceneNameForLog = sceneName;

        try {
            // Boundary cases: include neighbors if they exist in sequence, regardless of content status
            // This ensures proper triplet context for the LLM (first scene: N/A,1,2; last scene: N-1,N,N/A)
            const prevBody = triplet.prev ? triplet.prev.body : null;
            const currentBody = triplet.current.body;
            const nextBody = triplet.next ? triplet.next.body : null;
            const prevNum = triplet.prev ? String(triplet.prev.sceneNumber ?? 'N/A') : 'N/A';
            const currentNum = String(triplet.current.sceneNumber ?? 'N/A');
            const nextNum = triplet.next ? String(triplet.next.sceneNumber ?? 'N/A') : 'N/A';

            // Show runtime triplet in modal
            if (plugin.activeBeatsModal && typeof plugin.activeBeatsModal.setTripletInfo === 'function') {
                plugin.activeBeatsModal.setTripletInfo(prevNum, currentNum, nextNum);
            }

            const contextPrompt = getActiveContextPrompt(plugin);
            const userPrompt = buildSceneAnalysisPrompt(prevBody, currentBody, nextBody, prevNum, currentNum, nextNum, contextPrompt);

            // Pass triplet info directly to avoid regex parsing
            const tripletForLog = { prev: prevNum, current: currentNum, next: nextNum };
            const runAi = createAiRunner(plugin, vault, callAiProvider);
            const aiResult = await runAi(userPrompt, null, 'processByManuscriptOrder', sceneNameForLog, tripletForLog);

            if (aiResult.result) {
                const parsedAnalysis = parseGptResult(aiResult.result, plugin);
                if (parsedAnalysis) {
                    // Post-processing: for boundary cases, ensure only the expected sections are saved
                    if (!triplet.prev) {
                        // First-scene case: no previous scene, drop any previousSceneAnalysis content
                        parsedAnalysis['previousSceneAnalysis'] = '';
                    }
                    if (!triplet.next) {
                        // Last-scene case: no next scene, drop any nextSceneAnalysis content
                        parsedAnalysis['nextSceneAnalysis'] = '';
                    }
                    const updated = await updateSceneAnalysis(vault, triplet.current.file, parsedAnalysis, plugin, aiResult.modelIdUsed);
                    if (updated) {
                        await plugin.saveSettings();
                        // Ensure progress UI is consistent when abort requested after finishing this scene
                        modal.updateProgress(processedCount + 1, totalToProcess, sceneName);
                    } else {
                        modal.addError(`Failed to update file: ${currentScenePath}`);
                    }
                } else {
                    modal.addError(`Failed to parse AI result for: ${sceneName}`);
                }
            } else {
                modal.addError(`No result from AI for: ${sceneName}`);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            // Check for rate limit or overload errors
            const isRateLimitError = errorMessage.toLowerCase().includes('rate limit') || 
                                    errorMessage.toLowerCase().includes('overloaded') ||
                                    errorMessage.toLowerCase().includes('too many requests');
            
            if (isRateLimitError) {
                modal.addError(`API RATE LIMIT EXCEEDED - Processing stopped`);
                modal.addError(`Details: ${errorMessage}`);
                modal.addError(`System retried 3 times with delays (5s, 10s, 20s) but rate limit persists. Anthropic limits: 50 requests/min for Sonnet 4.x. The plugin now waits 1.5s between scenes (40 req/min). Use Resume to continue after the rate limit window resets (~1 minute).`);
                modal.abort(); // Trigger abort flag
                await plugin.saveSettings();
                throw new Error(`Processing aborted due to rate limit: ${errorMessage}`);
            }
            
            modal.addError(`Error processing ${sceneName}: ${errorMessage}`);
        }

        processedCount++;
        
        // Delay to stay under rate limits (skip delay if aborted to let modal finish immediately)
        // Anthropic Sonnet 4.x: 50 requests/minute = 1.2s minimum
        // Using 1.5s (40 req/min) to stay safely under the limit
        if (!modal.isAborted()) {
            await new Promise(resolve => window.setTimeout(resolve, 1500));
        }
    }

    await plugin.saveSettings();
    plugin.refreshTimelineIfNeeded(null);
    
    // Modal will show summary, no need for notice here
}

export async function processBySubplotOrder(
    plugin: RadialTimelinePlugin,
    vault: Vault
): Promise<void> {
     
     const notice = new Notice("Processing Subplot: Getting scene data...", 0);

    try {
    const allScenes = await getAllSceneData(plugin, vault);
         if (allScenes.length < 1) {
             new Notice("No valid scenes found in the specified source path.");
              notice.hide();
        return;
    }

        const scenesBySubplot: Record<string, SceneData[]> = {};
    allScenes.forEach(scene => {
            const subplotList = getSubplotNamesFromFM(scene.frontmatter);
            subplotList.forEach(subplotKey => {
                 if (subplotKey) {
                     if (!scenesBySubplot[subplotKey]) {
                         scenesBySubplot[subplotKey] = [];
            }
                     if (!scenesBySubplot[subplotKey].some(s => s.file.path === scene.file.path)) {
                           scenesBySubplot[subplotKey].push(scene);
                     }
                 }
        });
    });

        const subplotNames = Object.keys(scenesBySubplot);
         if (subplotNames.length === 0) {
             new Notice("No scenes with subplots found.");
              notice.hide();
             return;
         }

        let totalProcessedCount = 0;
         let totalTripletsAcrossSubplots = 0;

        // Count only valid scenes with Status: working/complete for the total
        subplotNames.forEach(subplotName => {
            const scenes = scenesBySubplot[subplotName];
            scenes.sort(compareScenesByOrder);
            
            // Count only scenes with Status: working/complete and Beats Update: Yes
            const validScenes = scenes.filter(scene => {
                const beatsUpdate = scene.frontmatter?.beatsupdate || scene.frontmatter?.BeatsUpdate || scene.frontmatter?.['Beats Update'];

                if (normalizeBooleanValue(beatsUpdate) &&
                    !hasProcessableContent(scene.frontmatter)) {
                    const msg = `Scene ${scene.sceneNumber ?? scene.file.basename} (subplot ${subplotName}) has Beats Update: Yes/True but Status is not working/complete. Skipping.`;
                    // Surface to user via Notice; suppress console noise
                    new Notice(msg, 6000);
                }

                return hasProcessableContent(scene.frontmatter) && 
                       normalizeBooleanValue(beatsUpdate);
            });
            
            totalTripletsAcrossSubplots += validScenes.length;
        });

        notice.setMessage(`Analyzing ${totalTripletsAcrossSubplots} scenes for subplot order...`);

        for (const subplotName of subplotNames) {
             const scenes = scenesBySubplot[subplotName];
            scenes.sort(compareScenesByOrder);



        // Build contiguous triplets within this subplot by number (ignore Words),
        // but only process currents that have Status: working/complete and Beats Update: Yes
        const orderedScenes = scenes.slice().sort(compareScenesByOrder);
        
        // Filter to only scenes with processable content for triplet context
        const processableContentScenes = orderedScenes.filter(scene => hasProcessableContent(scene.frontmatter));
        
        const flaggedInOrder = orderedScenes.filter(s => hasProcessableContent(s.frontmatter) && normalizeBooleanValue(s.frontmatter?.beatsupdate || s.frontmatter?.BeatsUpdate || s.frontmatter?.['Beats Update']));
        const triplets = buildTripletsByIndex(processableContentScenes, flaggedInOrder, (s) => s.file.path);
        
            for (const triplet of triplets) {
                const currentScenePath = triplet.current.file.path;
                 const tripletIdentifier = `subplot-${subplotName}-${triplet.prev?.sceneNumber ?? 'Start'}-${triplet.current.sceneNumber}-${triplet.next?.sceneNumber ?? 'End'}`;

                 const beatsUpdateFlag = triplet.current.frontmatter?.beatsupdate ?? triplet.current.frontmatter?.['Beats Update'];
                 if (!normalizeBooleanValue(beatsUpdateFlag)) {
                     continue; // Skip to the next triplet if not flagged
                 }
                 
                 // We've already filtered scenes by Status: working/complete when building triplets,
                 // so no need to check again here.

                notice.setMessage(`Processing scene ${triplet.current.sceneNumber} (${totalProcessedCount+1}/${totalTripletsAcrossSubplots}) - Subplot: '${subplotName}'...`);
                 // Include neighbors if they exist in the subplot sequence, regardless of content status
                 const prevBody = triplet.prev ? triplet.prev.body : null;
                 const currentBody = triplet.current.body;
                 const nextBody = triplet.next ? triplet.next.body : null;
                 const prevNum = triplet.prev ? String(triplet.prev.sceneNumber ?? 'N/A') : 'N/A';
                 const currentNum = String(triplet.current.sceneNumber ?? 'N/A');
                 const nextNum = triplet.next ? String(triplet.next.sceneNumber ?? 'N/A') : 'N/A';

                 const contextPrompt = getActiveContextPrompt(plugin);
                 const userPrompt = buildSceneAnalysisPrompt(prevBody, currentBody, nextBody, prevNum, currentNum, nextNum, contextPrompt);

                 // Use basename directly (already includes scene number)
                 const sceneNameForLog = triplet.current.file.basename;
                 const runAi = createAiRunner(plugin, vault, callAiProvider);
                 const aiResult = await runAi(userPrompt, subplotName, 'processBySubplotOrder', sceneNameForLog);

                 if (aiResult.result) {
                     const parsedAnalysis = parseGptResult(aiResult.result, plugin);
                     if (parsedAnalysis) {
                         // Post-processing: for boundary cases, ensure only the expected sections are saved
                         if (!triplet.prev) {
                             // First-scene case: no previous scene, drop any 1beats content
                             parsedAnalysis['previousSceneAnalysis'] = '';
                         }
                         if (!triplet.next) {
                             // Last-scene case: no next scene, drop any 3beats content
                             parsedAnalysis['nextSceneAnalysis'] = '';
                         }
                         
                         const updated = await updateSceneAnalysis(vault, triplet.current.file, parsedAnalysis, plugin, aiResult.modelIdUsed);
                         if (updated) {
                             await plugin.saveSettings();
                         } else {
                         }
                     } else {
                     }
                 } else {
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
         console.error("[API Beats][processBySubplotOrder] Error during processing:", error);
         notice.hide();
         new Notice("Error processing subplots. Check console for details.");
     }
}

// Internal processing function for subplot that works with the modal
async function processSubplotWithModal(
    plugin: RadialTimelinePlugin,
    vault: Vault,
    subplotName: string,
    modal: SceneAnalysisProcessingModal
): Promise<void> {
    try {
        const allScenes = await getAllSceneData(plugin, vault);
        if (allScenes.length < 1) {
            throw new Error("No valid scenes found in the specified source path.");
        }

        // Filter scenes to only those containing the chosen subplot
        const filtered = allScenes.filter(scene => getSubplotNamesFromFM(scene.frontmatter).includes(subplotName));
        
        if (filtered.length === 0) {
            throw new Error(`No scenes found for subplot "${subplotName}".`);
        }

        // Sort by sceneNumber (if present)
        filtered.sort(compareScenesByOrder);

        // Consider only scenes with Status: working/complete and Beats Update: Yes
        const validScenes = filtered.filter(scene => {
            const beatsUpdate = (scene.frontmatter?.beatsupdate || scene.frontmatter?.BeatsUpdate || scene.frontmatter?.['Beats Update']) as unknown;
            return hasProcessableContent(scene.frontmatter)
                && normalizeBooleanValue(beatsUpdate);
        });

        if (validScenes.length === 0) {
            throw new Error(`No flagged scenes (Beats Update: Yes/True/1) with content found for "${subplotName}".`);
        }

        // Build triplets for flagged scenes using only processable content scenes for context
        const triplets: { prev: SceneData | null, current: SceneData, next: SceneData | null }[] = [];
        
        // Filter to only scenes with processable content (Status=Working or Complete) for context
        const processableContentScenes = filtered.filter(scene => hasProcessableContent(scene.frontmatter));
        
        // Only build triplets for scenes that are flagged for processing
        const flaggedScenes = validScenes; // Already filtered for Status: working/complete and BeatsUpdate: Yes
        
        for (const flaggedScene of flaggedScenes) {
            // Find this scene's position in the processable content list
            const idx = processableContentScenes.findIndex(s => s.file.path === flaggedScene.file.path);
            
            // Get prev/next from processable content list only (Status=Working or Complete)
            const prev = idx > 0 ? processableContentScenes[idx - 1] : null;
            const next = idx >= 0 && idx < processableContentScenes.length - 1 ? processableContentScenes[idx + 1] : null;
            
            triplets.push({ prev, current: flaggedScene, next });
        }

        let processedCount = 0;
        const total = triplets.length;

        // Process triplets
        for (const triplet of triplets) {
            // Check for abort signal
            if (modal.isAborted()) {
                await plugin.saveSettings();
                throw new Error('Processing aborted by user');
            }

            // Only process if the current scene is flagged
            const flag = (triplet.current.frontmatter?.beatsupdate || triplet.current.frontmatter?.BeatsUpdate || triplet.current.frontmatter?.['Beats Update']) as unknown;
            if (!normalizeBooleanValue(flag)) continue;

            const currentPath = triplet.current.file.path;
            const tripletIdentifier = `subplot-${subplotName}-${triplet.prev?.sceneNumber ?? 'Start'}-${triplet.current.sceneNumber}-${triplet.next?.sceneNumber ?? 'End'}`;

            // Update progress - use basename directly (already includes scene number)
            const sceneName = triplet.current.file.basename;
            modal.updateProgress(processedCount + 1, total, sceneName);

            // Include neighbors if they exist in the subplot sequence, regardless of content status
            const prevBody = triplet.prev ? triplet.prev.body : null;
            const currentBody = triplet.current.body;
            const nextBody = triplet.next ? triplet.next.body : null;
            const prevNum = triplet.prev ? String(triplet.prev.sceneNumber ?? 'N/A') : 'N/A';
            const currentNum = String(triplet.current.sceneNumber ?? 'N/A');
            const nextNum = triplet.next ? String(triplet.next.sceneNumber ?? 'N/A') : 'N/A';

            // Update triplet information in the modal to show subplot context
            if (modal && typeof modal.setTripletInfo === 'function') {
                modal.setTripletInfo(prevNum, currentNum, nextNum);
            } else {
            }

            const contextPrompt = getActiveContextPrompt(plugin);
            const userPrompt = buildSceneAnalysisPrompt(prevBody, currentBody, nextBody, prevNum, currentNum, nextNum, contextPrompt);
            
            // Use basename directly (already includes scene number)
            const sceneNameForLog = triplet.current.file.basename;
            
            // Pass triplet info directly to avoid regex parsing
            const tripletForLog = { prev: prevNum, current: currentNum, next: nextNum };
            const runAi = createAiRunner(plugin, vault, callAiProvider);
            const aiResult = await runAi(userPrompt, subplotName, 'processBySubplotOrder', sceneNameForLog, tripletForLog);

            if (aiResult.result) {
                const parsedAnalysis = parseGptResult(aiResult.result, plugin);
                if (parsedAnalysis) {
                    // Post-processing: for boundary cases, ensure only the expected sections are saved
                    if (!triplet.prev) {
                        // First-scene case: no previous scene, drop any previousSceneAnalysis content
                        parsedAnalysis['previousSceneAnalysis'] = '';
                    }
                    if (!triplet.next) {
                        // Last-scene case: no next scene, drop any nextSceneAnalysis content
                        parsedAnalysis['nextSceneAnalysis'] = '';
                    }

                    const success = await updateSceneFile(vault, triplet.current, parsedAnalysis, plugin, aiResult.modelIdUsed);
                    if (success) {
                        processedCount++;
                    } else {
                        modal.addError(`Failed to update file for scene ${triplet.current.sceneNumber}: ${currentPath}`);
                    }
                } else {
                    modal.addError(`Failed to parse AI response for scene ${triplet.current.sceneNumber}: ${currentPath}`);
                }
            } else {
                modal.addError(`AI processing failed for scene ${triplet.current.sceneNumber}: ${currentPath}`);
            }
        }

        await plugin.saveSettings();
    } catch (error) {
        throw error;
    }
}

// Process entire subplot (all scenes) for a single chosen subplot name with modal support
export async function processEntireSubplotWithModal(
    plugin: RadialTimelinePlugin,
    vault: Vault,
    subplotName: string,
    isResuming: boolean = false
): Promise<void> {
    // If there's already an active processing modal, just reopen it
    if (plugin.activeBeatsModal && plugin.activeBeatsModal.isProcessing) {
        plugin.activeBeatsModal.open();
        new Notice('Reopening active processing session...');
        return;
    }

    // Create a function to get scene count for the entire subplot
    const getSceneCount = async (): Promise<number> => {
        try {
            const allScenes = await getAllSceneData(plugin, vault);
            const filtered = allScenes.filter(scene => getSubplotNamesFromFM(scene.frontmatter).includes(subplotName));
            // Count all scenes with processable content (not just flagged ones)
            const validScenes = filtered.filter(scene => hasProcessableContent(scene.frontmatter));
            
            if (isResuming) {
                // Resume: only count scenes NOT processed today
                const unprocessedToday = validScenes.filter(scene => 
                    !hasBeenProcessedForBeats(scene.frontmatter, { todayOnly: true })
                );
                return unprocessedToday.length;
            } else {
                // Initial: count all scenes (entire subplot processes everything)
                return validScenes.length;
            }
        } catch (error) {
            return 0;
        }
    };

    // Create the modal with subplot-specific context
    const modal = new SceneAnalysisProcessingModal(
        plugin.app,
        plugin,
        getSceneCount,
        async () => {
            await processEntireSubplotWithModalInternal(plugin, vault, subplotName, modal, isResuming);
        },
        undefined, // no resumeCommandId for subplot processing
        subplotName, // pass subplot name for resume functionality
        true // isEntireSubplot = true
    );
    
    // Override the modal's onOpen to skip confirmation and start processing immediately
    const originalOnOpen = modal.onOpen.bind(modal);
    modal.onOpen = function() {
        // Show the modal first
        const { contentEl, titleEl } = this;
        titleEl.setText(`Processing entire subplot: ${subplotName}`);
        
        // Show progress view immediately (skip confirmation)
        this.showProgressView();
        
        // Start processing automatically
        this.isProcessing = true;
        this.abortController = new AbortController();
        
        // Notify plugin that processing has started
        plugin.activeBeatsModal = this;
        plugin.showBeatsStatusBar(0, 0);
        
        // Start the actual processing
        (async () => {
            try {
                await processEntireSubplotWithModalInternal(plugin, vault, subplotName, modal, isResuming);
                
                // Show appropriate summary
                if (this.abortController && this.abortController.signal.aborted) {
                    this.showCompletionSummary('Processing aborted by user or rate limit');
                } else {
                    this.showCompletionSummary('Processing completed successfully!');
                }
            } catch (error) {
                if (!this.abortController.signal.aborted) {
                    this.addError(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
                    this.showCompletionSummary('Processing stopped due to error');
                } else {
                    this.showCompletionSummary('Processing aborted by user or rate limit');
                }
            } finally {
                this.isProcessing = false;
                this.abortController = null;
                plugin.activeBeatsModal = null;
                plugin.hideBeatsStatusBar();
            }
        })();
    };
    
    modal.open();
}

// Internal processing function for entire subplot that works with the modal
async function processEntireSubplotWithModalInternal(
    plugin: RadialTimelinePlugin,
    vault: Vault,
    subplotName: string,
    modal: SceneAnalysisProcessingModal,
    isResuming: boolean = false
): Promise<void> {
    try {
        const allScenes = await getAllSceneData(plugin, vault);
        if (allScenes.length < 1) {
            throw new Error("No valid scenes found in the specified source path.");
        }

        // Filter scenes to only those containing the chosen subplot
        const filtered = allScenes.filter(scene => getSubplotNamesFromFM(scene.frontmatter).includes(subplotName));
        
        if (filtered.length === 0) {
            throw new Error(`No scenes found for subplot "${subplotName}".`);
        }

        // Sort by sceneNumber (if present)
        filtered.sort(compareScenesByOrder);

        // Process ALL scenes with processable content (not just flagged ones)
        const validScenes = filtered.filter(scene => hasProcessableContent(scene.frontmatter));

        if (validScenes.length === 0) {
            throw new Error(`No scenes with processable content found for "${subplotName}".`);
        }

        // Build triplets for ALL processable scenes
        const triplets: { prev: SceneData | null, current: SceneData, next: SceneData | null }[] = [];
        
        for (const currentScene of validScenes) {
            const currentIndex = validScenes.indexOf(currentScene);
            const prevScene = currentIndex > 0 ? validScenes[currentIndex - 1] : null;
            const nextScene = currentIndex < validScenes.length - 1 ? validScenes[currentIndex + 1] : null;
            
            triplets.push({
                prev: prevScene,
                current: currentScene,
                next: nextScene
            });
        }

        // Count scenes based on resume state
        let total: number;
        if (isResuming) {
            // Resume: only count scenes NOT processed today
            total = triplets.filter(t => !hasBeenProcessedForBeats(t.current.frontmatter, { todayOnly: true })).length;
        } else {
            // Initial: count all scenes (entire subplot processes everything)
            total = triplets.length;
        }
        let processedCount = 0;

        // Process triplets
        for (const triplet of triplets) {
            // Check for abort signal
            if (modal.isAborted()) {
                await plugin.saveSettings();
                throw new Error('Processing aborted by user');
            }

            const currentPath = triplet.current.file.path;
            const tripletIdentifier = `entire-subplot-${subplotName}-${triplet.prev?.sceneNumber ?? 'Start'}-${triplet.current.sceneNumber}-${triplet.next?.sceneNumber ?? 'End'}`;

            // Skip logic based on resume state
            if (isResuming) {
                // Resume: skip scenes processed today
                if (hasBeenProcessedForBeats(triplet.current.frontmatter, { todayOnly: true })) {
                    continue;
                }
            }
            // Initial run: process all scenes (no skipping)

            // Update progress - use basename directly (already includes scene number)
            const sceneName = triplet.current.file.basename;
            modal.updateProgress(processedCount + 1, total, sceneName);

            // Include neighbors if they exist in the subplot sequence
            const prevBody = triplet.prev ? triplet.prev.body : null;
            const currentBody = triplet.current.body;
            const nextBody = triplet.next ? triplet.next.body : null;
            const prevNum = triplet.prev ? String(triplet.prev.sceneNumber ?? 'N/A') : 'N/A';
            const currentNum = String(triplet.current.sceneNumber ?? 'N/A');
            const nextNum = triplet.next ? String(triplet.next.sceneNumber ?? 'N/A') : 'N/A';

            // Update triplet information in the modal to show subplot context
            if (modal && typeof modal.setTripletInfo === 'function') {
                modal.setTripletInfo(prevNum, currentNum, nextNum);
            } else {
            }

            const contextPrompt = getActiveContextPrompt(plugin);
            const userPrompt = buildSceneAnalysisPrompt(prevBody, currentBody, nextBody, prevNum, currentNum, nextNum, contextPrompt);

            const sceneNameForLog = triplet.current.file.basename;
            const tripletForLog = { prev: prevNum, current: currentNum, next: nextNum };
            const runAi = createAiRunner(plugin, vault, callAiProvider);
            const aiResult = await runAi(userPrompt, subplotName, 'processEntireSubplot', sceneNameForLog, tripletForLog);

            if (aiResult.result) {
                const parsedAnalysis = parseGptResult(aiResult.result, plugin);
                if (parsedAnalysis) {
                    // Post-processing: for boundary cases, ensure only the expected sections are saved
                    if (!triplet.prev) {
                        // First-scene case: no previous scene, drop any previousSceneAnalysis content
                        parsedAnalysis['previousSceneAnalysis'] = '';
                    }
                    if (!triplet.next) {
                        // Last-scene case: no next scene, drop any nextSceneAnalysis content
                        parsedAnalysis['nextSceneAnalysis'] = '';
                    }

                    const success = await updateSceneFile(vault, triplet.current, parsedAnalysis, plugin, aiResult.modelIdUsed);
                    if (success) {
                        processedCount++;
                    } else {
                        modal.addError(`Failed to update file for scene ${triplet.current.sceneNumber}: ${currentPath}`);
                    }
                } else {
                    modal.addError(`Failed to parse AI response for scene ${triplet.current.sceneNumber}: ${currentPath}`);
                }
            } else {
                modal.addError(`AI processing failed for scene ${triplet.current.sceneNumber}: ${currentPath}`);
            }
        }

        await plugin.saveSettings();
    } catch (error) {
        throw error;
    }
}

// Process flagged beats for a single chosen subplot name with modal support
export async function processBySubplotNameWithModal(
    plugin: RadialTimelinePlugin,
    vault: Vault,
    subplotName: string
): Promise<void> {
    // If there's already an active processing modal, just reopen it
    if (plugin.activeBeatsModal && plugin.activeBeatsModal.isProcessing) {
        plugin.activeBeatsModal.open();
        new Notice('Reopening active processing session...');
        return;
    }

    // Create a function to get scene count for the subplot
    const getSceneCount = async (): Promise<number> => {
        try {
            const allScenes = await getAllSceneData(plugin, vault);
            const filtered = allScenes.filter(scene => getSubplotNamesFromFM(scene.frontmatter).includes(subplotName));
            const validScenes = filtered.filter(scene => {
                const beatsUpdate = (scene.frontmatter?.beatsupdate || scene.frontmatter?.BeatsUpdate || scene.frontmatter?.['Beats Update']) as unknown;
                return hasProcessableContent(scene.frontmatter) && normalizeBooleanValue(beatsUpdate);
            });
            return validScenes.length;
        } catch (error) {
            return 0;
        }
    };

    // Create the modal with subplot-specific context
    const modal = new SceneAnalysisProcessingModal(
        plugin.app,
        plugin,
        getSceneCount,
        async () => {
            await processSubplotWithModal(plugin, vault, subplotName, modal);
        },
        undefined, // no resumeCommandId for subplot processing
        subplotName, // pass subplot name for resume functionality
        false // isEntireSubplot = false (flagged scenes only)
    );
    
    // Override the modal's onOpen to skip confirmation and start processing immediately
    const originalOnOpen = modal.onOpen.bind(modal);
    modal.onOpen = function() {
        // Show the modal first
        const { contentEl, titleEl } = this;
        titleEl.setText(`Processing subplot: ${subplotName}`);
        
        // Show progress view immediately (skip confirmation)
        this.showProgressView();
        
        // Start processing automatically
        this.isProcessing = true;
        this.abortController = new AbortController();
        
        // Notify plugin that processing has started
        plugin.activeBeatsModal = this;
        plugin.showBeatsStatusBar(0, 0);
        
        // Start the actual processing
        (async () => {
            try {
                await processSubplotWithModal(plugin, vault, subplotName, modal);
                
                // Show appropriate summary
                if (this.abortController && this.abortController.signal.aborted) {
                    this.showCompletionSummary('Processing aborted by user or rate limit');
                } else {
                    this.showCompletionSummary('Processing completed successfully!');
                }
            } catch (error) {
                if (!this.abortController.signal.aborted) {
                    this.addError(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
                    this.showCompletionSummary('Processing stopped due to error');
                } else {
                    this.showCompletionSummary('Processing aborted by user or rate limit');
                }
            } finally {
                this.isProcessing = false;
                this.abortController = null;
                plugin.activeBeatsModal = null;
                plugin.hideBeatsStatusBar();
            }
        })();
    };
    
    modal.open();
}

// <<< ADDED: Dummy data for testing >>>
const DUMMY_API_RESPONSE = `previousSceneAnalysis:
 - 33.2 Trisan Inner Turmoil - / Lacks clarity
 - Chae Ban Hesitation ? / Uncertain decision
 - Entiat Reflection ? / Needs clearer link: should explore motive
 - Chae Ban Plan + / Strengthens connection to currentSceneAnalysis choices
 - Meeting Entiat + / Sets up tension
currentSceneAnalysis:
 - 33.5 B / Scene will be stronger by making Entiat motivations clearer. Clarify: imminent threat
 - Entiat Adoption Reflections ? / Lacks tension link to events in previousSceneAnalysis
 - Chae Ban Escape News + / Advances plot
 - Entiat Internal Conflict + / Highlights dilemma: how to handle the situation from previousSceneAnalysis
 - Connection to nextSceneAnalysis + / Sets up the coming conflict
nextSceneAnalysis:
 - 34 Teco Routine Disruption - / Needs purpose
 - Entiat Unexpected Visit ? / Confusing motivation: clarify intention here
 - Sasha Defense and Defeat + / Builds on tension from currentSceneAnalysis
 - Teco Escape Decision + / Strong transition
 - Final Choice + / Resolves arc started in previousSceneAnalysis`;

// <<< ADDED: Exported Test Function >>>
export async function testYamlUpdateFormatting(
    plugin: RadialTimelinePlugin,
    vault: Vault
): Promise<void> {
    const dummyFilePath = "AITestDummyScene.md";
    const dummyBody = "This is the body text of the dummy scene.\nIt has multiple lines.";
    const dummyInitialFrontmatter = {
        Class: "Scene",
        Synopsis: "Dummy synopsis for testing YAML update.",
        Subplot: ["Test Arc"],
        When: "2024-01-01",
        Words: 10,
        'Beats Update': "Yes"
    };

    new Notice(`Starting YAML update test on ${dummyFilePath}...`);
    try {
        let file = vault.getAbstractFileByPath(dummyFilePath);
        if (!(file instanceof TFile)) {
            new Notice(`Creating dummy file: ${dummyFilePath}`);
            const initialContent = `---\n${stringifyYaml(dummyInitialFrontmatter)}---\n${dummyBody}`;
            await vault.create(dummyFilePath, initialContent);
            file = vault.getAbstractFileByPath(dummyFilePath);
        }

        
        if (!(file instanceof TFile)) {
            new Notice(`Error: Could not get TFile for ${dummyFilePath}`);
            return;
        }
        const currentContent = await vault.read(file);
        const fmInfo = getFrontMatterInfo(currentContent) as unknown as FMInfo;
        if (!fmInfo || !fmInfo.exists) {
            new Notice(`Error: Dummy file ${dummyFilePath} is missing frontmatter.`);
            return;
        }
        const fmText = fmInfo.frontmatter ?? '';
        const currentFrontmatter = fmText ? (parseYaml(fmText) || {}) : {};
        let currentBody = currentContent;
        const endOffset = fmInfo.position?.end?.offset as number | undefined;
        if (typeof endOffset === 'number' && endOffset >= 0 && endOffset <= currentContent.length) {
            currentBody = currentContent.slice(endOffset).trim();
        } else {
            // Fallback: regex removal if offsets unavailable
            currentBody = currentContent.replace(/^---[\s\S]*?\n---/, "").trim();
        }

        const dummySceneData: SceneData = {
            file: file,
            frontmatter: currentFrontmatter,
            sceneNumber: 999,
            body: currentBody
        };

        const parsedAnalysis = parseGptResult(DUMMY_API_RESPONSE, plugin);
        if (!parsedAnalysis) {
            new Notice('Error: Failed to parse dummy API response data.');
            return;
        }

        const success = await updateSceneFile(vault, dummySceneData, parsedAnalysis, plugin, null);

        if (success) {
            new Notice(`Successfully updated YAML in ${dummyFilePath}. Please check the file formatting.`);
        } else {
            new Notice(`Failed to update YAML in ${dummyFilePath}. Check console for errors.`);
        }

    } catch (error) {
        console.error("Error during YAML update test:", error);
        new Notice('Error during YAML update test. Check console.');
    }
}

// Create a ready-to-edit template Scene in the source path (or vault root)
export async function createTemplateScene(
    plugin: RadialTimelinePlugin,
    vault: Vault
): Promise<void> {
    try {
        const today = new Date();
        const isoDate = today.toISOString().slice(0, 10);

        // Determine target folder: settings.sourcePath if set, else root
        const folderPath = sanitizeSourcePath(plugin.settings.sourcePath);
        // Ensure folder exists when specified
        if (folderPath) {
            const f = vault.getAbstractFileByPath(folderPath);
            if (!f) {
                await vault.createFolder(folderPath);
            }
        }
        
        // Find an available filename by incrementing the number
        let sceneNumber = 1;
        let targetPath = buildInitialSceneFilename(folderPath, `${sceneNumber} Template Scene.md`);
        
        // Keep incrementing until we find a filename that doesn't exist
        while (vault.getAbstractFileByPath(targetPath)) {
            sceneNumber++;
            targetPath = buildInitialSceneFilename(folderPath, `${sceneNumber} Template Scene.md`);
        }

        const frontmatter = {
            Class: 'Scene',
            Act: 1,
            When: isoDate,
            Duration: '2 hours',
            Synopsis: 'Write a one-sentence summary of this scene.',
            Status: 'Todo',
            Subplot: ['Main Plot', 'Romance Arc'],
            Character: ['Protagonist', 'Mentor'],
            Place: '',
            POV: 'first',
            Due: isoDate,
            'Publish Stage': 'Zero',
            Revision: 0,
            'Pending Edits': '',
            Words: 0,
            'Beats Update': ''
        } as Record<string, unknown>;

        const body = '\nWrite your scene here. Fill in Character and Subplot fields as needed. Use array format for multiple items.';
        let yamlContent = stringifyYaml(frontmatter);
        yamlContent = yamlContent.replace(/^POV: (.+)$/m, 'POV: $1 # first | second | third | omni | objective | two | count | all');
        const content = `---\n${yamlContent}---\n${body}\n`;

        await vault.create(targetPath, content);
        new Notice(`Created template scene: ${targetPath}`);
        // Open the new file using openLinkText (prevents duplicate tabs)
        await openOrRevealFileByPath(plugin.app, targetPath, false);
    } catch (e) {
        console.error('[createTemplateScene] Failed:', e);
        new Notice('Failed to create template scene. Check console for details.');
    }
}

/**
 * Confirmation modal for purging beats
 */
class PurgeConfirmationModal extends Modal {
    private readonly message: string;
    private readonly details: string[];
    private readonly onConfirm: () => void;
    
    constructor(app: App, message: string, details: string[], onConfirm: () => void) {
        super(app);
        this.message = message;
        this.details = details;
        this.onConfirm = onConfirm;
    }
    
    onOpen(): void {
        const { contentEl, titleEl } = this;
        titleEl.setText('Confirm purge beats');
        
        // Warning message
        const messageEl = contentEl.createDiv({ cls: 'rt-purge-message' });
        messageEl.setText(this.message);
        
        // Details list
        const detailsEl = contentEl.createDiv({ cls: 'rt-purge-details' });
        detailsEl.createEl('strong', { text: 'This will permanently delete:' });
        const listEl = detailsEl.createEl('ul');
        this.details.forEach(detail => {
            listEl.createEl('li', { text: detail });
        });
        
        // Warning text
        const warningEl = contentEl.createDiv({ cls: 'rt-purge-warning' });
        warningEl.createEl('strong', { text: 'This cannot be undone. Continue?' });
        
        // Action buttons
        const buttonRow = contentEl.createDiv({ cls: 'rt-beats-actions' });
        
        new ButtonComponent(buttonRow)
            .setButtonText('Purge beats')
            .setWarning()
            .onClick(() => {
                this.close();
                this.onConfirm();
            });
        
        new ButtonComponent(buttonRow)
            .setButtonText('Cancel')
            .onClick(() => this.close());
    }
}

/**
 * Helper function to purge beats from a scene's frontmatter
 */
async function purgeScenesBeats(
    plugin: RadialTimelinePlugin,
    vault: Vault,
    scenes: SceneData[]
): Promise<number> {
    let purgedCount = 0;
    
    for (const scene of scenes) {
        try {
            await plugin.app.fileManager.processFrontMatter(scene.file, (fm) => {
                const fmObj = fm as Record<string, unknown>;
                
                // Remove beats fields
                const hadPreviousAnalysis = fmObj['previousSceneAnalysis'] !== undefined;
                const hadCurrentAnalysis = fmObj['currentSceneAnalysis'] !== undefined;
                const hadNextAnalysis = fmObj['nextSceneAnalysis'] !== undefined;
                const hadBeatsLastUpdated = fmObj['Beats Last Updated'] !== undefined;
                
                delete fmObj['previousSceneAnalysis'];
                delete fmObj['currentSceneAnalysis'];
                delete fmObj['nextSceneAnalysis'];
                delete fmObj['Beats Last Updated'];
                
                // Only count as purged if it actually had analysis
                if (hadPreviousAnalysis || hadCurrentAnalysis || hadNextAnalysis || hadBeatsLastUpdated) {
                    purgedCount++;
                }
            });
        } catch (error) {
            console.error(`[purgeScenesBeats] Error purging beats from ${scene.file.path}:`, error);
        }
    }
    
    return purgedCount;
}

/**
 * Purge all beats from all scenes in manuscript order
 */
export async function purgeBeatsByManuscriptOrder(
    plugin: RadialTimelinePlugin,
    vault: Vault
): Promise<void> {
    try {
        const allScenes = await getAllSceneData(plugin, vault);
        
        if (allScenes.length === 0) {
            new Notice('No scenes found in manuscript.');
            return;
        }
        
        // Show themed confirmation modal
        const modal = new PurgeConfirmationModal(
            plugin.app,
            `Purge ALL beats from ${allScenes.length} scene${allScenes.length !== 1 ? 's' : ''} in your manuscript?`,
            [
                'previousSceneAnalysis, currentSceneAnalysis, nextSceneAnalysis fields',
                'Beats Last Updated timestamps'
            ],
            async () => {
                const notice = new Notice('Purging beats from all scenes...', 0);
                const purgedCount = await purgeScenesBeats(plugin, vault, allScenes);
                
                notice.hide();
                await plugin.saveSettings();
                plugin.refreshTimelineIfNeeded(null);
                
                new Notice(`Purged beats from ${purgedCount} of ${allScenes.length} scene${allScenes.length !== 1 ? 's' : ''}.`);
            }
        );
        
        modal.open();
    } catch (error) {
        console.error('[purgeBeatsByManuscriptOrder] Error:', error);
        new Notice('Error purging beats. Check console for details.');
    }
}

/**
 * Purge beats from scenes in a specific subplot
 */
export async function purgeBeatsBySubplotName(
    plugin: RadialTimelinePlugin,
    vault: Vault,
    subplotName: string
): Promise<void> {
    try {
        const allScenes = await getAllSceneData(plugin, vault);
        
        // Filter scenes to only those containing the chosen subplot
        const filtered = allScenes.filter(scene => 
            getSubplotNamesFromFM(scene.frontmatter).includes(subplotName)
        );
        
        if (filtered.length === 0) {
            new Notice(`No scenes found for subplot "${subplotName}".`);
            return;
        }
        
        // Show themed confirmation modal
        const modal = new PurgeConfirmationModal(
            plugin.app,
            `Purge beats from ${filtered.length} scene${filtered.length !== 1 ? 's' : ''} in subplot "${subplotName}"?`,
            [
                'previousSceneAnalysis, currentSceneAnalysis, nextSceneAnalysis fields',
                'Beats Last Updated timestamps'
            ],
            async () => {
                const notice = new Notice(`Purging beats from "${subplotName}"...`, 0);
                const purgedCount = await purgeScenesBeats(plugin, vault, filtered);
                
                notice.hide();
                await plugin.saveSettings();
                plugin.refreshTimelineIfNeeded(null);
                
                new Notice(`Purged beats from ${purgedCount} of ${filtered.length} scene${filtered.length !== 1 ? 's' : ''} in subplot "${subplotName}".`);
            }
        );
        
        modal.open();
    } catch (error) {
        console.error(`[purgeBeatsBySubplotName] Error purging subplot "${subplotName}":`, error);
        new Notice(`Error purging beats from "${subplotName}". Check console for details.`);
    }
}
