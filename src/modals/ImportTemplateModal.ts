import { App, ButtonComponent, DropdownComponent, Modal, SuggestModal, TFile, setIcon } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import type { ImportedTemplateCandidate } from '../utils/templateImport';
import { buildImportedTemplateCandidate, buildImportedTemplateId, compactTemplatePathForStorage } from '../utils/templateImport';
import type { PandocLayoutTemplate, UsageContext } from '../types';
import type { DetectedTemplateConfidence, DetectedTemplateMockPreviewKind, DetectedTemplateStyleHint } from '../publishing/templateDetection';

type CommitMode = 'draft' | 'activate';
type ImportTemplateStep = 1 | 2 | 3 | 4;

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
    private step: ImportTemplateStep = 1;
    private sourcePath = '';
    private usageContext: UsageContext = 'novel';
    private usageContextTouched = false;
    private templateName = '';
    private templateNameTouched = false;
    private templateDescription = '';
    private templateDescriptionTouched = false;
    private advancedPath = '';
    private advancedPathTouched = false;
    private candidate: ImportedTemplateCandidate | null = null;
    private candidateLoading = false;
    private commitInFlight = false;
    private readonly onCommit: (commit: ImportedTemplateCommit) => Promise<void> | void;

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
        this.templateName = '';
        this.templateNameTouched = false;
        this.templateDescription = '';
        this.templateDescriptionTouched = false;
        this.advancedPath = '';
        this.advancedPathTouched = false;
        this.candidate = null;
        this.candidateLoading = false;
        this.commitInFlight = false;
        const { contentEl, modalEl, titleEl } = this;
        contentEl.empty();
        titleEl.setText('');

        if (modalEl) {
            modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell', 'ert-modal-shell--md', 'ert-modal--import-template');
        }
        contentEl.addClass('ert-modal-container', 'ert-stack');
        void this.refreshCandidate();
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private getCandidatePath(): string {
        const advancedPath = this.advancedPath.trim();
        return advancedPath || this.sourcePath.trim();
    }

    private getCandidateName(): string | undefined {
        const value = this.templateName.trim();
        return value.length > 0 ? value : undefined;
    }

    private getCandidateDescription(): string | undefined {
        const value = this.templateDescription.trim();
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
            if (!this.templateNameTouched) {
                this.templateName = candidate.layout.name;
            }
            if (!this.templateDescriptionTouched) {
                this.templateDescription = candidate.layout.description || '';
            }
            if (!this.advancedPathTouched) {
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
        new TemplateFileSuggestModal(this.app, (selectedPath) => {
            this.sourcePath = selectedPath;
            if (!this.advancedPathTouched) {
                this.advancedPath = compactTemplatePathForStorage(this.plugin, selectedPath);
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
            text: 'Choose a .tex file and bring it into Publishing in four quick steps.',
        });

        const meta = header.createDiv({ cls: 'ert-modal-meta' });
        meta.createSpan({ cls: 'ert-modal-meta-item', text: `Step ${this.step} of 4` });
        meta.createSpan({
            cls: 'ert-modal-meta-item',
            text: this.candidateLoading
                ? 'Checking...'
                : this.candidate?.summary.state === 'blocked'
                    ? 'Blocked'
                    : this.candidate?.summary.state === 'warning'
                        ? 'Needs attention'
                        : this.candidate
                            ? 'Ready'
                            : 'Choose a file',
        });

        this.renderStepRail(contentEl);

        const panel = contentEl.createDiv({ cls: 'ert-panel ert-panel--glass ert-stack ert-import-template-panel' });
        if (this.candidateLoading) {
            this.renderStepHero(panel, {
                icon: 'loader-circle',
                title: 'Checking template',
                description: 'Reviewing the file and gathering a quick profile.',
            });
        } else {
            switch (this.step) {
                case 1:
                    this.renderChooseFileStep(panel);
                    break;
                case 2:
                    this.renderCheckStep(panel);
                    break;
                case 3:
                    this.renderSetupStep(panel);
                    break;
                case 4:
                    this.renderSaveStep(panel);
                    break;
            }
        }

        const actions = contentEl.createDiv({ cls: 'ert-modal-actions' });
        new ButtonComponent(actions)
            .setButtonText('Back')
            .setDisabled(this.step === 1 || this.commitInFlight)
            .onClick(() => {
                if (this.step > 1) {
                    this.step = (this.step - 1) as ImportTemplateStep;
                    this.render();
                }
            });

        if (this.step < 4) {
            new ButtonComponent(actions)
                .setButtonText('Next')
                .setDisabled(this.commitInFlight || !this.canAdvanceToNextStep())
                .onClick(() => {
                    if (this.step < 4) {
                        this.step = (this.step + 1) as ImportTemplateStep;
                        this.render();
                    }
                });
        }

        actions.createDiv({ cls: 'ert-modal-actions-spacer' });

        if (this.step === 4) {
            this.draftButton = new ButtonComponent(actions)
                .setButtonText('Save template')
                .setDisabled(this.commitInFlight || !this.candidate)
                .onClick(() => void this.commit('draft'));

            this.activateButton = new ButtonComponent(actions)
                .setButtonText('Save and activate')
                .setCta()
                .setDisabled(this.commitInFlight || !this.candidate || !this.candidate.canActivate)
                .onClick(() => void this.commit('activate'));
        } else {
            this.draftButton = undefined;
            this.activateButton = undefined;
        }

        new ButtonComponent(actions)
            .setButtonText('Cancel')
            .setDisabled(this.commitInFlight)
            .onClick(() => this.close());

        this.updateActionButtons();
    }

    private canAdvanceToNextStep(): boolean {
        if (this.step === 1) return Boolean(this.getCandidatePath());
        if (this.step === 2 || this.step === 3) return Boolean(this.candidate);
        return true;
    }

    private renderStepRail(container: HTMLElement): void {
        const rail = container.createDiv({ cls: 'ert-import-template-steps' });
        const steps = ['Choose', 'Check', 'Set up', 'Save'];
        steps.forEach((label, index) => {
            const stateClass = this.step === index + 1 ? ' is-active' : this.step > index + 1 ? ' is-complete' : '';
            const item = rail.createDiv({ cls: `ert-import-template-step${stateClass}` });
            const bg = item.createDiv({ cls: 'ert-import-template-step-bg' });
            setIcon(bg, this.getStepRailIcon(index + 1));
            const text = item.createDiv({ cls: 'ert-import-template-step-text' });
            text.createDiv({ cls: 'ert-import-template-step-label', text: `${index + 1} ${label}` });
            if (this.step === index + 1) {
                item.setAttr('aria-current', 'step');
            }
        });
    }

    private renderStepHero(
        panel: HTMLElement,
        options: {
            icon?: string;
            previewKind?: DetectedTemplateMockPreviewKind;
            title: string;
            description: string;
        }
    ): void {
        const hero = panel.createDiv({ cls: 'ert-import-template-stepHero' });
        const visual = hero.createDiv({ cls: 'ert-import-template-stepHero-visual' });

        if (options.previewKind) {
            this.renderMockPreview(visual, options.previewKind);
        } else if (options.icon) {
            const iconWrap = visual.createDiv({ cls: 'ert-import-template-stepHero-icon' });
            setIcon(iconWrap, options.icon);
        }

        hero.createDiv({ cls: 'ert-import-template-stepHero-title', text: options.title });
        hero.createDiv({ cls: 'ert-import-template-stepHero-desc', text: options.description });
    }

    private renderChooseFileStep(panel: HTMLElement): void {
        this.renderStepHero(panel, {
            icon: 'file-text',
            title: 'Choose template',
            description: 'Pick the .tex file you want to bring into Publishing.',
        });

        const card = panel.createDiv({ cls: 'ert-card ert-stack ert-stack--tight' });
        card.createDiv({ cls: 'ert-label', text: 'Selected file' });
        card.createDiv({
            cls: `ert-field-note ert-import-template-selectedPath${this.getCandidatePath() ? '' : ' is-empty'}`,
            text: this.getCandidatePath() || 'No file selected yet.',
        });

        const actions = card.createDiv({ cls: 'ert-import-template-inlineActions' });
        const chooseButton = new ButtonComponent(actions)
            .setButtonText('Choose file')
            .setCta()
            .onClick(() => { void this.chooseFile(); });
        chooseButton.buttonEl.addClass('ert-pillBtn', 'ert-pillBtn--standard');
    }

    private renderCheckStep(panel: HTMLElement): void {
        const status = this.candidate?.summary.state || 'ready';
        this.renderStepHero(panel, {
            icon: status === 'blocked' ? 'octagon-alert' : status === 'warning' ? 'triangle-alert' : 'badge-check',
            title: 'Check template',
            description: 'Review the check results and the inferred layout.',
        });

        const card = panel.createDiv({ cls: 'ert-card ert-stack ert-stack--tight' });
        card.createDiv({
            cls: 'ert-card__header',
            text: status === 'blocked'
                ? 'Blocked'
                : status === 'warning'
                    ? 'Needs attention'
                    : 'Ready',
        });
        card.createDiv({
            cls: 'ert-field-note',
            text: this.candidate
                ? this.getCheckStatusMessage(this.candidate)
                : 'Choose a template file first.',
        });

        if ((this.candidate?.issues.length || 0) > 0) {
            const list = card.createDiv({ cls: 'ert-stack ert-stack--tight' });
            this.candidate?.issues.slice(0, 4).forEach(issue => {
                list.createDiv({
                    cls: 'ert-field-note',
                    text: this.formatIssueMessage(issue.message),
                });
            });
        }

        this.renderDetectedLayoutCard(panel);
    }

    private renderSetupStep(panel: HTMLElement): void {
        this.renderStepHero(panel, {
            previewKind: this.candidate?.detectedTemplate.mockPreviewKind || 'generic',
            title: 'Set up template',
            description: 'Name the template and choose where you want to use it.',
        });

        const grid = panel.createDiv({ cls: 'ert-gridForm ert-gridForm--2' });

        const nameCell = grid.createDiv({ cls: 'ert-gridForm__cell' });
        nameCell.createDiv({ cls: 'ert-label', text: 'Name' });
        const nameInput = nameCell.createEl('input', {
            cls: 'ert-input ert-input--full',
            attr: { type: 'text', value: this.templateName },
        });
        nameInput.addEventListener('input', () => {
            this.templateNameTouched = true;
            this.templateName = nameInput.value;
            void this.refreshCandidate();
        });

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

        const descriptionCell = panel.createDiv({ cls: 'ert-gridForm__cell' });
        descriptionCell.createDiv({ cls: 'ert-label', text: 'Description' });
        const descriptionInput = descriptionCell.createEl('textarea', {
            cls: 'ert-textarea ert-textarea--compact',
            attr: { rows: '3' },
        });
        descriptionInput.value = this.templateDescription;
        descriptionInput.addEventListener('input', () => {
            this.templateDescriptionTouched = true;
            this.templateDescription = descriptionInput.value;
            void this.refreshCandidate();
        });

        if (this.candidate) {
            const note = panel.createDiv({ cls: 'ert-field-note' });
            note.setText(`Likely: ${this.getStyleHintLabel(this.candidate.detectedTemplate.styleHint)}`);
        }

        const advanced = panel.createEl('details', { cls: 'ert-import-template-advanced' });
        const summary = advanced.createEl('summary', {
            cls: 'ert-import-template-advanced-summary',
            text: 'Advanced edit',
        });
        summary.setAttr('role', 'button');

        const advancedCard = advanced.createDiv({ cls: 'ert-card ert-import-template-advanced-card ert-stack ert-stack--tight' });
        advancedCard.createDiv({ cls: 'ert-label', text: 'Path override' });
        const pathInput = advancedCard.createEl('input', {
            cls: 'ert-input ert-input--full',
            attr: { type: 'text', value: this.advancedPath || this.sourcePath },
        });
        pathInput.addEventListener('input', () => {
            this.advancedPathTouched = true;
            this.advancedPath = pathInput.value;
            void this.refreshCandidate();
        });
        advancedCard.createDiv({
            cls: 'ert-field-note',
            text: 'Use this only if you need to store the template at a different path.',
        });
    }

    private renderSaveStep(panel: HTMLElement): void {
        this.renderStepHero(panel, {
            previewKind: this.candidate?.detectedTemplate.mockPreviewKind || 'generic',
            title: 'Save template',
            description: 'Review the summary and decide whether to activate it now.',
        });

        const summary = panel.createDiv({ cls: 'ert-card ert-stack ert-stack--tight' });
        summary.createDiv({ cls: 'ert-card__header', text: 'Final summary' });
        summary.createDiv({
            cls: 'ert-field-note',
            text: this.candidate?.profile.name || this.templateName || 'Template',
        });
        summary.createDiv({
            cls: 'ert-field-note',
            text: `Usage context: ${this.formatUsageContext(this.usageContext)}`,
        });
        summary.createDiv({
            cls: 'ert-field-note',
            text: this.candidate?.canActivate
                ? 'Ready to save and activate.'
                : 'You can save this template now and activate it after fixing the issues.',
        });

        if ((this.candidate?.issues.length || 0) > 0) {
            const list = summary.createDiv({ cls: 'ert-stack ert-stack--tight' });
            this.candidate?.issues.slice(0, 3).forEach(issue => {
                list.createDiv({ cls: 'ert-field-note', text: this.formatIssueMessage(issue.message) });
            });
        }
    }

    private renderDetectedLayoutCard(panel: HTMLElement): void {
        const candidate = this.candidate;
        if (!candidate) return;

        const card = panel.createDiv({ cls: 'ert-card ert-import-template-detected-card ert-stack ert-stack--tight' });
        const meta = card.createDiv({ cls: 'ert-import-template-detected-meta' });
        meta.createDiv({
            cls: 'ert-import-template-detected-line',
            text: `Detected layout: ${this.getLikelyLayoutShortLabel(candidate.detectedTemplate.styleHint)}`,
        });
        meta.createDiv({
            cls: 'ert-import-template-detected-line ert-import-template-detected-line--confidence',
            text: `Confidence: ${this.formatConfidence(candidate.detectedTemplate.confidence)}`,
        });

        if (candidate.detectedTemplate.traits.length > 0) {
            const traits = card.createDiv({ cls: 'ert-import-template-traitGrid' });
            candidate.detectedTemplate.traits.slice(0, 4).forEach(trait => {
                const visual = this.describeTraitVisual(trait);
                const item = traits.createDiv({ cls: 'ert-import-template-traitTile' });
                const iconWrap = item.createDiv({ cls: 'ert-import-template-traitIcon' });
                setIcon(iconWrap, visual.icon);
                item.createDiv({ cls: 'ert-import-template-traitLabel', text: visual.label });
            });
        }
    }

    private renderMockPreview(container: HTMLElement, kind: DetectedTemplateMockPreviewKind): void {
        const wrap = container.createDiv({ cls: 'ert-import-template-mock-wrap' });
        wrap.createDiv({ cls: 'ert-import-template-mock-label', text: 'Approximate preview' });

        const mock = wrap.createDiv({ cls: `ert-import-template-mock ert-import-template-mock--${kind}` });
        const page = mock.createDiv({ cls: 'ert-import-template-mock-page' });
        if (kind === 'book' || kind === 'chaptered') {
            page.createDiv({ cls: 'ert-import-template-mock-header-line' });
        }

        const kicker = page.createDiv({ cls: 'ert-import-template-mock-kicker' });
        kicker.setText(kind === 'chaptered' ? 'Chapter opener' : kind === 'literary' ? 'Literary layout' : kind === 'manuscript' ? 'Submission format' : kind === 'book' ? 'Book layout' : 'Custom layout');

        page.createDiv({
            cls: `ert-import-template-mock-title ert-import-template-mock-title--${kind}`,
            text: kind === 'chaptered' ? 'Chapter One' : kind === 'literary' ? 'Winter Light' : kind === 'manuscript' ? 'Manuscript Page' : kind === 'book' ? 'Book Page' : 'Template Preview',
        });

        if (kind === 'literary') {
            page.createDiv({ cls: 'ert-import-template-mock-subtitle', text: 'A quiet opening line' });
        }

        const lines = page.createDiv({ cls: 'ert-import-template-mock-lines' });
        ['',' is-mid','',' is-short','',''].forEach((suffix) => {
            lines.createDiv({ cls: `ert-import-template-mock-line${suffix}`.trim() });
        });
    }

    private getLikelyLayoutLabel(styleHint: DetectedTemplateStyleHint): string {
        switch (styleHint) {
            case 'chaptered':
                return 'Chaptered book layout';
            case 'book':
                return 'Book layout';
            case 'literary':
                return 'Literary book layout';
            case 'manuscript':
                return 'Submission manuscript';
            default:
                return 'Custom / unknown layout';
        }
    }

    private getLikelyLayoutShortLabel(styleHint: DetectedTemplateStyleHint): string {
        switch (styleHint) {
            case 'chaptered':
                return 'Chaptered';
            case 'book':
                return 'Book';
            case 'literary':
                return 'Literary';
            case 'manuscript':
                return 'Manuscript';
            default:
                return 'Custom';
        }
    }

    private getStyleHintLabel(styleHint: DetectedTemplateStyleHint): string {
        switch (styleHint) {
            case 'chaptered':
                return 'Chaptered book';
            case 'book':
                return 'Book layout';
            case 'literary':
                return 'Literary layout';
            case 'manuscript':
                return 'Submission manuscript';
            default:
                return 'Custom layout';
        }
    }

    private describeTraitVisual(trait: string): { icon: string; label: string } {
        const normalized = trait.toLowerCase();
        if (normalized.includes('header')) {
            return { icon: 'panel-top', label: 'Header' };
        }
        if (normalized.includes('chapter') || normalized.includes('page structure') || normalized.includes('part')) {
            return { icon: 'book-open', label: 'Structure' };
        }
        if (normalized.includes('typography') || normalized.includes('font')) {
            return { icon: 'type', label: 'Type' };
        }
        if (normalized.includes('metadata') || normalized.includes('front-page')) {
            return { icon: 'badge-info', label: 'Metadata' };
        }
        if (normalized.includes('spacing')) {
            return { icon: 'move-horizontal', label: 'Spacing' };
        }
        if (normalized.includes('dialogue') || normalized.includes('scene')) {
            return { icon: 'message-square', label: 'Dialogue' };
        }
        return { icon: 'file-text', label: 'Custom' };
    }

    private formatConfidence(confidence: DetectedTemplateConfidence): string {
        return confidence.charAt(0).toUpperCase() + confidence.slice(1);
    }

    private formatUsageContext(context: UsageContext): string {
        switch (context) {
            case 'screenplay':
                return 'Screenplay';
            case 'podcast':
                return 'Podcast';
            default:
                return 'Novel';
        }
    }

    private getStepRailIcon(step: number): string {
        switch (step) {
            case 1:
                return 'file-text';
            case 2:
                return 'check-circle';
            case 3:
                return 'sliders-horizontal';
            case 4:
                return 'save';
            default:
                return 'circle';
        }
    }

    private getCheckStatusMessage(candidate: ImportedTemplateCandidate): string {
        if (candidate.summary.state === 'blocked') {
            return 'This template needs fixes before it can be activated.';
        }
        if (candidate.summary.state === 'warning') {
            return 'This template can be saved now, but it needs a quick review.';
        }
        return 'This template looks ready to use.';
    }

    private formatIssueMessage(message: string): string {
        if (/\$body\$/i.test(message)) {
            return 'The template is missing the main manuscript placeholder.';
        }
        if (/fontspec|xelatex|lualatex/i.test(message)) {
            return 'This template expects a Unicode PDF engine.';
        }
        if (/\.tex/i.test(message) && /import/i.test(message)) {
            return 'Choose a valid .tex template file.';
        }
        return message;
    }

    private updateActionButtons(): void {
        this.activateButton?.setDisabled(this.commitInFlight || !this.candidate || !this.candidate.canActivate);
        this.draftButton?.setDisabled(this.commitInFlight || !this.candidate);
    }
}
