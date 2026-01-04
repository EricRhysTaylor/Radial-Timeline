/*
 * Radial Timeline Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 * 
 * Runtime Estimation Settings Section
 */

import { App, Setting, TextComponent, DropdownComponent, setIcon } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import type { RuntimeContentType, RuntimeRateProfile } from '../../types';
import { addWikiLink } from '../wikiLink';
import { isProfessionalActive } from './ProfessionalSection';

interface SectionParams {
    app: App;
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
}

export function renderRuntimeSection({ plugin, containerEl }: SectionParams): void {
    const hasProfessional = isProfessionalActive(plugin);
    const generateProfileId = () => `rtp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const buildProfileFromLegacy = () => ({
        id: 'default',
        label: 'Default',
        contentType: plugin.settings.runtimeContentType || 'novel',
        dialogueWpm: plugin.settings.runtimeDialogueWpm || 160,
        actionWpm: plugin.settings.runtimeActionWpm || 100,
        narrationWpm: plugin.settings.runtimeNarrationWpm || 150,
        beatSeconds: plugin.settings.runtimeBeatSeconds || 2,
        pauseSeconds: plugin.settings.runtimePauseSeconds || 3,
        longPauseSeconds: plugin.settings.runtimeLongPauseSeconds || 5,
        momentSeconds: plugin.settings.runtimeMomentSeconds || 4,
        silenceSeconds: plugin.settings.runtimeSilenceSeconds || 5,
        sessionPlanning: {
            draftingWpm: undefined,
            recordingWpm: undefined,
            editingWpm: undefined,
            dailyMinutes: undefined,
        },
    });

    const ensureProfiles = () => {
        if (!plugin.settings.runtimeRateProfiles || plugin.settings.runtimeRateProfiles.length === 0) {
            plugin.settings.runtimeRateProfiles = [buildProfileFromLegacy()];
        }
        if (!plugin.settings.defaultRuntimeProfileId) {
            plugin.settings.defaultRuntimeProfileId = plugin.settings.runtimeRateProfiles![0].id;
        }
    };

    const syncLegacyFromProfile = (profile: { contentType: RuntimeContentType; dialogueWpm?: number; actionWpm?: number; narrationWpm?: number; beatSeconds?: number; pauseSeconds?: number; longPauseSeconds?: number; momentSeconds?: number; silenceSeconds?: number; }) => {
        plugin.settings.runtimeContentType = profile.contentType;
        if (profile.dialogueWpm !== undefined) plugin.settings.runtimeDialogueWpm = profile.dialogueWpm;
        if (profile.actionWpm !== undefined) plugin.settings.runtimeActionWpm = profile.actionWpm;
        if (profile.narrationWpm !== undefined) plugin.settings.runtimeNarrationWpm = profile.narrationWpm;
        if (profile.beatSeconds !== undefined) plugin.settings.runtimeBeatSeconds = profile.beatSeconds;
        if (profile.pauseSeconds !== undefined) plugin.settings.runtimePauseSeconds = profile.pauseSeconds;
        if (profile.longPauseSeconds !== undefined) plugin.settings.runtimeLongPauseSeconds = profile.longPauseSeconds;
        if (profile.momentSeconds !== undefined) plugin.settings.runtimeMomentSeconds = profile.momentSeconds;
        if (profile.silenceSeconds !== undefined) plugin.settings.runtimeSilenceSeconds = profile.silenceSeconds;
    };

    ensureProfiles();
    let selectedProfileId = plugin.settings.defaultRuntimeProfileId || (plugin.settings.runtimeRateProfiles?.[0]?.id ?? '');
    
    // ─────────────────────────────────────────────────────────────────────────
    // Section Header
    // ─────────────────────────────────────────────────────────────────────────
    const heading = new Setting(containerEl)
        .setName('Runtime estimation')
        .setHeading();
    
    // Add Pro badge BEFORE the heading text
    const nameEl = heading.nameEl;
    const badgeEl = createEl('span', { cls: 'rt-pro-badge' });
    setIcon(badgeEl, 'signature');
    badgeEl.createSpan({ text: 'Pro' });
    nameEl.insertBefore(badgeEl, nameEl.firstChild);
    
    addWikiLink(heading, 'Settings#runtime-estimation');

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

        ensureProfiles();
        const profiles = plugin.settings.runtimeRateProfiles || [];
        if (!selectedProfileId && profiles[0]) {
            selectedProfileId = profiles[0].id;
        }
        const selectedProfile: RuntimeRateProfile | undefined = profiles.find(p => p.id === selectedProfileId) || profiles[0];

        const updateProfile = async (mutate: (p: RuntimeRateProfile) => void) => {
            const list = plugin.settings.runtimeRateProfiles || [];
            const idx = list.findIndex(p => p.id === selectedProfileId);
            if (idx === -1) return;
            const updated = { ...list[idx] };
            mutate(updated);
            list[idx] = updated;
            plugin.settings.runtimeRateProfiles = list;
            if (plugin.settings.defaultRuntimeProfileId === updated.id) {
                syncLegacyFromProfile(updated);
            }
            await plugin.saveSettings();
        };

        // ─────────────────────────────────────────────────────────────────────
        // Default Profile
        // ─────────────────────────────────────────────────────────────────────
        new Setting(conditionalContainer)
            .setName('Default runtime profile')
            .setDesc('Used when no per-scene profile is set.')
            .addDropdown((dropdown: DropdownComponent) => {
                profiles.forEach((p) => dropdown.addOption(p.id, p.label));
                dropdown
                    .setValue(plugin.settings.defaultRuntimeProfileId || profiles[0].id)
                    .onChange(async (value: string) => {
                        plugin.settings.defaultRuntimeProfileId = value;
                        const chosen = profiles.find(p => p.id === value);
                        if (chosen) {
                            syncLegacyFromProfile(chosen);
                        }
                        await plugin.saveSettings();
                        selectedProfileId = value;
                        renderConditionalContent();
                    });
            });

        // ─────────────────────────────────────────────────────────────────────
        // Profile selection + add/remove
        // ─────────────────────────────────────────────────────────────────────
        new Setting(conditionalContainer)
            .setName('Edit profile')
            .setDesc('Adjust rates and parenthetical timings per profile.')
            .addDropdown((dropdown: DropdownComponent) => {
                profiles.forEach((p) => dropdown.addOption(p.id, p.label));
                dropdown
                    .setValue(selectedProfile?.id || profiles[0].id)
                    .onChange((value: string) => {
                        selectedProfileId = value;
                        renderConditionalContent();
                    });
            })
            .addExtraButton(btn => {
                btn.setIcon('plus');
                btn.setTooltip('Add profile (copies current)');
                btn.onClick(async () => {
                    const base = selectedProfile || profiles[0];
                    const copy: RuntimeRateProfile = {
                        ...base,
                        id: generateProfileId(),
                        label: `${base?.label ?? 'Profile'} copy`,
                    };
                    plugin.settings.runtimeRateProfiles = [...profiles, copy];
                    selectedProfileId = copy.id;
                    await plugin.saveSettings();
                    renderConditionalContent();
                });
            })
            .addExtraButton(btn => {
                btn.setIcon('trash');
                btn.setTooltip('Delete profile');
                btn.setDisabled(profiles.length <= 1);
                btn.onClick(async () => {
                    if (profiles.length <= 1) return;
                    const remaining = profiles.filter(p => p.id !== selectedProfileId);
                    plugin.settings.runtimeRateProfiles = remaining;
                    if (plugin.settings.defaultRuntimeProfileId === selectedProfileId) {
                        plugin.settings.defaultRuntimeProfileId = remaining[0].id;
                        syncLegacyFromProfile(remaining[0]);
                    }
                    selectedProfileId = remaining[0].id;
                    await plugin.saveSettings();
                    renderConditionalContent();
                });
            });

        if (!selectedProfile) {
            return;
        }

        // ─────────────────────────────────────────────────────────────────────
        // Profile label
        // ─────────────────────────────────────────────────────────────────────
        new Setting(conditionalContainer)
            .setName('Profile label')
            .setDesc('Shown in pickers and runtime modal.')
            .addText((text: TextComponent) => {
                text.setValue(selectedProfile.label);
                plugin.registerDomEvent(text.inputEl, 'blur', async () => {
                    const value = text.getValue().trim() || 'Profile';
                    await updateProfile((p) => { p.label = value; });
                    renderConditionalContent();
                });
            });

        const contentType = selectedProfile.contentType || 'novel';

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
                        await updateProfile((p) => { p.contentType = value as RuntimeContentType; });
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
                    text.setValue(String(selectedProfile.dialogueWpm ?? 160));
                    plugin.registerDomEvent(text.inputEl, 'blur', async () => {
                        const num = parseInt(text.getValue());
                        if (!Number.isFinite(num) || num < 50 || num > 300) {
                            flash(text.inputEl, 'error');
                            return;
                        }
                        await updateProfile((p) => { p.dialogueWpm = num; });
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
                    text.setValue(String(selectedProfile.actionWpm ?? 100));
                    plugin.registerDomEvent(text.inputEl, 'blur', async () => {
                        const num = parseInt(text.getValue());
                        if (!Number.isFinite(num) || num < 50 || num > 300) {
                            flash(text.inputEl, 'error');
                            return;
                        }
                        await updateProfile((p) => { p.actionWpm = num; });
                        flash(text.inputEl, 'success');
                    });
                });

            // ─────────────────────────────────────────────────────────────────
            // Parenthetical Timing (screenplay only)
            // ─────────────────────────────────────────────────────────────────
            const parentheticals: Array<{
                key: keyof RuntimeRateProfile;
                label: string;
                desc: string;
                defaultVal: number;
            }> = [
                { key: 'beatSeconds', label: '(beat)', desc: 'Brief pause. Parenthetical timings — seconds added when screenplay directives are detected.', defaultVal: 2 },
                { key: 'pauseSeconds', label: '(pause)', desc: 'Standard pause', defaultVal: 3 },
                { key: 'longPauseSeconds', label: '(long pause)', desc: 'Extended silence', defaultVal: 5 },
                { key: 'momentSeconds', label: '(a moment)', desc: 'Reflective beat', defaultVal: 4 },
                { key: 'silenceSeconds', label: '(silence)', desc: 'Atmospheric pause', defaultVal: 5 },
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
                        const currentValue = selectedProfile[p.key] as number | undefined;
                        text.setValue(String(currentValue ?? p.defaultVal));
                        plugin.registerDomEvent(text.inputEl, 'blur', async () => {
                            const num = parseInt(text.getValue());
                            if (!Number.isFinite(num) || num < 0 || num > 60) {
                                flash(text.inputEl, 'error');
                                return;
                            }
                            await updateProfile((profile) => {
                                (profile as unknown as Record<string, unknown>)[p.key] = num;
                            });
                            flash(text.inputEl, 'success');
                        });
                    })
                    .addExtraButton(btn => {
                        btn.setIcon('rotate-ccw');
                        btn.setTooltip('Reset to default');
                        btn.onClick(async () => {
                            await updateProfile((profile) => {
                                (profile as unknown as Record<string, unknown>)[p.key] = p.defaultVal;
                            });
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
                    text.setValue(String(selectedProfile.narrationWpm ?? 150));
                    plugin.registerDomEvent(text.inputEl, 'blur', async () => {
                        const num = parseInt(text.getValue());
                        if (!Number.isFinite(num) || num < 50 || num > 300) {
                            flash(text.inputEl, 'error');
                            return;
                        }
                        await updateProfile((p) => { p.narrationWpm = num; });
                        flash(text.inputEl, 'success');
                    });
                });
        }

        // ─────────────────────────────────────────────────────────────────────
        // Session planning (optional, per profile)
        // ─────────────────────────────────────────────────────────────────────
        const session = selectedProfile.sessionPlanning || {};

        new Setting(conditionalContainer)
            .setName('Drafting words per minute (optional)')
            .setDesc('Used for future session planning estimates.')
            .addText((text: TextComponent) => {
                text.inputEl.type = 'number';
                text.inputEl.min = '0';
                text.inputEl.max = '1000';
                text.inputEl.addClass('rt-input-xs');
                text.setValue(session.draftingWpm ? String(session.draftingWpm) : '');
                plugin.registerDomEvent(text.inputEl, 'blur', async () => {
                    const raw = text.getValue();
                    if (raw === '') {
                        await updateProfile((p) => {
                            p.sessionPlanning = { ...(p.sessionPlanning || {}), draftingWpm: undefined };
                        });
                        flash(text.inputEl, 'success');
                        return;
                    }
                    const num = parseInt(raw);
                    if (!Number.isFinite(num) || num < 0 || num > 1000) {
                        flash(text.inputEl, 'error');
                        return;
                    }
                    await updateProfile((p) => {
                        p.sessionPlanning = { ...(p.sessionPlanning || {}), draftingWpm: num };
                    });
                    flash(text.inputEl, 'success');
                });
            });

        new Setting(conditionalContainer)
            .setName('Daily minutes available (optional)')
            .setDesc('For “45 min/day” style projections.')
            .addText((text: TextComponent) => {
                text.inputEl.type = 'number';
                text.inputEl.min = '0';
                text.inputEl.max = '1440';
                text.inputEl.addClass('rt-input-xs');
                text.setValue(session.dailyMinutes ? String(session.dailyMinutes) : '');
                plugin.registerDomEvent(text.inputEl, 'blur', async () => {
                    const raw = text.getValue();
                    if (raw === '') {
                        await updateProfile((p) => {
                            p.sessionPlanning = { ...(p.sessionPlanning || {}), dailyMinutes: undefined };
                        });
                        flash(text.inputEl, 'success');
                        return;
                    }
                    const num = parseInt(raw);
                    if (!Number.isFinite(num) || num < 0 || num > 1440) {
                        flash(text.inputEl, 'error');
                        return;
                    }
                    await updateProfile((p) => {
                        p.sessionPlanning = { ...(p.sessionPlanning || {}), dailyMinutes: num };
                    });
                    flash(text.inputEl, 'success');
                });
            });

        // ─────────────────────────────────────────────────────────────────────
        // Runtime Arc Cap Default
        // ─────────────────────────────────────────────────────────────────────
        new Setting(conditionalContainer)
            .setName('Runtime arc cap default')
            .setDesc('Default cap for runtime arcs in Chronologue mode. Lower values emphasize shorter scenes.')
            .addDropdown((dropdown: DropdownComponent) => {
                dropdown
                    .addOption('100', 'Auto (100%) — longest scene fills arc')
                    .addOption('75', '75% of max runtime')
                    .addOption('50', '50% of max runtime')
                    .addOption('25', '25% of max runtime')
                    .addOption('0', 'Minimum stub — all scenes equal')
                    .setValue(String(plugin.settings.runtimeCapDefaultPercent ?? 100))
                    .onChange(async (value: string) => {
                        plugin.settings.runtimeCapDefaultPercent = parseInt(value);
                        await plugin.saveSettings();
                        plugin.refreshTimelineIfNeeded(null);
                    });
            });

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
