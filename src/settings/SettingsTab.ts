import { App, PluginSettingTab, Component, Setting as Settings, setIcon, TextComponent, normalizePath } from 'obsidian';
import { renderGeneralSection } from './sections/GeneralSection';
import { renderPublicationSection } from './sections/PublicationSection';
import { renderChronologueSection } from './sections/ChronologueSection';
import { renderTemplatesSection } from './sections/TemplatesSection';
import { renderAuthorProgressSection } from './sections/AuthorProgressSection';
import { fetchAnthropicModels } from '../api/anthropicApi';
import { fetchOpenAiModels } from '../api/openaiApi';
import { fetchGeminiModels } from '../api/geminiApi';
import RadialTimelinePlugin from '../main';
import { renderColorsSection } from './sections/ColorsSection';
import { renderReadmeSection } from './sections/ReadmeSection';
import { renderAdvancedSection } from './sections/AdvancedSection';
import { renderAiSection } from './sections/AiSection';
import { renderReleaseNotesSection } from './sections/ReleaseNotesSection';
import { renderPovSection } from './sections/PovSection';
import { renderPlanetaryTimeSection } from './sections/PlanetaryTimeSection';
import { renderMetadataSection } from './sections/MetadataSection';
import { renderRuntimeSection } from './sections/RuntimeSection';
import { renderProfessionalSection, isProfessionalActive } from './sections/ProfessionalSection';
import { validateLocalModelAvailability } from '../api/localAiApi';
import { FolderSuggest } from './FolderSuggest';

export class RadialTimelineSettingsTab extends PluginSettingTab {
    plugin: RadialTimelinePlugin;
    private readmeComponent: Component | null = null;
    private _providerSections: { anthropic?: HTMLElement; gemini?: HTMLElement; openai?: HTMLElement; local?: HTMLElement } = {};
    private _keyValidateTimers: Partial<Record<'anthropic' | 'gemini' | 'openai' | 'local', number>> = {};
    private _anthropicKeyInput?: HTMLInputElement;
    private _geminiKeyInput?: HTMLInputElement;
    private _openaiKeyInput?: HTMLInputElement;
    private _localKeyInput?: HTMLInputElement;
    private _localBaseUrlInput?: HTMLInputElement;
    private _localModelIdInput?: HTMLInputElement;
    private _aiRelatedElements: HTMLElement[] = []; 
    private _activeTab: 'pro' | 'core' = 'core'; 
    private _searchDebounceTimer?: number;
    private _coreSearchableContent?: HTMLElement;

