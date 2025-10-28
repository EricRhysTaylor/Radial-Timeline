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

export interface ManuscriptInfo {
    totalScenes: number;
    totalWords: number;
    estimatedTokens: number;
    beatCount: number;
    hasIterativeContext?: boolean; // True if any beats have previous justifications for comparison
}

/**
 * Modal for confirming and showing progress of Gossamer AI momentum analysis
 */
export class GossamerProcessingModal extends Modal {
    private readonly plugin: RadialTimelinePlugin;
    private readonly onConfirm: () => Promise<void>;
    
    public isProcessing: boolean = false;
    
    // UI elements
    private confirmationView?: HTMLElement;
    private processingView?: HTMLElement;
    private manuscriptInfoEl?: HTMLElement;
    private statusTextEl?: HTMLElement;
    private apiStatusEl?: HTMLElement;
    private progressSpinnerEl?: HTMLElement;
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
        onConfirm: () => Promise<void>
    ) {
        super(app);
        this.plugin = plugin;
        this.onConfirm = onConfirm;
    }

    onOpen(): void {
        const { contentEl, titleEl, modalEl } = this;
        titleEl.setText('Gossamer gemini momentum analysis');
        
        // Set modal width
        if (modalEl) {
            modalEl.style.width = '700px'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxWidth = '90vw';
        }
        
        contentEl.classList.add('rt-gossamer-processing-modal');
        
        // Show confirmation view first
        this.showConfirmationView();
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

    private showConfirmationView(): void {
        const { contentEl } = this;
        contentEl.empty();
        
        this.confirmationView = contentEl;
        
        // Info section
        const infoEl = contentEl.createDiv({ cls: 'rt-beats-info' });
        infoEl.setText('This will analyze your entire manuscript using Gemini AI to evaluate narrative momentum at each story beat.');
        
        // Manuscript info section (will be populated by caller)
        const infoSection = contentEl.createDiv({ cls: 'rt-gossamer-info-section' });
        infoSection.createEl('h3', { text: 'Manuscript Information', cls: 'rt-gossamer-section-title' });
        this.manuscriptInfoEl = infoSection.createDiv({ cls: 'rt-gossamer-manuscript-info' });
        this.manuscriptInfoEl.setText('Gathering manuscript details...');
        
        // Warning section
        const warningEl = contentEl.createDiv({ cls: 'rt-beats-warning' });
        warningEl.setText('⚠️ This will send your full manuscript text to Google Gemini API. Ensure you have a valid API key configured in Settings → AI → Gemini API key.');
        
        // Action buttons
        const buttonRow = contentEl.createDiv({ cls: 'rt-beats-actions' });
        
        new ButtonComponent(buttonRow)
            .setButtonText('Begin Analysis')
            .setCta()
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
            await this.onConfirm();
        } catch (error) {
            console.error('[Gossamer AI] Processing error:', error);
        }
    }

    private showProcessingView(): void {
        const { contentEl } = this;
        contentEl.empty();
        
        // Manuscript info section
        const infoSection = contentEl.createDiv({ cls: 'rt-gossamer-info-section' });
        infoSection.createEl('h3', { text: 'Manuscript Information', cls: 'rt-gossamer-section-title' });
        this.manuscriptInfoEl = infoSection.createDiv({ cls: 'rt-gossamer-manuscript-info' });
        this.manuscriptInfoEl.setText('Assembling manuscript...');
        
        // Progress spinner
        const spinnerContainer = contentEl.createDiv({ cls: 'rt-gossamer-spinner-container' });
        this.progressSpinnerEl = spinnerContainer.createDiv({ cls: 'rt-gossamer-spinner' });
        
        // Status section
        const statusSection = contentEl.createDiv({ cls: 'rt-gossamer-status-section' });
        statusSection.createEl('h3', { text: 'Status', cls: 'rt-gossamer-section-title' });
        this.statusTextEl = statusSection.createDiv({ cls: 'rt-gossamer-status-text' });
        this.statusTextEl.setText(this.currentStatus);
        
        // API status section
        const apiSection = contentEl.createDiv({ cls: 'rt-gossamer-api-section' });
        apiSection.createEl('h3', { text: 'API Activity', cls: 'rt-gossamer-section-title' });
        this.apiStatusEl = apiSection.createDiv({ cls: 'rt-gossamer-api-status' });
        this.apiStatusEl.setText('Waiting to send...');
        
        // Error section (hidden initially) - use same styling as Scene Analysis
        this.errorListEl = contentEl.createDiv({ cls: 'rt-beats-error-list rt-hidden' });
        
        // Close button (disabled while processing)
        const buttonContainer = contentEl.createDiv({ cls: 'rt-gossamer-actions' });
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
            
            const stats = this.manuscriptInfoEl.createDiv({ cls: 'rt-gossamer-stats' });
            
            stats.createDiv({ 
                cls: 'rt-gossamer-stat-row',
                text: `Scenes: ${info.totalScenes.toLocaleString()}`
            });
            
            stats.createDiv({ 
                cls: 'rt-gossamer-stat-row',
                text: `Words: ${info.totalWords.toLocaleString()}`
            });
            
            stats.createDiv({ 
                cls: 'rt-gossamer-stat-row',
                text: `Estimated tokens: ~${info.estimatedTokens.toLocaleString()}`
            });
            
            stats.createDiv({ 
                cls: 'rt-gossamer-stat-row',
                text: `Story beats: ${info.beatCount}`
            });
            
            // Add note if this is iterative refinement with previous analysis
            if (info.hasIterativeContext) {
                stats.createDiv({ 
                    cls: 'rt-gossamer-stat-row rt-gossamer-iterative-note',
                    text: `📊 Iterative refinement: Previous analysis will be sent for comparison`
                });
            }
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
            
            // Start timer that updates every second
            this.timerInterval = window.setInterval(() => {
                this.updateTimer();
            }, 1000);
        }
        
        if (this.progressSpinnerEl) {
            this.progressSpinnerEl.addClass('rt-spinner-active');
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
            message = `Sending manuscript to Gemini... ${timeStr}`;
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
        
        if (this.progressSpinnerEl) {
            this.progressSpinnerEl.removeClass('rt-spinner-active');
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
        
        if (this.progressSpinnerEl) {
            this.progressSpinnerEl.removeClass('rt-spinner-active');
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
            const header = this.errorListEl.createDiv({ cls: 'rt-beats-error-header' });
            header.setText('Errors encountered:');
        }
        
        const errorItem = this.errorListEl.createDiv({ cls: 'rt-beats-error-item' });
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
        
        if (this.progressSpinnerEl) {
            this.progressSpinnerEl.removeClass('rt-spinner-active');
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
