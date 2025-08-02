import {
  App,
  PluginSettingTab,
  Setting as Settings,
  Component,
  MarkdownRenderer,
  Notice,
  TextComponent,
} from 'obsidian';
import ManuscriptTimelinePlugin, { DEFAULT_SETTINGS } from '../main';

declare const EMBEDDED_README_CONTENT: string;

export class ManuscriptTimelineSettingsTab extends PluginSettingTab {
    plugin: ManuscriptTimelinePlugin;
    private readmeComponent: Component | null = null; // <<< ADD THIS LINE

    constructor(app: App, plugin: ManuscriptTimelinePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    // Method to show path suggestions
    private showPathSuggestions(currentValue: string, container: HTMLElement, textInput: TextComponent): void {
        const validPaths = this.plugin.settings.validFolderPaths;
        
        // Filter paths that match the current input
        const filteredPaths = validPaths.filter(path => 
            path.toLowerCase().includes(currentValue.toLowerCase()) || currentValue === ''
        );
        
        // Clear previous suggestions
        container.empty();
        
        if (filteredPaths.length === 0) {
            container.classList.add('hidden');
            return;
        }
        
        // Show suggestions
        container.classList.remove('hidden');
        
        filteredPaths.forEach(path => {
            const suggestionEl = container.createDiv({ cls: 'source-path-suggestion-item' });
            // Padding, cursor, and border handled by CSS class
            suggestionEl.textContent = path;
            
            // Hover effect handled by CSS :hover pseudo-class
            
            // Click to select
            suggestionEl.addEventListener('click', async () => {
                textInput.setValue(path);
                this.plugin.settings.sourcePath = path;
                await this.plugin.saveSettings();
                container.classList.add('hidden');
                
                // Show success feedback
                textInput.inputEl.style.borderColor = 'var(--text-success)';
                setTimeout(() => {
                    textInput.inputEl.style.borderColor = '';
                }, 1000);
                
                // Focus back to input and trigger change event
                textInput.inputEl.focus();
            });
        });
    }

    // Method to update the selected suggestion highlighting
    private updateSelectedSuggestion(suggestions: NodeListOf<Element>, selectedIndex: number): void {
        suggestions.forEach((suggestion, index) => {
            const el = suggestion as HTMLElement;
            if (index === selectedIndex) {
                el.classList.add('selected');
            } else {
                el.classList.remove('selected');
            }
        });
    }

    // Add color swatch creation function
    private createColorSwatch(container: HTMLElement, color: string, onColorChange: (newColor: string) => void): HTMLElement {
        const swatch = document.createElement('div');
        swatch.className = 'color-swatch';
        swatch.style.setProperty('--swatch-color', color);
        swatch.style.cursor = 'pointer';
        
        // Add click handler to open color picker
        swatch.addEventListener('click', async () => {
            const newColor = await this.showColorPicker(color);
            if (newColor) {
                swatch.style.setProperty('--swatch-color', newColor);
                onColorChange(newColor);
            }
        });
        
        container.appendChild(swatch);
        return swatch;
    }

    // Add color picker function with centered dialog
    private async showColorPicker(currentColor: string): Promise<string | null> {
        return new Promise((resolve) => {
            // Create a modal container
            const modal = document.createElement('div');
            modal.className = 'color-picker-modal';

            // Create the color picker container
            const pickerContainer = document.createElement('div');
            pickerContainer.className = 'color-picker-container';

            // Create the color picker input
            const colorPicker = document.createElement('input');
            colorPicker.type = 'color';
            colorPicker.value = currentColor;
            colorPicker.className = 'color-picker-input';

            // Create hex input
            const hexInput = document.createElement('input');
            hexInput.type = 'text';
            hexInput.value = currentColor;
            hexInput.className = 'color-picker-text-input';

            // Create RGB input
            const rgbInput = document.createElement('input');
            rgbInput.type = 'text';
            rgbInput.value = this.hexToRgb(currentColor);
            rgbInput.className = 'color-picker-text-input';

            // Create buttons container
            const buttonsContainer = document.createElement('div');
            buttonsContainer.className = 'color-picker-buttons';

            // Create OK button
            const okButton = document.createElement('button');
            okButton.textContent = 'OK';
            okButton.className = 'color-picker-button ok';

            // Create Cancel button
            const cancelButton = document.createElement('button');
            cancelButton.textContent = 'Cancel';
            cancelButton.className = 'color-picker-button cancel';



            // Update hex and RGB values when color changes
            colorPicker.addEventListener('input', (e) => {
                const newColor = (e.target as HTMLInputElement).value;
                hexInput.value = newColor;
                rgbInput.value = this.hexToRgb(newColor);
            });

            // Update color picker when hex input changes
            hexInput.addEventListener('input', (e) => {
                const newColor = (e.target as HTMLInputElement).value;
                if (this.isValidHex(newColor)) {
                    colorPicker.value = newColor;
                    rgbInput.value = this.hexToRgb(newColor);
                }
            });

            // Update color picker when RGB input changes
            rgbInput.addEventListener('input', (e) => {
                const newColor = (e.target as HTMLInputElement).value;
                const hex = this.rgbToHex(newColor);
                if (hex) {
                    colorPicker.value = hex;
                    hexInput.value = hex;
                }
            });

            // Add buttons to container
            buttonsContainer.appendChild(cancelButton);
            buttonsContainer.appendChild(okButton);

            // Add all elements to the picker container
            pickerContainer.appendChild(colorPicker);
            pickerContainer.appendChild(hexInput);
            pickerContainer.appendChild(rgbInput);
            pickerContainer.appendChild(buttonsContainer);

            // Add the picker container to the modal
            modal.appendChild(pickerContainer);

            // Add the modal to the document body
            document.body.appendChild(modal);

            // OK button event
            okButton.addEventListener('click', () => {
                document.body.removeChild(modal);
                resolve(colorPicker.value);
            });

            // Cancel button event
            cancelButton.addEventListener('click', () => {
                document.body.removeChild(modal);
                resolve(null);
            });

            // Close if clicking outside the picker
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    document.body.removeChild(modal);
                    resolve(null);
                }
            });
        });
    }

    // Helper function to convert hex to RGB
    private hexToRgb(hex: string): string {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (result) {
            return `rgb(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)})`;
        }
        return '';
    }

    // Helper function to convert RGB to hex
    private rgbToHex(rgb: string): string | null {
        const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
            if (match) {
            const r = parseInt(match[1]);
            const g = parseInt(match[2]);
            const b = parseInt(match[3]);
            return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
        }
        return null;
    }

    // Helper function to validate hex color
    private isValidHex(hex: string): boolean {
        return /^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(hex);
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();



        // --- Source Path with Autocomplete --- 
        const sourcePathSetting = new Settings(containerEl)
            .setName('Source path')
            .setDesc('Specify the root folder containing your manuscript scene files.');

        let textInput: TextComponent;
        let suggestionsContainer: HTMLElement;
        let selectedIndex = -1; // Move this outside the addText callback
        
        sourcePathSetting.addText(text => {
            textInput = text;
            text
                .setPlaceholder('Example: Manuscript/Scenes')
                .setValue(this.plugin.settings.sourcePath);
            
            // Create suggestions container
            const inputContainer = text.inputEl.parentElement!;
            inputContainer.classList.add('source-path-input-container'); // Make parent relative for absolute positioning
            
            suggestionsContainer = inputContainer.createDiv({ cls: 'source-path-suggestions' });
            suggestionsContainer.classList.add('hidden');
            // All positioning and styling handled by CSS classes
            
            // Input event for showing suggestions
            text.inputEl.addEventListener('input', () => {
                selectedIndex = -1; // Reset selection when typing
                this.showPathSuggestions(text.inputEl.value, suggestionsContainer, textInput);
            });
            
            // Focus event to show suggestions only if there are valid paths
            text.inputEl.addEventListener('focus', () => {
                selectedIndex = -1; // Reset selection on focus
                if (this.plugin.settings.validFolderPaths.length > 0) {
                    this.showPathSuggestions(text.inputEl.value, suggestionsContainer, textInput);
                }
            });
            
            // Blur event to hide suggestions after a short delay
            text.inputEl.addEventListener('blur', () => {
                setTimeout(() => {
                    if (!suggestionsContainer.matches(':hover')) {
                        suggestionsContainer.classList.add('hidden');
                        selectedIndex = -1;
                    }
                }, 150); // Small delay to allow clicking on suggestions
            });
            
            // Keyboard navigation support
            text.inputEl.addEventListener('keydown', (e) => {
                const suggestions = suggestionsContainer.querySelectorAll('.source-path-suggestion-item');
                
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    selectedIndex = Math.min(selectedIndex + 1, suggestions.length - 1);
                    this.updateSelectedSuggestion(suggestions, selectedIndex);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    selectedIndex = Math.max(selectedIndex - 1, -1);
                    this.updateSelectedSuggestion(suggestions, selectedIndex);
                } else if (e.key === 'Enter' && selectedIndex >= 0) {
                    e.preventDefault();
                    const selectedEl = suggestions[selectedIndex] as HTMLElement;
                    selectedEl.click();
                } else if (e.key === 'Escape') {
                    suggestionsContainer.classList.add('hidden');
                    selectedIndex = -1;
                }
            });
            
            // Click outside to hide suggestions
            document.addEventListener('click', (e) => {
                if (!text.inputEl.contains(e.target as Node) && !suggestionsContainer.contains(e.target as Node)) {
                    suggestionsContainer.classList.add('hidden');
                    selectedIndex = -1;
                }
            });
            
            // Handle value changes
            text.onChange(async (value) => {
                this.plugin.settings.sourcePath = value;
                await this.plugin.saveSettings();
                
                // Validate and remember path when Enter is pressed or field loses focus
                if (value.trim()) {
                    const isValid = await this.plugin.validateAndRememberPath(value);
                    if (!isValid) {
                        // Optional: Show visual feedback for invalid paths
                        text.inputEl.style.borderColor = 'var(--text-error)';
                        setTimeout(() => {
                            text.inputEl.style.borderColor = '';
                        }, 2000);
                    } else {
                        text.inputEl.style.borderColor = 'var(--text-success)';
                        setTimeout(() => {
                            text.inputEl.style.borderColor = '';
                        }, 1000);
                    }
                }
            });
        });

        // --- Target Completion Date --- 
        new Settings(containerEl)
            .setName('Target completion date')
            .setDesc('Optional: Set a target date for project completion (YYYY-MM-DD). This will be shown on the timeline.')
            .addText(text => {
                text.inputEl.type = 'date'; // Use HTML5 date input
                text.setValue(this.plugin.settings.targetCompletionDate || '')
                    .onChange(async (value) => {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);

                        if (!value) {
                            this.plugin.settings.targetCompletionDate = undefined;
                            text.inputEl.removeClass('setting-input-error');
                            await this.plugin.saveSettings();
                            return;
                        }

                        const selectedDate = new Date(value + 'T00:00:00');
                        if (selectedDate > today) {
                            this.plugin.settings.targetCompletionDate = value;
                            text.inputEl.removeClass('setting-input-error');
            } else {
                            new Notice('Target date must be in the future.');
                            text.setValue(this.plugin.settings.targetCompletionDate || '');
                            return;
                        }
                        await this.plugin.saveSettings();
                    });
            });

        // --- AI Settings for Beats Analysis ---
        containerEl.createEl('h2', { text: 'AI settings for beats analysis'});
        

        // --- Default AI Provider Setting ---
        new Settings(containerEl)
        .setName('Default AI provider')
        .setDesc('Select the default AI provider to use for AI features like Beat Analysis.')
        .addDropdown(dropdown => dropdown
            .addOption('openai', 'OpenAI (ChatGPT)')
            .addOption('anthropic', 'Anthropic (Claude)')
            .setValue(this.plugin.settings.defaultAiProvider || 'openai')
            .onChange(async (value) => {
                this.plugin.settings.defaultAiProvider = value as 'openai' | 'anthropic';
                await this.plugin.saveSettings();
            }));

        // --- OpenAI ChatGPT SECTION ---
        containerEl.createEl('h2', { text: 'OpenAI ChatGPT settings'});


        // --- OpenAI API Key Setting ---
        const openaiSetting = new Settings(containerEl)
            .setName('OpenAI API key')
            .setDesc('Your OpenAI API key for using ChatGPT AI features.')
            .addText(text => text
                .setPlaceholder('Enter your API key')
                .setValue(this.plugin.settings.openaiApiKey || '')
                .onChange(async (value) => {
                    this.plugin.settings.openaiApiKey = value.trim();
                    await this.plugin.saveSettings();
                }));
                

        // --- OpenAI Model Selection ---
        const modelSetting = new Settings(containerEl)
            .setName('OpenAI model')
            .setDesc('Choose the ChatGPT model to use.')
            .addDropdown(dropdown => {
                const options: { id: string; label: string }[] = [
                    { id: 'gpt-4o', label: 'gpt-4o' },
                    { id: 'o3', label: 'o3' },
                ];
                options.forEach(opt => dropdown.addOption(opt.id, opt.label));
                dropdown.setValue(this.plugin.settings.openaiModelId || 'gpt-4o');
                dropdown.onChange(async value => {
                    this.plugin.settings.openaiModelId = value;
                    await this.plugin.saveSettings();
                });
            });

        // --- Anthropic Claude SECTION ---
        containerEl.createEl('h2', { text: 'Anthropic Claude settings'});

        
        // --- Anthropic API Key Setting ---
        const anthropicSetting = new Settings(containerEl)
            .setName('Anthropic API key')
            .setDesc('Your Anthropic API key for using Claude AI features.')
            .addText(text => text
                .setPlaceholder('Enter your Anthropic API key')
                .setValue(this.plugin.settings.anthropicApiKey || '')
                .onChange(async (value) => {
                    this.plugin.settings.anthropicApiKey = value.trim();
                    await this.plugin.saveSettings();
                }));

        // --- Anthropic Model Selection ---
        new Settings(containerEl)
            .setName('Anthropic model')
            .setDesc('Choose the Claude model to use.')
            .addDropdown(dropdown => {
                const options: { id: string; label: string }[] = [
                    { id: 'claude-sonnet-4-0', label: 'claude-sonnet-4-0' },
                    { id: 'claude-opus-4-0', label: 'claude-opus-4-0' },
                ];
                options.forEach(opt => dropdown.addOption(opt.id, opt.label));
                dropdown.setValue(this.plugin.settings.anthropicModelId || 'claude-sonnet-4-0');
                dropdown.onChange(async value => {
                    this.plugin.settings.anthropicModelId = value;
                    await this.plugin.saveSettings();
                });
            });

        // <<< ADD THIS Setting block for API Logging Toggle >>>
        new Settings(containerEl)
            .setName('Log AI interactions to file')
            .setDesc('If enabled, create a new note in the "AI" folder for each AI API request/response.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.logApiInteractions)
                .onChange(async (value) => {
                    this.plugin.settings.logApiInteractions = value;
                    await this.plugin.saveSettings();
                }));
        // <<< END of added Setting block >>>

        // --- Debug Mode Setting ---
        new Settings(containerEl)
            .setName('Debug mode')
            .setDesc('Enable debug logging to the console for troubleshooting.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.debug)
                .onChange(async (value) => {
                    this.plugin.settings.debug = value;
                    await this.plugin.saveSettings();
                }));

        // --- Publishing Stage Colors --- 
        containerEl.createEl('h2', { text: 'Publishing stage colors'}); // <<< CHANGED to H3, REMOVED CLASS

        Object.entries(this.plugin.settings.publishStageColors).forEach(([stage, color]) => {
            let textInputRef: TextComponent | undefined;
            const setting = new Settings(containerEl)
                .setName(stage)
                .addText(textInput => {
                    textInputRef = textInput;
                    textInput.setValue(color)
                        .onChange(async (value) => {
                            if (this.isValidHex(value)) {
                                (this.plugin.settings.publishStageColors as Record<string, string>)[stage] = value;
                                await this.plugin.saveSettings();
                                const swatch = setting.controlEl.querySelector('.color-swatch') as HTMLElement;
                                if (swatch) {
                                    swatch.style.setProperty('--swatch-color', value);
                                }
                            } // Consider adding feedback for invalid hex
                        });
                })
                .addExtraButton(button => {
                    button.setIcon('reset')
                        .setTooltip('Reset to default')
                        .onClick(async () => {
                            const defaultColor = DEFAULT_SETTINGS.publishStageColors[stage as keyof typeof DEFAULT_SETTINGS.publishStageColors];
                            (this.plugin.settings.publishStageColors as Record<string, string>)[stage] = defaultColor;
                            await this.plugin.saveSettings();
                            textInputRef?.setValue(defaultColor);
                            const swatch = setting.controlEl.querySelector('.color-swatch') as HTMLElement;
                            if (swatch) {
                                swatch.style.setProperty('--swatch-color', defaultColor);
                            }
                        });
                });

            // Add color swatch inside the control element for better alignment
            this.createColorSwatch(setting.controlEl, color, async (newColor: string) => {
                // Update settings
                (this.plugin.settings.publishStageColors as Record<string, string>)[stage] = newColor;
                await this.plugin.saveSettings();
                // Update text input
                textInputRef?.setValue(newColor);
            });
        });
                    
        // --- Embedded README Section ---
        containerEl.createEl('hr', { cls: 'settings-separator' });
        const readmeContainer = containerEl.createDiv({ cls: 'manuscript-readme-container' });
        const readmeMarkdown = typeof EMBEDDED_README_CONTENT !== 'undefined'
            ? EMBEDDED_README_CONTENT
            : 'README content could not be loaded. Please ensure the plugin was built correctly or view the README.md file directly.';
           
        // Create a new component instance specifically for this rendering
        this.readmeComponent = new Component(); 


        // Use the managed component for the renderer
        // Note: Switching back to MarkdownRenderer.render as renderMarkdown was part of the error path
        MarkdownRenderer.render( // <<< Using render, not renderMarkdown
            this.app,           // <<< Pass app instance
            readmeMarkdown,
            readmeContainer, // Render directly into the container created above
            this.plugin.manifest.dir ?? '', 
            this.readmeComponent // Pass the managed component instance
        );
    }

    hide() {
        // Clean up the component when the tab is hidden/closed
        if (this.readmeComponent) {
            this.readmeComponent.unload(); // <<< CALL unload() on the component itself
            this.readmeComponent = null;
        }
        // If PluginSettingTab has a base hide method you need to call, uncomment below
        // super.hide(); 
    }

}