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
import type { InquiryPromptConfig } from '../types/settings';
import { buildDefaultInquiryPromptConfig, normalizeInquiryPromptConfig } from './prompts';
import { ensureInquiryArtifactFolder, getMostRecentArtifactFile, resolveInquiryArtifactFolder } from './utils/artifacts';
import { openOrRevealFile } from '../utils/fileUtils';
import { InquiryGlyph, FLOW_RADIUS, FLOW_STROKE } from './components/InquiryGlyph';
import { InquiryRunnerStub } from './runner/InquiryRunnerStub';
import type { CorpusManifest, EvidenceParticipationRules } from './runner/types';
import { InquirySessionStore } from './InquirySessionStore';
import { normalizeFrontmatterKeys } from '../utils/frontmatter';
import type { InquirySourcesSettings } from '../types/settings';
import { InquiryCorpusResolver, InquiryCorpusSnapshot, InquiryCorpusItem } from './services/InquiryCorpusResolver';
import { getModelDisplayName } from '../utils/modelResolver';
import { setupTooltipsFromDataAttributes } from '../utils/tooltip';
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
const PREVIEW_PANEL_WIDTH = 620;
const PREVIEW_PANEL_Y = -320;
const PREVIEW_PANEL_PADDING_X = 28;
const PREVIEW_PANEL_PADDING_Y = 18;
const PREVIEW_HERO_LINE_HEIGHT = 22;
const PREVIEW_HERO_MAX_LINES = 2;
const PREVIEW_DETAIL_GAP = 12;
const PREVIEW_ROW_HEIGHT = 18;
const PREVIEW_LABEL_X = 12;
const PREVIEW_VALUE_X = 120;
const PREVIEW_ICON_RADIUS = 3;
const PREVIEW_FOOTER_GAP = 12;
const PREVIEW_FOOTER_HEIGHT = 16;

type InquiryQuestion = {
    id: string;
    label: string;
    question: string;
    zone: InquiryZone;
    icon: string;
};

