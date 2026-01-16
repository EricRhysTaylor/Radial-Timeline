import {
    ItemView,
    WorkspaceLeaf,
    Platform,
    Notice,
    setIcon,
    setTooltip,
    TAbstractFile,
    normalizePath
} from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { INQUIRY_VIEW_DISPLAY_TEXT, INQUIRY_VIEW_TYPE } from './constants';
import {
    createDefaultInquiryState,
    InquiryMode,
    InquiryScope,
    InquiryZone,
    InquiryResult,
    InquiryFinding
} from './state';
import { ensureInquiryArtifactFolder, getMostRecentArtifactFile, resolveInquiryArtifactFolder } from './utils/artifacts';
import { openOrRevealFile } from '../utils/fileUtils';

const DEFAULT_BOOK_COUNT = 5;
const DEFAULT_SCENE_COUNT = 12;

type InquiryQuestion = {
    id: string;
    label: string;
    question: string;
    zone: InquiryZone;
    mode: InquiryMode | 'both';
    icon: string;
};

const BUILT_IN_QUESTIONS: InquiryQuestion[] = [
    {
        id: 'setup-assumptions',
        label: 'Setup',
        question: 'What assumptions does this scene rely on?',
        zone: 'setup',
        mode: 'both',
        icon: 'help-circle'
    },
    {
        id: 'pressure-state',
        label: 'Pressure',
        question: 'How does this change the narrative state?',
        zone: 'pressure',
        mode: 'both',
        icon: 'activity'
    },
    {
        id: 'payoff-debt',
        label: 'Payoff',
        question: 'What narrative debt is introduced or resolved?',
        zone: 'payoff',
        mode: 'both',
        icon: 'check-circle'
    }
];

export class InquiryView extends ItemView {
    static readonly viewType = INQUIRY_VIEW_TYPE;

    private plugin: RadialTimelinePlugin;
    private state = createDefaultInquiryState();

    private rootEl?: HTMLElement;
    private scopeSelect?: HTMLSelectElement;
    private modeSelect?: HTMLSelectElement;
    private contextBadgeIcon?: HTMLElement;
    private contextBadgeLabel?: HTMLElement;
    private minimapTicksEl?: HTMLElement;
    private minimapTicks: HTMLButtonElement[] = [];
    private glyphButton?: HTMLButtonElement;
    private flowRingButton?: HTMLButtonElement;
    private depthRingButton?: HTMLButtonElement;
    private flowRingProgress?: SVGCircleElement;
    private depthRingProgress?: SVGCircleElement;
    private summaryEl?: HTMLElement;
    private verdictEl?: HTMLElement;
    private findingsListEl?: HTMLElement;
    private detailsToggle?: HTMLButtonElement;
    private detailsEl?: HTMLElement;
    private artifactPreviewEl?: HTMLElement;
    private hoverTextEl?: HTMLElement;
    private cacheStatusEl?: HTMLElement;
    private confidenceEl?: HTMLElement;
    private navPrevButton?: HTMLButtonElement;
    private navNextButton?: HTMLButtonElement;
    private lastFocusSceneByBookId = new Map<string, string>();

