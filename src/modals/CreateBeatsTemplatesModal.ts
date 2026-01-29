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
    const { contentEl, modalEl, titleEl } = this;
    contentEl.empty();
    titleEl.setText('');
    
    if (modalEl) {
      modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell');
      modalEl.style.width = '620px'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
      modalEl.style.maxWidth = '92vw'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
    }
    contentEl.addClass('ert-modal-container');
    contentEl.addClass('rt-create-plot-templates-modal');

    // Header
    const header = contentEl.createDiv({ cls: 'ert-modal-header' });
    header.createSpan({ cls: 'ert-modal-badge', text: 'Setup' });
    header.createDiv({ cls: 'ert-modal-title', text: 'Create beat template notes' });
    header.createDiv({ cls: 'ert-modal-subtitle', text: `This will create ${this.beatCount} beat notes for "${this.beatSystem}".` });

    // Info card with example
    const card = contentEl.createDiv({ cls: 'rt-glass-card' });

    card.createDiv({ cls: 'rt-sub-card-note', text: 'Each beat note will have the following YAML structure:' });

    const exampleCode = card.createEl('pre', { cls: 'rt-code-block' });
    exampleCode.textContent = `---
Class: Beat
Act: 1
Description: [Beat description]
Beat Model: ${this.beatSystem}
Range: [Ideal momentum range]
Gossamer1:
---`;

    const sourcePath = this.plugin.settings.sourcePath.trim();
    const locationText = sourcePath 
      ? `Notes will be created in: ${sourcePath}/`
      : 'Notes will be created in the vault root (no source path set)';
    
    card.createDiv({ cls: 'rt-sub-card-note', text: locationText });

    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: 'ert-modal-actions' });

    new ButtonComponent(buttonContainer)
      .setButtonText(`Create ${this.beatCount} notes`)
      .setCta()
      .onClick(() => {
        if (this.resolve) {
          this.resolve({ confirmed: true });
        }
        this.close();
      });

    new ButtonComponent(buttonContainer)
      .setButtonText('Cancel')
      .onClick(() => {
        if (this.resolve) {
          this.resolve({ confirmed: false });
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

