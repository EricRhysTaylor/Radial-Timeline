import { App, Modal, Notice, Setting as Settings, TextAreaComponent, TextComponent, DropdownComponent, ButtonComponent, setIcon, setTooltip } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import type { PlanetaryProfile } from '../../types';
import { convertFromEarth, parseCommaNames, validatePlanetaryProfile } from '../../utils/planetaryTime';
import { createMarsPlanetaryProfile, MARS_TEMPLATE_ID } from '../../utils/planetaryMars';
import { t } from '../../i18n';
import { addHeadingIcon, addWikiLink, applyErtHeaderLayout } from '../wikiLink';
import { ERT_CLASSES } from '../../ui/classes';
import { scheduleFocusAfterPaint } from '../../utils/domFocus';
import { IMPACT_FULL } from '../SettingImpact';

interface SectionParams {
    app: App;
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
}

const DEFAULT_PROFILE = (): PlanetaryProfile => ({
    id: `planet-${Math.random().toString(36).slice(2, 8)}`,
    label: 'New planet',
    hoursPerDay: 24,
    daysPerWeek: 7,
    daysPerYear: 365,
    epochOffsetDays: 0,
    epochLabel: '',
    monthNames: undefined,
    weekdayNames: undefined,
});

// Mars template - built-in for fun! Based on the Darian calendar.
const MARS_PROFILE = createMarsPlanetaryProfile;

class PlanetaryProfileNameModal extends Modal {
    private readonly initialValue: string;
    private readonly onSubmit: (value: string) => Promise<void>;
    private readonly titleText: string;
    private readonly subtitleText: string;
    private readonly submitText: string;
    private readonly placeholderText: string;

    constructor(
        app: App,
        initialValue: string,
        onSubmit: (value: string) => Promise<void>,
        options?: {
            titleText?: string;
            subtitleText?: string;
            submitText?: string;
            placeholderText?: string;
        }
    ) {
        super(app);
        this.initialValue = initialValue;
        this.onSubmit = onSubmit;
        this.titleText = options?.titleText ?? 'Rename profile';
        this.subtitleText = options?.subtitleText ?? 'Choose the label shown in the active profile selector and preview.';
        this.submitText = options?.submitText ?? 'Rename';
        this.placeholderText = options?.placeholderText ?? 'Planet name';
    }

