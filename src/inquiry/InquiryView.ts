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
import { INQUIRY_SCHEMA_VERSION, INQUIRY_VIEW_DISPLAY_TEXT, INQUIRY_VIEW_TYPE } from './constants';
import {
    createDefaultInquiryState,
    InquiryMode,
    InquiryScope,
    InquiryZone,
    InquiryResult
} from './state';
import { ensureInquiryArtifactFolder, getMostRecentArtifactFile, resolveInquiryArtifactFolder } from './utils/artifacts';
import { openOrRevealFile } from '../utils/fileUtils';
import { InquiryGlyph } from './components/InquiryGlyph';
import { InquiryRunnerStub } from './runner/InquiryRunnerStub';
import type { CorpusManifest, EvidenceParticipationRules } from './runner/types';
import { InquirySessionStore } from './InquirySessionStore';

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
    private scopeBookButton?: HTMLButtonElement;
    private scopeSagaButton?: HTMLButtonElement;
    private modeFlowButton?: HTMLButtonElement;
    private modeDepthButton?: HTMLButtonElement;
    private contextBadgeIcon?: HTMLElement;
    private contextBadgeLabel?: HTMLElement;
    private minimapTicksEl?: HTMLElement;
    private minimapTicks: HTMLButtonElement[] = [];
    private glyph?: InquiryGlyph;
    private glyphHit?: SVGRectElement;
    private flowRingHit?: SVGCircleElement;
    private depthRingHit?: SVGCircleElement;
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
    private runner: InquiryRunnerStub;
    private sessionStore: InquirySessionStore;

    constructor(leaf: WorkspaceLeaf, plugin: RadialTimelinePlugin) {
        super(leaf);
        this.plugin = plugin;
        this.runner = new InquiryRunnerStub();
        this.sessionStore = new InquirySessionStore(plugin);
    }

    getViewType(): string {
        return INQUIRY_VIEW_TYPE;
    }

    getDisplayText(): string {
        return INQUIRY_VIEW_DISPLAY_TEXT;
    }

    getIcon(): string {
        return 'waves';
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
        const wrapper = this.contentEl.createDiv({ cls: 'ert-inquiry-mobile ert-ui' });
        wrapper.createDiv({ cls: 'ert-inquiry-mobile-title', text: 'Desktop required' });
        wrapper.createDiv({
            cls: 'ert-inquiry-mobile-subtitle',
            text: 'Inquiry is available on desktop only. Artifacts remain readable on mobile.'
        });

        const actions = wrapper.createDiv({ cls: 'ert-inquiry-mobile-actions' });
        const openFolderBtn = actions.createEl('button', { cls: 'ert-inquiry-mobile-btn', text: 'Open Artifacts folder' });
        const openLatestBtn = actions.createEl('button', { cls: 'ert-inquiry-mobile-btn', text: 'View most recent Artifact' });

        this.registerDomEvent(openFolderBtn, 'click', () => { void this.openArtifactsFolder(); });
        this.registerDomEvent(openLatestBtn, 'click', () => { void this.openMostRecentArtifact(); });
    }

    private renderDesktopLayout(): void {
        this.rootEl = this.contentEl.createDiv({ cls: 'ert-inquiry-view ert-ui' });

        const header = this.rootEl.createDiv({ cls: 'ert-inquiry-header' });
        const headerLeft = header.createDiv({ cls: 'ert-inquiry-header-group' });
        const headerRight = header.createDiv({ cls: 'ert-inquiry-header-group ert-inquiry-header-right' });

        const scopeField = headerLeft.createDiv({ cls: 'ert-inquiry-control' });
        scopeField.createDiv({ cls: 'ert-inquiry-control-label', text: 'Scope' });
        const scopeToggle = scopeField.createDiv({ cls: 'ert-inquiry-toggle' });
        this.scopeBookButton = scopeToggle.createEl('button', {
            cls: 'ert-inquiry-icon-btn',
            attr: { type: 'button', 'aria-label': 'Book scope' }
        });
        const scopeBookIcon = this.scopeBookButton.createSpan({ cls: 'ert-inquiry-toggle-icon' });
        setIcon(scopeBookIcon, 'columns-2');
        setTooltip(this.scopeBookButton, 'Book scope');
        this.registerDomEvent(this.scopeBookButton, 'click', () => {
            this.handleScopeChange('book');
        });

        this.scopeSagaButton = scopeToggle.createEl('button', {
            cls: 'ert-inquiry-icon-btn',
            attr: { type: 'button', 'aria-label': 'Saga scope' }
        });
        const scopeSagaIcon = this.scopeSagaButton.createSpan({ cls: 'ert-inquiry-toggle-icon' });
        this.setSigmaIcon(scopeSagaIcon);
        setTooltip(this.scopeSagaButton, 'Saga scope');
        this.registerDomEvent(this.scopeSagaButton, 'click', () => {
            this.handleScopeChange('saga');
        });

        const modeField = headerLeft.createDiv({ cls: 'ert-inquiry-control' });
        modeField.createDiv({ cls: 'ert-inquiry-control-label', text: 'Mode' });
        const modeToggle = modeField.createDiv({ cls: 'ert-inquiry-toggle' });
        this.modeFlowButton = modeToggle.createEl('button', {
            cls: 'ert-inquiry-icon-btn',
            attr: { type: 'button', 'aria-label': 'Flow mode' }
        });
        const modeFlowIcon = this.modeFlowButton.createSpan({ cls: 'ert-inquiry-toggle-icon' });
        setIcon(modeFlowIcon, 'waves');
        setTooltip(this.modeFlowButton, 'Flow');
        this.registerDomEvent(this.modeFlowButton, 'click', () => {
            this.handleModeChange('flow');
        });

        this.modeDepthButton = modeToggle.createEl('button', {
            cls: 'ert-inquiry-icon-btn',
            attr: { type: 'button', 'aria-label': 'Depth mode' }
        });
        const modeDepthIcon = this.modeDepthButton.createSpan({ cls: 'ert-inquiry-toggle-icon' });
        setIcon(modeDepthIcon, 'waves-arrow-down');
        setTooltip(this.modeDepthButton, 'Depth');
        this.registerDomEvent(this.modeDepthButton, 'click', () => {
            this.handleModeChange('depth');
        });

        const artifactBtn = headerRight.createEl('button', {
            cls: 'ert-inquiry-icon-btn',
            attr: { type: 'button', 'aria-label': 'Save artifact' }
        });
        setIcon(artifactBtn, 'aperture');
        setTooltip(artifactBtn, 'Save artifact');
        this.registerDomEvent(artifactBtn, 'click', () => { void this.saveArtifact(); });

        const body = this.rootEl.createDiv({ cls: 'ert-inquiry-body' });
        const main = body.createDiv({ cls: 'ert-inquiry-main' });
        const findings = body.createDiv({ cls: 'ert-inquiry-findings' });

        const minimap = main.createDiv({ cls: 'ert-inquiry-minimap' });
        const badge = minimap.createDiv({ cls: 'ert-inquiry-context-badge' });
        this.contextBadgeIcon = badge.createSpan({ cls: 'ert-inquiry-context-badge-icon' });
        this.contextBadgeLabel = badge.createSpan({ cls: 'ert-inquiry-context-badge-label' });
        this.minimapTicksEl = minimap.createDiv({ cls: 'ert-inquiry-minimap-ticks' });

        const zones = main.createDiv({ cls: 'ert-inquiry-zones' });
        this.renderZone(zones, 'setup', 'Setup');
        this.renderZone(zones, 'pressure', 'Pressure');
        this.renderZone(zones, 'payoff', 'Payoff');

        const focusArea = main.createDiv({ cls: 'ert-inquiry-focus-area' });
        const glyphHost = focusArea.createDiv({ cls: 'ert-inquiry-glyph-host' });
        this.glyph = new InquiryGlyph(glyphHost, {
            focusLabel: this.getFocusLabel(),
            flowValue: 0,
            depthValue: 0,
            severity: 'low',
            confidence: 'low'
        });
        this.logInquirySvgDebug();

        this.flowRingHit = this.glyph.flowRingHit;
        this.depthRingHit = this.glyph.depthRingHit;
        this.glyphHit = this.glyph.labelHit;

        this.registerDomEvent(this.glyphHit as unknown as HTMLElement, 'click', () => this.handleGlyphClick());
        this.registerDomEvent(this.flowRingHit as unknown as HTMLElement, 'click', () => this.openReportPreview());
        this.registerDomEvent(this.depthRingHit as unknown as HTMLElement, 'click', () => this.openReportPreview());

        this.registerDomEvent(this.glyphHit as unknown as HTMLElement, 'pointerenter', () => {
            this.setHoverText(this.buildFocusHoverText());
        });
        this.registerDomEvent(this.glyphHit as unknown as HTMLElement, 'pointerleave', () => this.clearHoverText());
        this.registerDomEvent(this.flowRingHit as unknown as HTMLElement, 'pointerenter', () => {
            this.setHoverText(this.buildRingHoverText('flow'));
        });
        this.registerDomEvent(this.flowRingHit as unknown as HTMLElement, 'pointerleave', () => this.clearHoverText());
        this.registerDomEvent(this.depthRingHit as unknown as HTMLElement, 'pointerenter', () => {
            this.setHoverText(this.buildRingHoverText('depth'));
        });
        this.registerDomEvent(this.depthRingHit as unknown as HTMLElement, 'pointerleave', () => this.clearHoverText());

        this.hoverTextEl = main.createDiv({ cls: 'ert-inquiry-hover', text: 'Hover to preview context.' });

        const findingsHeader = findings.createDiv({ cls: 'ert-inquiry-findings-header' });
        findingsHeader.createDiv({ cls: 'ert-inquiry-findings-title', text: 'Findings' });
        this.detailsToggle = findingsHeader.createEl('button', {
            cls: 'ert-inquiry-details-toggle',
            attr: { type: 'button', 'aria-label': 'Toggle details' }
        });
        const detailsIcon = this.detailsToggle.createSpan({ cls: 'ert-inquiry-details-icon' });
        setIcon(detailsIcon, 'chevron-down');
        this.registerDomEvent(this.detailsToggle, 'click', () => this.toggleDetails());

        this.detailsEl = findings.createDiv({ cls: 'ert-inquiry-details ert-hidden' });
        this.detailsEl.createDiv({ cls: 'ert-inquiry-detail-row', text: 'Corpus fingerprint: not available' });
        this.detailsEl.createDiv({ cls: 'ert-inquiry-detail-row', text: 'Cache status: not available' });

        this.summaryEl = findings.createDiv({ cls: 'ert-inquiry-summary', text: 'No inquiry run yet.' });
        this.verdictEl = findings.createDiv({ cls: 'ert-inquiry-verdict', text: 'Run an inquiry to see verdicts.' });
        this.findingsListEl = findings.createDiv({ cls: 'ert-inquiry-findings-list' });

        this.artifactPreviewEl = findings.createDiv({ cls: 'ert-inquiry-report-preview ert-hidden' });

        const footer = this.rootEl.createDiv({ cls: 'ert-inquiry-footer' });
        const nav = footer.createDiv({ cls: 'ert-inquiry-nav' });
        this.navPrevButton = nav.createEl('button', {
            cls: 'ert-inquiry-nav-btn ert-inquiry-icon-btn',
            attr: { type: 'button', 'aria-label': 'Previous focus' }
        });
        this.navNextButton = nav.createEl('button', {
            cls: 'ert-inquiry-nav-btn ert-inquiry-icon-btn',
            attr: { type: 'button', 'aria-label': 'Next focus' }
        });
        this.registerDomEvent(this.navPrevButton, 'click', () => this.shiftFocus(-1));
        this.registerDomEvent(this.navNextButton, 'click', () => this.shiftFocus(1));

        const status = footer.createDiv({ cls: 'ert-inquiry-status' });
        this.cacheStatusEl = status.createDiv({ cls: 'ert-inquiry-status-item', text: 'Cache: none' });
        this.confidenceEl = status.createDiv({ cls: 'ert-inquiry-status-item', text: 'Confidence: none' });
    }

    private renderZone(container: HTMLElement, zone: InquiryZone, label: string): void {
        const zoneEl = container.createDiv({ cls: `ert-inquiry-zone ert-inquiry-zone--${zone}` });
        zoneEl.createDiv({ cls: 'ert-inquiry-zone-label', text: label });
        const tray = zoneEl.createDiv({ cls: 'ert-inquiry-zone-tray' });
        for (let i = 0; i < 3; i += 1) {
            tray.createSpan({ cls: 'ert-inquiry-zone-tray-dot' });
        }
        const icons = zoneEl.createDiv({ cls: 'ert-inquiry-zone-icons' });

        const questions = BUILT_IN_QUESTIONS.filter(q => q.zone === zone);
        questions.forEach(question => {
            const btn = icons.createEl('button', {
                cls: 'ert-inquiry-zone-icon ert-inquiry-icon-btn',
                attr: { type: 'button', 'aria-label': question.label }
            });
            const iconEl = btn.createSpan({ cls: 'ert-inquiry-zone-icon-svg' });
            setIcon(iconEl, question.icon);
            setTooltip(btn, question.label);
            this.registerDomEvent(btn, 'click', () => this.handleQuestionClick(question));
        });
    }

    private refreshUI(): void {
        this.updateScopeToggle();
        this.updateModeToggle();
        this.updateModeClass();
        this.updateContextBadge();
        this.renderMinimapTicks();
        this.updateFocusGlyph();
        this.updateRings();
        this.updateFindingsPanel();
        this.updateFooterStatus();
        this.updateNavigationIcons();
    }

    private updateModeClass(): void {
        if (!this.rootEl) return;
        this.rootEl.classList.toggle('is-mode-flow', this.state.mode === 'flow');
        this.rootEl.classList.toggle('is-mode-depth', this.state.mode === 'depth');
    }

    private updateScopeToggle(): void {
        this.updateToggleButton(this.scopeBookButton, this.state.scope === 'book');
        this.updateToggleButton(this.scopeSagaButton, this.state.scope === 'saga');
    }

    private updateModeToggle(): void {
        this.updateToggleButton(this.modeFlowButton, this.state.mode === 'flow');
        this.updateToggleButton(this.modeDepthButton, this.state.mode === 'depth');
    }

    private updateToggleButton(button: HTMLButtonElement | undefined, isActive: boolean): void {
        if (!button) return;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    }

    private updateContextBadge(): void {
        if (!this.contextBadgeIcon || !this.contextBadgeLabel) return;
        const isSaga = this.state.scope === 'saga';
        this.contextBadgeIcon.empty?.();
        if (isSaga) {
            this.setSigmaIcon(this.contextBadgeIcon);
        } else {
            setIcon(this.contextBadgeIcon, 'columns-2');
        }
        this.contextBadgeLabel.textContent = isSaga ? 'Saga context' : 'Book context';
    }

    private logInquirySvgDebug(): void {
        const svg = this.glyph?.svg;
        const viewBox = svg?.getAttribute('viewBox');
        const frame = svg?.querySelector('.ert-inquiry-glyph-frame');
        const rings = svg?.querySelectorAll('.ert-inquiry-ring-progress')?.length || 0;
        console.info('[Inquiry] SVG debug', {
            hasSvg: !!svg,
            viewBox,
            hasFrame: !!frame,
            ringCount: rings
        });
    }

    private setSigmaIcon(target: HTMLElement): void {
        target.empty?.();
        setIcon(target, 'sigma');
        if (target.querySelector('svg')) return;
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.classList.add('ert-inquiry-sigma-fallback');
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', '12');
        text.setAttribute('y', '12');
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'middle');
        text.textContent = String.fromCharCode(931);
        svg.appendChild(text);
        target.appendChild(svg);
    }

    private renderMinimapTicks(): void {
        if (!this.minimapTicksEl) return;
        this.minimapTicksEl.empty();
        this.minimapTicks = [];

        const count = this.state.scope === 'saga' ? DEFAULT_BOOK_COUNT : DEFAULT_SCENE_COUNT;
        for (let i = 1; i <= count; i += 1) {
            const tick = this.minimapTicksEl.createEl('button', {
                cls: 'ert-inquiry-minimap-tick',
                attr: { type: 'button', 'data-index': String(i) }
            });
            const label = this.state.scope === 'saga' ? `B${i}` : `S${i}`;
            tick.setAttribute('aria-label', `Focus ${label}`);
            this.registerDomEvent(tick, 'click', () => this.setFocusByIndex(i));
            this.registerDomEvent(tick, 'pointerenter', () => {
                this.setHoverText(`Focus ${label}. No findings yet.`);
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
        this.glyph?.update({ focusLabel: this.getFocusLabel() });
    }

    private updateRings(): void {
        const result = this.state.activeResult;
        const flowValue = result ? this.normalizeMetricValue(result.verdict.flow) : 0;
        const depthValue = result ? this.normalizeMetricValue(result.verdict.depth) : 0;
        const severity = result ? result.verdict.severity : 'low';
        const confidence = result ? result.verdict.confidence : 'low';

        this.glyph?.update({
            focusLabel: this.getFocusLabel(),
            flowValue,
            depthValue,
            severity,
            confidence
        });
    }

    private updateFindingsPanel(): void {
        if (!this.summaryEl || !this.verdictEl || !this.findingsListEl || !this.detailsEl) return;
        const result = this.state.activeResult;
        if (this.rootEl) {
            const hasError = !!result?.findings.some(finding => finding.kind === 'error');
            this.rootEl.classList.toggle('is-error', hasError);
        }

        if (!result) {
            this.summaryEl.textContent = 'No inquiry run yet.';
            this.verdictEl.textContent = 'Run an inquiry to see verdicts.';
            this.findingsListEl.empty();
            this.detailsEl.querySelectorAll('.ert-inquiry-detail-row').forEach(el => el.textContent = 'Details not available');
            this.updateArtifactPreview();
            return;
        }

        this.summaryEl.textContent = result.summary;
        this.verdictEl.textContent = `Flow ${this.formatMetricDisplay(result.verdict.flow)} · Depth ${this.formatMetricDisplay(result.verdict.depth)} · Severity ${result.verdict.severity} · Confidence ${result.verdict.confidence}`;

        this.findingsListEl.empty();
        result.findings.forEach(finding => {
            const item = this.findingsListEl!.createDiv({ cls: 'ert-inquiry-finding' });
            item.classList.add(`is-severity-${finding.severity}`);
            item.createDiv({ cls: 'ert-inquiry-finding-head', text: finding.headline });
            const meta = item.createDiv({ cls: 'ert-inquiry-finding-meta' });
            meta.createSpan({ text: `Kind: ${finding.kind}` });
            meta.createSpan({ text: `Evidence: ${finding.evidenceType}` });
            meta.createSpan({ text: `Confidence: ${finding.confidence}` });
            const bullets = item.createDiv({ cls: 'ert-inquiry-finding-bullets' });
            finding.bullets.forEach(bullet => bullets.createDiv({ text: bullet }));
        });

        const detailRows = this.detailsEl.querySelectorAll('.ert-inquiry-detail-row');
        if (detailRows.length >= 2) {
            detailRows[0].textContent = `Corpus fingerprint: ${result.corpusFingerprint || 'not available'}`;
            const cacheEnabled = this.plugin.settings.inquiryCacheEnabled ?? true;
            const cacheText = cacheEnabled ? (this.state.cacheStatus || 'missing') : 'off';
            detailRows[1].textContent = `Cache status: ${cacheText}`;
        }

        this.updateArtifactPreview();
    }

    private updateArtifactPreview(): void {
        if (!this.artifactPreviewEl) return;
        const isOpen = !!this.state.reportPreviewOpen;
        this.artifactPreviewEl.classList.toggle('ert-hidden', !isOpen);
        if (!isOpen) {
            this.artifactPreviewEl.empty();
            return;
        }
        const result = this.state.activeResult;
        if (!result) {
            this.artifactPreviewEl.textContent = 'Run an inquiry to preview the report.';
            return;
        }
        this.artifactPreviewEl.empty();
        this.artifactPreviewEl.createDiv({ cls: 'ert-inquiry-report-preview-title', text: 'Report preview (unsaved)' });
        const pre = this.artifactPreviewEl.createEl('pre', { cls: 'ert-inquiry-report-preview-body' });
        pre.textContent = this.buildArtifactContent(result, this.plugin.settings.inquiryEmbedJson ?? true);
    }

    private updateFooterStatus(): void {
        if (this.cacheStatusEl) {
            const cacheEnabled = this.plugin.settings.inquiryCacheEnabled ?? true;
            const cacheText = cacheEnabled ? (this.state.cacheStatus || 'none') : 'off';
            this.cacheStatusEl.textContent = `Cache: ${cacheText}`;
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
        this.glyph?.root.classList.toggle('is-expanded');
    }

    private async handleQuestionClick(question: InquiryQuestion): Promise<void> {
        this.state.activeQuestionId = question.id;
        this.state.activeZone = question.zone;
        this.state.isRunning = true;

        const manifest = this.buildCorpusManifest(question.id);
        const focusLabel = this.getFocusLabel();
        const baseKey = this.sessionStore.buildBaseKey({
            questionId: question.id,
            scope: this.state.scope,
            focusId: focusLabel,
            mode: this.state.mode
        });
        const cacheEnabled = this.plugin.settings.inquiryCacheEnabled ?? true;
        const key = this.sessionStore.buildKey(baseKey, manifest.fingerprint);

        if (cacheEnabled) {
            const cached = this.sessionStore.getSession(key);
            if (cached) {
                this.applySession(cached, 'fresh');
                return;
            }
            const prior = this.sessionStore.getLatestByBaseKey(baseKey);
            if (prior && prior.result.corpusFingerprint !== manifest.fingerprint) {
                this.state.cacheStatus = 'stale';
                this.sessionStore.markStaleByBaseKey(baseKey);
            } else {
                this.state.cacheStatus = 'missing';
            }
        } else {
            this.state.cacheStatus = 'missing';
        }

        try {
            // Each inquiry produces two compressed answers (flow + depth). Keep this dual-answer model intact.
            const result = await this.runner.run({
                scope: this.state.scope,
                focusLabel,
                focusSceneId: this.state.scope === 'book' ? this.state.focusSceneId : undefined,
                focusBookId: this.state.scope === 'saga' ? this.state.focusBookId : this.state.focusBookId,
                mode: this.state.mode,
                questionId: question.id,
                questionText: question.question,
                questionZone: question.zone,
                corpus: manifest,
                rules: this.getEvidenceRules()
            });

            this.state.activeResult = result;
            this.state.corpusFingerprint = result.corpusFingerprint;
            this.state.cacheStatus = 'fresh';

            if (cacheEnabled) {
                this.sessionStore.setSession({
                    key,
                    baseKey,
                    result,
                    createdAt: Date.now(),
                    lastAccessed: Date.now()
                });
            }
        } catch (error) {
            const fallback = this.buildErrorFallback(question, focusLabel, manifest.fingerprint, error);
            this.state.activeResult = fallback;
            this.state.cacheStatus = 'missing';
        } finally {
            this.state.isRunning = false;
            this.updateMinimapFocus();
            this.refreshUI();
        }
    }

    private applySession(session: { result: InquiryResult }, cacheStatus: 'fresh' | 'stale' | 'missing'): void {
        this.state.activeResult = session.result;
        this.state.corpusFingerprint = session.result.corpusFingerprint;
        this.state.cacheStatus = cacheStatus;
        this.state.isRunning = false;
        this.updateMinimapFocus();
        this.refreshUI();
    }

    private buildErrorFallback(
        question: InquiryQuestion,
        focusLabel: string,
        fingerprint: string,
        error: unknown
    ): InquiryResult {
        const message = error instanceof Error ? error.message : 'Runner error';
        return {
            runId: `run-${Date.now()}`,
            scope: this.state.scope,
            focusId: focusLabel,
            mode: this.state.mode,
            questionId: question.id,
            summary: 'Inquiry failed; fallback result returned.',
            verdict: {
                flow: 0,
                depth: 0,
                severity: 'high',
                confidence: 'low'
            },
            findings: [{
                refId: focusLabel,
                kind: 'error',
                status: 'unclear',
                severity: 'high',
                confidence: 'low',
                headline: 'Inquiry runner error.',
                bullets: [message],
                related: [],
                evidenceType: 'mixed'
            }],
            corpusFingerprint: fingerprint
        };
    }

    private getEvidenceRules(): EvidenceParticipationRules {
        return {
            sagaOutlineScope: 'saga-only',
            bookOutlineScope: 'book-only',
            crossScopeUsage: 'conflict-only'
        };
    }

    private buildCorpusManifest(questionId: string): CorpusManifest {
        const sources = this.plugin.settings.inquirySources || {};
        const entries: CorpusManifest['entries'] = [];
        const now = Date.now();

        const addEntries = (paths: string[] | undefined, data: { class: 'scene' | 'outline' | 'character' | 'place' | 'power'; scope?: InquiryScope }) => {
            if (!paths) return;
            paths.forEach(rawPath => {
                const path = normalizePath(rawPath);
                if (!path) return;
                const file = this.app.vault.getAbstractFileByPath(path);
                const mtime = file && 'stat' in file ? (file as { stat: { mtime: number } }).stat.mtime : now;
                entries.push({
                    path,
                    mtime,
                    class: data.class,
                    scope: data.scope
                });
            });
        };

        addEntries(sources.sceneFolders, { class: 'scene', scope: 'book' });
        addEntries(sources.bookOutlineFiles, { class: 'outline', scope: 'book' });
        addEntries(sources.characterFolders, { class: 'character' });
        addEntries(sources.placeFolders, { class: 'place' });
        addEntries(sources.powerFolders, { class: 'power' });

        if (sources.sagaOutlineFile) {
            addEntries([sources.sagaOutlineFile], { class: 'outline', scope: 'saga' });
        }

        const fingerprintSource = entries
            .map(entry => `${entry.path}:${entry.mtime}`)
            .sort()
            .join('|');
        const fingerprintRaw = `${INQUIRY_SCHEMA_VERSION}|${questionId}|${fingerprintSource}`;
        const fingerprint = this.hashString(fingerprintRaw);

        return {
            entries,
            fingerprint,
            generatedAt: now
        };
    }

    private hashString(value: string): string {
        let hash = 0;
        for (let i = 0; i < value.length; i += 1) {
            hash = ((hash << 5) - hash) + value.charCodeAt(i);
            hash |= 0;
        }
        return `h${Math.abs(hash)}`;
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
        const prefix = this.state.scope === 'saga' ? 'B' : 'S';
        return `${prefix}${this.formatFocusNumber(raw)}`;
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

    private normalizeMetricValue(value: number): number {
        if (!Number.isFinite(value)) return 0;
        if (value > 1) {
            const clamped = Math.min(Math.max(value, 5), 100);
            return clamped / 100;
        }
        return Math.min(Math.max(value, 0), 1);
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
        const isOpen = !this.detailsEl.classList.contains('ert-hidden');
        this.detailsEl.classList.toggle('ert-hidden', isOpen);
        const icon = this.detailsToggle.querySelector('.ert-inquiry-details-icon');
        if (icon instanceof HTMLElement) {
            icon.empty?.();
            setIcon(icon, isOpen ? 'chevron-down' : 'chevron-up');
        }
    }

    private openReportPreview(): void {
        if (!this.state.activeResult) {
            new Notice('Run an inquiry before previewing a report.');
            return;
        }
        this.state.reportPreviewOpen = true;
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
            `Flow: ${this.formatMetricDisplay(result.verdict.flow)}`,
            `Depth: ${this.formatMetricDisplay(result.verdict.depth)}`,
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
