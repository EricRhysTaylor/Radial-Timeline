import { App, Modal, Setting, Notice, normalizePath, ButtonComponent, TextAreaComponent, TextComponent } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { createBeatTemplateNotes } from '../utils/beatsTemplates';
import { generateSceneContent, mergeTemplates, SceneCreationData } from '../utils/sceneGenerator';
import { DEFAULT_SETTINGS } from '../settings/defaults';
import { parseDuration, parseDurationDetail } from '../utils/date';
import { getCustomSystemFromSettings } from '../utils/beatsSystems';
import type { BookDesignerTemplate, BookDesignerSceneAssignment } from '../types/settings';
import { ModalFolderSuggest } from '../settings/FolderSuggest';

const DEFAULT_SUBPLOTS = "Main Plot\nSubplot A\nSubplot B";
const DEFAULT_CHARACTERS = "Hero\nAntagonist";

type PreviewDims = {
    cx: number;
    cy: number;
    outerR: number;
    innerR: number;
    subplotCount: number;
    totalActs: number;
    ringWidth: number;
};

class SaveTemplateModal extends Modal {
    private nameInput!: TextComponent;
    private descriptionEl: HTMLElement | null = null;
    private onSave: (name: string) => void;
    private defaultName: string;

    constructor(app: App, onSave: (name: string) => void, defaultName: string) {
        super(app);
        this.onSave = onSave;
        this.defaultName = defaultName;
    }

    onOpen(): void {
        const { contentEl, modalEl, titleEl } = this;
        contentEl.empty();
        titleEl.setText('');

        if (modalEl) {
            modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell', 'ert-modal-shell--md');
        }

        contentEl.addClass('ert-modal-container', 'ert-stack');
        contentEl.addClass('rt-template-dialog');

        const header = contentEl.createDiv({ cls: 'ert-modal-header' });
        header.createSpan({ cls: 'ert-modal-badge', text: 'TEMPLATE' });
        header.createDiv({ cls: 'ert-modal-title', text: 'Save layout template' });
        header.createDiv({ cls: 'ert-modal-subtitle', text: 'Name this layout so you can reuse it later.' });

        const form = contentEl.createDiv({ cls: 'rt-glass-card rt-sub-card' });
        const nameSetting = new Setting(form)
            .setName('Template name')
            .setDesc('Choose a short, unique name.')
            .addText(text => {
                this.nameInput = text;
                text.inputEl.addClass('rt-input-lg');
                text.setPlaceholder('e.g., Thriller / 3-Act Balanced');
                text.setValue(this.defaultName);
                text.inputEl.addEventListener('keydown', (evt) => {
                    if (evt.key === 'Enter') {
                        evt.preventDefault();
                        this.handleSave();
                    }
                });
            });
        nameSetting.settingEl.addClass('rt-manuscript-group-setting');

        this.descriptionEl = form.createDiv({ cls: 'rt-sub-card-note', text: 'Templates capture layout, acts, subplots, characters, beats toggle, and the selected YAML type (base/advanced).' });

        const footer = contentEl.createDiv({ cls: 'ert-modal-actions' });
        new ButtonComponent(footer)
            .setButtonText('Save')
            .setCta()
            .onClick(() => this.handleSave());

        new ButtonComponent(footer)
            .setButtonText('Cancel')
            .onClick(() => this.close());

        footer.querySelectorAll('button').forEach(btn => {
            btn.style.cursor = 'pointer';
        });
    }

    private handleSave(): void {
        const name = this.nameInput.getValue().trim();
        if (!name) {
            new Notice('Template name is required.');
            return;
        }
        this.onSave(name);
        this.close();
    }
}

class DeleteTemplateModal extends Modal {
    private onConfirm: () => void;
    private templateName: string;

    constructor(app: App, templateName: string, onConfirm: () => void) {
        super(app);
        this.templateName = templateName;
        this.onConfirm = onConfirm;
    }

    onOpen(): void {
        const { contentEl, modalEl, titleEl } = this;
        contentEl.empty();
        titleEl.setText('');

        if (modalEl) {
            modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell', 'ert-modal-shell--sm');
        }

        contentEl.addClass('ert-modal-container', 'ert-stack');
        contentEl.addClass('rt-template-dialog');

        const header = contentEl.createDiv({ cls: 'ert-modal-header' });
        header.createSpan({ cls: 'ert-modal-badge', text: 'TEMPLATE' });
        header.createDiv({ cls: 'ert-modal-title', text: 'Delete template' });
        header.createDiv({ cls: 'ert-modal-subtitle', text: `Delete "${this.templateName}"? This cannot be undone.` });

        const footer = contentEl.createDiv({ cls: 'ert-modal-actions' });
        new ButtonComponent(footer)
            .setButtonText('Delete')
            .setCta()
            .onClick(() => {
                this.onConfirm();
                this.close();
            });

        new ButtonComponent(footer)
            .setButtonText('Cancel')
            .onClick(() => this.close());

        footer.querySelectorAll('button').forEach(btn => {
            btn.style.cursor = 'pointer';
        });
    }
}

export class BookDesignerModal extends Modal {
    private plugin: RadialTimelinePlugin;

    // Form values
    private timeIncrement: string = "1 day";
    private scenesToGenerate: number = 1;
    private targetRangeMax: number = 60;
    private selectedActs: number[] = [1, 2, 3];
    private subplots: string = DEFAULT_SUBPLOTS;
    private character: string = DEFAULT_CHARACTERS;
    private templateType: 'base' | 'advanced';
    private generateBeats: boolean = false;
    private targetPath: string = '';

    // Preview
    private previewHostEl: HTMLElement | null = null;
    private previewUpdateRaf: number | null = null;
    private previewStatusEl: HTMLElement | null = null;
    private heroLocationMeta: HTMLElement | null = null;
    private heroModeMeta: HTMLElement | null = null;

    // Layout + templates
    private sceneAssignments: BookDesignerSceneAssignment[] = [];
    private distributionMode: 'auto' | 'manual';
    private activeTemplateId: string | null = null;
    private isApplyingTemplate: boolean = false;

    // Drag state
    private dragState: { sceneNumber: number; pointerId: number; dims: PreviewDims; targetAct: number; targetSubplot: number } | null = null;

    // Input refs for template/application updates
    private timeIncrementInput: TextComponent | null = null;
    private scenesInput: TextComponent | null = null;
    private targetRangeInput: TextComponent | null = null;
    private targetPathInput: TextComponent | null = null;
    private subplotsInput: TextAreaComponent | null = null;
    private characterInput: TextAreaComponent | null = null;
    private templateDropdown: HTMLSelectElement | null = null;
    private actCheckboxes: HTMLInputElement[] = [];
    private templateTypePills: HTMLElement[] = [];
    private beatPills: HTMLElement[] = [];
    private deleteTemplateBtn: ButtonComponent | null = null;

    constructor(app: App, plugin: RadialTimelinePlugin) {
        super(app);
        this.plugin = plugin;
        this.templateType = 'base';
        this.distributionMode = 'auto';
    }

    private getMaxActs(): number {
        const fromSettings = (this.plugin.settings as any).actCount;
        const parsed = typeof fromSettings === 'number' ? Math.floor(fromSettings) : 3;
        return Math.min(10, Math.max(3, parsed));
    }

    private normalizeSelectedActs(maxActs: number): number[] {
        const unique = Array.from(new Set(this.selectedActs)).filter(a => a >= 1 && a <= maxActs);
        if (unique.length > 0) return unique.sort((a, b) => a - b);
        return [1, 2, 3].filter(a => a <= maxActs);
    }

