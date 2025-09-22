import {
  App,
  PluginSettingTab,
  Setting as Settings,
  Component,
  MarkdownRenderer,
  Notice,
  TextComponent,
  ColorComponent,
  AbstractInputSuggest,
  TFolder,
} from 'obsidian';
import { fetchAnthropicModels } from '../api/anthropicApi';
import { fetchOpenAiModels } from '../api/openaiApi';
import { fetchGeminiModels } from '../api/geminiApi';
import RadialTimelinePlugin, { DEFAULT_SETTINGS } from '../main';

declare const EMBEDDED_README_CONTENT: string;

export class RadialTimelineSettingsTab extends PluginSettingTab {
    plugin: RadialTimelinePlugin;
    private readmeComponent: Component | null = null; // <<< ADD THIS LINE
    private _providerSections: { anthropic?: HTMLElement; gemini?: HTMLElement; openai?: HTMLElement } = {};
    private _keyValidateTimers: Partial<Record<'anthropic'|'gemini'|'openai', number>> = {};
    private _anthropicKeyInput?: HTMLInputElement;
    private _geminiKeyInput?: HTMLInputElement;
    private _openaiKeyInput?: HTMLInputElement;

    constructor(app: App, plugin: RadialTimelinePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    // Folder suggest implementation using Obsidian's AbstractInputSuggest
    private attachFolderSuggest(text: TextComponent) {
        const plugin = this.plugin;
        const inputEl = text.inputEl;
        class FolderSuggest extends AbstractInputSuggest<TFolder> {
            constructor(app: App, input: HTMLInputElement) {
                super(app, input);
            }
            getSuggestions(query: string): TFolder[] {
                const q = query?.toLowerCase() ?? '';
                // Gather all folders in the vault
                const files = this.app.vault.getAllLoadedFiles();
                const folders = files.filter((f): f is TFolder => f instanceof TFolder);
                if (!q) return folders;
                return folders.filter(f => f.path.toLowerCase().includes(q));
            }
            renderSuggestion(folder: TFolder, el: HTMLElement): void {
                el.setText(folder.path);
            }
            selectSuggestion(folder: TFolder, _evt: MouseEvent | KeyboardEvent): void {
                // Best-effort: update both the TextComponent and the raw input element
                try { text.setValue(folder.path); } catch {}
                if ((this as any).inputEl) {
                    try { (this as any).inputEl.value = folder.path; } catch {}
                }

                // Persist + validate
                plugin.settings.sourcePath = folder.path;
                void plugin.saveSettings();
                void plugin.validateAndRememberPath(folder.path).then((ok) => {
                    if (ok) {
                        inputEl.removeClass('setting-input-error');
                        inputEl.addClass('setting-input-success');
                        window.setTimeout(() => inputEl.removeClass('setting-input-success'), 1000);
                    } else {
                        inputEl.addClass('setting-input-error');
                        window.setTimeout(() => inputEl.removeClass('setting-input-error'), 2000);
                    }
                });
                // Close suggestions and focus input
                try { this.close(); } catch {}
                try { inputEl.focus(); } catch {}
            }
        }
        new FolderSuggest(this.app, inputEl);
    }

    // Dims non-selected provider sections based on chosen model/provider
    private refreshProviderDimming() {
        const selected = (this.plugin.settings.defaultAiProvider || 'openai') as 'anthropic' | 'gemini' | 'openai';
        const map = this._providerSections;
        (['anthropic','gemini','openai'] as const).forEach(key => {
            const el = map[key];
            if (!el) return;
            if (key === selected) el.classList.remove('dimmed');
            else el.classList.add('dimmed');
        });
    }

    // Debounced API key validation using zero-cost model list endpoints
    private scheduleKeyValidation(provider: 'anthropic'|'gemini'|'openai') {
        // Clear prior timer
        const prior = this._keyValidateTimers[provider];
        if (prior) window.clearTimeout(prior);
        const inputEl = provider === 'anthropic' ? this._anthropicKeyInput
                        : provider === 'gemini' ? this._geminiKeyInput
                        : this._openaiKeyInput;
        if (!inputEl) return;

        const key = inputEl.value?.trim();
        if (!key) return; // nothing to validate

        // Quick heuristic: avoid spamming empty/very short inputs
        if (key.length < 8) return;

        this._keyValidateTimers[provider] = window.setTimeout(async () => {
            // Remove any old classes
            inputEl.removeClass('setting-input-success');
            inputEl.removeClass('setting-input-error');

            try {
                if (provider === 'anthropic') {
                    await fetchAnthropicModels(key);
                } else if (provider === 'gemini') {
                    await fetchGeminiModels(key);
                } else {
                    await fetchOpenAiModels(key);
                }
                // Success highlight briefly
                inputEl.addClass('setting-input-success');
                window.setTimeout(() => inputEl.removeClass('setting-input-success'), 1200);
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                // Only mark invalid on explicit unauthorized cues; otherwise stay neutral
                if (/401|unauthorized|invalid/i.test(msg)) {
                    inputEl.addClass('setting-input-error');
                    window.setTimeout(() => inputEl.removeClass('setting-input-error'), 1400);
                }
            }
        }, 800);
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
        
        sourcePathSetting.addText(text => {
            textInput = text;
            text
                .setPlaceholder('Example: Manuscript/Scenes')
                .setValue(this.plugin.settings.sourcePath);
            // Attach Obsidian native suggest to this input
            this.attachFolderSuggest(text);

            // Validate current path on load to show initial status
            if (this.plugin.settings.sourcePath?.trim()) {
                setTimeout(async () => {
                    const isValid = await this.plugin.validateAndRememberPath(this.plugin.settings.sourcePath);
                    if (isValid) {
                        text.inputEl.addClass('setting-input-success');
                        setTimeout(() => {
                            text.inputEl.removeClass('setting-input-success');
                        }, 2000);
                    }
                }, 100);
            }

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

        // --- Timeline outer ring content ---
        new Settings(containerEl)
            .setName('Outer ring shows all scenes and plot beats')
            .setDesc('If enabled, the outer ring shows ordered scenes from all subplots with their own colors. Plot Beats slices (gray) with full titles are shown on the outer ring.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.outerRingAllScenes || false)
                .onChange(async (value) => {
                    this.plugin.settings.outerRingAllScenes = value;
                    await this.plugin.saveSettings();
                }));

        // --- AI for Beats Analysis ---
        new Settings(containerEl)
            .setName('AI for beats analysis')
            .setHeading();
        
        // Enable/disable AI beats features
        new Settings(containerEl)
            .setName('Enable AI beats')
            .setDesc('Show AI beat colors and beats sections in hover synopsis. When off, these visuals are hidden, but scene metadata remains unchanged.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableAiBeats ?? true)
                .onChange(async (value) => {
                    this.plugin.settings.enableAiBeats = value;
                    await this.plugin.saveSettings();
                    // Refresh timeline(s) to apply visibility changes
                    this.plugin.refreshTimelineIfNeeded(null);
                }));

        // --- Single model picker ---
        new Settings(containerEl)
            .setName('Model')
            .setDesc('Pick the model you prefer for writing tasks.')
            .addDropdown(dropdown => {
                type ModelChoice = { id: string; label: string; provider: 'anthropic' | 'gemini' | 'openai'; model: string };
                const choices: ModelChoice[] = [
                    { id: 'anthropic:claude-opus-4-1', label: 'Anthropic — Claude Opus 4.1', provider: 'anthropic', model: 'claude-opus-4-1@20250805' },
                    { id: 'anthropic:claude-sonnet-4-1', label: 'Anthropic — Claude Sonnet 4.1', provider: 'anthropic', model: 'claude-sonnet-4-1@20250805' },
                    { id: 'gemini:gemini-2.5-pro', label: 'Gemini — Gemini 2.5 Pro', provider: 'gemini', model: 'gemini-2.5-pro' },
                    { id: 'openai:gpt-4.1', label: 'OpenAI — GPT‑4.1', provider: 'openai', model: 'gpt-4.1' },
                ];
                choices.forEach(opt => dropdown.addOption(opt.id, opt.label));

                // Determine current selection from settings
                const currentProvider = (this.plugin.settings.defaultAiProvider || 'openai') as 'anthropic' | 'gemini' | 'openai';
                let currentId: string | undefined;
                if (currentProvider === 'anthropic') {
                    const id = this.plugin.settings.anthropicModelId;
                    currentId = choices.find(c => c.provider === 'anthropic' && c.model === id)?.id;
                    if (!currentId) currentId = 'anthropic:claude-sonnet-4-1';
                } else if (currentProvider === 'gemini') {
                    const id = this.plugin.settings.geminiModelId;
                    currentId = choices.find(c => c.provider === 'gemini' && c.model === id)?.id;
                    if (!currentId) currentId = 'gemini:gemini-2.5-pro';
                } else {
                    const id = this.plugin.settings.openaiModelId;
                    currentId = choices.find(c => c.provider === 'openai' && c.model === id)?.id;
                    if (!currentId) currentId = 'openai:gpt-4.1';
                }
                dropdown.setValue(currentId);

                dropdown.onChange(async value => {
                    const choice = choices.find(c => c.id === value);
                    if (!choice) return;
                    // Set provider + provider-specific model id
                    this.plugin.settings.defaultAiProvider = choice.provider;
                    if (choice.provider === 'anthropic') this.plugin.settings.anthropicModelId = choice.model;
                    if (choice.provider === 'gemini') this.plugin.settings.geminiModelId = choice.model;
                    if (choice.provider === 'openai') this.plugin.settings.openaiModelId = choice.model;
                    await this.plugin.saveSettings();
                    // Update provider section dimming based on selection
                    this.refreshProviderDimming();
                });
                (dropdown as any).selectEl?.classList.add('rt-setting-dropdown', 'rt-provider-dropdown');
            });

        // Provider sections (for dimming)
        const anthropicSection = containerEl.createDiv({ cls: 'rt-provider-section rt-provider-anthropic' });
        const geminiSection = containerEl.createDiv({ cls: 'rt-provider-section rt-provider-gemini' });
        const openaiSection = containerEl.createDiv({ cls: 'rt-provider-section rt-provider-openai' });

        // Keep refs for dimming updates
        this._providerSections = { anthropic: anthropicSection, gemini: geminiSection, openai: openaiSection };

        // Anthropic API Key
        new Settings(anthropicSection)
            .setName('Anthropic API key')
            .setDesc(() => {
                const frag = document.createDocumentFragment();
                const span = document.createElement('span');
                span.textContent = 'Your Anthropic API key for using Claude AI features. ';
                const link = document.createElement('a');
                link.href = 'https://platform.claude.com';
                link.textContent = 'Get key';
                link.target = '_blank';
                link.rel = 'noopener';
                frag.appendChild(span);
                frag.appendChild(link);
                return frag;
            })
            .addText(text => text
                .setPlaceholder('Enter your Anthropic API key')
                .setValue(this.plugin.settings.anthropicApiKey || '')
                .onChange(async (value) => {
                    this.plugin.settings.anthropicApiKey = value.trim();
                    await this.plugin.saveSettings();
                    this._anthropicKeyInput = text.inputEl; // track ref
                    this.scheduleKeyValidation('anthropic');
                }));

        // Removed individual model dropdowns in favor of single picker

        // Gemini API Key
        new Settings(geminiSection)
            .setName('Gemini API key')
            .setDesc(() => {
                const frag = document.createDocumentFragment();
                const span = document.createElement('span');
                span.textContent = 'Your Gemini API key for using Google’s Gemini models. ';
                const link = document.createElement('a');
                link.href = 'https://aistudio.google.com';
                link.textContent = 'Get key';
                link.target = '_blank';
                link.rel = 'noopener';
                frag.appendChild(span);
                frag.appendChild(link);
                return frag;
            })
            .addText(text => text
                .setPlaceholder('Enter your Gemini API key')
                .setValue(this.plugin.settings.geminiApiKey || '')
                .onChange(async (value) => {
                    this.plugin.settings.geminiApiKey = value.trim();
                    await this.plugin.saveSettings();
                    this._geminiKeyInput = text.inputEl;
                    this.scheduleKeyValidation('gemini');
                }));

        // (model picker above)

        // OpenAI API Key
        new Settings(openaiSection)
            .setName('OpenAI API key')
            .setDesc(() => {
                const frag = document.createDocumentFragment();
                const span = document.createElement('span');
                span.textContent = 'Your OpenAI API key for using ChatGPT AI features. ';
                const link = document.createElement('a');
                link.href = 'https://platform.openai.com';
                link.textContent = 'Get key';
                link.target = '_blank';
                link.rel = 'noopener';
                frag.appendChild(span);
                frag.appendChild(link);
                return frag;
            })
            .addText(text => text
                .setPlaceholder('Enter your API key')
                .setValue(this.plugin.settings.openaiApiKey || '')
                .onChange(async (value) => {
                    this.plugin.settings.openaiApiKey = value.trim();
                    await this.plugin.saveSettings();
                    this._openaiKeyInput = text.inputEl;
                    this.scheduleKeyValidation('openai');
                }));

        // (model picker above)

        // Apply provider dimming on first render
        this.refreshProviderDimming();

        // Kick off passive validation if values already present
        if (this.plugin.settings.anthropicApiKey?.trim()) {
            this._anthropicKeyInput = anthropicSection.querySelector('input[type="text"], input[type="password"], input') as HTMLInputElement | undefined;
            this.scheduleKeyValidation('anthropic');
        }
        if (this.plugin.settings.geminiApiKey?.trim()) {
            this._geminiKeyInput = geminiSection.querySelector('input[type="text"], input[type="password"], input') as HTMLInputElement | undefined;
            this.scheduleKeyValidation('gemini');
        }
        if (this.plugin.settings.openaiApiKey?.trim()) {
            this._openaiKeyInput = openaiSection.querySelector('input[type="text"], input[type="password"], input') as HTMLInputElement | undefined;
            this.scheduleKeyValidation('openai');
        }

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

        // Divider before color sections
        containerEl.createEl('hr', { cls: 'settings-separator' });

        // --- Publishing Stage Colors (compact grid) --- 
        new Settings(containerEl)
            .setName('Publishing stage colors')
            .setHeading();
        containerEl.createEl('p', { cls: 'color-section-desc', text: 'Used for completed main plot scenes of the outermost ring. Affects other elements as well.' });
        const stageGrid = containerEl.createDiv({ cls: 'rt-color-grid' });
        const stages = Object.entries(this.plugin.settings.publishStageColors);
        stages.forEach(([stage, color]) => {
            const cell = stageGrid.createDiv({ cls: 'rt-color-grid-item' });
            const label = cell.createDiv({ cls: 'rt-color-grid-label' });
            label.setText(stage);

            let textInputRef: TextComponent | undefined;
            let colorPickerRef: ColorComponent | undefined;
            const control = cell.createDiv({ cls: 'rt-color-grid-controls' });
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
            if (colorInput) colorInput.classList.add('rt-hidden-color-input');
            const swatchEl = control.createDiv({ cls: `rt-swatch-trigger rt-stage-${stage}` });
            swatchEl.addEventListener('click', () => {
                colorInput?.click();
            });
            const setting = new Settings(control)
                .addText(textInput => {
                    textInputRef = textInput;
                    textInput.inputEl.classList.add('rt-hex-input');
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
        new Settings(containerEl)
            .setName('Subplot ring colors')
            .setHeading();
        containerEl.createEl('p', { cls: 'color-section-desc', text: 'Subplot ring colors used for rings 1 through 16 moving inward.' });
        const subplotGrid = containerEl.createDiv({ cls: 'rt-color-grid' });
        const ensureArray = (arr: unknown): string[] => Array.isArray(arr) ? arr as string[] : [];
        const subplotColors = ensureArray(this.plugin.settings.subplotColors);
        for (let i = 0; i < 16; i++) {
            const labelText = `Ring ${i+1}`;
            const current = subplotColors[i] || DEFAULT_SETTINGS.subplotColors[i];
            const cell = subplotGrid.createDiv({ cls: 'rt-color-grid-item' });
            const label = cell.createDiv({ cls: 'rt-color-grid-label' });
            label.setText(labelText);

            const control = cell.createDiv({ cls: 'rt-color-grid-controls' });
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
            if (colorInput2) colorInput2.classList.add('rt-hidden-color-input');
            const swatchEl2 = control.createDiv({ cls: `rt-swatch-trigger rt-subplot-${i}` });
            swatchEl2.addEventListener('click', () => {
                colorInput2?.click();
            });
            const setting = new Settings(control)
                .addText(text => {
                    inputRef = text;
                    text.inputEl.classList.add('rt-hex-input');
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
