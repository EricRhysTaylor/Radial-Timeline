/*
 * Radial Timeline Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 * 
 * Runtime Estimation Settings Section
 */

import { App, Setting, TextComponent, DropdownComponent } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import type { RuntimeContentType } from '../../types';
import { addWikiLinkToElement } from '../wikiLink';

interface SectionParams {
    app: App;
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
}

export function renderRuntimeSection({ plugin, containerEl }: SectionParams): void {
    // Section header
    const headerEl = containerEl.createEl('h3', { text: 'Runtime Estimation' });
    addWikiLinkToElement(headerEl, 'Runtime-Estimation');

    // Content Type dropdown
    new Setting(containerEl)
        .setName('Content type')
        .setDesc('Select how your content should be analyzed for runtime estimation.')
        .addDropdown((dropdown: DropdownComponent) => {
            dropdown
                .addOption('novel', 'Novel / Audiobook')
                .addOption('screenplay', 'Screenplay')
                .setValue(plugin.settings.runtimeContentType || 'novel')
                .onChange(async (value: string) => {
                    plugin.settings.runtimeContentType = value as RuntimeContentType;
                    await plugin.saveSettings();
                    // Re-render to show/hide conditional fields
                    renderConditionalFields();
                });
        });

    // Explanation text
    const explanationEl = containerEl.createDiv({ cls: 'setting-item-description rt-runtime-explanation' });
    explanationEl.innerHTML = `<p><strong>Novel / Audiobook:</strong> All text at narration pace. Optimized for audiobook or read-aloud estimation.</p><p><strong>Screenplay:</strong> Dialogue (quoted text) at speaking pace, action/description at reading pace. Optimized for film/TV scripts.</p>`; // SAFE: innerHTML used for static trusted HTML with formatting tags (no user input)

    // Container for conditional fields (word rates)
    const wordRatesContainer = containerEl.createDiv({ cls: 'rt-runtime-word-rates' });
    
    // Container for parenthetical timing
    const parentheticalContainer = containerEl.createDiv({ cls: 'rt-runtime-parentheticals' });

    const flash = (input: HTMLInputElement, type: 'success' | 'error') => {
        const successClass = 'rt-setting-input-success';
        const errorClass = 'rt-setting-input-error';
        input.classList.remove(type === 'success' ? errorClass : successClass);
        input.classList.add(type === 'success' ? successClass : errorClass);
        window.setTimeout(() => input.classList.remove(type === 'success' ? successClass : errorClass), type === 'success' ? 900 : 1200);
    };

    const renderConditionalFields = () => {
        wordRatesContainer.empty();
        
        const contentType = plugin.settings.runtimeContentType || 'novel';
        
        // Word Rates header
        wordRatesContainer.createEl('h4', { text: 'Word Rates', cls: 'rt-runtime-subheader' });
        
        if (contentType === 'screenplay') {
            // Screenplay: show dialogue and action rates
            new Setting(wordRatesContainer)
                .setName('Dialogue rate (wpm)')
                .setDesc('Words per minute for quoted dialogue text.')
                .addText((text: TextComponent) => {
                    text.inputEl.type = 'number';
                    text.inputEl.min = '50';
                    text.inputEl.max = '300';
                    text.inputEl.addClass('rt-input-xs');
                    text.setValue(String(plugin.settings.runtimeDialogueWpm || 160));
                    text.inputEl.addEventListener('blur', async () => {
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

            new Setting(wordRatesContainer)
                .setName('Action/Description rate (wpm)')
                .setDesc('Words per minute for non-dialogue text.')
                .addText((text: TextComponent) => {
                    text.inputEl.type = 'number';
                    text.inputEl.min = '50';
                    text.inputEl.max = '300';
                    text.inputEl.addClass('rt-input-xs');
                    text.setValue(String(plugin.settings.runtimeActionWpm || 100));
                    text.inputEl.addEventListener('blur', async () => {
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
        } else {
            // Novel: show narration rate only
            new Setting(wordRatesContainer)
                .setName('Narration rate (wpm)')
                .setDesc('Words per minute for all text (audiobook narration pace).')
                .addText((text: TextComponent) => {
                    text.inputEl.type = 'number';
                    text.inputEl.min = '50';
                    text.inputEl.max = '300';
                    text.inputEl.addClass('rt-input-xs');
                    text.setValue(String(plugin.settings.runtimeNarrationWpm || 150));
                    text.inputEl.addEventListener('blur', async () => {
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
    };

    const renderParentheticalFields = () => {
        parentheticalContainer.empty();
        
        // Parenthetical Timing header
        parentheticalContainer.createEl('h4', { text: 'Parenthetical Timing', cls: 'rt-runtime-subheader' });
        
        const descEl = parentheticalContainer.createDiv({ cls: 'setting-item-description' });
        descEl.setText('Standard screenplay parentheticals detected in scene content add time. Explicit durations like (30 seconds) or (2 minutes) are always parsed.');

        const parentheticals: Array<{
            key: keyof typeof plugin.settings;
            label: string;
            directive: string;
            desc: string;
        }> = [
            { key: 'runtimeBeatSeconds', label: '(beat)', directive: 'beat', desc: 'Brief pause in dialogue or action' },
            { key: 'runtimePauseSeconds', label: '(pause)', directive: 'pause', desc: 'Standard pause' },
            { key: 'runtimeLongPauseSeconds', label: '(long pause)', directive: 'long pause', desc: 'Extended silence or reflection' },
            { key: 'runtimeMomentSeconds', label: '(a moment)', directive: 'a moment', desc: 'Reflective beat' },
            { key: 'runtimeSilenceSeconds', label: '(silence)', directive: 'silence', desc: 'No dialogue, atmospheric' },
        ];

        for (const p of parentheticals) {
            new Setting(parentheticalContainer)
                .setName(p.label)
                .setDesc(p.desc)
                .addText((text: TextComponent) => {
                    text.inputEl.type = 'number';
                    text.inputEl.min = '0';
                    text.inputEl.max = '60';
                    text.inputEl.addClass('rt-input-xs');
                    const currentValue = plugin.settings[p.key] as number | undefined;
                    text.setValue(String(currentValue ?? 0));
                    text.inputEl.addEventListener('blur', async () => {
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
                        const defaults: Record<string, number> = {
                            runtimeBeatSeconds: 2,
                            runtimePauseSeconds: 3,
                            runtimeLongPauseSeconds: 5,
                            runtimeMomentSeconds: 4,
                            runtimeSilenceSeconds: 5,
                        };
                        (plugin.settings as unknown as Record<string, unknown>)[p.key] = defaults[p.key];
                        await plugin.saveSettings();
                        renderParentheticalFields();
                    });
                });
        }

        // Explicit duration patterns info
        const explicitEl = parentheticalContainer.createDiv({ cls: 'setting-item-description rt-runtime-explicit-patterns' });
        explicitEl.innerHTML = `<p><strong>Explicit duration patterns</strong> (always parsed):</p><ul><li><code>(30 seconds)</code> or <code>(30s)</code></li><li><code>(2 minutes)</code> or <code>(2m)</code> or <code>(2 min)</code></li><li><code>(runtime: 3m)</code></li><li><code>(allow 5 minutes)</code> - for demos, podcasts</li></ul>`; // SAFE: innerHTML used for static trusted HTML with formatting tags (no user input)
    };

    // Initial render
    renderConditionalFields();
    renderParentheticalFields();
}

