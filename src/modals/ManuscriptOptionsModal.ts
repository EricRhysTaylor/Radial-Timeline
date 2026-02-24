/*
 * Manuscript Options Modal
 */
import { App, ButtonComponent, DropdownComponent, Modal, Notice, Platform, setIcon, TAbstractFile, TFile, ToggleComponent } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { getSceneFilesByOrder, ManuscriptOrder, TocMode } from '../utils/manuscript';
import { t } from '../i18n';
import { ExportFormat, ExportType, ManuscriptPreset, OutlinePreset, getAutoPdfEngineSelection, getLayoutsForPreset, resolveTemplatePath, validatePandocLayout } from '../utils/exportFormats';
import { isProfessionalActive } from '../settings/sections/ProfessionalSection';
import { getActiveBook, getActiveBookTitle, DEFAULT_BOOK_TITLE } from '../utils/books';
import { chunkScenesIntoParts } from '../utils/splitOutput';

export interface ManuscriptModalResult {
    order: ManuscriptOrder;
    tocMode: TocMode;
    rangeStart?: number;
    rangeEnd?: number;
    subplot?: string;
    exportType: ExportType;
    manuscriptPreset?: ManuscriptPreset;
    outlinePreset?: OutlinePreset;
    outputFormat: ExportFormat;
    updateWordCounts?: boolean;
    includeSynopsis?: boolean;
    includeMatter?: boolean;
    saveMarkdownArtifact?: boolean;
    selectedLayoutId?: string;
    splitMode?: 'single' | 'parts';
    splitParts?: number;
}

export interface ManuscriptExportOutcome {
    savedPath?: string;
    renderedPath?: string;
    savedPaths?: string[];
    renderedPaths?: string[];
    outputFolder?: string;
    messages?: string[];
}

type DragHandle = 'start' | 'end' | null;

export class ManuscriptOptionsModal extends Modal {
    private readonly plugin: RadialTimelinePlugin;
    private readonly onSubmit: (result: ManuscriptModalResult) => Promise<ManuscriptExportOutcome>;

    private readonly isPro: boolean;

    private order: ManuscriptOrder = 'narrative';
    private tocMode: TocMode = 'markdown';
    private subplot: string = 'All Subplots';
    private exportType: ExportType = 'manuscript';
    private manuscriptPreset: ManuscriptPreset = 'novel';
    private outlinePreset: OutlinePreset = 'beat-sheet';
    private outputFormat: ExportFormat = 'markdown';
    private updateWordCounts: boolean = false;
    private includeSynopsis: boolean = true;
    private includeMatter: boolean = true;
    private saveMarkdownArtifact: boolean = true;
    private hasWhenDates: boolean = false;
    private includeMatterUserChoice: boolean = true;
    private includeSynopsisUserChoice: boolean = true;
    private hasTouchedMatterToggle: boolean = false;
    private splitMode: 'single' | 'parts' = 'single';
    private splitParts: number = 3;

    private sceneTitles: string[] = [];
    private sceneWhenDates: (string | null)[] = [];
    private sceneNumbers: number[] = [];
    private totalScenes = 0;
    private rangeStart = 1;
    private rangeEnd = 1;

    private trackEl?: HTMLElement;
    private startHandleEl?: HTMLElement;
    private endHandleEl?: HTMLElement;
    private rangeFillEl?: HTMLElement;
    private heroMetaEl?: HTMLElement;
    private rangeStatusEl?: HTMLElement;
    private rangeDecimalWarningEl?: HTMLElement;
    private rangeCardContainer?: HTMLElement;
    private loadingEl?: HTMLElement;
    private actionButton?: ButtonComponent;
    private openFolderButton?: ButtonComponent;
    private markdownArtifactToggle?: ToggleComponent;
    private subplotDropdown?: DropdownComponent;
    private chronoHelperEl?: HTMLElement;
    private outputStatusEl?: HTMLElement;
    private orderPills: { el: HTMLElement, order: ManuscriptOrder }[] = [];
    private exportTypePills: { el: HTMLElement, type: ExportType }[] = [];
    private outputFormatPills: { el: HTMLElement, format: ExportFormat }[] = [];
    private manuscriptPresetDropdown?: DropdownComponent;
    private outlinePresetDropdown?: DropdownComponent;
    private tocCard?: HTMLElement;
    private manuscriptOptionsCard?: HTMLElement;
    private outlineOptionsCard?: HTMLElement;
    private wordCountCard?: HTMLElement;
    private scopeCard?: HTMLElement;
    private orderingCard?: HTMLElement;
    private filterCard?: HTMLElement;
    private splitCard?: HTMLElement;
    private manuscriptRulesCard?: HTMLElement;
    private publishingCard?: HTMLElement;
    private includeMatterCard?: HTMLElement;
    private synopsisRow?: HTMLElement;
    private templateWarningEl?: HTMLElement;
    private layoutHeaderEl?: HTMLElement;
    private layoutContainerEl?: HTMLElement;
    private selectedLayoutId?: string;
    private manuscriptPresetDescEl?: HTMLElement;
    private manuscriptPresetGridEl?: HTMLElement;
    private outlinePresetDescEl?: HTMLElement;
    private manuscriptPreviewToggle?: HTMLElement;
    private manuscriptPreviewPanel?: HTMLElement;
    private manuscriptPreviewIcon?: HTMLElement;
    private outlinePreviewToggle?: HTMLElement;
    private outlinePreviewPanel?: HTMLElement;
    private outlinePreviewIcon?: HTMLElement;
    private manuscriptPreviewExpanded: boolean = false;
    private outlinePreviewExpanded: boolean = false;
    private splitPartsInputEl?: HTMLInputElement;
    private splitPartsContainerEl?: HTMLElement;
    private splitPreviewEl?: HTMLElement;
    private splitErrorEl?: HTMLElement;
    private splitHelperEl?: HTMLElement;
    private splitSingleInputEl?: HTMLInputElement;
    private splitPartsRadioInputEl?: HTMLInputElement;
    private cancelButton?: ButtonComponent;

    private activeHandle: DragHandle = null;
    private detachEvents?: () => void;
    private exportCompleted: boolean = false;
    private lastOutcome: ManuscriptExportOutcome | null = null;

    constructor(
        app: App,
        plugin: RadialTimelinePlugin,
        onSubmit: (result: ManuscriptModalResult) => Promise<ManuscriptExportOutcome>
    ) {
        super(app);
        this.plugin = plugin;
        this.onSubmit = onSubmit;
        this.isPro = isProfessionalActive(plugin);
    }

    async onOpen(): Promise<void> {
        const { contentEl, modalEl } = this;
        contentEl.empty();

        // Apply generic modal shell + modal-specific class
        if (modalEl) {
            modalEl.style.width = '760px'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxWidth = '92vw'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxHeight = '92vh'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell');
        }
        contentEl.classList.add('ert-modal-container', 'ert-stack', 'rt-manuscript-modal');

        this.renderSkeleton(contentEl);
        await this.loadSubplots();
        await this.loadScenesForOrder();
    }

    onClose(): void {
        this.detachPointerEvents();
        this.contentEl.empty();
    }

    // Layout -----------------------------------------------------------------
    /**
     * Create a section heading with optional icon
     */
    private createSectionHeading(parent: HTMLElement, text: string, iconName?: string): HTMLElement {
        const heading = parent.createDiv({ cls: 'rt-sub-card-head' });
        if (iconName) {
            const icon = heading.createSpan({ cls: 'rt-sub-card-head-icon' });
            setIcon(icon, iconName);
        }
        heading.createSpan({ cls: 'rt-sub-card-head-text', text });
        return heading;
    }

