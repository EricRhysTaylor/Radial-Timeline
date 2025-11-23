/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 * 
 * AI Scene Analysis Processing Modal
 * This processes scenes for LLM analysis, not story beats (timeline slices)
 */
import { App, Modal, ButtonComponent, Notice } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { DEFAULT_GEMINI_MODEL_ID } from '../constants/aiDefaults';

export type ProcessingMode = 'flagged' | 'unprocessed' | 'force-all';

/**
 * Simple confirmation modal that matches Obsidian theme
 */
class ConfirmationModal extends Modal {
    private readonly message: string;
    private readonly onConfirm: () => void;
    
    constructor(app: App, message: string, onConfirm: () => void) {
        super(app);
        this.message = message;
        this.onConfirm = onConfirm;
    }
    
    onOpen(): void {
        const { contentEl, titleEl } = this;
        titleEl.setText('Confirm action');
        
        const messageEl = contentEl.createDiv({ cls: 'rt-confirmation-message' });
        messageEl.setText(this.message);
        
        const buttonRow = contentEl.createDiv({ cls: 'rt-beats-actions' });
        
        new ButtonComponent(buttonRow)
            .setButtonText('Continue')
            .setCta()
            .onClick(() => {
                this.close();
                this.onConfirm();
            });
        
        new ButtonComponent(buttonRow)
            .setButtonText('Cancel')
            .onClick(() => this.close());
    }
}

export interface ProcessingOptions {
    mode: ProcessingMode;
    sceneCount: number;
    estimatedMinutes: number;
}

/**
 * Modal for confirming and showing progress of scene analysis processing
 */
export class SceneAnalysisProcessingModal extends Modal {
    private readonly plugin: RadialTimelinePlugin;
    private readonly onConfirm: (mode: ProcessingMode) => Promise<void>;
    private readonly getSceneCount: (mode: ProcessingMode) => Promise<number>;
    private readonly resumeCommandId?: string; // Optional command ID to trigger on resume
    private readonly subplotName?: string; // Optional subplot name for resume (subplot processing only)
    private readonly isEntireSubplot?: boolean; // Track if this is "entire subplot" vs "flagged scenes"
    
    private selectedMode: ProcessingMode = 'flagged';
    public isProcessing: boolean = false;
    private abortController: AbortController | null = null;
    
    // Progress tracking
    private progressBarEl?: HTMLElement;
    private progressTextEl?: HTMLElement;
    private statusTextEl?: HTMLElement;
    private tripletTextEl?: HTMLElement;
    private errorListEl?: HTMLElement;
    private abortButtonEl?: ButtonComponent;
    private actionButtonContainer?: HTMLElement;
    
    // Statistics
    private processedCount: number = 0;
    private totalCount: number = 0;
    private errorCount: number = 0;
    private warningCount: number = 0;
    private pendingRafId: number | null = null;
    
    constructor(
        app: App,
        plugin: RadialTimelinePlugin,
        getSceneCount: (mode: ProcessingMode) => Promise<number>,
        onConfirm: (mode: ProcessingMode) => Promise<void>,
        resumeCommandId?: string,
        subplotName?: string,
        isEntireSubplot?: boolean
    ) {
        super(app);
        this.plugin = plugin;
        this.getSceneCount = getSceneCount;
        this.onConfirm = onConfirm;
        this.resumeCommandId = resumeCommandId;
        this.subplotName = subplotName;
        this.isEntireSubplot = isEntireSubplot;
    }

    onOpen(): void {
        const { contentEl, titleEl } = this;
        titleEl.setText('Scene Pulse Analysis');
        
        // If we're already processing (reopening), show progress view
        if (this.isProcessing) {
            this.showProgressView();
        } else {
            this.showConfirmationView();
        }
    }

    onClose(): void {
        if (this.pendingRafId !== null) {
            cancelAnimationFrame(this.pendingRafId);
            this.pendingRafId = null;
        }
    }

    /**
     * Override close() to allow minimizing while processing continues
     */
    close(): void {
        if (this.isProcessing) {
            new Notice('Processing continues in background. Use command palette to reopen progress window.');
        }
        super.close();
    }

