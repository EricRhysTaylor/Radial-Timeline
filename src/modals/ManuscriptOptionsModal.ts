/*
 * Manuscript Options Modal
 */
import { App, ButtonComponent, DropdownComponent, Modal, Notice, setIcon, ToggleComponent } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { getSceneFilesByOrder, ManuscriptOrder, TocMode } from '../utils/manuscript';
import { t } from '../i18n';
import { ExportFormat, ExportType, ManuscriptPreset, OutlinePreset, presetRequiresTemplate, validateTemplateForPreset, getLayoutsForPreset, validatePandocLayout } from '../utils/exportFormats';
import { isProfessionalActive } from '../settings/sections/ProfessionalSection';
import type { PandocLayoutTemplate } from '../types';
import { getActiveBook, getActiveBookTitle, DEFAULT_BOOK_TITLE } from '../utils/books';

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
    selectedLayoutId?: string;
}

type DragHandle = 'start' | 'end' | null;

export class ManuscriptOptionsModal extends Modal {
    private readonly plugin: RadialTimelinePlugin;
    private readonly onSubmit: (result: ManuscriptModalResult) => Promise<void>;

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
    private rangeCardContainer?: HTMLElement;
    private loadingEl?: HTMLElement;
    private actionButton?: ButtonComponent;
    private subplotDropdown?: DropdownComponent;
    private orderPills: { el: HTMLElement, order: ManuscriptOrder }[] = [];
    private exportTypePills: { el: HTMLElement, type: ExportType }[] = [];
    private outputFormatPills: { el: HTMLElement, format: ExportFormat }[] = [];
    private manuscriptPresetDropdown?: DropdownComponent;
    private outlinePresetDropdown?: DropdownComponent;
    private tocCard?: HTMLElement;
    private manuscriptOptionsCard?: HTMLElement;
    private outlineOptionsCard?: HTMLElement;
    private wordCountCard?: HTMLElement;
    private templateWarningEl?: HTMLElement;
    private layoutContainerEl?: HTMLElement;
    private selectedLayoutId?: string;
    private manuscriptPresetDescEl?: HTMLElement;
    private outlinePresetDescEl?: HTMLElement;
    private manuscriptPreviewToggle?: HTMLElement;
    private manuscriptPreviewPanel?: HTMLElement;
    private manuscriptPreviewIcon?: HTMLElement;
    private outlinePreviewToggle?: HTMLElement;
    private outlinePreviewPanel?: HTMLElement;
    private outlinePreviewIcon?: HTMLElement;
    private manuscriptPreviewExpanded: boolean = false;
    private outlinePreviewExpanded: boolean = false;

    private activeHandle: DragHandle = null;
    private detachEvents?: () => void;

