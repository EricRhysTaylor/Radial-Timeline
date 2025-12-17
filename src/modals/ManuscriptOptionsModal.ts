/*
 * Manuscript Options Modal
 */
import { App, ButtonComponent, Modal, Notice } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { getSceneFilesByOrder, ManuscriptOrder } from '../utils/manuscript';
import { t } from '../i18n';

export interface ManuscriptModalResult {
    order: ManuscriptOrder;
    useMarkdownToc: boolean;
    rangeStart?: number;
    rangeEnd?: number;
}

type DragHandle = 'start' | 'end' | null;

export class ManuscriptOptionsModal extends Modal {
    private readonly plugin: RadialTimelinePlugin;
    private readonly onSubmit: (result: ManuscriptModalResult) => Promise<void>;

    private order: ManuscriptOrder = 'narrative';
    private useMarkdownToc = true;

    private sceneTitles: string[] = [];
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
    }

    async onOpen(): Promise<void> {
        const { contentEl, modalEl } = this;
        contentEl.empty();

        if (modalEl) {
            modalEl.style.width = '760px'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxWidth = '92vw'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxHeight = '92vh'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.classList.add('rt-pulse-modal-shell');
        }
        contentEl.classList.add('rt-pulse-modal');

        this.renderSkeleton(contentEl);
        await this.loadNarrativeScenes();
    }

    onClose(): void {
        this.detachPointerEvents();
        this.contentEl.empty();
    }

    // Layout -----------------------------------------------------------------
    private renderSkeleton(container: HTMLElement): void {
        const hero = container.createDiv({ cls: 'rt-pulse-progress-hero' });
        hero.createSpan({ cls: 'rt-pulse-hero-badge', text: 'Manuscript' });
        hero.createEl('h2', {
            cls: 'rt-pulse-progress-heading',
            text: t('manuscriptModal.title')
        });
        hero.createDiv({
            cls: 'rt-pulse-progress-subtitle',
            text: t('manuscriptModal.subtitle')
        });
        this.heroMetaEl = hero.createDiv({ cls: 'rt-pulse-progress-meta' });
        this.renderHeroMeta([t('manuscriptModal.heroLoading')]);

        container.createDiv({
            cls: 'rt-pulse-info',
            text: t('manuscriptModal.description')
        });

        const tocCard = container.createDiv({ cls: 'rt-pulse-glass-card rt-manuscript-card' });
        tocCard.createDiv({ cls: 'rt-manuscript-card-head', text: t('manuscriptModal.tocHeading') });
        const tocActions = tocCard.createDiv({ cls: 'rt-manuscript-pill-row' });
        this.createPill(tocActions, t('manuscriptModal.tocPlain'), !this.useMarkdownToc, () => {
            this.useMarkdownToc = false;
            this.updatePills(tocActions, 0);
        });
        this.createPill(tocActions, t('manuscriptModal.tocMarkdown'), this.useMarkdownToc, () => {
            this.useMarkdownToc = true;
            this.updatePills(tocActions, 1);
        });
        tocCard.createDiv({
            cls: 'rt-manuscript-card-note',
            text: t('manuscriptModal.tocNote')
        });

        const orderCard = container.createDiv({ cls: 'rt-pulse-glass-card rt-manuscript-card' });
        orderCard.createDiv({ cls: 'rt-manuscript-card-head', text: t('manuscriptModal.orderHeading') });
        const orderRow = orderCard.createDiv({ cls: 'rt-manuscript-pill-row' });
        this.createOrderPill(orderRow, t('manuscriptModal.orderNarrative'), 'narrative');
        this.createOrderPill(orderRow, t('manuscriptModal.orderChronological'), 'chronological');
        this.createOrderPill(orderRow, t('manuscriptModal.orderReverse'), 'reverse-narrative');
        orderCard.createDiv({
            cls: 'rt-manuscript-card-note',
            text: t('manuscriptModal.orderNote')
        });

        const rangeCard = container.createDiv({ cls: 'rt-pulse-glass-card rt-manuscript-card' });
        rangeCard.createDiv({ cls: 'rt-manuscript-card-head', text: t('manuscriptModal.rangeHeading') });
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

        const actions = container.createDiv({ cls: 'rt-beats-actions rt-manuscript-actions' });
        this.actionButton = new ButtonComponent(actions)
            .setButtonText(t('manuscriptModal.actionCreate'))
            .setCta()
            .onClick(() => this.submit());

        new ButtonComponent(actions)
            .setButtonText(t('manuscriptModal.actionCancel'))
            .onClick(() => this.close());
    }

    private renderHeroMeta(items: string[]): void {
        if (!this.heroMetaEl) return;
        this.heroMetaEl.empty();
        items.forEach(item => this.heroMetaEl?.createSpan({ cls: 'rt-pulse-hero-meta-item', text: item }));
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
        if (this.order === order) pill.classList.add('rt-is-active');
        pill.onClickEvent(() => {
            parent.querySelectorAll('.rt-manuscript-pill').forEach(el => el.removeClass('rt-is-active'));
            pill.classList.add('rt-is-active');
            this.order = order;
            this.syncRangeAvailability();
        });
    }

    private registerPointerEvents(): void {
        if (!this.trackEl || !this.startHandleEl || !this.endHandleEl) return;

        const onPointerMove = (evt: PointerEvent) => {
            if (!this.trackEl || !this.activeHandle || this.totalScenes === 0) return;
            const rect = this.trackEl.getBoundingClientRect();
            const ratio = (evt.clientX - rect.left) / rect.width;
            const clampedRatio = Math.min(Math.max(ratio, 0), 1);
            const position = this.ratioToIndex(clampedRatio);
            this.updateRangeFromDrag(this.activeHandle, position);
        };

        const onPointerUp = () => {
            this.activeHandle = null;
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
        };

        const attach = (handle: HTMLElement, handleType: DragHandle) => {
            handle.onpointerdown = (evt: PointerEvent) => {
                if (this.order !== 'narrative') return;
                this.activeHandle = handleType;
                window.addEventListener('pointermove', onPointerMove);
                window.addEventListener('pointerup', onPointerUp, { once: true });
                evt.preventDefault();
            };
        };

        attach(this.startHandleEl, 'start');
        attach(this.endHandleEl, 'end');

        this.trackEl.onpointerdown = (evt: PointerEvent) => {
            if (this.order !== 'narrative') return;
            const rect = this.trackEl!.getBoundingClientRect();
            const ratio = (evt.clientX - rect.left) / rect.width;
            const position = this.ratioToIndex(Math.min(Math.max(ratio, 0), 1));
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
    private async loadNarrativeScenes(): Promise<void> {
        try {
            const { titles } = await getSceneFilesByOrder(this.plugin, 'narrative');
            this.sceneTitles = titles;
            this.totalScenes = titles.length;
            this.rangeStart = 1;
            this.rangeEnd = Math.max(1, this.totalScenes);
            this.renderHeroMeta([
                `${this.totalScenes} scenes available`,
                t('manuscriptModal.heroNarrativeMeta')
            ]);
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

    private syncRangeAvailability(): void {
        const rangeDisabled = this.order !== 'narrative';
        this.trackEl?.toggleClass('rt-is-disabled', rangeDisabled);
        this.startHandleEl?.toggleClass('rt-is-disabled', rangeDisabled);
        this.endHandleEl?.toggleClass('rt-is-disabled', rangeDisabled);
        this.rangeFillEl?.toggleClass('rt-is-disabled', rangeDisabled);

        if (rangeDisabled) {
            this.rangeStatusEl?.setText(t('manuscriptModal.rangeDisabled'));
        } else {
            this.rangeStatusEl?.setText(
                t('manuscriptModal.rangeStatus', {
                    start: this.rangeStart,
                    end: this.rangeEnd,
                    total: this.totalScenes,
                    count: this.rangeEnd - this.rangeStart + 1
                })
            );
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
        if (this.order === 'narrative') {
            this.rangeStatusEl?.setText(
                t('manuscriptModal.rangeStatus', {
                    start: this.rangeStart,
                    end: this.rangeEnd,
                    total: this.totalScenes,
                    count: this.rangeEnd - this.rangeStart + 1
                })
            );
        }
    }

    private renderRangeCards(): void {
        if (!this.rangeCardContainer) return;
        this.rangeCardContainer.empty();
        if (this.totalScenes === 0) return;

        const firstCard = this.rangeCardContainer.createDiv({ cls: 'rt-manuscript-range-card' });
        firstCard.toggleClass('rt-is-muted', this.rangeStart > 1);
        firstCard.createDiv({ cls: 'rt-manuscript-range-label', text: t('manuscriptModal.rangeFirst') });
        firstCard.createDiv({ cls: 'rt-manuscript-range-title', text: this.sceneTitles[0] ?? '—' });

        const selectedCard = this.rangeCardContainer.createDiv({ cls: 'rt-manuscript-range-card rt-manuscript-range-card-active' });
        const isFullRange = this.rangeStart === 1 && this.rangeEnd === this.totalScenes;
        selectedCard.toggleClass('rt-is-muted', isFullRange);
        const rangeLabel = isFullRange
            ? t('manuscriptModal.rangeAllLabel')
            : t('manuscriptModal.rangeSelectedLabel', { start: this.rangeStart, end: this.rangeEnd });
        selectedCard.createDiv({ cls: 'rt-manuscript-range-label', text: rangeLabel });
        const middleTitle = this.rangeStart === this.rangeEnd
            ? (this.sceneTitles[this.rangeStart - 1] ?? t('manuscriptModal.rangeSingleLabel'))
            : t('manuscriptModal.rangeCountLabel', { count: this.rangeEnd - this.rangeStart + 1 });
        selectedCard.createDiv({ cls: 'rt-manuscript-range-title', text: middleTitle });

        const lastCard = this.rangeCardContainer.createDiv({ cls: 'rt-manuscript-range-card' });
        lastCard.toggleClass('rt-is-muted', this.rangeEnd < this.totalScenes);
        lastCard.createDiv({ cls: 'rt-manuscript-range-label', text: t('manuscriptModal.rangeLast') });
        lastCard.createDiv({ cls: 'rt-manuscript-range-title', text: this.sceneTitles[this.totalScenes - 1] ?? '—' });
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
                useMarkdownToc: this.useMarkdownToc,
                rangeStart: this.order === 'narrative' ? this.rangeStart : undefined,
                rangeEnd: this.order === 'narrative' ? this.rangeEnd : undefined
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