    private renderSkeleton(container: HTMLElement): void {
        const hero = container.createDiv({ cls: 'ert-modal-header' });

        if (this.isPro) {
            hero.createSpan({ cls: 'ert-modal-badge', text: 'Pro' });
        }

        hero.createDiv({
            cls: 'ert-modal-title',
            text: t('manuscriptModal.title')
        });
        hero.createDiv({
            cls: 'ert-modal-subtitle',
            text: t('manuscriptModal.description')
        });
        const bookTitle = getActiveBookTitle(this.plugin.settings, DEFAULT_BOOK_TITLE);
        const bookContextRow = hero.createDiv({ cls: 'ert-modal-meta' });
        bookContextRow.createSpan({ cls: 'ert-modal-meta-item', text: `Exporting: ${bookTitle}` });
        const manageBooksLink = bookContextRow.createEl('a', {
            cls: 'ert-modal-meta-item',
            text: 'Manage books\u2026',
            attr: { href: '#' }
        });
        manageBooksLink.addEventListener('click', (e) => {
            e.preventDefault();
            this.close();
            // @ts-ignore - Obsidian API
            this.app.setting.open();
            // @ts-ignore - Obsidian API
            this.app.setting.openTabById('radial-timeline');
        });
        this.heroMetaEl = hero.createDiv({ cls: 'ert-modal-meta' });
        this.renderHeroMeta([t('manuscriptModal.heroLoading')]);

        // A) OUTPUT
        const outputCard = container.createDiv({ cls: 'rt-glass-card rt-sub-card' });
        this.createSectionHeading(outputCard, 'Output', 'file-output');
        const outputGrid = outputCard.createDiv({ cls: 'ert-manuscript-output-grid' });

        const exportTypeCol = outputGrid.createDiv({ cls: 'ert-manuscript-output-col' });
        exportTypeCol.createSpan({ cls: 'rt-manuscript-toggle-label', text: 'Document type' });
        const exportRow = exportTypeCol.createDiv({ cls: 'rt-manuscript-pill-row ert-manuscript-pill-row--single' });
        this.createExportTypePill(exportRow, t('manuscriptModal.exportTypeManuscript'), 'manuscript');
        this.createExportTypePill(exportRow, t('manuscriptModal.exportTypeOutline'), 'outline', !this.isPro, true);

        const formatCol = outputGrid.createDiv({ cls: 'ert-manuscript-output-col' });
        formatCol.createSpan({ cls: 'rt-manuscript-toggle-label', text: 'Format' });
        const formatRow = formatCol.createDiv({ cls: 'rt-manuscript-pill-row ert-manuscript-pill-row--single' });
        this.createOutputFormatPill(formatRow, t('manuscriptModal.formatMarkdown'), 'markdown', false, 'both');
        this.createOutputFormatPill(formatRow, t('manuscriptModal.formatPdf'), 'pdf', !this.isPro, 'manuscript', true);

        // B) PRESETS
        this.manuscriptOptionsCard = container.createDiv({ cls: 'rt-glass-card rt-sub-card' });
        const manuscriptPresetGrid = this.manuscriptOptionsCard.createDiv({ cls: 'ert-manuscript-preset-grid' });
        this.manuscriptPresetGridEl = manuscriptPresetGrid;

        const presetHeaderCol = manuscriptPresetGrid.createDiv({ cls: 'ert-manuscript-preset-col ert-manuscript-preset-col--header' });
        this.createSectionHeading(presetHeaderCol, t('manuscriptModal.manuscriptPresetHeading'), 'book-open');
        this.layoutHeaderEl = manuscriptPresetGrid.createDiv({ cls: 'ert-manuscript-preset-col ert-manuscript-preset-col--header' });
        this.createSectionHeading(this.layoutHeaderEl, 'Layout', 'layout-template');

        const presetCol = manuscriptPresetGrid.createDiv({ cls: 'ert-manuscript-preset-col ert-manuscript-preset-col--preset' });
        const presetRow = presetCol.createDiv({ cls: 'rt-manuscript-input-container' });
        this.manuscriptPresetDropdown = new DropdownComponent(presetRow)
            .addOption('novel', t('manuscriptModal.presetNovel'))
            .addOption('screenplay', t('manuscriptModal.presetScreenplay'))
            .addOption('podcast', t('manuscriptModal.presetPodcast'))
            .setValue(this.manuscriptPreset)
            .onChange((value) => {
                const preset = value as ManuscriptPreset;
                const isProPreset = preset === 'screenplay' || preset === 'podcast';
                if (!this.isPro && isProPreset) {
                    new Notice(t('manuscriptModal.proRequired'));
                    this.manuscriptPresetDropdown?.setValue(this.manuscriptPreset);
                    return;
                }
                this.manuscriptPreset = preset;
                this.syncExportUi();
                this.updateManuscriptPresetDescription();
            });
        this.styleDropdownProOptions(this.manuscriptPresetDropdown, ['screenplay', 'podcast']);
        this.manuscriptPresetDescEl = presetCol.createDiv({ cls: 'rt-sub-card-note' });
        this.updateManuscriptPresetDescription();
        this.layoutContainerEl = manuscriptPresetGrid.createDiv({ cls: 'rt-manuscript-layout-picker ert-manuscript-preset-col ert-manuscript-preset-col--layout' });
        this.templateWarningEl = manuscriptPresetGrid.createDiv({ cls: 'rt-manuscript-template-warning ert-manuscript-preset-status' });

        this.outlineOptionsCard = container.createDiv({ cls: 'rt-glass-card rt-sub-card' });
        if (!this.isPro) {
            this.outlineOptionsCard.addClass('ert-pro-locked');
        }
        this.createSectionHeading(this.outlineOptionsCard, t('manuscriptModal.outlinePresetHeading'), 'layout-list');
        const outlinePresetRow = this.outlineOptionsCard.createDiv({ cls: 'rt-manuscript-input-container' });
        this.outlinePresetDropdown = new DropdownComponent(outlinePresetRow)
            .addOption('beat-sheet', t('manuscriptModal.outlineBeatSheet'))
            .addOption('episode-rundown', t('manuscriptModal.outlineEpisodeRundown'))
            .addOption('shooting-schedule', t('manuscriptModal.outlineShootingSchedule'))
            .setValue(this.outlinePreset)
            .onChange((value) => {
                this.outlinePreset = value as OutlinePreset;
                this.syncExportUi();
                this.updateOutlinePresetDescription();
            });
        this.outlinePresetDescEl = this.outlineOptionsCard.createDiv({ cls: 'rt-sub-card-note' });
        this.updateOutlinePresetDescription();
        this.synopsisRow = this.outlineOptionsCard.createDiv({ cls: 'rt-manuscript-toggle-row' });
        this.synopsisRow.createSpan({ cls: 'rt-manuscript-toggle-label', text: t('manuscriptModal.includeSynopsis') });
        new ToggleComponent(this.synopsisRow)
            .setValue(this.includeSynopsisUserChoice)
            .onChange((value) => {
                this.includeSynopsisUserChoice = value;
                this.includeSynopsis = value;
            });
        this.outlineOptionsCard.createDiv({
            cls: 'rt-sub-card-note',
            text: t('manuscriptModal.includeSynopsisNote')
        });

        // C) SPLIT OUTPUT
        this.splitCard = container.createDiv({ cls: 'rt-glass-card rt-sub-card' });
        this.createSectionHeading(this.splitCard, 'Split Output', 'split');
        this.splitCard.createDiv({
            cls: 'rt-sub-card-note',
            text: 'Export as one file or split into multiple parts.'
        });
        const splitModeRow = this.splitCard.createDiv({ cls: 'ert-manuscript-split-grid' });
        const splitModeGroup = `rt-manuscript-split-${Date.now()}`;
        const singleCol = splitModeRow.createDiv({ cls: 'ert-manuscript-split-col ert-manuscript-split-col--single' });
        const singleOption = singleCol.createEl('label', { cls: 'ert-manuscript-split-option' });
        this.splitSingleInputEl = singleOption.createEl('input', {
            attr: { type: 'radio', name: splitModeGroup, value: 'single' }
        }) as HTMLInputElement;
        singleOption.createSpan({ cls: 'ert-manuscript-split-option-label', text: 'Single file' });

        const partsCol = splitModeRow.createDiv({ cls: 'ert-manuscript-split-col ert-manuscript-split-col--parts' });
        const partsOption = partsCol.createEl('label', { cls: 'ert-manuscript-split-option ert-manuscript-split-option--parts' });
        this.splitPartsRadioInputEl = partsOption.createEl('input', {
            attr: { type: 'radio', name: splitModeGroup, value: 'parts' }
        }) as HTMLInputElement;
        partsOption.createSpan({ cls: 'ert-manuscript-split-option-label', text: 'Split into parts' });
        this.splitPartsInputEl = partsOption.createEl('input', {
            cls: 'ert-input ert-input--xs ert-manuscript-split-parts-input',
            attr: { type: 'number', min: '2', max: '20', step: '1', value: String(this.splitParts) }
        }) as HTMLInputElement;

        this.splitSingleInputEl.checked = true;
        this.splitSingleInputEl.addEventListener('change', () => {
            if (!this.splitSingleInputEl?.checked) return;
            this.splitMode = 'single';
            this.updateSplitUi();
        });
        this.splitPartsRadioInputEl.addEventListener('change', () => {
            if (!this.splitPartsRadioInputEl?.checked) return;
            this.splitMode = 'parts';
            this.updateSplitUi();
        });
        this.splitPartsInputEl.addEventListener('input', () => {
            const next = Number.parseInt(this.splitPartsInputEl?.value || '', 10);
            this.splitParts = this.clampSplitParts(next);
            if (this.splitPartsInputEl) this.splitPartsInputEl.value = String(this.splitParts);
            if (this.splitPartsRadioInputEl) this.splitPartsRadioInputEl.checked = true;
            this.splitMode = 'parts';
            this.updateSplitUi();
        });
        this.splitPartsContainerEl = this.splitCard.createDiv({ cls: 'ert-manuscript-split-parts rt-hidden' });
        this.splitHelperEl = this.splitPartsContainerEl.createDiv({
            cls: 'rt-sub-card-note',
            text: 'Scenes are divided evenly across files.'
        });
        this.splitErrorEl = this.splitPartsContainerEl.createDiv({ cls: 'rt-sub-card-note ert-manuscript-split-error rt-hidden' });
        this.splitPreviewEl = this.splitPartsContainerEl.createDiv({ cls: 'ert-manuscript-split-preview' });

        // D) SCOPE
        this.scopeCard = container.createDiv({ cls: 'rt-glass-card rt-sub-card' });
        this.createSectionHeading(this.scopeCard, 'Scope', 'filter');

        this.filterCard = this.scopeCard.createDiv({ cls: 'ert-manuscript-scope-row' });
        this.filterCard.createSpan({ cls: 'rt-manuscript-toggle-label', text: 'Subplot filter' });
        const filterContainer = this.filterCard.createDiv({ cls: 'rt-manuscript-input-container ert-manuscript-scope-input' });
        this.subplotDropdown = new DropdownComponent(filterContainer)
            .addOption('All Subplots', 'All Subplots')
            .setValue('All Subplots')
            .onChange(async (value) => {
                this.subplot = value;
                await this.loadScenesForOrder();
            });

        this.createSectionHeading(this.scopeCard, t('manuscriptModal.rangeHeading'), 'sliders-horizontal');
        this.rangeStatusEl = this.scopeCard.createDiv({ cls: 'rt-manuscript-range-status', text: t('manuscriptModal.rangeLoading') });
        this.rangeDecimalWarningEl = this.scopeCard.createDiv({
            cls: 'rt-manuscript-range-warning rt-hidden',
            text: t('manuscriptModal.rangeDecimalWarning')
        });
        const rangeShell = this.scopeCard.createDiv({ cls: 'rt-manuscript-range-shell' });
        this.rangeCardContainer = rangeShell.createDiv({ cls: 'rt-manuscript-range-cards' });
        const trackWrap = rangeShell.createDiv({ cls: 'rt-manuscript-range-track-wrap' });
        this.trackEl = trackWrap.createDiv({ cls: 'rt-manuscript-range-track' });
        this.rangeFillEl = this.trackEl.createDiv({ cls: 'rt-manuscript-range-fill' });
        this.startHandleEl = this.trackEl.createDiv({ cls: 'rt-manuscript-range-handle', attr: { 'data-handle': 'start', 'aria-label': 'Start of range' } });
        this.endHandleEl = this.trackEl.createDiv({ cls: 'rt-manuscript-range-handle', attr: { 'data-handle': 'end', 'aria-label': 'End of range' } });
        this.registerPointerEvents();
        this.loadingEl = this.scopeCard.createDiv({ cls: 'rt-manuscript-loading', text: t('manuscriptModal.rangeLoading') });

        // E) ORDERING
        this.orderingCard = container.createDiv({ cls: 'rt-glass-card rt-sub-card' });
        this.createSectionHeading(this.orderingCard, t('manuscriptModal.orderHeading'), 'arrow-down-up');
        const orderRow = this.orderingCard.createDiv({ cls: 'rt-manuscript-pill-row' });
        this.createOrderPill(orderRow, t('manuscriptModal.orderNarrative'), 'narrative');
        this.createOrderPill(orderRow, t('manuscriptModal.orderReverseNarrative'), 'reverse-narrative');
        this.createOrderPill(orderRow, t('manuscriptModal.orderChronological'), 'chronological');
        this.createOrderPill(orderRow, t('manuscriptModal.orderReverseChronological'), 'reverse-chronological');
        this.chronoHelperEl = this.orderingCard.createDiv({
            cls: 'rt-sub-card-note rt-hidden',
            text: 'No When dates found.'
        });
        this.orderingCard.createDiv({
            cls: 'rt-sub-card-note',
            text: t('manuscriptModal.orderNote')
        });

        // F) MANUSCRIPT OPTIONS
        this.manuscriptRulesCard = container.createDiv({ cls: 'rt-glass-card rt-sub-card' });
        this.createSectionHeading(this.manuscriptRulesCard, 'Manuscript Options', 'list-checks');

        this.tocCard = this.manuscriptRulesCard.createDiv({ cls: 'ert-manuscript-rule-block' });
        this.tocCard.createDiv({ cls: 'rt-manuscript-toggle-label', text: t('manuscriptModal.tocHeading') });
        const tocActions = this.tocCard.createDiv({ cls: 'rt-manuscript-pill-row' });
        this.createPill(tocActions, t('manuscriptModal.tocMarkdown'), this.tocMode === 'markdown', () => {
            this.tocMode = 'markdown';
            this.updatePills(tocActions, 0);
        });
        this.createPill(tocActions, t('manuscriptModal.tocPlain'), this.tocMode === 'plain', () => {
            this.tocMode = 'plain';
            this.updatePills(tocActions, 1);
        });
        this.createPill(tocActions, t('manuscriptModal.tocNone'), this.tocMode === 'none', () => {
            this.tocMode = 'none';
            this.updatePills(tocActions, 2);
        });
        this.tocCard.createDiv({
            cls: 'rt-sub-card-note',
            text: t('manuscriptModal.tocNote')
        });

        // G) PUBLISHING OPTIONS
        this.publishingCard = container.createDiv({ cls: 'rt-glass-card rt-sub-card' });
        this.createSectionHeading(this.publishingCard, 'Publishing Options', 'settings');
        const publishingBody = this.publishingCard.createDiv({ cls: 'ert-manuscript-advanced-body' });

        this.wordCountCard = publishingBody.createDiv({ cls: 'rt-manuscript-toggle-row' });
        this.wordCountCard.createSpan({ cls: 'rt-manuscript-toggle-label', text: t('manuscriptModal.wordCountToggle') });
        new ToggleComponent(this.wordCountCard)
            .setValue(this.updateWordCounts)
            .onChange((value) => {
                this.updateWordCounts = value;
            });

        this.includeMatterCard = publishingBody.createDiv({ cls: 'rt-manuscript-toggle-row' });
        this.includeMatterCard.createSpan({ cls: 'rt-manuscript-toggle-label', text: 'Include matter notes' });
        new ToggleComponent(this.includeMatterCard)
            .setValue(this.includeMatterUserChoice)
            .onChange((value) => {
                this.hasTouchedMatterToggle = true;
                this.includeMatterUserChoice = value;
                this.includeMatter = value;
            });

        const artifactRow = publishingBody.createDiv({ cls: 'rt-manuscript-toggle-row' });
        artifactRow.createSpan({ cls: 'rt-manuscript-toggle-label', text: 'Always save precompile Markdown file' });
        this.markdownArtifactToggle = new ToggleComponent(artifactRow)
            .setValue(this.saveMarkdownArtifact)
            .onChange((value) => {
                this.saveMarkdownArtifact = value;
            });
        publishingBody.createDiv({
            cls: 'rt-sub-card-note',
            text: 'When rendering PDF, this saves the precompile Markdown input passed to Pandoc before LaTeX conversion.'
        });

        // H) FOOTER
        const actions = container.createDiv({ cls: 'ert-modal-actions' });
        this.actionButton = new ButtonComponent(actions)
            .setButtonText(this.getPrimaryActionLabel())
            .setCta()
            .onClick(() => {
                if (this.exportCompleted) {
                    this.close();
                    return;
                }
                void this.submit();
            });

        this.openFolderButton = new ButtonComponent(actions)
            .setButtonText(this.getOpenFolderButtonLabel())
            .onClick(() => this.openOutcomeFolder());
        this.openFolderButton.buttonEl.addClass('rt-hidden');

        this.cancelButton = new ButtonComponent(actions)
            .setButtonText(t('manuscriptModal.actionCancel'))
            .onClick(() => this.close());

        this.outputStatusEl = container.createDiv({ cls: 'ert-manuscript-output-status rt-sub-card-note rt-hidden' });

        this.syncExportUi();
        this.markdownArtifactToggle.setDisabled(this.outputFormat === 'pdf');
    }

