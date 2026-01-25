import { App, Modal, ButtonComponent, DropdownComponent, TextComponent, Notice } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { AiContextTemplate } from '../types/settings';

/**
 * Simple text input modal to replace prompt()
 */
class TextInputModal extends Modal {
    private result: string | null = null;
    private readonly title: string;
    private readonly defaultValue: string;
    private readonly onSubmit: (result: string) => void;
    private inputEl?: HTMLInputElement;

    constructor(app: App, title: string, defaultValue: string, onSubmit: (result: string) => void) {
        super(app);
        this.title = title;
        this.defaultValue = defaultValue;
        this.onSubmit = onSubmit;
    }

    onOpen(): void {
        const { contentEl, titleEl, modalEl } = this;
        titleEl.setText('');
        
        if (modalEl) {
            modalEl.classList.add('ert-ui', 'ert-modal-shell');
            modalEl.style.width = '480px'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxWidth = '92vw'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
        }
        contentEl.addClass('ert-modal-container');
        contentEl.addClass('ert-modal--textInput');

        // Header
        const header = contentEl.createDiv({ cls: 'ert-modal-header' });
        header.createDiv({ cls: 'ert-modal-title', text: this.title });

        // Input field in a container
        const inputContainer = contentEl.createDiv({ cls: 'ert-search-input-container' });
        this.inputEl = inputContainer.createEl('input', {
            type: 'text',
            value: this.defaultValue,
            cls: 'ert-input ert-input--full'
        });

        // Focus and select all
        window.setTimeout(() => {
            this.inputEl?.focus();
            this.inputEl?.select();
        }, 10);

        // Handle Enter key - using arrow function to maintain 'this' context
        const handleKeydown = (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.submit(this.inputEl?.value || '');
            } else if (e.key === 'Escape') {
                this.close();
            }
        };
        // Note: Modal classes don't have registerDomEvent, use addEventListener instead
        // Cleanup handled in onClose()
        this.inputEl.addEventListener('keydown', handleKeydown);

        // Store handler reference for cleanup
        (this as any)._keydownHandler = handleKeydown;

        // Buttons
        const buttonRow = contentEl.createDiv({ cls: 'ert-modal-actions' });

        new ButtonComponent(buttonRow)
            .setButtonText('OK')
            .setCta()
            .onClick(() => this.submit(this.inputEl?.value || ''));

