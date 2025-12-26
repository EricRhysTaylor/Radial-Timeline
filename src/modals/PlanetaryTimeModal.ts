import { App, Modal, Setting as Settings, DropdownComponent, TextComponent, ButtonComponent, ExtraButtonComponent, setIcon } from 'obsidian';
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
    private resultTextEl: HTMLElement | null = null;
    private profileDropdown: DropdownComponent | null = null;
    private lastProfile: PlanetaryProfile | null = null;
    private lastFormatted: string | null = null;

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

        // Apply generic modal shell + modal-specific class
        if (modalEl) {
            modalEl.classList.add('rt-modal-shell');
            modalEl.style.width = '720px'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxWidth = '92vw';
        }
        contentEl.addClass('rt-modal-container', 'rt-planetary-modal');

        // Header
        const header = contentEl.createDiv({ cls: 'rt-modal-header' });
        header.createSpan({ cls: 'rt-modal-badge', text: t('planetary.heading') });
        header.createDiv({ cls: 'rt-modal-title', text: t('planetary.modal.title') });
        header.createDiv({ cls: 'rt-modal-subtitle', text: t('planetary.modal.datetimeDesc') });

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
        inputSetting.settingEl.addClass('rt-planetary-datetime-setting');

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

        const actions = contentEl.createDiv({ cls: 'rt-modal-actions' });
        const convertBtn = new ButtonComponent(actions)
            .setButtonText(t('planetary.modal.convert'))
            .setCta()
            .onClick(() => this.renderResult());
        convertBtn.buttonEl.classList.add('rt-planetary-convert-btn');

        const resultRow = contentEl.createDiv({ cls: 'rt-planetary-modal-result-row' });
        this.resultEl = resultRow.createDiv({ cls: 'rt-planetary-modal-result' });
        const iconEl = this.resultEl.createDiv({ cls: 'rt-planetary-result-icon' });
        setIcon(iconEl, 'orbit');
        this.resultTextEl = this.resultEl.createDiv({ cls: 'rt-planetary-result-text' });
        new ExtraButtonComponent(resultRow)
            .setIcon('copy')
            .setTooltip('Copy YAML')
            .onClick(() => this.copyYaml());
        this.renderResult();
    }

    private renderResult(): void {
        if (!this.resultEl || !this.resultTextEl) return;
        this.lastProfile = null;
        this.lastFormatted = null;
        const profile = this.getActiveProfile();
        if (!profile) {
            this.resultTextEl.setText(t('planetary.modal.noProfile'));
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
            this.resultTextEl.setText(t('planetary.modal.invalid'));
            return;
        }
        const conversion = convertFromEarth(parsed, profile);
        if (!conversion) {
            this.resultTextEl.setText(t('planetary.preview.invalid'));
            return;
        }
        this.lastProfile = profile;
        this.lastFormatted = conversion.formatted;
        this.resultTextEl.setText(conversion.formatted);
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

    private copyYaml(): void {
        if (!this.lastProfile || !this.lastFormatted) return;
        const yaml = [
            'Planetary:',
            `  profile: ${this.lastProfile.label || 'Unknown'}`,
            `  local: "${this.lastFormatted}"`,
        ].join('\n');
        navigator.clipboard?.writeText(yaml).catch(() => {
            // Obsidian desktop supports clipboard; ignore failures silently
        });
    }
}