    private renderHeroMeta(items: string[]): void {
        if (!this.heroMetaEl) return;
        this.heroMetaEl.empty();
        items.forEach(item => this.heroMetaEl?.createSpan({ cls: 'ert-modal-meta-item', text: item }));
    }

    /**
     * Style specific dropdown options as Pro features (magenta text when Core)
     */
    private styleDropdownProOptions(dropdown: DropdownComponent, proValues: string[]): void {
        if (this.isPro) return; // Pro users see normal styling
        
        const options = dropdown.selectEl.querySelectorAll('option');
        options.forEach(option => {
            if (proValues.includes(option.value)) {
                option.classList.add('rt-dropdown-pro-option');
            }
        });
    }

    // Interaction helpers ----------------------------------------------------
    private createPill(parent: HTMLElement, label: string, active: boolean, onClick: () => void): void {
        const pill = parent.createDiv({ cls: 'rt-manuscript-pill' });
        pill.createSpan({ text: label });
        if (active) pill.classList.add('rt-is-active');
        pill.onClickEvent(() => {
            parent.querySelectorAll('.rt-manuscript-pill').forEach(el => el.removeClass('rt-is-active'));
            pill.classList.add('rt-is-active');
            onClick();
        });
    }

    private updatePills(parent: HTMLElement, activeIndex: number): void {
        const pills = Array.from(parent.querySelectorAll('.rt-manuscript-pill'));
        pills.forEach((el, idx) => {
            if (idx === activeIndex) {
                el.classList.add('rt-is-active');
            } else {
                el.removeClass('rt-is-active');
            }
        });
    }

