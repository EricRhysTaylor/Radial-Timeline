import {
    ItemView,
    WorkspaceLeaf,
    Platform,
    Notice,
    setIcon,
    TAbstractFile,
    TFile,
    normalizePath
} from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { INQUIRY_SCHEMA_VERSION, INQUIRY_VIEW_DISPLAY_TEXT, INQUIRY_VIEW_TYPE } from './constants';
import {
    createDefaultInquiryState,
    InquiryConfidence,
    InquiryFinding,
    InquiryMode,
    InquiryResult,
    InquiryScope,
    InquirySeverity,
    InquiryZone
} from './state';
import type { InquiryPromptConfig } from '../types/settings';
import { buildDefaultInquiryPromptConfig, normalizeInquiryPromptConfig } from './prompts';
import { ensureInquiryArtifactFolder, getMostRecentArtifactFile, resolveInquiryArtifactFolder } from './utils/artifacts';
import { openOrRevealFile } from '../utils/fileUtils';
import { InquiryGlyph, FLOW_RADIUS, FLOW_STROKE } from './components/InquiryGlyph';
import { ZONE_LAYOUT } from './zoneLayout';
import { InquiryRunnerService } from './runner/InquiryRunnerService';
import type { CorpusManifest, EvidenceParticipationRules } from './runner/types';
import { InquirySessionStore } from './InquirySessionStore';
import { normalizeFrontmatterKeys } from '../utils/frontmatter';
import type { InquirySourcesSettings } from '../types/settings';
import { DEFAULT_SETTINGS } from '../settings/defaults';
import { InquiryCorpusResolver, InquiryCorpusSnapshot, InquiryCorpusItem } from './services/InquiryCorpusResolver';
import { getModelDisplayName } from '../utils/modelResolver';
import { addTooltipData, setupTooltipsFromDataAttributes } from '../utils/tooltip';
import {
    MAX_RESOLVED_SCAN_ROOTS,
    normalizeScanRootPatterns,
    resolveScanRoots,
    toVaultRoot
} from './utils/scanRoots';

const GLYPH_TARGET_PX = 190;
const GLYPH_PLACEHOLDER_FLOW = 0.75;
const GLYPH_PLACEHOLDER_DEPTH = 0.30;
const DEBUG_SVG_OVERLAY = true;
const SVG_NS = 'http://www.w3.org/2000/svg';
const VIEWBOX_MIN = -800;
const VIEWBOX_MAX = 800;
const VIEWBOX_SIZE = 1600;
const INQUIRY_REFERENCE_ONLY_CLASSES = new Set(['character', 'place', 'power']);
const PREVIEW_PANEL_WIDTH = 640;
const PREVIEW_PANEL_Y = -490;
const PREVIEW_PANEL_PADDING_X = 32;
const PREVIEW_PANEL_PADDING_Y = 20;
const PREVIEW_HERO_LINE_HEIGHT = 30;
const PREVIEW_META_GAP = 6;
const PREVIEW_META_LINE_HEIGHT = 22;
const PREVIEW_DETAIL_GAP = 16;
const PREVIEW_PILL_HEIGHT = 30;
const PREVIEW_PILL_PADDING_X = 16;
const PREVIEW_PILL_GAP_X = 16;
const PREVIEW_PILL_GAP_Y = 14;
const PREVIEW_PILL_MIN_GAP_X = 8;
const PREVIEW_FOOTER_GAP = 12;
const PREVIEW_FOOTER_HEIGHT = 22;
const PREVIEW_SHIMMER_WIDTH = 42;
const STAGE_LABELS = ['ASSEMBLE', 'SEND', 'THINK', 'APPLY'] as const;
const STAGE_DURATION_MS = 700;
const SWEEP_DURATION_MS = STAGE_DURATION_MS * STAGE_LABELS.length;
const MIN_PROCESSING_MS = 5000;
const SIMULATION_DURATION_MS = 20000;
const CC_CELL_SIZE = 20;
const CC_PAGE_BASE_SIZE = Math.round(CC_CELL_SIZE * 0.8);
const CC_PAGE_MIN_SIZE = Math.max(6, Math.round(CC_CELL_SIZE * 0.33));
const CC_RIGHT_MARGIN = 50;
const CC_BOTTOM_MARGIN = 50;

type InquiryQuestion = {
    id: string;
    label: string;
    question: string;
    zone: InquiryZone;
    icon: string;
};

type InquiryPreviewRow = {
    group: SVGGElement;
    bg: SVGRectElement;
    text: SVGTextElement;
    label: string;
};

type CorpusCcEntry = {
    id: string;
    label: string;
    filePath: string;
    className: string;
};

