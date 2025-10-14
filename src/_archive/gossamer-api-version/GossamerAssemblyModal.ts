/*
 * Gossamer Manuscript Assembly Modal
 */
import { Modal, App, ButtonComponent, Notice } from 'obsidian';
import { estimateTokens } from '../utils/manuscript';

export interface AssemblyResult {
  proceed: boolean;
  manuscriptPath?: string;
}

export class GossamerAssemblyModal extends Modal {
  private progressDiv: HTMLDivElement;
  private summaryDiv: HTMLDivElement;
  private buttonContainer: HTMLDivElement;
  private resolve: ((result: AssemblyResult) => void) | null = null;
  private manuscriptPath: string = '';
  private isAssembling: boolean = true;

  constructor(app: App) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('rt-gossamer-assembly-modal');

    // Title
    const titleEl = contentEl.createEl('h2', { text: 'Gossamer Manuscript Analysis' });
    titleEl.addClass('rt-gossamer-title');

    // Progress section (shown during assembly)
    this.progressDiv = contentEl.createDiv('rt-gossamer-progress');
    
    const progressTitle = this.progressDiv.createEl('h3', { text: 'Assembling manuscript...' });
    progressTitle.addClass('rt-gossamer-progress-title');
    
    const progressStatus = this.progressDiv.createDiv('rt-gossamer-progress-status');
    progressStatus.id = 'rt-gossamer-progress-status';

    // Summary section (shown after assembly)
    this.summaryDiv = contentEl.createDiv('rt-gossamer-summary');
    this.summaryDiv.addClass('rt-hidden');

    // Button container
    this.buttonContainer = contentEl.createDiv('rt-gossamer-buttons');
    this.buttonContainer.addClass('rt-hidden');
  }

  updateProgress(sceneIndex: number, sceneTitle: string, totalScenes: number, wordCount: number): void {
    const statusEl = this.contentEl.querySelector('#rt-gossamer-progress-status');
    if (!statusEl) return;

    const percentage = Math.round((sceneIndex / totalScenes) * 100);
    const estimatedTokens = estimateTokens(wordCount);

    statusEl.setText(
      `Processing scene ${sceneIndex}/${totalScenes} (${percentage}%)\n` +
      `Current: ${sceneTitle}\n` +
      `Words: ${wordCount.toLocaleString()} (~${estimatedTokens.toLocaleString()} tokens)`
    );
  }

  showSummary(
    totalScenes: number,
    totalWords: number,
    plotSystem: string,
    beatsFound: number,
    manuscriptPath: string
  ): void {
    this.isAssembling = false;
    this.manuscriptPath = manuscriptPath;

    // Hide progress
    this.progressDiv.addClass('rt-hidden');

    // Show summary
    this.summaryDiv.removeClass('rt-hidden');
    this.summaryDiv.empty();

    const summaryTitle = this.summaryDiv.createEl('h3', { text: 'Assembly Complete' });
    summaryTitle.addClass('rt-gossamer-summary-title');

    const summaryContent = this.summaryDiv.createDiv('rt-gossamer-summary-content');

    const estimatedTokens = estimateTokens(totalWords);

    summaryContent.createEl('div', { text: `Total scenes: ${totalScenes}` });
    summaryContent.createEl('div', { text: `Total words: ${totalWords.toLocaleString()}` });
    summaryContent.createEl('div', { text: `Estimated tokens: ~${estimatedTokens.toLocaleString()}` });
    summaryContent.createEl('div', { text: `Plot system: ${plotSystem}` });
    summaryContent.createEl('div', { text: `Beats found: ${beatsFound}` });
    summaryContent.createEl('div', { text: `` });
    summaryContent.createEl('div', { 
      text: `Saved to: ${manuscriptPath}`,
      cls: 'rt-manuscript-path'
    });

    // Warning if very large
    if (estimatedTokens > 150000) {
      const warningEl = this.summaryDiv.createDiv('rt-gossamer-warning');
      warningEl.setText('⚠️ Warning: This manuscript is very large and may take 1-2 minutes to analyze. API costs will be significant.');
    }

    // Show buttons
    this.buttonContainer.removeClass('rt-hidden');
    this.buttonContainer.empty();

    new ButtonComponent(this.buttonContainer)
      .setButtonText('Review Manuscript')
      .onClick(async () => {
        // Open the manuscript file
        const file = this.app.vault.getAbstractFileByPath(manuscriptPath);
        if (file) {
          await this.app.workspace.openLinkText(manuscriptPath, '', false);
        }
      });

    new ButtonComponent(this.buttonContainer)
      .setButtonText('Send to AI')
      .setCta()
      .onClick(() => {
        if (this.resolve) {
          this.resolve({ proceed: true, manuscriptPath: this.manuscriptPath });
        }
        this.close();
      });

    new ButtonComponent(this.buttonContainer)
      .setButtonText('Cancel')
      .onClick(() => {
        if (this.resolve) {
          this.resolve({ proceed: false });
        }
        this.close();
      });
  }

  waitForUserDecision(): Promise<AssemblyResult> {
    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
    
    // If modal is closed while assembling (e.g., user hits ESC), resolve with cancel
    if (this.isAssembling && this.resolve) {
      this.resolve({ proceed: false });
    }
  }
}