    private createOrderPill(parent: HTMLElement, label: string, order: ManuscriptOrder): void {
        const pill = parent.createDiv({ cls: 'rt-manuscript-pill' });
        pill.createSpan({ text: label });
        this.orderPills.push({ el: pill, order });
        
        if (this.order === order) pill.classList.add('rt-is-active');
        
        pill.onClickEvent(async () => {
            if (pill.hasClass('rt-is-disabled')) return;
            
            this.orderPills.forEach(p => p.el.removeClass('rt-is-active'));
            pill.classList.add('rt-is-active');
            this.order = order;
            await this.loadScenesForOrder();
        });
    }

    private createExportTypePill(parent: HTMLElement, label: string, type: ExportType, disabled = false, isPro = false): void {
        const pill = parent.createDiv({ cls: 'rt-manuscript-pill' });
        if (isPro) pill.classList.add('rt-manuscript-pill-pro');
        pill.createSpan({ text: label });
        if (this.exportType === type) pill.classList.add('rt-is-active');
        if (disabled) pill.classList.add('rt-is-disabled');
        if (disabled && isPro && !this.isPro && !pill.closest('.ert-pro-locked')) {
            pill.classList.add('ert-pro-locked');
        }
        this.exportTypePills.push({ el: pill, type });

        pill.onClickEvent(() => {
            if (disabled) {
                new Notice(t('manuscriptModal.proRequired'));
                return;
            }
            this.exportTypePills.forEach(p => p.el.removeClass('rt-is-active'));
            pill.classList.add('rt-is-active');
            this.exportType = type;
            this.normalizeOutputFormatForOutline();
            this.syncExportUi();
        });
    }

    private createOutputFormatPill(parent: HTMLElement, label: string, format: ExportFormat, disabled = false, scope: ExportType | 'both' = 'both', isPro = false): void {
        const pill = parent.createDiv({ cls: 'rt-manuscript-pill', attr: { 'data-scope': scope } });
        if (isPro) pill.classList.add('rt-manuscript-pill-pro');
        
        // Add icon based on format
        const iconMap: Record<ExportFormat, string> = {
            'markdown': 'file-text',
            'pdf': 'file-text',
            'csv': 'table',
            'json': 'code'
        };
        const iconName = iconMap[format];
        if (iconName) {
            const icon = pill.createSpan({ cls: 'rt-manuscript-pill-icon' });
            setIcon(icon, iconName);
        }
        
        pill.createSpan({ cls: 'rt-manuscript-pill-text', text: label });
        const isActive = this.outputFormat === format;
        if (isActive) pill.classList.add('rt-is-active');
        if (disabled) pill.classList.add('rt-is-disabled');
        if (disabled && isPro && !this.isPro && !pill.closest('.ert-pro-locked')) {
            pill.classList.add('ert-pro-locked');
        }
        this.outputFormatPills.push({ el: pill, format });

        pill.onClickEvent(() => {
            if (disabled) {
                new Notice(t('manuscriptModal.proRequired'));
                return;
            }
            const scopeMatch = scope === 'both' || scope === this.exportType;
            if (!scopeMatch) return;
            this.outputFormatPills
                .filter(p => {
                    const pillScope = p.el.getAttribute('data-scope') as ExportType | 'both' | null;
                    return pillScope === 'both' || pillScope === this.exportType;
                })
                .forEach(p => p.el.removeClass('rt-is-active'));
            pill.classList.add('rt-is-active');
            this.outputFormat = format;
            this.normalizeOutputFormatForOutline();
            this.syncExportUi();
        });
    }

    private normalizeOutputFormatForOutline(): void {
        if (this.exportType !== 'outline') return;
        if (this.outputFormat === 'pdf' || this.outputFormat === 'csv' || this.outputFormat === 'json') {
            this.outputFormat = 'markdown';
        }
    }

    private syncOutputFormatPills(): void {
        this.outputFormatPills.forEach(p => {
            const scope = p.el.getAttribute('data-scope') as ExportType | 'both' | null;
            const scopeMatch = scope === 'both' || scope === this.exportType;
            const shouldHide = p.format === 'pdf' && this.exportType === 'outline';
            p.el.toggleClass('rt-hidden', shouldHide);
            p.el.toggleClass('rt-is-active', scopeMatch && this.outputFormat === p.format);
            if (!scopeMatch) {
                p.el.removeClass('rt-is-active');
            }
        });
    }

    private isPdfManuscriptExport(): boolean {
        return this.exportType === 'manuscript' && this.outputFormat === 'pdf';
    }

    private resolveExportRules(): {
        includeMatterMode: 'user' | 'forced-off';
        tocEnabled: boolean;
        tocDefault: TocMode;
        showSubplotFilter: boolean;
        chronoMessage: string | null;
        lockSceneSelectionToFullBook: boolean;
    } {
        const isNovelManuscript = this.exportType === 'manuscript' && this.manuscriptPreset === 'novel';
        const isPdfManuscript = this.isPdfManuscriptExport();
        const lockSceneSelectionToFullBook = isPdfManuscript;
        const showSubplotFilter = !lockSceneSelectionToFullBook && (this.exportType === 'manuscript'
            ? this.manuscriptPreset === 'novel'
            : this.outlinePreset === 'shooting-schedule');

        return {
            includeMatterMode: isNovelManuscript ? 'user' : 'forced-off',
            tocEnabled: isNovelManuscript && !isPdfManuscript,
            tocDefault: isNovelManuscript && !isPdfManuscript ? 'markdown' : 'none',
            showSubplotFilter,
            chronoMessage: lockSceneSelectionToFullBook || this.hasWhenDates ? null : 'No When dates found.',
            lockSceneSelectionToFullBook
        };
    }

