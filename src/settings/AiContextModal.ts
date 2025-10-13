/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */
import { App, Modal, ButtonComponent, DropdownComponent, TextComponent, Notice } from 'obsidian';
import type RadialTimelinePlugin from '../main';

interface AiContextTemplate {
    id: string;
    name: string;
    prompt: string;
    isBuiltIn: boolean;
}

/**
 * Simple text input modal to replace prompt()
 */
class TextInputModal extends Modal {
    private result: string | null = null;
    private readonly title: string;
    private readonly defaultValue: string;
    private readonly onSubmit: (result: string) => void;

    constructor(app: App, title: string, defaultValue: string, onSubmit: (result: string) => void) {
        super(app);
        this.title = title;
        this.defaultValue = defaultValue;
        this.onSubmit = onSubmit;
    }

    onOpen(): void {
        const { contentEl, titleEl } = this;
        titleEl.setText(this.title);

        // Input field
        const inputEl = contentEl.createEl('input', {
            type: 'text',
            value: this.defaultValue,
            cls: 'rt-text-input-modal-field'
        });

        // Focus and select all
        window.setTimeout(() => {
            inputEl.focus();
            inputEl.select();
        }, 10);

        // Handle Enter key
        this.registerDomEvent(inputEl, 'keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.submit(inputEl.value);
            } else if (e.key === 'Escape') {
                this.close();
            }
        });

        // Buttons
        const buttonRow = contentEl.createDiv({ cls: 'modal-button-container rt-text-input-modal-buttons' });

        new ButtonComponent(buttonRow)
            .setButtonText('Cancel')
            .onClick(() => this.close());

        new ButtonComponent(buttonRow)
            .setButtonText('OK')
            .setCta()
            .onClick(() => this.submit(inputEl.value));
    }

    private submit(value: string): void {
        if (value && value.trim()) {
            this.onSubmit(value.trim());
        }
        this.close();
    }
}

/**
 * AiContextModal allows users to manage AI context templates for story analysis.
 * Users can select, create, edit, rename, and delete custom templates.
 * Built-in templates are read-only but can be copied.
 */
export class AiContextModal extends Modal {
    private readonly plugin: RadialTimelinePlugin;
    private readonly onSave: () => void;
    
    private currentTemplateId: string;
    private templates: AiContextTemplate[];
    private isDirty: boolean = false;
    
    private dropdownComponent?: DropdownComponent;
    private textareaEl?: HTMLTextAreaElement;
    private saveButton?: ButtonComponent;
    private deleteButton?: ButtonComponent;
    private renameButton?: ButtonComponent;
    private copyButton?: ButtonComponent;

    constructor(app: App, plugin: RadialTimelinePlugin, onSave: () => void) {
        super(app);
        this.plugin = plugin;
        this.onSave = onSave;
        
        // Clone templates to allow cancel without saving
        this.templates = JSON.parse(JSON.stringify(plugin.settings.aiContextTemplates || []));
        this.currentTemplateId = plugin.settings.activeAiContextTemplateId || 'generic-editor';
    }

