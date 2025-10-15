/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */
import {
  App,
  PluginSettingTab,
  Setting as Settings,
  Component,
  MarkdownRenderer,
  Notice,
  TextComponent,
  ColorComponent,
  TFolder,
  normalizePath,
} from 'obsidian';
import { FolderSuggest } from './FolderSuggest';
import { AiContextModal } from './AiContextModal';
import { fetchAnthropicModels } from '../api/anthropicApi';
import { fetchOpenAiModels } from '../api/openaiApi';
import { fetchGeminiModels } from '../api/geminiApi';
import RadialTimelinePlugin, { DEFAULT_SETTINGS } from '../main';
import { CreatePlotTemplatesModal } from '../view/CreatePlotTemplatesModal';
import { getPlotSystem } from '../utils/plotSystems';
import { createPlotTemplateNotes } from '../utils/plotTemplates';

declare const EMBEDDED_README_CONTENT: string;

export class RadialTimelineSettingsTab extends PluginSettingTab {
    plugin: RadialTimelinePlugin;
    private readmeComponent: Component | null = null; // <<< ADD THIS LINE
    private _providerSections: { anthropic?: HTMLElement; gemini?: HTMLElement; openai?: HTMLElement } = {};
    private _keyValidateTimers: Partial<Record<'anthropic'|'gemini'|'openai', number>> = {};
    private _anthropicKeyInput?: HTMLInputElement;
    private _geminiKeyInput?: HTMLInputElement;
    private _openaiKeyInput?: HTMLInputElement;
    private _aiRelatedElements: HTMLElement[] = []; // Store references to AI-related settings