    private syncExportUi(): void {
        this.normalizeOutputFormatForOutline();
        const rules = this.resolveExportRules();
        const shouldLockSelection = rules.lockSceneSelectionToFullBook;
        const showSceneSelectionCards = !shouldLockSelection;

        this.manuscriptOptionsCard?.toggleClass('rt-hidden', this.exportType !== 'manuscript');
        this.outlineOptionsCard?.toggleClass('rt-hidden', this.exportType !== 'outline');
        this.manuscriptRulesCard?.toggleClass('rt-hidden', !(this.exportType === 'manuscript' && this.outputFormat === 'markdown'));
        this.tocCard?.toggleClass('rt-hidden', !rules.tocEnabled || this.exportType !== 'manuscript');
        this.includeMatterCard?.toggleClass('rt-hidden', rules.includeMatterMode !== 'user' || this.exportType !== 'manuscript');
        this.synopsisRow?.toggleClass('rt-hidden', this.exportType !== 'outline');
        this.scopeCard?.toggleClass('rt-hidden', !showSceneSelectionCards);
        this.orderingCard?.toggleClass('rt-hidden', !showSceneSelectionCards);
        this.filterCard?.toggleClass('rt-hidden', !rules.showSubplotFilter);
        this.chronoHelperEl?.toggleClass('rt-hidden', !rules.chronoMessage);

        if (rules.tocDefault !== this.tocMode && !rules.tocEnabled) {
            this.tocMode = rules.tocDefault;
        }

        const shouldDefaultMatterOffForPdf = this.exportType === 'manuscript'
            && this.manuscriptPreset === 'novel'
            && this.outputFormat === 'pdf'
            && !this.hasTouchedMatterToggle;
        if (shouldDefaultMatterOffForPdf) {
            this.includeMatterUserChoice = false;
        }

        if (rules.includeMatterMode === 'forced-off') {
            this.includeMatter = false;
        } else {
            this.includeMatter = this.includeMatterUserChoice;
        }

        this.includeSynopsis = this.exportType === 'outline' ? this.includeSynopsisUserChoice : false;

        let shouldReloadScenes = false;
        if (!rules.showSubplotFilter && this.subplot !== 'All Subplots') {
            this.subplot = 'All Subplots';
            this.subplotDropdown?.setValue('All Subplots');
            shouldReloadScenes = true;
        }
        if (shouldLockSelection && this.order !== 'narrative') {
            this.order = 'narrative';
            shouldReloadScenes = true;
        }
        if (shouldLockSelection) {
            this.rangeStart = 1;
            this.rangeEnd = Math.max(1, this.totalScenes);
            this.updateRangeUI();
        }
        if (shouldReloadScenes) {
            void this.loadScenesForOrder();
        }

        if (this.outputFormat === 'pdf') {
            this.saveMarkdownArtifact = true;
        }
        this.markdownArtifactToggle?.setValue(this.saveMarkdownArtifact);
        this.markdownArtifactToggle?.setDisabled(this.outputFormat === 'pdf');

        this.syncOutputFormatPills();
        this.updateLayoutPicker();
        this.updateTemplateWarning();
        this.updateOrderPillsState();
        this.updateSplitUi();
        this.updateActionButtonLabel();
    }

    /**
     * Render the layout picker in manuscript preset column 2.
     * Visible only for manuscript PDF exports.
     */
    private updateLayoutPicker(): void {
        if (!this.layoutContainerEl) return;
        this.layoutContainerEl.empty();

        const isPdfManuscript = this.exportType === 'manuscript' && this.outputFormat === 'pdf';
        this.manuscriptPresetGridEl?.toggleClass('ert-manuscript-preset-grid--single', !isPdfManuscript);
        this.layoutHeaderEl?.toggleClass('ert-manuscript-preset-col--hidden', !isPdfManuscript);
        this.templateWarningEl?.toggleClass('ert-manuscript-preset-status--hidden', !isPdfManuscript);
        this.layoutContainerEl.toggleClass('ert-manuscript-preset-col--hidden', !isPdfManuscript);
        if (!isPdfManuscript) {
            return;
        }

        const layouts = getLayoutsForPreset(this.plugin, this.manuscriptPreset);
        const activeBook = getActiveBook(this.plugin.settings);
        const lastUsed = (activeBook?.lastUsedPandocLayoutByPreset || {})[this.manuscriptPreset];
        let selectedLayoutName: string | undefined;

        if (layouts.length === 0) {
            // Empty state
            const emptyRow = this.layoutContainerEl.createDiv({ cls: 'rt-manuscript-layout-empty' });
            emptyRow.createSpan({ text: `No layouts for ${this.manuscriptPreset}. ` });
            const link = emptyRow.createEl('a', {
                text: 'Manage layouts\u2026',
                attr: { href: '#', style: 'text-decoration: underline;' }
            });
            link.addEventListener('click', (e) => { // SAFE: direct addEventListener; Modal lifecycle manages cleanup
                e.preventDefault();
                this.close();
                // @ts-ignore - Obsidian API
                this.app.setting.open();
                // @ts-ignore - Obsidian API
                this.app.setting.openTabById('radial-timeline');
            });
            this.selectedLayoutId = undefined;
            selectedLayoutName = undefined;
        } else if (layouts.length === 1) {
            // Single layout — static text
            this.layoutContainerEl.createDiv({
                cls: 'rt-sub-card-note',
                text: layouts[0].name
            });
            this.selectedLayoutId = layouts[0].id;
            selectedLayoutName = layouts[0].name;
        } else {
            // Multiple layouts — dropdown
            const ddContainer = this.layoutContainerEl.createDiv({ cls: 'rt-manuscript-input-container' });
            const dd = new DropdownComponent(ddContainer);
            for (const l of layouts) {
                dd.addOption(l.id, l.name);
            }
            // Default: last-used or first
            const defaultId = lastUsed && layouts.some(l => l.id === lastUsed) ? lastUsed : layouts[0].id;
            dd.setValue(defaultId);
            this.selectedLayoutId = defaultId;
            selectedLayoutName = layouts.find(l => l.id === defaultId)?.name;
            dd.onChange((val) => {
                this.selectedLayoutId = val;
                const selected = layouts.find(l => l.id === val);
                this.renderLayoutDescription(selected?.name);
                this.updateTemplateWarning();
            });
        }

        this.renderLayoutDescription(selectedLayoutName);

    }

    private renderLayoutDescription(layoutName?: string): void {
        if (!this.layoutContainerEl) return;
        this.layoutContainerEl.querySelector('.rt-manuscript-layout-desc')?.remove();
        const desc = this.layoutContainerEl.createDiv({ cls: 'rt-sub-card-note rt-manuscript-layout-desc' });
        if (!layoutName) {
            desc.setText('Choose a PDF layout in Settings → Pro → Export Layouts.');
            return;
        }
        const key = layoutName.toLowerCase();
        if (key.includes('aj finn') || key.includes('ajfinn')) {
            desc.setText('Used for the novel The Woman in the Window by AJ Finn.');
            return;
        }
        if (key.includes('screenplay')) {
            desc.setText('Industry screenplay formatting for print-ready PDF scripts.');
            return;
        }
        if (key.includes('podcast')) {
            desc.setText('Structured podcast script layout for narration-based formats.');
            return;
        }
        if (key.includes('novel')) {
            desc.setText('Traditional novel manuscript layout for print-ready PDF.');
            return;
        }
        desc.setText('Custom LaTeX layout for manuscript PDF rendering.');
    }

    /**
     * Update template validation warning based on current preset and format
     */
    private updateTemplateWarning(): void {
        if (!this.templateWarningEl || this.exportType !== 'manuscript') {
            if (this.templateWarningEl) {
                this.templateWarningEl.empty();
                this.templateWarningEl.addClass('ert-manuscript-preset-status--hidden');
            }
            return;
        }

        this.templateWarningEl.empty();
        this.templateWarningEl.removeClass('rt-warning-error');
        this.templateWarningEl.removeClass('rt-warning-info');

        // Only check templates for PDF format
        if (this.outputFormat === 'markdown') {
            this.templateWarningEl.addClass('ert-manuscript-preset-status--hidden');
            return; // No template needed for markdown
        }
        this.templateWarningEl.removeClass('ert-manuscript-preset-status--hidden');

        // ── Layout-aware validation ──────────────────────────────────
        const layouts = getLayoutsForPreset(this.plugin, this.manuscriptPreset);

        if (layouts.length === 0) {
            // No layouts for this preset — the layout picker already shows the empty state
            return;
        }

        // Find the selected layout
        const selectedLayout = this.selectedLayoutId
            ? layouts.find(l => l.id === this.selectedLayoutId)
            : layouts[0];

        if (!selectedLayout) return;

        const validation = validatePandocLayout(this.plugin, selectedLayout);

        if (!validation.valid) {
            this.templateWarningEl.addClass('rt-warning-error');
            const icon = this.templateWarningEl.createSpan({ cls: 'rt-warning-icon' });
            setIcon(icon, 'alert-triangle');
            const text = this.templateWarningEl.createSpan({ cls: 'rt-warning-text' });
            text.createSpan({ text: validation.error || 'Template file not found.' });
            return;
        }

        // Template exists — show success indicator
        this.templateWarningEl.addClass('rt-warning-info');
        const icon = this.templateWarningEl.createSpan({ cls: 'rt-warning-icon' });
        setIcon(icon, 'check-circle-2');
        const text = this.templateWarningEl.createSpan({ cls: 'rt-warning-text' });
        text.createSpan({ text: `Layout ready: ${selectedLayout.name}` });

        const templatePath = resolveTemplatePath(this.plugin, selectedLayout.path);
        const engineSelection = getAutoPdfEngineSelection(templatePath);
        const engineRow = this.templateWarningEl.createDiv({ cls: 'rt-sub-card-note' });
        const enginePathSuffix = engineSelection.path ? ` (${engineSelection.path})` : '';
        engineRow.setText(`PDF engine (auto): ${engineSelection.engine}${enginePathSuffix}`);
    }