    private resetManualLayout(): void {
        this.distributionMode = 'auto';
        this.activeTemplateId = null;
        this.sceneAssignments = this.rebuildAutoAssignments();
        this.dragState = null;
        this.updateDistributionStatus();
    }

    private resetAllDefaults(): void {
        const maxActs = this.getMaxActs();
        this.timeIncrement = '1 day';
        this.scenesToGenerate = 1;
        this.targetRangeMax = 60;
        this.selectedActs = Array.from({ length: maxActs }, (_, i) => i + 1);
        this.subplots = DEFAULT_SUBPLOTS;
        this.character = DEFAULT_CHARACTERS;
        this.templateType = 'base';
        this.generateBeats = false;
        this.activeTemplateId = null;
        this.distributionMode = 'auto';
        this.sceneAssignments = this.rebuildAutoAssignments();

        // Sync UI fields if they exist
        if (this.timeIncrementInput) this.timeIncrementInput.setValue(this.timeIncrement);
        if (this.scenesInput) this.scenesInput.setValue(this.scenesToGenerate.toString());
        if (this.targetRangeInput) this.targetRangeInput.setValue(this.targetRangeMax.toString());
        if (this.subplotsInput) this.subplotsInput.setValue(this.subplots);
        if (this.characterInput) this.characterInput.setValue(this.character);

        // Acts checkboxes
        this.actCheckboxes.forEach((input, idx) => {
            const actNum = idx + 1;
            input.checked = this.selectedActs.includes(actNum);
        });

        // Template pills
        this.templateTypePills.forEach(pill => {
            const id = pill.getAttr('data-template-id') as 'base' | 'advanced' | null;
            if (!id) return;
            if (id === this.templateType) pill.addClass('rt-is-active');
            else pill.removeClass('rt-is-active');
        });

        // Beat pills
        this.beatPills.forEach(pill => {
            const val = pill.getAttr('data-generate-beats') === 'true';
            if (val === this.generateBeats) pill.addClass('rt-is-active');
            else pill.removeClass('rt-is-active');
        });

        if (this.templateDropdown) this.templateDropdown.value = '';
        this.refreshTemplateDropdown();
        this.updateDistributionStatus();
        this.schedulePreviewUpdate();
    }

    private markManualLayout(): void {
        this.distributionMode = 'manual';
        this.activeTemplateId = null;
        this.updateDistributionStatus();
    }

    private rebuildAutoAssignments(): BookDesignerSceneAssignment[] {
        const scenes = Math.max(1, Math.floor(this.scenesToGenerate || 1));
        const actsList = this.getActsListSorted();
        const subplotList = this.parseSubplots();

        const buckets: number[][] = actsList.map(() => []);
        const baseSize = Math.floor(scenes / actsList.length);
        const rem = scenes % actsList.length;
        const sizes = actsList.map(() => baseSize);
        if (baseSize === 0) {
            let r = rem;
            let idx = 0;
            while (r > 0 && idx < sizes.length) {
                sizes[idx] += 1;
                r -= 1;
                idx += 1;
            }
        } else if (actsList.length === 3 && baseSize === 1 && rem === 2) {
            sizes[0] = 2;
            sizes[1] = 2;
            sizes[2] = 1;
        } else {
            sizes[sizes.length - 1] += rem;
        }

        let actCursor = 0;
        let remainingInAct = sizes[0] ?? scenes;
        for (let i = 1; i <= scenes; i++) {
            buckets[actCursor].push(i);
            remainingInAct -= 1;
            if (remainingInAct === 0 && actCursor < actsList.length - 1) {
                actCursor += 1;
                remainingInAct = sizes[actCursor];
            }
        }

        const assignments: BookDesignerSceneAssignment[] = [];
        buckets.forEach((sceneNums, idx) => {
            const actNumber = actsList[idx];
            sceneNums.forEach(sceneNum => {
                const subplotIndex = (sceneNum - 1) % subplotList.length;
                assignments.push({
                    sceneNumber: sceneNum,
                    act: actNumber,
                    subplotIndex
                });
            });
        });

        // Ensure assignments are sorted by scene number
        return assignments.sort((a, b) => a.sceneNumber - b.sceneNumber);
    }

    private getWorkingAssignments(): BookDesignerSceneAssignment[] {
        const scenes = Math.max(1, Math.floor(this.scenesToGenerate || 1));
        if (this.distributionMode === 'manual' && this.sceneAssignments.length === scenes) {
            return this.sceneAssignments;
        }
        this.sceneAssignments = this.rebuildAutoAssignments();
        this.distributionMode = 'auto';
        this.updateDistributionStatus();
        return this.sceneAssignments;
    }

    private coerceAssignments(assignments: BookDesignerSceneAssignment[], subplotCount: number, actsList: number[]): BookDesignerSceneAssignment[] {
        const scenes = Math.max(1, Math.floor(this.scenesToGenerate || 1));
        const auto = this.rebuildAutoAssignments();
        const actSet = new Set(actsList);
        const maxSubplot = Math.max(0, subplotCount - 1);

        return Array.from({ length: scenes }, (_, idx) => {
            const sceneNum = idx + 1;
            const incoming = assignments.find(a => a.sceneNumber === sceneNum);
            const fallback = auto[idx] ?? {
                sceneNumber: sceneNum,
                act: actsList[0] ?? 1,
                subplotIndex: 0
            };
            if (!incoming) return fallback;
            const act = actSet.has(incoming.act) ? incoming.act : fallback.act;
            const subplotIndex = incoming.subplotIndex >= 0 && incoming.subplotIndex <= maxSubplot ? incoming.subplotIndex : Math.min(fallback.subplotIndex, maxSubplot);
            return { sceneNumber: sceneNum, act, subplotIndex };
        });
    }

    private getTemplateList(): BookDesignerTemplate[] {
        const list = (this.plugin.settings as any).bookDesignerTemplates;
        if (Array.isArray(list)) return list;
        return [];
    }

    private getCurrentTemplateSelection(): string | null {
        if (!this.templateDropdown) return null;
        const val = this.templateDropdown.value;
        return val && val.trim().length > 0 ? val : null;
    }

    private async persistTemplateList(list: BookDesignerTemplate[]): Promise<void> {
        (this.plugin.settings as any).bookDesignerTemplates = list;
        await this.plugin.saveSettings();
    }

    private updateHeroMeta(): void {
        if (this.heroLocationMeta) {
            const displayPath = this.targetPath || 'vault root';
            this.heroLocationMeta.setText(`Location: ${displayPath}`);
        }

        if (this.heroModeMeta) {
            const modeLabel = this.distributionMode === 'manual' ? 'Manual mode' : 'Auto mode';
            this.heroModeMeta.setText(modeLabel);
            this.heroModeMeta.toggleClass('rt-meta-auto', this.distributionMode !== 'manual');
            this.heroModeMeta.toggleClass('rt-meta-manual', this.distributionMode === 'manual');
        }
    }

    private updateDistributionStatus(): void {
        const mode = this.distributionMode === 'manual' ? 'Manual layout active' : 'Auto distribution';
        const templatePart = this.activeTemplateId ? ' · From template' : '';
        if (this.previewStatusEl) {
            this.previewStatusEl.setText(`— ${mode}${templatePart}`);
        }
        this.updateHeroMeta();
    }

