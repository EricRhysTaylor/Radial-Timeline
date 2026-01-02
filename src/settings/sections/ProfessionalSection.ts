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
    const hasValidKey = isProfessionalLicenseValid(plugin.settings.professionalLicenseKey);
    
    // ─────────────────────────────────────────────────────────────────────────
    // Section Header with special styling
    // ─────────────────────────────────────────────────────────────────────────
    const headerContainer = containerEl.createDiv({ cls: 'rt-professional-header' });
    
    // Icon + Title row
    const headerRow = headerContainer.createDiv({ cls: 'rt-professional-header-row' });
    
    const iconEl = headerRow.createSpan({ cls: 'rt-professional-icon' });
    setIcon(iconEl, 'crown');
    
    const heading = new Setting(headerRow)
        .setName('Professional')
        .setHeading();
    heading.settingEl.addClass('rt-professional-heading');
    addWikiLink(heading, 'Settings#professional');
    
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
    
    // Status indicator
    const statusEl = contentContainer.createDiv({ cls: 'rt-professional-status' });
    const updateStatus = () => {
        statusEl.empty();
        if (isProfessionalLicenseValid(plugin.settings.professionalLicenseKey)) {
            const activeEl = statusEl.createDiv({ cls: 'rt-professional-status-active' });
            const checkIcon = activeEl.createSpan({ cls: 'rt-professional-status-icon' });
            setIcon(checkIcon, 'check-circle');
            activeEl.createSpan({ text: 'Professional features active' });
        } else {
            const inactiveEl = statusEl.createDiv({ cls: 'rt-professional-status-inactive' });
            inactiveEl.createSpan({ text: 'Enter your license key to unlock Professional features.' });
        }
    };
    updateStatus();
    
    // License key input
    new Setting(contentContainer)
        .setName('License key')
        .setDesc('Enter your Professional license key to unlock advanced features.')
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
                updateStatus();
                
                // Update toggle icon based on key validity
                if (isProfessionalLicenseValid(value)) {
                    setIcon(toggleEl, 'chevron-down');
                }
            });
        });
    
    // Get license link
    const getLicenseEl = contentContainer.createDiv({ cls: 'rt-professional-get-license' });
    getLicenseEl.createEl('a', {
        text: 'Get a Professional license →',
        href: 'https://radial-timeline.com/professional',
        attr: { target: '_blank', rel: 'noopener' }
    });
    
    // ─────────────────────────────────────────────────────────────────────────
    // Professional Features List
    // ─────────────────────────────────────────────────────────────────────────
    const featuresEl = contentContainer.createDiv({ cls: 'rt-professional-features' });
    featuresEl.createEl('h5', { text: 'Professional features include:' });
    
    const featuresList = featuresEl.createEl('ul');
    const features = [
        { icon: 'film', text: 'Runtime Estimation — Screen time and audiobook duration analysis' },
        // Future features can be added here
        // { icon: 'sparkles', text: 'AI Scene Enhancement — Advanced AI-powered writing assistance' },
        // { icon: 'layout-dashboard', text: 'Custom Dashboards — Build personalized writing dashboards' },
    ];
    
    features.forEach(feature => {
        const li = featuresList.createEl('li');
        const iconSpan = li.createSpan({ cls: 'rt-professional-feature-icon' });
        setIcon(iconSpan, feature.icon);
        li.createSpan({ text: feature.text });
    });
}