    /**
     * Update manuscript preset description
     */
    private updateManuscriptPresetDescription(): void {
        if (!this.manuscriptPresetDescEl) return;
        const descriptions: Record<ManuscriptPreset, string> = {
            'novel': t('manuscriptModal.presetNovelDesc'),
            'screenplay': t('manuscriptModal.presetScreenplayDesc'),
            'podcast': t('manuscriptModal.presetPodcastDesc')
        };
        this.manuscriptPresetDescEl.textContent = descriptions[this.manuscriptPreset] || '';
    }

    /**
     * Update outline preset description
     */
    private updateOutlinePresetDescription(): void {
        if (!this.outlinePresetDescEl) return;
        const descriptions: Record<OutlinePreset, string> = {
            'beat-sheet': t('manuscriptModal.outlineBeatSheetDesc'),
            'episode-rundown': t('manuscriptModal.outlineEpisodeRundownDesc'),
            'shooting-schedule': t('manuscriptModal.outlineShootingScheduleDesc'),
            'index-cards-csv': t('manuscriptModal.outlineIndexCardsDesc'),
            'index-cards-json': t('manuscriptModal.outlineIndexCardsDesc')
        };
        this.outlinePresetDescEl.textContent = descriptions[this.outlinePreset] || '';
    }

    /**
     * Update manuscript preset preview content
     */
    private updateManuscriptPreview(): void {
        if (!this.manuscriptPreviewPanel) return;
        this.manuscriptPreviewPanel.empty();

        const previewContent = this.manuscriptPreviewPanel.createDiv({ cls: 'rt-manuscript-preview-content' });
        
        const samples: Record<ManuscriptPreset, string> = {
            'novel': `## Scene 1: Opening

The morning sun cast long shadows across the empty street. 
Sarah stood at the window, watching the world wake up.`,
            'screenplay': `INT. SARAH'S APARTMENT - MORNING

The sun streams through dusty windows. Sarah (30s) 
stares out at the city below.

                    SARAH
          Today changes everything.`,
            'podcast': `[COLD OPEN - 0:00-0:30]

HOST: Welcome back to the show. Today we're 
talking about change.

[SEGMENT 1 - 0:30-5:00]

HOST: Let's start with Sarah's story...`
        };

        const sample = samples[this.manuscriptPreset] || '';
        previewContent.createEl('pre', { 
            text: sample,
            cls: 'rt-manuscript-preview-sample'
        });
    }

    /**
     * Update outline preset preview content
     */
    private updateOutlinePreview(): void {
        if (!this.outlinePreviewPanel) return;
        this.outlinePreviewPanel.empty();

        const previewContent = this.outlinePreviewPanel.createDiv({ cls: 'rt-manuscript-preview-content' });
        
        const samples: Record<OutlinePreset, string> = {
            'beat-sheet': `1. Opening Image
2. Theme Stated
3. Setup
4. Catalyst
5. Debate`,
            'episode-rundown': `1. Cold Open · Jan 1 [2:30]
2. Theme Song [0:15]
3. Act One · Jan 1 [8:45]
4. Act Two · Jan 2 [12:20]
5. Closing [1:00]`,
            'shooting-schedule': `Scene | Location      | Time  | Subplot
------|---------------|-------|----------
1     | Apartment     | 2:30  | Main Plot
2     | Street        | 5:15  | Main Plot
3     | Office        | 8:45  | Subplot A`,
            'index-cards-csv': `Scene,Title,When,Runtime,Words,Subplot
1,Opening,2024-01-01,2:30,450,Main Plot
2,Confrontation,2024-01-02,5:15,820,Main Plot`,
            'index-cards-json': `{
  "scenes": [
    {"scene": 1, "title": "Opening", 
     "when": "2024-01-01", "runtime": "2:30"},
    {"scene": 2, "title": "Confrontation",
     "when": "2024-01-02", "runtime": "5:15"}
  ]
}`
        };

        const sample = samples[this.outlinePreset] || '';
        previewContent.createEl('pre', { 
            text: sample,
            cls: 'rt-manuscript-preview-sample'
        });
    }

    private updateOrderPillsState(): void {
        const disableChronological = !this.hasWhenDates;

        this.orderPills.forEach(p => {
            const isChronological = p.order === 'chronological' || p.order === 'reverse-chronological';
            if (isChronological && disableChronological) {
                p.el.addClass('rt-is-disabled');
                p.el.removeClass('rt-is-active');
            } else {
                p.el.removeClass('rt-is-disabled');
            }
            p.el.toggleClass('rt-is-active', this.order === p.order && !(isChronological && disableChronological));
        });

        if (disableChronological && (this.order === 'chronological' || this.order === 'reverse-chronological')) {
            this.order = 'narrative';
            this.orderPills.forEach(p => p.el.toggleClass('rt-is-active', p.order === this.order));
        }
    }

    private clampSplitParts(value: number): number {
        if (!Number.isFinite(value)) return 2;
        return Math.max(2, Math.min(20, Math.floor(value)));
    }

    private getSelectedSceneCount(): number {
        if (this.totalScenes === 0) return 0;
        return Math.max(0, this.rangeEnd - this.rangeStart + 1);
    }

    private getSelectedSceneTitles(): string[] {
        if (this.totalScenes === 0 || this.sceneTitles.length === 0) return [];
        const startIndex = Math.max(0, this.rangeStart - 1);
        const endIndexExclusive = Math.min(this.rangeEnd, this.sceneTitles.length);
        if (endIndexExclusive <= startIndex) return [];
        return this.sceneTitles.slice(startIndex, endIndexExclusive);
    }

    private isSplitEnabled(): boolean {
        return this.splitMode === 'parts';
    }

    private isSplitSelectionValid(): boolean {
        if (!this.isSplitEnabled()) return true;
        const selectedCount = this.getSelectedSceneCount();
        return selectedCount >= this.splitParts;
    }

    private getPlannedOutputCount(): number {
        return this.isSplitEnabled() ? this.splitParts : 1;
    }

    private updateActionButtonDisabledState(): void {
        if (!this.actionButton || this.exportCompleted) return;
        const splitInvalid = !this.isSplitSelectionValid();
        this.actionButton.setDisabled(this.totalScenes === 0 || splitInvalid);
    }

    private updateSplitUi(): void {
        const selectedCount = this.getSelectedSceneCount();
        const canSplit = selectedCount >= 2;

        if (!canSplit && this.splitMode === 'parts') {
            this.splitMode = 'single';
        }

        if (this.splitSingleInputEl) this.splitSingleInputEl.checked = this.splitMode === 'single';
        if (this.splitPartsRadioInputEl) {
            this.splitPartsRadioInputEl.checked = this.splitMode === 'parts';
            this.splitPartsRadioInputEl.disabled = !canSplit;
        }
        if (this.splitPartsInputEl) {
            this.splitPartsInputEl.disabled = !canSplit;
        }

        const partsEnabled = this.splitMode === 'parts';
        this.splitPartsContainerEl?.toggleClass('rt-hidden', !partsEnabled);
        this.splitHelperEl?.toggleClass('rt-hidden', !partsEnabled);

        const splitInvalid = partsEnabled && !this.isSplitSelectionValid();
        if (this.splitErrorEl) {
            if (splitInvalid) {
                this.splitErrorEl.setText(`Not enough scenes selected to split into ${this.splitParts} parts.`);
                this.splitErrorEl.removeClass('rt-hidden');
            } else {
                this.splitErrorEl.addClass('rt-hidden');
            }
        }

        if (this.splitPreviewEl) {
            this.splitPreviewEl.empty();
            if (partsEnabled && !splitInvalid) {
                const items = Array.from({ length: selectedCount }, (_unused, index) => index + 1);
                const preview = chunkScenesIntoParts(items, this.splitParts);
                this.splitPreviewEl.createDiv({ text: `Will generate ${this.splitParts} files:` });
                preview.ranges.forEach(range => {
                    this.splitPreviewEl?.createDiv({
                        cls: 'rt-sub-card-note',
                        text: `Part ${range.part} (Scenes ${range.start}–${range.end})`
                    });
                });
            }
        }

        this.updateActionButtonDisabledState();
    }

    private getPrimaryActionLabel(): string {
        if (this.exportCompleted) return 'Done';
        const base = this.outputFormat === 'pdf' ? 'Render PDF' : 'Generate Markdown';
        const files = this.getPlannedOutputCount();
        return files > 1 ? `${base} (${files} files)` : base;
    }

    private getOpenFolderButtonLabel(): string {
        if (Platform?.isMacOS) return 'Reveal in Finder';
        if (Platform?.isWin) return 'Open in Explorer';
        if (Platform?.isLinux) return 'Open folder';

        const fallback = typeof process !== 'undefined' ? process.platform : '';
        if (fallback === 'darwin') return 'Reveal in Finder';
        if (fallback === 'win32') return 'Open in Explorer';
        return 'Open folder';
    }

