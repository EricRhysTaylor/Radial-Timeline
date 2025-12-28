/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 * 
 * Gossamer AI Processing Modal
 * Tracks progress of Gemini momentum analysis with manuscript details and status updates
 */
import { App, Modal, ButtonComponent, Notice } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { getModelDisplayName } from '../utils/modelResolver';

export interface ManuscriptInfo {
    totalScenes: number;
    totalWords: number;
    estimatedTokens: number;
    beatCount: number;
    beatSystem: string; // Beat system name (e.g., "Save The Cat", "Custom")
    hasIterativeContext?: boolean; // True if any beats have previous justifications for comparison
}

export interface AnalysisOptions {
    requestScores: boolean;
}

/**
 * Modal for confirming and showing progress of Gossamer AI momentum analysis
 */
export class GossamerProcessingModal extends Modal {
    private readonly plugin: RadialTimelinePlugin;
    private readonly onConfirm: (options: AnalysisOptions) => Promise<void>;

    public isProcessing: boolean = false;
    public analysisOptions: AnalysisOptions = {
        requestScores: true
    };

    // UI elements
    private confirmationView?: HTMLElement;
    private processingView?: HTMLElement;
    private manuscriptInfoEl?: HTMLElement;
    private statusTextEl?: HTMLElement;
    private apiStatusEl?: HTMLElement;
    private progressBarEl?: HTMLElement;
    private errorListEl?: HTMLElement;
    private closeButtonEl?: ButtonComponent;

    // Processing state
    private manuscriptInfo?: ManuscriptInfo;
    private currentStatus: string = 'Initializing...';
    private apiCallStartTime?: number;
    private timerInterval?: number;

    constructor(
        app: App,
        plugin: RadialTimelinePlugin,
        onConfirm: (options: AnalysisOptions) => Promise<void>
    ) {
        super(app);
        this.plugin = plugin;
        this.onConfirm = onConfirm;
    }

    onOpen(): void {
        const { contentEl, titleEl, modalEl } = this;
        titleEl.setText('');

        if (modalEl) {
            modalEl.classList.add('rt-modal-shell');
            modalEl.style.width = '800px'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxWidth = '90vw'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
        }

        contentEl.addClass('rt-modal-container', 'rt-gossamer-processing-modal');

        // Show confirmation view first
        this.showConfirmationView();
    }

    private renderProcessingHero(parent: HTMLElement, subtitle: string, modelName?: string): void {
        const hero = parent.createDiv({ cls: 'rt-modal-header' });
        
        // Build badge text
        const badgeText = modelName 
            ? `AI momentum analysis · ${modelName}`
            : 'AI momentum analysis';
            
        hero.createSpan({ text: badgeText, cls: 'rt-modal-badge' });
        hero.createDiv({ text: 'Gossamer momentum analysis', cls: 'rt-modal-title' });
        hero.createDiv({ text: subtitle, cls: 'rt-modal-subtitle' });
    }

    onClose(): void {
        // Clear timer if active
        if (this.timerInterval) {
            window.clearInterval(this.timerInterval);
            this.timerInterval = undefined;
        }
        // Allow closing while processing - it continues in background
    }

    /**
     * Override close() to allow minimizing while processing continues
     */
    close(): void {
        if (this.isProcessing) {
            new Notice('Analysis continues in background.');
        }
        super.close();
    }

    private getActiveModelDisplayName(): string {
        const modelId = this.plugin.settings.geminiModelId || 'gemini-pro-latest';
        return getModelDisplayName(modelId);
    }

    private showConfirmationView(): void {
        const { contentEl } = this;
        contentEl.empty();

        const modelName = this.getActiveModelDisplayName();
        this.renderProcessingHero(contentEl, 'Evaluate narrative momentum at each story beat. This will pass the entire manuscript to the AI, with instructions including the ideal beat ranges and context such as the previous score and justification. The AI will return a score and an updated justification for each beat.', modelName);

        this.confirmationView = contentEl;

        const card = contentEl.createDiv({ cls: 'rt-glass-card' });

        // Info section (no extra spacing class)
        const infoEl = card.createDiv();

        // Beat system info (will be updated when manuscript info is set)
        const beatSystemEl = infoEl.createDiv({ cls: 'rt-gossamer-proc-beat-system-info' });
        beatSystemEl.setText('Gathering manuscript details...');

        // Manuscript info section (will be populated by caller)
        const infoSection = card.createDiv({ cls: 'rt-gossamer-proc-info-section' });
        infoSection.createEl('h3', { text: 'Manuscript Information', cls: 'rt-gossamer-proc-section-title' });
        this.manuscriptInfoEl = infoSection.createDiv({ cls: 'rt-gossamer-proc-manuscript-info' });
        this.manuscriptInfoEl.setText('Gathering manuscript details...');

        // Check if API key is configured
        // TODO: Update this check to be provider-agnostic
        if (!this.plugin.settings.geminiApiKey && this.plugin.settings.defaultAiProvider === 'gemini') {
            // Warning section for missing API key
            const warningEl = card.createDiv({ cls: 'rt-pulse-warning' });
            warningEl.setText('⚠️ Gemini API key not configured. Please set your API key in Settings → AI → Gemini API key.');
        }

        // Action buttons
        const buttonRow = contentEl.createDiv({ cls: 'rt-modal-actions' });

        new ButtonComponent(buttonRow)
            .setButtonText('Begin Analysis')
            .setCta()
            // .setDisabled(!this.plugin.settings.geminiApiKey) // Disable if no API key
            .onClick(async () => {
                await this.startProcessing();
            });

        new ButtonComponent(buttonRow)
            .setButtonText('Cancel')
            .onClick(() => this.close());
    }

