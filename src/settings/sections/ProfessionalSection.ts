/*
 * Radial Timeline Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 * 
 * Professional License Settings Section
 */

import { App, Setting, setIcon, normalizePath } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { ERT_CLASSES } from '../../ui/classes';

// ═══════════════════════════════════════════════════════════════════════════════
// OPEN BETA CONFIGURATION
// Set to false when transitioning to paid licensing
// ═══════════════════════════════════════════════════════════════════════════════
const OPEN_BETA_ACTIVE = true;

interface SectionParams {
    app: App;
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
    renderHero?: (containerEl: HTMLElement) => void;
    onProToggle?: () => void;
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

export function renderProfessionalSection({ plugin, containerEl, renderHero, onProToggle }: SectionParams): HTMLElement {
    const hasValidKey = isProfessionalLicenseValid(plugin.settings.professionalLicenseKey);
    const isActive = isProfessionalActive(plugin);

    // ─────────────────────────────────────────────────────────────────────────
    // ROOT CONTAINER (Pro Skin)
    // ─────────────────────────────────────────────────────────────────────────
    const section = containerEl.createDiv({ cls: ERT_CLASSES.STACK });

    // ─────────────────────────────────────────────────────────────────────────
    // HERO / HEADER
    // ─────────────────────────────────────────────────────────────────────────
    // Render external hero hook (if any)
    renderHero?.(section);

    // ─────────────────────────────────────────────────────────────────────────
    // HERO / HEADER (Legacy Layout Restored)
    // ─────────────────────────────────────────────────────────────────────────
    const hero = section.createDiv({ cls: `${ERT_CLASSES.CARD} ${ERT_CLASSES.CARD_HERO} ${ERT_CLASSES.STACK}` });

    // Badge Row
    const badgeRow = hero.createDiv({ cls: ERT_CLASSES.INLINE });

    // Status Badge (Standardized Pill)
    const badge = badgeRow.createSpan({ cls: `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_PRO}` });

    const iconSpan = badge.createSpan({ cls: ERT_CLASSES.BADGE_PILL_ICON });
    setIcon(iconSpan, 'signature');

    badge.createSpan({
        cls: ERT_CLASSES.BADGE_PILL_TEXT,
        text: isActive ? 'PRO FEATURES ACTIVE' : 'PRO INACTIVE'
    });

    // Wiki Link Icon
    const wikiLink = badge.createEl('a', {
        href: 'https://github.com/EricRhysTaylor/radial-timeline/wiki/Settings#professional',
        cls: 'ert-badgePill__rightIcon',
        attr: {
            'aria-label': 'Read more in the Wiki',
            'target': '_blank',
            'rel': 'noopener'
        }
    });
    setIcon(wikiLink, 'external-link');

    // Beta Badge
    if (OPEN_BETA_ACTIVE) {
        const betaBadge = badgeRow.createSpan({
            cls: `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_NEUTRAL} ${ERT_CLASSES.BADGE_PILL_SM}`
        });
        betaBadge.createSpan({ cls: ERT_CLASSES.BADGE_PILL_TEXT, text: 'EARLY ACCESS BETA' });
    }

    // Toggle (Moved to Top Right)
    const toggleContainer = badgeRow.createDiv({ cls: `${ERT_CLASSES.SECTION_ACTIONS} ${ERT_CLASSES.CHIP}` });

    toggleContainer.createSpan({
        cls: `ert-toggle-label ${isActive ? ERT_CLASSES.IS_ACTIVE : ''}`,
        text: isActive ? 'Active' : 'Inactive'
    });

    const checkbox = toggleContainer.createEl('input', {
        type: 'checkbox',
        cls: 'ert-toggle-input'
    });
    checkbox.checked = plugin.settings.devProActive !== false;
    const rerender = () => {
        if (onProToggle) {
            onProToggle();
            return;
        }
        containerEl.empty();
        renderProfessionalSection({ app: plugin.app, plugin, containerEl, renderHero, onProToggle });
    };

    checkbox.onchange = async () => {
        plugin.settings.devProActive = checkbox.checked;
        await plugin.saveSettings();
        rerender();
    };

    // ─────────────────────────────────────────────────────────────────────────
    // CONTENT STACK
    // ─────────────────────────────────────────────────────────────────────────
    const addProRow = (setting: Setting) => setting;
    const lockPanel = (panel: HTMLElement) => {
        if (!isActive) {
            panel.addClass('ert-pro-locked');
        }
        return panel;
    };

    // Open Beta Banner
    if (OPEN_BETA_ACTIVE) {
        const betaPanel = lockPanel(section.createDiv({ cls: `${ERT_CLASSES.PANEL} ${ERT_CLASSES.STACK}` }));

        const bannerHeader = betaPanel.createDiv({ cls: ERT_CLASSES.INLINE });
        const bannerIcon = bannerHeader.createSpan({ cls: 'ert-setting-heading-icon' });
        setIcon(bannerIcon, 'gift');
        bannerHeader.createEl('strong', { text: 'Thank you for supporting the future of Radial Timeline!' });

        betaPanel.createEl('p', {
            cls: ERT_CLASSES.SECTION_DESC,
            text: 'Pro features are free during the Open Beta. Share feedback and get a free month of Pro.'
        });

        const rewardBox = betaPanel.createDiv({ cls: [ERT_CLASSES.PREVIEW_FRAME, 'ert-previewFrame--flush'] });
        const p = rewardBox.createEl('p', { attr: { style: 'margin: 0; line-height: 1.5;' } });
        p.createEl('strong', { text: 'Founding Pro Reward: ' });
        p.createSpan({ text: 'During the first year of Pro, for every unique bug report, you will recieve one month of Pro free.' });

        const feedbackLink = betaPanel.createEl('a', {
            text: 'Share feedback & claim your reward →',
            href: 'https://radial-timeline.com/feedback',
            cls: 'ert-link-accent',
            attr: { target: '_blank', rel: 'noopener' }
        });
    }

    // License Key (Post-Beta)
    if (!OPEN_BETA_ACTIVE) {
        const licensePanel = lockPanel(section.createDiv({ cls: `${ERT_CLASSES.PANEL} ${ERT_CLASSES.STACK}` }));
        const licenseSetting = addProRow(new Setting(licensePanel))
            .setName('License Key')
            .setDesc('Enter your Pro license key to unlock advanced features.')
            .addText(text => {
                text.setPlaceholder('XXXX-XXXX-XXXX-XXXX');
                text.setValue(plugin.settings.professionalLicenseKey || '');
                text.inputEl.addClass('ert-input--lg');
                text.inputEl.type = 'password';

                // Show/Hide Toggle
                const toggleVis = text.inputEl.parentElement?.createEl('button', {
                    cls: 'ert-clickable-icon clickable-icon', // SAFE: clickable-icon used for Obsidian icon button styling
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
                    rerender();
                });
            });

        // "Get key" link
        const nameEl = licenseSetting.nameEl;
        nameEl.createEl('a', {
            text: ' Get key →',
            href: 'https://radial-timeline.com/signature',
            cls: 'ert-link-accent',
            attr: { target: '_blank', rel: 'noopener' }
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PANDOC & EXPORT SETTINGS
    // ─────────────────────────────────────────────────────────────────────────
    const pandocPanel = lockPanel(section.createDiv({ cls: `${ERT_CLASSES.PANEL} ${ERT_CLASSES.STACK}` }));

    // Header
    const pandocHeading = pandocPanel.createDiv({ cls: 'setting-item setting-item-heading' });
    const pandocInfo = pandocHeading.createDiv({ cls: 'setting-item-info' });
    const pandocName = pandocInfo.createDiv({ cls: 'setting-item-name' });
    const pandocHeaderIcon = pandocName.createSpan({ cls: 'ert-setting-heading-icon' });
    setIcon(pandocHeaderIcon, 'book-open-text');
    pandocName.createSpan({ text: 'Export & Pandoc' });
    const pandocWikiLink = pandocName.createEl('a', {
        href: 'https://github.com/EricRhysTaylor/radial-timeline/wiki/Settings#professional',
        cls: 'ert-setting-heading-wikilink'
    });
    pandocWikiLink.setAttr('target', '_blank');
    pandocWikiLink.setAttr('rel', 'noopener');
    setIcon(pandocWikiLink, 'external-link');
    pandocInfo.createDiv({
        cls: 'setting-item-description',
        text: 'Configure Pandoc binary paths and manuscript export templates for screenplay, podcast, and novel formats.'
    });

    // Settings
    addProRow(new Setting(pandocPanel))
        .setName('Pandoc binary path')
        .setDesc('Optional: set a custom pandoc executable path. If blank, system PATH is used.')
        .addText(text => {
            text.inputEl.addClass('ert-input--xl');
            text.setPlaceholder('/usr/local/bin/pandoc');
            text.setValue(plugin.settings.pandocPath || '');
            plugin.registerDomEvent(text.inputEl, 'blur', async () => {
                const value = text.getValue().trim();
                plugin.settings.pandocPath = value ? normalizePath(value) : '';
                await plugin.saveSettings();
            });
        });

    addProRow(new Setting(pandocPanel))
        .setName('Enable fallback Pandoc')
        .setDesc('Attempt a secondary bundled/portable pandoc path if the primary is missing.')
        .addToggle(toggle => {
            toggle.setValue(!!plugin.settings.pandocEnableFallback);
            toggle.onChange(async (value) => {
                plugin.settings.pandocEnableFallback = value;
                await plugin.saveSettings();
            });
        });

    addProRow(new Setting(pandocPanel))
        .setName('Fallback Pandoc path')
        .setDesc('Optional path to a portable/bundled pandoc binary.')
        .addText(text => {
            text.inputEl.addClass('ert-input--xl');
            text.setPlaceholder('/path/to/pandoc');
            text.setValue(plugin.settings.pandocFallbackPath || '');
            plugin.registerDomEvent(text.inputEl, 'blur', async () => {
                const value = text.getValue().trim();
                plugin.settings.pandocFallbackPath = value ? normalizePath(value) : '';
                await plugin.saveSettings();
            });
        });

    // Templates Subsection
    const templateSubSection = pandocPanel.createDiv({
        cls: `${ERT_CLASSES.SECTION} ${ERT_CLASSES.SECTION_TIGHT}`
    });
    templateSubSection.createEl('h5', { text: 'Pandoc Templates (Optional)', cls: ERT_CLASSES.SECTION_TITLE });

    const templates = plugin.settings.pandocTemplates || {};

    const addTemplateSetting = (name: string, key: keyof typeof templates, placeholder: string) => {
        addProRow(new Setting(templateSubSection))
            .setName(name)
            .addText(text => {
                text.inputEl.addClass('ert-input--xl');
                text.setPlaceholder(placeholder);
                text.setValue(templates[key] || '');
                plugin.registerDomEvent(text.inputEl, 'blur', async () => {
                    plugin.settings.pandocTemplates = {
                        ...plugin.settings.pandocTemplates,
                        [key]: text.getValue().trim()
                    };
                    await plugin.saveSettings();
                });
            });
    };

    addTemplateSetting('Screenplay', 'screenplay', 'vault/path/to/screenplay_template.tex');
    addTemplateSetting('Podcast Script', 'podcast', 'vault/path/to/podcast_template.tex');
    addTemplateSetting('Novel Manuscript', 'novel', 'vault/path/to/novel_template.tex');

    return section;
}
