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
import { renderPublicationSection } from './sections/PublicationSection';
import { renderChronologueSection } from './sections/ChronologueSection';
import { renderStoryBeatsSection } from './sections/TemplatesSection';
import { AiContextModal } from './AiContextModal';
import { fetchAnthropicModels } from '../api/anthropicApi';
import { fetchOpenAiModels } from '../api/openaiApi';
import { fetchGeminiModels } from '../api/geminiApi';
import RadialTimelinePlugin, { DEFAULT_SETTINGS } from '../main';
import { renderColorsSection } from './sections/ColorsSection';
import { renderReadmeSection } from './sections/ReadmeSection';
import { renderAdvancedSection } from './sections/AdvancedSection';
import { renderAiSection } from './sections/AiSection';
import { renderReleaseNotesSection } from './sections/ReleaseNotesSection';
import { renderPovSection } from './sections/PovSection';

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

    // Render Patreon support section
    private renderPatreonSection(containerEl: HTMLElement): void {
        const patreonContainer = containerEl.createDiv({ cls: 'rt-patreon-support' });
        
        // Create large background "P" logo using theme variable
        const bgLogo = patreonContainer.createDiv({ cls: 'rt-patreon-bg-logo' });
        const bgSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        bgSvg.setAttribute('viewBox', '0 0 1080 1080');
        bgSvg.classList.add('rt-patreon-bg-svg');
        
        const bgPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        bgPath.setAttribute('d', 'M1033.05,324.45c-0.19-137.9-107.59-250.92-233.6-291.7c-156.48-50.64-362.86-43.3-512.28,27.2 C106.07,145.41,49.18,332.61,47.06,519.31c-1.74,153.5,13.58,557.79,241.62,560.67c169.44,2.15,194.67-216.18,273.07-321.33 c55.78-74.81,127.6-95.94,216.01-117.82C929.71,603.22,1033.27,483.3,1033.05,324.45z');
        bgSvg.appendChild(bgPath);
        bgLogo.appendChild(bgSvg);
        
        // Content container
        const contentContainer = patreonContainer.createDiv({ cls: 'rt-patreon-content' });
        
        const title = contentContainer.createEl('h3', { cls: 'rt-patreon-title' });
        title.createSpan({ text: 'Support Radial Timeline Development' });
        
        const description = contentContainer.createEl('p', { cls: 'rt-patreon-description' });
        description.appendText('Join my Patreon to show your unbridled enthusiasm for the Radial Timeline! Help guide the development of the project into the far far future by voting in polls and sharing ideas and feedback directly with the creator.');
        
        const buttonContainer = contentContainer.createDiv({ cls: 'rt-patreon-button-container' });
        const patreonButton = buttonContainer.createEl('a', {
            cls: 'rt-patreon-button',
            href: 'https://www.patreon.com/c/EricRhysTaylor'
        });
        
        // Create SVG icon using proper DOM methods
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '16');
        svg.setAttribute('height', '16');
        svg.setAttribute('viewBox', '0 0 1080 1080');
        svg.setAttribute('fill', 'currentColor');
        svg.classList.add('rt-patreon-icon');
        
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M1033.05,324.45c-0.19-137.9-107.59-250.92-233.6-291.7c-156.48-50.64-362.86-43.3-512.28,27.2 C106.07,145.41,49.18,332.61,47.06,519.31c-1.74,153.5,13.58,557.79,241.62,560.67c169.44,2.15,194.67-216.18,273.07-321.33 c55.78-74.81,127.6-95.94,216.01-117.82C929.71,603.22,1033.27,483.3,1033.05,324.45z');
        svg.appendChild(path);
        
        patreonButton.appendChild(svg);
        patreonButton.appendText('Join on Patreon');
        
        // SAFE: addEventListener in PluginSettingTab - cleaned up when settings are closed
        patreonButton.addEventListener('click', (e: MouseEvent) => {
            e.preventDefault();
            window.open('https://www.patreon.com/c/EricRhysTaylor', '_blank');
        });
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        
        // Clear AI-related elements array for fresh render
        this._aiRelatedElements = [];

        // Patreon support section at the top
        this.renderPatreonSection(containerEl);

        // 1. Source path (from GeneralSection)
        renderGeneralSection({ app: this.app, plugin: this.plugin, attachFolderSuggest: (t) => this.attachFolderSuggest(t), containerEl });

        // 2. Publication and Progress section (target date, show estimate, zero draft mode)
        renderPublicationSection({ app: this.app, plugin: this.plugin, containerEl });

        // POV section (global defaults + YAML guidance)
        renderPovSection({ plugin: this.plugin, containerEl });

        // 3. Chronologue Mode settings (duration cap, discontinuity threshold)
        renderChronologueSection({ app: this.app, plugin: this.plugin, containerEl });

        // 4. Story Beats System and Gossamer (templates dropdown, create templates button)
        renderStoryBeatsSection({ app: this.app, plugin: this.plugin, containerEl });
            
        // 5. AI LLM for Scene Analysis
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

        // 6. Advanced settings (scene clipping, debounce, disabled when date sorting)
        renderAdvancedSection({ app: this.app, plugin: this.plugin, containerEl });

        // Colors section
        renderColorsSection(containerEl, this.plugin);
        
        void renderReleaseNotesSection({ plugin: this.plugin, containerEl });
        
        renderReadmeSection({ app: this.app, containerEl, setComponentRef: (c: Component | null) => { this.readmeComponent = c; } });
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