    private async startProcessing(): Promise<void> {
        this.isProcessing = true;
        this.showProcessingView();

        try {
            await this.onConfirm(this.analysisOptions);
        } catch (error) {
            console.error('[Gossamer AI] Processing error:', error);
        }
    }

    private showProcessingView(): void {
        const { contentEl } = this;
        contentEl.empty();

        const modelName = this.getActiveModelDisplayName();
        this.renderProcessingHero(contentEl, 'Analyzing manuscript...', modelName);

        const bodyEl = contentEl.createDiv({ cls: 'rt-pulse-progress-body' });
        const progressCard = bodyEl.createDiv({ cls: 'rt-pulse-progress-card rt-glass-card' });

        // Manuscript info section (reusing existing styles but inside the card)
        const infoSection = progressCard.createDiv({ cls: 'rt-gossamer-proc-info-section' });
        infoSection.createEl('h3', { text: 'Manuscript Information', cls: 'rt-gossamer-proc-section-title' });
        this.manuscriptInfoEl = infoSection.createDiv({ cls: 'rt-gossamer-proc-manuscript-info' });
        this.manuscriptInfoEl.setText('Assembling manuscript...');

        // Progress bar container
        const progressContainer = progressCard.createDiv({ cls: 'rt-pulse-progress-container' });
        const progressBg = progressContainer.createDiv({ cls: 'rt-pulse-progress-bg' });
        this.progressBarEl = progressBg.createDiv({ cls: 'rt-pulse-progress-bar' });
        this.progressBarEl.style.setProperty('--progress-width', '0%');

        // Status section
        const statusSection = progressCard.createDiv({ cls: 'rt-gossamer-proc-status-section' });
        statusSection.createEl('h3', { text: 'Status', cls: 'rt-gossamer-proc-section-title' });
        this.statusTextEl = statusSection.createDiv({ cls: 'rt-gossamer-proc-status-text' });
        this.statusTextEl.setText(this.currentStatus);

        // API status section
        const apiSection = progressCard.createDiv({ cls: 'rt-gossamer-proc-api-section' });
        apiSection.createEl('h3', { text: 'API Activity', cls: 'rt-gossamer-proc-section-title' });
        this.apiStatusEl = apiSection.createDiv({ cls: 'rt-gossamer-proc-api-status' });
        this.apiStatusEl.setText('Waiting to send...');

        // Error section
        this.errorListEl = bodyEl.createDiv({ cls: 'rt-pulse-error-list rt-glass-card rt-hidden' });

        // Close button (disabled while processing)
        const buttonContainer = contentEl.createDiv({ cls: 'rt-modal-actions' });
        this.closeButtonEl = new ButtonComponent(buttonContainer)
            .setButtonText('Close')
            .setDisabled(true)
            .onClick(() => this.close());
    }

    /**
     * Update manuscript assembly information
     */
    public setManuscriptInfo(info: ManuscriptInfo): void {
        this.manuscriptInfo = info;

        if (this.manuscriptInfoEl) {
            this.manuscriptInfoEl.empty();

            // Stats Grid
            const stats = this.manuscriptInfoEl.createDiv({ cls: 'rt-gossamer-proc-stats' });

            const createStat = (label: string, value: string) => {
                const item = stats.createDiv({ cls: 'rt-gossamer-proc-stat-item' });
                item.createDiv({ cls: 'rt-gossamer-proc-stat-label', text: label });
                item.createDiv({ cls: 'rt-gossamer-proc-stat-value', text: value });
            };

            createStat('Scenes', info.totalScenes.toLocaleString());
            createStat('Words', info.totalWords.toLocaleString());
            createStat('Est. Tokens', `~${info.estimatedTokens.toLocaleString()}`);
            createStat('Story Beats', info.beatCount.toString());

            // Add note if this is iterative refinement with previous analysis
            if (info.hasIterativeContext) {
                stats.createDiv({
                    cls: 'rt-gossamer-proc-stat-row rt-gossamer-proc-iterative-note',
                    text: `Iterative refinement: Previous analysis will be sent for comparison`
                });
            }
        }

        // Update the beat system info in confirmation view if it exists
        const beatSystemInfoEl = this.confirmationView?.querySelector('.rt-gossamer-proc-beat-system-info');
        if (beatSystemInfoEl) {
            beatSystemInfoEl.setText(`Beat System: ${info.beatSystem}`);
        }
    }

    /**
     * Update current status message
     */
    public setStatus(status: string): void {
        this.currentStatus = status;

        if (this.statusTextEl) {
            this.statusTextEl.setText(status);
        }
    }

