import { App, Modal, Setting as Settings, DropdownComponent, TextComponent, ButtonComponent, ExtraButtonComponent } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import type { PlanetaryProfile } from '../types';
import { convertFromEarth } from '../utils/planetaryTime';
import { t } from '../i18n';

export class PlanetaryTimeModal extends Modal {
    private plugin: RadialTimelinePlugin;
    private profiles: PlanetaryProfile[];
    private activeId: string | undefined;
    private localDateValue: string;
    private localTimeValue: string;
    private resultEl: HTMLElement | null = null;
    private profileDropdown: DropdownComponent | null = null;

    constructor(app: App, plugin: RadialTimelinePlugin) {
        super(app);
        this.plugin = plugin;
        this.profiles = plugin.settings.planetaryProfiles || [];
        this.activeId = plugin.settings.activePlanetaryProfileId || this.profiles[0]?.id;
        const now = new Date();
        this.localDateValue = this.formatDateInput(now);
        this.localTimeValue = this.formatTimeInput(now);
    }

    onOpen(): void {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        modalEl.classList.add('rt-pulse-modal-shell', 'rt-planetary-modal-shell');
        contentEl.addClass('rt-pulse-modal');

        contentEl.createEl('h2', { text: t('planetary.modal.title') });

        if (!this.plugin.settings.enablePlanetaryTime) {
            contentEl.createDiv({ text: t('planetary.modal.disabled') });
            return;
        }

        if (!this.profiles.length) {
            contentEl.createDiv({ text: t('planetary.modal.noProfile') });
            return;
        }

        const profileSetting = new Settings(contentEl)
            .setName(t('planetary.modal.activeProfile'))
            .setDesc(t('planetary.active.desc'));
        profileSetting.addDropdown(drop => {
            this.profileDropdown = drop;
            this.profiles.forEach(p => drop.addOption(p.id, p.label || 'Unnamed'));
            drop.setValue(this.activeId || this.profiles[0].id);
            drop.onChange(async (value) => {
                this.activeId = value;
                this.plugin.settings.activePlanetaryProfileId = value;
                await this.plugin.saveSettings();
                this.renderResult();
            });
        });

        const inputSetting = new Settings(contentEl)
            .setName(t('planetary.modal.datetimeLabel'))
            .setDesc(t('planetary.modal.datetimeDesc'));

        inputSetting.addText((text: TextComponent) => {
            text.inputEl.type = 'date';
            text.setValue(this.localDateValue);
            text.onChange((value) => {
                this.localDateValue = value;
            });
        });

        inputSetting.addText((text: TextComponent) => {
            text.inputEl.type = 'time';
            text.inputEl.step = '60';
            text.setValue(this.localTimeValue);
            text.onChange((value) => {
                this.localTimeValue = value;
            });
        });

        inputSetting.addExtraButton((button: ExtraButtonComponent) => {
            button.setIcon('clock');
            button.setTooltip(t('planetary.modal.now'));
            button.onClick(() => {
                const now = new Date();
                this.localDateValue = this.formatDateInput(now);
                this.localTimeValue = this.formatTimeInput(now);
                const inputs = inputSetting.controlEl.querySelectorAll('input');
                inputs.forEach((input, idx) => {
                    input.classList.remove('rt-setting-input-error', 'rt-setting-input-success');
                    input.value = idx === 0 ? this.localDateValue : this.localTimeValue;
                });
                this.renderResult();
            });
        });

        const actions = contentEl.createDiv({ cls: 'rt-planetary-modal-actions' });
        const convertBtn = new ButtonComponent(actions)
            .setButtonText(t('planetary.modal.convert'))
            .setCta()
            .onClick(() => this.renderResult());
        convertBtn.buttonEl.classList.add('rt-planetary-convert-btn');

        const helper = contentEl.createDiv({ cls: 'setting-item-description' });
        helper.setText('Epoch offset tip: 0 = 1970-01-01 (Unix epoch). Today (2025-12-17) is about +20,449 days. Positive moves Year 1 forward; negative moves it backward.');

        this.resultEl = contentEl.createDiv({ cls: 'rt-planetary-modal-result' });
        this.renderResult();
    }

    private renderResult(): void {
        if (!this.resultEl) return;
        const profile = this.getActiveProfile();
        if (!profile) {
            this.resultEl.setText(t('planetary.modal.noProfile'));
            return;
        }
        let parsed: Date | null = null;
        try {
            if (!this.localDateValue) {
                parsed = null;
            } else {
                const time = this.localTimeValue || '00:00';
                const maybe = new Date(`${this.localDateValue}T${time}`);
                parsed = Number.isNaN(maybe.getTime()) ? null : maybe;
            }
        } catch {
            parsed = null;
        }
        if (!parsed) {
            this.resultEl.setText(t('planetary.modal.invalid'));
            return;
        }
        const conversion = convertFromEarth(parsed, profile);
        if (!conversion) {
            this.resultEl.setText(t('planetary.preview.invalid'));
            return;
        }
        this.resultEl.setText(conversion.formatted);
    }

    private getActiveProfile(): PlanetaryProfile | null {
        if (!this.profiles.length) return null;
        const match = this.profiles.find(p => p.id === this.activeId);
        return match || this.profiles[0];
    }

    private formatDateInput(d: Date): string {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    private formatTimeInput(d: Date): string {
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    }
}
