import { App, Modal, Setting as Settings, DropdownComponent, TextComponent, ButtonComponent, ExtraButtonComponent } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import type { PlanetaryProfile } from '../types';
import { convertFromEarth } from '../utils/planetaryTime';
import { t } from '../i18n';

export class PlanetaryTimeModal extends Modal {
    private plugin: RadialTimelinePlugin;
    private profiles: PlanetaryProfile[];
    private activeId: string | undefined;
    private inputValue: string;
    private resultEl: HTMLElement | null = null;
    private profileDropdown: DropdownComponent | null = null;

    constructor(app: App, plugin: RadialTimelinePlugin) {
        super(app);
        this.plugin = plugin;
        this.profiles = plugin.settings.planetaryProfiles || [];
        this.activeId = plugin.settings.activePlanetaryProfileId || this.profiles[0]?.id;
        this.inputValue = new Date().toISOString();
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
            text.setPlaceholder(new Date().toISOString());
            text.setValue(this.inputValue);
            text.onChange((value) => {
                this.inputValue = value;
            });
        });

        inputSetting.addExtraButton((button: ExtraButtonComponent) => {
            button.setIcon('clock');
            button.setTooltip(t('planetary.modal.now'));
            button.onClick(() => {
                this.inputValue = new Date().toISOString();
                const input = inputSetting.controlEl.querySelector('input');
                if (input) {
                    input.value = this.inputValue;
                    input.classList.remove('rt-setting-input-error', 'rt-setting-input-success');
                }
                this.renderResult();
            });
        });

        const actions = contentEl.createDiv({ cls: 'rt-planetary-modal-actions' });
        const convertBtn = new ButtonComponent(actions)
            .setButtonText(t('planetary.modal.convert'))
            .setCta()
            .onClick(() => this.renderResult());
        convertBtn.buttonEl.classList.add('rt-planetary-convert-btn');

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
            const maybe = new Date(this.inputValue);
            parsed = Number.isNaN(maybe.getTime()) ? null : maybe;
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
}
