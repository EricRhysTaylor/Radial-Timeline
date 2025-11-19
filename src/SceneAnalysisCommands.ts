/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */
import RadialTimelinePlugin from './main';
import { Vault, Notice } from 'obsidian';
import { SceneAnalysisProcessingModal, type ProcessingMode } from './modals/SceneAnalysisProcessingModal';
import { updateSceneAnalysis } from './sceneAnalysis/FileUpdater';
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
import {
    processWithModal,
    processSubplotWithModal,
    processEntireSubplotWithModalInternal,
    getActiveContextPrompt
} from './sceneAnalysis/Processor';

export { calculateSceneCount, calculateFlaggedCount, getDistinctSubplotNames } from './sceneAnalysis/data';
export { processBySubplotOrder } from './sceneAnalysis/Processor';
export {
    testYamlUpdateFormatting,
    createTemplateScene,
    purgeBeatsByManuscriptOrder,
    purgeBeatsBySubplotName
} from './sceneAnalysis/Maintenance';

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
            await processEntireSubplotWithModalInternal(plugin, vault, subplotName, modal);
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
                await processEntireSubplotWithModalInternal(plugin, vault, subplotName, modal);
                
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
