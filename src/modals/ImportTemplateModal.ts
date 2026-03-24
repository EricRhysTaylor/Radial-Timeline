import { App, ButtonComponent, DropdownComponent, Modal, SuggestModal, TFile } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import type { ImportedTemplateCandidate } from '../utils/templateImport';
import { buildImportedTemplateCandidate, buildImportedTemplateId, compactTemplatePathForStorage } from '../utils/templateImport';
import type { PandocLayoutTemplate, UsageContext } from '../types';

type CommitMode = 'draft' | 'activate';

export interface ImportedTemplateCommit {
    layout: PandocLayoutTemplate;
    draft: boolean;
    activate: boolean;
    candidate: ImportedTemplateCandidate;
}

class TemplateFileSuggestModal extends SuggestModal<TFile> {
    private readonly onChooseFile: (path: string) => void;

    constructor(app: App, onChooseFile: (path: string) => void) {
        super(app);
        this.onChooseFile = onChooseFile;
    }

    getSuggestions(query: string): TFile[] {
        const lowered = (query || '').trim().toLowerCase();
        return this.app.vault.getFiles()
            .filter(file => /\.(tex|ltx|latex)$/i.test(file.path))
            .filter(file => !lowered || file.path.toLowerCase().includes(lowered))
            .slice(0, 40);
    }

    renderSuggestion(file: TFile, el: HTMLElement): void {
        const row = el.createDiv({ cls: 'ert-modal-choice' });
        row.createDiv({ cls: 'ert-note-creator-option__title', text: file.basename });
        row.createDiv({ cls: 'ert-note-creator-option__desc', text: file.path });
    }

    onChooseSuggestion(file: TFile): void {
        this.onChooseFile(file.path);
    }
}

export class ImportTemplateModal extends Modal {
    private step: 1 | 2 | 3 | 4 | 5 | 6 = 1;
    private sourcePath = '';
    private usageContext: UsageContext = 'novel';
    private usageContextTouched = false;
    private advancedEdit = false;
    private advancedName = '';
    private advancedNameTouched = false;
    private advancedPath = '';
    private advancedPathTouched = false;
    private advancedDescription = '';
    private advancedDescriptionTouched = false;
    private candidate: ImportedTemplateCandidate | null = null;
    private candidateLoading = false;
    private commitInFlight = false;
    private readonly onCommit: (commit: ImportedTemplateCommit) => Promise<void> | void;

    private advancedNameInputEl?: HTMLInputElement;
    private advancedPathInputEl?: HTMLInputElement;
    private advancedDescriptionInputEl?: HTMLTextAreaElement;
    private usageDropdown?: DropdownComponent;
    private activateButton?: ButtonComponent;
    private draftButton?: ButtonComponent;

    constructor(app: App, private readonly plugin: RadialTimelinePlugin, onCommit: (commit: ImportedTemplateCommit) => Promise<void> | void) {
        super(app);
        this.onCommit = onCommit;
    }

