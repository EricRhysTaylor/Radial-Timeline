import { App, PluginSettingTab, Component, setIcon, TextComponent, normalizePath } from 'obsidian';
import { renderGeneralSection } from './sections/GeneralSection';
import { renderCompletionEstimatePreview, renderPublicationSection } from './sections/PublicationSection';
import { renderChronologueSection } from './sections/ChronologueSection';
import { renderBackdropSection } from './sections/BackdropSection';
import { renderTemplatesSection } from './sections/TemplatesSection';
import { renderAuthorProgressSection } from './sections/AuthorProgressSection';
import { renderInquirySection } from './sections/InquirySection';
import { fetchAnthropicModels } from '../api/anthropicApi';
import { fetchOpenAiModels } from '../api/openaiApi';
import { fetchGeminiModels } from '../api/geminiApi';
import RadialTimelinePlugin from '../main';
import { renderColorsSection } from './sections/ColorsSection';
import { renderReadmeSection } from './sections/ReadmeSection';
import { renderConfigurationSection } from './sections/ConfigurationSection';
import { renderAiSection } from './sections/AiSection';
import { renderReleaseNotesSection } from './sections/ReleaseNotesSection';
import { renderPovSection } from './sections/PovSection';
import { renderPlanetaryTimeSection } from './sections/PlanetaryTimeSection';