    onOpen(): void {
        const { contentEl, titleEl } = this;
        titleEl.setText('AI Context Templates');

        // Info section
        const infoEl = contentEl.createDiv({ cls: 'rt-ai-context-info' });
        infoEl.setText('Define context for AI analysis. This text prepends all AI prompts for beats and gossamer analysis.');

        // Template selector section
        const selectorSection = contentEl.createDiv({ cls: 'rt-ai-context-selector-section' });
        
        const selectorLabel = selectorSection.createDiv({ cls: 'rt-ai-context-label' });
        selectorLabel.setText('Template:');
        
        const selectorRow = selectorSection.createDiv({ cls: 'rt-ai-context-selector-row' });
        
        // Dropdown for template selection
        this.dropdownComponent = new DropdownComponent(selectorRow);
        this.updateDropdownOptions();
        this.dropdownComponent.setValue(this.currentTemplateId);
        this.dropdownComponent.onChange((value) => {
            if (this.isDirty) {
                const discard = window.confirm('You have unsaved changes. Discard them?');
                if (!discard) {
                    // Revert dropdown to previous selection
                    this.dropdownComponent?.setValue(this.currentTemplateId);
                    return;
                }
                this.isDirty = false;
            }
            this.currentTemplateId = value;
            this.updateEditorSection();
        });
        
        // Template management buttons row
        const buttonRow = selectorSection.createDiv({ cls: 'rt-ai-context-button-row' });
        
        // New Template button
        new ButtonComponent(buttonRow)
            .setButtonText('New Template')
            .onClick(() => this.createNewTemplate());
        
        // Rename button
        this.renameButton = new ButtonComponent(buttonRow)
            .setButtonText('Rename')
            .onClick(() => this.renameTemplate());
        
        // Copy button (for built-in templates)
        this.copyButton = new ButtonComponent(buttonRow)
            .setButtonText('Create Copy')
            .onClick(() => this.copyTemplate());
        
        // Delete button
        this.deleteButton = new ButtonComponent(buttonRow)
            .setButtonText('Delete')
            .setWarning()
            .onClick(() => this.deleteTemplate());

        // Editor section
        const editorSection = contentEl.createDiv({ cls: 'rt-ai-context-editor-section' });
        
        const editorLabel = editorSection.createDiv({ cls: 'rt-ai-context-label' });
        editorLabel.setText('Prompt:');
        
        // Textarea for editing prompt
        this.textareaEl = editorSection.createEl('textarea', { cls: 'rt-ai-context-textarea' });
        this.textareaEl.placeholder = 'Enter your AI context prompt here...';
        
        // Track changes
        this.registerDomEvent(this.textareaEl, 'input', () => {
            const currentTemplate = this.getCurrentTemplate();
            if (currentTemplate && !currentTemplate.isBuiltIn) {
                this.isDirty = true;
                this.updateButtonStates();
            }
        });

        // Preview section
        const previewSection = contentEl.createDiv({ cls: 'rt-ai-context-preview-section' });
        const previewLabel = previewSection.createDiv({ cls: 'rt-ai-context-label' });
        previewLabel.setText('How it will appear:');
        const previewText = previewSection.createDiv({ cls: 'rt-ai-context-preview' });
        
        // Update preview on textarea changes
        this.registerDomEvent(this.textareaEl, 'input', () => {
            const prompt = this.textareaEl?.value.trim() || '';
            if (prompt) {
                previewText.textContent = `${prompt}\n\nBefore taking action, prepare an action plan.\n\n[Rest of AI prompt...]`;
            } else {
                previewText.textContent = '[No context set - will use default AI prompt]';
            }
        });

        // Action buttons
        const actionRow = contentEl.createDiv({ cls: 'rt-ai-context-actions' });
        
        // Save button
        this.saveButton = new ButtonComponent(actionRow)
            .setButtonText('Save Changes')
            .setCta()
            .onClick(() => this.saveChanges());
        
        // Set Active button
        new ButtonComponent(actionRow)
            .setButtonText('Set as Active & Close')
            .onClick(() => this.setActiveAndClose());
        
        // Close button
        new ButtonComponent(actionRow)
            .setButtonText('Cancel')
            .onClick(() => {
                if (this.isDirty) {
                    const discard = window.confirm('You have unsaved changes. Discard them?');
                    if (!discard) return;
                }
                this.close();
            });

        // Initialize editor state
        this.updateEditorSection();
        this.updateButtonStates();
    }

    private updateDropdownOptions(): void {
        if (!this.dropdownComponent) return;
        
        // Clear existing options
        this.dropdownComponent.selectEl.empty();
        
        // Add all templates
        this.templates.forEach(template => {
            const label = template.isBuiltIn ? `${template.name} (Built-in)` : template.name;
            this.dropdownComponent!.addOption(template.id, label);
        });
    }

    private getCurrentTemplate(): AiContextTemplate | undefined {
        return this.templates.find(t => t.id === this.currentTemplateId);
    }

    private updateEditorSection(): void {
        const currentTemplate = this.getCurrentTemplate();
        if (!currentTemplate) return;
        
        if (this.textareaEl) {
            this.textareaEl.value = currentTemplate.prompt;
            this.textareaEl.disabled = currentTemplate.isBuiltIn;
            
            // Update preview
            const previewText = this.contentEl.querySelector('.rt-ai-context-preview');
            if (previewText) {
                const prompt = currentTemplate.prompt.trim();
                if (prompt) {
                    previewText.textContent = `${prompt}\n\nBefore taking action, prepare an action plan.\n\n[Rest of AI prompt...]`;
                } else {
                    previewText.textContent = '[No context set - will use default AI prompt]';
                }
            }
        }
        
        this.isDirty = false;
        this.updateButtonStates();
    }