    onOpen(): void {
        this.step = 1;
        this.sourcePath = '';
        this.usageContext = 'novel';
        this.usageContextTouched = false;
        this.advancedEdit = false;
        this.advancedName = '';
        this.advancedNameTouched = false;
        this.advancedPath = '';
        this.advancedPathTouched = false;
        this.advancedDescription = '';
        this.advancedDescriptionTouched = false;
        this.candidate = null;
        this.candidateLoading = false;
        this.commitInFlight = false;
        const { contentEl, modalEl, titleEl } = this;
        contentEl.empty();
        titleEl.setText('');

        if (modalEl) {
            modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell', 'ert-modal-shell--md');
        }
        contentEl.addClass('ert-modal-container', 'ert-stack');
        void this.refreshCandidate();
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private getCandidatePath(): string {
        const advancedPath = this.advancedEdit ? this.advancedPath.trim() : '';
        return advancedPath || this.sourcePath.trim();
    }

    private getCandidateName(): string | undefined {
        if (!this.advancedEdit) return undefined;
        const value = this.advancedName.trim();
        return value.length > 0 ? value : undefined;
    }

    private getCandidateDescription(): string | undefined {
        if (!this.advancedEdit) return undefined;
        const value = this.advancedDescription.trim();
        return value.length > 0 ? value : undefined;
    }

    private resolveExistingIds(): Set<string> {
        return new Set((this.plugin.settings.pandocLayouts || []).map(layout => layout.id));
    }

    private async refreshCandidate(): Promise<void> {
        const sourcePath = this.getCandidatePath();
        if (!sourcePath) {
            this.candidate = null;
            this.render();
            return;
        }

        this.candidateLoading = true;
        this.render();

        try {
            const candidate = await buildImportedTemplateCandidate(this.plugin, {
                sourcePath,
                name: this.getCandidateName(),
                preset: this.usageContextTouched ? this.usageContext : undefined,
                description: this.getCandidateDescription(),
                origin: 'imported',
            });

            if (!this.usageContextTouched) {
                this.usageContext = candidate.layout.preset;
            }
            if (this.advancedEdit && !this.advancedNameTouched) {
                this.advancedName = candidate.layout.name;
            }
            if (this.advancedEdit && !this.advancedDescriptionTouched) {
                this.advancedDescription = candidate.layout.description || '';
            }
            if (this.advancedEdit && !this.advancedPathTouched) {
                this.advancedPath = compactTemplatePathForStorage(this.plugin, sourcePath);
            }

            this.candidate = candidate;
        } catch (error) {
            this.candidate = null;
            console.error(error);
        } finally {
            this.candidateLoading = false;
            this.render();
        }
    }

    private async chooseFile(): Promise<void> {
        new TemplateFileSuggestModal(this.app, (path) => {
            this.sourcePath = path;
            if (this.advancedEdit && !this.advancedPathTouched) {
                this.advancedPath = compactTemplatePathForStorage(this.plugin, path);
            }
            void this.refreshCandidate();
        }).open();
    }

    private async commit(mode: CommitMode): Promise<void> {
        if (!this.candidate || this.commitInFlight) return;
        this.commitInFlight = true;
        this.updateActionButtons();

        const existingIds = this.resolveExistingIds();
        const id = buildImportedTemplateId(
            this.candidate.layout.name,
            this.candidate.layout.preset,
            existingIds
        );
        const finalLayout: PandocLayoutTemplate = {
            ...this.candidate.layout,
            id,
            path: this.candidate.layout.path.trim(),
            draft: mode === 'draft',
            origin: 'imported',
        };

        try {
            await this.onCommit({
                layout: finalLayout,
                draft: mode === 'draft',
                activate: mode === 'activate',
                candidate: this.candidate,
            });
            this.close();
        } finally {
            this.commitInFlight = false;
            this.updateActionButtons();
        }
    }

    private render(): void {
        const { contentEl } = this;
        contentEl.empty();

        const header = contentEl.createDiv({ cls: 'ert-modal-header' });
        header.createSpan({ cls: 'ert-modal-badge', text: 'IMPORT' });
        header.createDiv({ cls: 'ert-modal-title', text: 'Import template' });
        header.createDiv({
            cls: 'ert-modal-subtitle',
            text: 'Choose a .tex file, validate it, classify the publishing style, and only then decide whether to save a draft or activate it.',
        });

        const meta = header.createDiv({ cls: 'ert-modal-meta' });
        meta.createSpan({ cls: 'ert-modal-meta-item', text: `Step ${this.step} of 6` });
        meta.createSpan({
            cls: 'ert-modal-meta-item',
            text: this.candidateLoading
                ? 'Validating...'
                : this.candidate?.summary.state === 'blocked'
                    ? 'Blocked'
                    : this.candidate?.summary.state === 'warning'
                        ? 'Warnings'
                        : 'Ready',
        });

        this.renderStepRail(contentEl);

        const panel = contentEl.createDiv({ cls: 'ert-panel ert-panel--glass ert-stack' });

        if (this.candidateLoading) {
            panel.createDiv({ cls: 'ert-section-desc', text: 'Validating template...' });
        } else {
            switch (this.step) {
                case 1: this.renderChooseFileStep(panel); break;
                case 2: this.renderValidationStep(panel); break;
                case 3: this.renderClassificationStep(panel); break;
                case 4: this.renderCapabilitiesStep(panel); break;
                case 5: this.renderPreviewStep(panel); break;
                case 6: this.renderFinalizeStep(panel); break;
            }
        }

        const actions = contentEl.createDiv({ cls: 'ert-modal-actions' });
        new ButtonComponent(actions)
            .setButtonText('Back')
            .setDisabled(this.step === 1 || this.commitInFlight)
            .onClick(() => {
                if (this.step > 1) {
                    this.step -= 1;
                    this.render();
                }
            });
        new ButtonComponent(actions)
            .setButtonText(this.step === 6 ? 'Finish later' : 'Next')
            .setDisabled(this.commitInFlight)
            .onClick(() => {
                if (this.step < 6) {
                    this.step += 1;
                    this.render();
                } else {
                    this.close();
                }
            });
        actions.createDiv({ cls: 'ert-modal-actions-spacer' });
        this.draftButton = new ButtonComponent(actions)
            .setButtonText('Save draft')
            .setDisabled(this.commitInFlight || !this.candidate)
            .onClick(() => void this.commit('draft'));
        this.activateButton = new ButtonComponent(actions)
            .setButtonText('Activate')
            .setCta()
            .setDisabled(this.commitInFlight || !this.candidate || !this.candidate.canActivate)
            .onClick(() => void this.commit('activate'));
        new ButtonComponent(actions)
            .setButtonText('Cancel')
            .setDisabled(this.commitInFlight)
            .onClick(() => this.close());

        this.updateActionButtons();
    }

    private renderStepRail(container: HTMLElement): void {
        const rail = container.createDiv({ cls: 'ert-modal-meta' });
        const steps = [
            'Choose file',
            'Validate',
            'Classify',
            'Capabilities',
            'Preview',
            'Activate',
        ];
        steps.forEach((label, index) => {
            const item = rail.createSpan({
                cls: `ert-modal-meta-item${this.step === index + 1 ? ' is-active' : ''}`,
                text: label,
            });
            if (this.step === index + 1) {
                item.setAttr('aria-current', 'step');
            }
        });
    }

    private renderChooseFileStep(panel: HTMLElement): void {
        panel.createDiv({ cls: 'ert-section-desc', text: 'Select a `.tex` file from the vault or a path you can validate against the current Pandoc folder.' });
        const row = panel.createDiv({ cls: 'ert-gridForm ert-gridForm--2' });

        const pathCell = row.createDiv({ cls: 'ert-gridForm__cell' });
        pathCell.createDiv({ cls: 'ert-label', text: 'Selected file' });
        const pathValue = pathCell.createDiv({ cls: 'ert-field-note' });
        pathValue.setText(this.getCandidatePath() || 'No file selected yet.');

        const chooseCell = row.createDiv({ cls: 'ert-gridForm__cell' });
        const chooseButton = new ButtonComponent(chooseCell)
            .setButtonText('Choose file')
            .setCta()
            .onClick(() => { void this.chooseFile(); });
        chooseButton.buttonEl.addClass('ert-pillBtn', 'ert-pillBtn--standard');

        const helper = panel.createDiv({ cls: 'ert-field-note' });
        helper.setText('Use the guided picker to keep the import path honest. Advanced edit is available later for raw path/name overrides.');
    }

    private renderValidationStep(panel: HTMLElement): void {
        const status = this.candidate?.summary.state || 'ready';
        panel.createDiv({ cls: 'ert-section-desc', text: status === 'blocked'
            ? 'The template has blocking issues. Save it as a draft or go back and fix the source file.'
            : status === 'warning'
                ? 'The template is usable, but some warnings need acknowledgement.'
                : 'The template validated cleanly.' });

        const summary = panel.createDiv({ cls: 'ert-card ert-card--hero' });
        summary.createDiv({ cls: 'ert-card__header', text: 'Validation' });
        summary.createDiv({
            cls: 'ert-field-note',
            text: this.candidate
                ? `${this.candidate.summary.errorCount} error(s) · ${this.candidate.summary.warningCount} warning(s)`
                : 'No candidate yet.',
        });

        const issues = this.candidate?.issues || [];
        if (issues.length === 0) {
            summary.createDiv({ cls: 'ert-field-note', text: 'No blocking issues detected.' });
            return;
        }

        const list = summary.createDiv({ cls: 'ert-stack ert-stack--tight' });
        issues.forEach(issue => {
            const row = list.createDiv({ cls: 'ert-field-note' });
            row.setText(`${issue.level.toUpperCase()}: ${issue.message}`);
            if (issue.detail) {
                row.createDiv({ text: issue.detail });
            }
        });
    }

    private renderClassificationStep(panel: HTMLElement): void {
        panel.createDiv({ cls: 'ert-section-desc', text: 'Classify the template by intended usage. This does not change the export engine, only the author-facing profile.' });
        const grid = panel.createDiv({ cls: 'ert-gridForm ert-gridForm--2' });

        const usageCell = grid.createDiv({ cls: 'ert-gridForm__cell' });
        usageCell.createDiv({ cls: 'ert-label', text: 'Usage context' });
        this.usageDropdown = new DropdownComponent(usageCell);
        this.usageDropdown.addOption('novel', 'Novel');
        this.usageDropdown.addOption('screenplay', 'Screenplay');
        this.usageDropdown.addOption('podcast', 'Podcast');
        this.usageDropdown.setValue(this.usageContext);
        this.usageDropdown.onChange((value) => {
            this.usageContextTouched = true;
            this.usageContext = value as UsageContext;
            void this.refreshCandidate();
        });

        const styleCell = grid.createDiv({ cls: 'ert-gridForm__cell' });
        styleCell.createDiv({ cls: 'ert-label', text: 'Style' });
        styleCell.createDiv({
            cls: 'ert-field-note',
            text: this.candidate?.profile.styleKey || 'Style will be inferred from the file and the selected usage context.',
        });
        styleCell.createDiv({
            cls: 'ert-field-note',
            text: this.candidate?.profile.summary || 'No preview yet.',
        });

        const advancedToggle = panel.createEl('button', {
            cls: 'ert-modal-choice',
            attr: { type: 'button' },
        });
        advancedToggle.createDiv({ cls: 'ert-note-creator-option__title', text: this.advancedEdit ? 'Hide advanced edit' : 'Advanced edit' });
        advancedToggle.createDiv({ cls: 'ert-note-creator-option__desc', text: 'Reveal raw path/name overrides and draft metadata.' });
        advancedToggle.addEventListener('click', () => {
            this.advancedEdit = !this.advancedEdit;
            this.render();
        });

        if (this.advancedEdit) {
            this.renderAdvancedEdit(panel);
        }
    }

    private renderAdvancedEdit(panel: HTMLElement): void {
        const advanced = panel.createDiv({ cls: 'ert-card' });
        advanced.createDiv({ cls: 'ert-card__header', text: 'Advanced edit' });
        advanced.createDiv({ cls: 'ert-field-note', text: 'Raw path/name editing stays here so the guided flow remains safe by default.' });

        const grid = advanced.createDiv({ cls: 'ert-gridForm ert-gridForm--2' });
        const nameCell = grid.createDiv({ cls: 'ert-gridForm__cell' });
        nameCell.createDiv({ cls: 'ert-label', text: 'Name' });
        this.advancedNameInputEl = nameCell.createEl('input', {
            cls: 'ert-input ert-input--full',
            attr: { type: 'text', value: this.advancedName },
        });
        this.advancedNameInputEl.addEventListener('input', () => {
            this.advancedNameTouched = true;
            this.advancedName = this.advancedNameInputEl?.value || '';
            void this.refreshCandidate();
        });

        const pathCell = grid.createDiv({ cls: 'ert-gridForm__cell' });
        pathCell.createDiv({ cls: 'ert-label', text: 'Path' });
        this.advancedPathInputEl = pathCell.createEl('input', {
            cls: 'ert-input ert-input--full',
            attr: { type: 'text', value: this.advancedPath || this.sourcePath },
        });
        this.advancedPathInputEl.addEventListener('input', () => {
            this.advancedPathTouched = true;
            this.advancedPath = this.advancedPathInputEl?.value || '';
            void this.refreshCandidate();
        });

        const descCell = advanced.createDiv({ cls: 'ert-gridForm__cell' });
        descCell.createDiv({ cls: 'ert-label', text: 'Description' });
        this.advancedDescriptionInputEl = descCell.createEl('textarea', {
            cls: 'ert-textarea ert-textarea--compact',
            attr: { rows: '3' },
        });
        this.advancedDescriptionInputEl.value = this.advancedDescription || '';
        this.advancedDescriptionInputEl.addEventListener('input', () => {
            this.advancedDescriptionTouched = true;
            this.advancedDescription = this.advancedDescriptionInputEl?.value || '';
            void this.refreshCandidate();
        });
    }

    private renderCapabilitiesStep(panel: HTMLElement): void {
        panel.createDiv({ cls: 'ert-section-desc', text: 'Capabilities are inferred from the template and describe what the current runtime can safely promise.' });
        const candidate = this.candidate;
        const profile = candidate?.profile;
        if (!candidate || !profile) {
            panel.createDiv({ cls: 'ert-field-note', text: 'No candidate selected yet.' });
            return;
        }

        const chips = panel.createDiv({ cls: 'ert-modal-meta' });
        profile.capabilities.forEach(capability => {
            chips.createSpan({ cls: 'ert-modal-meta-item', text: capability.label });
        });

        panel.createDiv({ cls: 'ert-field-note', text: candidate.semanticNote });
        panel.createDiv({ cls: 'ert-field-note', text: 'No extra warnings beyond the current validation result.' });
    }

    private renderPreviewStep(panel: HTMLElement): void {
        panel.createDiv({ cls: 'ert-section-desc', text: 'Preview the metadata that will be stored before you commit the template.' });
        const candidate = this.candidate;
        const profile = candidate?.profile;
        if (!candidate || !profile) {
            panel.createDiv({ cls: 'ert-field-note', text: 'No candidate selected yet.' });
            return;
        }

        const card = panel.createDiv({ cls: 'ert-card ert-card--hero' });
        card.createDiv({ cls: 'ert-card__header', text: profile.name });
        card.createDiv({ cls: 'ert-field-note', text: profile.summary });
        card.createDiv({ cls: 'ert-field-note', text: `Usage: ${profile.usageContexts.join(', ')} · Style: ${profile.styleKey}` });
        card.createDiv({ cls: 'ert-field-note', text: candidate.semanticNote });

        if (candidate.previewLines.length > 0) {
            const preview = card.createEl('pre', { cls: 'ert-manuscript-preview-sample' });
            preview.textContent = candidate.previewLines.join('\n');
        }

        if (this.advancedEdit) {
            this.renderAdvancedEdit(panel);
        }
    }

    private renderFinalizeStep(panel: HTMLElement): void {
        panel.createDiv({ cls: 'ert-section-desc', text: 'Save a draft to keep the import staged, or activate it once validation is clean.' });
        const candidate = this.candidate;
        const profile = candidate?.profile;
        if (!candidate || !profile) {
            panel.createDiv({ cls: 'ert-field-note', text: 'No candidate selected yet.' });
            return;
        }

        const summary = panel.createDiv({ cls: 'ert-card' });
        summary.createDiv({ cls: 'ert-card__header', text: 'Final summary' });
        summary.createDiv({ cls: 'ert-field-note', text: `${profile.name} · ${profile.usageContexts.join(', ')}` });
        summary.createDiv({ cls: 'ert-field-note', text: candidate.semanticNote });
        summary.createDiv({
            cls: 'ert-field-note',
            text: candidate.canActivate
                ? 'The template can be activated.'
                : 'The template has blocking issues. Save it as a draft or fix the source file first.',
        });

        if (candidate.issues.length > 0) {
            const issueList = summary.createDiv({ cls: 'ert-stack ert-stack--tight' });
            candidate.issues.forEach(issue => {
                issueList.createDiv({ cls: 'ert-field-note', text: `${issue.level.toUpperCase()}: ${issue.message}` });
            });
        }
    }

    private updateActionButtons(): void {
        this.activateButton?.setDisabled(this.commitInFlight || !this.candidate || !this.candidate.canActivate);
        this.draftButton?.setDisabled(this.commitInFlight || !this.candidate);
    }
}
