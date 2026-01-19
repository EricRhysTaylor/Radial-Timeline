import {
    ItemView,
    WorkspaceLeaf,
    Platform,
    Notice,
    setIcon,
    TAbstractFile,
    normalizePath
} from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { INQUIRY_SCHEMA_VERSION, INQUIRY_VIEW_DISPLAY_TEXT, INQUIRY_VIEW_TYPE } from './constants';
import {
    createDefaultInquiryState,
    InquiryFinding,
    InquiryMode,
    InquiryResult,
    InquiryScope,
    InquirySeverity,
    InquiryZone
} from './state';
import { ensureInquiryArtifactFolder, getMostRecentArtifactFile, resolveInquiryArtifactFolder } from './utils/artifacts';
import { openOrRevealFile } from '../utils/fileUtils';
import { InquiryGlyph, FLOW_RADIUS, FLOW_STROKE } from './components/InquiryGlyph';
import { InquiryRunnerStub } from './runner/InquiryRunnerStub';
import type { CorpusManifest, EvidenceParticipationRules } from './runner/types';
import { InquirySessionStore } from './InquirySessionStore';
import { normalizeFrontmatterKeys } from '../utils/frontmatter';
import type { InquirySourcesSettings } from '../types/settings';
import {
    MAX_RESOLVED_SCAN_ROOTS,
    normalizeScanRootPatterns,
    resolveScanRoots,
    toVaultRoot
} from './utils/scanRoots';