    private showConfirmationView(): void {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        
        // Set modal width using Obsidian's approach
        if (modalEl) {
            modalEl.style.width = '700px'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxWidth = '90vw'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
        }
        
        contentEl.classList.add('rt-beats-modal');

        // Info section with active AI provider
        const infoEl = contentEl.createDiv({ cls: 'rt-beats-info' });
        infoEl.setText('Select how many scenes to process. This will analyze scenes in manuscript order and update their pulse metadata.');

        // Mode selection
        const modesSection = contentEl.createDiv({ cls: 'rt-beats-modes' });
        
        // Mode 1: Process Flagged Scenes (Recommended)
        const mode1 = this.createModeOption(
            modesSection,
            'flagged',
            'Process flagged scenes (Recommended)',
            'Processes scenes with Pulse Update: Yes (legacy Review/Beats Update) and Status: Working or Complete. Use when you\'ve revised scenes and want to update their pulse.',
            true
        );
        
        // Mode 2: Process Unprocessed
        const mode2 = this.createModeOption(
            modesSection,
            'unprocessed',
            'Process unprocessed scenes',
            'Processes scenes with Status: Complete or Working that don\'t have pulse yet. Perfect for resuming after interruptions. Ignores Pulse Update flag.',
            false
        );
        
        // Mode 3: Force All
        const mode3 = this.createModeOption(
            modesSection,
            'force-all',
            'Reprocess ALL scenes',
            'Reprocesses ALL scenes with Status: Complete or Working, even if they already have pulse. Use when changing AI templates or doing complete reanalysis. WARNING: May be expensive!',
            false
        );

        // Scene count display
        const countSection = contentEl.createDiv({ cls: 'rt-beats-count' });
        const countEl = countSection.createDiv({ cls: 'rt-beats-count-number' });
        
        // Show loading state initially
        countEl.setText('Calculating...');
        
        const updateCount = async () => {
            countEl.empty();
            countEl.setText('Calculating...');
            
            try {
                const count = await this.getSceneCount(this.selectedMode);
                // ~6 seconds per scene (1.5s delay + 3-5s API call) = 0.1 minutes
                const estimatedMinutes = Math.ceil(count * 0.1);
                countEl.empty();
                
                const countText = countEl.createDiv({ cls: 'rt-beats-count-text' });
                countText.createSpan({ text: 'Scenes to process: ', cls: 'rt-beats-label' });
                countText.createSpan({ text: `${count}`, cls: 'rt-beats-number' });
                
                const timeText = countEl.createDiv({ cls: 'rt-beats-time-text' });
                timeText.createSpan({ text: 'Estimated time: ', cls: 'rt-beats-label' });
                timeText.createSpan({ text: `~${estimatedMinutes} minutes`, cls: 'rt-beats-number' });
                
                if (count > 50) {
                    const warning = countEl.createDiv({ cls: 'rt-beats-warning' });
                    warning.setText('Large batch processing may take significant time and API costs.');
                }
            } catch (error) {
                countEl.empty();
                countEl.setText(`Error calculating scene count: ${error instanceof Error ? error.message : String(error)}`);
            }
        };
        
        // Initial count (defer to next frame so modal paints immediately)
        const rafId = requestAnimationFrame(() => {
            updateCount();
        });
        this.pendingRafId = rafId;

        // Update count when mode changes
        // Modal classes don't have registerDomEvent, use addEventListener
        [mode1, mode2, mode3].forEach(radio => {
            radio.addEventListener('change', () => updateCount());
        });

        // Action buttons
        const buttonRow = contentEl.createDiv({ cls: 'rt-beats-actions' });
        
        new ButtonComponent(buttonRow)
            .setButtonText('Start processing')
            .setCta()
            .onClick(async () => {
                try {
                    const count = await this.getSceneCount(this.selectedMode);
                    if (count === 0) {
                        new Notice('No scenes to process with the selected mode.');
                        return;
                    }
                    
                    // Extra confirmation for large batches or aggressive modes
                    if (count > 50 || this.selectedMode === 'force-all' || this.selectedMode === 'unprocessed') {
                        const confirmModal = new ConfirmationModal(
                            this.app,
                            `You are about to process ${count} scenes. This may take ${Math.ceil(count * 0.1)} minutes and incur API costs. Continue?`,
                            async () => {
                                await this.startProcessing();
                            }
                        );
                        confirmModal.open();
                        return;
                    }
                    
                    await this.startProcessing();
                } catch (error) {
                    new Notice(`Error: ${error instanceof Error ? error.message : String(error)}`);
                }
            });
        
        new ButtonComponent(buttonRow)
            .setButtonText('Purge all pulse')
            .setWarning()
            .onClick(async () => {
                try {
                    // Dynamic import to avoid circular dependency
                    const { purgeBeatsByManuscriptOrder } = await import('../SceneAnalysisCommands');
                    
                    // Close this modal before showing purge confirmation
                    this.close();
                    
                    // Execute purge (it has its own confirmation dialog)
                    await purgeBeatsByManuscriptOrder(this.plugin, this.plugin.app.vault);
                } catch (error) {
                    new Notice(`Error: ${error instanceof Error ? error.message : String(error)}`);
                }
            });
        
        new ButtonComponent(buttonRow)
            .setButtonText('Cancel')
            .onClick(() => this.close());
    }

