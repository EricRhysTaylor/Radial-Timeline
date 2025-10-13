/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */
import { App, Modal, ButtonComponent, Notice } from 'obsidian';
import type RadialTimelinePlugin from '../main';

export type ProcessingMode = 'smart' | 'force-flagged' | 'force-all' | 'unprocessed';

export interface ProcessingOptions {
    mode: ProcessingMode;
    sceneCount: number;
    estimatedMinutes: number;
}

/**
 * Modal for confirming and showing progress of beats processing
 */
export class BeatsProcessingModal extends Modal {
    private readonly plugin: RadialTimelinePlugin;
    private readonly onConfirm: (mode: ProcessingMode) => Promise<void>;
    private readonly getSceneCount: (mode: ProcessingMode) => Promise<number>;
    
    private selectedMode: ProcessingMode = 'smart';
    public isProcessing: boolean = false;
    private abortController: AbortController | null = null;
    
    // Progress tracking
    private progressBarEl?: HTMLElement;
    private progressTextEl?: HTMLElement;
    private statusTextEl?: HTMLElement;
    private errorListEl?: HTMLElement;
    private abortButtonEl?: ButtonComponent;
    private actionButtonContainer?: HTMLElement;
    
    // Statistics
    private processedCount: number = 0;
    private totalCount: number = 0;
    private errorCount: number = 0;
    private warningCount: number = 0;
    
    constructor(
        app: App,
        plugin: RadialTimelinePlugin,
        getSceneCount: (mode: ProcessingMode) => Promise<number>,
        onConfirm: (mode: ProcessingMode) => Promise<void>
    ) {
        super(app);
        this.plugin = plugin;
        this.getSceneCount = getSceneCount;
        this.onConfirm = onConfirm;
    }