    constructor(
        app: App,
        plugin: RadialTimelinePlugin,
        onSubmit: (result: ManuscriptModalResult) => Promise<void>
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
        
        // Pro badge with signature icon (only when Pro is active)
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
        manageBooksLink.addEventListener('click', (e) => { // SAFE: direct addEventListener; Modal lifecycle manages cleanup
            e.preventDefault();
            this.close();
            // @ts-ignore - Obsidian API
            this.app.setting.open();
            // @ts-ignore - Obsidian API
            this.app.setting.openTabById('radial-timeline');
        });
        this.heroMetaEl = hero.createDiv({ cls: 'ert-modal-meta' });
        this.renderHeroMeta([t('manuscriptModal.heroLoading')]);

        // ═══════════════════════════════════════════════════════════════════
        // SCENE ORDERING
        // ═══════════════════════════════════════════════════════════════════
        const orderCard = container.createDiv({ cls: 'rt-glass-card rt-sub-card' });
        this.createSectionHeading(orderCard, t('manuscriptModal.orderHeading'), 'arrow-down-up');
        const orderRow = orderCard.createDiv({ cls: 'rt-manuscript-pill-row' });
        this.createOrderPill(orderRow, t('manuscriptModal.orderNarrative'), 'narrative');
        this.createOrderPill(orderRow, t('manuscriptModal.orderReverseNarrative'), 'reverse-narrative');
        this.createOrderPill(orderRow, t('manuscriptModal.orderChronological'), 'chronological');
        this.createOrderPill(orderRow, t('manuscriptModal.orderReverseChronological'), 'reverse-chronological');
        orderCard.createDiv({
            cls: 'rt-sub-card-note',
            text: t('manuscriptModal.orderNote')
        });

        // ═══════════════════════════════════════════════════════════════════
        // SUBPLOT FILTER
        // ═══════════════════════════════════════════════════════════════════
        const filterCard = container.createDiv({ cls: 'rt-glass-card rt-sub-card' });
        this.createSectionHeading(filterCard, 'Subplot filter', 'filter');
        const filterContainer = filterCard.createDiv({ cls: 'rt-manuscript-input-container' });
        this.subplotDropdown = new DropdownComponent(filterContainer)
            .addOption('All Subplots', 'All Subplots')
            .setValue('All Subplots')
            .onChange(async (value) => {
                this.subplot = value;
                if (value !== 'All Subplots') {
                    // Force non-reverse order when specific subplot is selected
                    if (this.isReverseOrder()) {
                        this.order = 'narrative';
                    }
                }
                this.updateOrderPillsState();
                await this.loadScenesForOrder();
            });

        // ═══════════════════════════════════════════════════════════════════
        // SCENE RANGE SELECTOR
        // ═══════════════════════════════════════════════════════════════════
        const rangeCard = container.createDiv({ cls: 'rt-glass-card rt-sub-card' });
        this.createSectionHeading(rangeCard, t('manuscriptModal.rangeHeading'), 'sliders-horizontal');
        this.rangeStatusEl = rangeCard.createDiv({ cls: 'rt-manuscript-range-status', text: t('manuscriptModal.rangeLoading') });

        const rangeShell = rangeCard.createDiv({ cls: 'rt-manuscript-range-shell' });
        this.rangeCardContainer = rangeShell.createDiv({ cls: 'rt-manuscript-range-cards' });

        const trackWrap = rangeShell.createDiv({ cls: 'rt-manuscript-range-track-wrap' });
        this.trackEl = trackWrap.createDiv({ cls: 'rt-manuscript-range-track' });
        this.rangeFillEl = this.trackEl.createDiv({ cls: 'rt-manuscript-range-fill' });
        this.startHandleEl = this.trackEl.createDiv({ cls: 'rt-manuscript-range-handle', attr: { 'data-handle': 'start', 'aria-label': 'Start of range' } });
        this.endHandleEl = this.trackEl.createDiv({ cls: 'rt-manuscript-range-handle', attr: { 'data-handle': 'end', 'aria-label': 'End of range' } });

        this.registerPointerEvents();

        this.loadingEl = rangeCard.createDiv({ cls: 'rt-manuscript-loading', text: t('manuscriptModal.rangeLoading') });

        // ═══════════════════════════════════════════════════════════════════
        // EXPORT TYPE (Manuscript vs Outline)
        // ═══════════════════════════════════════════════════════════════════
        const exportCard = container.createDiv({ cls: 'rt-glass-card rt-sub-card' });
        this.createSectionHeading(exportCard, t('manuscriptModal.exportHeading'), 'file-output');
        const exportRow = exportCard.createDiv({ cls: 'rt-manuscript-pill-row' });
        this.createExportTypePill(exportRow, t('manuscriptModal.exportTypeManuscript'), 'manuscript');
        this.createExportTypePill(exportRow, t('manuscriptModal.exportTypeOutline'), 'outline', !this.isPro, true);

        // ═══════════════════════════════════════════════════════════════════
        // MANUSCRIPT PRESET + FORMAT (Core feature)
        // ═══════════════════════════════════════════════════════════════════
        this.manuscriptOptionsCard = container.createDiv({ cls: 'rt-glass-card rt-sub-card' });
        this.createSectionHeading(this.manuscriptOptionsCard, t('manuscriptModal.manuscriptPresetHeading'), 'book-open');
        const presetRow = this.manuscriptOptionsCard.createDiv({ cls: 'rt-manuscript-input-container' });
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
                this.updateLayoutPicker();
                this.updateTemplateWarning();
                this.updateManuscriptPresetDescription();
                this.updateManuscriptPreview();
            });
        // Style Pro options in dropdown
        this.styleDropdownProOptions(this.manuscriptPresetDropdown, ['screenplay', 'podcast']);

        // Description for manuscript preset
        this.manuscriptPresetDescEl = this.manuscriptOptionsCard.createDiv({ cls: 'rt-sub-card-note' });
        this.updateManuscriptPresetDescription();

        // Preview toggle for manuscript preset
        this.manuscriptPreviewToggle = this.manuscriptOptionsCard.createDiv({ cls: 'rt-manuscript-preview-toggle' });
        this.manuscriptPreviewToggle.createSpan({ text: 'Preview', cls: 'rt-manuscript-preview-toggle-text' });
        this.manuscriptPreviewIcon = this.manuscriptPreviewToggle.createSpan({ cls: 'rt-manuscript-preview-toggle-icon' });
        setIcon(this.manuscriptPreviewIcon, 'chevron-right');
        this.manuscriptPreviewToggle.onClickEvent(() => {
            this.manuscriptPreviewExpanded = !this.manuscriptPreviewExpanded;
            if (this.manuscriptPreviewPanel) {
                this.manuscriptPreviewPanel.toggleClass('rt-hidden', !this.manuscriptPreviewExpanded);
                setIcon(this.manuscriptPreviewIcon!, this.manuscriptPreviewExpanded ? 'chevron-down' : 'chevron-right');
            }
        });

        // Preview panel for manuscript preset
        this.manuscriptPreviewPanel = this.manuscriptOptionsCard.createDiv({ cls: 'rt-manuscript-preview-panel rt-hidden' });
        this.updateManuscriptPreview();

        const formatRow = this.manuscriptOptionsCard.createDiv({ cls: 'rt-manuscript-pill-row' });
        this.createOutputFormatPill(formatRow, t('manuscriptModal.formatMarkdown'), 'markdown');
        this.createOutputFormatPill(formatRow, t('manuscriptModal.formatDocx'), 'docx', !this.isPro, 'both', true);
        this.createOutputFormatPill(formatRow, t('manuscriptModal.formatPdf'), 'pdf', !this.isPro, 'both', true);

        // Layout picker (visible only for PDF/DOCX)
        this.layoutContainerEl = this.manuscriptOptionsCard.createDiv({ cls: 'rt-manuscript-layout-picker' });
        this.updateLayoutPicker();

        // Template validation warning
        this.templateWarningEl = this.manuscriptOptionsCard.createDiv({ cls: 'rt-manuscript-template-warning' });
        this.updateTemplateWarning();

        // ═══════════════════════════════════════════════════════════════════
        // OUTLINE PRESETS (Pro feature - entire card)
        // ═══════════════════════════════════════════════════════════════════
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
            .addOption('index-cards-csv', t('manuscriptModal.outlineIndexCardsCsv'))
            .addOption('index-cards-json', t('manuscriptModal.outlineIndexCardsJson'))
            .setValue(this.outlinePreset)
            .onChange((value) => {
                const preset = value as OutlinePreset;
                if (!this.isPro && (preset === 'index-cards-csv' || preset === 'index-cards-json')) {
                    new Notice(t('manuscriptModal.proRequired'));
                    this.outlinePresetDropdown?.setValue(this.outlinePreset);
                    return;
                }
                this.outlinePreset = preset;
                this.normalizeOutputFormatForOutline();
                this.syncOutputFormatPills();
                this.updateOutlinePresetDescription();
                this.updateOutlinePreview();
            });
        // Style Pro options in dropdown
        this.styleDropdownProOptions(this.outlinePresetDropdown, ['index-cards-csv', 'index-cards-json']);

        // Description for outline preset
        this.outlinePresetDescEl = this.outlineOptionsCard.createDiv({ cls: 'rt-sub-card-note' });
        this.updateOutlinePresetDescription();

        // Preview toggle for outline preset
        this.outlinePreviewToggle = this.outlineOptionsCard.createDiv({ cls: 'rt-manuscript-preview-toggle' });
        this.outlinePreviewToggle.createSpan({ text: 'Preview', cls: 'rt-manuscript-preview-toggle-text' });
        this.outlinePreviewIcon = this.outlinePreviewToggle.createSpan({ cls: 'rt-manuscript-preview-toggle-icon' });
        setIcon(this.outlinePreviewIcon, 'chevron-right');
        this.outlinePreviewToggle.onClickEvent(() => {
            this.outlinePreviewExpanded = !this.outlinePreviewExpanded;
            if (this.outlinePreviewPanel) {
                this.outlinePreviewPanel.toggleClass('rt-hidden', !this.outlinePreviewExpanded);
                setIcon(this.outlinePreviewIcon!, this.outlinePreviewExpanded ? 'chevron-down' : 'chevron-right');
            }
        });

        // Preview panel for outline preset
        this.outlinePreviewPanel = this.outlineOptionsCard.createDiv({ cls: 'rt-manuscript-preview-panel rt-hidden' });
        this.updateOutlinePreview();

        const outlineFormatRow = this.outlineOptionsCard.createDiv({ cls: 'rt-manuscript-pill-row' });
        this.createOutputFormatPill(outlineFormatRow, t('manuscriptModal.formatMarkdown'), 'markdown', false, 'outline');
        this.createOutputFormatPill(outlineFormatRow, t('manuscriptModal.formatCsv'), 'csv', !this.isPro, 'outline', true);
        this.createOutputFormatPill(outlineFormatRow, t('manuscriptModal.formatJson'), 'json', !this.isPro, 'outline', true);

        // Synopsis toggle for outlines
        const synopsisRow = this.outlineOptionsCard.createDiv({ cls: 'rt-manuscript-toggle-row' });
        synopsisRow.createSpan({ cls: 'rt-manuscript-toggle-label', text: t('manuscriptModal.includeSynopsis') });
        new ToggleComponent(synopsisRow)
            .setValue(this.includeSynopsis)
            .onChange((value) => {
                this.includeSynopsis = value;
            });
        this.outlineOptionsCard.createDiv({
            cls: 'rt-sub-card-note',
            text: t('manuscriptModal.includeSynopsisNote')
        });

        // ═══════════════════════════════════════════════════════════════════
        // TABLE OF CONTENTS
        // ═══════════════════════════════════════════════════════════════════
        this.tocCard = container.createDiv({ cls: 'rt-glass-card rt-sub-card' });
        this.createSectionHeading(this.tocCard, t('manuscriptModal.tocHeading'), 'list-ordered');
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

        // ═══════════════════════════════════════════════════════════════════
        // WORD COUNT UPDATE
        // ═══════════════════════════════════════════════════════════════════
        this.wordCountCard = container.createDiv({ cls: 'rt-glass-card rt-sub-card' });
        this.createSectionHeading(this.wordCountCard, t('manuscriptModal.wordCountHeading'), 'hash');
        const wordCountRow = this.wordCountCard.createDiv({ cls: 'rt-manuscript-toggle-row' });
        wordCountRow.createSpan({ cls: 'rt-manuscript-toggle-label', text: t('manuscriptModal.wordCountToggle') });
        new ToggleComponent(wordCountRow)
            .setValue(this.updateWordCounts)
            .onChange((value) => {
                this.updateWordCounts = value;
            });
        this.wordCountCard.createDiv({
            cls: 'rt-sub-card-note',
            text: t('manuscriptModal.wordCountNote')
        });

        // ═══════════════════════════════════════════════════════════════════
        // ACTIONS
        // ═══════════════════════════════════════════════════════════════════
        const actions = container.createDiv({ cls: 'ert-modal-actions' });
        this.actionButton = new ButtonComponent(actions)
            .setButtonText(t('manuscriptModal.actionCreate'))
            .setCta()
            .onClick(() => this.submit());

        new ButtonComponent(actions)
            .setButtonText(t('manuscriptModal.actionCancel'))
            .onClick(() => this.close());

        this.syncExportUi();
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
            'docx': 'file-type',
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
            this.updateLayoutPicker();
            this.updateTemplateWarning();
        });
    }

    private normalizeOutputFormatForOutline(): void {
        if (this.exportType !== 'outline') return;
        if (this.outlinePreset === 'index-cards-csv') {
            this.outputFormat = 'csv';
        } else if (this.outlinePreset === 'index-cards-json') {
            this.outputFormat = 'json';
        } else if (this.outputFormat === 'csv' || this.outputFormat === 'json') {
            // Reset back to markdown for outline presets that prefer md
            this.outputFormat = 'markdown';
        }
    }

    private syncOutputFormatPills(): void {
        this.outputFormatPills.forEach(p => {
            const scope = p.el.getAttribute('data-scope') as ExportType | 'both' | null;
            const scopeMatch = scope === 'both' || scope === this.exportType;
            p.el.toggleClass('rt-is-active', scopeMatch && this.outputFormat === p.format);
            if (!scopeMatch) {
                p.el.removeClass('rt-is-active');
            }
        });
    }

    private syncExportUi(): void {
        this.tocCard?.toggleClass('rt-hidden', this.exportType !== 'manuscript');
        this.manuscriptOptionsCard?.toggleClass('rt-hidden', this.exportType !== 'manuscript');
        this.wordCountCard?.toggleClass('rt-hidden', this.exportType !== 'manuscript');
        this.outlineOptionsCard?.toggleClass('rt-hidden', this.exportType !== 'outline');
        this.syncOutputFormatPills();
        this.updateLayoutPicker();
        this.updateTemplateWarning();
    }

    /**
     * Render or hide the Pandoc layout picker.
     * Visible only when outputFormat is PDF or DOCX and exportType is manuscript.
     */
    private updateLayoutPicker(): void {
        if (!this.layoutContainerEl) return;
        this.layoutContainerEl.empty();

        const isPandoc = this.exportType === 'manuscript' && (this.outputFormat === 'pdf' || this.outputFormat === 'docx');
        if (!isPandoc) {
            this.layoutContainerEl.addClass('rt-hidden');
            this.selectedLayoutId = undefined;
            return;
        }
        this.layoutContainerEl.removeClass('rt-hidden');

        const layouts = getLayoutsForPreset(this.plugin, this.manuscriptPreset);
        const activeBook = getActiveBook(this.plugin.settings);
        const lastUsed = (activeBook?.lastUsedPandocLayoutByPreset || {})[this.manuscriptPreset];

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
        } else if (layouts.length === 1) {
            // Single layout — static text
            this.createSectionHeading(this.layoutContainerEl, 'Layout', 'layout-template');
            this.layoutContainerEl.createDiv({
                cls: 'rt-sub-card-note',
                text: layouts[0].name
            });
            this.selectedLayoutId = layouts[0].id;
        } else {
            // Multiple layouts — dropdown
            this.createSectionHeading(this.layoutContainerEl, 'Layout', 'layout-template');
            const ddContainer = this.layoutContainerEl.createDiv({ cls: 'rt-manuscript-input-container' });
            const dd = new DropdownComponent(ddContainer);
            for (const l of layouts) {
                dd.addOption(l.id, l.name);
            }
            // Default: last-used or first
            const defaultId = lastUsed && layouts.some(l => l.id === lastUsed) ? lastUsed : layouts[0].id;
            dd.setValue(defaultId);
            this.selectedLayoutId = defaultId;
            dd.onChange((val) => {
                this.selectedLayoutId = val;
                this.updateTemplateWarning();
            });
        }
    }

    /**
     * Update template validation warning based on current preset and format
     */
    private updateTemplateWarning(): void {
        if (!this.templateWarningEl || this.exportType !== 'manuscript') {
            if (this.templateWarningEl) this.templateWarningEl.empty();
            return;
        }

        this.templateWarningEl.empty();
        this.templateWarningEl.removeClass('rt-warning-error');
        this.templateWarningEl.removeClass('rt-warning-info');

        // Only check templates for DOCX/PDF formats
        if (this.outputFormat === 'markdown') {
            return; // No template needed for markdown
        }

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
        const isFiltered = this.subplot !== 'All Subplots';
        
        this.orderPills.forEach(p => {
            const isReverse = p.order === 'reverse-narrative' || p.order === 'reverse-chronological';
            if (isFiltered && isReverse) {
                p.el.addClass('rt-is-disabled');
                p.el.removeClass('rt-is-active');
            } else {
                p.el.removeClass('rt-is-disabled');
                if (this.order === p.order) {
                    p.el.addClass('rt-is-active');
                }
            }
        });
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
            const { titles, whenDates, sceneNumbers } = await getSceneFilesByOrder(this.app, this.plugin, this.order, this.subplot);
            this.sceneTitles = titles;
            this.sceneWhenDates = whenDates;
            this.sceneNumbers = sceneNumbers;
            this.totalScenes = titles.length;
            this.rangeStart = 1;
            this.rangeEnd = Math.max(1, this.totalScenes);
            
            const meta = [`${this.totalScenes} scenes available`];
            if (this.subplot !== 'All Subplots') {
                meta.push(`Filtered by: ${this.subplot}`);
            } else {
                meta.push(t('manuscriptModal.heroNarrativeMeta'));
            }
            this.renderHeroMeta(meta);
            
            this.loadingEl?.remove();
            this.updateRangeUI();
            this.syncRangeAvailability();
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

    private isReverseOrder(): boolean {
        return this.order === 'reverse-narrative' || this.order === 'reverse-chronological';
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
        // Get actual scene numbers for the range boundaries
        const startSceneNum = this.getSceneNumberAt(this.rangeStart);
        const endSceneNum = this.getSceneNumberAt(this.rangeEnd);
        const displayStart = startSceneNum;
        const displayEnd = endSceneNum;
        this.rangeStatusEl?.setText(
            t('manuscriptModal.rangeStatus', {
                start: displayStart,
                end: displayEnd,
                total: this.totalScenes,
                count: this.rangeEnd - this.rangeStart + 1
            })
        );
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
        this.actionButton?.setDisabled(true);
        this.actionButton?.setButtonText(t('manuscriptModal.actionCreate'));

        try {
            await this.onSubmit({
                order: this.order,
                tocMode: this.tocMode,
                rangeStart: this.rangeStart,
                rangeEnd: this.rangeEnd,
                subplot: this.subplot === 'All Subplots' ? undefined : this.subplot,
                exportType: this.exportType,
                manuscriptPreset: this.manuscriptPreset,
                outlinePreset: this.outlinePreset,
                outputFormat: this.outputFormat,
                updateWordCounts: this.updateWordCounts,
                includeSynopsis: this.includeSynopsis,
                selectedLayoutId: this.selectedLayoutId
            });
            this.close();
        } catch (err) {
            console.error(err);
            new Notice(t('manuscriptModal.loadError'));
            this.actionButton?.setDisabled(false);
            this.actionButton?.setButtonText(t('manuscriptModal.actionCreate'));
        }
    }
}
