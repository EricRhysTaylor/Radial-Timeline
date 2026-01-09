/*
 * Radial Timeline Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 * 
 * Runtime Estimation Settings Section
 */

import { App, Setting, TextComponent, DropdownComponent, setIcon, Modal, ButtonComponent } from 'obsidian';
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

    const findScrollContainer = (): HTMLElement | null => {
        const modalContent = containerEl.closest('.modal')?.querySelector('.modal-content');
        if (modalContent instanceof HTMLElement) return modalContent;
        const tabContent = containerEl.closest('.vertical-tab-content');
        if (tabContent instanceof HTMLElement) return tabContent;
        const tabWrapper = containerEl.closest('.rt-settings-tab-content');
        if (tabWrapper instanceof HTMLElement) return tabWrapper;
        return null;
    };

    const captureScrollState = () => {
        const scrollContainer = findScrollContainer();
        return {
            scrollContainer,
            top: scrollContainer ? scrollContainer.scrollTop : null,
        };
    };

    const restoreScrollState = (state: { scrollContainer: HTMLElement | null; top: number | null; }) => {
        const { scrollContainer, top } = state;
        if (!scrollContainer || top === null) return;
        // Double RAF to wait for DOM layout to fully settle after re-render
        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
                const maxTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
                const clampedTop = Math.min(top, maxTop);
                scrollContainer.scrollTop = clampedTop;
            });
        });
    };
    
    // ─────────────────────────────────────────────────────────────────────────
    // Section Header
    // ─────────────────────────────────────────────────────────────────────────
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

    // Pro container wrapping all runtime controls
    const proContainer = containerEl.createDiv({ cls: 'rt-pro-section-card' });

    // Heading row with Pro badge and toggle (double duty)
    const heading = new Setting(proContainer)
        .setName('Runtime estimation')
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
    heading.settingEl.addClass('rt-pro-setting');

    // Add Pro badge BEFORE the heading text
    const nameEl = heading.nameEl;
    const badgeEl = createEl('span', { cls: 'rt-pro-badge' });
    setIcon(badgeEl, 'signature');
    badgeEl.createSpan({ text: 'Pro' });
    nameEl.insertBefore(badgeEl, nameEl.firstChild);
    
    addWikiLink(heading, 'Settings#runtime-estimation');

    // Container for conditional settings (shown when enabled)
    const conditionalContainer = proContainer.createDiv({ cls: 'rt-runtime-conditional-settings' });

    // Flash helper for input validation
    const flash = (input: HTMLInputElement, type: 'success' | 'error') => {
        const successClass = 'rt-setting-input-success';
        const errorClass = 'rt-setting-input-error';
        input.classList.remove(type === 'success' ? errorClass : successClass);
        input.classList.add(type === 'success' ? successClass : errorClass);
        window.setTimeout(() => input.classList.remove(type === 'success' ? successClass : errorClass), type === 'success' ? 900 : 1200);
    };

    const renderConditionalContent = () => {
        const scrollState = captureScrollState();
        conditionalContainer.empty();
        
        if (!plugin.settings.enableRuntimeEstimation) {
            restoreScrollState(scrollState);
            return;
        }

        ensureProfiles();
        const profiles = plugin.settings.runtimeRateProfiles || [];
        if (!selectedProfileId && profiles[0]) {
            selectedProfileId = profiles[0].id;
        }

        const headerContainer = conditionalContainer.createDiv();
        const detailsContainer = conditionalContainer.createDiv();

        const getSelectedProfile = (): RuntimeRateProfile | undefined => {
            const currentProfiles = plugin.settings.runtimeRateProfiles || [];
            const next = currentProfiles.find(p => p.id === selectedProfileId);
            return next || currentProfiles[0];
        };

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

        const renderDetails = () => {
            const scrollState = captureScrollState();
            detailsContainer.empty();
            const selectedProfile = getSelectedProfile();
            if (!selectedProfile) {
                restoreScrollState(scrollState);
                return;
            }

            const contentType = selectedProfile.contentType || 'novel';
            detailsContainer.createEl('h4', { cls: 'rt-runtime-subheader', text: 'Rates & timings' });

            // Content Type Selection
            new Setting(detailsContainer)
                .setName('Content type')
                .setDesc('Novel calculates all text at narration pace. Screenplay separates dialogue from action.')
                .addDropdown((dropdown: DropdownComponent) => {
                    dropdown
                        .addOption('novel', 'Novel / Audiobook')
                        .addOption('screenplay', 'Screenplay')
                        .setValue(contentType)
                        .onChange(async (value: string) => {
                            await updateProfile((p) => { p.contentType = value as RuntimeContentType; });
                            renderDetails();
                        });
                });

            // Word Rates (content-type specific)
            if (contentType === 'screenplay') {
                new Setting(detailsContainer)
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

                new Setting(detailsContainer)
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

                // Parenthetical Timing (screenplay only)
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
                    new Setting(detailsContainer)
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
                                renderDetails();
                            });
                        });
                }
            } else {
                // Novel / Audiobook mode
                new Setting(detailsContainer)
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

            // Session planning (optional, per profile)
            detailsContainer.createEl('h4', { cls: 'rt-runtime-subheader', text: 'Session planning (optional)' });
            const session = selectedProfile.sessionPlanning || {};

            new Setting(detailsContainer)
                .setName('Drafting words per minute (optional)')
                .setDesc('Your writing speed for session time estimates.')
                .addText((text: TextComponent) => {
                    text.inputEl.type = 'number';
                    text.inputEl.min = '0';
                    text.inputEl.max = '1000';
                    text.inputEl.addClass('rt-input-xs');
                    text.setValue(session.draftingWpm ? String(session.draftingWpm) : '');
                    plugin.registerDomEvent(text.inputEl, 'blur', async () => {
                        const num = parseInt(text.getValue());
                        if (text.getValue() && (!Number.isFinite(num) || num < 0 || num > 1000)) {
                            flash(text.inputEl, 'error');
                            return;
                        }
                        await updateProfile((p) => {
                            p.sessionPlanning = { ...p.sessionPlanning, draftingWpm: num || undefined };
                        });
                        flash(text.inputEl, 'success');
                    });
                });

            new Setting(detailsContainer)
                .setName('Daily minutes available (optional)')
                .setDesc('For shooting schedule time estimates.')
                .addText((text: TextComponent) => {
                    text.inputEl.type = 'number';
                    text.inputEl.min = '0';
                    text.inputEl.max = '1440';
                    text.inputEl.addClass('rt-input-xs');
                    text.setValue(session.dailyMinutes ? String(session.dailyMinutes) : '');
                    plugin.registerDomEvent(text.inputEl, 'blur', async () => {
                        const num = parseInt(text.getValue());
                        if (text.getValue() && (!Number.isFinite(num) || num < 0 || num > 1440)) {
                            flash(text.inputEl, 'error');
                            return;
                        }
                        await updateProfile((p) => {
                            p.sessionPlanning = { ...p.sessionPlanning, dailyMinutes: num || undefined };
                        });
                        flash(text.inputEl, 'success');
                    });
                });

            // Explicit Duration Patterns (always shown when enabled)
            const patternsInfo = detailsContainer.createDiv({ cls: 'setting-item-description rt-runtime-patterns-info' });
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
            restoreScrollState(scrollState);
        };

        const renderHeader = () => {
            headerContainer.empty();
            const currentProfiles = plugin.settings.runtimeRateProfiles || [];
            const selectedProfile = currentProfiles.find(p => p.id === selectedProfileId) || currentProfiles[0];
            const currentDefault = currentProfiles.find(p => p.id === plugin.settings.defaultRuntimeProfileId);
            const isDefault = selectedProfile && selectedProfile.id === plugin.settings.defaultRuntimeProfileId;
            const defaultNote = isDefault ? ' (default)' : '';

            const headerSetting = new Setting(headerContainer)
                .setName('Profile')
                .setDesc(`Select, rename, duplicate, delete, or set as default. Current default: ${currentDefault?.label || 'None'}`);

            headerSetting.addDropdown((dropdown: DropdownComponent) => {
                currentProfiles.forEach((p) => {
                    const suffix = p.id === plugin.settings.defaultRuntimeProfileId ? ' ★' : '';
                    dropdown.addOption(p.id, p.label + suffix);
                });
                dropdown
                    .setValue(selectedProfile?.id || currentProfiles[0]?.id || '')
                    .onChange((value: string) => {
                        selectedProfileId = value;
                        renderHeader();
                        renderDetails();
                    });
            });

            headerSetting.addExtraButton(btn => {
                btn.setIcon('plus');
                btn.setTooltip('Duplicate profile');
                btn.onClick(async () => {
                    const base = selectedProfile || currentProfiles[0];
                    if (!base) return;
                    const copy: RuntimeRateProfile = {
                        ...base,
                        id: generateProfileId(),
                        label: `${base.label} copy`,
                    };
                    plugin.settings.runtimeRateProfiles = [...currentProfiles, copy];
                    selectedProfileId = copy.id;
                    await plugin.saveSettings();
                    renderHeader();
                    renderDetails();
                });
            });

            headerSetting.addExtraButton(btn => {
                btn.setIcon('pencil');
                btn.setTooltip('Rename profile');
                btn.setDisabled(!selectedProfile);
                btn.onClick(() => {
                    if (!selectedProfile) return;
                    const modal = new Modal(plugin.app);
                    const { modalEl, contentEl } = modal;
                    modalEl.classList.add('rt-modal-shell');
                    modalEl.style.width = '400px'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
                    modalEl.style.maxWidth = '92vw'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
                    contentEl.addClass('rt-modal-container');

                    const header = contentEl.createDiv({ cls: 'rt-modal-header' });
                    header.createDiv({ cls: 'rt-modal-title', text: 'Rename profile' });

                    const inputContainer = contentEl.createDiv({ cls: 'rt-search-input-container' });
                    const inputEl = inputContainer.createEl('input', {
                        type: 'text',
                        value: selectedProfile.label || '',
                        cls: 'rt-input-lg'
                    });

                    window.setTimeout(() => {
                        inputEl.focus();
                        inputEl.select();
                    }, 10);

                    const submit = async () => {
                        const trimmed = inputEl.value.trim();
                        if (!trimmed) return;
                        await updateProfile((p) => { p.label = trimmed; });
                        modal.close();
                        renderHeader();
                        renderDetails();
                    };

                    // SAFE: Modal classes don't have registerDomEvent; modal cleanup handles this
                    inputEl.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            submit();
                        } else if (e.key === 'Escape') {
                            modal.close();
                        }
                    });

                    const buttonRow = contentEl.createDiv({ cls: 'rt-modal-actions' });
                    new ButtonComponent(buttonRow)
                        .setButtonText('OK')
                        .setCta()
                        .onClick(() => submit());
                    new ButtonComponent(buttonRow)
                        .setButtonText('Cancel')
                        .onClick(() => modal.close());

                    modal.open();
                });
            });

            headerSetting.addExtraButton(btn => {
                btn.setIcon('trash');
                btn.setTooltip('Delete profile');
                btn.setDisabled(currentProfiles.length <= 1);
                btn.onClick(async () => {
                    if (currentProfiles.length <= 1) return;
                    const remaining = currentProfiles.filter(p => p.id !== selectedProfileId);
                    plugin.settings.runtimeRateProfiles = remaining;
                    const fallback = remaining[0];
                    if (plugin.settings.defaultRuntimeProfileId === selectedProfileId && fallback) {
                        plugin.settings.defaultRuntimeProfileId = fallback.id;
                        syncLegacyFromProfile(fallback);
                    }
                    selectedProfileId = fallback?.id || '';
                    await plugin.saveSettings();
                    renderHeader();
                    renderDetails();
                });
            });

            headerSetting.addExtraButton(btn => {
                btn.setIcon('star');
                btn.setTooltip(isDefault ? 'Already default' : 'Set as default');
                btn.setDisabled(!selectedProfile || isDefault);
                btn.onClick(async () => {
                    if (!selectedProfile) return;
                    plugin.settings.defaultRuntimeProfileId = selectedProfile.id;
                    syncLegacyFromProfile(selectedProfile);
                    await plugin.saveSettings();
                    renderHeader();
                });
            });
        };

        renderHeader();
        renderDetails();
        restoreScrollState(scrollState);
    };

    // Initial render
    renderConditionalContent();
}