    onOpen(): void {
        const { contentEl, modalEl } = this;
        contentEl.empty();

        if (modalEl) {
            modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell', 'ert-modal-shell--sm');
        }

        contentEl.addClass('ert-modal-container', 'ert-stack');
        contentEl.createDiv({ cls: 'ert-modal-title', text: this.titleText });
        contentEl.createDiv({ cls: 'ert-modal-subtitle', text: this.subtitleText });

        const inputWrap = contentEl.createDiv({ cls: 'ert-search-input-container' });
        const inputEl = inputWrap.createEl('input', {
            type: 'text',
            value: this.initialValue,
            cls: 'ert-input ert-input--full'
        });
        inputEl.setAttr('placeholder', this.placeholderText);

        const actions = contentEl.createDiv({ cls: 'ert-modal-actions' });
        const save = async () => {
            const value = inputEl.value.trim();
            if (!value) {
                new Notice('Please enter a profile name.');
                return;
            }
            await this.onSubmit(value);
            this.close();
        };

        new ButtonComponent(actions).setButtonText(this.submitText).setCta().onClick(() => { void save(); });
        new ButtonComponent(actions).setButtonText('Cancel').onClick(() => this.close());

        scheduleFocusAfterPaint(inputEl, { selectText: true });

        inputEl.addEventListener('keydown', (evt: KeyboardEvent) => {
            if (evt.key === 'Enter') {
                evt.preventDefault();
                void save();
            }
        });
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

export function renderPlanetaryTimeSection({ app, plugin, containerEl }: SectionParams): void {
    containerEl.classList.add(ERT_CLASSES.STACK);
    const profiles = plugin.settings.planetaryProfiles || [];
    if (!plugin.settings.planetaryProfiles) {
        plugin.settings.planetaryProfiles = profiles;
    }

    // Section header
    const planetaryHeading = new Settings(containerEl)
        .setName(t('planetary.heading'))
        .setHeading();
    addHeadingIcon(planetaryHeading, 'earth');
    addWikiLink(planetaryHeading, 'Settings-Core#planetary-time');
    applyErtHeaderLayout(planetaryHeading);

    let sectionExpanded = plugin.settings.planetarySectionExpanded ?? true;

    const visibilityTargets: HTMLElement[] = [];

    const visibilitySetting = new Settings(containerEl)
        .setName(t('planetary.enable.name'))
        .setDesc('Keep Earth as the planning source, use the profile label to match your planet or setting calendar. Set epoch offset to align Year 1 to a story milestone, and combine with the backdrop notes for complete context. Viewable in scene hover metadata and a compehensive parallel timeline in the Chronologue mode ALT sub-mode.')
    visibilitySetting.settingEl.addClass('ert-settingRow');

    const visibilityToggle = visibilitySetting.controlEl.createEl('button', {
        cls: ERT_CLASSES.ICON_BTN,
        attr: {
            type: 'button',
            'aria-label': sectionExpanded ? 'Hide planetary calendar details' : 'Show planetary calendar details',
            'aria-expanded': sectionExpanded ? 'true' : 'false'
        }
    });

    const refreshVisibilityButton = () => {
        setIcon(visibilityToggle, sectionExpanded ? 'chevron-down' : 'chevron-right');
        setTooltip(visibilityToggle, sectionExpanded ? 'Hide planetary calendar details' : 'Show planetary calendar details');
        visibilityToggle.setAttribute('aria-label', sectionExpanded ? 'Hide planetary calendar details' : 'Show planetary calendar details');
        visibilityToggle.setAttribute('aria-expanded', sectionExpanded ? 'true' : 'false');
    };

    // Wrap all dependent controls so we can hide them together
    const bodyEl = containerEl.createDiv({ cls: ['ert-planetary-body', ERT_CLASSES.STACK] });
    visibilityTargets.push(bodyEl);
    refreshVisibilityButton();
    visibilityToggle.addEventListener('click', () => {
        sectionExpanded = !sectionExpanded;
        plugin.settings.planetarySectionExpanded = sectionExpanded;
        applyVisibility(sectionExpanded);
        refreshVisibilityButton();
        void plugin.saveSettings();
    });

    // Active profile selector + buttons
    let activeProfileId = plugin.settings.activePlanetaryProfileId ?? '';
    if (activeProfileId && !profiles.some(profile => profile.id === activeProfileId)) {
        activeProfileId = '';
        plugin.settings.activePlanetaryProfileId = '';
    }

    const selectorSetting = new Settings(bodyEl)
        .setName(t('planetary.active.name'))
        .setDesc(t('planetary.active.desc'));

    let selector: DropdownComponent | undefined;

    // Add active calendar icon (shows when a profile is selected)
    const activeIcon = bodyEl.createDiv({ cls: 'ert-planetary-validation-icon' });
    setIcon(activeIcon, 'orbit');

    const updateActiveIcon = () => {
        const profile = profiles.find(p => p.id === activeProfileId);
        // Hide icon when no profile is selected
        if (!profile || !activeProfileId) {
            activeIcon.classList.add('ert-settings-hidden');
            activeIcon.classList.remove('is-valid');
            return;
        }
        activeIcon.classList.remove('ert-settings-hidden');
        activeIcon.classList.add('is-valid'); // Always show as active/valid
        
        setTooltip(activeIcon, `${profile.label} Calendar Active`, { placement: 'bottom' });
    };

    const renderSelector = () => {
        selectorSetting.clear();
        selectorSetting.setName(t('planetary.active.name'));
        selectorSetting.setDesc(t('planetary.active.desc'));
        selectorSetting.addDropdown(dropdown => {
            selector = dropdown;
            dropdown.addOption('', t('planetary.active.disabled'));
            // Add Mars template option
            const hasMars = profiles.some(p => p.id === MARS_TEMPLATE_ID);
            if (!hasMars) {
                dropdown.addOption(MARS_TEMPLATE_ID, 'Mars (template)');
            }
            // Add user profiles
            profiles.forEach(p => { dropdown.addOption(p.id, p.label || 'Unnamed'); });
            dropdown.setValue(activeProfileId || '');
            dropdown.onChange(async (value) => {
                // Handle Mars template selection
                if (value === MARS_TEMPLATE_ID && !profiles.some(p => p.id === MARS_TEMPLATE_ID)) {
                    const marsProfile = MARS_PROFILE();
                    profiles.push(marsProfile);
                    activeProfileId = marsProfile.id;
                    plugin.settings.activePlanetaryProfileId = activeProfileId;
                    await plugin.saveSettings();
                    plugin.onSettingChanged(IMPACT_FULL);
                    renderSelector();
                    renderFields();
                    renderPreview();
                    return;
                }
                activeProfileId = value;
                plugin.settings.activePlanetaryProfileId = value;
                await plugin.saveSettings();
                plugin.onSettingChanged(IMPACT_FULL);
                renderFields();
                renderPreview();
                updateActiveIcon();
            });
        });
        selectorSetting.addExtraButton(btn => {
            btn.setIcon('plus');
            btn.setTooltip(t('planetary.actions.add'));
            btn.onClick(() => {
                new PlanetaryProfileNameModal(app, '', async (value) => {
                    const profile = DEFAULT_PROFILE();
                    profile.label = value;
                    profiles.push(profile);
                    activeProfileId = profile.id;
                    plugin.settings.activePlanetaryProfileId = activeProfileId;
                    await plugin.saveSettings();
                    plugin.onSettingChanged(IMPACT_FULL);
                    renderSelector();
                    renderFields();
                    renderPreview();
                    updateActiveIcon();
                }, {
                    titleText: 'Create a new planet',
                    subtitleText: 'Choose the label shown in the active profile selector and preview.',
                    submitText: 'Create',
                    placeholderText: 'Planet name'
                }).open();
            });
        });
        selectorSetting.addExtraButton(btn => {
            btn.setIcon('pencil');
            btn.setTooltip('Rename profile');
            btn.setDisabled(!activeProfileId);
            btn.onClick(() => {
                const profile = getActiveProfile();
                if (!profile) return;
                new PlanetaryProfileNameModal(app, profile.label || '', async (value) => {
                    profile.label = value;
                    await saveProfile(profile);
                    renderSelector();
                    renderFields();
                    renderPreview();
                }).open();
            });
        });
        selectorSetting.addExtraButton(btn => {
            btn.setIcon('trash');
            const deleteDisabled = profiles.length === 0 || !activeProfileId;
            btn.setTooltip(t('planetary.actions.delete'));
            btn.setDisabled(deleteDisabled);
            btn.onClick(async () => {
                if (!activeProfileId) return;
                const index = profiles.findIndex(p => p.id === activeProfileId);
                if (index === -1) return;
                profiles.splice(index, 1);
                activeProfileId = profiles[0]?.id;
                plugin.settings.activePlanetaryProfileId = activeProfileId;
                await plugin.saveSettings();
                plugin.onSettingChanged(IMPACT_FULL);
                renderSelector();
                renderFields();
                renderPreview();
            });
        });
        // Append icon to the setting control
        selectorSetting.controlEl.prepend(activeIcon);
        updateActiveIcon();
    };

    renderSelector();

    // Profile fields
    const fieldsContainer = bodyEl.createDiv({ cls: ['ert-planetary-fields', ERT_CLASSES.STACK] });
    const previewContainer = bodyEl.createDiv({
        cls: [ERT_CLASSES.PREVIEW_FRAME, ERT_CLASSES.STACK, 'ert-previewFrame--flush'],
        attr: { 'data-preview': 'planetary' }
    });
    visibilityTargets.push(selectorSetting.settingEl, fieldsContainer, previewContainer);

    const flash = (input: HTMLInputElement | HTMLTextAreaElement, type: 'success' | 'error') => {
        const successClass = 'ert-setting-input-success';
        const errorClass = 'ert-setting-input-error';
        input.classList.remove(type === 'success' ? errorClass : successClass);
        input.classList.add(type === 'success' ? successClass : errorClass);
        window.setTimeout(() => input.classList.remove(type === 'success' ? successClass : errorClass), type === 'success' ? 900 : 1200);
    };

    const saveProfile = async (updated: PlanetaryProfile, input?: HTMLInputElement | HTMLTextAreaElement) => {
        const result = validatePlanetaryProfile(updated);
        if (!result.ok) {
            if (input) flash(input, 'error');
            return;
        }
        const idx = profiles.findIndex(p => p.id === updated.id);
        if (idx >= 0) profiles[idx] = { ...updated };
        else profiles.push(updated);
        plugin.settings.planetaryProfiles = profiles;
        if (!plugin.settings.activePlanetaryProfileId) {
            plugin.settings.activePlanetaryProfileId = updated.id;
            activeProfileId = updated.id;
        }
        await plugin.saveSettings();
        plugin.onSettingChanged(IMPACT_FULL);
        if (input) flash(input, 'success');
        renderPreview();
        updateActiveIcon();
    };

    const getActiveProfile = (): PlanetaryProfile | null => {
        return profiles.find(p => p.id === activeProfileId) || null;
    };

    const renderFields = () => {
        fieldsContainer.empty();
        const profile = getActiveProfile();
        const hasProfile = !!profile;
        fieldsContainer.classList.toggle('ert-settings-hidden', !hasProfile);
        if (!hasProfile) return;

        const addNumberField = (label: string, key: keyof PlanetaryProfile, hint?: string) => {
            const setting = new Settings(fieldsContainer).setName(label);
            if (hint) setting.setDesc(hint);
            setting.addText((text: TextComponent) => {
                text.inputEl.type = 'number';
                text.inputEl.min = '0';
                text.inputEl.addClass('ert-input--xs');
                const current = (profile as any)[key];
                const originalValue = current !== undefined ? String(current) : '';
                text.setValue(originalValue);
                // SAFE: addEventListener used in settings section; cleanup occurs when settings container is destroyed
                text.inputEl.addEventListener('blur', () => { void (async () => {
                    const value = text.getValue();
                    if (value === originalValue) return; // No change
                    const num = parseFloat(value);
                    if (!Number.isFinite(num)) {
                        flash(text.inputEl, 'error');
                        return;
                    }
                    (profile as any)[key] = num;
                    await saveProfile(profile, text.inputEl);
                })(); });
            });
        };

        const addTextField = (label: string, key: keyof PlanetaryProfile, placeholder?: string, onSave?: () => void, sizeClass = 'ert-input--lg') => {
            const setting = new Settings(fieldsContainer).setName(label);
            if (placeholder) setting.setDesc(placeholder);
            setting.addText((text: TextComponent) => {
                const current = (profile as any)[key];
                const originalValue = current ?? '';
                text.setValue(originalValue);
                text.inputEl.addClass(sizeClass);
                // SAFE: addEventListener used in settings section; cleanup occurs when settings container is destroyed
                text.inputEl.addEventListener('blur', () => { void (async () => {
                    const value = text.getValue();
                    if (value === originalValue) return; // No change
                    (profile as any)[key] = value;
                    await saveProfile(profile, text.inputEl);
                    if (onSave) onSave();
                })(); });
            });
        };

        addNumberField(t('planetary.fields.hoursPerDay'), 'hoursPerDay', 'Length of a local day in Earth hours (Earth = 24).');
        addNumberField(t('planetary.fields.daysPerWeek'), 'daysPerWeek', 'Local days in a week (Earth = 7).');
        addNumberField(t('planetary.fields.daysPerYear'), 'daysPerYear', 'Local days in a year (Earth = 365).');
        addNumberField(
            t('planetary.fields.epochOffset'),
            'epochOffsetDays',
            'Move your calendar\'s Year 1, Day 1 forward or back. Example: +18,000 starts your story\'s Year 1 around modern day. Leave at 0 if you don\'t need a real-world anchor.'
        );
        addTextField(t('planetary.fields.epochLabel'), 'epochLabel', 'Shown before YEAR (e.g., "AD", "CE", "Sol").');

        new Settings(fieldsContainer)
            .setName(t('planetary.fields.monthNames'))
            .setDesc('Optional. Determines how the year is divided. Enter one name per line, or comma separated. Leave blank for 12 numbered months.')
            .addTextArea((text: TextAreaComponent) => {
                text.inputEl.addClass('ert-textarea', 'ert-textarea--wide');
                text.inputEl.rows = 6;
                const originalValue = (profile.monthNames || []).join('\n');
                text.setValue(originalValue);
                // SAFE: addEventListener used in settings section; cleanup occurs when settings container is destroyed
                text.inputEl.addEventListener('blur', () => { void (async () => {
                    const value = text.getValue();
                    if (value === originalValue) return;
                    profile.monthNames = parseCommaNames(value);
                    await saveProfile(profile, text.inputEl);
                })(); });
            });

        new Settings(fieldsContainer)
            .setName(t('planetary.fields.weekdayNames'))
            .setDesc('Optional. Sets weekday labels. Enter one name per line, or comma separated. The first name is weekday 1, so Year 1 Day 1 starts there.')
            .addTextArea((text: TextAreaComponent) => {
                text.inputEl.addClass('ert-textarea', 'ert-textarea--wide');
                text.inputEl.rows = 3;
                const originalValue = (profile.weekdayNames || []).join('\n');
                text.setValue(originalValue);
                // SAFE: addEventListener used in settings section; cleanup occurs when settings container is destroyed
                text.inputEl.addEventListener('blur', () => { void (async () => {
                    const value = text.getValue();
                    if (value === originalValue) return;
                    profile.weekdayNames = parseCommaNames(value);
                    await saveProfile(profile, text.inputEl);
                })(); });
            });
    };

    const renderPreview = () => {
        previewContainer.empty();
        const profile = getActiveProfile();
        const hasProfile = !!profile;
        fieldsContainer.classList.toggle('ert-settings-hidden', !hasProfile);
        const header = previewContainer.createDiv({ cls: ['ert-planetary-preview-heading', 'ert-previewFrame__title'] });
        const body = previewContainer.createDiv({ cls: 'ert-planetary-preview-body' });
        if (!hasProfile) {
            header.setText(t('planetary.preview.heading'));
            body.setText(t('planetary.preview.disabled'));
            return;
        }
        const result = convertFromEarth(new Date(), profile);
        header.setText(`Quick preview (Earth → ${profile.label || 'local'})`);
        if (!result) {
            body.setText(t('planetary.preview.invalid'));
            return;
        }
        body.setText(result.formatted);
    };

    const applyVisibility = (enabled: boolean) => {
        visibilityTargets.forEach(el => {
            if (!el) return;
            el.classList.toggle('ert-settings-hidden', !enabled);
        });
    };

    renderFields();
    renderPreview();
    applyVisibility(sectionExpanded);
}
