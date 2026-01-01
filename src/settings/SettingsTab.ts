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
    requestUrl,
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
import RadialTimelinePlugin from '../main';
import { DEFAULT_SETTINGS } from './defaults';
import { renderColorsSection } from './sections/ColorsSection';
import { renderReadmeSection } from './sections/ReadmeSection';
import { renderAdvancedSection } from './sections/AdvancedSection';
import { renderAiSection } from './sections/AiSection';
import { renderReleaseNotesSection } from './sections/ReleaseNotesSection';
import { renderPovSection } from './sections/PovSection';
import { renderPlanetaryTimeSection } from './sections/PlanetaryTimeSection';
import { renderMetadataSection } from './sections/MetadataSection';
import { renderRuntimeSection } from './sections/RuntimeSection';
import { validateLocalModelAvailability } from '../api/localAiApi';

declare const EMBEDDED_README_CONTENT: string;

export class RadialTimelineSettingsTab extends PluginSettingTab {
    plugin: RadialTimelinePlugin;
    private readmeComponent: Component | null = null; // <<< ADD THIS LINE
    private _providerSections: { anthropic?: HTMLElement; gemini?: HTMLElement; openai?: HTMLElement; local?: HTMLElement } = {};
    private _keyValidateTimers: Partial<Record<'anthropic' | 'gemini' | 'openai' | 'local', number>> = {};
    private _anthropicKeyInput?: HTMLInputElement;
    private _geminiKeyInput?: HTMLInputElement;
    private _openaiKeyInput?: HTMLInputElement;
    private _localKeyInput?: HTMLInputElement;
    private _localBaseUrlInput?: HTMLInputElement;
    private _localModelIdInput?: HTMLInputElement;
    private _aiRelatedElements: HTMLElement[] = []; // Store references to AI-related settings

