/*
 * Radial Timeline Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 * 
 * Professional License Settings Section
 */

import { App, Setting, setIcon, normalizePath } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { addWikiLink } from '../wikiLink';

// ═══════════════════════════════════════════════════════════════════════════════
// OPEN BETA CONFIGURATION
// Set to false when transitioning to paid licensing
// ═══════════════════════════════════════════════════════════════════════════════
const OPEN_BETA_ACTIVE = true;

interface SectionParams {
    app: App;
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
}

/**
 * Check if a professional license key is valid
 */
export function isProfessionalLicenseValid(key: string | undefined): boolean {
    if (!key || key.trim().length === 0) {
        return false;
    }
    // TODO: Connect to license validation API when beta ends
    return key.trim().length >= 16;
}

/**
 * Check if the professional tier is active
 * During Open Beta, Pro features are enabled for everyone (unless dev toggle is off)
 */
export function isProfessionalActive(plugin: RadialTimelinePlugin): boolean {
    // Check dev toggle for testing (defaults to true if undefined)
    if (plugin.settings.devProActive === false) {
        return false;
    }
    
    // During Open Beta, everyone gets Pro access
    if (OPEN_BETA_ACTIVE) {
        return true;
    }
    return isProfessionalLicenseValid(plugin.settings.professionalLicenseKey);
}

/**
 * Check if we're in Open Beta mode
 */
export function isOpenBeta(): boolean {
    return OPEN_BETA_ACTIVE;
}