    private refreshTemplateDropdown(): void {
        if (!this.templateDropdown) return;
        const selectEl = this.templateDropdown;
        selectEl.empty();
        const templates = this.getTemplateList();
        const hasTemplates = templates.length > 0;

        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.text = hasTemplates ? 'New template' : '—';
        placeholder.disabled = false;
        placeholder.selected = !this.activeTemplateId;
        selectEl.appendChild(placeholder);

        templates.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.text = t.name;
            if (this.activeTemplateId && this.activeTemplateId === t.id) {
                opt.selected = true;
                placeholder.selected = false;
            }
            selectEl.appendChild(opt);
        });

        selectEl.disabled = false;
        selectEl.value = this.activeTemplateId ?? '';

        if (this.deleteTemplateBtn) {
            const hasSelection = !!this.getCurrentTemplateSelection();
            this.deleteTemplateBtn.setDisabled(!hasTemplates || !hasSelection);
        }
    }

    private async deleteTemplate(templateId: string): Promise<void> {
        const templates = this.getTemplateList().filter(t => t.id !== templateId);
        await this.persistTemplateList(templates);
        if (this.activeTemplateId === templateId) {
            this.activeTemplateId = null;
        }
        if (this.templateDropdown) {
            this.templateDropdown.value = '';
        }
        this.resetManualLayout();
        this.refreshTemplateDropdown();
        this.schedulePreviewUpdate();
        new Notice('Template deleted.');
    }

    private async saveOrUpdateTemplate(): Promise<void> {
        const selectedId = this.getCurrentTemplateSelection();
        if (selectedId) {
            const tpl = this.getTemplateList().find(t => t.id === selectedId);
            if (!tpl) return;
            await this.saveTemplate(tpl.name, selectedId);
            return;
        }
        const defaultName = `Layout ${this.templateType === 'base' ? 'Basic' : 'Advanced'} ${new Date().toLocaleDateString()}`;
        new SaveTemplateModal(this.app, (name) => {
            void this.saveTemplate(name);
        }, defaultName).open();
    }

    private async saveTemplate(name: string, existingId?: string): Promise<void> {
        const subplotList = this.parseSubplots();
        const characters = this.character.split('\n').map(c => c.trim()).filter(Boolean);
        const assignments = this.getWorkingAssignments();

        const template: BookDesignerTemplate = {
            id: existingId ?? `${Date.now()}`,
            name,
            templateType: this.templateType,
            createdAt: new Date().toISOString(),
            scenesToGenerate: this.scenesToGenerate,
            targetRangeMax: this.targetRangeMax,
            timeIncrement: this.timeIncrement,
            selectedActs: [...this.selectedActs],
            subplots: subplotList,
            characters,
            generateBeats: this.generateBeats,
            assignments: assignments.map(a => ({ ...a })),
            targetPath: this.targetPath || undefined
        };

        const existing = this.getTemplateList();
        const filtered = existing.filter(t => t.id !== template.id);
        filtered.unshift(template);
        await this.persistTemplateList(filtered);
        this.activeTemplateId = template.id;
        this.refreshTemplateDropdown();
        this.updateDistributionStatus();
        new Notice(`Template "${name}" ${existingId ? 'updated' : 'saved'}.`);
    }

    private applyTemplateById(templateId: string): void {
        const tpl = this.getTemplateList().find(t => t.id === templateId);
        if (!tpl) {
            new Notice('Template not found.');
            return;
        }
        this.applyTemplate(tpl);
    }

    private applyTemplate(template: BookDesignerTemplate): void {
        this.isApplyingTemplate = true;

        this.templateType = template.templateType;
        this.scenesToGenerate = template.scenesToGenerate;
        this.targetRangeMax = template.targetRangeMax;
        this.timeIncrement = template.timeIncrement;
        this.selectedActs = [...template.selectedActs];
        this.subplots = template.subplots.join('\n') || 'Main Plot';
        this.character = template.characters.join('\n') || 'Hero';
        this.generateBeats = template.generateBeats;
        this.targetPath = template.targetPath ?? this.plugin.settings.sourcePath;

        const subplotCount = Math.max(1, template.subplots.length || this.parseSubplots().length);
        const coerced = this.coerceAssignments(template.assignments, subplotCount, this.selectedActs);
        this.sceneAssignments = coerced;
        this.distributionMode = 'manual';
        this.activeTemplateId = template.id;
        this.isApplyingTemplate = false;

        this.syncUiFromState();
        this.updateDistributionStatus();
        this.schedulePreviewUpdate();
        new Notice(`Applied template "${template.name}".`);
    }

    private syncUiFromState(): void {
        // Text inputs
        if (this.timeIncrementInput) this.timeIncrementInput.setValue(this.timeIncrement);
        if (this.scenesInput) this.scenesInput.setValue(this.scenesToGenerate.toString());
        if (this.targetRangeInput) this.targetRangeInput.setValue(this.targetRangeMax.toString());
        if (this.targetPathInput) this.targetPathInput.setValue(this.targetPath);
        if (this.subplotsInput) this.subplotsInput.setValue(this.subplots);
        if (this.characterInput) this.characterInput.setValue(this.character);

        // Acts checkboxes
        const maxActs = this.getMaxActs();
        this.selectedActs = this.normalizeSelectedActs(maxActs);
        this.actCheckboxes.forEach((input, idx) => {
            const actNum = idx + 1;
            input.checked = this.selectedActs.includes(actNum);
        });

        // Template pills
        this.templateTypePills.forEach(pill => {
            const id = pill.getAttr('data-template-id') as 'base' | 'advanced' | null;
            if (!id) return;
            if (id === this.templateType) pill.addClass('rt-is-active');
            else pill.removeClass('rt-is-active');
        });

        // Beat pills
        this.beatPills.forEach(pill => {
            const val = pill.getAttr('data-generate-beats') === 'true';
            if (val === this.generateBeats) pill.addClass('rt-is-active');
            else pill.removeClass('rt-is-active');
        });

        this.refreshTemplateDropdown();
    }

    onOpen(): void {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        const maxActs = this.getMaxActs();
        this.selectedActs = Array.from({ length: maxActs }, (_, i) => i + 1);
        this.sceneAssignments = this.rebuildAutoAssignments();
        this.distributionMode = 'auto';
        this.activeTemplateId = null;
        this.actCheckboxes = [];
        this.templateTypePills = [];
        this.beatPills = [];
        this.heroLocationMeta = null;
        this.heroModeMeta = null;
        this.targetPath = this.plugin.settings.sourcePath;

        // Use generic modal system + Book Designer specific class
        if (modalEl) {
            modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell');
            modalEl.style.width = '860px'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxWidth = '96vw'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxHeight = '92vh'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
        }
        contentEl.addClass('ert-modal-container', 'ert-stack');
        contentEl.addClass('rt-book-designer-modal');
        contentEl.addClass('rt-manuscript-surface');


        const displayPath = this.targetPath || 'vault root';
        // Hero Header using generic modal system
        const hero = contentEl.createDiv({ cls: 'ert-modal-header' });
        hero.createSpan({ cls: 'ert-modal-badge', text: 'SETUP' });
        hero.createDiv({ cls: 'ert-modal-title', text: 'Book designer' });
        hero.createDiv({ cls: 'ert-modal-subtitle', text: `Configure and generate the scaffold for your new novel. Drag scenes in Preview to different acts and subplots to activate manual mode. Save the template to reuse it later.` });


        const heroMeta = hero.createDiv({ cls: 'ert-modal-meta' });
        this.heroLocationMeta = heroMeta.createSpan({ cls: 'ert-modal-meta-item', text: `Location: ${displayPath}` });
        this.heroModeMeta = heroMeta.createSpan({ cls: 'ert-modal-meta-item rt-meta-auto', text: 'Auto mode' });
        this.updateHeroMeta();

        const scrollContainer = contentEl.createDiv({ cls: 'rt-container rt-card-stack' });

        // SECTION 1: LOCATION & STRUCTURE
        const structCard = scrollContainer.createDiv({ cls: 'rt-glass-card rt-sub-card' });
        structCard.createDiv({ cls: 'rt-sub-card-head', text: 'Location & Structure' });

        // Target book folder
        new Setting(structCard)
            .setName('Target book folder')
            .setDesc('Where scenes and beats will be created. Defaults to the global source path.')
            .addText(text => {
                this.targetPathInput = text;
                text.setValue(this.targetPath)
                    .setPlaceholder('vault root');
                text.inputEl.addClass('rt-input-sm');
                new ModalFolderSuggest(this.app, text.inputEl, (path: string) => {
                    this.targetPath = path;
                    text.setValue(path);
                    this.updateHeroMeta();
                });
                text.inputEl.addEventListener('blur', () => {
                    const raw = text.getValue().trim();
                    this.targetPath = raw;
                    this.updateHeroMeta();
                });
            });

        // Time Increment Setting
        new Setting(structCard)
            .setName('Date increment per scene')
            .setDesc('Timeline increment across scenes (e.g. 1 hour, 1 day, 1 week). Set to 0 to disable increments.')
            .addText(text => {
                this.timeIncrementInput = text;
                text.setValue(this.timeIncrement)
                    .setPlaceholder('1 day');
                text.inputEl.addClass('rt-input-sm');

                // Use blur to validate
                text.inputEl.addEventListener('blur', () => {
                    const raw = text.getValue().trim();
                    // Clear previous animation classes to allow re-triggering
                    text.inputEl.removeClass('rt-input-flash-success');
                    text.inputEl.removeClass('rt-input-flash-error');

                    // Force a reflow to restart animation if class is re-added immediately (though we clear above)
                    void text.inputEl.offsetWidth;

                    if (!raw) {
                        this.timeIncrement = '0';
                        text.setValue('0');
                        text.inputEl.addClass('rt-input-flash-success');
                        return;
                    }

                    const valid = parseDurationDetail(raw);
                    const isZero = parseDuration(raw) === 0;

                    if (valid || isZero) {
                        this.timeIncrement = raw;
                        text.inputEl.addClass('rt-input-flash-success');
                    } else {
                        new Notice(`Invalid duration: "${raw}". Reverting to ${this.timeIncrement}.`);
                        text.setValue(this.timeIncrement);
                        text.inputEl.addClass('rt-input-flash-error');
                    }
                });
            });

        // Scenes + target range group (single border spanning both columns)
        const countsGroup = structCard.createDiv({ cls: 'rt-manuscript-card-block rt-manuscript-group-block' });
        const countsGrid = countsGroup.createDiv({ cls: 'rt-manuscript-duo-grid' });

        // Forward reference workaround: Define lengthSetting first but add it later? 
        // No, we can just define the update helper to take setting instance.
        // We need lengthSetting instance to update it when scenes changes.
        // So we create the element but populate it.

        // Actually, we can just define lengthSetting AFTER scenesSetting, 
        // but update it inside scenesSetting's onChange.
        // But scenesSetting's onChange runs later, so lengthSetting will be defined by then.
        // TypeScript might complain about "used before declaration" if inside the closure.
        // Let's use `this` or a mutable reference.

        let lengthSettingRef: Setting;

        const scenesSetting = new Setting(countsGrid)
            .setName('Scenes to generate')
            .setDesc('Number of template scene files to create with YAML frontmatter.')
            .addText(text => {
                this.scenesInput = text;
                text
                    .setValue(this.scenesToGenerate.toString())
                    .onChange(value => {
                        // Live update for preview only — no clamping while typing
                        const parsed = parseInt(value);
                        if (!isNaN(parsed) && parsed > 0) {
                            this.scenesToGenerate = parsed;
                            if (lengthSettingRef) this.updateTargetDesc(lengthSettingRef);
                            if (!this.isApplyingTemplate) this.resetManualLayout();
                            this.schedulePreviewUpdate();
                        }
                    });
                text.inputEl.addClass('rt-input-xs');

                // Validate scenes vs target on commit (blur / Enter)
                const commitScenes = () => {
                    const parsed = parseInt(text.getValue());
                    if (isNaN(parsed) || parsed < 1) {
                        this.scenesToGenerate = 1;
                        text.setValue('1');
                    }
                    // If scenes exceed target, bump target up to match
                    if (this.scenesToGenerate > this.targetRangeMax) {
                        this.targetRangeMax = this.scenesToGenerate;
                        if (this.targetRangeInput) {
                            this.targetRangeInput.setValue(this.targetRangeMax.toString());
                            // Flash the target input red to indicate auto-correction
                            this.targetRangeInput.inputEl.removeClass('rt-input-flash-error');
                            void this.targetRangeInput.inputEl.offsetWidth; // reflow to restart animation
                            this.targetRangeInput.inputEl.addClass('rt-input-flash-error');
                        }
                        if (lengthSettingRef) this.updateTargetDesc(lengthSettingRef);
                        this.schedulePreviewUpdate();
                    }
                };
                text.inputEl.addEventListener('blur', commitScenes);
                text.inputEl.addEventListener('keydown', (evt) => {
                    if (evt.key === 'Enter') { evt.preventDefault(); commitScenes(); }
                });
            });
        scenesSetting.settingEl.addClass('rt-manuscript-group-setting');

        const lengthSetting = new Setting(countsGrid)
            .setName('Target book length')
            .setDesc('Used for numbering distribution (e.g. 10, 20, 30...)')
            .addText(text => {
                this.targetRangeInput = text;
                text
                    .setValue(this.targetRangeMax.toString())
                    .onChange(value => {
                        // Live update for preview only — no clamping while typing
                        const parsed = parseInt(value);
                        if (!isNaN(parsed) && parsed > 0) {
                            this.targetRangeMax = parsed;
                            if (lengthSettingRef) this.updateTargetDesc(lengthSettingRef);
                            this.schedulePreviewUpdate();
                        }
                    });
                text.inputEl.addClass('rt-input-xs');

                // Validate target vs scenes on commit (blur / Enter)
                const commitTarget = () => {
                    const parsed = parseInt(text.getValue());
                    if (isNaN(parsed) || parsed < 1) {
                        this.targetRangeMax = this.scenesToGenerate;
                        text.setValue(this.targetRangeMax.toString());
                    }
                    // Clamp: target can never be less than scene count
                    if (this.targetRangeMax < this.scenesToGenerate) {
                        this.targetRangeMax = this.scenesToGenerate;
                        text.setValue(this.targetRangeMax.toString());
                        // Flash the input red to indicate auto-correction
                        text.inputEl.removeClass('rt-input-flash-error');
                        void text.inputEl.offsetWidth;
                        text.inputEl.addClass('rt-input-flash-error');
                    }
                    if (lengthSettingRef) this.updateTargetDesc(lengthSettingRef);
                    this.schedulePreviewUpdate();
                };
                text.inputEl.addEventListener('blur', commitTarget);
                text.inputEl.addEventListener('keydown', (evt) => {
                    if (evt.key === 'Enter') { evt.preventDefault(); commitTarget(); }
                });
            });
        lengthSetting.settingEl.addClass('rt-manuscript-group-setting');
        lengthSettingRef = lengthSetting; // Assign ref
        this.updateTargetDesc(lengthSetting);

        // Acts Selection (Checkboxes)
        const actSetting = structCard.createDiv({ cls: 'rt-manuscript-setting-row rt-manuscript-card-block rt-manuscript-acts-row' });
        actSetting.createDiv({ cls: 'rt-manuscript-setting-label', text: 'Acts to distribute scenes across' });
        const actChecks = actSetting.createDiv({ cls: 'rt-manuscript-checkbox-row' });
        actChecks.style.flexWrap = 'wrap';
        const actCountForUi = this.getMaxActs();

        Array.from({ length: actCountForUi }, (_, i) => i + 1).forEach(num => {
            const item = actChecks.createDiv({ cls: 'rt-manuscript-checkbox-item' });
            const input = item.createEl('input', { type: 'checkbox' });
            input.checked = this.selectedActs.includes(num);
            this.actCheckboxes.push(input);
            input.onchange = () => {
                if (input.checked) {
                    if (!this.selectedActs.includes(num)) this.selectedActs.push(num);
                } else {
                    this.selectedActs = this.selectedActs.filter(a => a !== num);
                }
                if (this.selectedActs.length === 0) {
                    this.selectedActs = [num]; // ensure at least one
                    input.checked = true; // force UI back
                }
                this.selectedActs = this.normalizeSelectedActs(actCountForUi);
                if (!this.isApplyingTemplate) this.resetManualLayout();
                this.schedulePreviewUpdate();
            };
            const label = item.createEl('label');
            label.setText(`Act ${num}`);
            label.onclick = () => {
                input.click();
            };
        });

        // SECTION 2: CONTENT CONFIGURATION
        const contentCard = scrollContainer.createDiv({ cls: 'rt-glass-card rt-sub-card' });
        contentCard.createDiv({ cls: 'rt-sub-card-head', text: 'Content Configuration' });

        // Subplots + characters + preview (single border spanning all columns)
        const contentGroup = contentCard.createDiv({ cls: 'rt-manuscript-card-block rt-manuscript-group-block rt-manuscript-content-grid' });

        // Left column: Subplots + Characters stacked
        const leftCol = contentGroup.createDiv({ cls: 'rt-manuscript-content-left' });

        const subplotsSetting = new Setting(leftCol)
            .setName('Subplots')
            .setDesc('Enter one subplot per line.')
            .setClass('rt-setting-stacked')
            .addTextArea(text => {
                this.subplotsInput = text;
                text
                    .setValue(this.subplots)
                    .onChange(value => {
                        this.subplots = value;
                        if (!this.isApplyingTemplate) this.resetManualLayout();
                        this.schedulePreviewUpdate();
                    });
                text.inputEl.rows = 4;
                text.inputEl.classList.add('rt-manuscript-textarea');
                text.inputEl.addEventListener('blur', () => {
                    const trimmed = this.subplots.split('\n').map(s => s.trim()).filter(Boolean);
                    if (trimmed.length === 0) {
                        this.subplots = 'Main Plot';
                        text.setValue(this.subplots);
                        this.schedulePreviewUpdate();
                    }
                });
            });
        subplotsSetting.settingEl.addClass('rt-manuscript-group-setting');

        const characterSetting = new Setting(leftCol)
            .setName('Characters')
            .setDesc('Enter one character per line.')
            .setClass('rt-setting-stacked')
            .addTextArea(text => {
                this.characterInput = text;
                text
                    .setValue(this.character)
                    .onChange(value => this.character = value);
                text.inputEl.rows = 4;
                text.inputEl.classList.add('rt-manuscript-textarea');
                text.inputEl.addEventListener('blur', () => {
                    const trimmed = this.character.split('\n').map(s => s.trim()).filter(Boolean);
                    if (trimmed.length === 0) {
                        this.character = 'Hero';
                        text.setValue(this.character);
                        this.schedulePreviewUpdate();
                    }
                });
            });
        characterSetting.settingEl.addClass('rt-manuscript-group-setting');

        // Right column: Preview (larger)
        const previewCol = contentGroup.createDiv({ cls: 'rt-manuscript-preview-col rt-manuscript-preview-col-wide' });
        const previewHeader = previewCol.createDiv({ cls: 'rt-manuscript-preview-head' });
        previewHeader.createDiv({ cls: 'rt-manuscript-preview-title', text: 'Preview' });
        this.previewStatusEl = previewHeader.createDiv({ cls: 'rt-manuscript-preview-status', text: 'Auto distribution' });
        this.previewHostEl = previewCol.createDiv({ cls: 'rt-manuscript-preview-host' });
        this.updateDistributionStatus();
        this.schedulePreviewUpdate();


        // SECTION 3: TEMPLATES & EXTRAS
        const extraCard = scrollContainer.createDiv({ cls: 'rt-glass-card rt-sub-card' });
        extraCard.createDiv({ cls: 'rt-sub-card-head', text: 'Templates & Extras' });

        const extraRow = extraCard.createDiv({ cls: 'rt-manuscript-duo-row' });

        // Template Selection (Pills)
        const templSetting = extraRow.createDiv({ cls: 'rt-manuscript-setting-row rt-manuscript-card-block' });
        templSetting.createDiv({ cls: 'rt-manuscript-setting-label', text: 'Scene template' });
        const templPills = templSetting.createDiv({ cls: 'rt-manuscript-pill-row' });

        const options: { id: 'base' | 'advanced', label: string }[] = [
            { id: 'base', label: 'Base (Minimal)' },
            { id: 'advanced', label: 'Advanced' }
        ];

        options.forEach(opt => {
            const pill = templPills.createDiv({ cls: 'rt-manuscript-pill' });
            pill.setText(opt.label);
            if (this.templateType === opt.id) pill.addClass('rt-is-active');
            pill.setAttr('data-template-id', opt.id);
            this.templateTypePills.push(pill);
            pill.onclick = () => {
                templPills.querySelectorAll('.rt-manuscript-pill').forEach(p => p.removeClass('rt-is-active'));
                pill.addClass('rt-is-active');
                this.templateType = opt.id;
            };
        });

        // Generate Beats Toggle (Pills)
        const beatSystem = this.plugin.settings.beatSystem || 'Custom';
        const beatLabel = beatSystem === 'Custom' ? 'custom beats' : `${beatSystem} beats`;

        const beatSetting = extraRow.createDiv({ cls: 'rt-manuscript-setting-row rt-manuscript-card-block' });
        beatSetting.createDiv({ cls: 'rt-manuscript-setting-label', text: `Generate ${beatLabel}` });
        const beatPills = beatSetting.createDiv({ cls: 'rt-manuscript-pill-row' });

        const beatOptions = [{ val: false, label: 'No' }, { val: true, label: 'Yes' }];
        beatOptions.forEach(opt => {
            const pill = beatPills.createDiv({ cls: 'rt-manuscript-pill' });
            pill.setText(opt.label);
            if (this.generateBeats === opt.val) pill.addClass('rt-is-active');
            pill.setAttr('data-generate-beats', String(opt.val));
            this.beatPills.push(pill);
            pill.onclick = () => {
                beatPills.querySelectorAll('.rt-manuscript-pill').forEach(p => p.removeClass('rt-is-active'));
                pill.addClass('rt-is-active');
                this.generateBeats = opt.val;
            };
        });

        // Template load/save
        const templateCard = extraCard.createDiv({ cls: 'rt-manuscript-card-block rt-manuscript-group-block rt-layout-templates-card' });
        const templateSetting = new Setting(templateCard)
            .setName('Layout templates')
            .setDesc('Select a saved layout (acts, subplots, assignments, metadata).')
            .addDropdown(drop => {
                this.templateDropdown = drop.selectEl;
                this.refreshTemplateDropdown();
                drop.onChange(value => {
                    if (!value) {
                        this.activeTemplateId = null;
                        if (this.deleteTemplateBtn) this.deleteTemplateBtn.setDisabled(true);
                        this.updateDistributionStatus();
                        return;
                    }
                    this.applyTemplateById(value);
                });
            });
        templateSetting.settingEl.addClass('rt-manuscript-group-setting');

        const templateActions = templateCard.createDiv({ cls: 'rt-template-actions' });

        new ButtonComponent(templateActions)
            .setButtonText('Save / Update template')
            .onClick(() => {
                void this.saveOrUpdateTemplate();
            });

        new ButtonComponent(templateActions)
            .setButtonText('Reset')
            .onClick(() => {
                this.resetAllDefaults();
                new Notice('Layout reset to defaults with auto distribution.');
            });

        this.deleteTemplateBtn = new ButtonComponent(templateActions)
            .setButtonText('Delete template')
            .setDisabled(true)
            .setWarning()
            .onClick(() => {
                const selectedId = this.getCurrentTemplateSelection();
                if (!selectedId) return;
                const tpl = this.getTemplateList().find(t => t.id === selectedId);
                if (!tpl) return;
                new DeleteTemplateModal(this.app, tpl.name, () => {
                    this.deleteTemplate(selectedId);
                }).open();
            });
        this.deleteTemplateBtn.buttonEl.addClass('rt-template-delete');

        // Actions Footer
        const footer = contentEl.createDiv({ cls: 'ert-modal-actions' });

        new ButtonComponent(footer)
            .setButtonText('Create Book')
            .setCta()
            .onClick(() => {
                this.close();
                this.generateBook();
            });

        new ButtonComponent(footer)
            .setButtonText('Cancel')
            .onClick(() => this.close());

        // Add cursor pointer to footer buttons
        footer.querySelectorAll('button').forEach(btn => {
            btn.style.cursor = 'pointer';
        });
    }

    private updateTargetDesc(setting: Setting): void {
        const scenes = this.scenesToGenerate;
        const max = this.targetRangeMax;

        // Calculate example numbers
        let examples: number[] = [];
        if (scenes <= 1) examples = [1];
        else if (scenes <= 3) {
            // e.g. 1, 50, 100
            for (let i = 1; i <= scenes; i++) {
                const step = (max - 1) / (scenes - 1);
                examples.push(Math.round(1 + (i - 1) * step));
            }
        } else {
            // Show first 3
            for (let i = 1; i <= 3; i++) {
                const step = (max - 1) / (scenes - 1);
                examples.push(Math.round(1 + (i - 1) * step));
            }
        }

        const suffix = scenes > 3 ? '...' : '';
        setting.setDesc(`Scenes will be numbered: ${examples.join(', ')}${suffix} based on ${scenes} scenes across ${max} units.`);
    }

    onClose(): void {
        const { contentEl } = this;
        contentEl.empty();
        this.previewHostEl = null;
        this.heroLocationMeta = null;
        this.heroModeMeta = null;
        if (this.previewUpdateRaf !== null) {
            window.cancelAnimationFrame(this.previewUpdateRaf);
            this.previewUpdateRaf = null;
        }
    }

    private schedulePreviewUpdate(): void {
        if (!this.previewHostEl) return;
        if (this.previewUpdateRaf !== null) window.cancelAnimationFrame(this.previewUpdateRaf);
        this.previewUpdateRaf = window.requestAnimationFrame(() => {
            this.previewUpdateRaf = null;
            this.renderPreview();
        });
    }

    private parseSubplots(): string[] {
        const list = this.subplots
            .split('\n')
            .map(s => s.trim())
            .filter(Boolean);
        return list.length > 0 ? list : ['Main Plot'];
    }

    private getActsListSorted(): number[] {
        const maxActs = this.getMaxActs();
        const acts = (this.selectedActs.length > 0 ? [...this.selectedActs] : [1])
            .map(a => Math.max(1, Math.min(maxActs, a)))
            .sort((a, b) => a - b);
        // Dedupe
        return Array.from(new Set(acts));
    }

    private subplotColor(index: number, total: number): string {
        if (total <= 1) return 'var(--interactive-accent)';
        // Stable, distinct palette using golden angle hues.
        const hue = (index * 137.508) % 360;
        const sat = 62;
        const light = 56;
        return `hsl(${hue}deg ${sat}% ${light}%)`;
    }

    private renderPreview(): void {
        if (!this.previewHostEl) return;
        this.previewHostEl.empty();

        const subplotList = this.parseSubplots();
        const actsList = this.getActsListSorted();
        const totalActs = this.getMaxActs();
        const assignments = this.getWorkingAssignments();

        const size = 260;
        const outerR = 116;
        const innerR = 52; // empty inner core
        const cx = size / 2;
        const cy = size / 2;

        const svg = this.previewHostEl.createSvg('svg');
        svg.addClass('rt-manuscript-preview-svg');
        svg.setAttr('viewBox', `0 0 ${size} ${size}`);
        svg.setAttr('preserveAspectRatio', 'xMidYMid meet');
        svg.setAttr('width', '100%');
        svg.setAttr('height', '100%');

        const subplotCount = Math.max(1, subplotList.length);
        const ringWidth = (outerR - innerR) / subplotCount;
        const dims: PreviewDims = { cx, cy, outerR, innerR, subplotCount, totalActs, ringWidth };

        const ringColor = this.distributionMode === 'manual'
            ? 'rgba(255, 165, 0, 0.35)'
            : 'rgba(255, 255, 255, 0.10)';

        // Draw Guide Rings (One for outer + one for each subplot boundary)
        for (let i = 0; i <= subplotCount; i++) {
            const r = outerR - (i * ringWidth);
            const guide = svg.createSvg('circle');
            guide.setAttr('cx', `${cx}`);
            guide.setAttr('cy', `${cy}`);
            guide.setAttr('r', `${r}`);
            guide.setAttr('stroke', ringColor);
            guide.style.setProperty('stroke', ringColor);
            guide.addClass('rt-manuscript-preview-guide');
        }

        // Draw Act Divider Lines (dynamic wedges by configured acts)
        // 12 o'clock = -PI/2
        const actAngles = Array.from({ length: totalActs }, (_, idx) => -Math.PI / 2 + (idx * 2 * Math.PI) / totalActs);

        const spokeColor = this.distributionMode === 'manual'
            ? 'rgba(255, 165, 0, 0.75)'
            : 'rgba(255, 255, 255, 0.3)';

        actAngles.forEach(angle => {
            const x1 = cx + innerR * Math.cos(angle);
            const y1 = cy + innerR * Math.sin(angle);
            const x2 = cx + (outerR + 6) * Math.cos(angle);
            const y2 = cy + (outerR + 6) * Math.sin(angle);

            const line = svg.createSvg('line');
            line.setAttr('x1', `${x1}`);
            line.setAttr('y1', `${y1}`);
            line.setAttr('x2', `${x2}`);
            line.setAttr('y2', `${y2}`);
            line.setAttr('stroke', spokeColor);
            line.setAttr('stroke-width', '1');
            line.addClass('rt-manuscript-preview-spoke');
        });

        // Render Scenes per Act Sector from assignments
        actsList.forEach(actNumber => {
            const sectorIndex = (actNumber - 1) % totalActs;
            const sectorStart = actAngles[sectorIndex];
            const sectorSpan = (2 * Math.PI) / totalActs;

            const actScenes = assignments
                .filter(a => a.act === actNumber)
                .sort((a, b) => a.sceneNumber - b.sceneNumber);

            const count = actScenes.length;
            if (count === 0) return;

            const anglePerScene = sectorSpan / Math.max(1, count);

            actScenes.forEach((assignment, localIdx) => {
                const a0 = sectorStart + localIdx * anglePerScene;
                const a1 = a0 + anglePerScene;

                const subplotIndex = Math.min(Math.max(assignment.subplotIndex, 0), subplotList.length - 1);

                const rOutLocal = outerR - (subplotIndex * ringWidth);
                const rInLocal = rOutLocal - ringWidth;

                const path = svg.createSvg('path');
                path.setAttr('d', this.donutSlicePath(cx, cy, rInLocal, rOutLocal, a0, a1));
                path.setAttr('fill', this.subplotColor(subplotIndex, subplotList.length));
                path.addClass('rt-manuscript-preview-slice');
                path.setAttr('data-act', `${assignment.act}`);
                path.setAttr('data-scene', `${assignment.sceneNumber}`);
                path.setAttr('data-subplot', `${subplotIndex}`);
                path.addEventListener('pointerdown', (evt: PointerEvent) => this.beginDrag(evt, assignment.sceneNumber, dims));
            });
        });

        // Inner core boundary (empty center)
        const core = svg.createSvg('circle');
        core.setAttr('cx', `${cx}`);
        core.setAttr('cy', `${cy}`);
        core.setAttr('r', `${innerR}`);
        core.addClass('rt-manuscript-preview-core');
    }

    private donutSlicePath(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
        const largeArc = a1 - a0 > Math.PI ? 1 : 0;

        const x0o = cx + r1 * Math.cos(a0);
        const y0o = cy + r1 * Math.sin(a0);
        const x1o = cx + r1 * Math.cos(a1);
        const y1o = cy + r1 * Math.sin(a1);

        const x0i = cx + r0 * Math.cos(a1);
        const y0i = cy + r0 * Math.sin(a1);
        const x1i = cx + r0 * Math.cos(a0);
        const y1i = cy + r0 * Math.sin(a0);

        return [
            `M ${x0o} ${y0o}`,
            `A ${r1} ${r1} 0 ${largeArc} 1 ${x1o} ${y1o}`,
            `L ${x0i} ${y0i}`,
            `A ${r0} ${r0} 0 ${largeArc} 0 ${x1i} ${y1i}`,
            'Z'
        ].join(' ');
    }

    private beginDrag(evt: PointerEvent, sceneNumber: number, dims: PreviewDims): void {
        const svg = (evt.currentTarget as SVGElement).closest('svg');
        if (!svg) return;
        this.dragState = { sceneNumber, pointerId: evt.pointerId, dims, targetAct: 0, targetSubplot: 0 };
        svg.setPointerCapture(evt.pointerId);
        if (this.previewHostEl) this.previewHostEl.addClass('rt-preview-dragging');

        const moveHandler = (moveEvt: PointerEvent) => this.handleDragMove(moveEvt, svg as SVGSVGElement, dims);
        const upHandler = (upEvt: PointerEvent) => {
            this.finishDrag(upEvt, svg as SVGSVGElement);
            svg.removeEventListener('pointermove', moveHandler);
            svg.removeEventListener('pointerup', upHandler);
        };

        svg.addEventListener('pointermove', moveHandler);
        svg.addEventListener('pointerup', upHandler);
    }

    private handleDragMove(evt: PointerEvent, svg: SVGSVGElement, dims: PreviewDims): void {
        if (!this.dragState) return;
        const target = this.computeDropTarget(evt, svg, dims);
        if (!target) return;
        this.dragState.targetAct = target.act;
        this.dragState.targetSubplot = target.subplotIndex;
        if (this.previewStatusEl) {
            const subplotList = this.parseSubplots();
            const subplotLabel = subplotList[target.subplotIndex] || `Subplot ${target.subplotIndex + 1}`;
            this.previewStatusEl.setText(`Dragging scene ${this.dragState.sceneNumber} → Act ${target.act}, ${subplotLabel}`);
        }
    }

    private finishDrag(evt: PointerEvent, svg: SVGSVGElement): void {
        if (!this.dragState) return;
        const target = this.computeDropTarget(evt, svg, this.dragState.dims);
        svg.releasePointerCapture(this.dragState.pointerId);

        if (target) {
            const assignments = this.getWorkingAssignments().map(a => ({ ...a }));
            const idx = assignments.findIndex(a => a.sceneNumber === this.dragState!.sceneNumber);
            if (idx >= 0) {
                assignments[idx].act = target.act;
                assignments[idx].subplotIndex = target.subplotIndex;
                this.sceneAssignments = assignments;
                this.markManualLayout();
                this.schedulePreviewUpdate();
            }
        }
        this.dragState = null;
        this.updateDistributionStatus();
        if (this.previewHostEl) this.previewHostEl.removeClass('rt-preview-dragging');
    }

    private computeDropTarget(evt: PointerEvent, svg: SVGSVGElement, dims: PreviewDims): { act: number; subplotIndex: number } | null {
        // Convert pointer coordinates into SVG viewBox space to avoid scaling mismatch
        const ctm = svg.getScreenCTM();
        if (!ctm) return null;
        const pt = svg.createSVGPoint();
        pt.x = evt.clientX;
        pt.y = evt.clientY;
        const local = pt.matrixTransform(ctm.inverse());

        const dx = local.x - dims.cx;
        const dy = local.y - dims.cy;
        const radius = Math.sqrt(dx * dx + dy * dy);
        if (radius < dims.innerR || radius > dims.outerR) return null;

        const angleRaw = Math.atan2(dy, dx); // radians, center at +x
        const normalized = (angleRaw - (-Math.PI / 2) + 2 * Math.PI) % (2 * Math.PI); // 0 at 12 o'clock

        const sectorSpan = (2 * Math.PI) / dims.totalActs;
        const targetAct = this.closestSelectedAct(normalized, sectorSpan, dims.totalActs);

        const offset = dims.outerR - radius;
        const subplotIndex = Math.min(Math.max(Math.floor(offset / dims.ringWidth), 0), dims.subplotCount - 1);

        return { act: targetAct, subplotIndex };
    }

    private closestSelectedAct(normalizedAngle: number, sectorSpan: number, totalActs: number): number {
        const selected = this.getActsListSorted();
        if (selected.length === 0) return 1;
        let bestAct = selected[0];
        let bestDiff = Number.MAX_VALUE;
        selected.forEach(act => {
            const center = ((act - 1) * sectorSpan) + (sectorSpan / 2);
            const diff = Math.abs(this.wrapAngle(normalizedAngle - center));
            if (diff < bestDiff) {
                bestDiff = diff;
                bestAct = act;
            }
        });
        return bestAct;
    }

    private wrapAngle(angle: number): number {
        const twoPi = 2 * Math.PI;
        let a = angle % twoPi;
        if (a > Math.PI) a -= twoPi;
        if (a < -Math.PI) a += twoPi;
        return Math.abs(a);
    }

    async generateBook(): Promise<void> {
        const vault = this.plugin.app.vault;
        const targetPath = this.targetPath;
        const targetFolder = targetPath ? normalizePath(targetPath.trim()) : '';

        // Ensure folder exists
        if (targetFolder && !vault.getAbstractFileByPath(targetFolder)) {
            try {
                await vault.createFolder(targetFolder);
            } catch (e) {
                new Notice(`Error creating folder: ${e}`);
                return;
            }
        }

        // Parse subplots
        const subplotList = this.subplots.split('\n').map(s => s.trim()).filter(s => s.length > 0);
        if (subplotList.length === 0) subplotList.push('Main Plot');

        // Get template string
        const userTemplates = this.plugin.settings.sceneYamlTemplates;
        const baseTemplate = userTemplates?.base;
        if (!baseTemplate) {
            new Notice('Base scene template not found in settings. Set a scene template before generating.');
            return;
        }
        
        // For advanced template, merge base + advanced fields
        let templateString: string;
        if (this.templateType === 'advanced') {
            const advancedFields = userTemplates?.advanced ?? '';
            templateString = mergeTemplates(baseTemplate, advancedFields);
        } else {
            templateString = baseTemplate;
        }

        // Anchor generated scenes to today and advance each by time increment
        const sceneBaseDate = new Date();
        sceneBaseDate.setHours(0, 0, 0, 0);
        const incrementMs = parseDuration(this.timeIncrement) ?? (24 * 60 * 60 * 1000); // Default 1 day

        let createdScenes = 0;
        let skippedScenes = 0;

        new Notice(`Generating ${this.scenesToGenerate} scenes...`);

        // Ensure we don't divide by zero if user sets range < count
        const rangeMax = Math.max(this.targetRangeMax, this.scenesToGenerate);
        const assignments = this.getWorkingAssignments();

        // Distribution Logic:
        // We want to distribute 'scenesToGenerate' items across 'rangeMax' slots.
        // Example: 10 scenes, 100 range.
        // Interval = 100 / 10 = 10.
        // Scenes: 10, 20, 30... 100.
        // Or if we want to start at 1? The user example was "scene one is '1 Title', scene 2 is '10 Title'".
        // That implies starting at 1 and roughly evenly spacing.
        // Let's use simple scaling: sceneNumber = Math.round((i / count) * rangeMax)
        // If i=1, count=10, range=100 -> 10.
        // If i=10, count=10, range=100 -> 100.
        // Wait, the user said "scene one is 1... scene 2 is 10". That's actually:
        // 1, 10, ... (implied step 9? or 10?)
        // Let's stick to simple even spacing:
        // Step size = rangeMax / scenesToGenerate.
        // Scene 1 = 1 * Step? Or roughly spread?
        // Let's do: sceneNum = Math.floor((i / this.scenesToGenerate) * this.targetRangeMax)
        // i=1 (1st iteration): (1/10)*100 = 10.
        // i=10: (10/10)*100 = 100.
        // This generates 10, 20, 30... 100.
        // If the user wants 1 to be "1 Title", then for 10 scenes in 100 range, it might be 1, 11, 21...
        // But 10, 20, 30 is cleaner "scene number distribution". 
        // Let's try to map the *index* (1-based) to the *target range*.

        for (let i = 1; i <= this.scenesToGenerate; i++) {
            // Increment time for each successive scene
            let when = '';

            if (incrementMs > 0) {
                const sceneDate = new Date(sceneBaseDate.getTime() + (incrementMs * (i - 1)));
                when = sceneDate.toISOString().slice(0, 10);

                if (incrementMs < (24 * 60 * 60 * 1000)) {
                    const hours = sceneDate.getHours().toString().padStart(2, '0');
                    const mins = sceneDate.getMinutes().toString().padStart(2, '0');
                    when = `${when} ${hours}:${mins}`;
                }
            }

            // Calculate distributed scene number
            // Force at least 1, max at targetRangeMax.
            // Spread i from [1..N] to [1..Range]
            let sceneNum = Math.round((i / this.scenesToGenerate) * this.targetRangeMax);

            // Correction: If i=1, we often want scene 1 to exist.
            // If we strictly follow math for 10 scenes in 100: 10, 20, 30...
            // If the user *wants* "Scene 1", they might expect the first file to be "1 Scene.md".
            // Let's force scene 1 if it's the very first one generated and range allows.
            if (i === 1) sceneNum = 1;
            else if (i === this.scenesToGenerate) sceneNum = this.targetRangeMax;
            else {
                // Interpolate strictly between 1 and Max
                // range = (Max - 1)
                // steps = (N - 1)
                // stepSize = (Max - 1) / (N - 1)
                // val = 1 + (i - 1) * stepSize
                // E.g. 10 scenes, 100 range.
                // step = 99 / 9 = 11.
                // 1, 12, 23... 100.
                // This is mathematically sound for "even distribution starting at 1 ending at 100".
                const step = (this.targetRangeMax - 1) / (this.scenesToGenerate - 1);
                sceneNum = Math.round(1 + (i - 1) * step);
            }

            const assignment = assignments.find(a => a.sceneNumber === i) ?? {
                sceneNumber: i,
                act: this.selectedActs[0] ?? 1,
                subplotIndex: (i - 1) % subplotList.length
            };
            const act = assignment.act;
            const subplotIndex = Math.min(Math.max(assignment.subplotIndex, 0), subplotList.length - 1);
            const assignedSubplots = [subplotList[subplotIndex] ?? subplotList[0]];

            // Process characters: inline YAML (string for 1, array for >1)
            const characterList = this.character.split('\n').map(c => c.trim()).filter(c => c.length > 0);
            const yamlEscapeDoubleQuoted = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            const yamlInlineArray = (values: string[]) => `[${values.map(v => `"${yamlEscapeDoubleQuoted(v)}"`).join(', ')}]`;
            const characterString =
                characterList.length === 0 ? 'Hero'
                    : characterList.length === 1 ? characterList[0]
                        : yamlInlineArray(characterList);

            // Place list fallback
            const placeListRaw = targetPath ? [targetPath] : [];
            const placeList = placeListRaw.length > 0 ? placeListRaw : ['Unknown'];

            const data: SceneCreationData = {
                act,
                when,
                sceneNumber: sceneNum,
                subplots: assignedSubplots,
                character: characterString,
                place: 'Unknown',
                characterList,
                placeList
            };

            const content = generateSceneContent(templateString, data);
            const fileContent = `---\n${content}\n---\n\n`;

            const filename = `${sceneNum} Scene.md`;
            const filePath = targetFolder ? `${targetFolder}/${filename}` : filename;

            try {
                if (!vault.getAbstractFileByPath(filePath)) {
                    await vault.create(filePath, fileContent);
                    createdScenes++;
                } else {
                    skippedScenes++;
                }
            } catch (e) {
                const msg = (e as any)?.message ?? '';
                if (msg.includes('exists') || msg.includes('already exists')) {
                    skippedScenes++;
                } else {
                    console.error(`Failed to create ${filename}`, e);
                }
            }
        }

        // Generate Beats
        let beatsCreated = 0;
        if (this.generateBeats) {
            const beatSystem = this.plugin.settings.beatSystem || 'Custom';

            // Handle Custom Dynamic System
            if (beatSystem === 'Custom') {
                const customSystem = getCustomSystemFromSettings(this.plugin.settings);
                if (customSystem.beats.length > 0) {
                    try {
                        const result = await createBeatTemplateNotes(vault, 'Custom', targetFolder, customSystem);
                        beatsCreated = result.created;
                    } catch (e) {
                        new Notice(`Error creating custom beats: ${e}`);
                    }
                } else {
                    // No custom beats defined, skip
                }
            } else {
                try {
                    const result = await createBeatTemplateNotes(vault, beatSystem, targetFolder);
                    beatsCreated = result.created;
                } catch (e) {
                    new Notice(`Error creating beats: ${e}`);
                }
            }
        }

        const skippedInfo = skippedScenes > 0 ? ` (skipped ${skippedScenes} existing)` : '';
        new Notice(`Book created! ${createdScenes} scenes${skippedInfo}, ${beatsCreated} beat notes.`);
    }
}