    constructor(app: App, plugin: RadialTimelinePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    // Folder suggest implementation delegated to its own class
    private attachFolderSuggest(text: TextComponent) {
        const inputEl = text.inputEl;
        // Instance wires itself to input events; selection callback handles save/validation
        new FolderSuggest(this.app, inputEl, this.plugin, text);
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

    // Toggle visibility of AI-related settings
    private toggleAiSettingsVisibility(show: boolean) {
        this._aiRelatedElements.forEach(el => {
            if (show) {
                el.classList.remove('rt-settings-hidden');
                el.classList.add('rt-settings-visible');
            } else {
                el.classList.remove('rt-settings-visible');
                el.classList.add('rt-settings-hidden');
            }
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
            inputEl.removeClass('rt-setting-input-success');
            inputEl.removeClass('rt-setting-input-error');

            try {
                if (provider === 'anthropic') {
                    await fetchAnthropicModels(key);
                } else if (provider === 'gemini') {
                    await fetchGeminiModels(key);
                } else {
                    await fetchOpenAiModels(key);
                }
                // Success highlight briefly
                inputEl.addClass('rt-setting-input-success');
                window.setTimeout(() => inputEl.removeClass('rt-setting-input-success'), 1200);
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                // Only mark invalid on explicit unauthorized cues; otherwise stay neutral
                if (/401|unauthorized|invalid/i.test(msg)) {
                    inputEl.addClass('rt-setting-input-error');
                    window.setTimeout(() => inputEl.removeClass('rt-setting-input-error'), 1400);
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
            const suggestionEl = container.createDiv({ cls: 'rt-source-path-suggestion-item' });
            // Padding, cursor, and border handled by CSS class
            suggestionEl.textContent = path;
            
            // Hover effect handled by CSS :hover pseudo-class
            
            // Click to select
            this.plugin.registerDomEvent(suggestionEl, 'click', async () => {
                textInput.setValue(path);
                // Validate and remember; only save the setting if valid
                const ok = await this.plugin.validateAndRememberPath(path);
                if (ok) {
                    // SAFE: path comes from validFolderPaths which are already normalized
                    this.plugin.settings.sourcePath = path;
                    await this.plugin.saveSettings();
                    container.classList.add('hidden');
                    // Clear existing validation classes and show success feedback
                    textInput.inputEl.removeClass('rt-setting-input-error');
                    textInput.inputEl.addClass('rt-setting-input-success');
                    window.setTimeout(() => {
                        textInput.inputEl.removeClass('rt-setting-input-success');
                    }, 1000);
                } else {
                    textInput.inputEl.addClass('rt-setting-input-error');
                    window.setTimeout(() => textInput.inputEl.removeClass('rt-setting-input-error'), 2000);
                }
                // Focus back to input
                try { textInput.inputEl.focus(); } catch {}
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
        
        // Clear AI-related elements array for fresh render
        this._aiRelatedElements = [];


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
                window.setTimeout(async () => {
                    const isValid = await this.plugin.validateAndRememberPath(this.plugin.settings.sourcePath);
                    if (isValid) {
                        text.inputEl.addClass('rt-setting-input-success');
                        window.setTimeout(() => {
                            text.inputEl.removeClass('rt-setting-input-success');
                        }, 2000);
                    }
                }, 100);
            }

            // Handle value changes
            text.onChange(async (value) => {
                // Clear any existing validation classes
                text.inputEl.removeClass('rt-setting-input-success');
                text.inputEl.removeClass('rt-setting-input-error');
                
                // Validate and remember path when Enter is pressed or field loses focus
                if (value.trim()) {
                    const normalized = normalizePath(value.trim());
                    const isValid = await this.plugin.validateAndRememberPath(normalized);
                    if (isValid) {
                        // SAFE: normalized is from normalizePath() above
                        this.plugin.settings.sourcePath = normalized;
                        await this.plugin.saveSettings();
                        text.inputEl.addClass('rt-setting-input-success');
                        window.setTimeout(() => {
                            text.inputEl.removeClass('rt-setting-input-success');
                        }, 1000);
                    } else {
                        // Show visual feedback for invalid paths
                        text.inputEl.addClass('rt-setting-input-error');
                        window.setTimeout(() => {
                            text.inputEl.removeClass('rt-setting-input-error');
                        }, 2000);
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
                            text.inputEl.removeClass('rt-setting-input-error');
                            await this.plugin.saveSettings();
                            return;
                        }

                        const selectedDate = new Date(value + 'T00:00:00');
                        if (selectedDate > today) {
                            this.plugin.settings.targetCompletionDate = value;
                            text.inputEl.removeClass('rt-setting-input-error');
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
            .setName('All scenes mode or main plot mode')
            .setDesc('If enabled, the outer ring shows ordered scenes from all subplots with subplot colors. Plot beats slices (gray) with labels are shown in the outer ring. When off, the outer ring shows only main plot scenes with publish stage coloring throughout timeline.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.outerRingAllScenes || false)
                .onChange(async (value) => {
                    this.plugin.settings.outerRingAllScenes = value;
                    await this.plugin.saveSettings();
                }));

        
                // --- Zero draft mode toggle ---
        new Settings(containerEl)
        .setName('Zero draft mode')
        .setDesc('Intercept clicks on scenes with Publish Stage = Zero and Status = Complete to capture Pending Edits without opening the scene.')
        .addToggle(toggle => toggle
            .setValue(this.plugin.settings.enableZeroDraftMode ?? false)
            .onChange(async (value) => {
                this.plugin.settings.enableZeroDraftMode = value;
                await this.plugin.saveSettings();
            }));

        // Plot System setting (for Gossamer mode)
        new Settings(containerEl)
            .setName('Plot system')
            .setDesc('Select the story structure model for your manuscript. This will establish the plot system and can be used to create plot notes and to score beats using Gossamer view.')
            .addDropdown(dropdown => {
                dropdown
                    .addOption('Save The Cat', 'Save The Cat (15 beats)')
                    .addOption('Hero\'s Journey', 'Hero\'s Journey (12 beats)')
                    .addOption('Story Grid', 'Story Grid (15 beats)')
                    .setValue(this.plugin.settings.plotSystem || 'Save The Cat')
                    .onChange(async (value) => {
                        this.plugin.settings.plotSystem = value;
                        await this.plugin.saveSettings();
                        // Update the description styling
                        this.updatePlotSystemDescription(plotSystemInfo, value);
                    });
                
                // Make the dropdown wider to show full text
                dropdown.selectEl.style.minWidth = '200px';
            });
        
        // Plot system explanation
        const plotSystemInfo = containerEl.createEl('div', { cls: 'setting-item-description' });
        plotSystemInfo.style.marginTop = '-8px';
        plotSystemInfo.style.marginBottom = '18px';
        plotSystemInfo.style.paddingLeft = '0';
        
        // Set initial description with current selection
        this.updatePlotSystemDescription(plotSystemInfo, this.plugin.settings.plotSystem || 'Save The Cat');

        // Create template notes button
        new Settings(containerEl)
            .setName('Create plot template notes')
            .setDesc('Generate template plot notes based on the selected plot system including YAML frontmatter and body summary.')
            .addButton(button => button
                .setButtonText('Create Templates')
                .setTooltip('Creates Plot note templates in your source path')
                .onClick(async () => {
                    await this.createPlotTemplates();
                }));
            
        // --- AI for Beats Analysis ---
        new Settings(containerEl)
            .setName('AI LLM for scene beats triplet analysis')
            .setHeading();
        
        // Enable/disable AI beats features
        new Settings(containerEl)
            .setName('Enable AI LLM features')
            .setDesc('Show command palette options and UI beat colors and beats sections in hover synopsis. When off, these visuals are hidden, but metadata remains unchanged.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.enableAiBeats ?? true)
                .onChange(async (value) => {
                    this.plugin.settings.enableAiBeats = value;
                    await this.plugin.saveSettings();
                    // Toggle visibility of AI-related settings
                    this.toggleAiSettingsVisibility(value);
                    // Refresh timeline(s) to apply visibility changes
                    this.plugin.refreshTimelineIfNeeded(null);
                }));

        // AI Prompt Context Template setting
        const getActiveTemplateName = (): string => {
            const templates = this.plugin.settings.aiContextTemplates || [];
            const activeId = this.plugin.settings.activeAiContextTemplateId;
            const active = templates.find(t => t.id === activeId);
            return active?.name || 'Generic Editor';
        };
        
        const contextTemplateSetting = new Settings(containerEl)
            .setName('AI prompt context template')
            .setDesc(`Active: ${getActiveTemplateName()}`)
            .addExtraButton(button => button
                .setIcon('gear')
                .setTooltip('Manage context templates')
                .onClick(() => {
                    const modal = new AiContextModal(this.app, this.plugin, () => {
                        // Refresh the description after saving
                        contextTemplateSetting.setDesc(`Active: ${getActiveTemplateName()}`);
                    });
                    modal.open();
                }));
        
        // Track this element for visibility toggling
        this._aiRelatedElements.push(contextTemplateSetting.settingEl);

        // --- Single model picker ---
        const modelPickerSetting = new Settings(containerEl)
            .setName('Model')
            .setDesc('Pick the model you prefer for writing tasks.')
            .addDropdown(dropdown => {
                type ModelChoice = { id: string; label: string; provider: 'anthropic' | 'gemini' | 'openai'; model: string };
                const choices: ModelChoice[] = [
                    { id: 'anthropic:claude-sonnet-4-5', label: 'Anthropic — Sonnet 4.5', provider: 'anthropic', model: 'claude-sonnet-4-5-20250929' },
                    { id: 'anthropic:claude-sonnet-4', label: 'Anthropic — Sonnet 4', provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
                    { id: 'anthropic:claude-opus-4-1', label: 'Anthropic — Opus 4.1', provider: 'anthropic', model: 'claude-opus-4-1-20250805' },
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
                    if (!currentId) currentId = 'anthropic:claude-sonnet-4';
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
        
        // Track this element for visibility toggling
        this._aiRelatedElements.push(modelPickerSetting.settingEl);

        // Provider sections (for dimming)
        const anthropicSection = containerEl.createDiv({ cls: 'rt-provider-section rt-provider-anthropic' });
        const geminiSection = containerEl.createDiv({ cls: 'rt-provider-section rt-provider-gemini' });
        const openaiSection = containerEl.createDiv({ cls: 'rt-provider-section rt-provider-openai' });

        // Keep refs for dimming updates
        this._providerSections = { anthropic: anthropicSection, gemini: geminiSection, openai: openaiSection };
        
        // Track provider sections for visibility toggling
        this._aiRelatedElements.push(anthropicSection, geminiSection, openaiSection);

        // Anthropic API Key
        new Settings(anthropicSection)
            .setName('Anthropic API key')
            .setDesc((() => {
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
            })())
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
            .setDesc((() => {
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
            })())
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
            .setDesc((() => {
                const frag = document.createDocumentFragment();
                const span = document.createElement('span');
                span.textContent = 'Your OpenAI API key for using ChatGPT AI features.';
                const link = document.createElement('a');
                link.href = 'https://platform.openai.com';
                link.textContent = 'Get key';
                link.target = '_blank';
                link.rel = 'noopener';
                frag.appendChild(span);
                frag.appendChild(link);
                return frag;
            })())
            .addText(text => text
                .setPlaceholder('Enter your API key')
                .setValue(this.plugin.settings.openaiApiKey || '')
                .onChange(async (value) => {
                    this.plugin.settings.openaiApiKey = value.trim();
                    await this.plugin.saveSettings();
                    this._openaiKeyInput = text.inputEl;
                    // Basic sanity check: OpenAI secret keys begin with "sk-". Warn if it looks like a project id.
                    const v = value.trim();
                    text.inputEl.removeClass('rt-setting-input-success');
                    text.inputEl.removeClass('rt-setting-input-error');
                    if (v && !v.startsWith('sk-')) {
                        text.inputEl.addClass('rt-setting-input-error');
                        new Notice('This does not look like an OpenAI secret key. Keys start with "sk-".');
                        // Do not run remote validation in this case
                    } else {
                        this.scheduleKeyValidation('openai');
                    }
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
        const apiLoggingSetting = new Settings(containerEl)
            .setName('Log AI interactions to file')
            .setDesc('If enabled, create a new note in the "AI" folder for each AI API request/response.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.logApiInteractions)
                .onChange(async (value) => {
                    this.plugin.settings.logApiInteractions = value;
                    await this.plugin.saveSettings();
                }));
        
        // Track this element for visibility toggling
        this._aiRelatedElements.push(apiLoggingSetting.settingEl);
        // <<< END of added Setting block >>>
        
        // Set initial visibility state based on current toggle value
        this.toggleAiSettingsVisibility(this.plugin.settings.enableAiBeats ?? true);

        // Debug mode setting removed: console logging only in development builds

        // --- Publishing Stage Colors (compact grid) --- 
        const pubHeading = new Settings(containerEl)
            .setName('Publishing stage colors')
            .setHeading();
        // Promote visual weight: add divider and spacing
        pubHeading.settingEl.classList.add('rt-section-heading');
        containerEl.createEl('p', { cls: 'rt-color-section-desc', text: 'Used for completed scenes, stage matrix, act labels and more.' });
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
            this.plugin.registerDomEvent(swatchEl, 'click', () => {
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
        const subplotHeading = new Settings(containerEl)
            .setName('Subplot ring colors')
            .setHeading();
        subplotHeading.settingEl.classList.add('rt-section-heading');
        containerEl.createEl('p', { cls: 'rt-color-section-desc', text: 'Subplot ring colors used for rings 1 through 16 moving inward.' });
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
            this.plugin.registerDomEvent(swatchEl2, 'click', () => {
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
        containerEl.createEl('hr', { cls: 'rt-settings-separator' });
        const readmeContainer = containerEl.createDiv({ cls: 'rt-manuscript-readme-container' });
        const readmeMarkdown = typeof EMBEDDED_README_CONTENT !== 'undefined'
            ? EMBEDDED_README_CONTENT
            : 'README content could not be loaded. Please ensure the plugin was built correctly or view the README.md file directly.';

        // Sanitize external images to avoid network requests or 404s (e.g., YouTube thumbnails)
        // 1) Convert YouTube thumbnail images to a simple video link
        const ytThumbRe = /!\[[^\]]*\]\((https?:\/\/i\.ytimg\.com\/vi\/([a-zA-Z0-9_-]+)\/[^)]+)\)/gi;
        // 2) Convert any other external image markdown to a plain link
        const externalImgRe = /!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/gi;
        const safeReadme = readmeMarkdown
            .replace(ytThumbRe, (_m, _url, vid) => `[Watch on YouTube](https://youtu.be/${vid})`)
            .replace(externalImgRe, (_m, alt, url) => `[${alt || 'Open link'}](${url})`);
           
        // Create a new component instance specifically for this rendering
        this.readmeComponent = new Component(); 


        // Use the managed component for the renderer
        // Note: Switching back to MarkdownRenderer.render as renderMarkdown was part of the error path
        MarkdownRenderer.render(
            this.app,
            safeReadme,
            readmeContainer,
            '', // No source path: not rendering a specific file
            this.readmeComponent
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

    private updatePlotSystemDescription(container: HTMLElement, selectedSystem: string): void {
        const descriptions: Record<string, string> = {
            'Save The Cat': 'Commercial fiction, screenplays, and genre stories. Emphasizes clear emotional beats and audience engagement.',
            'Hero\'s Journey': 'Mythic, adventure, and transformation stories. Focuses on the protagonist\'s arc through trials and self-discovery.',
            'Story Grid': 'Literary fiction and complex narratives. Balances micro and macro structure with progressive complications.'
        };

        // Clear and rebuild using DOM nodes
        container.empty();
        
        for (const [system, desc] of Object.entries(descriptions)) {
            const isSelected = system === selectedSystem;
            const lineDiv = container.createDiv();
            
            if (isSelected) {
                lineDiv.style.color = 'var(--text-success)'; // SAFE: inline style used for dynamic selection highlighting
                lineDiv.style.fontWeight = '500'; // SAFE: inline style used for dynamic selection highlighting
            }
            
            const boldSpan = lineDiv.createEl('b');
            boldSpan.textContent = system;
            lineDiv.appendText(`: ${desc}`);
        }
    }

    private async createPlotTemplates(): Promise<void> {
        const plotSystemName = this.plugin.settings.plotSystem || 'Save The Cat';
        const plotSystem = getPlotSystem(plotSystemName);
        
        if (!plotSystem) {
            new Notice(`Unknown plot system: ${plotSystemName}`);
            return;
        }

        // Show confirmation modal
        const modal = new CreatePlotTemplatesModal(
            this.app,
            this.plugin,
            plotSystemName,
            plotSystem.beatCount
        );
        modal.open();
        
        const result = await modal.waitForConfirmation();
        
        if (!result.confirmed) {
            return;
        }

        // Create the template notes
        try {
            const sourcePath = this.plugin.settings.sourcePath || '';
            const { created, skipped, errors } = await createPlotTemplateNotes(
                this.app.vault,
                plotSystemName,
                sourcePath
            );

            // Show results
            if (errors.length > 0) {
                new Notice(`Created ${created} notes. ${skipped} skipped. ${errors.length} errors. Check console.`);
                console.error('[Plot Templates] Errors:', errors);
            } else if (created === 0 && skipped > 0) {
                new Notice(`All ${skipped} Plot notes already exist. No new notes created.`);
            } else {
                new Notice(`✓ Successfully created ${created} Plot template notes!`);
            }
        } catch (error) {
            console.error('[Plot Templates] Failed:', error);
            new Notice(`Failed to create Plot templates: ${error}`);
        }
    }

}