import { renderRuntimeSection } from './sections/RuntimeSection';
import { renderProfessionalSection, isProfessionalActive } from './sections/ProfessionalSection';
import { validateLocalModelAvailability } from '../api/localAiApi';
import { FolderSuggest } from './FolderSuggest';
import { ERT_CLASSES, ERT_DATA } from '../ui/classes';
import {
    getActiveRefactorAlerts,
    getAllNotificationsForHistory,
    isAlertDismissed,
    applyAlertMigrations,
    cleanupAdvancedTemplate,
    advancedTemplateNeedsCleanup,
    dismissAlert,
    type RefactorAlert
} from './refactorAlerts';
import { DEFAULT_SETTINGS } from './defaults';

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
    private _activeTab: 'pro' | 'inquiry' | 'core' | 'social' = 'core';
    private _searchDebounceTimer?: number;
    private _coreSearchableContent?: HTMLElement;
    private readonly _searchShortAllowList = new Set(['ai', 'ui']);

    /** Public method to set active tab before/after opening settings */
    public setActiveTab(tab: 'pro' | 'inquiry' | 'core' | 'social'): void {
        this._activeTab = tab;
    }

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
                el.classList.remove('ert-settings-hidden');
                el.classList.add('ert-settings-visible');
            } else {
                el.classList.remove('ert-settings-visible');
                el.classList.add('ert-settings-hidden');
            }
        });
    }

    /**
     * Auto-migrate templates to latest structure.
     * - Updates base template to current defaults (field order/names)
     * - Cleans up advanced template by removing base fields
     * Shows notification for user to dismiss after reading.
     */
    private autoMigrateAdvancedTemplate(): void {
        const defaultBase = DEFAULT_SETTINGS.sceneYamlTemplates!.base;
        const currentBase = this.plugin.settings.sceneYamlTemplates?.base ?? '';
        const currentAdvanced = this.plugin.settings.sceneYamlTemplates?.advanced ?? '';
        
        let needsSave = false;
        
        // Update base template to current defaults (ensures field order/names are current)
        if (currentBase !== defaultBase) {
            if (!this.plugin.settings.sceneYamlTemplates) {
                this.plugin.settings.sceneYamlTemplates = { base: '', advanced: '' };
            }
            this.plugin.settings.sceneYamlTemplates.base = defaultBase;
            needsSave = true;
        }
        
        // Clean up advanced template if it has legacy base fields
        if (currentAdvanced && advancedTemplateNeedsCleanup(currentAdvanced)) {
            const cleaned = cleanupAdvancedTemplate(currentAdvanced);
            if (!this.plugin.settings.sceneYamlTemplates) {
                this.plugin.settings.sceneYamlTemplates = { base: defaultBase, advanced: '' };
            }
            this.plugin.settings.sceneYamlTemplates.advanced = cleaned;
            needsSave = true;
        }
        
        if (needsSave) {
            void this.plugin.saveSettings();
            // Notification appears in the alerts panel - user can dismiss after reading
        }
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
                    el.removeClass('ert-setting-input-success');
                    el.removeClass('ert-setting-input-error');
                });
                const result = await validateLocalModelAvailability(
                    baseUrl,
                    modelId,
                    this.plugin.settings.localApiKey?.trim()
                );
                if (result.reachable && result.hasModel) {
                    [baseInput, modelInput].forEach(el => {
                        el.addClass('ert-setting-input-success');
                        window.setTimeout(() => el.removeClass('ert-setting-input-success'), 1200);
                    });
                } else {
                    [baseInput, modelInput].forEach(el => {
                        el.addClass('ert-setting-input-error');
                        window.setTimeout(() => el.removeClass('ert-setting-input-error'), 1400);
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
            inputEl.removeClass('ert-setting-input-success');
            inputEl.removeClass('ert-setting-input-error');

            try {
                if (provider === 'anthropic') await fetchAnthropicModels(key);
                else if (provider === 'gemini') await fetchGeminiModels(key);
                else await fetchOpenAiModels(key);
                inputEl.addClass('ert-setting-input-success');
                window.setTimeout(() => inputEl.removeClass('ert-setting-input-success'), 1200);
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                if (/401|unauthorized|invalid/i.test(msg)) {
                    inputEl.addClass('ert-setting-input-error');
                    window.setTimeout(() => inputEl.removeClass('ert-setting-input-error'), 1400);
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
            const suggestionEl = container.createDiv({ cls: 'ert-source-path-suggestion-item' });
            suggestionEl.textContent = path;
            this.plugin.registerDomEvent(suggestionEl, 'click', async () => {
                textInput.setValue(path);
                const ok = await this.plugin.validateAndRememberPath(path);
                if (ok) {
                    const normalizedPath = normalizePath(path);
                    this.plugin.settings.sourcePath = normalizedPath;
                    await this.plugin.saveSettings();
                    container.classList.add('hidden');
                    textInput.inputEl.removeClass('ert-setting-input-error');
                    textInput.inputEl.addClass('ert-setting-input-success');
                    window.setTimeout(() => {
                        textInput.inputEl.removeClass('ert-setting-input-success');
                    }, 1000);
                } else {
                    textInput.inputEl.addClass('ert-setting-input-error');
                    window.setTimeout(() => textInput.inputEl.removeClass('ert-setting-input-error'), 2000);
                }
                try { textInput.inputEl.focus(); } catch { }
            });
        });
    }

    private renderBackupSafetySection(containerEl: HTMLElement): void {
        containerEl.addClass(ERT_CLASSES.PANEL, ERT_CLASSES.STACK, 'ert-backup-callout');

        const heading = containerEl.createDiv({ cls: 'ert-backup-callout__heading' });
        const iconWrapper = heading.createDiv({ cls: 'ert-backup-callout__icon' });
        setIcon(iconWrapper, 'archive-restore');
        heading.createSpan({ text: 'Backup & Sync', cls: 'ert-backup-callout__title' });

        const description = containerEl.createDiv({ cls: 'ert-backup-callout__description' });
        description.createSpan({ text: 'Back up your Obsidian vault regularly to protect against data loss. Learn more at ' });
        description.createEl('a', { text: 'Obsidian Backup Guide', href: 'https://help.obsidian.md/backup' });
        description.createSpan({ text: '. Sync does not protect against all forms of data loss. Sync options include ' });
        description.createEl('a', { text: 'Obsidian Sync', href: 'https://obsidian.md/sync' });
        description.createSpan({ text: ' or ' });
        description.createEl('a', { text: 'Obsidian Git', href: 'https://obsidian.md/plugins?id=obsidian-git' });
    }

    /**
     * Render refactor alerts at the top of Core settings.
     * Shows a persistent notification panel that can be collapsed/expanded.
     * Active alerts are shown with full interaction; dismissed alerts shown in history.
     */
    private renderRefactorAlerts(containerEl: HTMLElement): void {
        const activeAlerts = getActiveRefactorAlerts(this.plugin.settings);
        const historyAlerts = getAllNotificationsForHistory(this.plugin.settings);
        const hasActive = activeAlerts.length > 0;
        const hasHistory = historyAlerts.length > 0;

        // Don't render anything if no alerts exist at all
        if (!hasActive && !hasHistory) return;

        // Create the notification panel wrapper
        const panelEl = containerEl.createDiv({
            cls: ['ert-notification-panel', hasActive ? 'ert-notification-panel--active' : 'ert-notification-panel--muted']
        });

        if (hasActive) {
            // Sort active alerts by severity (critical first, then warning, then info)
            const sortedAlerts = [...activeAlerts].sort((a, b) => {
                const severityOrder = { critical: 0, warning: 1, info: 2 };
                return severityOrder[a.severity] - severityOrder[b.severity];
            });

            // Render each active alert
            for (const alert of sortedAlerts) {
                this.renderActiveAlert(panelEl, alert);
            }

            // If there's also history, add a separator and collapsed history section
            if (hasHistory) {
                this.renderHistorySection(panelEl, historyAlerts, false);
            }
        } else {
            // No active alerts - show collapsed stub with history
            this.renderHistorySection(panelEl, historyAlerts, true);
        }
    }

    /**
     * Render a single active (actionable) alert
     */
    private renderActiveAlert(containerEl: HTMLElement, alert: RefactorAlert): void {
        const alertEl = containerEl.createDiv({
            cls: ['ert-refactor-alert', `ert-refactor-alert--${alert.severity}`],
            attr: { 'data-alert-id': alert.id }
        });

        // Left side: Icon + Content
        const contentSide = alertEl.createDiv({ cls: 'ert-refactor-alert__content' });

        const heading = contentSide.createDiv({ cls: 'ert-refactor-alert__heading' });
        const iconWrapper = heading.createDiv({ cls: 'ert-refactor-alert__icon' });
        setIcon(iconWrapper, alert.icon);
        heading.createSpan({ text: alert.title, cls: 'ert-refactor-alert__title' });

        const description = contentSide.createDiv({ cls: 'ert-refactor-alert__description' });
        description.setText(alert.description);

        // Reassurance text inside alert - for migration and cleanup alerts
        if (alert.migrations?.length || alert.id === 'advanced-template-cleanup-v7') {
            const reassurance = contentSide.createDiv({ cls: 'ert-refactor-alert__reassurance' });
            reassurance.setText('These updates help keep your YAML consistent with the latest features. You can review or dismiss any change.');
        }

        // Right side: Action buttons (stacked vertically)
        const actionSide = alertEl.createDiv({ cls: 'ert-refactor-alert__actions' });

        // Dismiss button (X) - only for non-critical alerts
        if (alert.severity !== 'critical') {
            const dismissBtn = actionSide.createEl('button', {
                cls: 'ert-iconBtn ert-refactor-alert__btn--dismiss',
                attr: { 'aria-label': 'Dismiss alert' }
            });
            setIcon(dismissBtn, 'x');
            this.plugin.registerDomEvent(dismissBtn, 'click', async () => {
                dismissAlert(alert.id, this.plugin.settings);
                await this.plugin.saveSettings();

                // Re-render the entire alerts section
                const panelParent = alertEl.closest('.ert-notification-panel')?.parentElement;
                if (panelParent) {
                    panelParent.empty();
                    this.renderRefactorAlerts(panelParent);
                }
            });
        }

        // Auto Update button - for migration alerts
        if (alert.migrations?.length) {
            const autoUpdateBtn = actionSide.createEl('button', {
                cls: 'ert-iconBtn ert-refactor-alert__btn--update',
                attr: { 'aria-label': 'Apply update automatically' }
            });
            setIcon(autoUpdateBtn, 'refresh-cw');
            this.plugin.registerDomEvent(autoUpdateBtn, 'click', async () => {
                const template = this.plugin.settings.sceneYamlTemplates?.advanced ?? '';
                const updated = applyAlertMigrations(alert, template);

                if (!this.plugin.settings.sceneYamlTemplates) {
                    this.plugin.settings.sceneYamlTemplates = { base: '', advanced: '' };
                }
                this.plugin.settings.sceneYamlTemplates.advanced = updated;

                dismissAlert(alert.id, this.plugin.settings);
                await this.plugin.saveSettings();

                // Re-render the entire alerts section
                const panelParent = alertEl.closest('.ert-notification-panel')?.parentElement;
                if (panelParent) {
                    panelParent.empty();
                    this.renderRefactorAlerts(panelParent);
                }
                new (await import('obsidian')).Notice('Template updated successfully');
            });

            // View YAML button (↓)
            {
                const viewBtn = actionSide.createEl('button', {
                    cls: 'ert-iconBtn ert-refactor-alert__btn--view',
                    attr: { 'aria-label': 'View in YAML editor' }
                });
                setIcon(viewBtn, 'chevron-down');
                this.plugin.registerDomEvent(viewBtn, 'click', async () => {
                    // Enable advanced YAML editor if not already
                    this.plugin.settings.enableAdvancedYamlEditor = true;
                    await this.plugin.saveSettings();

                    // Small delay to let the editor expand, then scroll to the migration row or advanced card
                    window.setTimeout(() => {
                        // Try to scroll to the specific migration row first
                        const migrationRow = document.querySelector('.ert-yaml-row--needs-migration');
                        if (migrationRow) {
                            migrationRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            return;
                        }
                        // Fallback: scroll to the advanced template card
                        const advancedCard = document.querySelector('.ert-advanced-template-card');
                        if (advancedCard) {
                            advancedCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    }, 100);
                });
            }
        }
    }

    /**
     * Render the notification history section (collapsed or expanded)
     */
    private renderHistorySection(containerEl: HTMLElement, alerts: RefactorAlert[], startCollapsed: boolean): void {
        const historyWrapper = containerEl.createDiv({
            cls: ['ert-notification-history', startCollapsed ? 'ert-notification-history--collapsed' : '']
        });

        // Header row (always visible) - clickable to toggle
        const headerRow = historyWrapper.createDiv({ cls: 'ert-notification-history__header' });

        const toggleBtn = headerRow.createEl('button', {
            cls: 'ert-iconBtn ert-notification-history__toggle',
            attr: { 'aria-label': 'Toggle notification history' }
        });
        setIcon(toggleBtn, startCollapsed ? 'chevron-right' : 'chevron-down');

        const headerText = headerRow.createSpan({
            cls: 'ert-notification-history__label',
            text: `${alerts.length} notification${alerts.length !== 1 ? 's' : ''} processed`
        });

        // Content area (collapsible)
        const contentArea = historyWrapper.createDiv({ cls: 'ert-notification-history__content' });

        // Render each history item
        for (const alert of alerts) {
            this.renderHistoryItem(contentArea, alert);
        }

        // Toggle behavior
        const toggle = () => {
            const isCollapsed = historyWrapper.hasClass('ert-notification-history--collapsed');
            historyWrapper.toggleClass('ert-notification-history--collapsed', !isCollapsed);
            setIcon(toggleBtn, isCollapsed ? 'chevron-down' : 'chevron-right');
        };

        this.plugin.registerDomEvent(toggleBtn, 'click', toggle);
        this.plugin.registerDomEvent(headerText, 'click', toggle);
    }

    /**
     * Render a single history item (dismissed notification with checkmark)
     */
    private renderHistoryItem(containerEl: HTMLElement, alert: RefactorAlert): void {
        const itemEl = containerEl.createDiv({
            cls: ['ert-notification-history__item', `ert-notification-history__item--${alert.severity}`]
        });

        // Checkmark icon
        const checkIcon = itemEl.createDiv({ cls: 'ert-notification-history__check' });
        setIcon(checkIcon, 'check-circle-2');

        // Alert info
        const infoEl = itemEl.createDiv({ cls: 'ert-notification-history__info' });
        infoEl.createSpan({ text: alert.title, cls: 'ert-notification-history__title' });
        infoEl.createSpan({ text: alert.description, cls: 'ert-notification-history__description' });
    }

    private renderSearchBox(containerEl: HTMLElement): HTMLInputElement {
        const searchContainer = containerEl.createDiv({ cls: 'ert-settings-search-container' });
        const searchIconEl = searchContainer.createSpan({ cls: 'ert-settings-search-icon' });
        setIcon(searchIconEl, 'search');
        const searchInput = searchContainer.createEl('input', {
            cls: 'ert-settings-search-input',
            attr: { type: 'text', placeholder: 'Search settings...', spellcheck: 'false' }
        });
        const clearBtn = searchContainer.createSpan({ cls: 'ert-settings-search-clear ert-hidden' });
        setIcon(clearBtn, 'x');
        clearBtn.setAttribute('aria-label', 'Clear search');
        this.plugin.registerDomEvent(searchInput, 'input', () => {
            const query = searchInput.value.trim();
            clearBtn.toggleClass('ert-hidden', query.length === 0);
            if (this._searchDebounceTimer) window.clearTimeout(this._searchDebounceTimer);
            this._searchDebounceTimer = window.setTimeout(() => this.filterSettings(query), 150);
        });
        this.plugin.registerDomEvent(clearBtn, 'click', () => {
            searchInput.value = '';
            clearBtn.addClass('ert-hidden');
            this.filterSettings('');
            searchInput.focus();
        });
        this.plugin.registerDomEvent(searchInput, 'keydown', (evt: KeyboardEvent) => {
            if (evt.key === 'Escape') {
                searchInput.value = '';
                clearBtn.addClass('ert-hidden');
                this.filterSettings('');
            }
        });
        return searchInput;
    }

    private filterSettings(query: string): void {
        if (!this._coreSearchableContent) return;
        const queryTerms = this.getSearchTerms(query, 3, this._searchShortAllowList);
        const allSectionContainers = this._coreSearchableContent.querySelectorAll('[data-ert-section]');

        // If no query, show all sections
        if (queryTerms.length === 0) {
            allSectionContainers.forEach(el => (el as HTMLElement).classList.remove('ert-search-section-hidden'));
            this.updateNonSettingBlocks(false);
            return;
        }

        // Filter entire sections based on header match
        allSectionContainers.forEach(sectionEl => {
            const section = sectionEl as HTMLElement;
            const searchText = ` ${section.dataset.rtSearchText || ''} `;
            const matches = queryTerms.every(term => this.matchesSearchTerm(searchText, term));
            section.classList.toggle('ert-search-section-hidden', !matches);
        });

        this.updateNonSettingBlocks(true);
    }

    private updateNonSettingBlocks(active: boolean): void {
        // Since we now hide entire sections, non-setting blocks within sections
        // are automatically hidden/shown with their parent section.
        // This function is now a no-op but kept for compatibility.
        return;
    }

    private getSearchTerms(text: string, minLength = 1, allowList: Set<string> = new Set()): string[] {
        const matches = text.toLowerCase().match(/[a-z0-9]+/g);
        if (!matches) return [];
        const filtered = matches.filter(term => term.length >= minLength || allowList.has(term));
        return Array.from(new Set(filtered));
    }

    private matchesSearchTerm(searchText: string, term: string): boolean {
        const variants = [term];
        if (term.length >= 3) {
            variants.push(term.endsWith('s') ? term.slice(0, -1) : `${term}s`);
        }
        return variants.some(variant => {
            const exactMatch = searchText.includes(` ${variant} `);
            const prefixMatch = searchText.includes(`${variant} `);
            const suffixMatch = searchText.includes(` ${variant}`);
            const substringMatch = searchText.includes(variant);
            return exactMatch || prefixMatch || suffixMatch || substringMatch;
        });
    }

    private renderProCallout(containerEl: HTMLElement, text: string, switchToProTab: () => void): void {
        const callout = containerEl.createDiv({ cls: 'ert-pro-callout' });
        const badge = callout.createSpan({ cls: 'ert-pro-callout-badge' });
        setIcon(badge, 'signature');
        badge.createSpan({ text: 'Pro' });
        callout.createSpan({ cls: 'ert-pro-callout-text', text });
        callout.createSpan({ cls: 'ert-pro-callout-arrow', text: '→' });
        this.plugin.registerDomEvent(callout, 'click', () => { switchToProTab(); });
    }

    private addSearchMetadataToSettings(containerEl: HTMLElement): void {
        // Use only the header at the start of each section (first .ert-header in the stack)
        const sectionContainers = containerEl.querySelectorAll('[data-ert-section]');
        sectionContainers.forEach(sectionEl => {
            const section = sectionEl as HTMLElement;
            const firstHeader = section.querySelector('.ert-header');
            const titleEl = firstHeader?.querySelector('.ert-section-title');
            const titleText = titleEl?.textContent || '';
            if (titleText) {
                const terms = this.getSearchTerms(titleText, 1);
                if (terms.length > 0) {
                    section.dataset.rtSearchText = terms.join(' ');
                }
            }
        });
    }

    private applyElementBlockLayout(containerEl: HTMLElement): void {
        const settingItems = containerEl.querySelectorAll('.ert-settings-searchable-content .setting-item');
        settingItems.forEach(settingEl => {
            const el = settingEl as HTMLElement;
            // Settings headings must use native Obsidian setting-item-heading markup.
            // Do not convert headers at runtime.
            if (el.classList.contains('setting-item-heading')) return;
            if (el.closest('.ert-color-grid-controls')) return;
            if (el.classList.contains('mod-toggle')) {
                el.classList.remove(ERT_CLASSES.ELEMENT_BLOCK, 'ert-settingRow');
                return;
            }
            if (el.classList.contains(ERT_CLASSES.ELEMENT_BLOCK_SKIP)) return;
            if (el.classList.contains(ERT_CLASSES.ROW)) return;
        });
    }

    private renderSettingsHero(
        containerEl: HTMLElement,
        options: {
            badgeLabel: string;
            badgeIcon: string;
            badgeVariant?: string;
            wikiHref: string;
            title: string;
            subtitle: string;
            kicker: string;
            features: { icon: string; text: string }[];
        }
    ): void {
        const hero = containerEl.createDiv({
            cls: `${ERT_CLASSES.CARD} ${ERT_CLASSES.CARD_HERO} ${ERT_CLASSES.STACK}`
        });
        const badgeRow = hero.createDiv({ cls: ERT_CLASSES.INLINE });
        const badgeClasses = options.badgeVariant ?
            `${ERT_CLASSES.BADGE_PILL} ${options.badgeVariant}` :
            ERT_CLASSES.BADGE_PILL;
        const badge = badgeRow.createSpan({ cls: badgeClasses });
        const badgeIcon = badge.createSpan({ cls: ERT_CLASSES.BADGE_PILL_ICON });
        setIcon(badgeIcon, options.badgeIcon);
        badge.createSpan({ cls: ERT_CLASSES.BADGE_PILL_TEXT, text: options.badgeLabel });
        // Place wiki link inline with the badge label, not far right
        const wikiLink = badge.createEl('a', {
            href: options.wikiHref,
            cls: 'ert-badgePill__inlineLink',
            attr: {
                'aria-label': 'Read more in the Wiki',
                'target': '_blank',
                'rel': 'noopener'
            }
        });
        setIcon(wikiLink, 'external-link');

        // Wrap hero title in a title row for inline/legacy layout
        const titleRow = hero.createDiv({ cls: 'ert-hero-titleRow' });
        titleRow.createEl('h3', {
            cls: `${ERT_CLASSES.SECTION_TITLE} ert-hero-title`,
            text: options.title
        });
        hero.createEl('p', {
            cls: `${ERT_CLASSES.SECTION_DESC} ert-hero-subtitle`,
            text: options.subtitle
        });
        const featuresSection = hero.createDiv({
            cls: `${ERT_CLASSES.HERO_FEATURES} ${ERT_CLASSES.STACK} ${ERT_CLASSES.STACK_TIGHT}`
        });
        featuresSection.createEl('h5', { text: options.kicker, cls: 'ert-kicker' });
        const featuresList = featuresSection.createEl('ul', { cls: ERT_CLASSES.STACK });
        options.features.forEach(feature => {
            const li = featuresList.createEl('li', { cls: `${ERT_CLASSES.INLINE} ert-feature-item` });
            const iconSpan = li.createSpan({ cls: 'ert-feature-icon' });
            setIcon(iconSpan, feature.icon);
            li.createSpan({ text: feature.text });
        });
    }

    private renderProHero(containerEl: HTMLElement): void {
        this.renderSettingsHero(containerEl, {
            badgeLabel: 'Pro · Signature',
            badgeIcon: 'signature',
            badgeVariant: ERT_CLASSES.BADGE_PILL_PRO,
            wikiHref: 'https://github.com/EricRhysTaylor/radial-timeline/wiki/Settings#professional',
            title: 'Signature tools for professional workflows.',
            subtitle: 'Premium exports, runtime intelligence, and Pandoc templates. Make your publishing pipeline radial and your story ever revolving.',
            kicker: 'Included in Early Access:',
            features: [
                { icon: 'film', text: 'Runtime Estimation — Screenplay and audiobook duration analysis' },
                { icon: 'file-output', text: 'Pro Exports — Screenplay, podcast, and novel manuscript formats via Pandoc' },
                { icon: 'radio', text: 'Teaser Campaign — Progressive reveal for Author Progress Reports (APR)' },
            ]
        });
    }

    private renderInquiryHero(containerEl: HTMLElement): void {
        this.renderSettingsHero(containerEl, {
            badgeLabel: 'Inquiry · Signals',
            badgeIcon: 'waves',
            badgeVariant: ERT_CLASSES.BADGE_PILL_NEUTRAL,
            wikiHref: 'https://github.com/EricRhysTaylor/radial-timeline/wiki/Settings#inquiry',
            title: 'Analyze your story as a complete system.',
            subtitle: 'Evaluate how scenes, books, and entire sagas work together. Inquiry uses your manuscript(s), outlines, characters, and worldbuilding to surface structural weak points, missing or underdeveloped material, and momentum issues—all in a single view with clear visual signals and quantifiers.',
            kicker: 'Inquiry Focus Areas:',
            features: [
                { icon: 'search', text: 'Source Scans — Choose scan locations, class scopes, and source types to watch' },
                { icon: 'list', text: 'Prompt Slots — Draft reusable inquiry questions' },
                { icon: 'layout-grid', text: 'Corpus Tiers — Calibrate source quality thresholds from sketchy → substantive depth' },
            ]
        });
    }

    private renderCoreHero(containerEl: HTMLElement): void {
        this.renderSettingsHero(containerEl, {
            badgeLabel: 'Core · Foundation',
            badgeIcon: 'settings',
            badgeVariant: ERT_CLASSES.BADGE_PILL_NEUTRAL,
            wikiHref: 'https://github.com/EricRhysTaylor/radial-timeline/wiki/Settings#core',
            title: 'Build the core of your writing workflow.',
            subtitle: 'The Radial Timeline is designed to empower you, the author, to greater productivity and accountability. Using core settings, configure the Radial Timeline to reflect your manuscript’s structure and writing style. Search surfaces any matching section instantly.',
            kicker: 'Core Highlights:',
            features: [
                { icon: 'layout-grid', text: 'Story structure — manage scenes,beats, templates, and advanced YAML fields.' },
                { icon: 'orbit', text: 'Chronologue & time — align chronologue, backdrop, and planetary clocks' },
                { icon: 'book-open-text', text: 'Publishing setup — configure manuscript formats, metadata, runtime estimation, and release prep' },
            ]
        });
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.addClass('ert-ui', 'ert-settings-root', 'ert-scope--settings');
        this._aiRelatedElements = [];

        // Auto-migrate: Clean up legacy advanced template if needed
        this.autoMigrateAdvancedTemplate();

        const tabBar = containerEl.createDiv({ cls: 'ert-settings-tab-bar' });
        const proTab = tabBar.createDiv({ cls: 'ert-settings-tab' });
        const proIcon = proTab.createSpan({ cls: 'ert-settings-tab-icon' });
        setIcon(proIcon, 'signature');
        proTab.createSpan({ text: 'Pro', cls: 'ert-settings-tab-label' });
        const inquiryTab = tabBar.createDiv({ cls: 'ert-settings-tab' });
        const inquiryIcon = inquiryTab.createSpan({ cls: 'ert-settings-tab-icon' });
        setIcon(inquiryIcon, 'waves');
        inquiryTab.createSpan({ text: 'Inquiry', cls: 'ert-settings-tab-label' });

        const coreTab = tabBar.createDiv({ cls: 'ert-settings-tab' });
        const coreIcon = coreTab.createSpan({ cls: 'ert-settings-tab-icon' });
        setIcon(coreIcon, 'settings');
        coreTab.createSpan({ text: 'Core', cls: 'ert-settings-tab-label' });

        const socialTab = tabBar.createDiv({ cls: 'ert-settings-tab ert-settings-tab-social' });
        const socialIcon = socialTab.createSpan({ cls: 'ert-settings-tab-icon' });
        setIcon(socialIcon, 'radio');
        socialTab.createSpan({ text: 'Social Media', cls: 'ert-settings-tab-label' });

        const proContent = containerEl.createDiv({
            cls: `ert-settings-tab-content ert-settings-pro-content ${ERT_CLASSES.ROOT} ert-scope--settings ${ERT_CLASSES.SKIN_PRO}`
        });
        const inquiryContent = containerEl.createDiv({ cls: 'ert-settings-tab-content ert-settings-inquiry-content ert-scope--settings' });
        const coreContent = containerEl.createDiv({ cls: 'ert-settings-tab-content ert-settings-core-content ert-scope--settings' });
        const socialContent = containerEl.createDiv({
            cls: 'ert-settings-tab-content ert-settings-social-content ert-ui ert-scope--settings ert-skin--social ert-density--compact'
        });

        const updateTabState = () => {
            proTab.toggleClass('ert-settings-tab-active', this._activeTab === 'pro');
            inquiryTab.toggleClass('ert-settings-tab-active', this._activeTab === 'inquiry');
            coreTab.toggleClass('ert-settings-tab-active', this._activeTab === 'core');
            socialTab.toggleClass('ert-settings-tab-active', this._activeTab === 'social');
            proContent.toggleClass('ert-hidden', this._activeTab !== 'pro');
            inquiryContent.toggleClass('ert-hidden', this._activeTab !== 'inquiry');
            coreContent.toggleClass('ert-hidden', this._activeTab !== 'core');
            socialContent.toggleClass('ert-hidden', this._activeTab !== 'social');
        };

        this.plugin.registerDomEvent(proTab, 'click', () => { this._activeTab = 'pro'; updateTabState(); });
        this.plugin.registerDomEvent(inquiryTab, 'click', () => { this._activeTab = 'inquiry'; updateTabState(); });
        this.plugin.registerDomEvent(coreTab, 'click', () => { this._activeTab = 'core'; updateTabState(); });
        this.plugin.registerDomEvent(socialTab, 'click', () => { this._activeTab = 'social'; updateTabState(); });
        updateTabState();

        const isProActive = isProfessionalActive(this.plugin);
        const proStack = renderProfessionalSection({
            app: this.app,
            plugin: this.plugin,
            containerEl: proContent,
            renderHero: isProActive ? (target) => this.renderProHero(target) : undefined,
            onProToggle: () => this.display()
        });
        renderRuntimeSection({ app: this.app, plugin: this.plugin, containerEl: proStack });

        // Social Media Tab Content - APR Section
        renderAuthorProgressSection({ app: this.app, plugin: this.plugin, containerEl: socialContent });

        const inquiryStack = inquiryContent.createDiv({ cls: ERT_CLASSES.STACK });
        this.renderInquiryHero(inquiryStack);
        const inquiryBody = inquiryStack.createDiv({ cls: 'ert-settings-searchable-content' });

        const coreStack = coreContent.createDiv({ cls: ERT_CLASSES.STACK });
        this.renderCoreHero(coreStack);

        // Refactor alerts (shown at top when migrations are needed)
        const alertsRow = coreStack.createDiv();
        this.renderRefactorAlerts(alertsRow);

        const backupRow = coreStack.createDiv();
        this.renderBackupSafetySection(backupRow);

        const completionRow = coreStack.createDiv();
        const completionPreviewRefresh = renderCompletionEstimatePreview({
            app: this.app,
            plugin: this.plugin,
            containerEl: completionRow,
            frameClass: 'ert-previewFrame--flush'
        });

        const searchRow = coreStack.createDiv();
        this.renderSearchBox(searchRow);

        const coreBody = coreStack.createDiv();
        const searchableContent = coreBody.createDiv({ cls: 'ert-settings-searchable-content' });
        this._coreSearchableContent = searchableContent;
        const switchToProTab = () => { this._activeTab = 'pro'; updateTabState(); };

        // Setup Section - Source path settings
        const generalSection = searchableContent.createDiv({
            attr: { [ERT_DATA.SECTION]: 'general' }
        });
        const generalStack = generalSection.createDiv({ cls: ERT_CLASSES.STACK });
        renderGeneralSection({
            app: this.app,
            plugin: this.plugin,
            attachFolderSuggest: (t) => this.attachFolderSuggest(t),
            containerEl: generalStack,
            addAiRelatedElement: (el) => this._aiRelatedElements.push(el)
        });
        this.renderProCallout(generalSection, 'Manuscript exports via Pandoc', switchToProTab);

        const inquirySection = inquiryBody.createDiv({
            cls: ERT_CLASSES.STACK,
            attr: { [ERT_DATA.SECTION]: 'inquiry' }
        });
        renderInquirySection({
            app: this.app,
            plugin: this.plugin,
            containerEl: inquirySection,
            attachFolderSuggest: (t) => this.attachFolderSuggest(t)
        });



        const povSection = searchableContent.createDiv({ attr: { [ERT_DATA.SECTION]: 'pov' } });
        renderPovSection({ plugin: this.plugin, containerEl: povSection });

        const beatsWrapper = searchableContent.createDiv();
        renderTemplatesSection({ app: this.app, plugin: this.plugin, containerEl: beatsWrapper });

        const publicationSection = searchableContent.createDiv({ attr: { [ERT_DATA.SECTION]: 'publication' } });
        const publicationStack = publicationSection.createDiv({ cls: ERT_CLASSES.STACK });
        renderPublicationSection({
            plugin: this.plugin,
            containerEl: publicationStack,
            onCompletionPreviewRefresh: completionPreviewRefresh
        });
        this.renderProCallout(publicationSection, 'Runtime estimation for screenplay & audiobook', switchToProTab);

        const chronologueSection = searchableContent.createDiv({ attr: { [ERT_DATA.SECTION]: 'chronologue' } });
        renderChronologueSection({ app: this.app, plugin: this.plugin, containerEl: chronologueSection });

        const backdropSection = searchableContent.createDiv({ attr: { [ERT_DATA.SECTION]: 'backdrop' } });
        renderBackdropSection({ app: this.app, plugin: this.plugin, containerEl: backdropSection });

        const planetarySection = searchableContent.createDiv({ attr: { [ERT_DATA.SECTION]: 'planetary' } });
        renderPlanetaryTimeSection({ app: this.app, plugin: this.plugin, containerEl: planetarySection });

        const aiSection = searchableContent.createDiv({ attr: { [ERT_DATA.SECTION]: 'ai' } });
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

        const configurationSection = searchableContent.createDiv({ attr: { [ERT_DATA.SECTION]: 'configuration' } });
        renderConfigurationSection({ app: this.app, plugin: this.plugin, containerEl: configurationSection });

        const colorsWrapper = searchableContent.createDiv();
        renderColorsSection(colorsWrapper, this.plugin);

        const releaseNotesSection = searchableContent.createDiv({ attr: { [ERT_DATA.SECTION]: 'release-notes' } });
        void renderReleaseNotesSection({ plugin: this.plugin, containerEl: releaseNotesSection });

        const readmeSection = searchableContent.createDiv({ attr: { [ERT_DATA.SECTION]: 'readme' } });
        renderReadmeSection({ app: this.app, containerEl: readmeSection, setComponentRef: (c: Component | null) => { this.readmeComponent = c; } });

        this.applyElementBlockLayout(containerEl);
        this.addSearchMetadataToSettings(searchableContent);
    }

    hide() {
        if (this.readmeComponent) {
            this.readmeComponent.unload();
            this.readmeComponent = null;
        }
    }
}