    private updateActionButtonLabel(): void {
        this.actionButton?.setButtonText(this.getPrimaryActionLabel());
    }

    private renderStatusPathGroup(label: 'Saved' | 'Rendered', paths: string[]): void {
        if (!this.outputStatusEl || paths.length === 0) return;

        const summary = this.outputStatusEl.createDiv();
        summary.createSpan({ text: `${label}: ` });
        const firstLink = summary.createEl('a', { text: paths[0], attr: { href: '#' } });
        firstLink.addEventListener('click', (evt) => {
            evt.preventDefault();
            void this.openVaultPath(paths[0]);
        });
        if (paths.length > 1) {
            summary.createSpan({ text: ` (${paths.length} files)` });
        }

        if (paths.length > 1) {
            const second = this.outputStatusEl.createDiv({ cls: 'rt-sub-card-note' });
            const secondLink = second.createEl('a', { text: paths[1], attr: { href: '#' } });
            secondLink.addEventListener('click', (evt) => {
                evt.preventDefault();
                void this.openVaultPath(paths[1]);
            });
        }

        if (paths.length > 2) {
            this.outputStatusEl.createDiv({ cls: 'rt-sub-card-note', text: `+${paths.length - 2} more` });
        }
    }

    private showOutputStatus(outcome: ManuscriptExportOutcome): void {
        if (!this.outputStatusEl) return;
        this.outputStatusEl.empty();
        const savedPaths = outcome.savedPaths && outcome.savedPaths.length > 0
            ? outcome.savedPaths
            : outcome.savedPath ? [outcome.savedPath] : [];
        const renderedPaths = outcome.renderedPaths && outcome.renderedPaths.length > 0
            ? outcome.renderedPaths
            : outcome.renderedPath ? [outcome.renderedPath] : [];

        this.renderStatusPathGroup('Saved', savedPaths);
        this.renderStatusPathGroup('Rendered', renderedPaths);
        if (outcome.messages && outcome.messages.length > 0) {
            outcome.messages.forEach(message => {
                this.outputStatusEl?.createDiv({ text: message });
            });
        }
        this.outputStatusEl.toggleClass('rt-hidden', savedPaths.length === 0 && renderedPaths.length === 0 && !(outcome.messages && outcome.messages.length > 0));
    }

    private async openVaultPath(vaultPath: string): Promise<void> {
        const abstract = this.app.vault.getAbstractFileByPath(vaultPath);
        if (abstract instanceof TFile) {
            const leaf = this.app.workspace.getLeaf(true);
            await leaf.openFile(abstract);
            return;
        }
        new Notice(`Unable to open: ${vaultPath}`);
    }

    private getOutcomeFolderPath(): string | null {
        if (this.lastOutcome?.outputFolder) {
            return this.lastOutcome.outputFolder;
        }
        const path = this.lastOutcome?.renderedPaths?.[0]
            || this.lastOutcome?.savedPaths?.[0]
            || this.lastOutcome?.renderedPath
            || this.lastOutcome?.savedPath;
        if (!path) return null;
        const idx = path.lastIndexOf('/');
        if (idx <= 0) return null;
        return path.slice(0, idx);
    }

    private revealInFileExplorer(target: TAbstractFile): boolean {
        const explorerLeaf = this.app.workspace.getLeavesOfType('file-explorer')[0];
        if (!explorerLeaf) return false;

        const explorerView = explorerLeaf.view as unknown as { revealInFolder?: (node: TAbstractFile) => void };
        if (!explorerView.revealInFolder) return false;

        explorerView.revealInFolder(target);
        this.app.workspace.revealLeaf(explorerLeaf);
        return true;
    }

    private openOutcomeFolder(): void {
        const folderPath = this.getOutcomeFolderPath();
        if (!folderPath) {
            new Notice('No output folder to reveal yet.');
            return;
        }
        const abstract = this.app.vault.getAbstractFileByPath(folderPath);
        if (!abstract) {
            new Notice(`Folder not found: ${folderPath}`);
            return;
        }
        if (!this.revealInFileExplorer(abstract)) {
            new Notice('Unable to reveal folder in file explorer.');
        }
    }

    private registerPointerEvents(): void {
        if (!this.trackEl || !this.startHandleEl || !this.endHandleEl) return;

        const onPointerMove = (evt: PointerEvent) => {
            if (!this.trackEl || !this.activeHandle || this.totalScenes === 0) return;
            const rect = this.trackEl.getBoundingClientRect();
            let ratio = (evt.clientX - rect.left) / rect.width;
            ratio = Math.min(Math.max(ratio, 0), 1);
            const position = this.ratioToIndex(ratio);
            this.updateRangeFromDrag(this.activeHandle, position);
        };

        const onPointerUp = () => {
            this.activeHandle = null;
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
        };

        const attach = (handle: HTMLElement, handleType: DragHandle) => {
            handle.onpointerdown = (evt: PointerEvent) => {
                const effectiveHandle = handleType;
                this.activeHandle = effectiveHandle;
                window.addEventListener('pointermove', onPointerMove);
                window.addEventListener('pointerup', onPointerUp, { once: true });
                evt.preventDefault();
                evt.stopPropagation(); // Prevent track from also receiving this event
            };
        };

        attach(this.startHandleEl, 'start');
        attach(this.endHandleEl, 'end');

        this.trackEl.onpointerdown = (evt: PointerEvent) => {
            const rect = this.trackEl!.getBoundingClientRect();
            let ratio = (evt.clientX - rect.left) / rect.width;
            ratio = Math.min(Math.max(ratio, 0), 1);
            const position = this.ratioToIndex(ratio);
            const distStart = Math.abs(position - this.rangeStart);
            const distEnd = Math.abs(position - this.rangeEnd);
            const target: DragHandle = distStart <= distEnd ? 'start' : 'end';
            this.updateRangeFromDrag(target, position);
        };

        this.detachEvents = () => {
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
        };
    }

    private detachPointerEvents(): void {
        if (this.detachEvents) {
            this.detachEvents();
            this.detachEvents = undefined;
        }
    }

    // Data loading -----------------------------------------------------------
    private async loadSubplots(): Promise<void> {
        if (!this.subplotDropdown) return;
        
        try {
            const scenes = await this.plugin.getSceneData();
            const subplotCounts = new Map<string, number>();
            
            scenes.forEach(scene => {
                if (scene.itemType !== 'Scene') return;
                const sub = scene.subplot && scene.subplot.trim() ? scene.subplot : 'Main Plot';
                subplotCounts.set(sub, (subplotCounts.get(sub) || 0) + 1);
            });

            const sortedSubplots = Array.from(subplotCounts.keys()).sort((a, b) => {
                if (a === 'Main Plot') return -1;
                if (b === 'Main Plot') return 1;
                const countA = subplotCounts.get(a) || 0;
                const countB = subplotCounts.get(b) || 0;
                if (countA !== countB) return countB - countA; // Descending count
                return a.localeCompare(b);
            });

            this.subplotDropdown.selectEl.textContent = '';
            this.subplotDropdown.addOption('All Subplots', 'All Subplots');
            sortedSubplots.forEach(sub => {
                this.subplotDropdown?.addOption(sub, sub);
            });
            this.subplotDropdown.setValue('All Subplots');
        } catch (e) {
            console.error('Failed to load subplots', e);
        }
    }

    private async loadScenesForOrder(): Promise<void> {
        try {
            const isPdfManuscript = this.isPdfManuscriptExport();
            const effectiveOrder: ManuscriptOrder = isPdfManuscript ? 'narrative' : this.order;
            const effectiveSubplot = isPdfManuscript || this.subplot === 'All Subplots' ? undefined : this.subplot;
            const { titles, whenDates, sceneNumbers } = await getSceneFilesByOrder(this.app, this.plugin, effectiveOrder, effectiveSubplot);
            this.sceneTitles = titles;
            this.sceneWhenDates = whenDates;
            this.sceneNumbers = sceneNumbers;
            this.totalScenes = titles.length;
            this.rangeStart = 1;
            this.rangeEnd = Math.max(1, this.totalScenes);
            this.hasWhenDates = whenDates.some((value) => !!value);

            const meta = [`${this.totalScenes} scenes available`];
            if (!isPdfManuscript && this.subplot !== 'All Subplots') {
                meta.push(`Filtered by: ${this.subplot}`);
            } else {
                meta.push(t('manuscriptModal.heroNarrativeMeta'));
            }
            this.renderHeroMeta(meta);

            this.loadingEl?.remove();
            this.updateRangeUI();
            this.syncRangeAvailability();
            this.updateOrderPillsState();
            this.syncExportUi();
        } catch (err) {
            console.error(err);
            this.loadingEl?.setText(t('manuscriptModal.loadError'));
            this.renderHeroMeta([t('manuscriptModal.loadError')]);
        }
    }

