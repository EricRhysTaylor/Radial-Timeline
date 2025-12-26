/*
 * Beat Placement Optimization Modal
 * Confirms and tracks progress of beat placement analysis
 */
import { App, Modal, ButtonComponent, Notice } from 'obsidian';
import type RadialTimelinePlugin from '../main';

export interface ManuscriptInfo {
    totalScenes: number;
    totalWords: number;
    estimatedTokens: number;
    beatCount: number;
    beatSystem?: string; // Selected beat system (e.g., "Save The Cat")
}

/**
 * Modal for confirming and showing progress of Beat Placement optimization
 */
export class BeatPlacementModal extends Modal {
    private readonly plugin: RadialTimelinePlugin;
    private readonly onConfirm: () => Promise<void>;
    
    public isProcessing: boolean = false;
    
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
        onConfirm: () => Promise<void>
    ) {
        super(app);
        this.plugin = plugin;
        this.onConfirm = onConfirm;
    }

    onOpen(): void {
        const { contentEl, titleEl, modalEl } = this;
        titleEl.setText('Optimize beat placement');
        
        // Set modal width
        if (modalEl) {
            modalEl.style.width = '700px'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxWidth = '90vw'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
        }
        
        contentEl.classList.add('rt-beat-placement-modal');
        contentEl.classList.add('rt-pulse-modal');
        contentEl.classList.add('rt-manuscript-surface');
        
        // Show confirmation view first
        this.showConfirmationView();
    }

    onClose(): void {
        // Clear timer if active
        if (this.timerInterval) {
            window.clearInterval(this.timerInterval);
            this.timerInterval = undefined;
        }
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
        
        // Get beat system for description
        const beatSystem = this.plugin.settings.beatSystem || 'Save The Cat';
        
        // Info section
        const infoEl = contentEl.createDiv({ cls: 'rt-beats-info' });
        infoEl.setText(`This will analyze your manuscript structure using Gemini AI to suggest optimal beat placement based on the ${beatSystem} beat system.`);
        
        // Manuscript info section (will be populated by caller)
        const manuscriptSection = contentEl.createDiv({ cls: 'rt-manuscript-section' });
        manuscriptSection.createEl('h3', { text: 'Manuscript Information' });
        this.manuscriptInfoEl = manuscriptSection.createDiv({ cls: 'rt-manuscript-details' });
        this.manuscriptInfoEl.setText('Gathering manuscript details...');
        
        // Check if API key is configured
        if (!this.plugin.settings.geminiApiKey) {
            // Warning box for missing API key
            const warningBox = contentEl.createDiv({ cls: 'rt-api-warning' });
            warningBox.createSpan({ text: '⚠️ ' });
            warningBox.createSpan({ 
                text: 'Gemini API key not configured. Please set your API key in Settings → AI → Gemini API key.' 
            });
        }
        
        // Button container
        const buttonContainer = contentEl.createDiv({ cls: 'rt-modal-actions' });
        
        new ButtonComponent(buttonContainer)
            .setButtonText('Begin Analysis')
            .setCta()
            .setDisabled(!this.plugin.settings.geminiApiKey) // Disable if no API key
            .onClick(async () => {
                await this.startProcessing();
            });
        
        new ButtonComponent(buttonContainer)
            .setButtonText('Cancel')
            .onClick(() => {
                this.close();
            });
    }

    /**
     * Set manuscript info to display in confirmation view
     */
    public setManuscriptInfo(info: ManuscriptInfo): void {
        this.manuscriptInfo = info;
        
        if (this.manuscriptInfoEl) {
            this.manuscriptInfoEl.empty();
            
            const details = [
                `• Scenes: ${info.totalScenes.toLocaleString()}`,
                `• Words: ${info.totalWords.toLocaleString()}`,
                `• Est. Tokens: ~${info.estimatedTokens.toLocaleString()}`,
                `• Story Beats: ${info.beatCount}`
            ];
            
            if (info.beatSystem) {
                details.push(`• Beat System: ${info.beatSystem}`);
            }
            
            details.forEach(detail => {
                this.manuscriptInfoEl!.createDiv({ text: detail });
            });
        }
    }

    private async startProcessing(): Promise<void> {
        this.isProcessing = true;
        this.showProcessingView();
        
        try {
            await this.onConfirm();
        } catch (e) {
            const errorMsg = (e as Error)?.message || 'Unknown error';
            this.addError(`Processing failed: ${errorMsg}`);
            this.completeProcessing(false, 'Processing failed');
        }
    }

    private showProcessingView(): void {
        const { contentEl, titleEl } = this;
        contentEl.empty();
        titleEl.setText('Optimizing beat placement...');
        
        this.processingView = contentEl;
        
        // Progress bar container (using Scene Analysis pattern)
        const progressContainer = contentEl.createDiv({ cls: 'rt-beat-placement-progress-container' });
        
        // Progress bar background
        const progressBg = progressContainer.createDiv({ cls: 'rt-beat-placement-progress-bg' });
        this.progressBarEl = progressBg.createDiv({ cls: 'rt-beat-placement-progress-bar' });
        // SAFE: inline style used for CSS custom property (--progress-width) to enable smooth progress animation
        this.progressBarEl.style.setProperty('--progress-width', '50%');
        
        // Status text
        this.statusTextEl = contentEl.createDiv({ cls: 'rt-status-text' });
        this.statusTextEl.setText(this.currentStatus);
        
        // API status (timer)
        this.apiStatusEl = contentEl.createDiv({ cls: 'rt-api-status' });
        this.apiStatusEl.hide();
        
        // Error list (hidden initially)
        this.errorListEl = contentEl.createDiv({ cls: 'rt-error-list' });
        this.errorListEl.hide();
        
        // Close button (disabled initially)
        const buttonContainer = contentEl.createDiv({ cls: 'rt-modal-actions' });
        this.closeButtonEl = new ButtonComponent(buttonContainer)
            .setButtonText('Processing...')
            .setDisabled(true);
    }

    /**
     * Update status text during processing
     */
    public setStatus(status: string): void {
        this.currentStatus = status;
        if (this.statusTextEl) {
            this.statusTextEl.setText(status);
        }
        
        // Start timer when calling API
        if (status.toLowerCase().includes('gemini')) {
            this.startApiTimer();
        }
    }

    /**
     * Add error message to error list
     */
    public addError(error: string): void {
        if (this.errorListEl) {
            this.errorListEl.show();
            const errorItem = this.errorListEl.createDiv({ cls: 'rt-error-item' });
            errorItem.setText(`❌ ${error}`);
        }
    }

    /**
     * Mark processing as complete
     */
    public completeProcessing(success: boolean, finalMessage: string): void {
        this.isProcessing = false;
        
        // Complete the progress bar and pause animation
        if (this.progressBarEl) {
            this.progressBarEl.addClass('rt-progress-complete');
            if (success) {
                // SAFE: inline style used for CSS custom property (--progress-width) to enable smooth progress animation
                this.progressBarEl.style.setProperty('--progress-width', '100%');
            } else {
                // SAFE: inline style used for CSS custom property (--progress-width) to enable smooth progress animation
                this.progressBarEl.style.setProperty('--progress-width', '0%');
            }
        }
        
        if (this.statusTextEl) {
            this.statusTextEl.setText(finalMessage);
        }
        
        if (this.closeButtonEl) {
            this.closeButtonEl
                .setButtonText('Close')
                .setDisabled(false)
                .onClick(() => this.close());
        }
        
        this.stopApiTimer();
    }

    private startApiTimer(): void {
        this.apiCallStartTime = Date.now();
        
        if (this.apiStatusEl) {
            this.apiStatusEl.show();
        }
        
        // SAFE: Modal doesn't have registerInterval; manually cleaned up in onClose()
        this.timerInterval = window.setInterval(() => {
            if (this.apiCallStartTime && this.apiStatusEl) {
                const elapsed = Math.floor((Date.now() - this.apiCallStartTime) / 1000);
                this.apiStatusEl.setText(`API call in progress: ${elapsed}s`);
            }
        }, 1000);
    }

    private stopApiTimer(): void {
        if (this.timerInterval) {
            window.clearInterval(this.timerInterval);
            this.timerInterval = undefined;
        }
        
        if (this.apiStatusEl && this.apiCallStartTime) {
            const elapsed = Math.floor((Date.now() - this.apiCallStartTime) / 1000);
            this.apiStatusEl.setText(`API call completed in ${elapsed}s`);
        }
    }
}
