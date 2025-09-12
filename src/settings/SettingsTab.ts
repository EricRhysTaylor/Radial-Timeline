import {
  App,
  PluginSettingTab,
  Setting as Settings,
  Component,
  MarkdownRenderer,
  Notice,
  TextComponent,
  ColorComponent,
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
                
                // Clear existing validation classes and show success feedback
                textInput.inputEl.removeClass('setting-input-error');
                textInput.inputEl.addClass('setting-input-success');
                setTimeout(() => {
                    textInput.inputEl.removeClass('setting-input-success');
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
            
            // Validate current path on load to show initial status
            if (this.plugin.settings.sourcePath?.trim()) {
                setTimeout(async () => {
                    const isValid = await this.plugin.validateAndRememberPath(this.plugin.settings.sourcePath);
                    if (isValid) {
                        text.inputEl.addClass('setting-input-success');
                        setTimeout(() => {
                            text.inputEl.removeClass('setting-input-success');
                        }, 2000); // Show success for longer on initial load
                    }
                }, 100); // Small delay to ensure DOM is ready
            }
            
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
                
                // Clear any existing validation classes
                text.inputEl.removeClass('setting-input-success');
                text.inputEl.removeClass('setting-input-error');
                
                // Validate and remember path when Enter is pressed or field loses focus
                if (value.trim()) {
                    const isValid = await this.plugin.validateAndRememberPath(value);
                    if (!isValid) {
                        // Show visual feedback for invalid paths
                        text.inputEl.addClass('setting-input-error');
                        setTimeout(() => {
                            text.inputEl.removeClass('setting-input-error');
                        }, 2000);
                    } else {
                        text.inputEl.addClass('setting-input-success');
                        setTimeout(() => {
                            text.inputEl.removeClass('setting-input-success');
                        }, 1000);
                    }
                } else {
                    // Empty path - no validation styling
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

        // --- Timeline outer ring content ---
        new Settings(containerEl)
            .setName('Outer ring shows all scenes')
            .setDesc('If enabled, the outer ring includes all scenes. Inner subplot rings remain unchanged.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.outerRingAllScenes || false)
                .onChange(async (value) => {
                    this.plugin.settings.outerRingAllScenes = value;
                    await this.plugin.saveSettings();
                }));

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

        // Divider before color sections
        containerEl.createEl('hr', { cls: 'settings-separator' });

        // --- Publishing Stage Colors (compact grid) --- 
        containerEl.createEl('h2', { text: 'Publishing stage colors'});
        containerEl.createEl('p', { cls: 'color-section-desc', text: 'Used for completed main plot scenes of the outermost ring. Affects other elements as well.' });
        const stageGrid = containerEl.createDiv({ cls: 'color-grid' });
        const stages = Object.entries(this.plugin.settings.publishStageColors);
        stages.forEach(([stage, color]) => {
            const cell = stageGrid.createDiv({ cls: 'color-grid-item' });
            const label = cell.createDiv({ cls: 'color-grid-label' });
            label.setText(stage);

            let textInputRef: TextComponent | undefined;
            let colorPickerRef: ColorComponent | undefined;
            const control = cell.createDiv({ cls: 'color-grid-controls' });
            // Add hidden Obsidian color input (used to open native picker)
            colorPickerRef = new ColorComponent(control)
                .setValue(color)
                .onChange(async (value) => {
                    if (this.isValidHex(value)) {
                        (this.plugin.settings.publishStageColors as Record<string, string>)[stage] = value;
                        await this.plugin.saveSettings();
                        this.plugin.setCSSColorVariables();
                        textInputRef?.setValue(value);
                    }
                });
            // Hide the native input and present a crisp trigger square
            const colorInput = control.querySelector('input[type="color"]:last-of-type') as HTMLInputElement | null;
            if (colorInput) colorInput.classList.add('hidden-color-input');
            const swatchEl = control.createDiv({ cls: `swatch-trigger stage-${stage}` });
            swatchEl.addEventListener('click', () => {
                colorInput?.click();
            });
            const setting = new Settings(control)
                .addText(textInput => {
                    textInputRef = textInput;
                    textInput.inputEl.classList.add('hex-input');
                    textInput.setValue(color)
                        .onChange(async (value) => {
                            if (this.isValidHex(value)) {
                                (this.plugin.settings.publishStageColors as Record<string, string>)[stage] = value;
                                await this.plugin.saveSettings();
                                this.plugin.setCSSColorVariables();
                                colorPickerRef?.setValue(value);
                            }
                        });
                })
                .addExtraButton(button => {
                    button.setIcon('reset')
                        .setTooltip('Reset to default')
                        .onClick(async () => {
                            const defaultColor = DEFAULT_SETTINGS.publishStageColors[stage as keyof typeof DEFAULT_SETTINGS.publishStageColors];
                            (this.plugin.settings.publishStageColors as Record<string, string>)[stage] = defaultColor;
                            await this.plugin.saveSettings();
                            this.plugin.setCSSColorVariables();
                            textInputRef?.setValue(defaultColor);
                            colorPickerRef?.setValue(defaultColor);
                        });
                });
        });

        // --- Subplot palette (15 colors) ---
        containerEl.createEl('h2', { text: 'Subplot ring colors'});
        containerEl.createEl('p', { cls: 'color-section-desc', text: 'Subplot ring colors used for rings 2 through 16 moving inward.' });
        const subplotGrid = containerEl.createDiv({ cls: 'color-grid' });
        const ensureArray = (arr: unknown): string[] => Array.isArray(arr) ? arr as string[] : [];
        const subplotColors = ensureArray(this.plugin.settings.subplotColors);
        for (let i = 0; i < 15; i++) {
            const labelText = `Ring ${i+2}`;
            const current = subplotColors[i] || DEFAULT_SETTINGS.subplotColors[i];
            const cell = subplotGrid.createDiv({ cls: 'color-grid-item' });
            const label = cell.createDiv({ cls: 'color-grid-label' });
            label.setText(labelText);

            const control = cell.createDiv({ cls: 'color-grid-controls' });
            let inputRef: TextComponent | undefined;
            let colorPickerRef: ColorComponent | undefined;
            colorPickerRef = new ColorComponent(control)
                .setValue(current)
                .onChange(async (value) => {
                    if (this.isValidHex(value)) {
                        const next = [...(this.plugin.settings.subplotColors || DEFAULT_SETTINGS.subplotColors)];
                        next[i] = value;
                        this.plugin.settings.subplotColors = next;
                        await this.plugin.saveSettings();
                        this.plugin.setCSSColorVariables();
                        inputRef?.setValue(value);
                    }
                });
            // Hide the native input and present a crisp trigger square
            const colorInput2 = control.querySelector('input[type="color"]:last-of-type') as HTMLInputElement | null;
            if (colorInput2) colorInput2.classList.add('hidden-color-input');
            const swatchEl2 = control.createDiv({ cls: `swatch-trigger subplot-${i}` });
            swatchEl2.addEventListener('click', () => {
                colorInput2?.click();
            });
            const setting = new Settings(control)
                .addText(text => {
                    inputRef = text;
                    text.inputEl.classList.add('hex-input');
                    text.setValue(current)
                        .onChange(async (value) => {
                            if (this.isValidHex(value)) {
                                const next = [...(this.plugin.settings.subplotColors || DEFAULT_SETTINGS.subplotColors)];
                                next[i] = value;
                                this.plugin.settings.subplotColors = next;
                                await this.plugin.saveSettings();
                                this.plugin.setCSSColorVariables();
                                colorPickerRef?.setValue(value);
                            }
                        });
                })
                .addExtraButton(button => {
                    button.setIcon('reset')
                        .setTooltip('Reset to default')
                        .onClick(async () => {
                            const value = DEFAULT_SETTINGS.subplotColors[i];
                            const next = [...(this.plugin.settings.subplotColors || DEFAULT_SETTINGS.subplotColors)];
                            next[i] = value;
                            this.plugin.settings.subplotColors = next;
                            await this.plugin.saveSettings();
                            this.plugin.setCSSColorVariables();
                            inputRef?.setValue(value);
                            colorPickerRef?.setValue(value);
                        });
                });
        }
                    
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