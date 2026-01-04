/*
 * Manuscript Options Modal
 */
import { App, ButtonComponent, DropdownComponent, Modal, Notice, ToggleComponent } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { getSceneFilesByOrder, ManuscriptOrder, TocMode } from '../utils/manuscript';
import { t } from '../i18n';
import { ExportFormat, ExportType, ManuscriptPreset, OutlinePreset } from '../utils/exportFormats';
import { isProfessionalActive } from '../settings/sections/ProfessionalSection';

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
    private proNoteEl?: HTMLElement;

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
            modalEl.classList.add('rt-modal-shell');
        }
        contentEl.classList.add('rt-modal-container', 'rt-manuscript-modal');

        this.renderSkeleton(contentEl);
        await this.loadSubplots();
        await this.loadScenesForOrder();
    }

    onClose(): void {
        this.detachPointerEvents();
        this.contentEl.empty();
    }

    // Layout -----------------------------------------------------------------
    private renderSkeleton(container: HTMLElement): void {
        const hero = container.createDiv({ cls: 'rt-modal-header' });
        hero.createSpan({ cls: 'rt-modal-badge', text: t('manuscriptModal.badge') });
        hero.createDiv({
            cls: 'rt-modal-title',
            text: t('manuscriptModal.title')
        });
        hero.createDiv({
            cls: 'rt-modal-subtitle',
            text: t('manuscriptModal.description')
        });
        this.heroMetaEl = hero.createDiv({ cls: 'rt-modal-meta' });
        this.renderHeroMeta([t('manuscriptModal.heroLoading')]);

        // Export type switch
        const exportCard = container.createDiv({ cls: 'rt-glass-card rt-sub-card' });
        exportCard.createDiv({ cls: 'rt-sub-card-head', text: t('manuscriptModal.exportHeading') });
        const exportRow = exportCard.createDiv({ cls: 'rt-manuscript-pill-row' });
        this.createExportTypePill(exportRow, t('manuscriptModal.exportTypeManuscript'), 'manuscript');
        this.createExportTypePill(exportRow, `${t('manuscriptModal.exportTypeOutline')} · ${t('manuscriptModal.proBadge')}`, 'outline', !this.isPro);

        this.proNoteEl = exportCard.createDiv({
            cls: 'rt-sub-card-note',
            text: this.isPro ? t('manuscriptModal.proEnabled') : t('manuscriptModal.proRequired')
        });

        // Manuscript preset + format
        this.manuscriptOptionsCard = container.createDiv({ cls: 'rt-glass-card rt-sub-card' });
        this.manuscriptOptionsCard.createDiv({ cls: 'rt-sub-card-head', text: t('manuscriptModal.manuscriptPresetHeading') });
        const presetRow = this.manuscriptOptionsCard.createDiv({ cls: 'rt-manuscript-input-container' });
        this.manuscriptPresetDropdown = new DropdownComponent(presetRow)
            .addOption('novel', t('manuscriptModal.presetNovel'))
            .addOption('screenplay', `${t('manuscriptModal.presetScreenplay')} · ${t('manuscriptModal.proBadge')}`)
            .addOption('podcast', `${t('manuscriptModal.presetPodcast')} · ${t('manuscriptModal.proBadge')}`)
            .setValue(this.manuscriptPreset)
            .onChange((value) => {
                const preset = value as ManuscriptPreset;
                if (!this.isPro && (preset === 'screenplay' || preset === 'podcast')) {
                    new Notice(t('manuscriptModal.proRequired'));
                    this.manuscriptPresetDropdown?.setValue(this.manuscriptPreset);
                    return;
                }
                this.manuscriptPreset = preset;
            });

        const formatRow = this.manuscriptOptionsCard.createDiv({ cls: 'rt-manuscript-pill-row' });
        this.createOutputFormatPill(formatRow, t('manuscriptModal.formatMarkdown'), 'markdown');
        this.createOutputFormatPill(formatRow, `${t('manuscriptModal.formatDocx')} · ${t('manuscriptModal.proBadge')}`, 'docx', !this.isPro);
        this.createOutputFormatPill(formatRow, `${t('manuscriptModal.formatPdf')} · ${t('manuscriptModal.proBadge')}`, 'pdf', !this.isPro);

        // Outline presets
        this.outlineOptionsCard = container.createDiv({ cls: 'rt-glass-card rt-sub-card' });
        this.outlineOptionsCard.createDiv({ cls: 'rt-sub-card-head', text: t('manuscriptModal.outlinePresetHeading') });
        const outlinePresetRow = this.outlineOptionsCard.createDiv({ cls: 'rt-manuscript-input-container' });
        this.outlinePresetDropdown = new DropdownComponent(outlinePresetRow)
            .addOption('beat-sheet', t('manuscriptModal.outlineBeatSheet'))
            .addOption('episode-rundown', t('manuscriptModal.outlineEpisodeRundown'))
            .addOption('shooting-schedule', t('manuscriptModal.outlineShootingSchedule'))
            .addOption('index-cards-csv', `${t('manuscriptModal.outlineIndexCardsCsv')} · ${t('manuscriptModal.proBadge')}`)
            .addOption('index-cards-json', `${t('manuscriptModal.outlineIndexCardsJson')} · ${t('manuscriptModal.proBadge')}`)
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
            });

        const outlineFormatRow = this.outlineOptionsCard.createDiv({ cls: 'rt-manuscript-pill-row' });
        this.createOutputFormatPill(outlineFormatRow, t('manuscriptModal.formatMarkdown'), 'markdown', false, 'outline');
        this.createOutputFormatPill(outlineFormatRow, `${t('manuscriptModal.formatCsv')} · ${t('manuscriptModal.proBadge')}`, 'csv', !this.isPro, 'outline');
        this.createOutputFormatPill(outlineFormatRow, `${t('manuscriptModal.formatJson')} · ${t('manuscriptModal.proBadge')}`, 'json', !this.isPro, 'outline');

        this.tocCard = container.createDiv({ cls: 'rt-glass-card rt-sub-card' });
        this.tocCard.createDiv({ cls: 'rt-sub-card-head', text: t('manuscriptModal.tocHeading') });
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

        // Word Count Update Card
        const wordCountCard = container.createDiv({ cls: 'rt-glass-card rt-sub-card' });
        wordCountCard.createDiv({ cls: 'rt-sub-card-head', text: t('manuscriptModal.wordCountHeading') });
        const wordCountRow = wordCountCard.createDiv({ cls: 'rt-manuscript-toggle-row' });
        const wordCountLabel = wordCountRow.createSpan({ cls: 'rt-manuscript-toggle-label', text: t('manuscriptModal.wordCountToggle') });
        new ToggleComponent(wordCountRow)
            .setValue(this.updateWordCounts)
            .onChange((value) => {
                this.updateWordCounts = value;
            });
        wordCountCard.createDiv({
            cls: 'rt-sub-card-note',
            text: t('manuscriptModal.wordCountNote')
        });

        // Subplot Filter Card
        const filterCard = container.createDiv({ cls: 'rt-glass-card rt-sub-card' });
        filterCard.createDiv({ cls: 'rt-sub-card-head', text: 'Subplot filter' });
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

        const orderCard = container.createDiv({ cls: 'rt-glass-card rt-sub-card' });
        orderCard.createDiv({ cls: 'rt-sub-card-head', text: t('manuscriptModal.orderHeading') });
        const orderRow = orderCard.createDiv({ cls: 'rt-manuscript-pill-row' });
        this.createOrderPill(orderRow, t('manuscriptModal.orderNarrative'), 'narrative');
        this.createOrderPill(orderRow, t('manuscriptModal.orderReverseNarrative'), 'reverse-narrative');
        this.createOrderPill(orderRow, t('manuscriptModal.orderChronological'), 'chronological');
        this.createOrderPill(orderRow, t('manuscriptModal.orderReverseChronological'), 'reverse-chronological');
        orderCard.createDiv({
            cls: 'rt-sub-card-note',
            text: t('manuscriptModal.orderNote')
        });

        const rangeCard = container.createDiv({ cls: 'rt-glass-card rt-sub-card' });
        rangeCard.createDiv({ cls: 'rt-sub-card-head', text: t('manuscriptModal.rangeHeading') });
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

        const actions = container.createDiv({ cls: 'rt-modal-actions' });
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
        items.forEach(item => this.heroMetaEl?.createSpan({ cls: 'rt-modal-meta-item', text: item }));
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

    private createExportTypePill(parent: HTMLElement, label: string, type: ExportType, disabled = false): void {
        const pill = parent.createDiv({ cls: 'rt-manuscript-pill' });
        pill.createSpan({ text: label });
        if (this.exportType === type) pill.classList.add('rt-is-active');
        if (disabled) pill.classList.add('rt-is-disabled');
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

    private createOutputFormatPill(parent: HTMLElement, label: string, format: ExportFormat, disabled = false, scope: ExportType | 'both' = 'both'): void {
        const pill = parent.createDiv({ cls: 'rt-manuscript-pill', attr: { 'data-scope': scope } });
        pill.createSpan({ text: label });
        const isActive = this.outputFormat === format;
        if (isActive) pill.classList.add('rt-is-active');
        if (disabled) pill.classList.add('rt-is-disabled');
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
        if (this.proNoteEl) {
            this.proNoteEl.setText(this.isPro ? t('manuscriptModal.proEnabled') : t('manuscriptModal.proRequired'));
        }

        this.tocCard?.toggleClass('rt-hidden', this.exportType !== 'manuscript');
        this.manuscriptOptionsCard?.toggleClass('rt-hidden', this.exportType !== 'manuscript');
        this.outlineOptionsCard?.toggleClass('rt-hidden', this.exportType !== 'outline');
        this.syncOutputFormatPills();
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
            const { titles, whenDates, sceneNumbers } = await getSceneFilesByOrder(this.plugin, this.order, this.subplot);
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
        const isReverse = this.isReverseOrder();
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

        const isReverse = this.isReverseOrder();
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
                updateWordCounts: this.updateWordCounts
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