    /**
     * Mark API call as started
     */
    public apiCallStarted(): void {
        this.apiCallStartTime = Date.now();

        if (this.apiStatusEl) {
            this.apiStatusEl.empty();
            this.updateTimer();

            // SAFE: Modal doesn't have registerInterval; manually cleaned up in onClose()
            this.timerInterval = window.setInterval(() => {
                this.updateTimer();
            }, 1000);
        }

        // Animate progress bar to indicate activity (pulse between 10% and 90%)
        if (this.progressBarEl) {
            this.progressBarEl.addClass('rt-gossamer-progress-active');
            // SAFE: inline style used for CSS custom property (--progress-width) to enable smooth progress animation
            this.progressBarEl.style.setProperty('--progress-width', '50%');
        }
    }

    /**
     * Update elapsed time display
     */
    private updateTimer(): void {
        if (!this.apiStatusEl || !this.apiCallStartTime) return;

        const elapsed = Math.floor((Date.now() - this.apiCallStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        const timeStr = minutes > 0
            ? `${minutes}:${seconds.toString().padStart(2, '0')}`
            : `${seconds}s`;

        // Different messages based on elapsed time
        let message: string;
        if (elapsed < 30) {
            message = `Sending manuscript to AI... ${timeStr}`;
        } else if (elapsed < 60) {
            message = `Evaluating beats... ${timeStr}`;
        } else {
            message = `Preparing response... ${timeStr}`;
        }

        // Estimate: ~30-90 seconds for typical manuscripts
        const estimate = elapsed < 90
            ? ' (typically 30-90 seconds)'
            : ' (large manuscript)';

        this.apiStatusEl.setText(message + estimate);
    }

    /**
     * Mark API call as successful
     */
    public apiCallSuccess(): void {
        // Clear timer
        if (this.timerInterval) {
            window.clearInterval(this.timerInterval);
            this.timerInterval = undefined;
        }

        const elapsed = this.apiCallStartTime ? ((Date.now() - this.apiCallStartTime) / 1000).toFixed(1) : '?';

        if (this.apiStatusEl) {
            this.apiStatusEl.empty();
            this.apiStatusEl.setText(`✓ Response received (${elapsed}s)`);
        }

        // Complete the progress bar and pause animation
        if (this.progressBarEl) {
            this.progressBarEl.removeClass('rt-gossamer-progress-active');
            this.progressBarEl.addClass('rt-progress-complete');
            // SAFE: inline style used for CSS custom property (--progress-width) to enable smooth progress animation
            this.progressBarEl.style.setProperty('--progress-width', '100%');
        }
    }

    /**
     * Mark API call as failed with error
     */
    public apiCallError(error: string): void {
        // Clear timer
        if (this.timerInterval) {
            window.clearInterval(this.timerInterval);
            this.timerInterval = undefined;
        }

        if (this.apiStatusEl) {
            this.apiStatusEl.empty();
            this.apiStatusEl.setText(`✗ API call failed`);
        }

        // Reset progress bar
        if (this.progressBarEl) {
            this.progressBarEl.removeClass('rt-gossamer-progress-active');
            this.progressBarEl.addClass('rt-progress-complete');
            // SAFE: inline style used for CSS custom property (--progress-width) to enable smooth progress animation
            this.progressBarEl.style.setProperty('--progress-width', '0%');
        }

        this.addError(error);
    }

    /**
     * Add error message to error section (using Scene Analysis styling)
     */
    public addError(message: string): void {
        if (!this.errorListEl) return;

        // Show error section
        if (this.errorListEl.hasClass('rt-hidden')) {
            this.errorListEl.removeClass('rt-hidden');
            const header = this.errorListEl.createDiv({ cls: 'rt-gossamer-proc-error-header' });
            header.setText('Errors encountered:');
        }

        const errorItem = this.errorListEl.createDiv({ cls: 'rt-gossamer-proc-error-item' });
        errorItem.setText(message);
    }

    /**
     * Mark processing as complete
     */
    public completeProcessing(success: boolean, message: string): void {
        this.isProcessing = false;

        if (this.statusTextEl) {
            this.statusTextEl.setText(message);
        }

        // Complete the progress bar and pause animation
        if (this.progressBarEl) {
            this.progressBarEl.removeClass('rt-gossamer-progress-active');
            this.progressBarEl.addClass('rt-progress-complete');
            if (success) {
                // SAFE: inline style used for CSS custom property (--progress-width) to enable smooth progress animation
                this.progressBarEl.style.setProperty('--progress-width', '100%');
            }
        }

        if (this.closeButtonEl) {
            this.closeButtonEl.setDisabled(false);
            if (success) {
                this.closeButtonEl.setCta();
            }
        }
    }

    /**
     * Show rate limit notification
     */
    public showRateLimitWarning(retryAfter?: number): void {
        const message = retryAfter
            ? `Rate limit reached. Please try again in ${retryAfter} seconds.`
            : 'Rate limit reached. Please try again later.';

        this.addError(message);

        if (this.apiStatusEl) {
            this.apiStatusEl.setText('⚠️ Rate limited');
        }
    }
}

export default GossamerProcessingModal;