type CorpusCcSlot = {
    group: SVGGElement;
    base: SVGRectElement;
    fill: SVGRectElement;
    border: SVGRectElement;
    icon: SVGTextElement;
    fold: SVGPathElement;
};

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
    private apiSimulationButton?: SVGGElement;
    private engineBadgeGroup?: SVGGElement;
    private engineBadgeBg?: SVGRectElement;
    private engineBadgeText?: SVGTextElement;
    private contextBadgeIcon?: SVGUseElement;
    private contextBadgeSigmaText?: SVGTextElement;
    private contextBadgeLabel?: SVGTextElement;
    private minimapTicksEl?: SVGGElement;
    private minimapBaseline?: SVGLineElement;
    private minimapEndCapStart?: SVGRectElement;
    private minimapEndCapEnd?: SVGRectElement;
    private minimapEmptyText?: SVGTextElement;
    private minimapTicks: SVGRectElement[] = [];
    private minimapGroup?: SVGGElement;
    private minimapStageGroup?: SVGGElement;
    private minimapStageSegments: SVGRectElement[] = [];
    private minimapStageLabels: SVGTextElement[] = [];
    private minimapStageTicks: SVGLineElement[] = [];
    private minimapStagePulse?: SVGRectElement;
    private minimapStageLayout?: { startX: number; segmentWidth: number; barY: number; barHeight: number; pulseWidth: number };
    private minimapSweepTicks: Array<{ rect: SVGRectElement; centerX: number }> = [];
    private minimapSweepLayout?: { startX: number; endX: number; bandWidth: number };
    private runningAnimationFrame?: number;
    private runningAnimationStart?: number;
    private runningStageIndex = 0;
    private wasRunning = false;
    private minimapLayout?: { startX: number; length: number };
    private zonePromptElements = new Map<InquiryZone, { group: SVGGElement; bg: SVGRectElement; text: SVGTextElement }>();
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
    private previewGroup?: SVGGElement;
    private previewHero?: SVGTextElement;
    private previewMeta?: SVGTextElement;
    private previewFooter?: SVGTextElement;
    private previewRows: InquiryPreviewRow[] = [];
    private previewHideTimer?: number;
    private previewLast?: { zone: InquiryZone; question: string };
    private previewLocked = false;
    private previewShimmerRect?: SVGRectElement;
    private previewShimmerMask?: SVGMaskElement;
    private previewShimmerMaskText?: SVGGElement;
    private previewShimmerMaskBackdrop?: SVGRectElement;
    private previewPanelHeight = 0;
    private cacheStatusEl?: SVGTextElement;
    private confidenceEl?: SVGTextElement;
    private apiStatusEl?: SVGTextElement;
    private apiStatusState: { state: 'idle' | 'running' | 'success' | 'error'; reason?: string } = { state: 'idle' };
    private ccGroup?: SVGGElement;
    private ccLabel?: SVGTextElement;
    private ccEmptyText?: SVGTextElement;
    private ccClassLabels: SVGTextElement[] = [];
    private ccEntries: CorpusCcEntry[] = [];
    private ccSlots: CorpusCcSlot[] = [];
    private ccUpdateId = 0;
    private ccLayout?: { pageWidth: number; pageHeight: number; gap: number };
    private ccWordCache = new Map<string, { mtime: number; words: number; status?: 'todo' | 'working' | 'complete'; title?: string }>();
    private apiSimulationTimer?: number;
    private navPrevButton?: SVGGElement;
    private navNextButton?: SVGGElement;
    private navPrevIcon?: SVGUseElement;
    private navNextIcon?: SVGUseElement;
    private helpToggleButton?: SVGGElement;
    private helpTipsEnabled = false;
    private iconSymbols = new Set<string>();
    private svgDefs?: SVGDefsElement;
    private lastFocusSceneByBookId = new Map<string, string>();
    private corpusResolver: InquiryCorpusResolver;
    private corpus?: InquiryCorpusSnapshot;
    private focusPersistTimer?: number;
    private runner: InquiryRunnerService;
    private sessionStore: InquirySessionStore;

    constructor(leaf: WorkspaceLeaf, plugin: RadialTimelinePlugin) {
        super(leaf);
        this.plugin = plugin;
        this.runner = new InquiryRunnerService(this.plugin, this.app.vault, this.app.metadataCache, this.plugin.settings.frontmatterMappings);
        const lastMode = this.plugin.settings.inquiryLastMode;
        if (lastMode === 'flow' || lastMode === 'depth') {
            this.state.mode = lastMode;
        }
        this.ensurePromptConfig();
        this.state.selectedPromptIds = this.buildDefaultSelectedPromptIds();
        this.sessionStore = new InquirySessionStore(plugin);
        this.corpusResolver = new InquiryCorpusResolver(this.app.vault, this.app.metadataCache, this.plugin.settings.frontmatterMappings);
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
        this.loadFocusCache();
        this.renderDesktopLayout();
        this.refreshUI();
    }

    async onClose(): Promise<void> {
        if (this.focusPersistTimer) {
            window.clearTimeout(this.focusPersistTimer);
            this.focusPersistTimer = undefined;
        }
        if (this.apiSimulationTimer) {
            window.clearTimeout(this.apiSimulationTimer);
            this.apiSimulationTimer = undefined;
        }
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
        setupTooltipsFromDataAttributes(svg, this.registerDomEvent.bind(this));

        const defs = this.createSvgElement('defs');
        this.svgDefs = defs;
        this.buildIconSymbols(defs);
        this.buildZoneGradients(defs);
        svg.appendChild(defs);

        const background = this.createSvgElement('rect');
        background.classList.add('ert-inquiry-bg');
        background.setAttribute('x', String(VIEWBOX_MIN));
        background.setAttribute('y', String(VIEWBOX_MIN));
        background.setAttribute('width', String(VIEWBOX_SIZE));
        background.setAttribute('height', String(VIEWBOX_SIZE));
        svg.appendChild(background);

        const bgImage = this.createSvgElement('image');
        bgImage.classList.add('ert-inquiry-bg-image');
        bgImage.setAttribute('x', String(VIEWBOX_MIN));
        bgImage.setAttribute('y', String(VIEWBOX_MIN));
        bgImage.setAttribute('width', String(VIEWBOX_SIZE));
        bgImage.setAttribute('height', String(VIEWBOX_SIZE));
        bgImage.setAttribute('preserveAspectRatio', 'xMidYMid slice');
        bgImage.setAttribute('pointer-events', 'none');
        const configDir = (this.app.vault as unknown as { configDir?: string }).configDir ?? '.obsidian';
        const pluginId = this.plugin.manifest.id;
        const texturePath = normalizePath(`${configDir}/plugins/${pluginId}/inquiry/assets/radial_texture.png`);
        const adapter = this.app.vault.adapter as unknown as { getResourcePath?: (path: string) => string };
        const textureHref = adapter.getResourcePath ? adapter.getResourcePath(texturePath) : texturePath;
        bgImage.setAttribute('href', textureHref);
        svg.appendChild(bgImage);

        const frame = this.createSvgElement('rect');
        frame.classList.add('ert-inquiry-svg-frame');
        frame.setAttribute('x', String(VIEWBOX_MIN));
        frame.setAttribute('y', String(VIEWBOX_MIN));
        frame.setAttribute('width', String(VIEWBOX_SIZE));
        frame.setAttribute('height', String(VIEWBOX_SIZE));
        svg.appendChild(frame);

        svg.classList.toggle('is-debug', DEBUG_SVG_OVERLAY);
        this.buildDebugOverlay(svg);
        this.renderWaveHeader(svg);

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
        this.scopeToggleButton.querySelector('title')?.remove();
        addTooltipData(this.scopeToggleButton, 'Toggle scope', 'left');
        this.registerDomEvent(this.scopeToggleButton as unknown as HTMLElement, 'click', () => {
            this.handleScopeChange(this.state.scope === 'book' ? 'saga' : 'book');
        });

        const artifactX = (VIEWBOX_MAX - hudMargin - iconSize) - hudOffsetX;
        const helpX = artifactX - (iconSize + iconGap);
        const simulateX = helpX - (iconSize + iconGap);
        this.apiSimulationButton = this.createIconButton(hudGroup, simulateX, 0, iconSize, 'activity', 'Simulate API run');
        addTooltipData(this.apiSimulationButton, 'Simulate API run', 'left');
        this.registerDomEvent(this.apiSimulationButton as unknown as HTMLElement, 'click', () => this.startApiSimulation());

        this.helpToggleButton = this.createIconButton(hudGroup, helpX, 0, iconSize, 'help-circle', 'Help tips');
        this.helpToggleButton.setAttribute('aria-pressed', 'false');
        this.helpToggleButton.querySelector('title')?.remove();
        addTooltipData(this.helpToggleButton, 'Hover previews what will be sent. Click runs the inquiry.', 'left');
        this.registerDomEvent(this.helpToggleButton as unknown as HTMLElement, 'click', () => this.toggleHelpTips());

        this.artifactButton = this.createIconButton(hudGroup, artifactX, 0, iconSize, 'aperture', 'Save artifact');
        this.artifactButton.querySelector('title')?.remove();
        addTooltipData(this.artifactButton, 'Save artifact', 'left');
        this.registerDomEvent(this.artifactButton as unknown as HTMLElement, 'click', () => { void this.saveArtifact(); });

        const engineBadgeX = iconSize + iconGap;
        this.engineBadgeGroup = this.createSvgGroup(hudGroup, 'ert-inquiry-engine-badge', engineBadgeX, 12);
        this.engineBadgeGroup.setAttribute('role', 'button');
        this.engineBadgeGroup.setAttribute('tabindex', '0');
        this.engineBadgeGroup.setAttribute('aria-label', 'Inquiry engine (change in Settings → AI)');
        this.engineBadgeBg = this.createSvgElement('rect');
        this.engineBadgeBg.classList.add('ert-inquiry-engine-badge-bg');
        this.engineBadgeBg.setAttribute('rx', '14');
        this.engineBadgeBg.setAttribute('ry', '14');
        this.engineBadgeGroup.appendChild(this.engineBadgeBg);
        this.engineBadgeText = this.createSvgText(this.engineBadgeGroup, 'ert-inquiry-engine-badge-text', 'AI', 14, 14);
        this.engineBadgeText.setAttribute('text-anchor', 'start');
        this.engineBadgeText.setAttribute('dominant-baseline', 'middle');
        addTooltipData(this.engineBadgeGroup, 'Inquiry engine (change in Settings → AI)', 'bottom');
        this.registerDomEvent(this.engineBadgeGroup as unknown as HTMLElement, 'click', () => this.openAiSettings());

        const minimapGroup = this.createSvgGroup(canvasGroup, 'ert-inquiry-minimap', 0, -600);
        this.minimapGroup = minimapGroup;
        const badgeWidth = 160;
        const badgeHeight = 34;
        const badgeGroup = this.createSvgGroup(minimapGroup, 'ert-inquiry-context-badge', -badgeWidth / 2, -badgeHeight - 12);
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

        const baselineLength = VIEWBOX_SIZE / 2;
        const baselineStartX = -(baselineLength / 2);
        this.minimapLayout = { startX: baselineStartX, length: baselineLength };
        this.minimapBaseline = this.createSvgElement('line');
        this.minimapBaseline.classList.add('ert-inquiry-minimap-baseline');
        minimapGroup.appendChild(this.minimapBaseline);
        this.minimapEndCapStart = this.createSvgElement('rect');
        this.minimapEndCapStart.classList.add('ert-inquiry-minimap-endcap');
        minimapGroup.appendChild(this.minimapEndCapStart);
        this.minimapEndCapEnd = this.createSvgElement('rect');
        this.minimapEndCapEnd.classList.add('ert-inquiry-minimap-endcap');
        minimapGroup.appendChild(this.minimapEndCapEnd);

        this.minimapTicksEl = this.createSvgGroup(minimapGroup, 'ert-inquiry-minimap-ticks', baselineStartX, 0);
        this.minimapEmptyText = this.createSvgText(minimapGroup, 'ert-inquiry-minimap-empty ert-hidden', '', 0, 22);
        this.minimapEmptyText.setAttribute('text-anchor', 'middle');

        this.glyphAnchor = this.createSvgGroup(canvasGroup, 'ert-inquiry-focus-area');
        this.glyph = new InquiryGlyph(this.glyphAnchor, {
            focusLabel: this.getFocusLabel(),
            flowValue: GLYPH_PLACEHOLDER_FLOW,
            depthValue: GLYPH_PLACEHOLDER_DEPTH,
            impact: 'low',
            assessmentConfidence: 'low'
        });
        this.logInquirySvgDebug();
        this.updateGlyphScale();
        requestAnimationFrame(() => this.updateGlyphScale());
        this.registerDomEvent(window, 'resize', () => this.updateGlyphScale());

        this.flowRingHit = this.glyph.flowRingHit;
        this.depthRingHit = this.glyph.depthRingHit;
        this.glyphHit = this.glyph.labelHit;

        this.registerDomEvent(this.glyphHit as unknown as HTMLElement, 'click', () => this.handleGlyphClick());
        this.registerDomEvent(this.flowRingHit as unknown as HTMLElement, 'click', () => this.handleRingClick('flow'));
        this.registerDomEvent(this.depthRingHit as unknown as HTMLElement, 'click', () => this.handleRingClick('depth'));

        this.buildPromptPreviewPanel(canvasGroup);

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
        this.confidenceEl = this.createSvgText(statusGroup, 'ert-inquiry-status-item', 'Assessment confidence: none', 140, 0);
        this.apiStatusEl = this.createSvgText(statusGroup, 'ert-inquiry-status-item', 'API: idle', 0, 18);

        this.applyHelpTips();
    }

    private buildPromptPreviewPanel(parent: SVGGElement): void {
        const panel = this.createSvgGroup(parent, 'ert-inquiry-preview', 0, PREVIEW_PANEL_Y);
        this.previewGroup = panel;

        const hero = this.createSvgText(panel, 'ert-inquiry-preview-hero', '', 0, PREVIEW_PANEL_PADDING_Y);
        hero.setAttribute('text-anchor', 'middle');
        hero.setAttribute('dominant-baseline', 'hanging');
        this.previewHero = hero;

        const meta = this.createSvgText(panel, 'ert-inquiry-preview-meta', '', 0, PREVIEW_PANEL_PADDING_Y);
        meta.setAttribute('text-anchor', 'middle');
        meta.setAttribute('dominant-baseline', 'hanging');
        this.previewMeta = meta;

        const rowLabels = ['SCOPE', 'EVIDENCE', 'CLASSES', 'ROOTS', 'AI ENGINE', 'EST. COST'];
        this.previewRows = rowLabels.map(label => {
            const group = this.createSvgGroup(panel, 'ert-inquiry-preview-pill');
            const bg = this.createSvgElement('rect');
            bg.classList.add('ert-inquiry-preview-pill-bg');
            group.appendChild(bg);

            const pillTextY = (PREVIEW_PILL_HEIGHT / 2) + 1;
            const textEl = this.createSvgText(group, 'ert-inquiry-preview-pill-text', '', PREVIEW_PILL_PADDING_X, pillTextY);
            textEl.setAttribute('xml:space', 'preserve');
            textEl.setAttribute('dominant-baseline', 'middle');
            textEl.setAttribute('alignment-baseline', 'middle');
            textEl.setAttribute('text-anchor', 'start');

            return { group, bg, text: textEl, label };
        });

        const footer = this.createSvgText(panel, 'ert-inquiry-preview-footer', '', -PREVIEW_PANEL_WIDTH / 2 + PREVIEW_PANEL_PADDING_X, 0);
        footer.setAttribute('text-anchor', 'start');
        footer.setAttribute('dominant-baseline', 'hanging');
        this.previewFooter = footer;

        this.ensurePreviewShimmerMask();
        if (!this.previewShimmerRect) {
            const shimmer = this.createSvgElement('rect');
            shimmer.classList.add('ert-inquiry-preview-shimmer');
            if (this.previewShimmerMask) {
                shimmer.setAttribute('mask', `url(#${this.previewShimmerMask.getAttribute('id')})`);
            }
            panel.appendChild(shimmer);
            this.previewShimmerRect = shimmer;
            panel.style.setProperty('--ert-inquiry-shimmer-travel', `${Math.max(0, PREVIEW_PANEL_WIDTH - PREVIEW_SHIMMER_WIDTH)}px`);
        }

        this.updatePromptPreview('setup', this.state.mode, 'Hover a question to preview its payload.');
        this.hidePromptPreview(true);
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

    private loadFocusCache(): void {
        const cache = this.plugin.settings.inquiryFocusCache;
        if (cache?.lastFocusSceneByBookId) {
            this.lastFocusSceneByBookId = new Map(Object.entries(cache.lastFocusSceneByBookId));
        }
        if (cache?.lastFocusBookId) {
            this.state.focusBookId = cache.lastFocusBookId;
            const sceneId = this.lastFocusSceneByBookId.get(cache.lastFocusBookId);
            if (sceneId) {
                this.state.focusSceneId = sceneId;
            }
        }
        if (this.focusPersistTimer) {
            window.clearTimeout(this.focusPersistTimer);
            this.focusPersistTimer = undefined;
        }
    }

    private scheduleFocusPersist(): void {
        if (this.focusPersistTimer) {
            window.clearTimeout(this.focusPersistTimer);
        }
        this.focusPersistTimer = window.setTimeout(() => {
            const cache = {
                lastFocusBookId: this.state.focusBookId,
                lastFocusSceneByBookId: Object.fromEntries(this.lastFocusSceneByBookId)
            };
            this.plugin.settings.inquiryFocusCache = cache;
            void this.plugin.saveSettings();
        }, 300);
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
            'sigma',
            'x'
        ].forEach(icon => {
            const symbolId = this.createIconSymbol(defs, icon);
            if (symbolId) {
                this.iconSymbols.add(symbolId);
            }
        });
    }

    private buildZoneGradients(defs: SVGDefsElement): void {
        const zones: InquiryZone[] = ['setup', 'pressure', 'payoff'];
        const createStop = (offset: string, color: string): SVGStopElement => {
            const stop = this.createSvgElement('stop');
            stop.setAttribute('offset', offset);
            stop.setAttribute('stop-color', color);
            return stop;
        };
        const createGradient = (id: string, stops: Array<[string, string]>): SVGRadialGradientElement => {
            const gradient = this.createSvgElement('radialGradient');
            gradient.setAttribute('id', id);
            gradient.setAttribute('cx', '0.5');
            gradient.setAttribute('cy', '0.5');
            gradient.setAttribute('fx', '0.5');
            gradient.setAttribute('fy', '0.5');
            gradient.setAttribute('r', '0.5');
            stops.forEach(([offset, color]) => {
                gradient.appendChild(createStop(offset, color));
            });
            return gradient;
        };

        zones.forEach(zone => {
            const zoneVar = `var(--ert-inquiry-zone-${zone})`;
            defs.appendChild(createGradient(
                `ert-inquiry-zone-${zone}-raised`,
                [
                    ['0%', `color-mix(in srgb, ${zoneVar} 70%, #ffffff)`],
                    ['55%', zoneVar],
                    ['100%', `color-mix(in srgb, ${zoneVar} 70%, #000000)`]
                ]
            ));
            defs.appendChild(createGradient(
                `ert-inquiry-zone-${zone}-pressed`,
                [
                    ['0%', `color-mix(in srgb, ${zoneVar} 68%, #000000)`],
                    ['65%', zoneVar],
                    ['100%', `color-mix(in srgb, ${zoneVar} 68%, #ffffff)`]
                ]
            ));
        });

        // Neumorphic filters for zone pill states.
        const pillOutFilter = this.createSvgElement('filter');
        pillOutFilter.setAttribute('id', 'ert-inquiry-zone-pill-out');
        pillOutFilter.setAttribute('x', '-50%');
        pillOutFilter.setAttribute('y', '-50%');
        pillOutFilter.setAttribute('width', '200%');
        pillOutFilter.setAttribute('height', '200%');
        pillOutFilter.setAttribute('color-interpolation-filters', 'sRGB');
        const pillOutLight = this.createSvgElement('feDropShadow');
        pillOutLight.setAttribute('dx', '-2');
        pillOutLight.setAttribute('dy', '-2');
        pillOutLight.setAttribute('stdDeviation', '1.6');
        pillOutLight.setAttribute('flood-color', '#ffffff');
        pillOutLight.setAttribute('flood-opacity', '0.28');
        const pillOutDark = this.createSvgElement('feDropShadow');
        pillOutDark.setAttribute('dx', '2');
        pillOutDark.setAttribute('dy', '2');
        pillOutDark.setAttribute('stdDeviation', '1.8');
        pillOutDark.setAttribute('flood-color', '#000000');
        pillOutDark.setAttribute('flood-opacity', '0.35');
        pillOutFilter.appendChild(pillOutLight);
        pillOutFilter.appendChild(pillOutDark);
        defs.appendChild(pillOutFilter);

        const pillInFilter = this.createSvgElement('filter');
        pillInFilter.setAttribute('id', 'ert-inquiry-zone-pill-in');
        pillInFilter.setAttribute('x', '-50%');
        pillInFilter.setAttribute('y', '-50%');
        pillInFilter.setAttribute('width', '200%');
        pillInFilter.setAttribute('height', '200%');
        pillInFilter.setAttribute('color-interpolation-filters', 'sRGB');
        const pillInOffsetDark = this.createSvgElement('feOffset');
        pillInOffsetDark.setAttribute('in', 'SourceAlpha');
        pillInOffsetDark.setAttribute('dx', '1.6');
        pillInOffsetDark.setAttribute('dy', '1.6');
        pillInOffsetDark.setAttribute('result', 'pill-in-offset-dark');
        const pillInBlurDark = this.createSvgElement('feGaussianBlur');
        pillInBlurDark.setAttribute('in', 'pill-in-offset-dark');
        pillInBlurDark.setAttribute('stdDeviation', '1.2');
        pillInBlurDark.setAttribute('result', 'pill-in-blur-dark');
        const pillInCompositeDark = this.createSvgElement('feComposite');
        pillInCompositeDark.setAttribute('in', 'pill-in-blur-dark');
        pillInCompositeDark.setAttribute('in2', 'SourceAlpha');
        pillInCompositeDark.setAttribute('operator', 'arithmetic');
        pillInCompositeDark.setAttribute('k2', '-1');
        pillInCompositeDark.setAttribute('k3', '1');
        pillInCompositeDark.setAttribute('result', 'pill-in-inner-dark');
        const pillInFloodDark = this.createSvgElement('feFlood');
        pillInFloodDark.setAttribute('flood-color', '#000000');
        pillInFloodDark.setAttribute('flood-opacity', '0.35');
        pillInFloodDark.setAttribute('result', 'pill-in-flood-dark');
        const pillInShadowDark = this.createSvgElement('feComposite');
        pillInShadowDark.setAttribute('in', 'pill-in-flood-dark');
        pillInShadowDark.setAttribute('in2', 'pill-in-inner-dark');
        pillInShadowDark.setAttribute('operator', 'in');
        pillInShadowDark.setAttribute('result', 'pill-in-shadow-dark');

        const pillInOffsetLight = this.createSvgElement('feOffset');
        pillInOffsetLight.setAttribute('in', 'SourceAlpha');
        pillInOffsetLight.setAttribute('dx', '-1.6');
        pillInOffsetLight.setAttribute('dy', '-1.6');
        pillInOffsetLight.setAttribute('result', 'pill-in-offset-light');
        const pillInBlurLight = this.createSvgElement('feGaussianBlur');
        pillInBlurLight.setAttribute('in', 'pill-in-offset-light');
        pillInBlurLight.setAttribute('stdDeviation', '1.2');
        pillInBlurLight.setAttribute('result', 'pill-in-blur-light');
        const pillInCompositeLight = this.createSvgElement('feComposite');
        pillInCompositeLight.setAttribute('in', 'pill-in-blur-light');
        pillInCompositeLight.setAttribute('in2', 'SourceAlpha');
        pillInCompositeLight.setAttribute('operator', 'arithmetic');
        pillInCompositeLight.setAttribute('k2', '-1');
        pillInCompositeLight.setAttribute('k3', '1');
        pillInCompositeLight.setAttribute('result', 'pill-in-inner-light');
        const pillInFloodLight = this.createSvgElement('feFlood');
        pillInFloodLight.setAttribute('flood-color', '#ffffff');
        pillInFloodLight.setAttribute('flood-opacity', '0.22');
        pillInFloodLight.setAttribute('result', 'pill-in-flood-light');
        const pillInShadowLight = this.createSvgElement('feComposite');
        pillInShadowLight.setAttribute('in', 'pill-in-flood-light');
        pillInShadowLight.setAttribute('in2', 'pill-in-inner-light');
        pillInShadowLight.setAttribute('operator', 'in');
        pillInShadowLight.setAttribute('result', 'pill-in-shadow-light');

        const pillInMerge = this.createSvgElement('feMerge');
        const pillInMergeGraphic = this.createSvgElement('feMergeNode');
        pillInMergeGraphic.setAttribute('in', 'SourceGraphic');
        const pillInMergeDark = this.createSvgElement('feMergeNode');
        pillInMergeDark.setAttribute('in', 'pill-in-shadow-dark');
        const pillInMergeLight = this.createSvgElement('feMergeNode');
        pillInMergeLight.setAttribute('in', 'pill-in-shadow-light');
        pillInMerge.appendChild(pillInMergeGraphic);
        pillInMerge.appendChild(pillInMergeDark);
        pillInMerge.appendChild(pillInMergeLight);

        pillInFilter.appendChild(pillInOffsetDark);
        pillInFilter.appendChild(pillInBlurDark);
        pillInFilter.appendChild(pillInCompositeDark);
        pillInFilter.appendChild(pillInFloodDark);
        pillInFilter.appendChild(pillInShadowDark);
        pillInFilter.appendChild(pillInOffsetLight);
        pillInFilter.appendChild(pillInBlurLight);
        pillInFilter.appendChild(pillInCompositeLight);
        pillInFilter.appendChild(pillInFloodLight);
        pillInFilter.appendChild(pillInShadowLight);
        pillInFilter.appendChild(pillInMerge);
        defs.appendChild(pillInFilter);
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
            if (child.tagName.toLowerCase() === 'title') return;
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

    private buildDefaultSelectedPromptIds(): Record<InquiryZone, string> {
        const config = this.getPromptConfig();
        const pickFirstAvailable = (zone: InquiryZone): string => {
            const slots = config[zone] ?? [];
            const firstAvailable = slots.find(slot => slot.question.trim().length > 0);
            return firstAvailable?.id ?? slots[0]?.id ?? zone;
        };
        return {
            setup: pickFirstAvailable('setup'),
            pressure: pickFirstAvailable('pressure'),
            payoff: pickFirstAvailable('payoff')
        };
    }

    private ensurePromptConfig(): void {
        if (!this.plugin.settings.inquiryPromptConfig) {
            this.plugin.settings.inquiryPromptConfig = buildDefaultInquiryPromptConfig();
            void this.plugin.saveSettings();
        }
    }

    private getPromptConfig(): InquiryPromptConfig {
        return normalizeInquiryPromptConfig(this.plugin.settings.inquiryPromptConfig);
    }

    private getPromptOptions(zone: InquiryZone): InquiryQuestion[] {
        const config = this.getPromptConfig();
        const icon = zone === 'setup' ? 'help-circle' : zone === 'pressure' ? 'activity' : 'check-circle';
        return (config[zone] ?? [])
            .filter(slot => slot.question.trim().length > 0)
            .map(slot => ({
                id: slot.id,
                label: slot.label || (zone === 'setup' ? 'Setup' : zone === 'pressure' ? 'Pressure' : 'Payoff'),
                question: slot.question,
                zone,
                icon
            }));
    }

    private getActivePrompt(zone: InquiryZone): InquiryQuestion | undefined {
        const options = this.getPromptOptions(zone);
        if (!options.length) return undefined;
        const activeId = this.state.selectedPromptIds[zone];
        const match = options.find(prompt => prompt.id === activeId);
        if (match) return match;
        const fallback = options[0];
        this.state.selectedPromptIds[zone] = fallback.id;
        return fallback;
    }

    private updateZonePrompts(): void {
        this.syncSelectedPromptIds();
        const paddingX = 24;
        const pillHeight = 40;
        this.zonePromptElements.forEach((elements, zone) => {
            const prompt = this.getActivePrompt(zone);
            if (!prompt) {
                elements.text.textContent = '';
                elements.bg.setAttribute('width', '0');
                elements.bg.setAttribute('height', '0');
                return;
            }
            elements.text.textContent = prompt.question;
            const textLength = elements.text.getComputedTextLength();
            const width = Math.max(textLength + (paddingX * 2), 180);
            elements.bg.setAttribute('width', width.toFixed(2));
            elements.bg.setAttribute('height', String(pillHeight));
            elements.bg.setAttribute('x', String(-width / 2));
            elements.bg.setAttribute('y', String(-pillHeight / 2));
            elements.bg.setAttribute('rx', String(pillHeight / 2));
            elements.bg.setAttribute('ry', String(pillHeight / 2));
            elements.group.classList.toggle('is-active', this.state.selectedPromptIds[zone] === prompt.id);
            elements.group.setAttribute('data-prompt-id', prompt.id);
            elements.group.removeAttribute('aria-label');
        });
    }

    private updateGlyphPromptState(): void {
        if (!this.glyph) return;
        this.syncSelectedPromptIds();
        const promptsByZone = {
            setup: this.getPromptOptions('setup').map(prompt => ({ id: prompt.id, question: prompt.question })),
            pressure: this.getPromptOptions('pressure').map(prompt => ({ id: prompt.id, question: prompt.question })),
            payoff: this.getPromptOptions('payoff').map(prompt => ({ id: prompt.id, question: prompt.question }))
        };
        this.glyph.updatePromptState({
            promptsByZone,
            selectedPromptIds: this.state.selectedPromptIds,
            onPromptSelect: (zone, promptId) => {
                this.setSelectedPrompt(zone, promptId);
                const prompt = this.getPromptOptions(zone)
                    .find(item => item.id === promptId);
                if (prompt) {
                    void this.handleQuestionClick(prompt);
                }
            },
            onPromptHover: (zone, _promptId, promptText) => {
                this.showPromptPreview(zone, this.state.mode, promptText);
            },
            onPromptHoverEnd: () => this.hidePromptPreview()
        });
    }

    private syncSelectedPromptIds(): void {
        const config = this.getPromptConfig();
        (['setup', 'pressure', 'payoff'] as InquiryZone[]).forEach(zone => {
            const slots = config[zone] ?? [];
            const available = slots.filter(slot => slot.question.trim().length > 0);
            const desired = available[0]?.id ?? slots[0]?.id;
            if (!desired) return;
            const current = this.state.selectedPromptIds[zone];
            const currentValid = available.some(slot => slot.id === current);
            if (!currentValid) {
                this.state.selectedPromptIds[zone] = desired;
            }
        });
    }

    private setSelectedPrompt(zone: InquiryZone, promptId: string): void {
        if (this.state.isRunning) return;
        if (this.state.selectedPromptIds[zone] === promptId) return;
        this.state.selectedPromptIds[zone] = promptId;
        this.updateZonePrompts();
        this.updateGlyphPromptState();
    }

    private handlePromptClick(zone: InquiryZone): void {
        if (this.state.isRunning) return;
        const options = this.getPromptOptions(zone);
        if (!options.length) return;
        const currentId = this.state.selectedPromptIds[zone];
        const currentIdx = options.findIndex(prompt => prompt.id === currentId);
        const nextIdx = currentIdx >= 0 ? (currentIdx + 1) % options.length : 0;
        const nextPrompt = options[nextIdx] ?? options[0];
        this.setSelectedPrompt(zone, nextPrompt.id);
        void this.handleQuestionClick(nextPrompt);
    }

    private renderZonePods(parent: SVGGElement): void {
        const rZone = FLOW_RADIUS + FLOW_STROKE + 90;
        const zones: Array<{ id: InquiryZone; angle: number }> = [
            { id: 'setup', angle: 210 },
            { id: 'pressure', angle: 330 },
            { id: 'payoff', angle: 90 }
        ];

        this.zonePromptElements.clear();

        zones.forEach(zone => {
            const pos = this.polarToCartesian(rZone, zone.angle);
            const zoneEl = this.createSvgGroup(parent, `ert-inquiry-zone-pod ert-inquiry-zone--${zone.id}`, pos.x, pos.y);
            zoneEl.setAttribute('role', 'button');
            zoneEl.setAttribute('tabindex', '0');
            const bg = this.createSvgElement('rect');
            bg.classList.add('ert-inquiry-zone-pill');
            zoneEl.appendChild(bg);

            const text = this.createSvgText(zoneEl, 'ert-inquiry-zone-pill-text', '', 0, 0);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'middle');
            text.setAttribute('alignment-baseline', 'middle');

            this.zonePromptElements.set(zone.id, { group: zoneEl, bg, text });

            this.registerDomEvent(zoneEl as unknown as HTMLElement, 'click', () => this.handlePromptClick(zone.id));
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

        const tickOffsets = [VIEWBOX_MAX * 0.25, VIEWBOX_MAX * 0.5];
        const tickHalf = 12;
        tickOffsets.forEach(offset => {
            [offset, -offset].forEach(position => {
                const xTick = this.createSvgElement('line');
                xTick.classList.add('ert-inquiry-debug-tick');
                xTick.setAttribute('x1', String(position));
                xTick.setAttribute('y1', String(-tickHalf));
                xTick.setAttribute('x2', String(position));
                xTick.setAttribute('y2', String(tickHalf));
                debugGroup.appendChild(xTick);

                const yTick = this.createSvgElement('line');
                yTick.classList.add('ert-inquiry-debug-tick');
                yTick.setAttribute('x1', String(-tickHalf));
                yTick.setAttribute('y1', String(position));
                yTick.setAttribute('x2', String(tickHalf));
                yTick.setAttribute('y2', String(position));
                debugGroup.appendChild(yTick);
            });
        });

        const label = this.createSvgText(debugGroup, 'ert-inquiry-debug-label', 'ORIGIN', 0, 0);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('dominant-baseline', 'middle');
    }

    private renderWaveHeader(parent: SVGElement): void {
        const waveWidth = 993;
        const targetWidth = VIEWBOX_SIZE * 0.5;
        const scale = targetWidth / waveWidth;
        const y = VIEWBOX_MIN + 50;
        const group = this.createSvgGroup(parent, 'ert-inquiry-wave-header');
        group.setAttribute('transform', `translate(0 ${y}) scale(${scale.toFixed(4)}) translate(${-waveWidth / 2} 0)`);
        group.setAttribute('pointer-events', 'none');

        const paths = [
            'M13.7456 16.5C30.9122 26.3333 77.7885 43 128.246 43C246.246 43 262.216 1.49999 330.746 1.5C443.246 1.50002 468.746 43 553.246 43C675.246 43 688.246 1.5 764.246 1.5C840.246 1.5 913.246 48.5 987.246 48.5',
            'M0.745567 45.5C17.9122 55.3333 64.7885 72 115.246 72C233.246 72 249.216 30.5 317.746 30.5C430.246 30.5 455.746 72 540.246 72C662.246 72 675.246 30.5 751.246 30.5C827.246 30.5 900.246 77.5 974.246 77.5',
            'M18.7456 69.5C35.9122 79.3333 82.7885 96 133.246 96C251.246 96 267.216 54.5 335.746 54.5C448.246 54.5 473.746 96 558.246 96C680.246 96 693.246 54.5 769.246 54.5C845.246 54.5 918.246 101.5 992.246 101.5'
        ];

        paths.forEach(d => {
            const path = this.createSvgElement('path');
            path.classList.add('ert-inquiry-wave-path');
            path.setAttribute('d', d);
            group.appendChild(path);
        });
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
        this.refreshCorpus();
        this.updateScopeToggle();
        this.updateModeToggle();
        this.updateModeClass();
        this.updateActiveZoneStyling();
        this.updateContextBadge();
        this.updateEngineBadge();
        this.updateZonePrompts();
        this.updateGlyphPromptState();
        this.renderMinimapTicks();
        this.updateFocusGlyph();
        this.updateRings();
        this.updateFindingsIndicators();
        this.updateFooterStatus();
        this.updateNavigationIcons();
        this.updateRunningState();
    }

    private refreshCorpus(): void {
        this.corpusResolver = new InquiryCorpusResolver(this.app.vault, this.app.metadataCache, this.plugin.settings.frontmatterMappings);
        const sources = this.normalizeInquirySources(this.plugin.settings.inquirySources);
        this.corpus = this.corpusResolver.resolve({
            scope: this.state.scope,
            focusBookId: this.state.focusBookId,
            sources
        });

        let shouldPersist = false;
        if (this.corpus.activeBookId) {
            if (this.state.focusBookId !== this.corpus.activeBookId) {
                this.state.focusBookId = this.corpus.activeBookId;
                shouldPersist = true;
            }
        } else {
            if (this.state.focusBookId) {
                this.state.focusBookId = undefined;
                shouldPersist = true;
            }
        }

        if (this.state.scope === 'book') {
            const sceneId = this.pickFocusScene(this.corpus.activeBookId, this.corpus.scenes);
            if (sceneId) {
                if (this.state.focusSceneId !== sceneId) {
                    this.state.focusSceneId = sceneId;
                    shouldPersist = true;
                }
                if (this.corpus.activeBookId) {
                    const prior = this.lastFocusSceneByBookId.get(this.corpus.activeBookId);
                    if (prior !== sceneId) {
                        this.lastFocusSceneByBookId.set(this.corpus.activeBookId, sceneId);
                        shouldPersist = true;
                    }
                }
            } else if (this.state.focusSceneId) {
                this.state.focusSceneId = undefined;
                shouldPersist = true;
            }
        }

        if (shouldPersist) {
            this.scheduleFocusPersist();
        }
    }

    private updateModeClass(): void {
        if (!this.rootSvg) return;
        this.rootSvg.classList.toggle('is-mode-flow', this.state.mode === 'flow');
        this.rootSvg.classList.toggle('is-mode-depth', this.state.mode === 'depth');
    }

    private getZoneColorVar(zone: InquiryZone): string {
        if (zone === 'pressure') return 'var(--ert-inquiry-zone-pressure)';
        if (zone === 'payoff') return 'var(--ert-inquiry-zone-payoff)';
        return 'var(--ert-inquiry-zone-setup)';
    }

    private getStageColors(): string[] {
        return [
            'var(--ert-inquiry-zone-setup)',
            'var(--ert-inquiry-zone-pressure)',
            'var(--ert-inquiry-zone-payoff)',
            'var(--ert-inquiry-zone-setup)'
        ];
    }

    private updateActiveZoneStyling(): void {
        if (!this.rootSvg) return;
        const zone = this.state.activeZone ?? 'setup';
        const zoneColor = this.getZoneColorVar(zone);
        this.rootSvg.style.setProperty('--ert-inquiry-active-zone-color', zoneColor);
        this.rootSvg.style.setProperty('--ert-inquiry-hit-color', zoneColor);
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

    private updateEngineBadge(): void {
        if (!this.engineBadgeGroup || !this.engineBadgeBg || !this.engineBadgeText) return;
        const modelLabel = this.getActiveInquiryModelLabel();
        this.engineBadgeText.textContent = modelLabel;
        requestAnimationFrame(() => {
            if (!this.engineBadgeBg || !this.engineBadgeText) return;
            const textLength = this.engineBadgeText.getComputedTextLength();
            const padding = 28;
            const minWidth = 120;
            const maxWidth = 280;
            const width = Math.min(maxWidth, Math.max(minWidth, textLength + padding));
            this.engineBadgeBg.setAttribute('width', width.toFixed(2));
            this.engineBadgeBg.setAttribute('height', '28');
        });
    }

    private getActiveInquiryModelId(): string {
        const provider = this.plugin.settings.defaultAiProvider || 'openai';
        const clean = (value: string) => value.replace(/^models\//, '').trim();
        if (provider === 'anthropic') {
            return clean(this.plugin.settings.anthropicModelId || 'claude-sonnet-4-5-20250929');
        }
        if (provider === 'gemini') {
            return clean(this.plugin.settings.geminiModelId || 'gemini-pro-latest');
        }
        if (provider === 'local') {
            return clean(this.plugin.settings.localModelId || 'local-model');
        }
        return clean(this.plugin.settings.openaiModelId || 'gpt-5.2-chat-latest');
    }

    private getActiveInquiryModelLabel(): string {
        const modelId = this.getActiveInquiryModelId();
        return modelId ? getModelDisplayName(modelId.replace(/^models\//, '')) : 'Unknown model';
    }

    private getClassScopeConfig(raw?: string[]): { allowAll: boolean; allowed: Set<string> } {
        const list = (raw || []).map(entry => entry.trim().toLowerCase()).filter(Boolean);
        const allowAll = list.includes('/');
        const allowed = new Set(list.filter(entry => entry !== '/'));
        return { allowAll, allowed };
    }

    private openAiSettings(): void {
        if (this.plugin.settingsTab) {
            this.plugin.settingsTab.setActiveTab('core');
        }
        // SAFE: any type used for accessing Obsidian's internal settings API
        const setting = (this.app as unknown as { setting?: { open: () => void; openTabById: (id: string) => void } }).setting;
        if (setting) {
            setting.open();
            setting.openTabById('radial-timeline');
        }
    }

    private getCurrentItems(): InquiryCorpusItem[] {
        if (!this.corpus) return [];
        return this.state.scope === 'saga' ? this.corpus.books : this.corpus.scenes;
    }

    private getFocusItem(): InquiryCorpusItem | undefined {
        const items = this.getCurrentItems();
        const focusId = this.state.scope === 'saga' ? this.state.focusBookId : this.state.focusSceneId;
        if (focusId) {
            const match = items.find(item => item.id === focusId);
            if (match) return match;
        }
        return items[0];
    }

    private pickFocusScene(bookId: string | undefined, scenes: InquiryCorpusItem[]): string | undefined {
        if (!bookId || !scenes.length) return undefined;
        const prior = this.lastFocusSceneByBookId.get(bookId);
        if (prior && scenes.some(scene => scene.id === prior)) {
            return prior;
        }
        return scenes[0]?.id;
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
        if (!this.minimapTicksEl || !this.minimapLayout || !this.minimapBaseline || !this.minimapEmptyText) return;
        this.clearSvgChildren(this.minimapTicksEl);
        this.minimapTicks = [];
        this.minimapSweepTicks = [];

        const items = this.getCurrentItems();
        const count = items.length;
        const length = this.minimapLayout.length;
        const tickSize = 20;
        const tickGap = 4;
        const capWidth = 2;
        const capHeight = Math.max(30, tickSize + 12);
        const edgeScenePadding = tickSize;
        const tickInset = capWidth + (tickSize / 2) + 4 + edgeScenePadding;
        const availableLength = Math.max(0, length - (tickInset * 2));
        const maxRowWidth = VIEWBOX_SIZE * 0.75;
        const minStep = tickSize + tickGap;
        const needsWrap = count > 1 && ((availableLength / (count - 1)) < minStep || (count * minStep) > maxRowWidth);
        const rowCount = needsWrap ? 2 : 1;
        const firstRowCount = rowCount === 2 ? Math.ceil(count / 2) : count;
        const secondRowCount = count - firstRowCount;
        const columnCount = rowCount === 2 ? firstRowCount : count;
        const rawColumnStep = columnCount > 1 ? (availableLength / (columnCount - 1)) : 0;
        const columnStep = columnCount > 1 ? Math.max(1, Math.floor(rawColumnStep)) : 0;
        const usedLength = columnStep * Math.max(0, columnCount - 1);
        const extraSpace = Math.max(0, availableLength - usedLength);
        const startOffset = Math.floor(extraSpace / 2);
        const horizontalGap = Math.max(0, columnStep - tickSize);
        const baselineGap = horizontalGap;
        const rowTopY = -(baselineGap + tickSize + (rowCount === 2 ? (tickSize + horizontalGap) : 0));
        const rowBottomY = -(baselineGap + tickSize);

        const baselineStart = Math.round(this.minimapLayout.startX);
        const baselineEnd = Math.round(this.minimapLayout.startX + length);
        this.minimapBaseline.setAttribute('x1', String(baselineStart));
        this.minimapBaseline.setAttribute('y1', '0');
        this.minimapBaseline.setAttribute('x2', String(baselineEnd));
        this.minimapBaseline.setAttribute('y2', '0');
        if (this.minimapEndCapStart && this.minimapEndCapEnd) {
            const capHalfWidth = Math.round(capWidth / 2);
            const capHalfHeight = Math.round(capHeight / 2);
            this.minimapEndCapStart.setAttribute('x', String(baselineStart - capHalfWidth));
            this.minimapEndCapStart.setAttribute('y', String(-capHalfHeight));
            this.minimapEndCapStart.setAttribute('width', String(Math.round(capWidth)));
            this.minimapEndCapStart.setAttribute('height', String(Math.round(capHeight)));
            this.minimapEndCapEnd.setAttribute('x', String(baselineEnd - capHalfWidth));
            this.minimapEndCapEnd.setAttribute('y', String(-capHalfHeight));
            this.minimapEndCapEnd.setAttribute('width', String(Math.round(capWidth)));
            this.minimapEndCapEnd.setAttribute('height', String(Math.round(capHeight)));
        }
        this.minimapTicksEl.setAttribute('transform', `translate(${baselineStart} 0)`);
        this.minimapEmptyText.setAttribute('x', '0');
        this.minimapEmptyText.setAttribute('y', '20');
        this.minimapEmptyText.setAttribute('text-anchor', 'middle');
        this.renderMinimapStages(baselineStart, length);

        if (!count) {
            const emptyLabel = this.state.scope === 'saga' ? 'No books found.' : 'No scenes found.';
            this.minimapEmptyText.textContent = emptyLabel;
            this.minimapEmptyText.classList.remove('ert-hidden');
            this.minimapStageGroup?.setAttribute('display', 'none');
            this.renderCorpusCcStrip();
            this.updateMinimapFocus();
            return;
        }

        this.minimapEmptyText.classList.add('ert-hidden');
        this.minimapStageGroup?.removeAttribute('display');
        const tickLayouts: Array<{ x: number; y: number; size: number }> = [];

        for (let i = 0; i < count; i += 1) {
            const item = items[i];
            const tick = this.createSvgElement('rect');
            tick.classList.add('ert-inquiry-minimap-tick');
            tick.classList.add('rt-tooltip-target');
            const rowIndex = rowCount === 2 && i >= firstRowCount ? 1 : 0;
            const colIndex = rowIndex === 0 ? i : (i - firstRowCount);
            const pos = columnCount > 1
                ? tickInset + startOffset + (columnStep * colIndex)
                : tickInset + startOffset + (availableLength / 2);
            const rowY = rowIndex === 0 ? rowTopY : rowBottomY;
            const x = Math.round(pos - (tickSize / 2));
            const y = Math.round(rowY);
            tick.setAttribute('x', String(x));
            tick.setAttribute('y', String(y));
            tick.setAttribute('width', String(Math.round(tickSize)));
            tick.setAttribute('height', String(Math.round(tickSize)));
            tick.setAttribute('rx', '0');
            tick.setAttribute('ry', '0');
            const label = item.displayLabel;
            tick.setAttribute('data-index', String(i + 1));
            tick.setAttribute('data-id', item.id);
            tick.setAttribute('data-label', label);
            tick.setAttribute('data-tooltip', `Focus ${label}`);
            tick.setAttribute('data-tooltip-placement', 'bottom');
            tick.setAttribute('data-tooltip-offset-y', '6');
            this.registerDomEvent(tick as unknown as HTMLElement, 'click', () => {
                if (this.state.isRunning) return;
                this.setFocusByIndex(i + 1);
            });
            this.registerDomEvent(tick as unknown as HTMLElement, 'pointerenter', () => {
                if (this.state.isRunning) return;
                this.setHoverText(this.buildMinimapHoverText(label));
            });
            this.registerDomEvent(tick as unknown as HTMLElement, 'pointerleave', () => this.clearHoverText());
            this.minimapTicksEl.appendChild(tick);
            this.minimapTicks.push(tick);
            tickLayouts.push({ x, y, size: tickSize });
        }

        this.buildMinimapSweepLayer(tickLayouts, tickSize, length);
        this.renderCorpusCcStrip();
        this.updateMinimapFocus();
    }

    private renderMinimapStages(baselineStart: number, length: number): void {
        if (!this.minimapGroup) return;
        const stageGroup = this.minimapStageGroup ?? this.createSvgGroup(this.minimapGroup, 'ert-inquiry-minimap-stages');
        this.minimapStageGroup = stageGroup;
        const segmentWidth = length / STAGE_LABELS.length;
        const barHeight = 6;
        const barY = -3;
        const pulseWidth = Math.max(24, Math.min(42, segmentWidth * 0.35));
        this.minimapStageLayout = { startX: baselineStart, segmentWidth, barY, barHeight, pulseWidth };

        const stageColors = this.getStageColors();
        STAGE_LABELS.forEach((label, index) => {
            let segment = this.minimapStageSegments[index];
            if (!segment) {
                segment = this.createSvgElement('rect');
                segment.classList.add('ert-inquiry-minimap-stage-segment');
                stageGroup.appendChild(segment);
                this.minimapStageSegments[index] = segment;
            }
            const segX = baselineStart + (segmentWidth * index);
            segment.setAttribute('x', segX.toFixed(2));
            segment.setAttribute('y', String(barY));
            segment.setAttribute('width', segmentWidth.toFixed(2));
            segment.setAttribute('height', String(barHeight));
            segment.setAttribute('rx', String(Math.round(barHeight / 2)));
            segment.setAttribute('ry', String(Math.round(barHeight / 2)));
            segment.style.setProperty('--ert-inquiry-stage-color', stageColors[index] ?? 'var(--text-muted)');

            let text = this.minimapStageLabels[index];
            if (!text) {
                text = this.createSvgText(stageGroup, 'ert-inquiry-minimap-stage-label', label, 0, 0);
                text.setAttribute('text-anchor', 'middle');
                text.setAttribute('dominant-baseline', 'hanging');
                this.minimapStageLabels[index] = text;
            }
            const labelX = baselineStart + (segmentWidth * (index + 0.5));
            const labelY = 24;
            text.textContent = label;
            text.setAttribute('x', labelX.toFixed(2));
            text.setAttribute('y', String(labelY));
            text.style.setProperty('--ert-inquiry-stage-color', stageColors[index] ?? 'var(--text-muted)');
        });

        const tickCount = STAGE_LABELS.length + 1;
        for (let i = 0; i < tickCount; i += 1) {
            let tick = this.minimapStageTicks[i];
            if (!tick) {
                tick = this.createSvgElement('line');
                tick.classList.add('ert-inquiry-minimap-stage-tick');
                stageGroup.appendChild(tick);
                this.minimapStageTicks[i] = tick;
            }
            const x = baselineStart + (segmentWidth * i);
            tick.setAttribute('x1', x.toFixed(2));
            tick.setAttribute('x2', x.toFixed(2));
            tick.setAttribute('y1', String(barY - 6));
            tick.setAttribute('y2', String(barY + barHeight + 6));
        }

        if (!this.minimapStagePulse) {
            this.minimapStagePulse = this.createSvgElement('rect');
            this.minimapStagePulse.classList.add('ert-inquiry-minimap-stage-pulse');
            stageGroup.appendChild(this.minimapStagePulse);
        }
        this.minimapStagePulse.setAttribute('width', pulseWidth.toFixed(2));
        this.minimapStagePulse.setAttribute('height', String(barHeight + 6));
        this.minimapStagePulse.setAttribute('y', String(barY - 3));
    }

    private buildMinimapSweepLayer(
        tickLayouts: Array<{ x: number; y: number; size: number }>,
        tickSize: number,
        length: number
    ): void {
        if (!this.minimapTicksEl) return;
        this.minimapTicksEl.querySelector('.ert-inquiry-minimap-sweep')?.remove();
        const sweepGroup = this.createSvgGroup(this.minimapTicksEl, 'ert-inquiry-minimap-sweep');
        const inset = Math.max(3, Math.round(tickSize * 0.28));
        const innerSize = Math.max(6, tickSize - (inset * 2));
        tickLayouts.forEach(layout => {
            const inner = this.createSvgElement('rect');
            inner.classList.add('ert-inquiry-minimap-sweep-inner');
            inner.setAttribute('x', String(layout.x + inset));
            inner.setAttribute('y', String(layout.y + inset));
            inner.setAttribute('width', String(innerSize));
            inner.setAttribute('height', String(innerSize));
            inner.setAttribute('rx', '2');
            inner.setAttribute('ry', '2');
            inner.setAttribute('opacity', '0');
            sweepGroup.appendChild(inner);
            this.minimapSweepTicks.push({ rect: inner, centerX: layout.x + (tickSize / 2) });
        });
        this.minimapSweepLayout = {
            startX: 0,
            endX: length,
            bandWidth: Math.max(tickSize * 1.6, 36)
        };
    }

    private renderCorpusCcStrip(): void {
        if (!this.rootSvg) return;
        const entries = this.getCorpusCcEntries();
        const entriesByClass = new Map<string, CorpusCcEntry[]>();
        entries.forEach(entry => {
            const list = entriesByClass.get(entry.className) ?? [];
            list.push(entry);
            entriesByClass.set(entry.className, list);
        });
        const classes = Array.from(entriesByClass.entries())
            .map(([className, items]) => ({ className, items }))
            .sort((a, b) => (b.items.length - a.items.length) || a.className.localeCompare(b.className));

        if (!entries.length) {
            if (this.ccGroup) {
                this.ccGroup.classList.add('ert-hidden');
            }
            return;
        }

        if (!this.ccGroup) {
            this.ccGroup = this.createSvgGroup(this.rootSvg, 'ert-inquiry-cc');
        } else {
            this.ccGroup.classList.remove('ert-hidden');
        }

        const bottomLimit = VIEWBOX_MAX - CC_BOTTOM_MARGIN;
        const maxHeight = Math.round(VIEWBOX_SIZE * (2 / 3));
        const topLimit = bottomLimit - maxHeight;
        const zoneLeft = ZONE_LAYOUT.setup.x;
        const zoneRight = ZONE_LAYOUT.pressure.x;
        const zoneBuffer = 50;

        const buildLayout = (pageWidth: number) => {
            const pageHeight = Math.round(pageWidth * 1.45);
            const gap = pageWidth;
            const titleY = gap;
            const docStartY = titleY + gap;
            const rowStep = pageHeight + gap;
            const usableHeight = Math.max(0, (bottomLimit - topLimit) - docStartY);
            const rowsPerColumn = Math.max(1, Math.floor((usableHeight + gap) / rowStep));
            const columnStep = pageWidth + gap;
            const anchorRightX = VIEWBOX_MAX - CC_RIGHT_MARGIN - pageWidth;
            const anchorLeftX = VIEWBOX_MIN + CC_RIGHT_MARGIN;
            let placeLeft = false;
            let rightColumnsUsed = 0;
            let leftColumnsUsed = 0;
            const placements: Array<{ entry: CorpusCcEntry; x: number; y: number }> = [];
            const layoutEntries: CorpusCcEntry[] = [];
            const classLayouts: Array<{ className: string; centerX: number; width: number }> = [];

            classes.forEach(group => {
                const columnsNeeded = Math.max(1, Math.ceil(group.items.length / rowsPerColumn));
                const side = placeLeft ? 'left' : 'right';
                const startIndex = side === 'right' ? rightColumnsUsed : leftColumnsUsed;
                const classLeftEdge = side === 'right'
                    ? anchorRightX - ((startIndex + columnsNeeded - 1) * columnStep)
                    : anchorLeftX + (startIndex * columnStep);
                const classRightEdge = side === 'right'
                    ? anchorRightX - (startIndex * columnStep) + pageWidth
                    : anchorLeftX + ((startIndex + columnsNeeded - 1) * columnStep) + pageWidth;
                const classWidth = classRightEdge - classLeftEdge;
                classLayouts.push({
                    className: group.className,
                    centerX: Math.round(classLeftEdge + (classWidth / 2)),
                    width: Math.round(classWidth)
                });

                let entryIndex = 0;
                for (let colOffset = 0; colOffset < columnsNeeded; colOffset += 1) {
                    for (let rowIndex = 0; rowIndex < rowsPerColumn; rowIndex += 1) {
                        if (entryIndex >= group.items.length) break;
                        const entry = group.items[entryIndex];
                        const x = side === 'right'
                            ? anchorRightX - ((startIndex + colOffset) * columnStep)
                            : anchorLeftX + ((startIndex + colOffset) * columnStep);
                        const y = docStartY + (rowIndex * rowStep);
                        placements.push({ entry, x: Math.round(x), y: Math.round(y) });
                        layoutEntries.push(entry);
                        entryIndex += 1;
                    }
                }

                if (side === 'right') {
                    rightColumnsUsed += columnsNeeded;
                    const leftmostEdge = anchorRightX - ((rightColumnsUsed - 1) * columnStep);
                    if (!placeLeft && leftmostEdge <= (zoneRight + zoneBuffer)) {
                        placeLeft = true;
                    }
                } else {
                    leftColumnsUsed += columnsNeeded;
                }
            });

            const rightBlockLeft = rightColumnsUsed > 0
                ? anchorRightX - ((rightColumnsUsed - 1) * columnStep)
                : anchorRightX;
            const rightBlockRight = rightColumnsUsed > 0
                ? anchorRightX + pageWidth
                : anchorRightX + pageWidth;
            const rightmostLeftEdge = leftColumnsUsed > 0
                ? anchorLeftX + ((leftColumnsUsed - 1) * columnStep) + pageWidth
                : anchorLeftX;
            const leftmostRightEdge = rightColumnsUsed > 0
                ? anchorRightX - ((rightColumnsUsed - 1) * columnStep)
                : anchorRightX;
            const overlapSetup = rightmostLeftEdge >= zoneLeft || leftmostRightEdge <= zoneLeft;

            return {
                pageWidth,
                pageHeight,
                gap,
                titleY,
                docStartY,
                rowsPerColumn,
                anchorRightX,
                placements,
                layoutEntries,
                classLayouts,
                rightBlockLeft,
                rightBlockRight,
                overlapSetup
            };
        };

        let layout = buildLayout(CC_PAGE_BASE_SIZE);
        while (layout.overlapSetup && layout.pageWidth > CC_PAGE_MIN_SIZE) {
            const nextSize = Math.max(CC_PAGE_MIN_SIZE, layout.pageWidth - 1);
            if (nextSize === layout.pageWidth) break;
            layout = buildLayout(nextSize);
        }
        const showWarning = layout.overlapSetup && layout.pageWidth <= CC_PAGE_MIN_SIZE;
        this.ccLayout = { pageWidth: layout.pageWidth, pageHeight: layout.pageHeight, gap: layout.gap };
        this.ccGroup.setAttribute('transform', `translate(0 ${topLimit})`);

        if (!this.ccLabel) {
            this.ccLabel = this.createSvgText(this.ccGroup, 'ert-inquiry-cc-label', 'Corpus', 0, 0);
            this.ccLabel.setAttribute('text-anchor', 'middle');
            this.ccLabel.setAttribute('dominant-baseline', 'middle');
        }
        this.ccLabel.textContent = 'Corpus';
        this.ccLabel.setAttribute('x', String(Math.round((layout.rightBlockLeft + layout.rightBlockRight) / 2)));
        this.ccLabel.setAttribute('y', '0');

        if (!this.ccEmptyText) {
            this.ccEmptyText = this.createSvgText(this.ccGroup, 'ert-inquiry-cc-empty ert-hidden', 'No corpus data', 0, 0);
            this.ccEmptyText.setAttribute('text-anchor', 'start');
            this.ccEmptyText.setAttribute('dominant-baseline', 'middle');
        }
        this.ccEmptyText.setAttribute('x', String(Math.round(layout.anchorRightX)));
        this.ccEmptyText.setAttribute('y', String(Math.round(layout.docStartY + (layout.pageHeight / 2))));
        if (showWarning) {
            this.ccEmptyText.textContent = 'Corpus too large';
            this.ccEmptyText.classList.remove('ert-hidden');
        } else {
            this.ccEmptyText.classList.add('ert-hidden');
        }

        const corner = Math.max(2, Math.round(layout.pageWidth * 0.125));
        const foldSize = Math.max(4, Math.round(layout.pageWidth * 0.35));

        const totalEntries = entries.length;
        while (this.ccSlots.length < totalEntries) {
            const group = this.createSvgGroup(this.ccGroup, 'ert-inquiry-cc-cell');
            const base = this.createSvgElement('rect');
            base.classList.add('ert-inquiry-cc-cell-base');
            const fill = this.createSvgElement('rect');
            fill.classList.add('ert-inquiry-cc-cell-fill');
            const border = this.createSvgElement('rect');
            border.classList.add('ert-inquiry-cc-cell-border');
            const icon = this.createSvgText(group, 'ert-inquiry-cc-cell-icon', '', 0, 0);
            icon.setAttribute('text-anchor', 'middle');
            icon.setAttribute('dominant-baseline', 'middle');
            const fold = this.createSvgElement('path');
            fold.classList.add('ert-inquiry-cc-cell-fold');
            group.appendChild(base);
            group.appendChild(fill);
            group.appendChild(border);
            group.appendChild(fold);
            group.appendChild(icon);
            this.registerDomEvent(group as unknown as HTMLElement, 'click', () => {
                if (this.state.isRunning) return;
                const filePath = group.getAttribute('data-file-path');
                if (!filePath) return;
                const file = this.app.vault.getAbstractFileByPath(filePath);
                if (file && this.isTFile(file)) {
                    void openOrRevealFile(this.app, file);
                }
            });
            this.ccSlots.push({ group, base, fill, border, icon, fold });
        }

        this.ccSlots.forEach((slot, idx) => {
            if (idx >= totalEntries) {
                slot.group.classList.add('ert-hidden');
                return;
            }
            const placement = layout.placements[idx];
            slot.group.classList.remove('ert-hidden');
            slot.group.setAttribute('data-class', placement.entry.className);
            slot.group.setAttribute('transform', `translate(${placement.x} ${placement.y})`);
            slot.base.setAttribute('width', String(layout.pageWidth));
            slot.base.setAttribute('height', String(layout.pageHeight));
            slot.base.setAttribute('x', '0');
            slot.base.setAttribute('y', '0');
            slot.fill.setAttribute('width', String(layout.pageWidth));
            slot.fill.setAttribute('height', '0');
            slot.fill.setAttribute('x', '0');
            slot.fill.setAttribute('y', String(layout.pageHeight));
            slot.border.setAttribute('width', String(layout.pageWidth));
            slot.border.setAttribute('height', String(layout.pageHeight));
            slot.border.setAttribute('x', '0');
            slot.border.setAttribute('y', '0');
            slot.border.setAttribute('rx', String(corner));
            slot.border.setAttribute('ry', String(corner));
            slot.fold.setAttribute('d', `M ${layout.pageWidth - foldSize} 0 L ${layout.pageWidth} 0 L ${layout.pageWidth} ${foldSize}`);
            slot.icon.setAttribute('x', String(Math.round(layout.pageWidth / 2)));
            slot.icon.setAttribute('y', String(Math.round(layout.pageHeight / 2)));
        });

        const titleTexts = this.ccClassLabels;
        while (titleTexts.length < layout.classLayouts.length) {
            const label = this.createSvgText(this.ccGroup, 'ert-inquiry-cc-class-label', '', 0, 0);
            label.setAttribute('text-anchor', 'middle');
            label.setAttribute('dominant-baseline', 'middle');
            titleTexts.push(label);
        }
        layout.classLayouts.forEach((group, idx) => {
            const labelEl = titleTexts[idx];
            const availableWidth = Math.max(4, group.width - layout.gap);
            labelEl.classList.remove('ert-hidden');
            const variants = this.getCorpusClassLabelVariants(group.className);
            labelEl.textContent = variants[0] ?? '';
            for (let i = 0; i < variants.length; i += 1) {
                labelEl.textContent = variants[i];
                if (labelEl.getComputedTextLength() <= availableWidth) break;
            }
            labelEl.setAttribute('x', String(group.centerX));
            labelEl.setAttribute('y', String(layout.titleY));
        });
        titleTexts.forEach((label, idx) => {
            if (idx < layout.classLayouts.length) return;
            label.classList.add('ert-hidden');
        });

        this.ccEntries = layout.layoutEntries;
        void this.updateCorpusCcData(layout.layoutEntries);
    }

    private getCorpusClassLabelVariants(className: string): string[] {
        const normalized = className.trim();
        if (!normalized) return ['Class', 'Cls', 'C'];
        const words = normalized
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/[^a-zA-Z0-9]+/g, ' ')
            .trim()
            .split(/\s+/)
            .filter(Boolean);
        const title = words.length
            ? words.map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ')
            : normalized.charAt(0).toUpperCase() + normalized.slice(1);
        const acronym = words.length > 1
            ? words.map(word => word.charAt(0).toUpperCase()).join('').slice(0, 3)
            : title.slice(0, 3).toUpperCase();
        const letter = title.charAt(0).toUpperCase();
        const variants = [title, acronym, letter];
        return Array.from(new Set(variants.filter(Boolean)));
    }

    private getCorpusCcEntries(): CorpusCcEntry[] {
        const manifest = this.buildCorpusManifest(this.state.activeQuestionId ?? 'cc-preview');
        return manifest.entries.map(entry => {
            const label = entry.path.split('/').pop() || entry.path;
            return {
                id: `${entry.class}:${entry.path}`,
                label,
                filePath: entry.path,
                className: entry.class
            };
        });
    }

    private buildSagaCcEntries(corpus: InquiryCorpusSnapshot): CorpusCcEntry[] {
        const sources = this.normalizeInquirySources(this.plugin.settings.inquirySources);
        const classScope = this.getClassScopeConfig(sources.classScope);
        const outlineConfig = (sources.classes || []).find(cfg => cfg.className === 'outline');
        const outlineAllowed = outlineConfig?.enabled && (outlineConfig.bookScope || outlineConfig.sagaScope);
        if (!outlineAllowed || (!classScope.allowAll && !classScope.allowed.has('outline'))) {
            return [];
        }

        const outlineFiles = this.getOutlineFiles();
        const bookOutlines = outlineFiles.filter(file => (this.getOutlineScope(file) ?? 'book') === 'book');
        const sagaOutlines = outlineFiles.filter(file => this.getOutlineScope(file) === 'saga');

        const entries: CorpusCcEntry[] = corpus.books.map(book => {
            const outline = bookOutlines.find(file => file.path === book.rootPath || file.path.startsWith(`${book.rootPath}/`));
            return {
                id: outline?.path || book.id,
                label: book.displayLabel,
                filePath: outline?.path || '',
                className: 'outline'
            };
        });

        const sagaOutline = sagaOutlines[0];
        entries.push({
            id: sagaOutline?.path || 'saga-outline',
            label: 'Saga',
            filePath: sagaOutline?.path || '',
            className: 'outline'
        });

        return entries;
    }

    private getOutlineFiles(): TFile[] {
        const sources = this.normalizeInquirySources(this.plugin.settings.inquirySources);
        const classScope = this.getClassScopeConfig(sources.classScope);
        const outlineConfig = (sources.classes || []).find(cfg => cfg.className === 'outline');
        if (!outlineConfig?.enabled) return [];
        if (!classScope.allowAll && !classScope.allowed.has('outline')) return [];

        const scanRoots = normalizeScanRootPatterns(sources.scanRoots);
        const resolvedRoots = scanRoots.length
            ? (sources.resolvedScanRoots && sources.resolvedScanRoots.length
                ? sources.resolvedScanRoots
                : resolveScanRoots(scanRoots, this.app.vault, MAX_RESOLVED_SCAN_ROOTS).resolvedRoots)
            : [];
        const resolvedVaultRoots = resolvedRoots.map(toVaultRoot);

        const inRoots = (path: string) => {
            return resolvedVaultRoots.some(root => !root || path === root || path.startsWith(`${root}/`));
        };

        const files = this.app.vault.getMarkdownFiles();
        return files.filter(file => {
            if (!inRoots(file.path)) return false;
            const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
            if (!frontmatter) return false;
            const normalized = normalizeFrontmatterKeys(frontmatter, this.plugin.settings.frontmatterMappings);
            const classValues = this.extractClassValues(normalized);
            return classValues.includes('outline');
        });
    }

    private getOutlineScope(file: TFile): InquiryScope | undefined {
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
        if (!frontmatter) return undefined;
        return this.getFrontmatterScope(frontmatter);
    }

    private async updateCorpusCcData(entries: CorpusCcEntry[]): Promise<void> {
        const updateId = ++this.ccUpdateId;
        const stats = await Promise.all(entries.map(entry => this.loadCorpusCcStats(entry.filePath)));
        if (updateId !== this.ccUpdateId) return;
        stats.forEach((entryStats, idx) => {
            this.applyCorpusCcSlot(idx, entries[idx], entryStats);
        });
    }

    private applyCorpusCcSlot(
        index: number,
        entry: CorpusCcEntry,
        stats: { words: number; status?: 'todo' | 'working' | 'complete'; title?: string }
    ): void {
        const slot = this.ccSlots[index];
        if (!slot) return;
        const thresholds = this.getCorpusThresholds();
        const tier = this.getCorpusTier(stats.words, thresholds);
        const ratioBase = thresholds.substantiveMin > 0 ? (stats.words / thresholds.substantiveMin) : 0;
        const ratio = Math.min(Math.max(ratioBase, 0), 1);
        const pageHeight = this.ccLayout?.pageHeight ?? Math.round(CC_PAGE_BASE_SIZE * 1.45);
        const fillHeight = Math.round(pageHeight * ratio);
        slot.fill.setAttribute('height', String(fillHeight));
        slot.fill.setAttribute('y', String(pageHeight - fillHeight));

        slot.group.classList.remove(
            'is-tier-empty',
            'is-tier-bare',
            'is-tier-sketchy',
            'is-tier-medium',
            'is-tier-substantive',
            'is-status-todo',
            'is-status-working',
            'is-status-complete',
            'is-mismatch'
        );
        slot.group.classList.add(`is-tier-${tier}`);

        if (stats.status) {
            slot.group.classList.add(`is-status-${stats.status}`);
        }

        const icon = stats.status === 'todo'
            ? '☐'
            : stats.status === 'working'
                ? '◐'
                : stats.status === 'complete'
                    ? '✓'
                    : '';
        slot.icon.textContent = icon;
        slot.icon.setAttribute('opacity', icon ? '1' : '0');

        const highlightMismatch = this.plugin.settings.inquiryCorpusHighlightLowSubstanceComplete ?? true;
        const lowSubstance = stats.words < thresholds.sketchyMin;
        if (highlightMismatch && stats.status === 'complete' && lowSubstance) {
            slot.group.classList.add('is-mismatch');
        }

        const tooltipTitle = stats.title || entry.label;
        const classInitial = entry.className?.trim().charAt(0).toLowerCase() || '?';
        slot.group.classList.add('rt-tooltip-target');
        slot.group.setAttribute('data-tooltip', `${tooltipTitle} [${classInitial}]`);
        slot.group.setAttribute('data-tooltip-placement', 'left');
        slot.group.setAttribute('data-tooltip-offset-x', '10');
        if (entry.filePath) {
            slot.group.classList.add('is-openable');
            slot.group.setAttribute('data-file-path', entry.filePath);
        } else {
            slot.group.classList.remove('is-openable');
            slot.group.removeAttribute('data-file-path');
        }
    }

    private getCorpusThresholds(): { emptyMax: number; sketchyMin: number; mediumMin: number; substantiveMin: number } {
        const defaults = DEFAULT_SETTINGS.inquiryCorpusThresholds || {
            emptyMax: 10,
            sketchyMin: 100,
            mediumMin: 300,
            substantiveMin: 1000
        };
        const raw = this.plugin.settings.inquiryCorpusThresholds || defaults;
        return {
            emptyMax: Number.isFinite(raw.emptyMax) ? raw.emptyMax : defaults.emptyMax,
            sketchyMin: Number.isFinite(raw.sketchyMin) ? raw.sketchyMin : defaults.sketchyMin,
            mediumMin: Number.isFinite(raw.mediumMin) ? raw.mediumMin : defaults.mediumMin,
            substantiveMin: Number.isFinite(raw.substantiveMin) ? raw.substantiveMin : defaults.substantiveMin
        };
    }

    private getCorpusTier(
        wordCount: number,
        thresholds: { emptyMax: number; sketchyMin: number; mediumMin: number; substantiveMin: number }
    ): 'empty' | 'bare' | 'sketchy' | 'medium' | 'substantive' {
        if (wordCount < thresholds.emptyMax) return 'empty';
        if (wordCount < thresholds.sketchyMin) return 'bare';
        if (wordCount < thresholds.mediumMin) return 'sketchy';
        if (wordCount < thresholds.substantiveMin) return 'medium';
        return 'substantive';
    }

    private async loadCorpusCcStats(
        filePath: string
    ): Promise<{ words: number; status?: 'todo' | 'working' | 'complete'; title?: string }> {
        if (!filePath) return { words: 0 };
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!file || !this.isTFile(file)) return { words: 0 };
        const mtime = file.stat.mtime ?? 0;
        const status = this.getDocumentStatus(file);
        const title = this.getDocumentTitle(file);
        const cached = this.ccWordCache.get(filePath);
        if (cached && cached.mtime === mtime && cached.status === status && cached.title === title) {
            return { words: cached.words, status: cached.status, title: cached.title };
        }
        const content = await this.app.vault.cachedRead(file);
        const body = this.stripFrontmatter(content);
        const words = this.countWords(body);
        this.ccWordCache.set(filePath, { mtime, words, status, title });
        return { words, status, title };
    }

    private getDocumentStatus(file: TFile): 'todo' | 'working' | 'complete' | undefined {
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
        if (!frontmatter) return undefined;
        const normalized = normalizeFrontmatterKeys(frontmatter, this.plugin.settings.frontmatterMappings);
        const raw = normalized['Status'];
        if (typeof raw !== 'string') return undefined;
        const value = raw.trim().toLowerCase();
        if (value === 'todo' || value === 'working' || value === 'complete') {
            return value;
        }
        return undefined;
    }

    private getDocumentTitle(file: TFile): string {
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
        if (frontmatter) {
            const normalized = normalizeFrontmatterKeys(frontmatter, this.plugin.settings.frontmatterMappings);
            const rawTitle = normalized['Title'] ?? normalized['title'];
            if (typeof rawTitle === 'string' && rawTitle.trim()) {
                return rawTitle.trim();
            }
        }
        return file.basename;
    }

    private stripFrontmatter(content: string): string {
        if (!content.startsWith('---')) return content;
        const match = content.match(/^---\s*\n[\s\S]*?\n---\s*\n?/);
        if (!match) return content;
        return content.slice(match[0].length);
    }

    private countWords(content: string): number {
        const trimmed = content.trim();
        if (!trimmed) return 0;
        const matches = trimmed.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g);
        return matches ? matches.length : 0;
    }

    private isTFile(file: TAbstractFile | null): file is TFile {
        return !!file && file instanceof TFile;
    }

    private updateMinimapFocus(): void {
        const focusId = this.state.scope === 'saga' ? this.state.focusBookId : this.state.focusSceneId;
        this.minimapTicks.forEach((tick, idx) => {
            const tickId = tick.getAttribute('data-id') || '';
            const isActive = !!focusId && tickId === focusId;
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
        const impact = result ? result.verdict.impact : 'low';
        const assessmentConfidence = result ? result.verdict.assessmentConfidence : 'low';
        const hasError = this.isErrorResult(result);
        const errorRing = hasError ? this.state.mode : null;

        this.glyph?.update({
            focusLabel: this.getFocusLabel(),
            flowValue,
            depthValue,
            impact,
            assessmentConfidence,
            errorRing
        });
    }

    private updateFindingsIndicators(): void {
        const result = this.state.activeResult;
        if (this.rootSvg) {
            if (this.state.isRunning) {
                this.rootSvg.classList.remove('is-error');
            } else {
                this.rootSvg.classList.toggle('is-error', this.isErrorResult(result));
            }
        }
        this.updateMinimapHitStates(result);
    }

    private isErrorResult(result: InquiryResult | null | undefined): boolean {
        if (!result) return false;
        if (result.aiStatus && result.aiStatus !== 'success') return true;
        return result.findings.some(finding => finding.kind === 'error');
    }

    private updateMinimapHitStates(result: InquiryResult | null | undefined): void {
        if (!this.minimapTicks.length) return;
        const severityClasses = ['is-severity-low', 'is-severity-medium', 'is-severity-high'];
        if (this.state.isRunning || this.isErrorResult(result)) {
            this.minimapTicks.forEach(tick => {
                tick.classList.remove('is-hit');
                severityClasses.forEach(cls => tick.classList.remove(cls));
                const label = tick.getAttribute('data-label') || '';
                if (label) {
                    tick.setAttribute('data-tooltip', `Focus ${label}`);
                }
            });
            return;
        }
        const hitMap = this.buildHitFindingMap(result);

        this.minimapTicks.forEach((tick, idx) => {
            const label = tick.getAttribute('data-label') || `T${idx + 1}`;
            const finding = hitMap.get(label);
            tick.classList.toggle('is-hit', !!finding);
            severityClasses.forEach(cls => tick.classList.remove(cls));
            const tooltip = finding ? `${label} hit: ${finding.headline}` : `Focus ${label}`;
            tick.setAttribute('data-tooltip', tooltip);
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
            const confidence = this.state.activeResult?.verdict.assessmentConfidence || 'none';
            this.confidenceEl.textContent = `Assessment confidence: ${confidence}`;
        }
        if (this.apiStatusEl) {
            const status = this.apiStatusState.state;
            const reason = this.apiStatusState.reason;
            let text = 'API: idle';
            if (status === 'running') {
                text = 'API: running...';
            } else if (status === 'success') {
                text = 'API: success';
            } else if (status === 'error') {
                text = `API: error — ${reason || 'unknown'}`;
            }
            this.apiStatusEl.textContent = text;
        }
    }

    private setApiStatus(state: 'idle' | 'running' | 'success' | 'error', reason?: string): void {
        this.apiStatusState = { state, reason };
        this.updateFooterStatus();
    }

    private updateNavigationIcons(): void {
        if (!this.navPrevButton || !this.navNextButton) return;
        const isSaga = this.state.scope === 'saga';
        this.setIconUse(this.navPrevIcon, isSaga ? 'chevron-up' : 'chevron-left');
        this.setIconUse(this.navNextIcon, isSaga ? 'chevron-down' : 'chevron-right');
    }

    private updateRunningState(): void {
        if (!this.rootSvg) return;
        const isRunning = this.state.isRunning;
        const wasRunning = this.wasRunning;
        this.wasRunning = isRunning;
        this.rootSvg.classList.toggle('is-running', isRunning);
        this.glyph?.setZoneInteractionsEnabled(!isRunning);
        const isError = this.rootSvg.classList.contains('is-error');
        const hasResult = !!this.state.activeResult && !isError;
        this.rootSvg.classList.toggle('is-results', !isRunning && hasResult);
        if (wasRunning && !isRunning) {
            (['setup', 'pressure', 'payoff'] as InquiryZone[]).forEach(zone => {
                this.glyph?.setZoneScaleLocked(zone, false);
            });
        }
        if (isRunning) {
            this.startRunningAnimations();
        } else {
            this.stopRunningAnimations();
        }
    }

    private startRunningAnimations(): void {
        if (this.runningAnimationFrame) return;
        this.runningAnimationStart = performance.now();
        this.runningStageIndex = -1;
        const animate = (now: number) => {
            if (!this.state.isRunning) {
                this.stopRunningAnimations();
                return;
            }
            const elapsed = now - (this.runningAnimationStart ?? now);
            const stageIndex = Math.floor(elapsed / STAGE_DURATION_MS) % STAGE_LABELS.length;
            const stageProgress = (elapsed % STAGE_DURATION_MS) / STAGE_DURATION_MS;
            this.updateStagePulse(stageIndex, stageProgress);
            this.updateSweep(elapsed);
            this.runningAnimationFrame = window.requestAnimationFrame(animate);
        };
        this.runningAnimationFrame = window.requestAnimationFrame(animate);
    }

    private stopRunningAnimations(): void {
        if (this.runningAnimationFrame) {
            window.cancelAnimationFrame(this.runningAnimationFrame);
            this.runningAnimationFrame = undefined;
        }
        this.runningAnimationStart = undefined;
        this.runningStageIndex = 0;
        this.minimapStageSegments.forEach(segment => segment.classList.remove('is-active'));
        this.minimapStageLabels.forEach(label => label.classList.remove('is-active'));
        this.minimapSweepTicks.forEach(tick => tick.rect.setAttribute('opacity', '0'));
    }

    private updateStagePulse(stageIndex: number, stageProgress: number): void {
        if (!this.minimapStagePulse || !this.minimapStageLayout) return;
        if (stageIndex !== this.runningStageIndex) {
            this.runningStageIndex = stageIndex;
            this.minimapStageSegments.forEach((segment, idx) => {
                segment.classList.toggle('is-active', idx === stageIndex);
            });
            this.minimapStageLabels.forEach((label, idx) => {
                label.classList.toggle('is-active', idx === stageIndex);
            });
            const stageColors = this.getStageColors();
            this.minimapStagePulse.style.setProperty('--ert-inquiry-stage-color', stageColors[stageIndex] ?? 'var(--text-muted)');
        }
        const { startX, segmentWidth, barY, barHeight, pulseWidth } = this.minimapStageLayout;
        const segStart = startX + (segmentWidth * stageIndex);
        const travel = Math.max(0, segmentWidth - pulseWidth);
        const x = segStart + (travel * stageProgress);
        this.minimapStagePulse.setAttribute('x', x.toFixed(2));
        this.minimapStagePulse.setAttribute('y', String(barY - 3));
        this.minimapStagePulse.setAttribute('height', String(barHeight + 6));
        this.minimapStagePulse.setAttribute('width', pulseWidth.toFixed(2));
    }

    private updateSweep(elapsed: number): void {
        if (!this.minimapSweepLayout || !this.minimapSweepTicks.length) return;
        const progress = (elapsed % SWEEP_DURATION_MS) / SWEEP_DURATION_MS;
        const { startX, endX, bandWidth } = this.minimapSweepLayout;
        const bandCenter = startX + ((endX - startX) * progress);
        const bandHalf = bandWidth / 2;
        this.minimapSweepTicks.forEach(tick => {
            const distance = Math.abs(tick.centerX - bandCenter);
            if (distance > bandHalf) {
                tick.rect.setAttribute('opacity', '0');
                return;
            }
            const intensity = 1 - (distance / bandHalf);
            tick.rect.setAttribute('opacity', intensity.toFixed(2));
        });
    }

    private handleScopeChange(scope: InquiryScope): void {
        if (!scope || scope === this.state.scope) return;
        this.state.scope = scope;
        this.state.activeResult = null;
        this.refreshUI();
    }

    private setActiveLens(mode: InquiryMode): void {
        if (!mode || mode === this.state.mode) return;
        // Lens is UI emphasis only; inquiry computation must always include flow + depth.
        this.state.mode = mode;
        this.plugin.settings.inquiryLastMode = mode;
        void this.plugin.saveSettings();
        this.updateModeClass();
        this.updateRings();
        if (!this.previewLocked && this.previewGroup?.classList.contains('is-visible') && this.previewLast) {
            this.updatePromptPreview(this.previewLast.zone, mode, this.previewLast.question);
        }
    }

    private handleRingClick(mode: InquiryMode): void {
        if (this.state.isRunning) return;
        this.setActiveLens(mode);
    }

    private handleGlyphClick(): void {
        if (this.state.scope === 'saga') {
            this.state.scope = 'book';
            this.refreshUI();
            return;
        }
        this.glyph?.root.classList.toggle('is-expanded');
    }

    private async handleQuestionClick(question: InquiryQuestion): Promise<void> {
        if (this.state.isRunning) return;
        this.state.activeQuestionId = question.id;
        this.state.activeZone = question.zone;
        this.lockPromptPreview(question);

        const manifest = this.buildCorpusManifest(question.id);
        const focusLabel = this.getFocusLabel();
        const focusId = this.getFocusId();
        const baseKey = this.sessionStore.buildBaseKey({
            questionId: question.id,
            scope: this.state.scope,
            focusId
        });
        const cacheEnabled = this.plugin.settings.inquiryCacheEnabled ?? true;
        const key = this.sessionStore.buildKey(baseKey, manifest.fingerprint);
        let cacheStatus: 'fresh' | 'stale' | 'missing' = 'missing';
        let cachedResult: InquiryResult | null = null;
        if (cacheEnabled) {
            const cached = this.sessionStore.getSession(key);
            if (cached) {
                cachedResult = this.normalizeLegacyResult({ ...cached.result, mode: this.state.mode });
                cacheStatus = 'fresh';
            } else {
                const prior = this.sessionStore.getLatestByBaseKey(baseKey);
                if (prior && prior.result.corpusFingerprint !== manifest.fingerprint) {
                    cacheStatus = 'stale';
                    this.sessionStore.markStaleByBaseKey(baseKey);
                }
            }
        }
        this.state.cacheStatus = cacheStatus;

        const startTime = Date.now();
        this.state.isRunning = true;
        this.setApiStatus('running');
        this.refreshUI();
        let result: InquiryResult;
        if (cachedResult) {
            result = cachedResult;
        } else {
            new Notice('Inquiry: contacting AI provider.');
            console.info('[Inquiry] API HIT');
            const submittedAt = new Date();
            try {
                // Lens selection is UI-only; do not vary question, evidence, or verdict structure by lens.
                // Each inquiry produces two compressed answers (flow + depth). Keep this dual-answer model intact.
                result = await this.runner.run({
                    scope: this.state.scope,
                    focusLabel,
                    focusSceneId: this.state.scope === 'book' ? this.state.focusSceneId : undefined,
                    focusBookId: this.state.scope === 'saga' ? this.state.focusBookId : this.state.focusBookId,
                    mode: this.state.mode,
                    questionId: question.id,
                    questionText: question.question,
                    questionZone: question.zone,
                    corpus: manifest,
                    rules: this.getEvidenceRules(),
                    ai: {
                        provider: this.plugin.settings.defaultAiProvider || 'openai',
                        modelId: this.getActiveInquiryModelId(),
                        modelLabel: this.getActiveInquiryModelLabel()
                    }
                });
                console.info('[Inquiry] API OK');
            } catch (error) {
                console.info('[Inquiry] API FAIL');
                result = this.buildErrorFallback(question, focusLabel, manifest.fingerprint, error);
            }
            const completedAt = new Date();
            result.submittedAt = submittedAt.toISOString();
            result.completedAt = completedAt.toISOString();
            result.roundTripMs = completedAt.getTime() - submittedAt.getTime();
            result = this.normalizeLegacyResult(result);

            if (cacheEnabled && !this.isErrorResult(result)) {
                cacheStatus = 'fresh';
                this.sessionStore.setSession({
                    key,
                    baseKey,
                    result,
                    createdAt: Date.now(),
                    lastAccessed: Date.now()
                });
            } else if (!cacheEnabled) {
                cacheStatus = 'missing';
            }
        }

        const elapsed = Date.now() - startTime;
        if (elapsed < MIN_PROCESSING_MS) {
            await new Promise(resolve => window.setTimeout(resolve, MIN_PROCESSING_MS - elapsed));
        }

        this.applySession({ result }, cacheStatus);
        if (this.isErrorResult(result)) {
            this.setApiStatus('error', this.formatApiErrorReason(result));
        } else {
            this.setApiStatus('success');
        }
    }

    private applySession(session: { result: InquiryResult }, cacheStatus: 'fresh' | 'stale' | 'missing'): void {
        const normalized = this.normalizeLegacyResult(session.result);
        this.state.activeResult = normalized;
        this.state.corpusFingerprint = normalized.corpusFingerprint;
        this.state.cacheStatus = cacheStatus;
        this.state.isRunning = false;
        this.unlockPromptPreview();
        this.updateMinimapFocus();
        this.refreshUI();
    }

    private normalizeLegacyResult(result: InquiryResult): InquiryResult {
        const verdict = result.verdict as InquiryResult['verdict'] & {
            severity?: InquirySeverity;
            confidence?: InquiryConfidence;
        };
        const impact = verdict.impact ?? verdict.severity ?? 'low';
        const assessmentConfidence = verdict.assessmentConfidence ?? verdict.confidence ?? 'low';
        const findings = result.findings.map(finding => {
            const legacy = finding as InquiryFinding & { severity?: InquirySeverity; confidence?: InquiryConfidence };
            return {
                refId: legacy.refId,
                kind: legacy.kind,
                status: legacy.status,
                impact: legacy.impact ?? legacy.severity ?? 'low',
                assessmentConfidence: legacy.assessmentConfidence ?? legacy.confidence ?? 'low',
                headline: legacy.headline,
                bullets: legacy.bullets,
                related: legacy.related,
                evidenceType: legacy.evidenceType
            };
        });
        return {
            ...result,
            verdict: {
                flow: verdict.flow,
                depth: verdict.depth,
                impact,
                assessmentConfidence
            },
            findings
        };
    }

    private formatApiErrorReason(result: InquiryResult): string {
        const status = result.aiStatus || 'unknown';
        const reason = result.aiReason;
        return reason ? `${status} (${reason})` : status;
    }

    private startApiSimulation(): void {
        if (this.state.isRunning) return;
        if (this.apiSimulationTimer) {
            window.clearTimeout(this.apiSimulationTimer);
            this.apiSimulationTimer = undefined;
        }
        const prompt = this.pickSimulationPrompt();
        if (prompt) {
            this.state.activeQuestionId = prompt.id;
            this.state.activeZone = prompt.zone;
            this.lockPromptPreview(prompt);
        }
        this.state.isRunning = true;
        this.setApiStatus('running');
        this.refreshUI();
        this.apiSimulationTimer = window.setTimeout(() => {
            this.apiSimulationTimer = undefined;
            this.state.isRunning = false;
            this.unlockPromptPreview();
            this.updateMinimapFocus();
            this.refreshUI();
            this.setApiStatus('success');
        }, SIMULATION_DURATION_MS);
    }

    private pickSimulationPrompt(): InquiryQuestion | undefined {
        const preferredZone = this.state.activeZone ?? 'setup';
        return this.getActivePrompt(preferredZone)
            ?? this.getActivePrompt('setup')
            ?? this.getActivePrompt('pressure')
            ?? this.getActivePrompt('payoff');
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
                impact: 'high',
                assessmentConfidence: 'low'
            },
            aiStatus: 'unavailable',
            aiReason: 'exception',
            findings: [{
                refId: focusLabel,
                kind: 'error',
                status: 'unclear',
                impact: 'high',
                assessmentConfidence: 'low',
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
        const classScope = this.getClassScopeConfig(sources.classScope);
        const scanRoots = normalizeScanRootPatterns(sources.scanRoots);
        const resolvedRoots = scanRoots.length
            ? ((sources.resolvedScanRoots && sources.resolvedScanRoots.length)
                ? sources.resolvedScanRoots
                : resolveScanRoots(scanRoots, this.app.vault, MAX_RESOLVED_SCAN_ROOTS).resolvedRoots)
            : [];
        const resolvedVaultRoots = resolvedRoots.map(toVaultRoot);
        const allowedClasses = (sources.classes || [])
            .filter(config => config.enabled)
            .filter(config => classScope.allowAll || classScope.allowed.has(config.className))
            .map(config => config.className);

        if (!classScope.allowAll && classScope.allowed.size === 0) {
            const fingerprintRaw = `${INQUIRY_SCHEMA_VERSION}|${questionId}|${this.getActiveInquiryModelId()}|`;
            return {
                entries,
                fingerprint: this.hashString(fingerprintRaw),
                generatedAt: now,
                resolvedRoots,
                allowedClasses,
                synopsisOnly: true,
                classCounts: {}
            };
        }
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
                if (!classScope.allowAll && !classScope.allowed.has(className)) return;
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
        const modelId = this.getActiveInquiryModelId();
        const fingerprintRaw = `${INQUIRY_SCHEMA_VERSION}|${questionId}|${modelId}|${fingerprintSource}`;
        const fingerprint = this.hashString(fingerprintRaw);

        const classCounts = entries.reduce<Record<string, number>>((acc, entry) => {
            acc[entry.class] = (acc[entry.class] || 0) + 1;
            return acc;
        }, {});

        return {
            entries,
            fingerprint,
            generatedAt: now,
            resolvedRoots,
            allowedClasses,
            synopsisOnly: true,
            classCounts
        };
    }

    private buildLegacyCorpusManifest(rawSources: Record<string, unknown>, questionId: string): CorpusManifest {
        const entries: CorpusManifest['entries'] = [];
        const now = Date.now();
        const classScope = this.getClassScopeConfig(
            this.normalizeInquirySources(this.plugin.settings.inquirySources).classScope
        );
        if (!classScope.allowAll && classScope.allowed.size === 0) {
            const fingerprintRaw = `${INQUIRY_SCHEMA_VERSION}|${questionId}|${this.getActiveInquiryModelId()}|`;
            return {
                entries,
                fingerprint: this.hashString(fingerprintRaw),
                generatedAt: now,
                resolvedRoots: [],
                allowedClasses: [],
                synopsisOnly: true,
                classCounts: {}
            };
        }
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
            if (!classScope.allowAll && !classScope.allowed.has(data.class)) return;
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
        const modelId = this.getActiveInquiryModelId();
        const fingerprintRaw = `${INQUIRY_SCHEMA_VERSION}|${questionId}|${modelId}|${fingerprintSource}`;
        const fingerprint = this.hashString(fingerprintRaw);

        const classCounts = entries.reduce<Record<string, number>>((acc, entry) => {
            acc[entry.class] = (acc[entry.class] || 0) + 1;
            return acc;
        }, {});
        const allowedClasses = classScope.allowAll
            ? Array.from(new Set(entries.map(entry => entry.class)))
            : Array.from(classScope.allowed);

        return {
            entries,
            fingerprint,
            generatedAt: now,
            resolvedRoots: [],
            allowedClasses,
            synopsisOnly: true,
            classCounts
        };
    }

    private normalizeInquirySources(raw?: InquirySourcesSettings): InquirySourcesSettings {
        if (!raw) {
            return { scanRoots: [], classes: [], classCounts: {}, resolvedScanRoots: [] };
        }
        if ('sceneFolders' in raw || 'bookOutlineFiles' in raw || 'sagaOutlineFile' in raw) {
            return { scanRoots: [], classes: [], classCounts: {}, resolvedScanRoots: [] };
        }
        return {
            scanRoots: raw.scanRoots && raw.scanRoots.length ? normalizeScanRootPatterns(raw.scanRoots) : [],
            classScope: raw.classScope ? raw.classScope.map(value => value.trim().toLowerCase()).filter(Boolean) : [],
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
        const normalizedFrontmatter = normalizeFrontmatterKeys(frontmatter, this.plugin.settings.frontmatterMappings);
        const keys = Object.keys(normalizedFrontmatter);
        const scopeKey = keys.find(key => key.toLowerCase() === 'scope');
        if (!scopeKey) return undefined;
        const value = normalizedFrontmatter[scopeKey];
        if (typeof value !== 'string') return undefined;
        const normalizedValue = value.trim().toLowerCase();
        if (normalizedValue === 'book' || normalizedValue === 'saga') {
            return normalizedValue as InquiryScope;
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
        const items = this.getCurrentItems();
        const item = items[index - 1];
        if (!item) return;
        if (this.state.scope === 'saga') {
            this.state.focusBookId = item.id;
            this.scheduleFocusPersist();
        } else {
            this.state.focusSceneId = item.id;
            if (this.state.focusBookId) {
                this.lastFocusSceneByBookId.set(this.state.focusBookId, item.id);
                this.scheduleFocusPersist();
            }
        }
        this.updateMinimapFocus();
        this.updateFocusGlyph();
    }

    private shiftFocus(delta: number): void {
        const count = this.getCurrentItems().length;
        if (!count) return;
        const current = this.getFocusIndex();
        const next = Math.min(Math.max(current + delta, 1), count);
        this.setFocusByIndex(next);
    }

    private getFocusIndex(): number {
        const items = this.getCurrentItems();
        if (!items.length) return 1;
        const focusId = this.state.scope === 'saga' ? this.state.focusBookId : this.state.focusSceneId;
        const index = items.findIndex(item => item.id === focusId);
        return index >= 0 ? index + 1 : 1;
    }

    private getFocusLabel(): string {
        const item = this.getFocusItem();
        if (item) return item.displayLabel;
        return this.state.scope === 'saga' ? 'B0' : 'S0';
    }

    private getFocusId(): string {
        const item = this.getFocusItem();
        return item?.id || this.getFocusLabel();
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
        return `${ring === 'flow' ? 'Flow' : 'Depth'} score ${this.formatMetricDisplay(score)}. Impact ${verdict.impact}. Assessment confidence ${verdict.assessmentConfidence}.`;
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
        const stubHits = this.buildStubHitFindings(this.getCurrentItems());
        stubHits.forEach(finding => {
            map.set(finding.refId, finding);
        });
        result.findings.forEach(finding => {
            if (!this.isFindingHit(finding)) return;
            const existing = map.get(finding.refId);
            if (!existing || this.getImpactRank(finding.impact) > this.getImpactRank(existing.impact)) {
                map.set(finding.refId, finding);
            }
        });
        return map;
    }

    private buildStubHitFindings(items: InquiryCorpusItem[]): InquiryFinding[] {
        if (!items.length) return [];
        const findings: InquiryFinding[] = [];
        items.forEach(item => {
            const seed = item.filePaths?.[0] || item.id;
            const hash = this.hashStringToNumber(seed);
            if (hash % 5 !== 0) return;
            findings.push({
                refId: item.displayLabel,
                kind: 'continuity',
                status: 'unclear',
                impact: 'medium',
                assessmentConfidence: 'low',
                headline: 'Stub hit detected.',
                bullets: ['Deterministic placeholder until AI runner is wired.'],
                related: [],
                evidenceType: this.state.scope === 'book' ? 'scene' : 'mixed'
            });
        });
        return findings;
    }

    private hashStringToNumber(value: string): number {
        let hash = 0;
        for (let i = 0; i < value.length; i += 1) {
            hash = ((hash << 5) - hash) + value.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash);
    }

    private isFindingHit(finding: InquiryFinding): boolean {
        return finding.kind !== 'none';
    }

    private getImpactRank(impact: InquirySeverity): number {
        if (impact === 'high') return 3;
        if (impact === 'medium') return 2;
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

    private showPromptPreview(zone: InquiryZone, mode: InquiryMode, question: string): void {
        if (this.previewLocked) return;
        if (!this.previewGroup) return;
        if (this.previewHideTimer) {
            window.clearTimeout(this.previewHideTimer);
            this.previewHideTimer = undefined;
        }
        this.previewLast = { zone, question };
        this.updatePromptPreview(zone, mode, question);
        this.previewGroup.classList.add('is-visible');
    }

    private hidePromptPreview(immediate = false): void {
        if (this.previewLocked) return;
        if (!this.previewGroup) return;
        if (this.previewHideTimer) {
            window.clearTimeout(this.previewHideTimer);
            this.previewHideTimer = undefined;
        }
        const hide = () => {
            this.previewGroup?.classList.remove('is-visible');
        };
        if (immediate) {
            hide();
            return;
        }
        this.previewHideTimer = window.setTimeout(hide, 140);
    }

    private updatePromptPreview(zone: InquiryZone, mode: InquiryMode, question: string, rowsOverride?: string[]): void {
        if (!this.previewGroup || !this.previewHero) return;
        ['setup', 'pressure', 'payoff'].forEach(zoneName => {
            this.previewGroup?.classList.remove(`is-zone-${zoneName}`);
        });
        this.previewGroup.classList.add(`is-zone-${zone}`);
        const zoneLabel = zone === 'setup' ? 'Setup' : zone === 'pressure' ? 'Pressure' : 'Payoff';
        const modeLabel = mode === 'flow' ? 'Flow' : 'Depth';
        const heroLines = this.setBalancedHeroText(
            this.previewHero,
            question,
            PREVIEW_PANEL_WIDTH - (PREVIEW_PANEL_PADDING_X * 2),
            PREVIEW_HERO_LINE_HEIGHT
        );
        if (this.previewMeta) {
            const metaY = PREVIEW_PANEL_PADDING_Y + (heroLines * PREVIEW_HERO_LINE_HEIGHT) + PREVIEW_META_GAP;
            this.previewMeta.textContent = `${zoneLabel} · ${modeLabel}`.toUpperCase();
            this.previewMeta.setAttribute('y', String(metaY));
        }

        const detailStartY = PREVIEW_PANEL_PADDING_Y
            + (heroLines * PREVIEW_HERO_LINE_HEIGHT)
            + PREVIEW_META_GAP
            + PREVIEW_META_LINE_HEIGHT
            + PREVIEW_DETAIL_GAP;
        const rows = rowsOverride ?? [
            this.getPreviewScopeValue(),
            this.getPreviewEvidenceValue(),
            this.getPreviewClassesValue(),
            this.getPreviewRootsValue(),
            this.getPreviewEngineValue(),
            this.getPreviewCostValue()
        ];

        const rowCount = this.layoutPreviewPills(detailStartY, rows);
        const rowsBlockHeight = rowCount
            ? (rowCount * PREVIEW_PILL_HEIGHT) + ((rowCount - 1) * PREVIEW_PILL_GAP_Y)
            : 0;
        const footerY = detailStartY + rowsBlockHeight + PREVIEW_FOOTER_GAP;
        if (this.previewFooter) {
            this.previewFooter.setAttribute('y', String(footerY));
        }
        this.previewPanelHeight = footerY + PREVIEW_FOOTER_HEIGHT;
        this.updatePreviewShimmerLayout();
        this.updatePreviewShimmerMask();
    }

    private setBalancedHeroText(
        textEl: SVGTextElement,
        text: string,
        maxWidth: number,
        lineHeight: number
    ): number {
        this.clearSvgChildren(textEl);
        const words = text.split(/\s+/).filter(Boolean);
        if (!words.length) return 0;
        const fullLine = words.join(' ');
        textEl.textContent = fullLine;
        const fullWidth = textEl.getComputedTextLength();
        if (fullWidth <= maxWidth) {
            return 1;
        }

        const minWordsPerLine = 3;
        let bestIndex = -1;
        let bestScore = Number.POSITIVE_INFINITY;
        for (let i = minWordsPerLine; i <= words.length - minWordsPerLine; i += 1) {
            const line1 = words.slice(0, i).join(' ');
            const line2 = words.slice(i).join(' ');
            textEl.textContent = line1;
            const width1 = textEl.getComputedTextLength();
            textEl.textContent = line2;
            const width2 = textEl.getComputedTextLength();
            const overflow = Math.max(0, width1 - maxWidth) + Math.max(0, width2 - maxWidth);
            const score = Math.abs(width1 - width2) + (overflow * 3);
            if (score < bestScore) {
                bestScore = score;
                bestIndex = i;
            }
        }

        if (bestIndex < 0) {
            return this.setWrappedSvgText(textEl, text, maxWidth, 1, lineHeight);
        }

        this.clearSvgChildren(textEl);
        const x = textEl.getAttribute('x') ?? '0';
        const appendTspan = (content: string, isFirst: boolean): SVGTSpanElement => {
            const tspan = this.createSvgElement('tspan');
            tspan.setAttribute('x', x);
            tspan.setAttribute('dy', isFirst ? '0' : String(lineHeight));
            tspan.textContent = content;
            textEl.appendChild(tspan);
            return tspan;
        };

        const line1 = words.slice(0, bestIndex).join(' ');
        const line2 = words.slice(bestIndex).join(' ');
        appendTspan(line1, true);
        appendTspan(line2, false);
        return 2;
    }

    private ensurePreviewShimmerMask(): void {
        if (this.previewShimmerMask || !this.svgDefs) return;
        const mask = this.createSvgElement('mask');
        mask.setAttribute('id', 'ert-inquiry-preview-shimmer-mask');
        mask.setAttribute('maskUnits', 'userSpaceOnUse');
        const backdrop = this.createSvgElement('rect');
        backdrop.setAttribute('x', String(-PREVIEW_PANEL_WIDTH / 2));
        backdrop.setAttribute('y', '0');
        backdrop.setAttribute('width', String(PREVIEW_PANEL_WIDTH));
        backdrop.setAttribute('height', String(PREVIEW_PANEL_PADDING_Y * 6));
        backdrop.setAttribute('fill', '#000');
        mask.appendChild(backdrop);
        const textGroup = this.createSvgGroup(mask, 'ert-inquiry-preview-shimmer-mask-text');
        this.previewShimmerMask = mask;
        this.previewShimmerMaskText = textGroup;
        this.previewShimmerMaskBackdrop = backdrop;
        this.svgDefs.appendChild(mask);
    }

    private updatePreviewShimmerMask(): void {
        if (!this.previewShimmerMaskText) return;
        this.clearSvgChildren(this.previewShimmerMaskText);
        const textNodes: SVGTextElement[] = [];
        if (this.previewHero) textNodes.push(this.previewHero);
        if (this.previewMeta) textNodes.push(this.previewMeta);
        this.previewRows.forEach(row => {
            if (row.text) textNodes.push(row.text);
        });
        textNodes.forEach(node => {
            const clone = node.cloneNode(true) as SVGTextElement;
            clone.setAttribute('fill', '#fff');
            clone.setAttribute('opacity', '1');
            this.previewShimmerMaskText?.appendChild(clone);
        });
    }

    private updatePreviewShimmerLayout(): void {
        if (!this.previewShimmerRect || !this.previewShimmerMaskBackdrop) return;
        const height = Math.max(this.previewPanelHeight, PREVIEW_PILL_HEIGHT * 2);
        const startX = -PREVIEW_PANEL_WIDTH / 2;
        this.previewShimmerRect.setAttribute('x', String(startX));
        this.previewShimmerRect.setAttribute('y', '0');
        this.previewShimmerRect.setAttribute('width', String(PREVIEW_SHIMMER_WIDTH));
        this.previewShimmerRect.setAttribute('height', String(height));
        this.previewShimmerMaskBackdrop.setAttribute('x', String(startX));
        this.previewShimmerMaskBackdrop.setAttribute('y', '0');
        this.previewShimmerMaskBackdrop.setAttribute('width', String(PREVIEW_PANEL_WIDTH));
        this.previewShimmerMaskBackdrop.setAttribute('height', String(height));
        if (this.previewShimmerMask) {
            this.previewShimmerMask.setAttribute('x', String(startX));
            this.previewShimmerMask.setAttribute('y', '0');
            this.previewShimmerMask.setAttribute('width', String(PREVIEW_PANEL_WIDTH));
            this.previewShimmerMask.setAttribute('height', String(height));
        }
    }

    private lockPromptPreview(question: InquiryQuestion): void {
        if (!this.previewGroup) return;
        if (this.previewHideTimer) {
            window.clearTimeout(this.previewHideTimer);
            this.previewHideTimer = undefined;
        }
        const rows = [
            this.getPreviewScopeValue(),
            this.getPreviewEvidenceValue(),
            this.getPreviewClassesValue(),
            this.getPreviewRootsValue(),
            this.getPreviewEngineValue(),
            this.getPreviewCostValue()
        ];
        this.previewLocked = true;
        this.previewGroup.classList.add('is-visible', 'is-locked');
        this.updatePromptPreview(question.zone, this.state.mode, question.question, rows);
    }

    private unlockPromptPreview(): void {
        this.previewLocked = false;
        if (this.previewGroup) {
            this.previewGroup.classList.remove('is-locked', 'is-visible');
        }
    }

    private layoutPreviewPills(startY: number, values: string[]): number {
        const items = this.previewRows.map((row, index) => {
            const value = values[index] ?? '';
            this.setPreviewPillText(row, value);
            const textWidth = row.text.getComputedTextLength();
            const width = Math.ceil(textWidth + (PREVIEW_PILL_PADDING_X * 2));
            row.bg.setAttribute('width', String(width));
            row.bg.setAttribute('height', String(PREVIEW_PILL_HEIGHT));
            row.bg.setAttribute('rx', String(PREVIEW_PILL_HEIGHT / 2));
            row.bg.setAttribute('ry', String(PREVIEW_PILL_HEIGHT / 2));
            row.bg.setAttribute('x', '0');
            row.bg.setAttribute('y', '0');
            return { row, width };
        });

        if (!items.length) return 0;
        const maxRowWidth = PREVIEW_PANEL_WIDTH - (PREVIEW_PANEL_PADDING_X * 2);
        const splitIndex = items.length > 3 ? this.pickPillSplit(items.map(item => item.width), maxRowWidth) : items.length;
        const rows = [
            items.slice(0, splitIndex),
            items.slice(splitIndex)
        ].filter(row => row.length);

        rows.forEach((row, rowIndex) => {
            const widths = row.map(item => item.width);
            const totalWidth = widths.reduce((sum, value) => sum + value, 0);
            const gap = this.computePillGap(totalWidth, row.length, maxRowWidth, rowIndex === 0);
            const rowWidth = totalWidth + gap * (row.length - 1);
            let cursor = -rowWidth / 2;
            const rowY = startY + (rowIndex * (PREVIEW_PILL_HEIGHT + PREVIEW_PILL_GAP_Y));
            row.forEach((item, idx) => {
                item.row.group.setAttribute('transform', `translate(${cursor.toFixed(2)} ${rowY.toFixed(2)})`);
                cursor += widths[idx] + gap;
            });
        });

        return rows.length;
    }

    private setPreviewPillText(row: InquiryPreviewRow, value: string): void {
        this.clearSvgChildren(row.text);
        const label = this.createSvgElement('tspan');
        label.classList.add('ert-inquiry-preview-pill-label');
        label.textContent = value ? `${row.label} ` : row.label;
        row.text.appendChild(label);
        if (!value) return;
        const detail = this.createSvgElement('tspan');
        detail.classList.add('ert-inquiry-preview-pill-value');
        detail.textContent = value;
        row.text.appendChild(detail);
    }

    private pickPillSplit(widths: number[], maxWidth: number): number {
        const total = widths.length;
        let bestIndex = Math.ceil((total + 1) / 2);
        let bestScore = Number.POSITIVE_INFINITY;
        const computeRowWidth = (slice: number[], stretch: boolean): number => {
            if (!slice.length) return 0;
            const rowTotal = slice.reduce((sum, value) => sum + value, 0);
            const gap = this.computePillGap(rowTotal, slice.length, maxWidth, stretch);
            return rowTotal + gap * (slice.length - 1);
        };

        for (let i = 1; i < total; i += 1) {
            const row1Count = i;
            const row2Count = total - i;
            if (row1Count < row2Count) continue;

            const row1Width = computeRowWidth(widths.slice(0, i), true);
            const row2Width = computeRowWidth(widths.slice(i), false);
            if (row1Width <= row2Width) continue;

            const overflow = Math.max(0, row1Width - maxWidth) + Math.max(0, row2Width - maxWidth);
            const countDiff = row1Count - row2Count;
            const countPenalty = countDiff === 0 ? 300 : (countDiff === 1 ? 0 : 80 * (countDiff - 1));
            const score = Math.abs(row1Width - row2Width) + (overflow * 3) + countPenalty;
            if (score < bestScore) {
                bestScore = score;
                bestIndex = i;
            }
        }

        return bestIndex;
    }

    private computePillGap(totalWidth: number, count: number, maxWidth: number, stretch: boolean): number {
        if (count <= 1) return 0;
        const available = maxWidth - totalWidth;
        if (available <= 0) {
            const tightGap = available / (count - 1);
            return Math.max(PREVIEW_PILL_MIN_GAP_X, Math.min(PREVIEW_PILL_GAP_X, tightGap));
        }
        if (stretch) {
            return Math.max(PREVIEW_PILL_GAP_X, available / (count - 1));
        }
        return PREVIEW_PILL_GAP_X;
    }

    private setWrappedSvgText(
        textEl: SVGTextElement,
        text: string,
        maxWidth: number,
        maxLines: number,
        lineHeight: number
    ): number {
        this.clearSvgChildren(textEl);
        const words = text.split(/\s+/).filter(Boolean);
        const x = textEl.getAttribute('x') ?? '0';
        const appendTspan = (content: string, isFirst: boolean): SVGTSpanElement => {
            const tspan = this.createSvgElement('tspan');
            tspan.setAttribute('x', x);
            tspan.setAttribute('dy', isFirst ? '0' : String(lineHeight));
            tspan.textContent = content;
            textEl.appendChild(tspan);
            return tspan;
        };

        let line = '';
        let lineIndex = 0;
        let tspan = appendTspan('', true);
        let truncated = false;

        for (const word of words) {
            const testLine = line ? `${line} ${word}` : word;
            tspan.textContent = testLine;
            if (tspan.getComputedTextLength() > maxWidth && line) {
                tspan.textContent = line;
                lineIndex += 1;
                if (lineIndex >= maxLines) {
                    truncated = true;
                    break;
                }
                line = word;
                tspan = appendTspan(line, false);
            } else {
                line = testLine;
            }
        }

        if (!truncated) {
            tspan.textContent = line;
            return Math.max(lineIndex + 1, 1);
        }

        tspan.textContent = line;
        this.applyEllipsis(tspan, maxWidth);
        return maxLines;
    }

    private applyEllipsis(tspan: SVGTSpanElement, maxWidth: number): void {
        let content = tspan.textContent ?? '';
        if (!content.length) return;
        let next = `${content}…`;
        tspan.textContent = next;
        while (tspan.getComputedTextLength() > maxWidth && content.length > 1) {
            content = content.slice(0, -1).trimEnd();
            next = `${content}…`;
            tspan.textContent = next;
        }
    }

    private getPreviewScopeValue(): string {
        const scopeLabel = this.state.scope === 'saga' ? 'Saga' : 'Book';
        const focusLabel = this.getFocusLabel();
        const focusType = this.state.scope === 'saga' ? 'Book' : 'Scene';
        return `${scopeLabel} · ${focusType.toUpperCase()} ${focusLabel}`;
    }

    private getPreviewEvidenceValue(): string {
        const synopsisCount = this.corpus?.scenes?.filter(scene => scene.hasSynopsis).length ?? 0;
        const sources = this.normalizeInquirySources(this.plugin.settings.inquirySources);
        const outlineCount = sources.classCounts?.outline ?? 0;
        return `Scene synopsis ×${synopsisCount} · Outline ×${outlineCount}`;
    }

    private getPreviewClassesValue(): string {
        const sources = this.normalizeInquirySources(this.plugin.settings.inquirySources);
        const classScope = this.getClassScopeConfig(sources.classScope);
        const list = (sources.classes || [])
            .filter(config => {
                if (!config.enabled) return false;
                const inScope = this.state.scope === 'saga' ? config.sagaScope : config.bookScope;
                if (!inScope) return false;
                return classScope.allowAll || classScope.allowed.has(config.className);
            })
            .map(config => config.className);
        return list.length ? list.join(' · ') : 'None';
    }

    private getPreviewRootsValue(): string {
        const sources = this.normalizeInquirySources(this.plugin.settings.inquirySources);
        const resolvedRoots = this.corpus?.resolvedRoots ?? sources.resolvedScanRoots ?? [];
        if (!resolvedRoots.length) {
            const scanRoots = sources.scanRoots ?? [];
            const hasVaultRoot = scanRoots.length === 0 || scanRoots.some(root => !root || root === '/');
            return hasVaultRoot ? '/ (entire vault)' : 'No scan roots';
        }
        if (resolvedRoots.length === 1) {
            const root = resolvedRoots[0];
            return root ? `/${root} (1 folder)` : '/ (entire vault)';
        }
        const root = resolvedRoots[0];
        const first = root ? `/${root}` : '/';
        return `${first} … (${resolvedRoots.length} folders)`;
    }

    private getPreviewEngineValue(): string {
        const provider = this.getInquiryProviderLabel();
        const modelLabel = this.getActiveInquiryModelLabel();
        return `${modelLabel} (${provider})`;
    }

    private getPreviewCostValue(): string {
        return this.estimateInquiryCost();
    }

    private getInquiryProviderLabel(): string {
        const provider = this.plugin.settings.defaultAiProvider || 'openai';
        if (provider === 'anthropic') return 'Anthropic';
        if (provider === 'gemini') return 'Google';
        if (provider === 'local') return 'Local';
        return 'OpenAI';
    }

    private estimateInquiryCost(): string {
        const modelId = this.getActiveInquiryModelId().toLowerCase();
        if (modelId.includes('mini') || modelId.includes('lite') || modelId.includes('flash')) {
            return 'Low';
        }
        if (modelId.includes('pro') || modelId.includes('opus') || modelId.includes('ultra') || modelId.includes('gpt-4')) {
            return 'High';
        }
        return 'Medium';
    }

    private toggleDetails(): void {
        if (!this.detailsEl || !this.detailsToggle) return;
        const isOpen = !this.detailsEl.classList.contains('ert-hidden');
        this.detailsEl.classList.toggle('ert-hidden', isOpen);
        this.setIconUse(this.detailsIcon, isOpen ? 'chevron-down' : 'chevron-up');
    }

    private toggleHelpTips(): void {
        this.helpTipsEnabled = !this.helpTipsEnabled;
        this.applyHelpTips();
    }

    private applyHelpTips(): void {
        if (this.helpToggleButton) {
            this.helpToggleButton.classList.toggle('is-active', this.helpTipsEnabled);
            this.helpToggleButton.setAttribute('aria-pressed', this.helpTipsEnabled ? 'true' : 'false');
        }
        this.syncHelpTooltips();
    }

    private syncHelpTooltips(): void {
        const targets = this.getHelpTooltipTargets();
        targets.forEach(({ element, text, placement }) => {
            if (!element) return;
            if (this.helpTipsEnabled) {
                addTooltipData(element, text, placement ?? 'bottom');
                return;
            }
            if (element.getAttribute('data-tooltip') === text) {
                element.removeAttribute('data-tooltip');
            }
            element.removeAttribute('data-tooltip-placement');
            element.classList.remove('rt-tooltip-target');
        });
    }

    private getHelpTooltipTargets(): Array<{ element?: SVGElement; text: string; placement?: 'top' | 'bottom' | 'left' | 'right' }> {
        return [
            {
                element: this.scopeToggleButton,
                text: 'Toggle between Book and Saga scope.',
                placement: 'bottom'
            },
            {
                element: this.engineBadgeGroup,
                text: 'Open Inquiry engine settings.',
                placement: 'bottom'
            },
            {
                element: this.artifactButton,
                text: 'Save the latest inquiry as an artifact.',
                placement: 'bottom'
            },
            {
                element: this.flowRingHit,
                text: 'Switch to Flow lens.',
                placement: 'top'
            },
            {
                element: this.depthRingHit,
                text: 'Switch to Depth lens.',
                placement: 'top'
            },
            {
                element: this.glyphHit,
                text: 'Toggle focus ring expansion.',
                placement: 'top'
            },
            {
                element: this.navPrevButton,
                text: 'Previous focus.',
                placement: 'top'
            },
            {
                element: this.navNextButton,
                text: 'Next focus.',
                placement: 'top'
            }
        ];
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

        const briefTitle = this.formatInquiryBriefTitle(result);
        const baseName = briefTitle;
        const filePath = this.getAvailableArtifactPath(folder.path, baseName);
        const content = this.buildArtifactContent(result, this.plugin.settings.inquiryEmbedJson ?? true, briefTitle);

        try {
            const file = await this.app.vault.create(filePath, content);
            await openOrRevealFile(this.app, file);
            new Notice('Inquiry artifact saved.');
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            new Notice(`Unable to save artifact: ${message}`);
        }
    }

    private buildArtifactContent(result: InquiryResult, embedJson: boolean, briefTitle?: string): string {
        const submittedAt = result.submittedAt ? new Date(result.submittedAt) : null;
        const completedAt = result.completedAt ? new Date(result.completedAt) : null;
        const submittedAtLocal = submittedAt && Number.isFinite(submittedAt.getTime())
            ? this.formatInquiryBriefTimestamp(submittedAt, { includeSeconds: true })
            : 'unknown';
        const completedAtLocal = completedAt && Number.isFinite(completedAt.getTime())
            ? this.formatInquiryBriefTimestamp(completedAt, { includeSeconds: true })
            : 'unknown';
        const durationLocal = typeof result.roundTripMs === 'number' && Number.isFinite(result.roundTripMs)
            ? this.formatRoundTripDuration(result.roundTripMs)
            : 'unknown';
        const artifactId = `artifact-${Date.now()}`;
        const questionIds = result.questionId ? `\n  - ${result.questionId}` : '';
        const fingerprint = result.corpusFingerprint || 'not available';
        const aiProvider = result.aiProvider || 'unknown';
        const aiModelRequested = result.aiModelRequested || 'unknown';
        const aiModelResolved = result.aiModelResolved || 'unknown';
        const aiStatus = result.aiStatus || 'unknown';
        const aiReason = result.aiReason || 'none';

        const frontmatter = [
            '---',
            `artifactId: ${artifactId}`,
            `scope: ${result.scope}`,
            `targetId: ${result.focusId}`,
            `mode: ${result.mode}`,
            `questionIds:${questionIds}`,
            `pluginVersion: ${this.plugin.manifest.version}`,
            `corpusFingerprint: ${fingerprint}`,
            `aiProvider: ${aiProvider}`,
            `aiModelRequested: ${aiModelRequested}`,
            `aiModelResolved: ${aiModelResolved}`,
            `aiStatus: ${aiStatus}`,
            `aiReason: ${aiReason}`,
            `submittedAt: ${submittedAtLocal}`,
            `returnedAt: ${completedAtLocal}`,
            `duration: ${durationLocal}`,
            '---',
            ''
        ].join('\n');

        const title = briefTitle ?? this.formatInquiryBriefTitle(result);
        const heading = `# ${title}\n\n`;

        const findingsLines = result.findings.map(finding => {
            const bullets = finding.bullets.map(bullet => `  - ${bullet}`).join('\n');
            return `- ${finding.headline} (${finding.kind}, ${finding.impact}, ${finding.assessmentConfidence})\n${bullets}`;
        }).join('\n');

        const timingLines: string[] = [];
        if (submittedAt && Number.isFinite(submittedAt.getTime())) {
            timingLines.push(`Submitted: ${this.formatInquiryBriefTimestamp(submittedAt, { includeSeconds: true })}`);
        }
        if (completedAt && Number.isFinite(completedAt.getTime())) {
            timingLines.push(`Returned: ${this.formatInquiryBriefTimestamp(completedAt, { includeSeconds: true })}`);
        }
        if (typeof result.roundTripMs === 'number' && Number.isFinite(result.roundTripMs)) {
            timingLines.push(`Round trip: ${this.formatRoundTripDuration(result.roundTripMs)}`);
        }

        // Briefs always include both flow + depth; never omit based on active lens.
        const summaryLines = [
            '## Executive summary',
            result.summary,
            '',
            '## Verdict',
            `Flow: ${this.formatMetricDisplay(result.verdict.flow)}`,
            `Depth: ${this.formatMetricDisplay(result.verdict.depth)}`,
            `Impact: ${result.verdict.impact}`,
            `Assessment confidence: ${result.verdict.assessmentConfidence}`
        ];
        if (timingLines.length) {
            summaryLines.push('', '## Timing', ...timingLines);
        }
        summaryLines.push('', '## Findings', findingsLines || '- No findings', '');
        const summarySection = summaryLines.join('\n');

        const payload = embedJson
            ? [
                '## RT Artifact Data (Do Not Edit)',
                '```json',
                JSON.stringify(this.normalizeLegacyResult(result), null, 2),
                '```',
                ''
            ].join('\n')
            : '';

        return `${frontmatter}${heading}${summarySection}${payload}`;
    }

    private formatInquiryBriefTitle(result: InquiryResult): string {
        const date = new Date();
        const timestamp = this.formatInquiryBriefTimestamp(date);
        const zoneLabel = this.resolveInquiryBriefZoneLabel(result);
        const lensLabel = this.resolveInquiryBriefLensLabel(result, zoneLabel);
        const parts: string[] = [];
        if (result.scope === 'saga') {
            parts.push('Saga');
        }
        parts.push(zoneLabel, lensLabel);
        return `Inquiry Brief — ${parts.join(' · ')} ${timestamp}`;
    }

    private resolveInquiryBriefZoneLabel(result: InquiryResult): string {
        const zone = this.findPromptZoneById(result.questionId) ?? this.state.activeZone ?? 'setup';
        return zone === 'setup' ? 'Setup' : zone === 'pressure' ? 'Pressure' : 'Payoff';
    }

    private resolveInquiryBriefLensLabel(result: InquiryResult, zoneLabel: string): string {
        const promptLabel = this.findPromptLabelById(result.questionId);
        if (promptLabel && promptLabel.toLowerCase() !== zoneLabel.toLowerCase()) {
            return promptLabel;
        }
        return result.mode === 'depth' ? 'Depth' : 'Flow';
    }

    private findPromptLabelById(questionId: string): string | null {
        if (!questionId) return null;
        const config = this.getPromptConfig();
        const zones: InquiryZone[] = ['setup', 'pressure', 'payoff'];
        for (const zone of zones) {
            const slot = (config[zone] || []).find(entry => entry.id === questionId);
            if (slot?.label?.trim()) {
                return slot.label.trim();
            }
        }
        return null;
    }

    private findPromptZoneById(questionId: string): InquiryZone | null {
        if (!questionId) return null;
        const config = this.getPromptConfig();
        const zones: InquiryZone[] = ['setup', 'pressure', 'payoff'];
        for (const zone of zones) {
            if ((config[zone] || []).some(entry => entry.id === questionId)) {
                return zone;
            }
        }
        return null;
    }

    private formatInquiryBriefTimestamp(date: Date, options?: { includeSeconds?: boolean }): string {
        if (!Number.isFinite(date.getTime())) {
            return 'Unknown date';
        }
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const month = months[date.getMonth()];
        const day = date.getDate();
        const year = date.getFullYear();
        let hours = date.getHours();
        const minutes = date.getMinutes();
        const seconds = date.getSeconds();
        const am = hours < 12;
        hours = hours % 12;
        if (hours === 0) hours = 12;
        const minuteText = String(minutes).padStart(2, '0');
        const includeSeconds = options?.includeSeconds ?? false;
        const secondText = includeSeconds ? `.${String(seconds).padStart(2, '0')}` : '';
        return `${month} ${day} ${year} @ ${hours}.${minuteText}${secondText}${am ? 'am' : 'pm'}`;
    }

    private formatRoundTripDuration(ms: number): string {
        if (!Number.isFinite(ms) || ms <= 0) return '0s';
        const seconds = ms / 1000;
        if (seconds < 1) return `${Math.round(ms)}ms`;
        const rounded = seconds >= 10 ? seconds.toFixed(1) : seconds.toFixed(2);
        return `${rounded.replace(/\.0+$/, '')}s`;
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