const DEFAULT_BOOK_COUNT = 5;
const DEFAULT_SCENE_COUNT = 12;
const GLYPH_TARGET_PX = 190;
const GLYPH_PLACEHOLDER_FLOW = 0.75;
const GLYPH_PLACEHOLDER_DEPTH = 0.30;
const DEBUG_SVG_OVERLAY = true;
const SVG_NS = 'http://www.w3.org/2000/svg';
const VIEWBOX_MIN = -800;
const VIEWBOX_MAX = 800;
const VIEWBOX_SIZE = 1600;
const INQUIRY_REFERENCE_ONLY_CLASSES = new Set(['character', 'place', 'power']);

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

    private rootSvg?: SVGSVGElement;
    private scopeToggleButton?: SVGGElement;
    private scopeToggleIcon?: SVGUseElement;
    private modeToggleButton?: SVGGElement;
    private modeToggleIcon?: SVGUseElement;
    private artifactButton?: SVGGElement;
    private contextBadgeIcon?: SVGUseElement;
    private contextBadgeSigmaText?: SVGTextElement;
    private contextBadgeLabel?: SVGTextElement;
    private minimapTicksEl?: SVGGElement;
    private minimapBaseline?: SVGLineElement;
    private minimapTicks: SVGRectElement[] = [];
    private minimapLayout?: { startX: number; length: number };
    private glyphAnchor?: SVGGElement;
    private glyph?: InquiryGlyph;
    private glyphHit?: SVGRectElement;
    private flowRingHit?: SVGCircleElement;
    private depthRingHit?: SVGCircleElement;
    private summaryEl?: SVGTextElement;
    private verdictEl?: SVGTextElement;
    private findingsListEl?: SVGGElement;
    private detailsToggle?: SVGGElement;
    private detailsIcon?: SVGUseElement;
    private detailsEl?: SVGGElement;
    private detailRows: SVGTextElement[] = [];
    private artifactPreviewEl?: SVGGElement;
    private artifactPreviewBg?: SVGRectElement;
    private hoverTextEl?: SVGTextElement;
    private cacheStatusEl?: SVGTextElement;
    private confidenceEl?: SVGTextElement;
    private navPrevButton?: SVGGElement;
    private navNextButton?: SVGGElement;
    private navPrevIcon?: SVGUseElement;
    private navNextIcon?: SVGUseElement;
    private iconSymbols = new Set<string>();
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
        const svg = this.createSvgElement('svg');
        svg.classList.add('ert-ui', 'ert-inquiry-svg');
        svg.setAttribute('viewBox', `${VIEWBOX_MIN} ${VIEWBOX_MIN} ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`);
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        this.rootSvg = svg;
        this.contentEl.appendChild(svg);

        const defs = this.createSvgElement('defs');
        this.buildIconSymbols(defs);
        svg.appendChild(defs);

        const background = this.createSvgElement('rect');
        background.classList.add('ert-inquiry-bg');
        background.setAttribute('x', String(VIEWBOX_MIN));
        background.setAttribute('y', String(VIEWBOX_MIN));
        background.setAttribute('width', String(VIEWBOX_SIZE));
        background.setAttribute('height', String(VIEWBOX_SIZE));
        svg.appendChild(background);

        const frame = this.createSvgElement('rect');
        frame.classList.add('ert-inquiry-svg-frame');
        frame.setAttribute('x', String(VIEWBOX_MIN));
        frame.setAttribute('y', String(VIEWBOX_MIN));
        frame.setAttribute('width', String(VIEWBOX_SIZE));
        frame.setAttribute('height', String(VIEWBOX_SIZE));
        svg.appendChild(frame);

        svg.classList.toggle('is-debug', DEBUG_SVG_OVERLAY);
        this.buildDebugOverlay(svg);

        const hudOffsetX = -760;
        const hudOffsetY = -740;
        const hudGroup = this.createSvgGroup(svg, 'ert-inquiry-hud', hudOffsetX, hudOffsetY);
        hudGroup.setAttribute('id', 'inq-hud');
        const canvasGroup = this.createSvgGroup(svg, 'ert-inquiry-canvas');
        canvasGroup.setAttribute('id', 'inq-canvas');

        const iconSize = 56;
        const iconGap = 16;
        const hudMargin = 40;

        this.scopeToggleButton = this.createIconButton(hudGroup, 0, 0, iconSize, 'columns-2', 'Toggle scope');
        this.scopeToggleIcon = this.scopeToggleButton.querySelector('.ert-inquiry-icon') as SVGUseElement;
        this.registerDomEvent(this.scopeToggleButton as unknown as HTMLElement, 'click', () => {
            this.handleScopeChange(this.state.scope === 'book' ? 'saga' : 'book');
        });

        this.modeToggleButton = this.createIconButton(hudGroup, iconSize + iconGap, 0, iconSize, 'waves', 'Toggle mode');
        this.modeToggleIcon = this.modeToggleButton.querySelector('.ert-inquiry-icon') as SVGUseElement;
        this.registerDomEvent(this.modeToggleButton as unknown as HTMLElement, 'click', () => {
            this.handleModeChange(this.state.mode === 'flow' ? 'depth' : 'flow');
        });

        const artifactX = (VIEWBOX_MAX - hudMargin - iconSize) - hudOffsetX;
        this.artifactButton = this.createIconButton(hudGroup, artifactX, 0, iconSize, 'aperture', 'Save artifact');
        this.registerDomEvent(this.artifactButton as unknown as HTMLElement, 'click', () => { void this.saveArtifact(); });

        const minimapGroup = this.createSvgGroup(hudGroup, 'ert-inquiry-minimap', 0, 120);
        const badgeWidth = 160;
        const badgeHeight = 34;
        const badgeGroup = this.createSvgGroup(minimapGroup, 'ert-inquiry-context-badge', 0, -badgeHeight / 2);
        const badgeRect = this.createSvgElement('rect');
        badgeRect.classList.add('ert-inquiry-context-badge-bg');
        badgeRect.setAttribute('width', String(badgeWidth));
        badgeRect.setAttribute('height', String(badgeHeight));
        badgeRect.setAttribute('rx', '18');
        badgeRect.setAttribute('ry', '18');
        badgeGroup.appendChild(badgeRect);
        this.contextBadgeIcon = this.createIconUse('columns-2', 12, 8, 18);
        this.contextBadgeIcon.classList.add('ert-inquiry-context-badge-icon');
        badgeGroup.appendChild(this.contextBadgeIcon);
        this.contextBadgeSigmaText = this.createSvgText(badgeGroup, 'ert-inquiry-context-badge-sigma ert-hidden', String.fromCharCode(931), 20, 18);
        this.contextBadgeLabel = this.createSvgText(badgeGroup, 'ert-inquiry-context-badge-label', 'Book context', 38, 21);

        const baselineStartX = badgeWidth + 24;
        const baselineLength = 420;
        this.minimapLayout = { startX: baselineStartX, length: baselineLength };
        this.minimapBaseline = this.createSvgElement('line');
        this.minimapBaseline.classList.add('ert-inquiry-minimap-baseline');
        minimapGroup.appendChild(this.minimapBaseline);

        this.minimapTicksEl = this.createSvgGroup(minimapGroup, 'ert-inquiry-minimap-ticks', baselineStartX, 0);

        this.renderZonePods(canvasGroup);

        this.glyphAnchor = this.createSvgGroup(canvasGroup, 'ert-inquiry-focus-area');
        this.glyph = new InquiryGlyph(this.glyphAnchor, {
            focusLabel: this.getFocusLabel(),
            flowValue: GLYPH_PLACEHOLDER_FLOW,
            depthValue: GLYPH_PLACEHOLDER_DEPTH,
            severity: 'low',
            confidence: 'low'
        });
        this.logInquirySvgDebug();
        this.updateGlyphScale();
        requestAnimationFrame(() => this.updateGlyphScale());
        this.registerDomEvent(window, 'resize', () => this.updateGlyphScale());

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

        this.hoverTextEl = this.createSvgText(canvasGroup, 'ert-inquiry-hover', 'Hover to preview context.', -200, 360);

        const hudFooterY = 1360;
        const navGroup = this.createSvgGroup(hudGroup, 'ert-inquiry-nav', 0, hudFooterY);
        this.navPrevButton = this.createIconButton(navGroup, 0, -18, 44, 'chevron-left', 'Previous focus', 'ert-inquiry-nav-btn');
        this.navPrevIcon = this.navPrevButton.querySelector('.ert-inquiry-icon') as SVGUseElement;
        this.navNextButton = this.createIconButton(navGroup, 54, -18, 44, 'chevron-right', 'Next focus', 'ert-inquiry-nav-btn');
        this.navNextIcon = this.navNextButton.querySelector('.ert-inquiry-icon') as SVGUseElement;
        this.registerDomEvent(this.navPrevButton as unknown as HTMLElement, 'click', () => this.shiftFocus(-1));
        this.registerDomEvent(this.navNextButton as unknown as HTMLElement, 'click', () => this.shiftFocus(1));

        const statusGroup = this.createSvgGroup(hudGroup, 'ert-inquiry-status', 180, hudFooterY + 6);
        this.cacheStatusEl = this.createSvgText(statusGroup, 'ert-inquiry-status-item', 'Cache: none', 0, 0);
        this.confidenceEl = this.createSvgText(statusGroup, 'ert-inquiry-status-item', 'Confidence: none', 140, 0);
    }

    private createSvgElement<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
        return document.createElementNS(SVG_NS, tag);
    }

    private createSvgGroup(parent: SVGElement, cls: string, x?: number, y?: number): SVGGElement {
        const group = this.createSvgElement('g');
        group.classList.add(...cls.split(' ').filter(Boolean));
        if (typeof x === 'number' || typeof y === 'number') {
            group.setAttribute('transform', `translate(${x ?? 0} ${y ?? 0})`);
        }
        parent.appendChild(group);
        return group;
    }

    private createSvgText(parent: SVGElement, cls: string, text: string, x: number, y: number): SVGTextElement {
        const textEl = this.createSvgElement('text');
        textEl.classList.add(...cls.split(' ').filter(Boolean));
        textEl.setAttribute('x', String(x));
        textEl.setAttribute('y', String(y));
        textEl.textContent = text;
        parent.appendChild(textEl);
        return textEl;
    }

    private clearSvgChildren(el: SVGElement): void {
        while (el.firstChild) {
            el.removeChild(el.firstChild);
        }
    }

    private buildIconSymbols(defs: SVGDefsElement): void {
        this.iconSymbols.clear();
        [
            'waves',
            'waves-arrow-down',
            'columns-2',
            'aperture',
            'chevron-left',
            'chevron-right',
            'chevron-up',
            'chevron-down',
            'help-circle',
            'activity',
            'check-circle',
            'sigma'
        ].forEach(icon => {
            const symbolId = this.createIconSymbol(defs, icon);
            if (symbolId) {
                this.iconSymbols.add(symbolId);
            }
        });
    }

    private createIconSymbol(defs: SVGDefsElement, iconName: string): string | null {
        const holder = document.createElement('span');
        setIcon(holder, iconName);
        const source = holder.querySelector('svg');
        if (!source) {
            if (iconName !== 'sigma') return null;
            const symbol = this.createSvgElement('symbol');
            const symbolId = `ert-icon-${iconName}`;
            symbol.setAttribute('id', symbolId);
            symbol.setAttribute('viewBox', '0 0 24 24');
            const text = this.createSvgElement('text');
            text.setAttribute('x', '12');
            text.setAttribute('y', '13');
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'middle');
            text.setAttribute('font-size', '16');
            text.setAttribute('font-weight', '700');
            text.textContent = String.fromCharCode(931);
            symbol.appendChild(text);
            defs.appendChild(symbol);
            return symbolId;
        }
        const symbol = this.createSvgElement('symbol');
        const symbolId = `ert-icon-${iconName}`;
        symbol.setAttribute('id', symbolId);
        symbol.setAttribute('viewBox', source.getAttribute('viewBox') || '0 0 24 24');
        Array.from(source.children).forEach(child => {
            symbol.appendChild(child.cloneNode(true));
        });
        defs.appendChild(symbol);
        return symbolId;
    }

    private createIconButton(
        parent: SVGElement,
        x: number,
        y: number,
        size: number,
        iconName: string,
        label: string,
        extraClass = ''
    ): SVGGElement {
        const group = this.createSvgGroup(parent, `ert-inquiry-icon-btn ${extraClass}`.trim(), x, y);
        group.setAttribute('role', 'button');
        group.setAttribute('tabindex', '0');
        group.setAttribute('aria-label', label);
        const rect = this.createSvgElement('rect');
        rect.classList.add('ert-inquiry-icon-btn-bg');
        rect.setAttribute('width', String(size));
        rect.setAttribute('height', String(size));
        rect.setAttribute('rx', String(Math.round(size * 0.3)));
        rect.setAttribute('ry', String(Math.round(size * 0.3)));
        group.appendChild(rect);
        const iconSize = Math.round(size * 0.5);
        const icon = this.createIconUse(iconName, (size - iconSize) / 2, (size - iconSize) / 2, iconSize);
        icon.classList.add('ert-inquiry-icon');
        group.appendChild(icon);
        const title = this.createSvgElement('title');
        title.textContent = label;
        group.appendChild(title);
        return group;
    }

    private createIconUse(iconName: string, x: number, y: number, size: number): SVGUseElement {
        const use = this.createSvgElement('use');
        use.setAttribute('x', String(x));
        use.setAttribute('y', String(y));
        use.setAttribute('width', String(size));
        use.setAttribute('height', String(size));
        this.setIconUse(use, iconName);
        return use;
    }

    private setIconUse(use: SVGUseElement | undefined, iconName: string): void {
        if (!use) return;
        const symbolId = `ert-icon-${iconName}`;
        use.setAttribute('href', `#${symbolId}`);
        use.setAttributeNS('http://www.w3.org/1999/xlink', 'href', `#${symbolId}`);
    }

    private renderZonePods(parent: SVGGElement): void {
        const rZone = FLOW_RADIUS + FLOW_STROKE + 90;
        const zones: Array<{ id: InquiryZone; label: string; angle: number }> = [
            { id: 'setup', label: 'Setup', angle: 210 },
            { id: 'pressure', label: 'Pressure', angle: 330 },
            { id: 'payoff', label: 'Payoff', angle: 90 }
        ];

        zones.forEach(zone => {
            const pos = this.polarToCartesian(rZone, zone.angle);
            const zoneEl = this.createSvgGroup(parent, `ert-inquiry-zone-pod ert-inquiry-zone--${zone.id}`, pos.x, pos.y);
            const podWidth = 150;
            const podHeight = 64;
            const bg = this.createSvgElement('rect');
            bg.classList.add('ert-inquiry-zone-bg');
            bg.setAttribute('x', String(-podWidth / 2));
            bg.setAttribute('y', String(-podHeight / 2));
            bg.setAttribute('width', String(podWidth));
            bg.setAttribute('height', String(podHeight));
            bg.setAttribute('rx', '18');
            bg.setAttribute('ry', '18');
            zoneEl.appendChild(bg);

            this.createSvgText(zoneEl, 'ert-inquiry-zone-label', zone.label, -podWidth / 2 + 16, -10);

            const tray = this.createSvgGroup(zoneEl, 'ert-inquiry-zone-tray', -podWidth / 2 + 16, 16);
            for (let i = 0; i < 3; i += 1) {
                const dot = this.createSvgElement('circle');
                dot.classList.add('ert-inquiry-zone-dot');
                dot.setAttribute('cx', String(i * 16));
                dot.setAttribute('cy', '0');
                dot.setAttribute('r', '5');
                tray.appendChild(dot);
            }
            this.registerDomEvent(zoneEl as unknown as HTMLElement, 'pointerenter', () => {
                this.setHoverText(this.buildZoneHoverText(zone.id));
            });
            this.registerDomEvent(zoneEl as unknown as HTMLElement, 'pointerleave', () => this.clearHoverText());
        });
    }

    private polarToCartesian(radius: number, degrees: number): { x: number; y: number } {
        const radians = (degrees * Math.PI) / 180;
        return {
            x: radius * Math.cos(radians),
            y: radius * Math.sin(radians)
        };
    }

    private buildDebugOverlay(parent: SVGElement): void {
        const debugGroup = this.createSvgGroup(parent, 'ert-inquiry-debug');
        debugGroup.setAttribute('id', 'inq-debug');

        const rect = this.createSvgElement('rect');
        rect.classList.add('ert-inquiry-debug-frame');
        rect.setAttribute('x', String(VIEWBOX_MIN));
        rect.setAttribute('y', String(VIEWBOX_MIN));
        rect.setAttribute('width', String(VIEWBOX_SIZE));
        rect.setAttribute('height', String(VIEWBOX_SIZE));
        debugGroup.appendChild(rect);

        const xAxis = this.createSvgElement('line');
        xAxis.classList.add('ert-inquiry-debug-axis');
        xAxis.setAttribute('x1', String(VIEWBOX_MIN));
        xAxis.setAttribute('y1', '0');
        xAxis.setAttribute('x2', String(VIEWBOX_MAX));
        xAxis.setAttribute('y2', '0');
        debugGroup.appendChild(xAxis);

        const yAxis = this.createSvgElement('line');
        yAxis.classList.add('ert-inquiry-debug-axis');
        yAxis.setAttribute('x1', '0');
        yAxis.setAttribute('y1', String(VIEWBOX_MIN));
        yAxis.setAttribute('x2', '0');
        yAxis.setAttribute('y2', String(VIEWBOX_MAX));
        debugGroup.appendChild(yAxis);

        const label = this.createSvgText(debugGroup, 'ert-inquiry-debug-label', 'ORIGIN', 0, 0);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('dominant-baseline', 'middle');
    }

    private updateGlyphScale(): void {
        if (!this.rootSvg || !this.glyph) return;
        const width = this.rootSvg.clientWidth || this.rootSvg.getBoundingClientRect().width;
        if (!Number.isFinite(width) || width <= 0) return;
        const unitsPerPx = VIEWBOX_SIZE / width;
        const targetUnits = GLYPH_TARGET_PX * unitsPerPx;
        const scale = targetUnits / ((FLOW_RADIUS + FLOW_STROKE) * 2);
        if (!Number.isFinite(scale) || scale <= 0) return;
        this.glyph.root.setAttribute('transform', `scale(${scale.toFixed(4)})`);
        this.glyph.setDisplayScale(scale, unitsPerPx);
    }

    private buildFindingsPanel(findingsGroup: SVGGElement, width: number, height: number): void {
        const bg = this.createSvgElement('rect');
        bg.classList.add('ert-inquiry-panel-bg');
        bg.setAttribute('width', String(width));
        bg.setAttribute('height', String(height));
        bg.setAttribute('rx', '22');
        bg.setAttribute('ry', '22');
        findingsGroup.appendChild(bg);

        this.createSvgText(findingsGroup, 'ert-inquiry-findings-title', 'Findings', 24, 36);
        this.detailsToggle = this.createIconButton(findingsGroup, width - 88, 14, 32, 'chevron-down', 'Toggle details', 'ert-inquiry-details-toggle');
        this.detailsIcon = this.detailsToggle.querySelector('.ert-inquiry-icon') as SVGUseElement;
        this.registerDomEvent(this.detailsToggle as unknown as HTMLElement, 'click', () => this.toggleDetails());

        this.detailsEl = this.createSvgGroup(findingsGroup, 'ert-inquiry-details ert-hidden', 24, 64);
        this.detailRows = [
            this.createSvgText(this.detailsEl, 'ert-inquiry-detail-row', 'Corpus fingerprint: not available', 0, 0),
            this.createSvgText(this.detailsEl, 'ert-inquiry-detail-row', 'Cache status: not available', 0, 20)
        ];

        this.summaryEl = this.createSvgText(findingsGroup, 'ert-inquiry-summary', 'No inquiry run yet.', 24, 120);
        this.verdictEl = this.createSvgText(findingsGroup, 'ert-inquiry-verdict', 'Run an inquiry to see verdicts.', 24, 144);

        this.findingsListEl = this.createSvgGroup(findingsGroup, 'ert-inquiry-findings-list', 24, 176);

        const previewY = height - 210;
        this.artifactPreviewEl = this.createSvgGroup(findingsGroup, 'ert-inquiry-report-preview ert-hidden', 24, previewY);
        this.artifactPreviewBg = this.createSvgElement('rect');
        this.artifactPreviewBg.classList.add('ert-inquiry-report-preview-bg');
        this.artifactPreviewBg.setAttribute('width', String(width - 48));
        this.artifactPreviewBg.setAttribute('height', '180');
        this.artifactPreviewBg.setAttribute('rx', '14');
        this.artifactPreviewBg.setAttribute('ry', '14');
        this.artifactPreviewEl.appendChild(this.artifactPreviewBg);
    }

    private refreshUI(): void {
        this.updateScopeToggle();
        this.updateModeToggle();
        this.updateModeClass();
        this.updateContextBadge();
        this.renderMinimapTicks();
        this.updateFocusGlyph();
        this.updateRings();
        this.updateFindingsIndicators();
        this.updateFooterStatus();
        this.updateNavigationIcons();
    }

    private updateModeClass(): void {
        if (!this.rootSvg) return;
        this.rootSvg.classList.toggle('is-mode-flow', this.state.mode === 'flow');
        this.rootSvg.classList.toggle('is-mode-depth', this.state.mode === 'depth');
    }

    private updateScopeToggle(): void {
        this.updateToggleButton(this.scopeToggleButton, this.state.scope === 'saga');
        if (this.scopeToggleIcon) {
            const icon = this.state.scope === 'saga' ? 'sigma' : 'columns-2';
            if (this.scopeToggleIcon instanceof SVGUseElement) {
                this.setIconUse(this.scopeToggleIcon, icon);
            }
        }
        this.scopeToggleButton?.setAttribute('aria-label', this.state.scope === 'saga' ? 'Saga scope' : 'Book scope');
    }

    private updateModeToggle(): void {
        this.updateToggleButton(this.modeToggleButton, this.state.mode === 'depth');
        if (this.modeToggleIcon) {
            const icon = this.state.mode === 'depth' ? 'waves-arrow-down' : 'waves';
            this.setIconUse(this.modeToggleIcon, icon);
        }
        this.modeToggleButton?.setAttribute('aria-label', this.state.mode === 'depth' ? 'Depth mode' : 'Flow mode');
    }

    private updateToggleButton(button: SVGElement | undefined, isActive: boolean): void {
        if (!button) return;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    }

    private updateContextBadge(): void {
        if (!this.contextBadgeIcon || !this.contextBadgeLabel) return;
        const isSaga = this.state.scope === 'saga';
        if (isSaga && this.iconSymbols.has('ert-icon-sigma')) {
            this.contextBadgeIcon.classList.remove('ert-hidden');
            this.contextBadgeSigmaText?.classList.add('ert-hidden');
            this.setIconUse(this.contextBadgeIcon, 'sigma');
        } else if (isSaga && this.contextBadgeSigmaText) {
            this.contextBadgeIcon.classList.add('ert-hidden');
            this.contextBadgeSigmaText.classList.remove('ert-hidden');
        } else {
            this.contextBadgeSigmaText?.classList.add('ert-hidden');
            this.contextBadgeIcon.classList.remove('ert-hidden');
            this.setIconUse(this.contextBadgeIcon, 'columns-2');
        }
        this.contextBadgeLabel.textContent = isSaga ? 'Saga context' : 'Book context';
    }

    private logInquirySvgDebug(): void {
        const svg = this.rootSvg;
        const viewBox = svg?.getAttribute('viewBox');
        const frame = svg?.querySelector('.ert-inquiry-svg-frame');
        const rings = svg?.querySelectorAll('.ert-inquiry-ring-progress')?.length || 0;
        console.info('[Inquiry] SVG debug', {
            hasSvg: !!svg,
            viewBox,
            hasFrame: !!frame,
            ringCount: rings
        });
    }

    private renderMinimapTicks(): void {
        if (!this.minimapTicksEl || !this.minimapLayout || !this.minimapBaseline) return;
        this.clearSvgChildren(this.minimapTicksEl);
        this.minimapTicks = [];

        const count = this.state.scope === 'saga' ? DEFAULT_BOOK_COUNT : DEFAULT_SCENE_COUNT;
        const length = this.minimapLayout.length;
        const isVertical = this.state.mode === 'depth';
        const tickLength = 20;
        const tickThickness = 6;
        const step = count > 1 ? length / (count - 1) : 0;

        if (isVertical) {
            const baselineX = this.minimapLayout.startX + (length / 2);
            this.minimapBaseline.setAttribute('x1', String(baselineX));
            this.minimapBaseline.setAttribute('y1', '0');
            this.minimapBaseline.setAttribute('x2', String(baselineX));
            this.minimapBaseline.setAttribute('y2', String(length));
            this.minimapTicksEl.setAttribute('transform', `translate(${baselineX} 0)`);
        } else {
            const baselineStart = this.minimapLayout.startX;
            const baselineEnd = this.minimapLayout.startX + length;
            this.minimapBaseline.setAttribute('x1', String(baselineStart));
            this.minimapBaseline.setAttribute('y1', '0');
            this.minimapBaseline.setAttribute('x2', String(baselineEnd));
            this.minimapBaseline.setAttribute('y2', '0');
            this.minimapTicksEl.setAttribute('transform', `translate(${baselineStart} 0)`);
        }

        for (let i = 1; i <= count; i += 1) {
            const tick = this.createSvgElement('rect');
            tick.classList.add('ert-inquiry-minimap-tick');
            const pos = step * (i - 1);
            if (isVertical) {
                tick.setAttribute('x', String(-tickThickness / 2));
                tick.setAttribute('y', String(pos - (tickLength / 2)));
                tick.setAttribute('width', String(tickThickness));
                tick.setAttribute('height', String(tickLength));
                tick.setAttribute('rx', '3');
                tick.setAttribute('ry', '3');
            } else {
                tick.setAttribute('x', String(pos - (tickLength / 2)));
                tick.setAttribute('y', String(-tickThickness / 2));
                tick.setAttribute('width', String(tickLength));
                tick.setAttribute('height', String(tickThickness));
                tick.setAttribute('rx', '3');
                tick.setAttribute('ry', '3');
            }
            const label = this.state.scope === 'saga' ? `B${i}` : `S${i}`;
            tick.setAttribute('data-index', String(i));
            tick.setAttribute('aria-label', `Focus ${label}`);
            this.registerDomEvent(tick as unknown as HTMLElement, 'click', () => this.setFocusByIndex(i));
            this.registerDomEvent(tick as unknown as HTMLElement, 'pointerenter', () => {
                this.setHoverText(this.buildMinimapHoverText(label));
            });
            this.registerDomEvent(tick as unknown as HTMLElement, 'pointerleave', () => this.clearHoverText());
            this.minimapTicksEl.appendChild(tick);
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
        const flowValue = result ? this.normalizeMetricValue(result.verdict.flow) : GLYPH_PLACEHOLDER_FLOW;
        const depthValue = result ? this.normalizeMetricValue(result.verdict.depth) : GLYPH_PLACEHOLDER_DEPTH;
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

    private updateFindingsIndicators(): void {
        const result = this.state.activeResult;
        if (this.rootSvg) {
            const hasError = !!result?.findings.some(finding => finding.kind === 'error');
            this.rootSvg.classList.toggle('is-error', hasError);
        }
        this.updateMinimapHitStates(result);
    }

    private updateMinimapHitStates(result: InquiryResult | null | undefined): void {
        if (!this.minimapTicks.length) return;
        const hitMap = this.buildHitFindingMap(result);
        const prefix = this.state.scope === 'saga' ? 'B' : 'S';
        const severityClasses = ['is-severity-low', 'is-severity-medium', 'is-severity-high'];

        this.minimapTicks.forEach((tick, idx) => {
            const label = `${prefix}${idx + 1}`;
            const finding = hitMap.get(label);
            tick.classList.toggle('is-hit', !!finding);
            severityClasses.forEach(cls => tick.classList.remove(cls));
            if (finding) {
                tick.classList.add(`is-severity-${finding.severity}`);
            }
            let title = tick.querySelector('title') as SVGTitleElement | null;
            if (!title) {
                title = this.createSvgElement('title');
                tick.appendChild(title);
            }
            title.textContent = finding ? `${label} hit: ${finding.headline}` : `Focus ${label}`;
        });
    }

    private updateArtifactPreview(): void {
        // No-op while findings panel is removed.
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
        this.setIconUse(this.navPrevIcon, isSaga ? 'chevron-up' : 'chevron-left');
        this.setIconUse(this.navNextIcon, isSaga ? 'chevron-down' : 'chevron-right');
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
        const rawSources = this.plugin.settings.inquirySources as Record<string, unknown> | undefined;
        if (rawSources && ('sceneFolders' in rawSources || 'bookOutlineFiles' in rawSources || 'sagaOutlineFile' in rawSources)) {
            return this.buildLegacyCorpusManifest(rawSources, questionId);
        }

        const sources = this.normalizeInquirySources(this.plugin.settings.inquirySources);
        const entries: CorpusManifest['entries'] = [];
        const now = Date.now();
        const classConfigMap = new Map(
            (sources.classes || []).map(config => [config.className, config])
        );
        const scanRoots = normalizeScanRootPatterns(sources.scanRoots);
        const resolvedRoots = (sources.resolvedScanRoots && sources.resolvedScanRoots.length)
            ? sources.resolvedScanRoots
            : resolveScanRoots(scanRoots, this.app.vault, MAX_RESOLVED_SCAN_ROOTS).resolvedRoots;
        const resolvedVaultRoots = resolvedRoots.map(toVaultRoot);
        const files = this.app.vault.getMarkdownFiles();

        const inRoots = (path: string) => {
            return resolvedVaultRoots.some(root => !root || path === root || path.startsWith(`${root}/`));
        };

        files.forEach(file => {
            if (!inRoots(file.path)) return;
            const cache = this.app.metadataCache.getFileCache(file);
            const frontmatter = cache?.frontmatter as Record<string, unknown> | undefined;
            if (!frontmatter) return;
            const normalized = normalizeFrontmatterKeys(frontmatter, this.plugin.settings.frontmatterMappings);
            const classValues = this.extractClassValues(normalized);
            if (!classValues.length) return;

            classValues.forEach(className => {
                const config = classConfigMap.get(className);
                if (!config || !config.enabled) return;
                if (className === 'outline') {
                    const outlineScope = this.getFrontmatterScope(frontmatter);
                    if (outlineScope === 'book' && !config.bookScope) return;
                    if (outlineScope === 'saga' && !config.sagaScope) return;
                    entries.push({
                        path: file.path,
                        mtime: file.stat.mtime ?? now,
                        class: className,
                        scope: outlineScope
                    });
                    return;
                }

                if (INQUIRY_REFERENCE_ONLY_CLASSES.has(className)) {
                    entries.push({
                        path: file.path,
                        mtime: file.stat.mtime ?? now,
                        class: className
                    });
                    return;
                }

                if (this.state.scope === 'book' && !config.bookScope) return;
                if (this.state.scope === 'saga' && !config.sagaScope) return;

                entries.push({
                    path: file.path,
                    mtime: file.stat.mtime ?? now,
                    class: className
                });
            });
        });

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

    private buildLegacyCorpusManifest(rawSources: Record<string, unknown>, questionId: string): CorpusManifest {
        const entries: CorpusManifest['entries'] = [];
        const now = Date.now();
        const sources = rawSources as {
            sceneFolders?: string[];
            bookOutlineFiles?: string[];
            sagaOutlineFile?: string;
            characterFolders?: string[];
            placeFolders?: string[];
            powerFolders?: string[];
        };

        const addEntries = (paths: string[] | undefined, data: { class: string; scope?: InquiryScope }) => {
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

    private normalizeInquirySources(raw?: InquirySourcesSettings): InquirySourcesSettings {
        if (!raw) {
            return { scanRoots: ['/'], classes: [], classCounts: {}, resolvedScanRoots: [] };
        }
        if ('sceneFolders' in raw || 'bookOutlineFiles' in raw || 'sagaOutlineFile' in raw) {
            return { scanRoots: ['/'], classes: [], classCounts: {}, resolvedScanRoots: [] };
        }
        return {
            scanRoots: normalizeScanRootPatterns(raw.scanRoots),
            classes: (raw.classes || []).map(config => ({
                className: config.className.toLowerCase(),
                enabled: !!config.enabled,
                bookScope: !!config.bookScope,
                sagaScope: !!config.sagaScope
            })),
            classCounts: raw.classCounts || {},
            resolvedScanRoots: raw.resolvedScanRoots ? normalizeScanRootPatterns(raw.resolvedScanRoots) : [],
            lastScanAt: raw.lastScanAt
        };
    }

    private extractClassValues(frontmatter: Record<string, unknown>): string[] {
        const rawClass = frontmatter['Class'];
        const values = Array.isArray(rawClass) ? rawClass : rawClass ? [rawClass] : [];
        return values
            .map(value => (typeof value === 'string' ? value : String(value)).trim())
            .filter(Boolean)
            .map(value => value.toLowerCase());
    }

    private getFrontmatterScope(frontmatter: Record<string, unknown>): InquiryScope | undefined {
        const keys = Object.keys(frontmatter);
        const scopeKey = keys.find(key => key.toLowerCase() === 'scope');
        if (!scopeKey) return undefined;
        const value = frontmatter[scopeKey];
        if (typeof value !== 'string') return undefined;
        const normalized = value.trim().toLowerCase();
        if (normalized === 'book' || normalized === 'saga') {
            return normalized as InquiryScope;
        }
        return undefined;
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

    private buildZoneHoverText(zone: InquiryZone): string {
        const label = zone === 'setup' ? 'Setup' : zone === 'pressure' ? 'Pressure' : 'Payoff';
        if (!this.state.activeResult) {
            return `${label} verdict unavailable. Run an inquiry.`;
        }
        if (this.state.activeZone !== zone) {
            return `${label} verdict unavailable for the current inquiry.`;
        }
        return `${label}: ${this.state.activeResult.summary}`;
    }

    private buildMinimapHoverText(label: string): string {
        const result = this.state.activeResult;
        if (!result) {
            return `Focus ${label}. Run an inquiry.`;
        }
        const finding = this.buildHitFindingMap(result).get(label);
        if (!finding) {
            return `Focus ${label}. No hits in current inquiry.`;
        }
        const bullet = finding.bullets?.[0];
        return bullet ? `${label} hit: ${finding.headline} ${bullet}` : `${label} hit: ${finding.headline}`;
    }

    private buildHitFindingMap(result: InquiryResult | null | undefined): Map<string, InquiryFinding> {
        const map = new Map<string, InquiryFinding>();
        if (!result) return map;
        result.findings.forEach(finding => {
            if (!this.isFindingHit(finding)) return;
            const existing = map.get(finding.refId);
            if (!existing || this.getSeverityRank(finding.severity) > this.getSeverityRank(existing.severity)) {
                map.set(finding.refId, finding);
            }
        });
        return map;
    }

    private isFindingHit(finding: InquiryFinding): boolean {
        return finding.kind !== 'none';
    }

    private getSeverityRank(severity: InquirySeverity): number {
        if (severity === 'high') return 3;
        if (severity === 'medium') return 2;
        return 1;
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
        this.setIconUse(this.detailsIcon, isOpen ? 'chevron-down' : 'chevron-up');
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