type InquiryPreviewRow = {
    group: SVGGElement;
    icon: SVGCircleElement;
    label: SVGTextElement;
    value: SVGTextElement;
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
    private engineBadgeGroup?: SVGGElement;
    private engineBadgeBg?: SVGRectElement;
    private engineBadgeText?: SVGTextElement;
    private engineBadgeTitle?: SVGTitleElement;
    private contextBadgeIcon?: SVGUseElement;
    private contextBadgeSigmaText?: SVGTextElement;
    private contextBadgeLabel?: SVGTextElement;
    private minimapTicksEl?: SVGGElement;
    private minimapBaseline?: SVGLineElement;
    private minimapEndCapStart?: SVGRectElement;
    private minimapEndCapEnd?: SVGRectElement;
    private minimapEmptyText?: SVGTextElement;
    private minimapTicks: SVGRectElement[] = [];
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
    private previewBg?: SVGRectElement;
    private previewHero?: SVGTextElement;
    private previewFooter?: SVGTextElement;
    private previewRows: InquiryPreviewRow[] = [];
    private previewHideTimer?: number;
    private previewLast?: { zone: InquiryZone; question: string };
    private cacheStatusEl?: SVGTextElement;
    private confidenceEl?: SVGTextElement;
    private navPrevButton?: SVGGElement;
    private navNextButton?: SVGGElement;
    private navPrevIcon?: SVGUseElement;
    private navNextIcon?: SVGUseElement;
    private iconSymbols = new Set<string>();
    private lastFocusSceneByBookId = new Map<string, string>();
    private corpusResolver: InquiryCorpusResolver;
    private corpus?: InquiryCorpusSnapshot;
    private focusPersistTimer?: number;
    private runner: InquiryRunnerStub;
    private sessionStore: InquirySessionStore;

    constructor(leaf: WorkspaceLeaf, plugin: RadialTimelinePlugin) {
        super(leaf);
        this.plugin = plugin;
        this.runner = new InquiryRunnerStub();
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
        this.registerDomEvent(this.scopeToggleButton as unknown as HTMLElement, 'click', () => {
            this.handleScopeChange(this.state.scope === 'book' ? 'saga' : 'book');
        });

        const artifactX = (VIEWBOX_MAX - hudMargin - iconSize) - hudOffsetX;
        this.artifactButton = this.createIconButton(hudGroup, artifactX, 0, iconSize, 'aperture', 'Save artifact');
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
        this.engineBadgeTitle = this.createSvgElement('title');
        this.engineBadgeTitle.textContent = 'Inquiry engine (change in Settings → AI)';
        this.engineBadgeGroup.appendChild(this.engineBadgeTitle);
        this.registerDomEvent(this.engineBadgeGroup as unknown as HTMLElement, 'click', () => this.openAiSettings());

        const minimapGroup = this.createSvgGroup(canvasGroup, 'ert-inquiry-minimap', 0, -400);
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
        this.registerDomEvent(this.flowRingHit as unknown as HTMLElement, 'click', () => this.setActiveLens('flow'));
        this.registerDomEvent(this.depthRingHit as unknown as HTMLElement, 'click', () => this.setActiveLens('depth'));

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
        this.confidenceEl = this.createSvgText(statusGroup, 'ert-inquiry-status-item', 'Confidence: none', 140, 0);
    }

    private buildPromptPreviewPanel(parent: SVGGElement): void {
        const panel = this.createSvgGroup(parent, 'ert-inquiry-preview', 0, PREVIEW_PANEL_Y);
        this.previewGroup = panel;

        const bg = this.createSvgElement('rect');
        bg.classList.add('ert-inquiry-preview-bg');
        bg.setAttribute('x', String(-PREVIEW_PANEL_WIDTH / 2));
        bg.setAttribute('y', '0');
        bg.setAttribute('width', String(PREVIEW_PANEL_WIDTH));
        bg.setAttribute('rx', '16');
        bg.setAttribute('ry', '16');
        panel.appendChild(bg);
        this.previewBg = bg;

        const hero = this.createSvgText(panel, 'ert-inquiry-preview-hero', '', -PREVIEW_PANEL_WIDTH / 2 + PREVIEW_PANEL_PADDING_X, PREVIEW_PANEL_PADDING_Y);
        hero.setAttribute('text-anchor', 'start');
        hero.setAttribute('dominant-baseline', 'hanging');
        this.previewHero = hero;

        const rowLabels = ['Scope', 'Evidence', 'Classes', 'Roots', 'AI Engine', 'Est. Cost'];
        this.previewRows = rowLabels.map(label => {
            const group = this.createSvgGroup(panel, 'ert-inquiry-preview-row');
            const icon = this.createSvgElement('circle');
            icon.classList.add('ert-inquiry-preview-icon');
            icon.setAttribute('r', String(PREVIEW_ICON_RADIUS));
            icon.setAttribute('cx', '0');
            icon.setAttribute('cy', '0');
            group.appendChild(icon);

            const labelEl = this.createSvgText(group, 'ert-inquiry-preview-label', label, PREVIEW_LABEL_X, 0);
            labelEl.setAttribute('dominant-baseline', 'middle');
            labelEl.setAttribute('text-anchor', 'start');

            const valueEl = this.createSvgText(group, 'ert-inquiry-preview-value', '', PREVIEW_VALUE_X, 0);
            valueEl.setAttribute('dominant-baseline', 'middle');
            valueEl.setAttribute('text-anchor', 'start');

            return { group, icon, label: labelEl, value: valueEl };
        });

        const footer = this.createSvgText(panel, 'ert-inquiry-preview-footer', 'Hover previews what will be sent. Click runs the inquiry.', -PREVIEW_PANEL_WIDTH / 2 + PREVIEW_PANEL_PADDING_X, 0);
        footer.setAttribute('text-anchor', 'start');
        footer.setAttribute('dominant-baseline', 'hanging');
        this.previewFooter = footer;

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
            'sigma'
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

    private buildDefaultSelectedPromptIds(): Record<InquiryZone, string> {
        const config = this.getPromptConfig();
        const pickFirstEnabled = (zone: InquiryZone): string => {
            const slots = config[zone] ?? [];
            const firstEnabled = slots.find(slot => slot.enabled && slot.question.trim().length > 0);
            return firstEnabled?.id ?? slots[0]?.id ?? zone;
        };
        return {
            setup: pickFirstEnabled('setup'),
            pressure: pickFirstEnabled('pressure'),
            payoff: pickFirstEnabled('payoff')
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
            .filter(slot => slot.enabled && slot.question.trim().length > 0)
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
            elements.group.setAttribute('aria-label', prompt.question);
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
            onPromptSelect: (zone, promptId) => this.setSelectedPrompt(zone, promptId),
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
            const enabled = slots.filter(slot => slot.enabled && slot.question.trim().length > 0);
            const desired = enabled[0]?.id ?? slots[0]?.id;
            if (!desired) return;
            const current = this.state.selectedPromptIds[zone];
            const currentValid = enabled.some(slot => slot.id === current);
            if (!currentValid) {
                this.state.selectedPromptIds[zone] = desired;
            }
        });
    }

    private setSelectedPrompt(zone: InquiryZone, promptId: string): void {
        if (this.state.selectedPromptIds[zone] === promptId) return;
        this.state.selectedPromptIds[zone] = promptId;
        this.updateZonePrompts();
        this.updateGlyphPromptState();
    }

    private handlePromptClick(zone: InquiryZone): void {
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
        const y = VIEWBOX_MIN + 100;
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
        if (this.engineBadgeTitle) {
            this.engineBadgeTitle.textContent = 'Inquiry engine (change in Settings → AI)';
        }
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

        const items = this.getCurrentItems();
        const count = items.length;
        const length = this.minimapLayout.length;
        const tickSize = 20;
        const tickGap = 4;
        const baselineGap = 2;
        const capWidth = Math.max(6, Math.round(tickSize * 0.4));
        const capHeight = Math.max(30, tickSize + 12);
        const tickInset = capWidth + (tickSize / 2) + 4;
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

        if (!count) {
            const emptyLabel = this.state.scope === 'saga' ? 'No books found.' : 'No scenes found.';
            this.minimapEmptyText.textContent = emptyLabel;
            this.minimapEmptyText.classList.remove('ert-hidden');
            this.updateMinimapFocus();
            return;
        }

        this.minimapEmptyText.classList.add('ert-hidden');

        for (let i = 0; i < count; i += 1) {
            const item = items[i];
            const tick = this.createSvgElement('rect');
            tick.classList.add('ert-inquiry-minimap-tick');
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
            tick.setAttribute('aria-label', `Focus ${label}`);
            this.registerDomEvent(tick as unknown as HTMLElement, 'click', () => this.setFocusByIndex(i + 1));
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
        const severityClasses = ['is-severity-low', 'is-severity-medium', 'is-severity-high'];

        this.minimapTicks.forEach((tick, idx) => {
            const label = tick.getAttribute('data-label') || `T${idx + 1}`;
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
        this.state.scope = scope;
        this.state.activeResult = null;
        this.refreshUI();
    }

    private setActiveLens(mode: InquiryMode): void {
        if (!mode || mode === this.state.mode) return;
        this.state.mode = mode;
        this.updateModeClass();
        if (this.previewGroup?.classList.contains('is-visible') && this.previewLast) {
            this.updatePromptPreview(this.previewLast.zone, mode, this.previewLast.question);
        }
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
        this.state.activeQuestionId = question.id;
        this.state.activeZone = question.zone;
        this.state.isRunning = true;

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
        const classScope = this.getClassScopeConfig(sources.classScope);
        if (!classScope.allowAll && classScope.allowed.size === 0) {
            const fingerprintRaw = `${INQUIRY_SCHEMA_VERSION}|${questionId}|${this.getActiveInquiryModelId()}|`;
            return {
                entries,
                fingerprint: this.hashString(fingerprintRaw),
                generatedAt: now
            };
        }
        const scanRoots = normalizeScanRootPatterns(sources.scanRoots);
        const resolvedRoots = scanRoots.length
            ? ((sources.resolvedScanRoots && sources.resolvedScanRoots.length)
                ? sources.resolvedScanRoots
                : resolveScanRoots(scanRoots, this.app.vault, MAX_RESOLVED_SCAN_ROOTS).resolvedRoots)
            : [];
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

        return {
            entries,
            fingerprint,
            generatedAt: now
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
                generatedAt: now
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

        return {
            entries,
            fingerprint,
            generatedAt: now
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
        const stubHits = this.buildStubHitFindings(this.getCurrentItems());
        stubHits.forEach(finding => {
            map.set(finding.refId, finding);
        });
        result.findings.forEach(finding => {
            if (!this.isFindingHit(finding)) return;
            const existing = map.get(finding.refId);
            if (!existing || this.getSeverityRank(finding.severity) > this.getSeverityRank(existing.severity)) {
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
                severity: 'medium',
                confidence: 'low',
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

    private showPromptPreview(zone: InquiryZone, mode: InquiryMode, question: string): void {
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

    private updatePromptPreview(zone: InquiryZone, mode: InquiryMode, question: string): void {
        if (!this.previewGroup || !this.previewHero || !this.previewBg) return;

        const zoneLabel = zone === 'setup' ? 'Setup' : zone === 'pressure' ? 'Pressure' : 'Payoff';
        const modeLabel = mode === 'flow' ? 'Flow' : 'Depth';
        const heroText = `${zoneLabel} · ${modeLabel} — ${question}`;
        const heroLines = this.setWrappedSvgText(this.previewHero, heroText, PREVIEW_PANEL_WIDTH - (PREVIEW_PANEL_PADDING_X * 2), PREVIEW_HERO_MAX_LINES, PREVIEW_HERO_LINE_HEIGHT);

        const detailStartY = PREVIEW_PANEL_PADDING_Y + (heroLines * PREVIEW_HERO_LINE_HEIGHT) + PREVIEW_DETAIL_GAP;
        const panelLeft = -PREVIEW_PANEL_WIDTH / 2;
        const rows = [
            this.getPreviewScopeValue(),
            this.getPreviewEvidenceValue(),
            this.getPreviewClassesValue(),
            this.getPreviewRootsValue(),
            this.getPreviewEngineValue(),
            this.getPreviewCostValue()
        ];

        this.previewRows.forEach((row, index) => {
            const rowY = detailStartY + (index * PREVIEW_ROW_HEIGHT);
            row.group.setAttribute('transform', `translate(${panelLeft + PREVIEW_PANEL_PADDING_X} ${rowY})`);
            row.value.textContent = rows[index] ?? '';
        });

        const footerY = detailStartY + (this.previewRows.length * PREVIEW_ROW_HEIGHT) + PREVIEW_FOOTER_GAP;
        if (this.previewFooter) {
            this.previewFooter.setAttribute('y', String(footerY));
        }

        const panelHeight = footerY + PREVIEW_FOOTER_HEIGHT + PREVIEW_PANEL_PADDING_Y;
        this.previewBg.setAttribute('height', panelHeight.toFixed(2));
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
        return `${scopeLabel} · ${focusType} ${focusLabel}`;
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
