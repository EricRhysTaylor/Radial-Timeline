import { App, PluginSettingTab, Component, setIcon, TextComponent, normalizePath } from 'obsidian';
import { renderGeneralSection } from './sections/GeneralSection';
import { renderCompletionEstimatePreview, renderPublicationSection } from './sections/PublicationSection';
import { renderChronologueSection } from './sections/ChronologueSection';
import { renderBackdropSection } from './sections/BackdropSection';
import { renderBeatPropertiesSection } from './sections/BeatPropertiesSection';
import { renderAuthorProgressSection } from './sections/AuthorProgressSection';
import { renderInquirySection } from './sections/InquirySection';
import { fetchAnthropicModels } from '../api/anthropicApi';
import { fetchOpenAiModels } from '../api/openaiApi';
import RadialTimelinePlugin from '../main';
import { renderColorsSection } from './sections/ColorsSection';
import { renderReadmeSection } from './sections/ReadmeSection';
import { renderConfigurationSection } from './sections/ConfigurationSection';
import { renderAiSection } from './sections/AiSection';
import { renderReleaseNotesSection } from './sections/ReleaseNotesSection';
import { renderPovSection } from './sections/PovSection';
import { renderPlanetaryTimeSection } from './sections/PlanetaryTimeSection';

import { renderRuntimeSection } from './sections/RuntimeSection';
import { renderProEntitlementPanel } from './sections/ProEntitlementPanel';
import { renderProFeaturePanels } from './sections/ProFeaturePanels';
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
import { getCredential } from '../ai/credentials/credentials';
import type { AIProviderId } from '../ai/types';
import { fetchGeminiModels as fetchGoogleModels } from '../api/geminiApi';
import { getCanonicalAiSettings } from '../ai/runtime/runtimeSelection';
import { getLocalLlmBackend } from '../ai/localLlm/backends';
import { getLocalLlmSettings } from '../ai/localLlm/settings';

export class RadialTimelineSettingsTab extends PluginSettingTab {
    plugin: RadialTimelinePlugin;
    private readmeComponent: Component | null = null;
    private _providerSections: { anthropic?: HTMLElement; google?: HTMLElement; openai?: HTMLElement; ollama?: HTMLElement } = {};
    private _keyValidateTimers: Partial<Record<'anthropic' | 'google' | 'openai' | 'ollama', number>> = {};
    private _anthropicKeyInput?: HTMLInputElement;
    private _googleKeyInput?: HTMLInputElement;
    private _openaiKeyInput?: HTMLInputElement;
    private _ollamaBaseUrlInput?: HTMLInputElement;
    private _ollamaModelIdInput?: HTMLInputElement;
    private _aiRelatedElements: HTMLElement[] = [];
    private _activeTab: 'core' | 'social' | 'inquiry' | 'publishing' | 'ai' | 'advanced' = 'core';
    private _forceExpandCoreCompletionPreview = false;

    /** Public method to set active tab before/after opening settings */
    public setActiveTab(tab: 'core' | 'social' | 'inquiry' | 'publishing' | 'ai' | 'advanced'): void {
        this._activeTab = tab;
    }

    public revealSettingsSection(
        tab: 'core' | 'social' | 'inquiry' | 'publishing' | 'ai' | 'advanced',
        sectionKey: string
    ): void {
        this._activeTab = tab;
        window.setTimeout(() => this.scrollToSettingsSection(sectionKey), 0);
        window.setTimeout(() => this.scrollToSettingsSection(sectionKey), 180);
    }

    public forceExpandCoreCompletionPreview(): void {
        this._forceExpandCoreCompletionPreview = true;
    }