    private createModeOption(
        container: HTMLElement,
        mode: ProcessingMode,
        title: string,
        description: string,
        isDefault: boolean
    ): HTMLInputElement {
        const optionEl = container.createDiv({ cls: 'rt-beats-mode-option' });
        
        const radioEl = optionEl.createEl('input', { 
            type: 'radio',
            attr: { name: 'processing-mode', value: mode }
        });
        radioEl.checked = isDefault;
        if (isDefault) this.selectedMode = mode;
        
        // Modal classes don't have registerDomEvent, use addEventListener
        radioEl.addEventListener('change', () => {
            if (radioEl.checked) {
                this.selectedMode = mode;
            }
        });
        
        const labelContainer = optionEl.createDiv({ cls: 'rt-beats-mode-label' });
        const titleEl = labelContainer.createDiv({ cls: 'rt-beats-mode-title' });
        titleEl.setText(title);
        
        const descEl = labelContainer.createDiv({ cls: 'rt-beats-mode-desc' });
        descEl.setText(description);
        
        // Make the entire option clickable
        optionEl.addEventListener('click', () => {
            radioEl.checked = true;
            this.selectedMode = mode;
            // Trigger change event to update scene count
            radioEl.dispatchEvent(new Event('change'));
        });
        
        return radioEl;
    }

