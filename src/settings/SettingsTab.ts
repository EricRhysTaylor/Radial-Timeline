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
import { renderGeneralSection } from './sections/GeneralSection';
import { AiContextModal } from './AiContextModal';
import { fetchAnthropicModels } from '../api/anthropicApi';
import { fetchOpenAiModels } from '../api/openaiApi';
import { fetchGeminiModels } from '../api/geminiApi';
import RadialTimelinePlugin, { DEFAULT_SETTINGS } from '../main';
import { renderColorsSection } from './sections/ColorsSection';
import { renderTemplatesSection } from './sections/TemplatesSection';
import { renderReadmeSection } from './sections/ReadmeSection';
import { renderAdvancedSection } from './sections/AdvancedSection';
import { renderAiSection } from './sections/AiSection';

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


        renderGeneralSection({ app: this.app, plugin: this.plugin, attachFolderSuggest: (t) => this.attachFolderSuggest(t), containerEl });

        renderTemplatesSection({ app: this.app, plugin: this.plugin, containerEl });
            
        renderAiSection({
            app: this.app,
            plugin: this.plugin,
            containerEl,
            addAiRelatedElement: (el: HTMLElement) => this._aiRelatedElements.push(el),
            toggleAiSettingsVisibility: (show: boolean) => this.toggleAiSettingsVisibility(show),
            refreshProviderDimming: () => this.refreshProviderDimming(),
            scheduleKeyValidation: (p: 'anthropic'|'gemini'|'openai') => this.scheduleKeyValidation(p),
            setProviderSections: (sections: { anthropic?: HTMLElement; gemini?: HTMLElement; openai?: HTMLElement }) => { this._providerSections = sections; },
            setKeyInputRef: (provider: 'anthropic'|'gemini'|'openai', input: HTMLInputElement | undefined) => {
                if (provider === 'anthropic') this._anthropicKeyInput = input;
                if (provider === 'gemini') this._geminiKeyInput = input;
                if (provider === 'openai') this._openaiKeyInput = input;
            },
        });

        // Debug mode setting removed: console logging only in development builds

        renderColorsSection(containerEl, this.plugin);
                    
        renderReadmeSection({ app: this.app, containerEl, setComponentRef: (c: Component | null) => { this.readmeComponent = c; } });

        // Advanced settings at end
        renderAdvancedSection({ app: this.app, plugin: this.plugin, containerEl });
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