        new ButtonComponent(buttonRow)
            .setButtonText('Cancel')
            .onClick(() => this.close());
    }

    onClose(): void {
        // Clean up event listeners to prevent memory leaks
        if (this.inputEl && (this as any)._keydownHandler) {
            this.inputEl.removeEventListener('keydown', (this as any)._keydownHandler);
        }
    }

    private submit(value: string): void {
        const trimmedValue = value.trim();
        if (trimmedValue) {
            this.onSubmit(trimmedValue);
            this.close();
        } else {
            new Notice('Please enter a template name');
        }
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
        this.currentTemplateId = plugin.settings.activeAiContextTemplateId || 'commercial_genre';
    }

    onOpen(): void {
        const { contentEl, titleEl, modalEl } = this;
        // Use generic modal base + AI Context specific styling
        if (modalEl) {
            modalEl.classList.add('ert-ui', 'ert-modal-shell');
            modalEl.style.width = '660px'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxWidth = '92vw'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxHeight = '92vh'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
        }
        titleEl.setText('');
        contentEl.addClass('ert-modal-container', 'ert-modal--aiContext', 'ert-stack');

        const hero = contentEl.createDiv({ cls: 'ert-modal-header' });
        hero.createDiv({ cls: 'ert-modal-title', text: 'AI context templates' });
        hero.createDiv({
            cls: 'ert-modal-subtitle',
            text: 'Define context prepended to AI prompts and Gossamer scoring.'
        });

        // Info section
        const infoEl = contentEl.createDiv({ cls: 'ert-field-note ert-ai-context-info' });
        infoEl.setText('Define context for AI LLM analysis and Gossamer score generation. This text prepends all prompts sent to LLM to establish role and context and is used for the copy template button to generate Gossamer scores.');

        // Template selector row
        const selectorRow = contentEl.createDiv({ cls: 'ert-row' });
        selectorRow.createDiv({ cls: 'ert-label', text: 'Template' });
        const selectorControl = selectorRow.createDiv({ cls: 'ert-control' });
        const selectorInputRow = selectorControl.createDiv({ cls: 'ert-ai-context-selector-row' });
        
        // Dropdown for template selection
        this.dropdownComponent = new DropdownComponent(selectorInputRow);
        this.dropdownComponent.selectEl.addClass('ert-input');
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
        const buttonRow = selectorControl.createDiv({ cls: 'ert-ai-context-button-row' });
        
        // New Template button
        new ButtonComponent(buttonRow)
            .setButtonText('New template')
            .onClick(() => this.createNewTemplate());
        
        // Rename button
        this.renameButton = new ButtonComponent(buttonRow)
            .setButtonText('Rename')
            .onClick(() => this.renameTemplate());
        
        // Copy button (for built-in templates)
        this.copyButton = new ButtonComponent(buttonRow)
            .setButtonText('Create copy')
            .onClick(() => this.copyTemplate());
        
        // Delete button
        this.deleteButton = new ButtonComponent(buttonRow)
            .setButtonText('Delete')
            .setWarning()
            .onClick(() => this.deleteTemplate());

        // Editor row
        const editorRow = contentEl.createDiv({ cls: 'ert-row' });
        editorRow.createDiv({ cls: 'ert-label', text: 'Prompt' });
        const editorControl = editorRow.createDiv({ cls: 'ert-control' });

        // Textarea for editing prompt
        this.textareaEl = editorControl.createEl('textarea', { cls: 'ert-textarea ert-ai-context-textarea' });
        this.textareaEl.placeholder = 'Enter your AI context prompt here...';
        
        // Track changes
        const handleInput = () => {
            const currentTemplate = this.getCurrentTemplate();
            if (currentTemplate && !currentTemplate.isBuiltIn) {
                this.isDirty = true;
                this.updateButtonStates();
            }
        };
        // Note: Modal classes don't have registerDomEvent, use addEventListener instead
        // Cleanup handled in onClose()
        this.textareaEl.addEventListener('input', handleInput);
        
        // Store handler reference for cleanup
        (this as any)._inputHandler = handleInput;

        // Action buttons
        const actionRow = contentEl.createDiv({ cls: 'ert-modal-actions' });
        
        // Save button
        this.saveButton = new ButtonComponent(actionRow)
            .setButtonText('Save changes')
            .setCta()
            .onClick(() => this.saveChanges());
        
        // Set Active button
        new ButtonComponent(actionRow)
            .setButtonText('Set as active & close')
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

    onClose(): void {
        // Clean up event listeners to prevent memory leaks
        if (this.textareaEl && (this as any)._inputHandler) {
            this.textareaEl.removeEventListener('input', (this as any)._inputHandler);
        }
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
        // Get current template's prompt to use as starting point
        const currentTemplate = this.getCurrentTemplate();
        const basePrompt = currentTemplate?.prompt || '';
        
        const modal = new TextInputModal(
            this.app,
            'Enter template name',
            '',
            (name) => {
                // Generate unique ID
                const id = `custom-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
                
                // Create new template with current template's prompt as starting point
                const newTemplate: AiContextTemplate = {
                    id,
                    name: name,
                    prompt: basePrompt,
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
            // Fallback (should not occur with built-ins present)
            this.currentTemplateId = 'commercial_genre';
        }
        
        this.updateDropdownOptions();
        this.dropdownComponent?.setValue(this.currentTemplateId);
        this.updateEditorSection();
        
        new Notice(`Deleted template: ${currentTemplate.name}`);
    }

    private saveChanges(): void {
        const currentTemplate = this.getCurrentTemplate();
        if (!currentTemplate || currentTemplate.isBuiltIn) return;
        
        if (this.textareaEl) {
            currentTemplate.prompt = this.textareaEl.value;
        }
        
        this.isDirty = false;
        this.updateButtonStates();
        
        new Notice('Template saved');
    }

    private async setActiveAndClose(): Promise<void> {
        if (this.isDirty) {
            this.saveChanges();
        }
        
        this.plugin.settings.aiContextTemplates = this.templates;
        this.plugin.settings.activeAiContextTemplateId = this.currentTemplateId;
        await this.plugin.saveSettings();
        
        const currentTemplate = this.getCurrentTemplate();
        new Notice(`Active template: ${currentTemplate?.name || 'Unknown'}`);
        
        this.onSave();
        this.close();
    }
}

export default AiContextModal;