    constructor(app: App, plugin: RadialTimelinePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    private attachFolderSuggest(text: TextComponent) {
        const inputEl = text.inputEl;
        new FolderSuggest(this.app, inputEl, this.plugin, text);
    }

    private refreshProviderDimming() {
        const selected = (this.plugin.settings.defaultAiProvider || 'openai') as 'anthropic' | 'gemini' | 'openai' | 'local';
        const map = this._providerSections;
        (['anthropic', 'gemini', 'openai', 'local'] as const).forEach(key => {
            const el = map[key];
            if (!el) return;
            const isSelected = key === selected;
            if (isSelected) el.classList.remove('dimmed');
            else el.classList.add('dimmed');
            const inputs = el.querySelectorAll('input, textarea, button, select');
            inputs.forEach(input => {
                if (isSelected) input.removeAttribute('disabled');
                else input.setAttribute('disabled', 'true');
            });
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

    private scheduleKeyValidation(provider: 'anthropic' | 'gemini' | 'openai' | 'local') {
        const prior = this._keyValidateTimers[provider];
        if (prior) window.clearTimeout(prior);

        if (provider === 'local') {
            const selectedProvider = (this.plugin.settings.defaultAiProvider || 'openai') as 'anthropic' | 'gemini' | 'openai' | 'local';
            if (selectedProvider !== 'local') return; 
            const baseInput = this._localBaseUrlInput;
            const modelInput = this._localModelIdInput;
            if (!baseInput || !modelInput) return;
            const baseUrl = baseInput.value?.trim();
            const modelId = modelInput.value?.trim();
            if (!baseUrl || !modelId) return;

            this._keyValidateTimers[provider] = window.setTimeout(async () => {
                delete this._keyValidateTimers[provider];
                [baseInput, modelInput].forEach(el => {
                    el.removeClass('rt-setting-input-success');
                    el.removeClass('rt-setting-input-error');
                });
                const result = await validateLocalModelAvailability(
                    baseUrl,
                    modelId,
                    this.plugin.settings.localApiKey?.trim()
                );
                if (result.reachable && result.hasModel) {
                    [baseInput, modelInput].forEach(el => {
                        el.addClass('rt-setting-input-success');
                        window.setTimeout(() => el.removeClass('rt-setting-input-success'), 1200);
                    });
                } else {
                    [baseInput, modelInput].forEach(el => {
                        el.addClass('rt-setting-input-error');
                        window.setTimeout(() => el.removeClass('rt-setting-input-error'), 1400);
                    });
                }
            }, 800);
            return;
        }

        const inputEl = provider === 'anthropic' ? this._anthropicKeyInput
            : provider === 'gemini' ? this._geminiKeyInput
                : this._openaiKeyInput;
        if (!inputEl) return;

        const key = inputEl.value?.trim();
        if (!key || key.length < 8) return;

        this._keyValidateTimers[provider] = window.setTimeout(async () => {
            delete this._keyValidateTimers[provider];
            inputEl.removeClass('rt-setting-input-success');
            inputEl.removeClass('rt-setting-input-error');

            try {
                if (provider === 'anthropic') await fetchAnthropicModels(key);
                else if (provider === 'gemini') await fetchGeminiModels(key);
                else await fetchOpenAiModels(key);
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

    private showPathSuggestions(currentValue: string, container: HTMLElement, textInput: TextComponent): void {
        const validPaths = this.plugin.settings.validFolderPaths;
        const filteredPaths = validPaths.filter(path =>
            path.toLowerCase().includes(currentValue.toLowerCase()) || currentValue === ''
        );
        container.empty();
        if (filteredPaths.length === 0) {
            container.classList.add('hidden');
            return;
        }
        container.classList.remove('hidden');
        filteredPaths.forEach(path => {
            const suggestionEl = container.createDiv({ cls: 'rt-source-path-suggestion-item' });
            suggestionEl.textContent = path;
            this.plugin.registerDomEvent(suggestionEl, 'click', async () => {
                textInput.setValue(path);
                const ok = await this.plugin.validateAndRememberPath(path);
                if (ok) {
                    this.plugin.settings.sourcePath = normalizePath(path);
                    await this.plugin.saveSettings();
                    container.classList.add('hidden');
                    textInput.inputEl.removeClass('rt-setting-input-error');
                    textInput.inputEl.addClass('rt-setting-input-success');
                    window.setTimeout(() => {
                        textInput.inputEl.removeClass('rt-setting-input-success');
                    }, 1000);
                } else {
                    textInput.inputEl.addClass('rt-setting-input-error');
                    window.setTimeout(() => textInput.inputEl.removeClass('rt-setting-input-error'), 2000);
                }
                try { textInput.inputEl.focus(); } catch { }
            });
        });
    }

    private renderBackupSafetySection(containerEl: HTMLElement): void {
        const container = containerEl.createDiv({ cls: 'rt-backup-safety' });
        const bgLogo = container.createDiv({ cls: 'rt-backup-bg-logo' });
        const bgSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        bgSvg.setAttribute('viewBox', '0 0 1080 1080');
        bgSvg.classList.add('rt-backup-bg-svg');
        const bgPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        bgPath.setAttribute('d', 'M1033.05,324.45c-0.19-137.9-107.59-250.92-233.6-291.7c-156.48-50.64-362.86-43.3-512.28,27.2 C106.07,145.41,49.18,332.61,47.06,519.31c-1.74,153.5,13.58,557.79,241.62,560.67c169.44,2.15,194.67-216.18,273.07-321.33 c55.78-74.81,127.6-95.94,216.01-117.82C929.71,603.22,1033.27,483.3,1033.05,324.45z');
        bgSvg.appendChild(bgPath);
        bgLogo.appendChild(bgSvg);
        const contentContainer = container.createDiv({ cls: 'rt-backup-content' });
        const titleRow = contentContainer.createDiv({ cls: 'rt-backup-title-row' });
        const iconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        iconSvg.setAttribute('width', '24');
        iconSvg.setAttribute('height', '24');
        iconSvg.setAttribute('viewBox', '0 0 24 24');
        iconSvg.setAttribute('fill', 'none');
        iconSvg.setAttribute('stroke', 'currentColor');
        iconSvg.setAttribute('stroke-width', '2');
        iconSvg.setAttribute('stroke-linecap', 'round');
        iconSvg.setAttribute('stroke-linejoin', 'round');
        iconSvg.classList.add('lucide', 'lucide-archive-restore', 'rt-backup-title-icon');
        iconSvg.innerHTML = `<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h2"/><path d="M20 8v11a2 2 0 0 1-2 2h-2"/><path d="m9 15 3-3 3 3"/><path d="M12 12v9"/>`; // SAFE: innerHTML used for static SVG icon path construction
        titleRow.appendChild(iconSvg);
        const title = titleRow.createEl('h3', { cls: 'rt-backup-title' });
        title.createSpan({ text: 'Backup your Work' });
        const description = contentContainer.createEl('p', { cls: 'rt-backup-description' });
        const backupPara = description.createDiv();
        backupPara.createSpan({ text: 'It is strongly recommended for you to ' });
        backupPara.createEl('a', { text: 'automate backups', href: 'https://help.obsidian.md/backup' });
        backupPara.createSpan({ text: '. The native ' });
        backupPara.createEl('a', { text: 'Obsidian Sync', href: 'https://obsidian.md/sync' });
        backupPara.createSpan({ text: ' service and community favorite ' });
        backupPara.createEl('a', { text: 'Obsidian Git', href: 'https://obsidian.md/plugins?id=obsidian-git' });
        backupPara.createSpan({ text: ' are excellent choices.' });
        const syncPara = description.createDiv({ cls: 'rt-backup-sync-para' });
        syncPara.createEl('strong', { text: 'Sync Conflicts: ' });
        syncPara.createSpan({ text: 'Avoid mixing sync services. If using iCloud on macOS alongside another sync tool, append ' });
        syncPara.createEl('code', { text: '.nosync' });
        syncPara.createSpan({ text: ' to the folder name to stop iCloud from syncing the vault. ' });
        syncPara.createEl('a', { text: 'Read the Obsidian Sync Guide.', href: 'https://help.obsidian.md/sync/switch' });
    }

    private renderSearchBox(containerEl: HTMLElement): HTMLInputElement {
        const searchContainer = containerEl.createDiv({ cls: 'rt-settings-search-container' });
        const searchIconEl = searchContainer.createSpan({ cls: 'rt-settings-search-icon' });
        setIcon(searchIconEl, 'search');
        const searchInput = searchContainer.createEl('input', {
            cls: 'rt-settings-search-input',
            attr: { type: 'text', placeholder: 'Search settings...', spellcheck: 'false' }
        });
        const clearBtn = searchContainer.createSpan({ cls: 'rt-settings-search-clear rt-hidden' });
        setIcon(clearBtn, 'x');
        clearBtn.setAttribute('aria-label', 'Clear search');
        this.plugin.registerDomEvent(searchInput, 'input', () => {
            const query = searchInput.value.trim();
            clearBtn.toggleClass('rt-hidden', query.length === 0);
            if (this._searchDebounceTimer) window.clearTimeout(this._searchDebounceTimer);
            this._searchDebounceTimer = window.setTimeout(() => this.filterSettings(query), 150);
        });
        this.plugin.registerDomEvent(clearBtn, 'click', () => {
            searchInput.value = '';
            clearBtn.addClass('rt-hidden');
            this.filterSettings('');
            searchInput.focus();
        });
        this.plugin.registerDomEvent(searchInput, 'keydown', (evt: KeyboardEvent) => {
            if (evt.key === 'Escape') {
                searchInput.value = '';
                clearBtn.addClass('rt-hidden');
                this.filterSettings('');
            }
        });
        return searchInput;
    }
    
    private filterSettings(query: string): void {
        if (!this._coreSearchableContent) return;
        const normalizedQuery = query.toLowerCase().trim();
        const allSettings = this._coreSearchableContent.querySelectorAll('.setting-item');
        const allSectionContainers = this._coreSearchableContent.querySelectorAll('[data-rt-section]');
        if (normalizedQuery === '') {
            allSettings.forEach(el => (el as HTMLElement).classList.remove('rt-search-hidden'));
            allSectionContainers.forEach(el => (el as HTMLElement).classList.remove('rt-search-section-hidden'));
            return;
        }
        allSettings.forEach(settingEl => {
            const el = settingEl as HTMLElement;
            const searchText = el.dataset.rtSearchText || '';
            const matches = searchText.includes(normalizedQuery);
            el.classList.toggle('rt-search-hidden', !matches);
        });
        allSectionContainers.forEach(sectionEl => {
            const section = sectionEl as HTMLElement;
            const visibleSettings = section.querySelectorAll('.setting-item:not(.rt-search-hidden)');
            section.classList.toggle('rt-search-section-hidden', visibleSettings.length === 0);
        });
    }
    
    private renderProCallout(containerEl: HTMLElement, text: string, switchToProTab: () => void): void {
        const callout = containerEl.createDiv({ cls: 'rt-pro-callout' });
        const badge = callout.createSpan({ cls: 'rt-pro-callout-badge' });
        setIcon(badge, 'signature');
        badge.createSpan({ text: 'Pro' });
        callout.createSpan({ cls: 'rt-pro-callout-text', text });
        callout.createSpan({ cls: 'rt-pro-callout-arrow', text: '→' });
        this.plugin.registerDomEvent(callout, 'click', () => { switchToProTab(); });
    }

    private addSearchMetadataToSettings(containerEl: HTMLElement): void {
        const settingItems = containerEl.querySelectorAll('.setting-item');
        settingItems.forEach(settingEl => {
            const el = settingEl as HTMLElement;
            if (el.dataset.rtSearchText) return;
            const nameEl = el.querySelector('.setting-item-name');
            const descEl = el.querySelector('.setting-item-description');
            const name = nameEl?.textContent || '';
            const desc = descEl?.textContent || '';
            el.dataset.rtSearchText = `${name} ${desc}`.toLowerCase();
        });
    }

    private renderProHero(containerEl: HTMLElement): void {
        const hero = containerEl.createDiv({ cls: 'rt-pro-hero' });
        const badgeRow = hero.createDiv({ cls: 'rt-pro-hero-badge-row' });
        const badge = badgeRow.createSpan({ cls: 'rt-pro-hero-badge' });
        setIcon(badge, 'signature');
        badge.createSpan({ text: 'Pro · Signature' });
        hero.createEl('h3', { cls: 'rt-pro-hero-title', text: 'Signature tools for professional workflows.' });
        hero.createEl('p', { cls: 'rt-pro-hero-subtitle', text: 'Premium exports, runtime intelligence, and Pandoc templates. Make your publishing pipeline radial and your story ever revolving.' });
        const featuresSection = hero.createDiv({ cls: 'rt-pro-hero-features' });
        featuresSection.createEl('h5', { text: 'Included in Early Access:' });
        const featuresList = featuresSection.createEl('ul');
        [
            { icon: 'film', text: 'Runtime Estimation — Screenplay and audiobook duration analysis' },
            { icon: 'file-output', text: 'Pro Exports — Screenplay, podcast, and novel manuscript formats via Pandoc' },
        ].forEach(feature => {
            const li = featuresList.createEl('li');
            const iconSpan = li.createSpan({ cls: 'rt-pro-hero-feature-icon' });
            setIcon(iconSpan, feature.icon);
            li.createSpan({ text: feature.text });
        });
        const meta = hero.createDiv({ cls: 'rt-pro-hero-meta' });
        meta.createSpan({ text: 'Active Pro session' });
        meta.createSpan({ text: 'Early Access perks' });
        meta.createSpan({ text: 'Configure below' });
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.addClass('rt-settings-root');
        this._aiRelatedElements = [];

        const tabBar = containerEl.createDiv({ cls: 'rt-settings-tab-bar' });
        const proTab = tabBar.createDiv({ cls: 'rt-settings-tab' });
        const proIcon = proTab.createSpan({ cls: 'rt-settings-tab-icon' });
        setIcon(proIcon, 'signature');
        proTab.createSpan({ text: 'Pro', cls: 'rt-settings-tab-label' });
        const coreTab = tabBar.createDiv({ cls: 'rt-settings-tab' });
        const coreIcon = coreTab.createSpan({ cls: 'rt-settings-tab-icon' });
        setIcon(coreIcon, 'settings');
        coreTab.createSpan({ text: 'Core', cls: 'rt-settings-tab-label' });

        const proContent = containerEl.createDiv({ cls: 'rt-settings-tab-content rt-settings-pro-content' });
        const coreContent = containerEl.createDiv({ cls: 'rt-settings-tab-content rt-settings-core-content' });

        const updateTabState = () => {
            proTab.toggleClass('rt-settings-tab-active', this._activeTab === 'pro');
            coreTab.toggleClass('rt-settings-tab-active', this._activeTab === 'core');
            proContent.toggleClass('rt-hidden', this._activeTab !== 'pro');
            coreContent.toggleClass('rt-hidden', this._activeTab !== 'core');
        };

        this.plugin.registerDomEvent(proTab, 'click', () => { this._activeTab = 'pro'; updateTabState(); });
        this.plugin.registerDomEvent(coreTab, 'click', () => { this._activeTab = 'core'; updateTabState(); });
        updateTabState();

        const isProActive = isProfessionalActive(this.plugin);
        if (isProActive) this.renderProHero(proContent);
        renderProfessionalSection({ app: this.app, plugin: this.plugin, containerEl: proContent });
        renderRuntimeSection({ app: this.app, plugin: this.plugin, containerEl: proContent });

        this.renderBackupSafetySection(coreContent);
        this.renderSearchBox(coreContent);
        
        const searchableContent = coreContent.createDiv({ cls: 'rt-settings-searchable-content' });
        this._coreSearchableContent = searchableContent;
        const switchToProTab = () => { this._activeTab = 'pro'; updateTabState(); };

        // APR Section - Top of Core
        const shareSection = searchableContent.createDiv({ attr: { 'data-rt-section': 'share' } });
        renderAuthorProgressSection({ app: this.app, plugin: this.plugin, containerEl: shareSection });

        const generalSection = searchableContent.createDiv({ attr: { 'data-rt-section': 'general' } });
        renderGeneralSection({ app: this.app, plugin: this.plugin, attachFolderSuggest: (t) => this.attachFolderSuggest(t), containerEl: generalSection });
        this.renderProCallout(generalSection, 'Manuscript exports via Pandoc', switchToProTab);

        const metadataSection = searchableContent.createDiv({ attr: { 'data-rt-section': 'metadata' } });
        renderMetadataSection({ app: this.app, plugin: this.plugin, containerEl: metadataSection });

        const povSection = searchableContent.createDiv({ attr: { 'data-rt-section': 'pov' } });
        renderPovSection({ plugin: this.plugin, containerEl: povSection });
        
        const beatsSection = searchableContent.createDiv({ attr: { 'data-rt-section': 'beats' } });
        renderTemplatesSection({ app: this.app, plugin: this.plugin, containerEl: beatsSection });

        const publicationSection = searchableContent.createDiv({ attr: { 'data-rt-section': 'publication' } });
        renderPublicationSection({ app: this.app, plugin: this.plugin, containerEl: publicationSection });
        this.renderProCallout(publicationSection, 'Runtime estimation for screenplay & audiobook', switchToProTab);

        const chronologueSection = searchableContent.createDiv({ attr: { 'data-rt-section': 'chronologue' } });
        renderChronologueSection({ app: this.app, plugin: this.plugin, containerEl: chronologueSection });

        const planetarySection = searchableContent.createDiv({ attr: { 'data-rt-section': 'planetary' } });
        renderPlanetaryTimeSection({ app: this.app, plugin: this.plugin, containerEl: planetarySection });

        const aiSection = searchableContent.createDiv({ attr: { 'data-rt-section': 'ai' } });
        renderAiSection({
            app: this.app,
            plugin: this.plugin,
            containerEl: aiSection,
            addAiRelatedElement: (el: HTMLElement) => this._aiRelatedElements.push(el),
            toggleAiSettingsVisibility: (show: boolean) => this.toggleAiSettingsVisibility(show),
            refreshProviderDimming: () => this.refreshProviderDimming(),
            scheduleKeyValidation: (p: 'anthropic' | 'gemini' | 'openai' | 'local') => this.scheduleKeyValidation(p),
            setProviderSections: (sections) => { this._providerSections = sections; },
            setKeyInputRef: (provider, input) => {
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

        const advancedSection = searchableContent.createDiv({ attr: { 'data-rt-section': 'advanced' } });
        renderAdvancedSection({ app: this.app, plugin: this.plugin, containerEl: advancedSection });

        const colorsSection = searchableContent.createDiv({ attr: { 'data-rt-section': 'colors' } });
        renderColorsSection(colorsSection, this.plugin);

        const releaseNotesSection = searchableContent.createDiv({ attr: { 'data-rt-section': 'release-notes' } });
        void renderReleaseNotesSection({ plugin: this.plugin, containerEl: releaseNotesSection });

        const readmeSection = searchableContent.createDiv({ attr: { 'data-rt-section': 'readme' } });
        renderReadmeSection({ app: this.app, containerEl: readmeSection, setComponentRef: (c: Component | null) => { this.readmeComponent = c; } });

        this.addSearchMetadataToSettings(searchableContent);
    }

    hide() {
        if (this.readmeComponent) {
            this.readmeComponent.unload();
            this.readmeComponent = null;
        }
    }
}