    constructor(leaf: WorkspaceLeaf, plugin: RadialTimelinePlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string {
        return INQUIRY_VIEW_TYPE;
    }

    getDisplayText(): string {
        return INQUIRY_VIEW_DISPLAY_TEXT;
    }

    getIcon(): string {
        return 'help-circle';
    }

    async onOpen(): Promise<void> {
        this.contentEl.empty();
        if (Platform.isMobile) {
            this.renderMobileGate();
            return;
        }
        this.renderDesktopLayout();
        this.refreshUI();
    }

    async onClose(): Promise<void> {
        this.contentEl.empty();
    }

    private renderMobileGate(): void {
        const wrapper = this.contentEl.createDiv({ cls: 'rt-inquiry-mobile ert-ui' });
        wrapper.createDiv({ cls: 'rt-inquiry-mobile-title', text: 'Desktop required' });
        wrapper.createDiv({
            cls: 'rt-inquiry-mobile-subtitle',
            text: 'Inquiry is available on desktop only. Artifacts remain readable on mobile.'
        });

        const actions = wrapper.createDiv({ cls: 'rt-inquiry-mobile-actions' });
        const openFolderBtn = actions.createEl('button', { cls: 'rt-inquiry-mobile-btn', text: 'Open Artifacts folder' });
        const openLatestBtn = actions.createEl('button', { cls: 'rt-inquiry-mobile-btn', text: 'View most recent Artifact' });

        this.registerDomEvent(openFolderBtn, 'click', () => { void this.openArtifactsFolder(); });
        this.registerDomEvent(openLatestBtn, 'click', () => { void this.openMostRecentArtifact(); });
    }

    private renderDesktopLayout(): void {
        this.rootEl = this.contentEl.createDiv({ cls: 'rt-inquiry-view ert-ui' });

        const header = this.rootEl.createDiv({ cls: 'rt-inquiry-header' });
        const headerLeft = header.createDiv({ cls: 'rt-inquiry-header-group' });
        const headerRight = header.createDiv({ cls: 'rt-inquiry-header-group rt-inquiry-header-right' });

        const scopeField = headerLeft.createDiv({ cls: 'rt-inquiry-control' });
        scopeField.createDiv({ cls: 'rt-inquiry-control-label', text: 'Scope' });
        this.scopeSelect = scopeField.createEl('select', { cls: 'rt-inquiry-select' });
        this.scopeSelect.createEl('option', { value: 'book', text: 'Book' });
        this.scopeSelect.createEl('option', { value: 'saga', text: 'Saga' });
        this.registerDomEvent(this.scopeSelect, 'change', () => {
            this.handleScopeChange(this.scopeSelect?.value as InquiryScope);
        });

        const modeField = headerLeft.createDiv({ cls: 'rt-inquiry-control' });
        modeField.createDiv({ cls: 'rt-inquiry-control-label', text: 'Mode' });
        this.modeSelect = modeField.createEl('select', { cls: 'rt-inquiry-select' });
        this.modeSelect.createEl('option', { value: 'flow', text: 'Flow' });
        this.modeSelect.createEl('option', { value: 'depth', text: 'Depth' });
        this.registerDomEvent(this.modeSelect, 'change', () => {
            this.handleModeChange(this.modeSelect?.value as InquiryMode);
        });

        const artifactBtn = headerRight.createEl('button', {
            cls: 'rt-inquiry-icon-btn ert-iconBtn',
            attr: { type: 'button', 'aria-label': 'Save artifact' }
        });
        setIcon(artifactBtn, 'archive');
        setTooltip(artifactBtn, 'Save artifact');
        this.registerDomEvent(artifactBtn, 'click', () => { void this.saveArtifact(); });

        const body = this.rootEl.createDiv({ cls: 'rt-inquiry-body' });
        const main = body.createDiv({ cls: 'rt-inquiry-main' });
        const findings = body.createDiv({ cls: 'rt-inquiry-findings' });

        const minimap = main.createDiv({ cls: 'rt-inquiry-minimap' });
        const badge = minimap.createDiv({ cls: 'rt-inquiry-context-badge' });
        this.contextBadgeIcon = badge.createSpan({ cls: 'rt-inquiry-context-badge-icon' });
        this.contextBadgeLabel = badge.createSpan({ cls: 'rt-inquiry-context-badge-label' });
        this.minimapTicksEl = minimap.createDiv({ cls: 'rt-inquiry-minimap-ticks' });

        const zones = main.createDiv({ cls: 'rt-inquiry-zones' });
        this.renderZone(zones, 'setup', 'Setup');
        this.renderZone(zones, 'pressure', 'Pressure');
        this.renderZone(zones, 'payoff', 'Payoff');

        const focusArea = main.createDiv({ cls: 'rt-inquiry-focus-area' });
        const glyphStack = focusArea.createDiv({ cls: 'rt-inquiry-glyph-stack' });

        this.depthRingButton = glyphStack.createEl('button', {
            cls: 'rt-inquiry-ring rt-inquiry-ring--depth',
            attr: { type: 'button', 'aria-label': 'Depth ring' }
        });
        this.flowRingButton = glyphStack.createEl('button', {
            cls: 'rt-inquiry-ring rt-inquiry-ring--flow',
            attr: { type: 'button', 'aria-label': 'Flow ring' }
        });
        if (this.depthRingButton) {
            this.depthRingProgress = this.attachRingSvg(this.depthRingButton, 'depth');
        }
        if (this.flowRingButton) {
            this.flowRingProgress = this.attachRingSvg(this.flowRingButton, 'flow');
        }
        this.glyphButton = glyphStack.createEl('button', {
            cls: 'rt-inquiry-glyph',
            attr: { type: 'button', 'aria-label': 'Focus target' }
        });

        this.registerDomEvent(this.glyphButton, 'click', () => this.handleGlyphClick());
        this.registerDomEvent(this.flowRingButton, 'click', () => this.openArtifactPreview());
        this.registerDomEvent(this.depthRingButton, 'click', () => this.openArtifactPreview());

        this.registerDomEvent(this.glyphButton, 'pointerenter', () => {
            this.setHoverText(this.buildFocusHoverText());
        });
        this.registerDomEvent(this.glyphButton, 'pointerleave', () => this.clearHoverText());
        this.registerDomEvent(this.flowRingButton, 'pointerenter', () => {
            this.setHoverText(this.buildRingHoverText('flow'));
        });
        this.registerDomEvent(this.flowRingButton, 'pointerleave', () => this.clearHoverText());
        this.registerDomEvent(this.depthRingButton, 'pointerenter', () => {
            this.setHoverText(this.buildRingHoverText('depth'));
        });
        this.registerDomEvent(this.depthRingButton, 'pointerleave', () => this.clearHoverText());

        this.hoverTextEl = main.createDiv({ cls: 'rt-inquiry-hover', text: 'Hover to preview context.' });

        const findingsHeader = findings.createDiv({ cls: 'rt-inquiry-findings-header' });
        findingsHeader.createDiv({ cls: 'rt-inquiry-findings-title', text: 'Findings' });
        this.detailsToggle = findingsHeader.createEl('button', {
            cls: 'rt-inquiry-details-toggle',
            attr: { type: 'button', 'aria-label': 'Toggle details' }
        });
        const detailsIcon = this.detailsToggle.createSpan({ cls: 'rt-inquiry-details-icon' });
        setIcon(detailsIcon, 'chevron-down');
        this.registerDomEvent(this.detailsToggle, 'click', () => this.toggleDetails());

        this.detailsEl = findings.createDiv({ cls: 'rt-inquiry-details rt-hidden' });
        this.detailsEl.createDiv({ cls: 'rt-inquiry-detail-row', text: 'Corpus fingerprint: not available' });
        this.detailsEl.createDiv({ cls: 'rt-inquiry-detail-row', text: 'Cache status: not available' });

        this.summaryEl = findings.createDiv({ cls: 'rt-inquiry-summary', text: 'No inquiry run yet.' });
        this.verdictEl = findings.createDiv({ cls: 'rt-inquiry-verdict', text: 'Run an inquiry to see verdicts.' });
        this.findingsListEl = findings.createDiv({ cls: 'rt-inquiry-findings-list' });

        this.artifactPreviewEl = findings.createDiv({ cls: 'rt-inquiry-artifact-preview rt-hidden' });

        const footer = this.rootEl.createDiv({ cls: 'rt-inquiry-footer' });
        const nav = footer.createDiv({ cls: 'rt-inquiry-nav' });
        this.navPrevButton = nav.createEl('button', {
            cls: 'rt-inquiry-nav-btn',
            attr: { type: 'button', 'aria-label': 'Previous focus' }
        });
        this.navNextButton = nav.createEl('button', {
            cls: 'rt-inquiry-nav-btn',
            attr: { type: 'button', 'aria-label': 'Next focus' }
        });
        this.registerDomEvent(this.navPrevButton, 'click', () => this.shiftFocus(-1));
        this.registerDomEvent(this.navNextButton, 'click', () => this.shiftFocus(1));

        const status = footer.createDiv({ cls: 'rt-inquiry-status' });
        this.cacheStatusEl = status.createDiv({ cls: 'rt-inquiry-status-item', text: 'Cache: none' });
        this.confidenceEl = status.createDiv({ cls: 'rt-inquiry-status-item', text: 'Confidence: none' });
    }

    private renderZone(container: HTMLElement, zone: InquiryZone, label: string): void {
        const zoneEl = container.createDiv({ cls: `rt-inquiry-zone rt-inquiry-zone--${zone}` });
        zoneEl.createDiv({ cls: 'rt-inquiry-zone-label', text: label });
        const icons = zoneEl.createDiv({ cls: 'rt-inquiry-zone-icons' });

        const questions = BUILT_IN_QUESTIONS.filter(q => q.zone === zone);
        questions.forEach(question => {
            const btn = icons.createEl('button', {
                cls: 'rt-inquiry-zone-icon',
                attr: { type: 'button', 'aria-label': question.label }
            });
            const iconEl = btn.createSpan({ cls: 'rt-inquiry-zone-icon-svg' });
            setIcon(iconEl, question.icon);
            this.registerDomEvent(btn, 'click', () => this.handleQuestionClick(question));
        });
    }

    private refreshUI(): void {
        this.updateScopeSelect();
        this.updateModeSelect();
        this.updateContextBadge();
        this.renderMinimapTicks();
        this.updateFocusGlyph();
        this.updateRings();
        this.updateFindingsPanel();
        this.updateFooterStatus();
        this.updateNavigationIcons();
    }

    private updateScopeSelect(): void {
        if (this.scopeSelect) {
            this.scopeSelect.value = this.state.scope;
        }
    }

    private updateModeSelect(): void {
        if (this.modeSelect) {
            this.modeSelect.value = this.state.mode;
        }
    }

    private updateContextBadge(): void {
        if (!this.contextBadgeIcon || !this.contextBadgeLabel) return;
        const isSaga = this.state.scope === 'saga';
        this.contextBadgeIcon.empty?.();
        setIcon(this.contextBadgeIcon, isSaga ? 'sigma' : 'book-open');
        this.contextBadgeLabel.textContent = isSaga ? 'Saga context' : 'Book context';
    }

    private renderMinimapTicks(): void {
        if (!this.minimapTicksEl) return;
        this.minimapTicksEl.empty();
        this.minimapTicks = [];

        const count = this.state.scope === 'saga' ? DEFAULT_BOOK_COUNT : DEFAULT_SCENE_COUNT;
        for (let i = 1; i <= count; i += 1) {
            const tick = this.minimapTicksEl.createEl('button', {
                cls: 'rt-inquiry-minimap-tick',
                attr: { type: 'button', 'data-index': String(i) }
            });
            tick.setAttribute('aria-label', this.state.scope === 'saga' ? `Focus book ${i}` : `Focus scene ${i}`);
            this.registerDomEvent(tick, 'click', () => this.setFocusByIndex(i));
            this.registerDomEvent(tick, 'pointerenter', () => {
                this.setHoverText(`Focus ${this.state.scope === 'saga' ? 'book' : 'scene'} ${i}. No findings yet.`);
            });
            this.registerDomEvent(tick, 'pointerleave', () => this.clearHoverText());
            this.minimapTicks.push(tick);
        }

        this.updateMinimapFocus();
    }

    private updateMinimapFocus(): void {
        const focusIndex = this.getFocusIndex();
        this.minimapTicks.forEach((tick, idx) => {
            const isActive = idx + 1 === focusIndex;
            tick.classList.toggle('is-active', isActive);
        });
    }

    private updateFocusGlyph(): void {
        if (!this.glyphButton) return;
        const focusLabel = this.getFocusLabel();
        this.glyphButton.textContent = focusLabel;
        this.glyphButton.setAttribute('aria-label', `Focus target ${focusLabel}`);
        this.glyphButton.setAttribute('data-scope', this.state.scope);
    }

    private updateRings(): void {
        const result = this.state.activeResult;
        const flowValue = result ? result.verdict.flow : 0;
        const depthValue = result ? result.verdict.depth : 0;
        const severity = result ? result.verdict.severity : 'low';
        const confidence = result ? result.verdict.confidence : 'low';

        this.applyRingState(this.flowRingButton, this.flowRingProgress, flowValue, severity, confidence);
        this.applyRingState(this.depthRingButton, this.depthRingProgress, depthValue, severity, confidence);
    }

    private applyRingState(
        ring: HTMLButtonElement | undefined,
        progress: SVGCircleElement | undefined,
        value: number,
        severity: InquiryResult['verdict']['severity'],
        confidence: InquiryResult['verdict']['confidence']
    ): void {
        if (!ring) return;
        ring.classList.remove('is-severity-low', 'is-severity-medium', 'is-severity-high');
        ring.classList.remove('is-confidence-low', 'is-confidence-medium', 'is-confidence-high');
        const normalized = this.normalizeMetricValue(value);
        this.updateRingProgress(progress, normalized);

        ring.classList.add(`is-severity-${severity}`);
        ring.classList.add(`is-confidence-${confidence}`);
    }

    private normalizeMetricValue(value: number): number {
        if (!Number.isFinite(value)) return 0;
        if (value > 1) {
            const clamped = Math.min(Math.max(value, 5), 100);
            return clamped / 100;
        }
        return Math.min(Math.max(value, 0), 1);
    }

    private updateRingProgress(progress: SVGCircleElement | undefined, normalized: number): void {
        if (!progress) return;
        const circumference = Number(progress.getAttribute('data-circumference') || '0');
        if (!Number.isFinite(circumference) || circumference <= 0) return;
        const offset = circumference * (1 - normalized);
        progress.setAttribute('stroke-dashoffset', offset.toFixed(2));
    }

    private attachRingSvg(button: HTMLButtonElement, ring: InquiryMode): SVGCircleElement {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 120 120');
        svg.classList.add('rt-inquiry-ring-svg');
        const strokeWidth = ring === 'flow' ? 2 : 5;
        const radius = 48;
        const center = 60;
        const circumference = 2 * Math.PI * radius;

        const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        track.classList.add('rt-inquiry-ring-track');
        track.setAttribute('cx', String(center));
        track.setAttribute('cy', String(center));
        track.setAttribute('r', String(radius));
        track.setAttribute('fill', 'none');
        track.setAttribute('stroke-width', String(strokeWidth));

        const progress = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        progress.classList.add('rt-inquiry-ring-progress');
        progress.setAttribute('cx', String(center));
        progress.setAttribute('cy', String(center));
        progress.setAttribute('r', String(radius));
        progress.setAttribute('fill', 'none');
        progress.setAttribute('stroke-width', String(strokeWidth));
        progress.setAttribute('stroke-dasharray', circumference.toFixed(2));
        progress.setAttribute('stroke-dashoffset', circumference.toFixed(2));
        progress.setAttribute('stroke-linecap', 'round');
        progress.setAttribute('transform', `rotate(-90 ${center} ${center})`);
        progress.setAttribute('data-circumference', circumference.toFixed(2));

        svg.appendChild(track);
        svg.appendChild(progress);
        button.appendChild(svg);

        return progress;
    }

    private updateFindingsPanel(): void {
        if (!this.summaryEl || !this.verdictEl || !this.findingsListEl || !this.detailsEl) return;
        const result = this.state.activeResult;

        if (!result) {
            this.summaryEl.textContent = 'No inquiry run yet.';
            this.verdictEl.textContent = 'Run an inquiry to see verdicts.';
            this.findingsListEl.empty();
            this.detailsEl.querySelectorAll('.rt-inquiry-detail-row').forEach(el => el.textContent = 'Details not available');
            this.updateArtifactPreview();
            return;
        }

        this.summaryEl.textContent = result.summary;
        this.verdictEl.textContent = `Flow ${this.formatMetricDisplay(result.verdict.flow)} · Depth ${this.formatMetricDisplay(result.verdict.depth)} · Severity ${result.verdict.severity} · Confidence ${result.verdict.confidence}`;

        this.findingsListEl.empty();
        result.findings.forEach(finding => {
            const item = this.findingsListEl!.createDiv({ cls: 'rt-inquiry-finding' });
            item.classList.add(`is-severity-${finding.severity}`);
            item.createDiv({ cls: 'rt-inquiry-finding-head', text: finding.headline });
            const meta = item.createDiv({ cls: 'rt-inquiry-finding-meta' });
            meta.createSpan({ text: `Kind: ${finding.kind}` });
            meta.createSpan({ text: `Evidence: ${finding.evidenceType}` });
            meta.createSpan({ text: `Confidence: ${finding.confidence}` });
            const bullets = item.createDiv({ cls: 'rt-inquiry-finding-bullets' });
            finding.bullets.forEach(bullet => bullets.createDiv({ text: bullet }));
        });

        const detailRows = this.detailsEl.querySelectorAll('.rt-inquiry-detail-row');
        if (detailRows.length >= 2) {
            detailRows[0].textContent = `Corpus fingerprint: ${result.corpusFingerprint || 'not available'}`;
            detailRows[1].textContent = `Cache status: ${this.state.cacheStatus || 'missing'}`;
        }

        this.updateArtifactPreview();
    }

    private updateArtifactPreview(): void {
        if (!this.artifactPreviewEl) return;
        const isOpen = !!this.state.artifactPreviewOpen;
        this.artifactPreviewEl.classList.toggle('rt-hidden', !isOpen);
        if (!isOpen) {
            this.artifactPreviewEl.empty();
            return;
        }
        const result = this.state.activeResult;
        if (!result) {
            this.artifactPreviewEl.textContent = 'Run an inquiry to preview the artifact.';
            return;
        }
        this.artifactPreviewEl.empty();
        this.artifactPreviewEl.createDiv({ cls: 'rt-inquiry-artifact-preview-title', text: 'Artifact preview (unsaved)' });
        const pre = this.artifactPreviewEl.createEl('pre', { cls: 'rt-inquiry-artifact-preview-body' });
        pre.textContent = this.buildArtifactContent(result, this.plugin.settings.inquiryEmbedJson ?? true);
    }

    private updateFooterStatus(): void {
        if (this.cacheStatusEl) {
            this.cacheStatusEl.textContent = `Cache: ${this.state.cacheStatus || 'none'}`;
        }
        if (this.confidenceEl) {
            const confidence = this.state.activeResult?.verdict.confidence || 'none';
            this.confidenceEl.textContent = `Confidence: ${confidence}`;
        }
    }

    private updateNavigationIcons(): void {
        if (!this.navPrevButton || !this.navNextButton) return;
        const isSaga = this.state.scope === 'saga';
        this.navPrevButton.empty?.();
        this.navNextButton.empty?.();
        setIcon(this.navPrevButton, isSaga ? 'chevron-up' : 'chevron-left');
        setIcon(this.navNextButton, isSaga ? 'chevron-down' : 'chevron-right');
    }

    private handleScopeChange(scope: InquiryScope): void {
        if (!scope || scope === this.state.scope) return;
        if (scope === 'saga') {
            this.state.scope = 'saga';
            if (!this.state.focusBookId) this.state.focusBookId = '1';
        } else {
            const bookId = this.state.focusBookId || '1';
            this.state.scope = 'book';
            this.state.focusSceneId = this.getFocusSceneForBook(bookId);
        }
        this.refreshUI();
    }

    private handleModeChange(mode: InquiryMode): void {
        if (!mode || mode === this.state.mode) return;
        this.state.mode = mode;
        this.state.activeResult = null;
        this.refreshUI();
    }

    private handleGlyphClick(): void {
        if (this.state.scope === 'saga') {
            const bookId = this.state.focusBookId || '1';
            this.state.scope = 'book';
            this.state.focusSceneId = this.getFocusSceneForBook(bookId);
            this.refreshUI();
            return;
        }
        this.glyphButton?.classList.toggle('is-expanded');
    }

    private handleQuestionClick(question: InquiryQuestion): void {
        this.state.activeQuestionId = question.id;
        this.state.activeZone = question.zone;

        // Each inquiry produces two compressed answers (flow + depth). Keep this dual-answer model intact.
        const result = this.buildPlaceholderResult(question);
        this.state.activeResult = result;
        this.state.cacheStatus = 'fresh';
        this.state.corpusFingerprint = result.corpusFingerprint;
        this.updateMinimapFocus();
        this.refreshUI();
    }

    private buildPlaceholderResult(question: InquiryQuestion): InquiryResult {
        const focusId = this.getFocusLabel();
        const runId = `run-${Date.now()}`;
        const findings: InquiryFinding[] = [
            {
                refId: focusId,
                kind: 'continuity',
                status: 'unclear',
                severity: 'medium',
                confidence: 'low',
                headline: 'Potential continuity gap detected.',
                bullets: ['Focus relies on prior setup not yet confirmed.'],
                related: [],
                evidenceType: 'scene'
            }
        ];

        return {
            runId,
            scope: this.state.scope,
            focusId,
            mode: this.state.mode,
            questionId: question.id,
            summary: `Preview result for ${question.label.toLowerCase()}.`,
            verdict: {
                flow: 62,
                depth: 48,
                severity: 'medium',
                confidence: 'low'
            },
            findings,
            corpusFingerprint: 'placeholder'
        };
    }

    private setFocusByIndex(index: number): void {
        if (this.state.scope === 'saga') {
            this.state.focusBookId = String(index);
        } else {
            this.state.focusSceneId = String(index);
            if (this.state.focusBookId) {
                this.lastFocusSceneByBookId.set(this.state.focusBookId, String(index));
            }
        }
        this.updateMinimapFocus();
        this.updateFocusGlyph();
    }

    private shiftFocus(delta: number): void {
        const count = this.state.scope === 'saga' ? DEFAULT_BOOK_COUNT : DEFAULT_SCENE_COUNT;
        const current = this.getFocusIndex();
        const next = Math.min(Math.max(current + delta, 1), count);
        this.setFocusByIndex(next);
    }

    private getFocusIndex(): number {
        const raw = this.state.scope === 'saga' ? this.state.focusBookId : this.state.focusSceneId;
        const parsed = Number(raw || '1');
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    }

    private getFocusLabel(): string {
        const raw = this.state.scope === 'saga' ? this.state.focusBookId : this.state.focusSceneId;
        return this.formatFocusNumber(raw);
    }

    private formatFocusNumber(raw?: string): string {
        const parsed = Number(raw || '1');
        if (!Number.isFinite(parsed)) return '1';
        const clamped = Math.min(Math.max(Math.floor(parsed), 1), 999);
        return String(clamped);
    }

    private getFocusSceneForBook(bookId: string): string {
        const prior = this.lastFocusSceneByBookId.get(bookId);
        return prior || '1';
    }

    private buildFocusHoverText(): string {
        const label = this.getFocusLabel();
        const scopeLabel = this.state.scope === 'saga' ? 'Book focus' : 'Scene focus';
        return `${scopeLabel}: ${label}. No inquiry run yet.`;
    }

    private buildRingHoverText(ring: InquiryMode): string {
        if (!this.state.activeResult) {
            return `${ring === 'flow' ? 'Flow' : 'Depth'} verdict unavailable. Run an inquiry.`;
        }
        const verdict = this.state.activeResult.verdict;
        const score = ring === 'flow' ? verdict.flow : verdict.depth;
        return `${ring === 'flow' ? 'Flow' : 'Depth'} score ${this.formatMetricDisplay(score)}. Severity ${verdict.severity}. Confidence ${verdict.confidence}.`;
    }

    private formatMetricDisplay(value: number): string {
        if (!Number.isFinite(value)) return '0';
        if (value > 1) return String(Math.round(value));
        return String(Math.round(value * 100));
    }

    private setHoverText(text: string): void {
        if (this.hoverTextEl) {
            this.hoverTextEl.textContent = text;
        }
    }

    private clearHoverText(): void {
        if (this.hoverTextEl) {
            this.hoverTextEl.textContent = 'Hover to preview context.';
        }
    }

    private toggleDetails(): void {
        if (!this.detailsEl || !this.detailsToggle) return;
        const isOpen = !this.detailsEl.classList.contains('rt-hidden');
        this.detailsEl.classList.toggle('rt-hidden', isOpen);
        const icon = this.detailsToggle.querySelector('.rt-inquiry-details-icon');
        if (icon instanceof HTMLElement) {
            icon.empty?.();
            setIcon(icon, isOpen ? 'chevron-down' : 'chevron-up');
        }
    }

    private openArtifactPreview(): void {
        if (!this.state.activeResult) {
            new Notice('Run an inquiry before previewing an artifact.');
            return;
        }
        this.state.artifactPreviewOpen = true;
        this.updateArtifactPreview();
    }

    private async saveArtifact(): Promise<void> {
        const result = this.state.activeResult;
        if (!result) {
            new Notice('Run an inquiry before saving an artifact.');
            return;
        }

        const folder = await ensureInquiryArtifactFolder(this.app, this.plugin.settings);
        if (!folder) {
            new Notice('Unable to create artifact folder.');
            return;
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const baseName = `Inquiry-${timestamp}`;
        const filePath = this.getAvailableArtifactPath(folder.path, baseName);
        const content = this.buildArtifactContent(result, this.plugin.settings.inquiryEmbedJson ?? true);

        try {
            const file = await this.app.vault.create(filePath, content);
            await openOrRevealFile(this.app, file);
            new Notice('Inquiry artifact saved.');
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            new Notice(`Unable to save artifact: ${message}`);
        }
    }

    private buildArtifactContent(result: InquiryResult, embedJson: boolean): string {
        const generatedAt = new Date().toISOString();
        const artifactId = `artifact-${Date.now()}`;
        const questionIds = result.questionId ? `\n  - ${result.questionId}` : '';
        const fingerprint = result.corpusFingerprint || 'not available';

        const frontmatter = [
            '---',
            `artifactId: ${artifactId}`,
            `generatedAt: ${generatedAt}`,
            `scope: ${result.scope}`,
            `targetId: ${result.focusId}`,
            `mode: ${result.mode}`,
            `questionIds:${questionIds}`,
            `pluginVersion: ${this.plugin.manifest.version}`,
            `corpusFingerprint: ${fingerprint}`,
            '---',
            ''
        ].join('\n');

        const findingsLines = result.findings.map(finding => {
            const bullets = finding.bullets.map(bullet => `  - ${bullet}`).join('\n');
            return `- ${finding.headline} (${finding.kind}, ${finding.severity}, ${finding.confidence})\n${bullets}`;
        }).join('\n');

        const summarySection = [
            '## Executive summary',
            result.summary,
            '',
            '## Verdict',
            `Flow: ${result.verdict.flow.toFixed(2)}`,
            `Depth: ${result.verdict.depth.toFixed(2)}`,
            `Severity: ${result.verdict.severity}`,
            `Confidence: ${result.verdict.confidence}`,
            '',
            '## Findings',
            findingsLines || '- No findings',
            ''
        ].join('\n');

        const payload = embedJson
            ? [
                '## RT Artifact Data (Do Not Edit)',
                '```json',
                JSON.stringify(result, null, 2),
                '```',
                ''
            ].join('\n')
            : '';

        return `${frontmatter}${summarySection}${payload}`;
    }

    private getAvailableArtifactPath(folderPath: string, baseName: string): string {
        const sanitizedFolder = normalizePath(folderPath);
        let attempt = 0;
        while (attempt < 50) {
            const suffix = attempt === 0 ? '' : `-${attempt}`;
            const filePath = `${sanitizedFolder}/${baseName}${suffix}.md`;
            if (!this.app.vault.getAbstractFileByPath(filePath)) {
                return filePath;
            }
            attempt += 1;
        }
        return `${sanitizedFolder}/${baseName}-${Date.now()}.md`;
    }

    private async openArtifactsFolder(): Promise<void> {
        const folderPath = resolveInquiryArtifactFolder(this.plugin.settings);
        const folder = await ensureInquiryArtifactFolder(this.app, this.plugin.settings);
        if (!folder) {
            new Notice(`Unable to access folder: ${folderPath}`);
            return;
        }
        this.revealInFileExplorer(folder);
    }

    private async openMostRecentArtifact(): Promise<void> {
        const file = getMostRecentArtifactFile(this.app, this.plugin.settings);
        if (!file) {
            new Notice('No artifacts found.');
            return;
        }
        await openOrRevealFile(this.app, file);
    }

    private revealInFileExplorer(file: TAbstractFile): void {
        const explorerLeaf = this.app.workspace.getLeavesOfType('file-explorer')[0];
        if (!explorerLeaf?.view) {
            new Notice('File explorer not available.');
            return;
        }
        const explorerView = explorerLeaf.view as unknown as { revealInFolder?: (target: TAbstractFile) => void };
        if (!explorerView.revealInFolder) {
            new Notice('Unable to reveal folder.');
            return;
        }
        explorerView.revealInFolder(file);
        this.app.workspace.revealLeaf(explorerLeaf);
    }
}