    private updateButtonStates(): void {
        const currentTemplate = this.getCurrentTemplate();
        if (!currentTemplate) return;
        
        const isBuiltIn = currentTemplate.isBuiltIn;
        
        // Save button only enabled for custom templates with changes
        if (this.saveButton) {
            this.saveButton.setDisabled(isBuiltIn || !this.isDirty);
        }
        
        // Delete and Rename only for custom templates
        if (this.deleteButton) {
            this.deleteButton.setDisabled(isBuiltIn);
        }
        if (this.renameButton) {
            this.renameButton.setDisabled(isBuiltIn);
        }
        
        // Copy button only visible/enabled for built-in templates
        if (this.copyButton) {
            this.copyButton.setDisabled(!isBuiltIn);
        }
    }

    private createNewTemplate(): void {
        const modal = new TextInputModal(
            this.app,
            'Enter template name',
            '',
            (name) => {
                // Generate unique ID
                const id = `custom-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
                
                // Create new template
                const newTemplate: AiContextTemplate = {
                    id,
                    name: name,
                    prompt: '',
                    isBuiltIn: false
                };
                
                this.templates.push(newTemplate);
                this.updateDropdownOptions();
                this.dropdownComponent?.setValue(id);
                this.currentTemplateId = id;
                this.updateEditorSection();
                
                new Notice(`Created template: ${name}`);
            }
        );
        modal.open();
    }

    private renameTemplate(): void {
        const currentTemplate = this.getCurrentTemplate();
        if (!currentTemplate || currentTemplate.isBuiltIn) return;
        
        const modal = new TextInputModal(
            this.app,
            'Enter new name',
            currentTemplate.name,
            (newName) => {
                currentTemplate.name = newName;
                this.updateDropdownOptions();
                this.dropdownComponent?.setValue(this.currentTemplateId);
                
                new Notice(`Renamed to: ${newName}`);
            }
        );
        modal.open();
    }

    private copyTemplate(): void {
        const currentTemplate = this.getCurrentTemplate();
        if (!currentTemplate) return;
        
        const modal = new TextInputModal(
            this.app,
            'Enter name for copy',
            `${currentTemplate.name} (Copy)`,
            (name) => {
                // Generate unique ID
                const id = `custom-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
                
                const newTemplate: AiContextTemplate = {
                    id,
                    name: name,
                    prompt: currentTemplate.prompt,
                    isBuiltIn: false
                };
                
                this.templates.push(newTemplate);
                this.updateDropdownOptions();
                this.dropdownComponent?.setValue(id);
                this.currentTemplateId = id;
                this.updateEditorSection();
                
                new Notice(`Created copy: ${name}`);
            }
        );
        modal.open();
    }

    private deleteTemplate(): void {
        const currentTemplate = this.getCurrentTemplate();
        if (!currentTemplate || currentTemplate.isBuiltIn) return;
        
        const confirmed = window.confirm(`Delete template "${currentTemplate.name}"? This cannot be undone.`);
        if (!confirmed) return;
        
        // Remove template
        this.templates = this.templates.filter(t => t.id !== this.currentTemplateId);
        
        // Switch to first available template
        if (this.templates.length > 0) {
            this.currentTemplateId = this.templates[0].id;
        } else {
            // Should never happen as built-in templates always exist
            this.currentTemplateId = 'generic-editor';
        }
        
        this.updateDropdownOptions();
        this.dropdownComponent?.setValue(this.currentTemplateId);
        this.updateEditorSection();
        
        new Notice(`Deleted template: ${currentTemplate.name}`);
    }

    private saveChanges(): void {
        const currentTemplate = this.getCurrentTemplate();
        if (!currentTemplate || currentTemplate.isBuiltIn) return;
        
        // Update prompt from textarea
        if (this.textareaEl) {
            currentTemplate.prompt = this.textareaEl.value;
        }
        
        this.isDirty = false;
        this.updateButtonStates();
        
        new Notice('Template saved');
    }

    private async setActiveAndClose(): Promise<void> {
        // Save any pending changes first
        if (this.isDirty) {
            this.saveChanges();
        }
        
        // Update plugin settings
        this.plugin.settings.aiContextTemplates = this.templates;
        this.plugin.settings.activeAiContextTemplateId = this.currentTemplateId;
        await this.plugin.saveSettings();
        
        const currentTemplate = this.getCurrentTemplate();
        new Notice(`Active template: ${currentTemplate?.name || 'Unknown'}`);
        
        // Call the onSave callback to refresh UI
        this.onSave();
        
        this.close();
    }
}

export default AiContextModal;

