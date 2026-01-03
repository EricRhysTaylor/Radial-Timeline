/*
 * Radial Timeline Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 * 
 * Runtime Estimation Settings Section
 */

import { App, Setting, TextComponent, DropdownComponent, setIcon } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import type { RuntimeContentType } from '../../types';
import { addWikiLink } from '../wikiLink';
import { isProfessionalActive } from './ProfessionalSection';

interface SectionParams {
    app: App;
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
}

export function renderRuntimeSection({ plugin, containerEl }: SectionParams): void {
    const hasProfessional = isProfessionalActive(plugin);
    
    // ─────────────────────────────────────────────────────────────────────────
    // Section Header
    // ─────────────────────────────────────────────────────────────────────────
    const heading = new Setting(containerEl)
        .setName('Runtime estimation')
        .setHeading();
    addWikiLink(heading, 'Settings#runtime-estimation');
    
    // Add Pro badge to heading
    const badgeEl = heading.nameEl.createSpan({ cls: 'rt-professional-badge' });
    setIcon(badgeEl, 'signature');
    badgeEl.createSpan({ text: 'Pro' });

    // ─────────────────────────────────────────────────────────────────────────
    // Professional Gate
    // ─────────────────────────────────────────────────────────────────────────
    if (!hasProfessional) {
        const gateEl = containerEl.createDiv({ cls: 'rt-professional-gate' });
        gateEl.createDiv({ 
            cls: 'rt-professional-gate-message', 
            text: 'Runtime estimation requires a Pro license. Unlock this feature by entering your license key above. Run local or AI-powered estimates for screenplays and novels. Set custom word rates and parenthetical timings. Additional Chronologue duration arcs, sub-mode in blue and scene hover metadata.' 
        });
        return;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Enable Toggle
    // ─────────────────────────────────────────────────────────────────────────
    new Setting(containerEl)
        .setName('Enable runtime estimation')
        .setDesc('Activate film and book runtime estimates to the scene hover metadata, Chronologue Mode, and the Command Palette Runtime Estimator.')
        .addToggle(toggle => {
            toggle
                .setValue(plugin.settings.enableRuntimeEstimation ?? false)
                .onChange(async (value) => {
                    plugin.settings.enableRuntimeEstimation = value;
                    await plugin.saveSettings();
                    renderConditionalContent();
                });
        });

    // Container for conditional settings (shown when enabled)
    const conditionalContainer = containerEl.createDiv({ cls: 'rt-runtime-conditional-settings' });

    // Flash helper for input validation
    const flash = (input: HTMLInputElement, type: 'success' | 'error') => {
        const successClass = 'rt-setting-input-success';
        const errorClass = 'rt-setting-input-error';
        input.classList.remove(type === 'success' ? errorClass : successClass);
        input.classList.add(type === 'success' ? successClass : errorClass);
        window.setTimeout(() => input.classList.remove(type === 'success' ? successClass : errorClass), type === 'success' ? 900 : 1200);
    };

    const renderConditionalContent = () => {
        conditionalContainer.empty();
        
        if (!plugin.settings.enableRuntimeEstimation) {
            return;
        }

        const contentType = plugin.settings.runtimeContentType || 'novel';

        // ─────────────────────────────────────────────────────────────────────
        // Content Type Selection
        // ─────────────────────────────────────────────────────────────────────
        new Setting(conditionalContainer)
            .setName('Content type')
            .setDesc('Novel calculates all text at narration pace. Screenplay separates dialogue from action.')
            .addDropdown((dropdown: DropdownComponent) => {
                dropdown
                    .addOption('novel', 'Novel / Audiobook')
                    .addOption('screenplay', 'Screenplay')
                    .setValue(contentType)
                    .onChange(async (value: string) => {
                        plugin.settings.runtimeContentType = value as RuntimeContentType;
                        await plugin.saveSettings();
                        renderConditionalContent();
                    });
            });

        // ─────────────────────────────────────────────────────────────────────
        // Word Rates (content-type specific)
        // ─────────────────────────────────────────────────────────────────────
        if (contentType === 'screenplay') {
            new Setting(conditionalContainer)
                .setName('Dialogue words per minute')
                .setDesc('Reading speed for quoted dialogue.')
                .addText((text: TextComponent) => {
                    text.inputEl.type = 'number';
                    text.inputEl.min = '50';
                    text.inputEl.max = '300';
                    text.inputEl.addClass('rt-input-xs');
                    text.setValue(String(plugin.settings.runtimeDialogueWpm || 160));
                    plugin.registerDomEvent(text.inputEl, 'blur', async () => {
                        const num = parseInt(text.getValue());
                        if (!Number.isFinite(num) || num < 50 || num > 300) {
                            flash(text.inputEl, 'error');
                            return;
                        }
                        plugin.settings.runtimeDialogueWpm = num;
                        await plugin.saveSettings();
                        flash(text.inputEl, 'success');
                    });
                });

            new Setting(conditionalContainer)
                .setName('Action words per minute')
                .setDesc('Reading speed for scene descriptions and action lines.')
                .addText((text: TextComponent) => {
                    text.inputEl.type = 'number';
                    text.inputEl.min = '50';
                    text.inputEl.max = '300';
                    text.inputEl.addClass('rt-input-xs');
                    text.setValue(String(plugin.settings.runtimeActionWpm || 100));
                    plugin.registerDomEvent(text.inputEl, 'blur', async () => {
                        const num = parseInt(text.getValue());
                        if (!Number.isFinite(num) || num < 50 || num > 300) {
                            flash(text.inputEl, 'error');
                            return;
                        }
                        plugin.settings.runtimeActionWpm = num;
                        await plugin.saveSettings();
                        flash(text.inputEl, 'success');
                    });
                });

            // ─────────────────────────────────────────────────────────────────
            // Parenthetical Timing (screenplay only)
            // ─────────────────────────────────────────────────────────────────
            const parentheticals: Array<{
                key: keyof typeof plugin.settings;
                label: string;
                desc: string;
                defaultVal: number;
            }> = [
                { key: 'runtimeBeatSeconds', label: '(beat)', desc: 'Brief pause. Parenthetical timings — seconds added when screenplay directives are detected.', defaultVal: 2 },
                { key: 'runtimePauseSeconds', label: '(pause)', desc: 'Standard pause', defaultVal: 3 },
                { key: 'runtimeLongPauseSeconds', label: '(long pause)', desc: 'Extended silence', defaultVal: 5 },
                { key: 'runtimeMomentSeconds', label: '(a moment)', desc: 'Reflective beat', defaultVal: 4 },
                { key: 'runtimeSilenceSeconds', label: '(silence)', desc: 'Atmospheric pause', defaultVal: 5 },
            ];

            for (const p of parentheticals) {
                new Setting(conditionalContainer)
                    .setName(p.label)
                    .setDesc(p.desc)
                    .addText((text: TextComponent) => {
                        text.inputEl.type = 'number';
                        text.inputEl.min = '0';
                        text.inputEl.max = '60';
                        text.inputEl.addClass('rt-input-xs');
                        const currentValue = plugin.settings[p.key] as number | undefined;
                        text.setValue(String(currentValue ?? p.defaultVal));
                        plugin.registerDomEvent(text.inputEl, 'blur', async () => {
                            const num = parseInt(text.getValue());
                            if (!Number.isFinite(num) || num < 0 || num > 60) {
                                flash(text.inputEl, 'error');
                                return;
                            }
                            (plugin.settings as unknown as Record<string, unknown>)[p.key] = num;
                            await plugin.saveSettings();
                            flash(text.inputEl, 'success');
                        });
                    })
                    .addExtraButton(btn => {
                        btn.setIcon('rotate-ccw');
                        btn.setTooltip('Reset to default');
                        btn.onClick(async () => {
                            (plugin.settings as unknown as Record<string, unknown>)[p.key] = p.defaultVal;
                            await plugin.saveSettings();
                            renderConditionalContent();
                        });
                    });
            }
        } else {
            // Novel / Audiobook mode
            new Setting(conditionalContainer)
                .setName('Narration words per minute')
                .setDesc('Reading pace for all content (audiobook narration).')
                .addText((text: TextComponent) => {
                    text.inputEl.type = 'number';
                    text.inputEl.min = '50';
                    text.inputEl.max = '300';
                    text.inputEl.addClass('rt-input-xs');
                    text.setValue(String(plugin.settings.runtimeNarrationWpm || 150));
                    plugin.registerDomEvent(text.inputEl, 'blur', async () => {
                        const num = parseInt(text.getValue());
                        if (!Number.isFinite(num) || num < 50 || num > 300) {
                            flash(text.inputEl, 'error');
                            return;
                        }
                        plugin.settings.runtimeNarrationWpm = num;
                        await plugin.saveSettings();
                        flash(text.inputEl, 'success');
                    });
                });
        }

        // ─────────────────────────────────────────────────────────────────────
        // Explicit Duration Patterns (always shown when enabled)
        // ─────────────────────────────────────────────────────────────────────
        const patternsInfo = conditionalContainer.createDiv({ cls: 'setting-item-description rt-runtime-patterns-info' });
        patternsInfo.createEl('p', { text: 'Explicit duration patterns are always parsed and added to runtime:' });
        const patternsList = patternsInfo.createEl('ul');
        const patterns = [
            '(30 seconds) or (30s)',
            '(2 minutes) or (2m)',
            '(runtime: 3m)',
            '(allow 5 minutes) — for demos, podcasts',
        ];
        for (const pat of patterns) {
            patternsList.createEl('li').createEl('code', { text: pat });
        }
    };

    // Initial render
    renderConditionalContent();
}
