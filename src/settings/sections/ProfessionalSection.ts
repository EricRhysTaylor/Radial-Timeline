/*
 * Radial Timeline Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 * 
 * Professional License Settings Section
 */

import { App, Setting, setIcon, normalizePath, ToggleComponent } from 'obsidian';
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
 * During Open Beta, Pro features are enabled for everyone
 */
export function isProfessionalActive(plugin: RadialTimelinePlugin): boolean {
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
    
    // Pro experience toggle in header (replaces collapse arrow during beta)
    const toggleWrap = headerRow.createSpan({ cls: 'rt-professional-header-toggle' });
    const proToggle = new ToggleComponent(toggleWrap);
    proToggle.setValue(!!plugin.settings.proExperienceEnabled);
    proToggle.onChange(async (value) => {
        plugin.settings.proExperienceEnabled = value;
        await plugin.saveSettings();
    });
    
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
            text: 'Pro features are free during the Open Beta. Your feedback helps shape the future of Radial Timeline. When we launch paid licensing, early supporters may receive special perks.'
        });
        
        // Feedback link
        const feedbackLink = bannerText.createEl('a', {
            text: 'Share feedback →',
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
    // Professional Features List
    // ─────────────────────────────────────────────────────────────────────────
    const featuresEl = contentContainer.createDiv({ cls: 'rt-professional-features' });
    featuresEl.createEl('h5', { text: OPEN_BETA_ACTIVE ? 'Included in Early Access:' : 'Pro features include:' });
    
    const featuresList = featuresEl.createEl('ul');
    const features = [
        { icon: 'film', text: 'Runtime Estimation — Screen time and audiobook duration analysis' },
        // Future features can be added here
    ];
    
    features.forEach(feature => {
        const li = featuresList.createEl('li');
        const iconSpan = li.createSpan({ cls: 'rt-professional-feature-icon' });
        setIcon(iconSpan, feature.icon);
        li.createSpan({ text: feature.text });
    });

    // Pro experience toggle (controls premium hero/visuals elsewhere)
    const proExperience = new Setting(contentContainer)
        .setName('Enable pro early access experience')
        .setDesc('Show Pro visuals and hero card when Pro is active. Off by default during early access.')
        .addToggle(toggle => {
            toggle.setValue(!!plugin.settings.proExperienceEnabled);
            toggle.onChange(async (value) => {
                plugin.settings.proExperienceEnabled = value;
                await plugin.saveSettings();
            });
        });
    if (!isActive) {
        proExperience.controlEl.toggleClass('rt-setting-disabled', true);
        proExperience.descEl.setText('Activate Pro first, then enable the Pro experience visuals.');
    }

    // Export / Pandoc settings
    contentContainer.createEl('h5', { text: 'Export & Pandoc' });

    new Setting(contentContainer)
        .setName('Pandoc binary path')
        .setDesc('Optional: set a custom pandoc executable path. If blank, system PATH is used.')
        .addText(text => {
            text.setPlaceholder('/usr/local/bin/pandoc');
            text.setValue(plugin.settings.pandocPath || '');
            plugin.registerDomEvent(text.inputEl, 'blur', async () => {
                const value = text.getValue().trim();
                const normalized = value ? normalizePath(value) : '';
                plugin.settings.pandocPath = normalized;
                await plugin.saveSettings();
            });
        });

    new Setting(contentContainer)
        .setName('Enable fallback Pandoc')
        .setDesc('Attempt a secondary bundled/portable pandoc path if the primary is missing.')
        .addToggle(toggle => {
            toggle.setValue(!!plugin.settings.pandocEnableFallback);
            toggle.onChange(async (value) => {
                plugin.settings.pandocEnableFallback = value;
                await plugin.saveSettings();
            });
        });

    new Setting(contentContainer)
        .setName('Fallback Pandoc path')
        .setDesc('Optional path to a portable/bundled pandoc binary.')
        .addText(text => {
            text.setPlaceholder('/path/to/pandoc');
            text.setValue(plugin.settings.pandocFallbackPath || '');
            plugin.registerDomEvent(text.inputEl, 'blur', async () => {
                const value = text.getValue().trim();
                const normalized = value ? normalizePath(value) : '';
                plugin.settings.pandocFallbackPath = normalized;
                await plugin.saveSettings();
            });
        });

    const templateNote = contentContainer.createDiv({ cls: 'rt-professional-note' });
    templateNote.setText('Pandoc templates (optional): leave blank to use Pandoc defaults.');

    const templates = plugin.settings.pandocTemplates || {};

    new Setting(contentContainer)
        .setName('Template: Screenplay')
        .addText(text => {
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

    new Setting(contentContainer)
        .setName('Template: Podcast Script')
        .addText(text => {
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

    new Setting(contentContainer)
        .setName('Template: Novel Manuscript')
        .addText(text => {
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
