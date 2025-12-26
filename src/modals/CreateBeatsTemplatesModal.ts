/*
 * Create Beats Templates Modal - Confirmation dialog
 */
import { Modal, App, ButtonComponent, Notice } from 'obsidian';
import type RadialTimelinePlugin from '../main';

export interface CreateBeatsTemplatesResult {
  confirmed: boolean;
}

export class CreateBeatsTemplatesModal extends Modal {
  private plugin: RadialTimelinePlugin;
  private beatSystem: string;
  private beatCount: number;
  private resolve: ((result: CreateBeatsTemplatesResult) => void) | null = null;

  constructor(app: App, plugin: RadialTimelinePlugin, beatSystem: string, beatCount: number) {
    super(app);
    this.plugin = plugin;
    
    // If it's the dynamic custom system, show the user's custom name
    if (beatSystem === 'Custom' && this.plugin.settings.customBeatSystemName) {
        this.beatSystem = this.plugin.settings.customBeatSystemName;
    } else {
        this.beatSystem = beatSystem;
    }
    
    this.beatCount = beatCount;
  }

  onOpen(): void {
    const { contentEl, modalEl } = this;
    contentEl.empty();
    if (modalEl) modalEl.classList.add('rt-pulse-modal-shell');
    contentEl.addClass('rt-pulse-modal');
    contentEl.addClass('rt-manuscript-surface');
    contentEl.addClass('rt-create-plot-templates-modal');

    // Title
    const titleEl = contentEl.createEl('h2', { text: 'Create Plot Template Notes' });
    titleEl.style.marginBottom = '16px';

    // Warning/info section
    const infoContainer = contentEl.createDiv('rt-plot-templates-info');
    infoContainer.style.backgroundColor = 'var(--background-secondary)'; // SAFE: inline style used for modal layout
    infoContainer.style.padding = '16px';
    infoContainer.style.borderRadius = '6px';
    infoContainer.style.marginBottom = '20px';

    infoContainer.createEl('p', { 
      text: `This will create ${this.beatCount} Beat notes for "${this.beatSystem}" with the following structure:`
    });

    const exampleCode = infoContainer.createEl('pre');
    exampleCode.style.backgroundColor = 'var(--background-primary)'; // SAFE: inline style used for modal layout
    exampleCode.style.padding = '12px'; // SAFE: inline style used for modal layout
    exampleCode.style.borderRadius = '4px'; // SAFE: inline style used for modal layout
    exampleCode.style.fontSize = '12px'; // SAFE: inline style used for modal layout
    exampleCode.style.overflowX = 'auto'; // SAFE: inline style used for modal layout
    exampleCode.textContent = `---
Class: Beat
Act: 1
Description: [Beat description]
Beat Model: ${this.beatSystem}
Range: [Ideal momentum range]
Gossamer1:
---`;

    const locationInfo = infoContainer.createEl('p');
    locationInfo.style.marginTop = '12px';
    locationInfo.style.marginBottom = '0';
    
    const sourcePath = this.plugin.settings.sourcePath.trim();
    const locationText = sourcePath 
      ? `Notes will be created in: ${sourcePath}/`
      : 'Notes will be created in the vault root (no source path set)';
    
    const locationLabel = locationInfo.createEl('strong');
    locationLabel.textContent = 'Location:';
    locationInfo.appendText(` ${locationText}`);

    // Buttons
    const buttonContainer = contentEl.createDiv('rt-plot-templates-buttons');
    buttonContainer.style.display = 'flex'; // SAFE: inline style used for modal layout
    buttonContainer.style.gap = '10px'; // SAFE: inline style used for modal layout
    buttonContainer.style.justifyContent = 'flex-end'; // SAFE: inline style used for modal layout

    new ButtonComponent(buttonContainer)
      .setButtonText('Cancel')
      .onClick(() => {
        if (this.resolve) {
          this.resolve({ confirmed: false });
        }
        this.close();
      });

    new ButtonComponent(buttonContainer)
      .setButtonText(`Create ${this.beatCount} notes`)
      .setCta()
      .onClick(() => {
        if (this.resolve) {
          this.resolve({ confirmed: true });
        }
        this.close();
      });
  }

  waitForConfirmation(): Promise<CreateBeatsTemplatesResult> {
    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
    
    // If modal is closed without decision, resolve with cancel
    if (this.resolve) {
      this.resolve({ confirmed: false });
    }
  }
}

