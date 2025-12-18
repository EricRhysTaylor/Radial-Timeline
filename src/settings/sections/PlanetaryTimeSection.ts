import { App, Setting as Settings, TextComponent, DropdownComponent } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import type { PlanetaryProfile } from '../../types';
import { convertFromEarth, parseCommaNames, validatePlanetaryProfile } from '../../utils/planetaryTime';
import { t } from '../../i18n';

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

export function renderPlanetaryTimeSection({ plugin, containerEl }: SectionParams): void {
    const profiles = plugin.settings.planetaryProfiles || [];
    if (!plugin.settings.planetaryProfiles) {
        plugin.settings.planetaryProfiles = profiles;
    }

    // Section header and description (use Obsidian defaults)
    containerEl.createEl('h3', { text: t('planetary.heading') });

    // Feature toggle
    const visibilityTargets: HTMLElement[] = [];

    new Settings(containerEl)
        .setName(t('planetary.enable.name'))
        .setDesc('Keep Earth as the planning source, use the profile label to match your world calendar, set epoch offset to align Year 1 to a story milestone, and jot orbital quirks in scene notes.')
        .addToggle(toggle => {
            toggle.setValue(!!plugin.settings.enablePlanetaryTime);
            toggle.onChange(async (value) => {
                plugin.settings.enablePlanetaryTime = value;
                applyVisibility(value);
                await plugin.saveSettings();
            });
        });

    // Wrap all dependent controls so we can hide them together
    const bodyEl = containerEl.createDiv({ cls: 'rt-planetary-body' });
    visibilityTargets.push(bodyEl);

    // Active profile selector + buttons
    let activeProfileId = plugin.settings.activePlanetaryProfileId || profiles[0]?.id;

    const selectorSetting = new Settings(bodyEl)
        .setName(t('planetary.active.name'))
        .setDesc(t('planetary.active.desc'));

    let selector: DropdownComponent | undefined;
    const renderSelector = () => {
        selectorSetting.clear();
        selectorSetting.setName(t('planetary.active.name'));
        selectorSetting.setDesc(t('planetary.active.desc'));
        selectorSetting.addDropdown(dropdown => {
            selector = dropdown;
            profiles.forEach(p => dropdown.addOption(p.id, p.label || 'Unnamed'));
            dropdown.setValue(activeProfileId || profiles[0]?.id || '');
            dropdown.onChange(async (value) => {
                activeProfileId = value;
                plugin.settings.activePlanetaryProfileId = value;
                await plugin.saveSettings();
                renderFields();
                renderPreview();
            });
        });
        selectorSetting.addExtraButton(btn => {
            btn.setIcon('plus');
            btn.setTooltip(t('planetary.actions.add'));
            btn.onClick(async () => {
                const profile = DEFAULT_PROFILE();
                profiles.push(profile);
                activeProfileId = profile.id;
                plugin.settings.activePlanetaryProfileId = activeProfileId;
                await plugin.saveSettings();
                renderSelector();
                renderFields();
                renderPreview();
            });
        });
        selectorSetting.addExtraButton(btn => {
            btn.setIcon('trash');
            btn.setTooltip(t('planetary.actions.delete'));
            btn.setDisabled(profiles.length === 0);
            btn.onClick(async () => {
                if (!activeProfileId) return;
                const index = profiles.findIndex(p => p.id === activeProfileId);
                if (index === -1) return;
                profiles.splice(index, 1);
                activeProfileId = profiles[0]?.id;
                plugin.settings.activePlanetaryProfileId = activeProfileId;
                await plugin.saveSettings();
                renderSelector();
                renderFields();
                renderPreview();
            });
        });
    };

    renderSelector();

    // Profile fields
    const fieldsContainer = bodyEl.createDiv({ cls: 'rt-planetary-fields' });
    const previewContainer = bodyEl.createDiv({ cls: 'rt-planetary-preview' });
    visibilityTargets.push(selectorSetting.settingEl, fieldsContainer, previewContainer);

    const flash = (input: HTMLInputElement, type: 'success' | 'error') => {
        const successClass = 'rt-setting-input-success';
        const errorClass = 'rt-setting-input-error';
        input.classList.remove(type === 'success' ? errorClass : successClass);
        input.classList.add(type === 'success' ? successClass : errorClass);
        window.setTimeout(() => input.classList.remove(type === 'success' ? successClass : errorClass), type === 'success' ? 900 : 1200);
    };

    const saveProfile = async (updated: PlanetaryProfile, input?: HTMLInputElement) => {
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
        if (input) flash(input, 'success');
        renderPreview();
    };

    const getActiveProfile = (): PlanetaryProfile | null => {
        return profiles.find(p => p.id === activeProfileId) || null;
    };

    const renderFields = () => {
        fieldsContainer.empty();
        const profile = getActiveProfile();
        if (!profile) {
            fieldsContainer.createDiv({ text: t('planetary.preview.empty') });
            return;
        }

        const addNumberField = (label: string, key: keyof PlanetaryProfile, hint?: string) => {
            const setting = new Settings(fieldsContainer).setName(label);
            if (hint) setting.setDesc(hint);
            setting.addText((text: TextComponent) => {
                text.inputEl.type = 'number';
                text.inputEl.min = '0';
                const current = (profile as any)[key];
                text.setValue(current !== undefined ? String(current) : '');
                text.onChange(async (value) => {
                    const num = parseFloat(value);
                    if (!Number.isFinite(num)) {
                        flash(text.inputEl, 'error');
                        return;
                    }
                    (profile as any)[key] = num;
                    await saveProfile(profile, text.inputEl);
                });
            });
        };

        const addTextField = (label: string, key: keyof PlanetaryProfile, placeholder?: string) => {
            const setting = new Settings(fieldsContainer).setName(label);
            if (placeholder) setting.setDesc(placeholder);
            setting.addText((text: TextComponent) => {
                const current = (profile as any)[key];
                text.setValue(current ?? '');
                text.onChange(async (value) => {
                    (profile as any)[key] = value;
                    await saveProfile(profile, text.inputEl);
                });
            });
        };

        addTextField(t('planetary.fields.profileName'), 'label');
        addNumberField(t('planetary.fields.hoursPerDay'), 'hoursPerDay', 'Length of a local day in Earth hours (e.g., 17 or 30).');
        addNumberField(t('planetary.fields.daysPerWeek'), 'daysPerWeek', 'Local days in a week (e.g., 12).');
        addNumberField(t('planetary.fields.daysPerYear'), 'daysPerYear', 'Local days in a year (e.g., 480).');
        addNumberField(
            t('planetary.fields.epochOffset'),
            'epochOffsetDays',
            'Shift Year 1, Day 1 by Earth days (0 = 1970-01-01, +365 ≈ 1971-01-01, -30 ≈ 1969-12-02, today 2025-12-17 ≈ 20,449). 1970 is the Unix epoch reference point.'
        );
        addTextField(t('planetary.fields.epochLabel'), 'epochLabel', 'Shown before YEAR (e.g., “CF”, “Era of Storms”).');

        new Settings(fieldsContainer)
            .setName(t('planetary.fields.monthNames'))
            .setDesc('Optional. Determines how the year is divided. Provide names to set the month count (e.g. 4 names = 4 months). Leave blank for 12 numbered months.')
            .addText((text: TextComponent) => {
                text.setValue((profile.monthNames || []).join(', '));
                text.onChange(async (value) => {
                    profile.monthNames = parseCommaNames(value);
                    await saveProfile(profile, text.inputEl);
                });
            });

        new Settings(fieldsContainer)
            .setName(t('planetary.fields.weekdayNames'))
            .setDesc('Optional. Sets weekday labels; leave blank for numbered weekdays.')
            .addText((text: TextComponent) => {
                text.setValue((profile.weekdayNames || []).join(', '));
                text.onChange(async (value) => {
                    profile.weekdayNames = parseCommaNames(value);
                    await saveProfile(profile, text.inputEl);
                });
            });
    };

    const renderPreview = () => {
        previewContainer.empty();
        const profile = getActiveProfile();
        if (!profile) return;
        const result = convertFromEarth(new Date(), profile);
        const header = previewContainer.createDiv({ cls: 'rt-planetary-preview-heading' });
        header.setText(t('planetary.preview.heading'));
        const body = previewContainer.createDiv({ cls: 'rt-planetary-preview-body' });
        if (!result) {
            body.setText(t('planetary.preview.invalid'));
            return;
        }
        body.setText(result.formatted);
    };

    const applyVisibility = (enabled: boolean) => {
        visibilityTargets.forEach(el => {
            if (!el) return;
            el.classList.toggle('rt-planetary-hidden', !enabled);
        });
    };

    renderFields();
    renderPreview();
    applyVisibility(!!plugin.settings.enablePlanetaryTime);
}
