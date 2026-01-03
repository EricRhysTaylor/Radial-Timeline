/*
 * Radial Timeline Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 * 
 * Professional License Settings Section
 */

import { App, Setting, setIcon } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { addWikiLink } from '../wikiLink';

interface SectionParams {
    app: App;
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
}

/**
 * Check if a professional license key is valid
 * Currently a dummy implementation - will be connected to backend later
 */
export function isProfessionalLicenseValid(key: string | undefined): boolean {
    if (!key || key.trim().length === 0) {
        return false;
    }
    // DUMMY: For now, any non-empty key is "valid" for testing
    // TODO: Connect to license validation API
    return key.trim().length >= 16;
}

/**
 * Check if the professional tier is active
 */
export function isProfessionalActive(plugin: RadialTimelinePlugin): boolean {
    return isProfessionalLicenseValid(plugin.settings.professionalLicenseKey);
}

export function renderProfessionalSection({ plugin, containerEl }: SectionParams): void {
    let hasValidKey = isProfessionalLicenseValid(plugin.settings.professionalLicenseKey);
    
    // ─────────────────────────────────────────────────────────────────────────
    // Combined Header/Status Bar
    // ─────────────────────────────────────────────────────────────────────────
    const headerContainer = containerEl.createDiv({ cls: 'rt-professional-header' });
    if (hasValidKey) {
        headerContainer.addClass('rt-professional-active');
    }
    
    const headerRow = headerContainer.createDiv({ cls: 'rt-professional-header-row' });
    
    // Icon (signature for inactive, check-circle for active)
    const iconEl = headerRow.createSpan({ cls: 'rt-professional-icon' });
    setIcon(iconEl, hasValidKey ? 'check-circle' : 'signature');
    
    // Title text
    const titleEl = headerRow.createSpan({ cls: 'rt-professional-title' });
    titleEl.setText(hasValidKey ? 'Pro features active' : 'Pro');
    
    // Wiki link (only when inactive)
    if (!hasValidKey) {
        const linkContainer = headerRow.createSpan({ cls: 'rt-professional-wiki-link' });
        const dummySetting = new Setting(linkContainer);
        dummySetting.settingEl.addClass('rt-professional-heading-inline');
        addWikiLink(dummySetting, 'Settings#professional');
    }
    
    // Collapse toggle
    const toggleEl = headerRow.createSpan({ cls: 'rt-professional-toggle' });
    setIcon(toggleEl, hasValidKey ? 'chevron-down' : 'chevron-right');
    
    // Collapsible content container
    const contentContainer = containerEl.createDiv({ cls: 'rt-professional-content' });
    
    // Start collapsed if no key, expanded if key exists
    let isExpanded = hasValidKey;
    if (!isExpanded) {
        contentContainer.addClass('rt-collapsed');
    }
    
    // Update header appearance based on key validity
    const updateHeaderState = (valid: boolean) => {
        hasValidKey = valid;
        if (valid) {
            headerContainer.addClass('rt-professional-active');
            setIcon(iconEl, 'check-circle');
            titleEl.setText('Pro features active');
            setIcon(toggleEl, 'chevron-down');
        } else {
            headerContainer.removeClass('rt-professional-active');
            setIcon(iconEl, 'signature');
            titleEl.setText('Pro');
            setIcon(toggleEl, 'chevron-right');
        }
    };
    
    // Toggle behavior
    headerContainer.addEventListener('click', (e) => {
        // Don't toggle if clicking on input or wiki link
        if ((e.target as HTMLElement).closest('input, a, .rt-wiki-link')) {
            return;
        }
        isExpanded = !isExpanded;
        if (isExpanded) {
            contentContainer.removeClass('rt-collapsed');
            setIcon(toggleEl, 'chevron-down');
        } else {
            contentContainer.addClass('rt-collapsed');
            setIcon(toggleEl, 'chevron-right');
        }
    });
    
    // ─────────────────────────────────────────────────────────────────────────
    // Content
    // ─────────────────────────────────────────────────────────────────────────
    
    // License key input with inline "Get key" link
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
                toggleVis.addEventListener('click', () => {
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
                updateHeaderState(isProfessionalLicenseValid(value));
            });
        });
    
    // Custom name with inline link
    const nameEl = licenseSetting.nameEl;
    nameEl.empty();
    nameEl.createSpan({ text: 'License key' });
    nameEl.createEl('a', {
        text: 'Get Signature →',
        href: 'https://radial-timeline.com/signature',
        cls: 'rt-professional-get-key-link',
        attr: { target: '_blank', rel: 'noopener' }
    });
    
    // ─────────────────────────────────────────────────────────────────────────
    // Professional Features List
    // ─────────────────────────────────────────────────────────────────────────
    const featuresEl = contentContainer.createDiv({ cls: 'rt-professional-features' });
    featuresEl.createEl('h5', { text: 'Pro features include:' });
    
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
}