    // TODO: Migrate to Obsidian Keychain API when available (v1.11.0+)
    // Currently storing keys in data.json (plain text) because app.keychain is not yet exposed in the public API types.
    // See: https://obsidian.md/changelog/2025-12-10-desktop-v1.11.0/

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
    // Also disables input fields in dimmed sections
    private refreshProviderDimming() {
        const selected = (this.plugin.settings.defaultAiProvider || 'openai') as 'anthropic' | 'gemini' | 'openai' | 'local';
        const map = this._providerSections;
        (['anthropic', 'gemini', 'openai', 'local'] as const).forEach(key => {
            const el = map[key];
            if (!el) return;
            const isSelected = key === selected;
            
            // Toggle dimmed class
            if (isSelected) el.classList.remove('dimmed');
            else el.classList.add('dimmed');
            
            // Disable/enable all inputs, textareas, and buttons in non-selected sections
            const inputs = el.querySelectorAll('input, textarea, button, select');
            inputs.forEach(input => {
                if (isSelected) {
                    input.removeAttribute('disabled');
                } else {
                    input.setAttribute('disabled', 'true');
                }
            });

            // Some interactive controls (like clickable icons) ignore the disabled attribute,
            // so explicitly block pointer events when the provider is not selected.
            const clickableIcons = el.querySelectorAll('.clickable-icon');
            clickableIcons.forEach(icon => {
                const htmlIcon = icon as HTMLElement;
                if (isSelected) {
                    htmlIcon.removeAttribute('aria-disabled');
                    htmlIcon.style.pointerEvents = '';
                } else {
                    htmlIcon.setAttribute('aria-disabled', 'true');
                    htmlIcon.style.pointerEvents = 'none';
                }
            });
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
    private scheduleKeyValidation(provider: 'anthropic' | 'gemini' | 'openai' | 'local') {
        const prior = this._keyValidateTimers[provider];
        if (prior) window.clearTimeout(prior);

        if (provider === 'local') {
            const selectedProvider = (this.plugin.settings.defaultAiProvider || 'openai') as 'anthropic' | 'gemini' | 'openai' | 'local';
            if (selectedProvider !== 'local') {
                return; // Skip local availability checks when another provider is active
            }
            const baseInput = this._localBaseUrlInput;
            const modelInput = this._localModelIdInput;
            if (!baseInput || !modelInput) return;
            const baseUrl = baseInput.value?.trim();
            const modelId = modelInput.value?.trim();
            if (!baseUrl || !modelId) return;

            this._keyValidateTimers[provider] = window.setTimeout(async () => {
                delete this._keyValidateTimers[provider];
                const targets = [baseInput, modelInput];
                targets.forEach(el => {
                    el.removeClass('rt-setting-input-success');
                    el.removeClass('rt-setting-input-error');
                });
                const result = await validateLocalModelAvailability(
                    baseUrl,
                    modelId,
                    this.plugin.settings.localApiKey?.trim()
                );
                if (result.reachable && result.hasModel) {
                    targets.forEach(el => {
                        el.addClass('rt-setting-input-success');
                        window.setTimeout(() => el.removeClass('rt-setting-input-success'), 1200);
                    });
                } else {
                    targets.forEach(el => {
                        el.addClass('rt-setting-input-error');
                        window.setTimeout(() => el.removeClass('rt-setting-input-error'), 1400);
                    });
                    if (result.message) {
                        new Notice(`Local AI validation failed: ${result.message}`);
                    }
                }
            }, 800);
            return;
        }

        const inputEl = provider === 'anthropic' ? this._anthropicKeyInput
            : provider === 'gemini' ? this._geminiKeyInput
                : this._openaiKeyInput;
        if (!inputEl) return;

        const key = inputEl.value?.trim();
        if (!key) return;
        if (key.length < 8) return;

        this._keyValidateTimers[provider] = window.setTimeout(async () => {
            delete this._keyValidateTimers[provider];
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
                inputEl.addClass('rt-setting-input-success');
                window.setTimeout(() => inputEl.removeClass('rt-setting-input-success'), 1200);
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
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
                try { textInput.inputEl.focus(); } catch { }
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

    // Render Backup and Safety section (replacing Patreon section)
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

        // Title row with icon
        const titleRow = contentContainer.createDiv({ cls: 'rt-patreon-title-row' });

        // Archive Restore icon (small)
        const iconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        iconSvg.setAttribute('width', '24');
        iconSvg.setAttribute('height', '24');
        iconSvg.setAttribute('viewBox', '0 0 24 24');
        iconSvg.setAttribute('fill', 'none');
        iconSvg.setAttribute('stroke', 'currentColor');
        iconSvg.setAttribute('stroke-width', '2');
        iconSvg.setAttribute('stroke-linecap', 'round');
        iconSvg.setAttribute('stroke-linejoin', 'round');
        iconSvg.classList.add('lucide', 'lucide-archive-restore', 'rt-patreon-title-icon');

        iconSvg.innerHTML = `<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h2"/><path d="M20 8v11a2 2 0 0 1-2 2h-2"/><path d="m9 15 3-3 3 3"/><path d="M12 12v9"/>`; // SAFE: innerHTML used for static SVG content
        titleRow.appendChild(iconSvg);

        const title = titleRow.createEl('h3', { cls: 'rt-patreon-title' });
        title.createSpan({ text: 'Protect Your Work' });

        const description = contentContainer.createEl('p', { cls: 'rt-patreon-description' });
        
        const backupPara = description.createDiv();
        backupPara.createSpan({ text: 'It is strongly recommended for you to ' });
        backupPara.createEl('a', { text: 'automate backups', href: 'https://help.obsidian.md/backup' });
        backupPara.createSpan({ text: '. The native ' });
        backupPara.createEl('a', { text: 'Obsidian Sync', href: 'https://obsidian.md/sync' });
        backupPara.createSpan({ text: ' service and community favorite ' });
        backupPara.createEl('a', { text: 'Obsidian Git', href: 'https://obsidian.md/plugins?id=obsidian-git' });
        backupPara.createSpan({ text: ' are excellent choices.' });

        const syncPara = description.createDiv({ cls: 'rt-patreon-sync-para' });
        syncPara.createEl('strong', { text: 'Sync Conflicts: ' });
        syncPara.createSpan({ text: 'Avoid mixing sync services. If using iCloud on macOS alongside another sync tool, append ' });
        syncPara.createEl('code', { text: '.nosync' });
        syncPara.createSpan({ text: ' to the folder name to stop iCloud from syncing the vault. ' });
        syncPara.createEl('a', { text: 'Read the Obsidian Sync Guide.', href: 'https://help.obsidian.md/sync/switch' });

    }

    private async fetchPatreonMemberCount(): Promise<number | null> {
        const url = 'https://raw.githubusercontent.com/ericrhystaylor/radial-timeline/master/src/data/patreonStats.json';
        try {
            const response = await requestUrl({ url, method: 'GET' });
            if (response.status !== 200) {
                return null;
            }
            const data = response.json ?? JSON.parse(response.text);
            return data.memberCount ?? null;
        } catch (error) {
            console.warn('Unable to fetch Patreon member count:', error);
            return null;
        }
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.addClass('rt-settings-root');

        // Clear AI-related elements array for fresh render
        this._aiRelatedElements = [];

        // Backup and safety notice at the top
        this.renderPatreonSection(containerEl);

        // Data setup: source path + custom metadata mapping
        renderGeneralSection({ app: this.app, plugin: this.plugin, attachFolderSuggest: (t) => this.attachFolderSuggest(t), containerEl });
        renderMetadataSection({ app: this.app, plugin: this.plugin, containerEl });

        // Story defaults: POV and story beats/acts
        renderPovSection({ plugin: this.plugin, containerEl });
        renderStoryBeatsSection({ app: this.app, plugin: this.plugin, containerEl });

        // Progress targets
        renderPublicationSection({ app: this.app, plugin: this.plugin, containerEl });

        // Timeline display controls
        renderChronologueSection({ app: this.app, plugin: this.plugin, containerEl });
        renderPlanetaryTimeSection({ app: this.app, plugin: this.plugin, containerEl });
        renderRuntimeSection({ app: this.app, plugin: this.plugin, containerEl });

        // AI LLM for Scene Analysis (keeps provider blocks together)
        renderAiSection({
            app: this.app,
            plugin: this.plugin,
            containerEl,
            addAiRelatedElement: (el: HTMLElement) => this._aiRelatedElements.push(el),
            toggleAiSettingsVisibility: (show: boolean) => this.toggleAiSettingsVisibility(show),
            refreshProviderDimming: () => this.refreshProviderDimming(),
            scheduleKeyValidation: (p: 'anthropic' | 'gemini' | 'openai' | 'local') => this.scheduleKeyValidation(p),
            setProviderSections: (sections: { anthropic?: HTMLElement; gemini?: HTMLElement; openai?: HTMLElement; local?: HTMLElement }) => { this._providerSections = sections; },
            setKeyInputRef: (provider: 'anthropic' | 'gemini' | 'openai' | 'local', input: HTMLInputElement | undefined) => {
                if (provider === 'anthropic') this._anthropicKeyInput = input;
                if (provider === 'gemini') this._geminiKeyInput = input;
                if (provider === 'openai') this._openaiKeyInput = input;
                if (provider === 'local') this._localKeyInput = input;
            },
            setLocalConnectionInputs: ({ baseInput, modelInput }) => {
                if (baseInput) this._localBaseUrlInput = baseInput;
                if (modelInput) this._localModelIdInput = modelInput;
            },
        });

        // Advanced settings (scene clipping, debounce, disabled when date sorting)
        renderAdvancedSection({ app: this.app, plugin: this.plugin, containerEl });

        // Custom colors (rarely changed; keep low)
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