    // Range rendering -------------------------------------------------------
    private ratioToIndex(ratio: number): number {
        if (this.totalScenes <= 1) return 1;
        const raw = Math.round(ratio * (this.totalScenes - 1)) + 1;
        return Math.min(Math.max(raw, 1), this.totalScenes);
    }

    private updateRangeFromDrag(handle: DragHandle, position: number): void {
        if (handle === 'start') {
            this.rangeStart = Math.min(position, this.rangeEnd);
        } else if (handle === 'end') {
            this.rangeEnd = Math.max(position, this.rangeStart);
        }
        this.updateRangeUI();
    }

    private isChronologicalOrder(): boolean {
        return this.order === 'chronological' || this.order === 'reverse-chronological';
    }

    private getSceneNumberAt(position: number): number {
        // Convert 1-based position to 0-based index and get scene number
        const index = Math.max(0, Math.min(position - 1, this.sceneNumbers.length - 1));
        return this.sceneNumbers[index] ?? position;
    }

    private syncRangeAvailability(): void {
        const count = this.getSelectedSceneCount();
        this.rangeStatusEl?.setText(`${count} scenes selected`);
        const hasDecimalScenes = this.getSelectedSceneTitles().some((title) => /^\d+\.\d+\s+/.test((title || '').trim()));
        if (this.rangeDecimalWarningEl) {
            this.rangeDecimalWarningEl.toggleClass('rt-hidden', !hasDecimalScenes);
        }
    }

    private updateRangeUI(): void {
        if (!this.trackEl || !this.startHandleEl || !this.endHandleEl || !this.rangeFillEl) return;
        if (this.totalScenes === 0) return;

        const startPercent = this.totalScenes === 1 ? 0 : ((this.rangeStart - 1) / (this.totalScenes - 1)) * 100;
        const endPercent = this.totalScenes === 1 ? 100 : ((this.rangeEnd - 1) / (this.totalScenes - 1)) * 100;

        this.startHandleEl.style.left = `${startPercent}%`;
        this.endHandleEl.style.left = `${endPercent}%`;
        this.rangeFillEl.style.left = `${startPercent}%`;
        this.rangeFillEl.style.width = `${Math.max(endPercent - startPercent, 1)}%`; // SAFE: inline style used for live drag track sizing

        this.renderRangeCards();
        this.syncRangeAvailability();
        this.updateSplitUi();
    }

    private formatCardTitle(index: number): string {
        const title = this.sceneTitles[index] ?? '—';
        if (this.isChronologicalOrder()) {
            const whenDate = this.sceneWhenDates[index];
            return whenDate ? `${title} · ${whenDate}` : title;
        }
        return title;
    }

    private renderRangeCards(): void {
        if (!this.rangeCardContainer) return;
        this.rangeCardContainer.empty();
        if (this.totalScenes === 0) return;

        // Get actual scene numbers for range display
        const startSceneNum = this.getSceneNumberAt(this.rangeStart);
        const endSceneNum = this.getSceneNumberAt(this.rangeEnd);
        const displayStart = startSceneNum;
        const displayEnd = endSceneNum;

        const firstCard = this.rangeCardContainer.createDiv({ cls: 'rt-manuscript-range-card' });
        firstCard.toggleClass('rt-is-muted', this.rangeStart > 1);
        firstCard.createDiv({ cls: 'rt-manuscript-range-label', text: t('manuscriptModal.rangeFirst') });
        firstCard.createDiv({ cls: 'rt-manuscript-range-title', text: this.formatCardTitle(0) });

        const selectedCard = this.rangeCardContainer.createDiv({ cls: 'rt-manuscript-range-card rt-manuscript-range-card-active' });
        const isFullRange = this.rangeStart === 1 && this.rangeEnd === this.totalScenes;
        selectedCard.toggleClass('rt-is-muted', isFullRange);
        const rangeLabel = isFullRange
            ? t('manuscriptModal.rangeAllLabel')
            : t('manuscriptModal.rangeSelectedLabel', { start: displayStart, end: displayEnd });
        selectedCard.createDiv({ cls: 'rt-manuscript-range-label', text: rangeLabel });
        const middleTitle = this.rangeStart === this.rangeEnd
            ? this.formatCardTitle(this.rangeStart - 1)
            : t('manuscriptModal.rangeCountLabel', { count: this.rangeEnd - this.rangeStart + 1 });
        selectedCard.createDiv({ cls: 'rt-manuscript-range-title', text: middleTitle });

        const lastCard = this.rangeCardContainer.createDiv({ cls: 'rt-manuscript-range-card' });
        lastCard.toggleClass('rt-is-muted', this.rangeEnd < this.totalScenes);
        lastCard.createDiv({ cls: 'rt-manuscript-range-label', text: t('manuscriptModal.rangeLast') });
        lastCard.createDiv({ cls: 'rt-manuscript-range-title', text: this.formatCardTitle(this.totalScenes - 1) });
    }

    // Submission -------------------------------------------------------------
    private async submit(): Promise<void> {
        if (this.totalScenes === 0) {
            new Notice(t('manuscriptModal.emptyNotice'));
            return;
        }
        if (!this.isSplitSelectionValid()) {
            new Notice(`Not enough scenes selected to split into ${this.splitParts} parts.`);
            this.updateActionButtonDisabledState();
            return;
        }
        const rules = this.resolveExportRules();
        const tocMode: TocMode = rules.tocEnabled ? this.tocMode : rules.tocDefault;
        const includeMatter = rules.includeMatterMode === 'user' ? this.includeMatterUserChoice : false;
        const includeSynopsis = this.exportType === 'outline' ? this.includeSynopsisUserChoice : false;
        const lockSceneSelection = this.isPdfManuscriptExport();
        const submissionOrder: ManuscriptOrder = lockSceneSelection ? 'narrative' : this.order;
        const submissionRangeStart = lockSceneSelection ? undefined : this.rangeStart;
        const submissionRangeEnd = lockSceneSelection ? undefined : this.rangeEnd;
        const submissionSubplot = lockSceneSelection
            ? undefined
            : this.subplot === 'All Subplots'
                ? undefined
                : this.subplot;

        this.outputStatusEl?.addClass('rt-hidden');
        this.exportCompleted = false;
        this.lastOutcome = null;
        this.openFolderButton?.buttonEl.addClass('rt-hidden');
        this.cancelButton?.buttonEl.removeClass('rt-hidden');
        this.actionButton?.setDisabled(true);
        this.updateActionButtonLabel();

        try {
            const outcome = await this.onSubmit({
                order: submissionOrder,
                tocMode,
                rangeStart: submissionRangeStart,
                rangeEnd: submissionRangeEnd,
                subplot: submissionSubplot,
                exportType: this.exportType,
                manuscriptPreset: this.manuscriptPreset,
                outlinePreset: this.outlinePreset,
                outputFormat: this.outputFormat,
                updateWordCounts: this.updateWordCounts,
                includeSynopsis,
                includeMatter,
                saveMarkdownArtifact: this.outputFormat === 'pdf' ? true : this.saveMarkdownArtifact,
                selectedLayoutId: this.selectedLayoutId,
                splitMode: this.splitMode,
                splitParts: this.isSplitEnabled() ? this.splitParts : 1
            });
            const hasOutcome = Boolean(
                outcome.savedPath
                || outcome.renderedPath
                || (outcome.savedPaths && outcome.savedPaths.length > 0)
                || (outcome.renderedPaths && outcome.renderedPaths.length > 0)
            );
            if (!hasOutcome) {
                this.exportCompleted = false;
                this.lastOutcome = null;
                this.updateActionButtonDisabledState();
                this.updateActionButtonLabel();
                return;
            }
            this.exportCompleted = true;
            this.lastOutcome = outcome;
            this.showOutputStatus(outcome);
            this.actionButton?.setDisabled(false);
            this.openFolderButton?.buttonEl.toggleClass('rt-hidden', !this.getOutcomeFolderPath());
            this.cancelButton?.buttonEl.addClass('rt-hidden');
            this.updateActionButtonLabel();
        } catch (err) {
            console.error(err);
            new Notice(t('manuscriptModal.loadError'));
            this.exportCompleted = false;
            this.updateActionButtonDisabledState();
            this.updateActionButtonLabel();
        }
    }
}