    private async startProcessing(): Promise<void> {
        this.isProcessing = true;
        this.abortController = new AbortController();
        
        // Notify plugin that processing has started
        this.plugin.activeBeatsModal = this;
        this.plugin.showBeatsStatusBar(0, 0);
        
        // Switch to progress view
        this.showProgressView();
        
        try {
            await this.onConfirm(this.selectedMode);
            
            // Show appropriate summary even if the last/only scene finished after an abort request
            if (this.abortController && this.abortController.signal.aborted) {
                this.showCompletionSummary('Processing aborted');
            } else {
                this.showCompletionSummary('Processing completed successfully!');
            }
        } catch (error) {
            if (!this.abortController.signal.aborted) {
                this.addError(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
                this.showCompletionSummary('Processing stopped due to error');
            } else {
                this.showCompletionSummary('Processing aborted');
            }
        } finally {
            this.isProcessing = false;
            this.abortController = null;
            this.plugin.activeBeatsModal = null;
            this.plugin.hideBeatsStatusBar();
        }
    }

    private showProgressView(): void {
        const { contentEl, titleEl } = this;
        contentEl.empty();
        titleEl.setText('Processing scene pulse analysis...');
        const modelName = this.getActiveModelDisplayName();

        const modelInfoEl = contentEl.createDiv({ cls: 'rt-beats-model-info' });
        modelInfoEl.setText(`Model: ${modelName}`);

        // Progress bar container
        const progressContainer = contentEl.createDiv({ cls: 'rt-beats-progress-container' });
        
        // Progress bar background
        const progressBg = progressContainer.createDiv({ cls: 'rt-beats-progress-bg' });
        this.progressBarEl = progressBg.createDiv({ cls: 'rt-beats-progress-bar' });
        // SAFE: inline style used for CSS custom property (--progress-width) to enable smooth progress animation
        this.progressBarEl.style.setProperty('--progress-width', '0%');
        
        // Progress text (e.g., "5 / 20 scenes")
        this.progressTextEl = progressContainer.createDiv({ cls: 'rt-beats-progress-text' });
        this.progressTextEl.setText('Starting...');
        
        // Current status (e.g., "Processing scene 15...")
        this.statusTextEl = contentEl.createDiv({ cls: 'rt-beats-status-text' });
        this.statusTextEl.setText('Initializing...');

        // Triplet info (prev/current/next) for the current request
        this.tripletTextEl = contentEl.createDiv({ cls: 'rt-beats-triplet-text' });
        this.tripletTextEl.setText('Triplet: prev=N/A, current=N/A, next=N/A');
        
        // Error list (hidden by default)
        this.errorListEl = contentEl.createDiv({ cls: 'rt-beats-error-list rt-hidden' });
        
        // Abort button (store container reference for later replacement with Close button)
        this.actionButtonContainer = contentEl.createDiv({ cls: 'rt-beats-actions' });
        this.abortButtonEl = new ButtonComponent(this.actionButtonContainer)
            .setButtonText('Abort processing')
            .setWarning()
            .onClick(() => this.abortProcessing());
    }

    private abortProcessing(): void {
        if (!this.abortController) return;
        
        const confirmModal = new ConfirmationModal(
            this.app,
            'Are you sure you want to abort processing? Progress will be saved up to the current scene.',
            () => {
                this.abortController?.abort();
                this.statusTextEl?.setText('Aborting... Please wait.');
                this.abortButtonEl?.setDisabled(true);
                new Notice('Processing aborted by user');
            }
        );
        confirmModal.open();
    }

    public updateProgress(current: number, total: number, sceneName: string): void {
        if (!this.isProcessing) return;
        
        // Track statistics
        this.processedCount = current;
        this.totalCount = total;
        
        const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
        
        // Update status bar
        this.plugin.showBeatsStatusBar(current, total);
        
        if (this.progressBarEl) {
            // SAFE: inline style used for CSS custom property (--progress-width) to enable smooth progress animation
            this.progressBarEl.style.setProperty('--progress-width', `${percentage}%`);
        }
        
        if (this.progressTextEl) {
            this.progressTextEl.setText(`${current} / ${total} scenes (${percentage}%)`);
        }
        
        if (this.statusTextEl) {
            this.statusTextEl.setText(`Processing: ${sceneName}`);
        }
    }

    public addError(message: string): void {
        if (!this.errorListEl) return;
        
        // Track error count
        this.errorCount++;
        
        // Show error list if it was hidden
        if (this.errorListEl.hasClass('rt-hidden')) {
            this.errorListEl.removeClass('rt-hidden');
            const header = this.errorListEl.createDiv({ cls: 'rt-beats-error-header' });
            header.setText('Errors encountered:');
        }
        
        const errorItem = this.errorListEl.createDiv({ cls: 'rt-beats-error-item' });
        errorItem.setText(message);
    }
    
    public setTripletInfo(prevNum: string, currentNum: string, nextNum: string): void {
        if (!this.tripletTextEl) return;
        this.tripletTextEl.setText(`Triplet: prev=${prevNum || 'N/A'}, current=${currentNum || 'N/A'}, next=${nextNum || 'N/A'}`);
    }
    
    public addWarning(message: string): void {
        if (!this.errorListEl) return;
        
        // Track warning count (doesn't affect success count)
        this.warningCount++;
        
        // Show error list if it was hidden
        if (this.errorListEl.hasClass('rt-hidden')) {
            this.errorListEl.removeClass('rt-hidden');
            const header = this.errorListEl.createDiv({ cls: 'rt-beats-error-header' });
            header.setText('Issues encountered:');
        }
        
        const warningItem = this.errorListEl.createDiv({ cls: 'rt-beats-error-item rt-beats-warning-item' });
        warningItem.setText(message);
    }

    private showCompletionSummary(statusMessage: string): void {
        const { contentEl, titleEl } = this;
        
        // Update title
        titleEl.setText('Processing complete');
        
        // Keep progress bar at 100% and stop animation to save CPU
        if (this.progressBarEl) {
            this.progressBarEl.style.setProperty('--progress-width', '100%');
            this.progressBarEl.addClass('rt-progress-complete');  // Stops infinite animation
        }
        
        // Determine overall success/failure state
        const successCount = Math.max(0, this.processedCount - this.errorCount);
        const hasErrors = this.errorCount > 0;
        const hasWarnings = this.warningCount > 0;
        const isTotalFailure = successCount === 0 && hasErrors;

        // 1. Clear previous content areas to avoid duplication
        if (this.progressTextEl) this.progressTextEl.empty();
        if (this.statusTextEl) this.statusTextEl.empty();
        if (this.tripletTextEl) this.tripletTextEl.remove(); // Remove triplet info (no longer relevant)
        
        // Hide "live" error list if it exists, we will show a consolidated summary instead
        if (this.errorListEl) {
            this.errorListEl.addClass('rt-hidden');
            this.errorListEl.empty(); // Clear it so we don't double up content
        }

        // 2. Construct summary text
        let summaryText = '';
        if (isTotalFailure) {
            summaryText = `Processing failed: ${this.errorCount} error${this.errorCount !== 1 ? 's' : ''}.`;
        } else {
            summaryText = `${successCount} scene${successCount !== 1 ? 's' : ''} processed successfully`;
            if (hasErrors) summaryText += `, ${this.errorCount} error${this.errorCount !== 1 ? 's' : ''}`;
            if (hasWarnings) summaryText += `, ${this.warningCount} skipped`;
        }
        
        if (this.statusTextEl) {
            this.statusTextEl.setText(summaryText);
            if (isTotalFailure) this.statusTextEl.addClass('rt-error-text');
        }

        // Update the completion message element (or create it if missing)
        let completionMsgEl = contentEl.querySelector('.rt-beats-completion-message') as HTMLElement;
        if (!completionMsgEl) {
            completionMsgEl = contentEl.createDiv({ cls: 'rt-beats-completion-message' });
        }
        
        // Use a more accurate message based on outcome
        if (isTotalFailure) {
            completionMsgEl.setText('Processing failed.');
            completionMsgEl.addClass('rt-error-text');
        } else if (hasErrors) {
            completionMsgEl.setText('Processing complete (with errors).');
            completionMsgEl.addClass('rt-warning-text');
        } else {
            completionMsgEl.setText('Processing completed successfully!');
            completionMsgEl.removeClass('rt-error-text', 'rt-warning-text');
        }
        
        // 3. Create consolidated details section
        const hasIssues = hasErrors || hasWarnings;
        const remainingScenes = this.totalCount - this.processedCount;
        
        // Remove any existing summary container to prevent duplicates if called multiple times
        const existingSummary = contentEl.querySelector('.rt-beats-summary');
        if (existingSummary) existingSummary.remove();

        if (hasIssues) {
            const summaryContainer = contentEl.createDiv({ cls: 'rt-beats-summary' });
            summaryContainer.createEl('h3', { text: 'Details', cls: 'rt-beats-summary-title' });
            
            const summaryStats = summaryContainer.createDiv({ cls: 'rt-beats-summary-stats' });
            
            // Error count
            if (hasErrors) {
                summaryStats.createDiv({ 
                    cls: 'rt-beats-summary-row rt-beats-summary-error',
                    text: `Errors: ${this.errorCount}`
                });
            }
            
            // Warning count
            if (hasWarnings) {
                summaryStats.createDiv({ 
                    cls: 'rt-beats-summary-row rt-beats-summary-warning',
                    text: `Warnings: ${this.warningCount} (scenes skipped due to validation)`
                });
            }
        }
        
        // Add tip about resuming (top-level, not nested)
        // Remove existing tips first
        contentEl.querySelectorAll('.rt-beats-summary-tip').forEach(el => el.remove());

        if (remainingScenes > 0) {
            const tipEl = contentEl.createDiv({ cls: 'rt-beats-summary-tip' });
            tipEl.createEl('strong', { text: 'Tip: ' });
            if (this.resumeCommandId || this.subplotName) {
                tipEl.appendText('Click Resume to complete all scenes not updated today.');
            } else {
                tipEl.appendText('Run the command again in "Unprocessed" mode to retry.');
            }
        }
        
        // Add note about AI logs
        if (this.plugin.settings.logApiInteractions) {
            const logNoteEl = contentEl.createDiv({ cls: 'rt-beats-summary-tip' });
            logNoteEl.createEl('strong', { text: 'Note: ' });
            logNoteEl.appendText('Detailed AI interaction logs have been saved to the AI folder for review.');
        }
        
        // Replace abort button with action buttons
        if (this.actionButtonContainer) {
            this.actionButtonContainer.empty();
            
            // Show Resume button only if there are actually scenes remaining
            if (remainingScenes > 0 && (this.resumeCommandId || this.subplotName)) {
                new ButtonComponent(this.actionButtonContainer)
                    .setButtonText(`Resume (${remainingScenes} remaining)`)
                    .setCta()
                    .onClick(async () => {
                        this.close();
                        
                        // For subplot processing, call the function directly with the stored subplot name
                        if (this.subplotName) {
                            const subplotName = this.subplotName; // Capture in closure
                            const isEntireSubplot = this.isEntireSubplot; // Capture in closure
                            window.setTimeout(async () => {
                                const { processBySubplotNameWithModal, processEntireSubplotWithModal } = await import('../SceneAnalysisCommands');
                                // Use the appropriate function based on whether this is entire subplot or flagged
                                if (isEntireSubplot) {
                                    // Resume entire subplot: pass isResuming=true
                                    await processEntireSubplotWithModal(this.plugin, this.plugin.app.vault, subplotName, true);
                                } else {
                                    // Flagged subplot processing: flag tracking handles resume
                                    await processBySubplotNameWithModal(this.plugin, this.plugin.app.vault, subplotName);
                                }
                            }, 100);
                        }
                        // For manuscript processing, set resume flag and trigger the command
                        else if (this.resumeCommandId) {
                            // Set the resume flag in settings
                            this.plugin.settings._isResuming = true;
                            await this.plugin.saveSettings();
                            
                            window.setTimeout(() => {
                                // @ts-ignore - accessing app commands
                                this.app.commands.executeCommandById(this.resumeCommandId);
                            }, 100);
                        }
                    });
            }
            
            new ButtonComponent(this.actionButtonContainer)
                .setButtonText('Close')
                .onClick(() => this.close());
        }
    }

    public isAborted(): boolean {
        return this.abortController?.signal.aborted ?? false;
    }

    public getAbortSignal(): AbortSignal | null {
        return this.abortController?.signal ?? null;
    }
    
    /**
     * Programmatically abort processing (e.g., due to rate limiting)
     * Unlike abortProcessing(), this doesn't show a confirmation dialog
     */
    public abort(): void {
        if (!this.abortController) return;
        
        this.abortController.abort();
        this.statusTextEl?.setText('Processing stopped due to error');
        this.abortButtonEl?.setDisabled(true);
    }

    private getActiveModelDisplayName(): string {
        const provider = this.plugin.settings.defaultAiProvider || 'openai';
        
        if (provider === 'anthropic') {
            return this.plugin.settings.anthropicModelId || 'claude-sonnet-4-5-20250929';
        }
        
        if (provider === 'gemini') {
            return this.plugin.settings.geminiModelId || DEFAULT_GEMINI_MODEL_ID;
        }
        
        return this.plugin.settings.openaiModelId || 'gpt-4o';
    }
}

export default SceneAnalysisProcessingModal;