    onOpen(): void {
        const { contentEl, titleEl } = this;
        titleEl.setText('AI Beats Analysis');
        
        // If we're already processing (reopening), show progress view
        if (this.isProcessing) {
            this.showProgressView();
        } else {
            this.showConfirmationView();
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
        const { contentEl } = this;
        contentEl.empty();
        contentEl.classList.add('rt-beats-modal');

        // Info section
        const infoEl = contentEl.createDiv({ cls: 'rt-beats-info' });
        infoEl.setText('Select processing mode for AI beats analysis. This will analyze scenes and update their beat metadata.');

        // Mode selection
        const modesSection = contentEl.createDiv({ cls: 'rt-beats-modes' });
        
        // Mode 1: Smart Update
        const mode1 = this.createModeOption(
            modesSection,
            'smart',
            'Smart Update (Recommended)',
            'Only processes scenes with BeatsUpdate: Yes that haven\'t been processed yet. Respects cache. No Status validation needed.',
            true
        );
        
        // Mode 2: Force Flagged
        const mode2 = this.createModeOption(
            modesSection,
            'force-flagged',
            'Force Flagged Scenes',
            'Reprocesses all scenes with BeatsUpdate: Yes, ignoring cache. Use when changing AI templates. No Status validation needed.',
            false
        );
        
        // Mode 3: Process Unprocessed
        const mode3 = this.createModeOption(
            modesSection,
            'unprocessed',
            'Process Unprocessed Scenes',
            'Processes scenes with Status: Complete or Working that don\'t have beats yet. Perfect for resuming after crashes or rate limits. Ignores BeatsUpdate flag and cache.',
            false
        );
        
        // Mode 4: Force All
        const mode4 = this.createModeOption(
            modesSection,
            'force-all',
            'Force ALL Scenes',
            'Processes ALL scenes with Status: Complete or Working, ignoring flags and cache. WARNING: This may be expensive and time-consuming!',
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
        
        // Initial count
        updateCount();

        // Update count when mode changes
        [mode1, mode2, mode3, mode4].forEach(radio => {
            radio.addEventListener('change', () => updateCount());
        });

        // Action buttons
        const buttonRow = contentEl.createDiv({ cls: 'rt-beats-actions' });
        
        new ButtonComponent(buttonRow)
            .setButtonText('Start Processing')
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
                        const confirmed = window.confirm(
                            `You are about to process ${count} scenes. This may take ${Math.ceil(count * 0.1)} minutes and incur API costs. Continue?`
                        );
                        if (!confirmed) return;
                    }
                    
                    await this.startProcessing();
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
            
            // Processing completed successfully
            if (!this.abortController.signal.aborted) {
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
            this.plugin.activeBeatsModal = null;
            this.plugin.hideBeatsStatusBar();
        }
    }

    private showProgressView(): void {
        const { contentEl, titleEl } = this;
        contentEl.empty();
        titleEl.setText('Processing AI Beats Analysis...');

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
        
        // Error list (hidden by default)
        this.errorListEl = contentEl.createDiv({ cls: 'rt-beats-error-list rt-hidden' });
        
        // Abort button (store container reference for later replacement with Close button)
        this.actionButtonContainer = contentEl.createDiv({ cls: 'rt-beats-actions' });
        this.abortButtonEl = new ButtonComponent(this.actionButtonContainer)
            .setButtonText('Abort Processing')
            .setWarning()
            .onClick(() => this.abortProcessing());
    }

    private abortProcessing(): void {
        if (!this.abortController) return;
        
        const confirmed = window.confirm('Are you sure you want to abort processing? Progress will be saved up to the current scene.');
        if (!confirmed) return;
        
        this.abortController.abort();
        this.statusTextEl?.setText('Aborting... Please wait.');
        this.abortButtonEl?.setDisabled(true);
        
        new Notice('Processing aborted by user');
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
        titleEl.setText('Processing Complete');
        
        // Keep progress bar at 100% and stop animation to save CPU
        if (this.progressBarEl) {
            this.progressBarEl.style.setProperty('--progress-width', '100%');
            this.progressBarEl.addClass('rt-progress-complete');  // Stops infinite animation
        }
        
        // Update status message
        if (this.statusTextEl) {
            this.statusTextEl.setText(statusMessage);
        }
        
        // Create summary section
        const summaryContainer = contentEl.createDiv({ cls: 'rt-beats-summary' });
        summaryContainer.createEl('h3', { text: 'Summary', cls: 'rt-beats-summary-title' });
        
        const summaryStats = summaryContainer.createDiv({ cls: 'rt-beats-summary-stats' });
        
        // Success count
        const successCount = Math.max(0, this.processedCount - this.errorCount);
        summaryStats.createDiv({ 
            cls: 'rt-beats-summary-row',
            text: `Successfully processed: ${successCount} scene${successCount !== 1 ? 's' : ''}`
        });
        
        // Error count
        if (this.errorCount > 0) {
            summaryStats.createDiv({ 
                cls: 'rt-beats-summary-row rt-beats-summary-error',
                text: `Errors: ${this.errorCount}`
            });
        }
        
        // Warning count (informational, doesn't affect success count)
        if (this.warningCount > 0) {
            summaryStats.createDiv({ 
                cls: 'rt-beats-summary-row rt-beats-summary-warning',
                text: `Warnings: ${this.warningCount} (scenes skipped due to validation)`
            });
        }
        
        // Total attempted
        summaryStats.createDiv({ 
            cls: 'rt-beats-summary-row',
            text: `Total attempted: ${this.processedCount} of ${this.totalCount}`
        });
        
        // Add tip about resuming
        const remainingScenes = this.totalCount - this.processedCount;
        if (remainingScenes > 0 || this.errorCount > 0) {
            const tipEl = summaryContainer.createDiv({ cls: 'rt-beats-summary-tip' });
            tipEl.createEl('strong', { text: 'Tip: ' });
            tipEl.appendText('Run the command again in "Smart" mode to process remaining or failed scenes. Already-processed scenes will be skipped automatically.');
        }
        
        // Replace abort button with action buttons
        if (this.actionButtonContainer) {
            this.actionButtonContainer.empty();
            
            // Show Resume button if there's work remaining
            if (remainingScenes > 0 || this.errorCount > 0) {
                new ButtonComponent(this.actionButtonContainer)
                    .setButtonText(`Resume (${remainingScenes} remaining)`)
                    .setCta()
                    .onClick(() => {
                        this.close();
                        // Trigger the same command again - smart mode will skip already processed scenes
                        window.setTimeout(() => {
                            // @ts-ignore - accessing app commands
                            this.app.commands.executeCommandById('radial-timeline:process-beats-manuscript-order');
                        }, 100);
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
}

export default BeatsProcessingModal;