    constructor(app: App, plugin: RadialTimelinePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    private attachFolderSuggest(text: TextComponent) {
        const inputEl = text.inputEl;
        new FolderSuggest(this.app, inputEl, this.plugin, text);
    }

    private getSelectedAiProvider(): Exclude<AIProviderId, 'none'> {
        const provider = this.plugin.settings.aiSettings?.provider;
        if (provider === 'anthropic' || provider === 'google' || provider === 'openai' || provider === 'ollama') {
            return provider;
        }
        return 'openai';
    }

    private refreshProviderDimming() {
        const selected = this.getSelectedAiProvider();
        const map = this._providerSections;
        (['anthropic', 'google', 'openai', 'ollama'] as const).forEach(key => {
            const el = map[key];
            if (!el) return;
            const isSelected = key === selected;
            if (isSelected) {
                el.classList.remove('dimmed');
                el.classList.remove('ert-settings-hidden');
                el.classList.add('ert-settings-visible');
            } else {
                el.classList.add('dimmed');
                el.classList.remove('ert-settings-visible');
                el.classList.add('ert-settings-hidden');
            }
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

    private async scheduleKeyValidation(provider: 'anthropic' | 'google' | 'openai' | 'ollama') {
        const prior = this._keyValidateTimers[provider];
        if (prior) window.clearTimeout(prior);

        if (provider === 'ollama') {
            const selectedProvider = this.getSelectedAiProvider();
            if (selectedProvider !== 'ollama') return;
            const baseInput = this._ollamaBaseUrlInput;
            const modelInput = this._ollamaModelIdInput;
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
                const aiSettings = getCanonicalAiSettings(this.plugin);
                const localLlm = getLocalLlmSettings(aiSettings);
                const backend = getLocalLlmBackend(localLlm.backend);
                const apiKey = await getCredential(this.plugin, 'ollama');
                let reachable = false;
                let hasModel = false;
                try {
                    const models = await backend.listModels({
                        baseUrl,
                        timeoutMs: localLlm.timeoutMs,
                        apiKey
                    });
                    reachable = true;
                    hasModel = models.some(model => model.id === modelId);
                } catch {
                    reachable = false;
                }
                if (reachable && hasModel) {
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
            : provider === 'google' ? this._googleKeyInput
                : this._openaiKeyInput;
        if (!inputEl) return;

        const key = await getCredential(this.plugin, provider);
        if (!key || key.length < 8) return;

        this._keyValidateTimers[provider] = window.setTimeout(async () => {
            delete this._keyValidateTimers[provider];
            inputEl.removeClass('ert-setting-input-success');
            inputEl.removeClass('ert-setting-input-error');

            try {
                if (provider === 'anthropic') await fetchAnthropicModels(key);
                else if (provider === 'google') await fetchGoogleModels(key);
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

    private renderProCallout(containerEl: HTMLElement, text: string, switchToProTab: () => void): void {
        const callout = containerEl.createDiv({ cls: 'ert-pro-callout' });
        const badge = callout.createSpan({ cls: 'ert-pro-callout-badge' });
        setIcon(badge, 'signature');
        badge.createSpan({ text: 'Pro' });
        callout.createSpan({ cls: 'ert-pro-callout-text', text });
        callout.createSpan({ cls: 'ert-pro-callout-arrow', text: '→' });
        this.plugin.registerDomEvent(callout, 'click', () => { switchToProTab(); });
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
            kicker?: string;
            features?: { icon: string; text: string; targetSection?: string }[];
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
        const features = options.features || [];
        if (features.length > 0 && options.kicker) {
            const featuresSection = hero.createDiv({
                cls: `${ERT_CLASSES.HERO_FEATURES} ${ERT_CLASSES.STACK} ${ERT_CLASSES.STACK_TIGHT}`
            });
            featuresSection.createEl('h5', { text: options.kicker, cls: 'ert-kicker' });
            const featuresList = featuresSection.createEl('ul', { cls: ERT_CLASSES.STACK });
            features.forEach(feature => {
                const li = featuresList.createEl('li', {
                    cls: `${ERT_CLASSES.INLINE} ert-feature-item${feature.targetSection ? ' ert-feature-item--link' : ''}`
                });
                const iconSpan = li.createSpan({ cls: 'ert-feature-icon' });
                setIcon(iconSpan, feature.icon);
                li.createSpan({ text: feature.text });
                if (feature.targetSection) {
                    li.setAttr('role', 'button');
                    li.setAttr('tabindex', '0');
                    li.setAttr('aria-label', `Jump to ${feature.text}`);
                    this.plugin.registerDomEvent(li, 'click', () => this.scrollToSettingsSection(feature.targetSection!));
                    this.plugin.registerDomEvent(li, 'keydown', (evt: KeyboardEvent) => {
                        if (evt.key !== 'Enter' && evt.key !== ' ') return;
                        evt.preventDefault();
                        this.scrollToSettingsSection(feature.targetSection!);
                    });
                }
            });
        }
    }

    private scrollToSettingsSection(sectionKey: string): void {
        const target = this.containerEl.querySelector<HTMLElement>(`[${ERT_DATA.SECTION}="${sectionKey}"]`);
        if (!target) return;
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    private renderProHero(containerEl: HTMLElement): void {
        this.renderSettingsHero(containerEl, {
            badgeLabel: 'PRO',
            badgeIcon: 'signature',
            badgeVariant: ERT_CLASSES.BADGE_PILL_PRO,
            wikiHref: 'https://github.com/EricRhysTaylor/radial-timeline/wiki/Settings#professional',
            title: 'Pro extends the core experience.',
            subtitle: 'More control, more capacity, and deeper narrative tools. Take your writing to the next level with the features that speed workflow and elevate productivity.',
            kicker: 'Pro unlocks:',
            features: [
                { icon: 'file-output', text: 'Advanced exports — PDF, Outline, and structured data formats' },
                { icon: 'layout-grid', text: 'Publishing workflows, runtime planning, and advanced campaign tools' },
                { icon: 'waves', text: 'Extended Inquiry prompts' },
                { icon: 'timer', text: 'Runtime estimation and session planning' },
                { icon: 'radio', text: 'Social campaign management and teaser controls' },
            ]
        });
    }

    private renderPublishingHero(containerEl: HTMLElement): void {
        this.renderSettingsHero(containerEl, {
            badgeLabel: 'PUBLISHING',
            badgeIcon: 'book-open-text',
            badgeVariant: ERT_CLASSES.BADGE_PILL_PRO,
            wikiHref: 'https://github.com/EricRhysTaylor/radial-timeline/wiki/Settings#professional',
            title: 'Set up your book for export.',
            subtitle: 'Add your book details, review your pages, choose a PDF style, and check export readiness.',
            kicker: 'PUBLISHING STEPS',
            features: [
                { icon: 'file-text', text: 'Book Details — Define title, author, and publishing info', targetSection: 'book-details' },
                { icon: 'book-open-text', text: 'Book Pages — Add title page, dedication, epigraph, and more', targetSection: 'book-pages' },
                { icon: 'layout-grid', text: 'PDF Style — Choose the layout for your manuscript', targetSection: 'pdf-style' },
                { icon: 'check-circle-2', text: 'Export Check — Make sure everything is ready', targetSection: 'export-check' }
            ]
        });
    }

    private renderAdvancedHero(containerEl: HTMLElement): void {
        this.renderSettingsHero(containerEl, {
            badgeLabel: 'Advanced',
            badgeIcon: 'pyramid',
            badgeVariant: ERT_CLASSES.BADGE_PILL_NEUTRAL,
            wikiHref: 'https://github.com/EricRhysTaylor/radial-timeline/wiki/Settings#configuration',
            title: 'Advanced settings and system controls.',
            subtitle: 'This tab now holds configuration-first controls that support the rest of the plugin without crowding your day-to-day writing setup.',
            kicker: 'Currently here:',
            features: [
                { icon: 'folder-cog', text: 'Logs, output folders, and generated file locations' },
                { icon: 'waypoints', text: 'Metadata remapping and manuscript behavior controls' },
                { icon: 'settings-2', text: 'Room for deeper system settings as Advanced grows' },
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
                { icon: 'search', text: 'Source Scans — Choose scan locations, class scopes, and source types to include.' },
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
            subtitle: 'The Radial Timeline is designed to empower you, the author, toward greater productivity and accountability. Use Core settings to align the timeline with your manuscript’s structure, sharpen your workflow, and move faster with clarity.',
            kicker: 'Core Highlights:',
            features: [
                { icon: 'layout-grid', text: 'Story structure — manage scenes, beats, templates, and advanced fields.' },
                { icon: 'orbit', text: 'Chronologue & time — align chronologue, backdrop, and planetary clocks' },
                { icon: 'timer', text: 'Runtime estimation — calibrate pacing profiles and estimate reading or listening time.' },
            ]
        });
    }

    private renderCoreQuickLinks(containerEl: HTMLElement, links: Array<{ label: string; target: HTMLElement | null }>): void {
        const row = containerEl.createDiv({ cls: `${ERT_CLASSES.INLINE} ert-coreQuickLinks` });
        row.createSpan({ cls: 'ert-coreQuickLinks__label', text: 'Quick Links' });

        links.forEach(({ label: text, target }) => {
            if (!target) return;
            const button = row.createEl('button', {
                cls: `${ERT_CLASSES.PILL_BTN} ${ERT_CLASSES.PILL_BTN_STANDARD} ert-coreQuickLinks__pill`,
                attr: { type: 'button', 'aria-label': `Jump to ${text}` }
            });
            button.createSpan({ cls: ERT_CLASSES.PILL_BTN_LABEL, text });
            const iconEl = button.createSpan({ cls: ERT_CLASSES.PILL_BTN_ICON });
            setIcon(iconEl, 'corner-right-down');
            this.plugin.registerDomEvent(button, 'click', () => {
                target.scrollIntoView({ block: 'start' });
            });
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
        const coreTab = tabBar.createDiv({ cls: 'ert-settings-tab' });
        const coreIcon = coreTab.createSpan({ cls: 'ert-settings-tab-icon' });
        setIcon(coreIcon, 'settings');
        coreTab.createSpan({ text: 'Core', cls: 'ert-settings-tab-label' });

        const socialTab = tabBar.createDiv({ cls: 'ert-settings-tab ert-settings-tab-social' });
        const socialIcon = socialTab.createSpan({ cls: 'ert-settings-tab-icon' });
        setIcon(socialIcon, 'radio');
        socialTab.createSpan({ text: 'Social', cls: 'ert-settings-tab-label' });
        const inquiryTab = tabBar.createDiv({ cls: 'ert-settings-tab' });
        const inquiryIcon = inquiryTab.createSpan({ cls: 'ert-settings-tab-icon' });
        setIcon(inquiryIcon, 'waves');
        inquiryTab.createSpan({ text: 'Inquiry', cls: 'ert-settings-tab-label' });
        const publishingTab = tabBar.createDiv({ cls: 'ert-settings-tab ert-settings-tab-publishing' });
        const publishingIcon = publishingTab.createSpan({ cls: 'ert-settings-tab-icon' });
        setIcon(publishingIcon, 'signature');
        publishingTab.createSpan({ text: 'Publishing', cls: 'ert-settings-tab-label' });
        const aiTab = tabBar.createDiv({ cls: 'ert-settings-tab' });
        const aiIcon = aiTab.createSpan({ cls: 'ert-settings-tab-icon' });
        setIcon(aiIcon, 'cpu');
        aiTab.createSpan({ text: 'AI', cls: 'ert-settings-tab-label' });
        const advancedTab = tabBar.createDiv({ cls: 'ert-settings-tab' });
        const advancedIcon = advancedTab.createSpan({ cls: 'ert-settings-tab-icon' });
        setIcon(advancedIcon, 'pyramid');
        advancedTab.createSpan({ text: 'Advanced', cls: 'ert-settings-tab-label' });

        const coreContent = containerEl.createDiv({ cls: 'ert-settings-tab-content ert-settings-core-content ert-scope--settings' });
        const socialContent = containerEl.createDiv({
            cls: 'ert-settings-tab-content ert-settings-social-content ert-ui ert-scope--settings ert-skin--social ert-density--compact'
        });
        const inquiryContent = containerEl.createDiv({ cls: 'ert-settings-tab-content ert-settings-inquiry-content ert-scope--settings' });
        const publishingContent = containerEl.createDiv({
            cls: `ert-settings-tab-content ert-settings-publishing-content ${ERT_CLASSES.ROOT} ert-scope--settings ${ERT_CLASSES.SKIN_PRO}`
        });
        const aiContent = containerEl.createDiv({ cls: 'ert-settings-tab-content ert-settings-ai-content ert-scope--settings' });
        const advancedContent = containerEl.createDiv({ cls: 'ert-settings-tab-content ert-settings-advanced-content ert-scope--settings' });

        const updateTabState = () => {
            coreTab.toggleClass('ert-settings-tab-active', this._activeTab === 'core');
            socialTab.toggleClass('ert-settings-tab-active', this._activeTab === 'social');
            inquiryTab.toggleClass('ert-settings-tab-active', this._activeTab === 'inquiry');
            publishingTab.toggleClass('ert-settings-tab-active', this._activeTab === 'publishing');
            aiTab.toggleClass('ert-settings-tab-active', this._activeTab === 'ai');
            advancedTab.toggleClass('ert-settings-tab-active', this._activeTab === 'advanced');
            coreContent.toggleClass('ert-hidden', this._activeTab !== 'core');
            socialContent.toggleClass('ert-hidden', this._activeTab !== 'social');
            inquiryContent.toggleClass('ert-hidden', this._activeTab !== 'inquiry');
            publishingContent.toggleClass('ert-hidden', this._activeTab !== 'publishing');
            aiContent.toggleClass('ert-hidden', this._activeTab !== 'ai');
            advancedContent.toggleClass('ert-hidden', this._activeTab !== 'advanced');
        };

        this.plugin.registerDomEvent(coreTab, 'click', () => { this._activeTab = 'core'; updateTabState(); });
        this.plugin.registerDomEvent(socialTab, 'click', () => { this._activeTab = 'social'; updateTabState(); });
        this.plugin.registerDomEvent(inquiryTab, 'click', () => { this._activeTab = 'inquiry'; updateTabState(); });
        this.plugin.registerDomEvent(publishingTab, 'click', () => { this._activeTab = 'publishing'; updateTabState(); });
        this.plugin.registerDomEvent(aiTab, 'click', () => { this._activeTab = 'ai'; updateTabState(); });
        this.plugin.registerDomEvent(advancedTab, 'click', () => { this._activeTab = 'advanced'; updateTabState(); });
        updateTabState();

        const publishingStack = publishingContent.createDiv({ cls: ERT_CLASSES.STACK });
        this.renderPublishingHero(publishingStack);
        const refreshProDependentSections = () => this.display();
        const publishingPanels = publishingStack.createDiv({ cls: ERT_CLASSES.STACK });
        renderProFeaturePanels({
            app: this.app,
            plugin: this.plugin,
            containerEl: publishingPanels
        });

        const advancedStack = advancedContent.createDiv({ cls: ERT_CLASSES.STACK });
        const advancedIntro = advancedStack.createDiv({ cls: ERT_CLASSES.STACK });
        this.renderAdvancedHero(advancedIntro);
        const advancedEntitlement = advancedStack.createDiv({ cls: `${ERT_CLASSES.STACK} ${ERT_CLASSES.SKIN_PRO}` });
        renderProEntitlementPanel({
            app: this.app,
            plugin: this.plugin,
            containerEl: advancedEntitlement,
            onEntitlementChanged: refreshProDependentSections
        });
        const advancedConfigurationSection = advancedStack.createDiv({ attr: { [ERT_DATA.SECTION]: 'configuration' } });
        renderConfigurationSection({
            app: this.app,
            plugin: this.plugin,
            containerEl: advancedConfigurationSection,
            attachFolderSuggest: (t) => this.attachFolderSuggest(t)
        });

        // Social Tab Content - Social Section
        renderAuthorProgressSection({ app: this.app, plugin: this.plugin, containerEl: socialContent });

        const inquiryStack = inquiryContent.createDiv({ cls: ERT_CLASSES.STACK });
        this.renderInquiryHero(inquiryStack);
        const inquiryBody = inquiryStack.createDiv({ cls: 'ert-settings-searchable-content' });

        const coreStack = coreContent.createDiv({ cls: ERT_CLASSES.STACK });
        this.renderCoreHero(coreStack);
        const forceExpandCompletionPreview = this._forceExpandCoreCompletionPreview;
        this._forceExpandCoreCompletionPreview = false;

        let beatsStorySection: HTMLElement | null = null;
        let backdropSection: HTMLElement | null = null;
        let chronologueSection: HTMLElement | null = null;
        let generalSection: HTMLElement | null = null;
        let progressSection: HTMLElement | null = null;

        const quickLinksRow = coreStack.createDiv();

        const completionRow = coreStack.createDiv();
        const completionPreviewRefresh = renderCompletionEstimatePreview({
            app: this.app,
            plugin: this.plugin,
            containerEl: completionRow,
            frameClass: 'ert-previewFrame--flush',
            forceExpanded: forceExpandCompletionPreview
        });

        const coreBody = coreStack.createDiv();
        const searchableContent = coreBody.createDiv({ cls: 'ert-settings-searchable-content' });

        generalSection = searchableContent.createDiv({
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

        progressSection = searchableContent.createDiv({ attr: { [ERT_DATA.SECTION]: 'progress' } });
        const progressStack = progressSection.createDiv({ cls: ERT_CLASSES.STACK });

        const publicationSection = progressStack.createDiv({ attr: { [ERT_DATA.SECTION]: 'publication' } });
        const publicationStack = publicationSection.createDiv({ cls: ERT_CLASSES.STACK });
        renderPublicationSection({
            plugin: this.plugin,
            containerEl: publicationStack,
            onCompletionPreviewRefresh: completionPreviewRefresh
        });

        const runtimeSection = searchableContent.createDiv({
            cls: `${ERT_CLASSES.ROOT} ${ERT_CLASSES.SKIN_PRO}`,
            attr: { [ERT_DATA.SECTION]: 'runtime' }
        });
        renderRuntimeSection({ app: this.app, plugin: this.plugin, containerEl: runtimeSection });

        const beatsWrapper = searchableContent.createDiv();
        const backdropYamlTarget = createDiv();
        renderBeatPropertiesSection({ app: this.app, plugin: this.plugin, containerEl: beatsWrapper, backdropYamlTargetEl: backdropYamlTarget });
        beatsStorySection = beatsWrapper.querySelector<HTMLElement>(`[${ERT_DATA.SECTION}="beats-story"]`);
        const beatsActsSection = beatsWrapper.querySelector<HTMLElement>(`[${ERT_DATA.SECTION}="beats-acts"]`);
        const beatsYamlSection = beatsWrapper.querySelector<HTMLElement>(`[${ERT_DATA.SECTION}="beats-yaml"]`);
        if (beatsStorySection) beatsWrapper.appendChild(beatsStorySection);
        if (beatsActsSection) beatsWrapper.appendChild(beatsActsSection);
        if (beatsYamlSection) beatsWrapper.appendChild(beatsYamlSection);

        chronologueSection = searchableContent.createDiv({ attr: { [ERT_DATA.SECTION]: 'chronologue' } });
        renderChronologueSection({ app: this.app, plugin: this.plugin, containerEl: chronologueSection });

        const povSection = searchableContent.createDiv({ attr: { [ERT_DATA.SECTION]: 'pov' } });
        renderPovSection({ plugin: this.plugin, containerEl: povSection });

        const planetarySection = searchableContent.createDiv({ attr: { [ERT_DATA.SECTION]: 'planetary' } });
        renderPlanetaryTimeSection({ app: this.app, plugin: this.plugin, containerEl: planetarySection });

        backdropSection = searchableContent.createDiv({ attr: { [ERT_DATA.SECTION]: 'backdrop' } });
        renderBackdropSection({ app: this.app, plugin: this.plugin, containerEl: backdropSection });
        backdropSection.appendChild(backdropYamlTarget);

        const colorsWrapper = searchableContent.createDiv();
        renderColorsSection(colorsWrapper, this.plugin);

        const readmeSection = searchableContent.createDiv({ attr: { [ERT_DATA.SECTION]: 'readme' } });
        renderReadmeSection({ app: this.app, containerEl: readmeSection, setComponentRef: (c: Component | null) => { this.readmeComponent = c; } });

        this.renderCoreQuickLinks(quickLinksRow, [
            { label: 'Books', target: generalSection },
            { label: 'Progress', target: progressSection },
            { label: 'Story beats', target: beatsStorySection },
            { label: 'Chronology', target: chronologueSection },
            { label: 'Backdrop', target: backdropSection }
        ]);

        // Refactor alerts (shown at top when migrations are needed)
        const alertsRow = coreStack.createDiv();
        this.renderRefactorAlerts(alertsRow);

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

        const releaseNotesSection = searchableContent.createDiv({ attr: { [ERT_DATA.SECTION]: 'release-notes' } });
        void renderReleaseNotesSection({ plugin: this.plugin, containerEl: releaseNotesSection });

        const aiSection = aiContent.createDiv({ attr: { [ERT_DATA.SECTION]: 'ai' } });
        try {
            renderAiSection({
                app: this.app,
                plugin: this.plugin,
                containerEl: aiSection,
                addAiRelatedElement: (el: HTMLElement) => this._aiRelatedElements.push(el),
                toggleAiSettingsVisibility: (show: boolean) => this.toggleAiSettingsVisibility(show),
                refreshProviderDimming: () => this.refreshProviderDimming(),
                scheduleKeyValidation: (p: 'anthropic' | 'google' | 'openai' | 'ollama') => { void this.scheduleKeyValidation(p); },
                setProviderSections: (sections) => { this._providerSections = sections; },
                setKeyInputRef: (provider, input) => {
                    if (provider === 'anthropic') this._anthropicKeyInput = input;
                    if (provider === 'google') this._googleKeyInput = input;
                    if (provider === 'openai') this._openaiKeyInput = input;
                },
                setOllamaConnectionInputs: ({ baseInput, modelInput }) => {
                    if (baseInput) this._ollamaBaseUrlInput = baseInput;
                    if (modelInput) this._ollamaModelIdInput = modelInput;
                },
            });
        } catch (error) {
            console.error('[Settings] Failed to render AI tab content:', error);
            const fallback = aiSection.createDiv({ cls: `${ERT_CLASSES.CARD} ${ERT_CLASSES.STACK}` });
            fallback.createDiv({ cls: ERT_CLASSES.SECTION_TITLE, text: 'AI settings unavailable' });
            fallback.createDiv({
                cls: ERT_CLASSES.SECTION_DESC,
                text: 'AI settings could not be fully rendered. Reopen settings after updating your configuration.'
            });
        }

        this.applyElementBlockLayout(containerEl);
    }

    hide() {
        if (this.readmeComponent) {
            this.readmeComponent.unload();
            this.readmeComponent = null;
        }
    }
}