export function renderProfessionalSection({ plugin, containerEl }: SectionParams): void {
    const hasValidKey = isProfessionalLicenseValid(plugin.settings.professionalLicenseKey);
    const isActive = isProfessionalActive(plugin);
    
    // ─────────────────────────────────────────────────────────────────────────
    // Combined Header/Status Bar
    // ─────────────────────────────────────────────────────────────────────────
    const headerContainer = containerEl.createDiv({ cls: 'rt-professional-header' });
    if (isActive) {
        headerContainer.addClass('rt-professional-active');
    }
    if (OPEN_BETA_ACTIVE) {
        headerContainer.addClass('rt-professional-beta');
    }
    
    const headerRow = headerContainer.createDiv({ cls: 'rt-professional-header-row' });
    
    // Icon - always use signature for brand consistency
    const iconEl = headerRow.createSpan({ cls: 'rt-professional-icon' });
    setIcon(iconEl, 'signature');
    
    // Title text
    const titleEl = headerRow.createSpan({ cls: 'rt-professional-title' });
    if (OPEN_BETA_ACTIVE) {
        titleEl.setText('Pro · Early Access');
    } else {
        titleEl.setText(isActive ? 'Pro features active' : 'Pro');
    }
    
    // Wiki link (only when not active)
    if (!isActive) {
        const linkContainer = headerRow.createSpan({ cls: 'rt-professional-wiki-link' });
        const dummySetting = new Setting(linkContainer);
        dummySetting.settingEl.addClass('rt-professional-heading-inline');
        addWikiLink(dummySetting, 'Settings#professional');
    }
    
    // Content container (always expanded during beta)
    const contentContainer = containerEl.createDiv({ cls: 'rt-professional-content' });
    
    // ─────────────────────────────────────────────────────────────────────────
    // Open Beta Banner (shown during beta period)
    // ─────────────────────────────────────────────────────────────────────────
    if (OPEN_BETA_ACTIVE) {
        const betaBanner = contentContainer.createDiv({ cls: 'rt-professional-beta-banner' });
        
        const bannerIcon = betaBanner.createSpan({ cls: 'rt-professional-beta-icon' });
        setIcon(bannerIcon, 'signature');
        
        const bannerText = betaBanner.createDiv({ cls: 'rt-professional-beta-text' });
        bannerText.createEl('strong', { text: 'Thank you for being an early adopter!' });
        bannerText.createEl('p', { 
            text: 'Pro features are free during the Open Beta. Your feedback helps shape the future of Radial Timeline.'
        });
        
        // Reward callout
        const rewardText = bannerText.createEl('p', { cls: 'rt-professional-reward-text' });
        rewardText.createEl('strong', { text: '🎁 Early Adopter Reward: ' });
        rewardText.createSpan({ 
            text: 'Submit helpful feedback or bug reports and receive one year of Pro free when we launch paid licensing!' 
        });
        
        // Feedback link
        const feedbackLink = bannerText.createEl('a', {
            text: 'Share feedback & claim your reward →',
            href: 'https://radial-timeline.com/feedback',
            cls: 'rt-professional-feedback-link',
            attr: { target: '_blank', rel: 'noopener' }
        });
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // License Key Section (post-beta only; hidden during early access)
    if (!OPEN_BETA_ACTIVE) {
        const licenseSetting = new Setting(contentContainer)
            .setDesc('Enter your Pro license key to unlock advanced features.')
            .addText(text => {
                text.setPlaceholder('XXXX-XXXX-XXXX-XXXX');
                text.setValue(plugin.settings.professionalLicenseKey || '');
                text.inputEl.addClass('rt-input-lg');
                text.inputEl.type = 'password';
                
                // Add show/hide toggle
                const toggleVis = text.inputEl.parentElement?.createEl('button', { 
                    cls: 'rt-professional-key-toggle',
                    attr: { type: 'button', 'aria-label': 'Show/hide license key' }
                });
                if (toggleVis) {
                    setIcon(toggleVis, 'eye');
                    plugin.registerDomEvent(toggleVis, 'click', () => {
                        if (text.inputEl.type === 'password') {
                            text.inputEl.type = 'text';
                            setIcon(toggleVis, 'eye-off');
                        } else {
                            text.inputEl.type = 'password';
                            setIcon(toggleVis, 'eye');
                        }
                    });
                }
                
                plugin.registerDomEvent(text.inputEl, 'blur', async () => {
                    const value = text.getValue().trim();
                    plugin.settings.professionalLicenseKey = value || undefined;
                    await plugin.saveSettings();
                    containerEl.empty();
                    renderProfessionalSection({ app: plugin.app, plugin, containerEl });
                });
            });
        
        // Custom name with inline link
        const nameEl = licenseSetting.nameEl;
        nameEl.empty();
        nameEl.createSpan({ text: 'License key' });
        nameEl.createEl('a', {
            text: 'Get key →',
            href: 'https://radial-timeline.com/signature',
            cls: 'rt-professional-get-key-link',
            attr: { target: '_blank', rel: 'noopener' }
        });
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // Export / Pandoc Section (Pro feature with styled container)
    // ─────────────────────────────────────────────────────────────────────────
    const pandocContainer = contentContainer.createDiv({ cls: 'rt-pro-section-card' });

    // Heading with Pro badge
    const pandocHeading = new Setting(pandocContainer)
        .setName('Export & Pandoc')
        .setDesc('Configure Pandoc binary paths and manuscript export templates for screenplay, podcast, and novel formats.');
    pandocHeading.settingEl.addClass('rt-pro-setting');

    // Add Pro badge BEFORE the heading text
    const pandocNameEl = pandocHeading.nameEl;
    const pandocBadge = createEl('span', { cls: 'rt-pro-badge' });
    setIcon(pandocBadge, 'signature');
    pandocBadge.createSpan({ text: 'Pro' });
    pandocNameEl.insertBefore(pandocBadge, pandocNameEl.firstChild);

    new Setting(pandocContainer)
        .setName('Pandoc binary path')
        .setDesc('Optional: set a custom pandoc executable path. If blank, system PATH is used.')
        .addText(text => {
            text.inputEl.addClass('rt-input-lg');
            text.setPlaceholder('/usr/local/bin/pandoc');
            text.setValue(plugin.settings.pandocPath || '');
            plugin.registerDomEvent(text.inputEl, 'blur', async () => {
                const value = text.getValue().trim();
                const normalized = value ? normalizePath(value) : '';
                plugin.settings.pandocPath = normalized;
                await plugin.saveSettings();
            });
        });

    new Setting(pandocContainer)
        .setName('Enable fallback Pandoc')
        .setDesc('Attempt a secondary bundled/portable pandoc path if the primary is missing.')
        .addToggle(toggle => {
            toggle.setValue(!!plugin.settings.pandocEnableFallback);
            toggle.onChange(async (value) => {
                plugin.settings.pandocEnableFallback = value;
                await plugin.saveSettings();
            });
        });

    new Setting(pandocContainer)
        .setName('Fallback Pandoc path')
        .setDesc('Optional path to a portable/bundled pandoc binary.')
        .addText(text => {
            text.inputEl.addClass('rt-input-lg');
            text.setPlaceholder('/path/to/pandoc');
            text.setValue(plugin.settings.pandocFallbackPath || '');
            plugin.registerDomEvent(text.inputEl, 'blur', async () => {
                const value = text.getValue().trim();
                const normalized = value ? normalizePath(value) : '';
                plugin.settings.pandocFallbackPath = normalized;
                await plugin.saveSettings();
            });
        });

    // Templates sub-section with proper container
    const templatesCard = pandocContainer.createDiv({ cls: 'rt-pro-subsection' });
    templatesCard.createDiv({ cls: 'rt-pro-subsection-heading', text: 'Pandoc templates' });
    templatesCard.createDiv({ cls: 'rt-pro-subsection-note', text: 'Optional: leave blank to use Pandoc defaults.' });

    const templates = plugin.settings.pandocTemplates || {};

    new Setting(templatesCard)
        .setName('Template: Screenplay')
        .addText(text => {
            text.inputEl.addClass('rt-input-lg');
            text.setPlaceholder('vault/path/to/screenplay_template.tex');
            text.setValue(templates.screenplay || '');
            plugin.registerDomEvent(text.inputEl, 'blur', async () => {
                plugin.settings.pandocTemplates = {
                    ...plugin.settings.pandocTemplates,
                    screenplay: text.getValue().trim()
                };
                await plugin.saveSettings();
            });
        });

    new Setting(templatesCard)
        .setName('Template: Podcast Script')
        .addText(text => {
            text.inputEl.addClass('rt-input-lg');
            text.setPlaceholder('vault/path/to/podcast_template.tex');
            text.setValue(templates.podcast || '');
            plugin.registerDomEvent(text.inputEl, 'blur', async () => {
                plugin.settings.pandocTemplates = {
                    ...plugin.settings.pandocTemplates,
                    podcast: text.getValue().trim()
                };
                await plugin.saveSettings();
            });
        });

    new Setting(templatesCard)
        .setName('Template: Novel Manuscript')
        .addText(text => {
            text.inputEl.addClass('rt-input-lg');
            text.setPlaceholder('vault/path/to/novel_template.tex');
            text.setValue(templates.novel || '');
            plugin.registerDomEvent(text.inputEl, 'blur', async () => {
                plugin.settings.pandocTemplates = {
                    ...plugin.settings.pandocTemplates,
                    novel: text.getValue().trim()
                };
                await plugin.saveSettings();
            });
        });
}
