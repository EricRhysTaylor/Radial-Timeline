/*
 * Renderer Service
 * Abstraction layer for all SVG rendering.
 * Decouples logic from Obsidian-specific view implementation.
 */
import type { App } from 'obsidian';
import type { TimelineItem } from '../types';
import type RadialTimelinePlugin from '../main';
import { addHighlightRectangles as addHighlightRectanglesExt } from '../view/interactions';
import { renderGossamerLayer } from '../renderer/gossamerLayer';
import { renderGossamerMonthSpokes } from '../renderer/components/MonthSpokes';
import { renderProgressRing } from '../renderer/components/ProgressRing';
import { renderTargetDateTick } from '../renderer/components/ProgressTicks';
import { renderEstimatedDateElements, renderEstimationArc } from '../renderer/components/Progress';
import { ELAPSED_ARC_RADIUS } from '../renderer/layout/LayoutConstants';
import { dateToAngle } from '../utils/date';
// Import new DOM updaters
import { updateSceneColors, updateSceneOpenClasses, updateSceneSearchHighlights } from '../renderer/dom/SceneDOMUpdater';
import { updateNumberSquareStates, updateNumberSquareGrades } from '../renderer/dom/NumberSquareDOMUpdater';
import { updateSynopsisText, updateSynopsisVisibility } from '../renderer/dom/SynopsisDOMUpdater';
import { updateSubplotLabels, updateSubplotLabelVisibility } from '../renderer/dom/SubplotLabelDOMUpdater';
import { createTimelineSVG as buildTimelineSVG } from '../renderer/TimelineRenderer';
import { adjustBeatLabelsAfterRender } from '../renderer/dom/BeatLabelAdjuster';
import { PluginRendererFacade } from '../utils/sceneHelpers';
import { AuthorProgressService } from './AuthorProgressService';

export interface RenderResult {
    svgString: string;
    maxStageColor: string;
}

export class RendererService {
    constructor(private plugin: RadialTimelinePlugin) {}

    public renderTimeline(scenes: TimelineItem[]): RenderResult {
        const pluginFacade = this.plugin as unknown as PluginRendererFacade;
        
        // Check if APR needs refresh (stale check)
        let aprNeedsRefresh = false;
        try {
            const aprService = new AuthorProgressService(this.plugin, this.plugin.app);
            aprNeedsRefresh = aprService.isStale();
        } catch {
            // AuthorProgressService not available - skip indicator
        }
        
        return buildTimelineSVG(pluginFacade, scenes, { aprNeedsRefresh });
    }

    public generateTimeline(scenes: TimelineItem[]): RenderResult {
        return this.renderTimeline(scenes);
    }

    adjustBeatLabelsAfterRender(container: HTMLElement): void {
        adjustBeatLabelsAfterRender(container);
    }

    /**
     * Update scene colors for dominant subplot changes (DOM update)
     */
    updateSceneColorsDOM(container: HTMLElement, plugin: RadialTimelinePlugin, changedScenes: TimelineItem[]): boolean {
        const svg = container.querySelector('.radial-timeline-svg') as SVGSVGElement | null;
        if (!svg) return false;
        return updateSceneColors(svg, plugin as any, changedScenes); // SAFE: any type used for plugin interface compatibility
    }

    /**
     * Update number square states (status, AI grades) (DOM update)
     * Accepts either (container, plugin) or (container, plugin, scenes) for compatibility
     */
    updateNumberSquaresDOM(container: HTMLElement, pluginOrScenes: RadialTimelinePlugin | TimelineItem[], scenes?: TimelineItem[]): boolean {
        const svg = container.querySelector('.radial-timeline-svg') as SVGSVGElement | null;
        if (!svg) return false;
        
        // Handle both signatures: (container, plugin) and (container, plugin, scenes)
        if (Array.isArray(pluginOrScenes)) {
            return updateNumberSquareStates(svg, this.plugin as any, pluginOrScenes); // SAFE: any type used for plugin interface compatibility
        }
        const plugin = pluginOrScenes;
        const pluginAny = plugin as any; // SAFE: any type used for accessing lastSceneData
        const sceneData = scenes || pluginAny.lastSceneData || [];
        return updateNumberSquareStates(svg, plugin as any, sceneData); // SAFE: any type used for plugin interface compatibility
    }

    /**
     * Update synopsis text content (DOM update)
     * Accepts either (container, scenes) or (container, plugin) for compatibility
     */
    updateSynopsisDOM(container: HTMLElement, pluginOrScenes: RadialTimelinePlugin | TimelineItem[]): boolean {
        const svg = container.querySelector('.radial-timeline-svg') as SVGSVGElement | null;
        if (!svg) return false;
        
        // Handle both signatures
        if (Array.isArray(pluginOrScenes)) {
            return updateSynopsisText(svg, pluginOrScenes);
        }
        // If plugin passed, get scenes from it
        const pluginAny = pluginOrScenes as any; // SAFE: any type used for accessing lastSceneData
        const scenes = pluginAny.lastSceneData || [];
        updateSynopsisText(svg, scenes);
        updateSynopsisVisibility(svg, pluginOrScenes.openScenePaths || new Set());
        return true;
    }

    /**
     * Update subplot labels for mode changes (DOM update)
     */
    updateSubplotLabelsDOM(container: HTMLElement, newLabels: Map<string, string>): boolean {
        const svg = container.querySelector('.radial-timeline-svg') as SVGSVGElement | null;
        if (!svg) return false;
        return updateSubplotLabels(svg, newLabels);
    }

    /**
     * Update open-file visual state without full re-render.
     * Adds/removes rt-scene-is-open classes on scene groups and associated number elements.
     */
    updateOpenClasses(container: HTMLElement, openPaths: Set<string>): boolean {
        const svg = container.querySelector('.radial-timeline-svg') as SVGSVGElement | null;
        if (!svg) return false;

        const sceneGroups = Array.from(svg.querySelectorAll('.rt-scene-group')) as Element[];
        sceneGroups.forEach(group => {
            const encPath = group.getAttribute('data-path');
            const path = encPath ? decodeURIComponent(encPath) : '';
            const isOpen: boolean = path !== '' && openPaths.has(path);

            // Toggle group-level open class
            group.classList.toggle('rt-scene-is-open', isOpen);

            const scenePath = group.querySelector('.rt-scene-path');
            const sceneTitle = group.querySelector('.rt-scene-title');
            if (scenePath) scenePath.classList.toggle('rt-scene-is-open', isOpen);
            if (sceneTitle) sceneTitle.classList.toggle('rt-scene-is-open', isOpen);

            const sceneId = (scenePath as SVGPathElement | null)?.id;
            if (sceneId) {
                const numSquare = svg.querySelector(`.rt-number-square[data-scene-id="${sceneId}"]`);
                const numText = svg.querySelector(`.rt-number-text[data-scene-id="${sceneId}"]`);
                if (numSquare) numSquare.classList.toggle('rt-scene-is-open', isOpen);
                if (numText) numText.classList.toggle('rt-scene-is-open', isOpen);
            }
        });

        return true;
    }

    /**
     * Rebuild search highlights without full re-render.
     * Clears previous rt-search-term nodes and rt-search-result classes,
     * then re-applies highlights using existing logic.
     */
    updateSearchHighlights(containerEl: HTMLElement, searchTerm?: string): boolean {
        // Find actual container (may be wrapped)
        const container = containerEl.children[1] as HTMLElement | undefined ?? containerEl;
        const svg = container.querySelector('.radial-timeline-svg') as SVGSVGElement | null;
        if (!svg) return false;

        // Remove existing inline tspan markers for synopsis text highlighting
        const existing = svg.querySelectorAll('.rt-search-term');
        existing.forEach(node => {
            const parent = node.parentNode;
            if (!parent) return node.remove();
            const textNode = document.createTextNode(node.textContent || '');
            parent.replaceChild(textNode, node);
        });

        // Re-apply text highlights if search is active
        try {
            addHighlightRectanglesExt({ containerEl, plugin: this.plugin } as any); // SAFE: any type used for view interface compatibility
        } catch {}
        return true;
    }

    /**
     * Selectively rebuild or remove the Gossamer layer and spokes inside the existing SVG.
     */
    updateGossamerLayer(view: { containerEl: HTMLElement; plugin: RadialTimelinePlugin; sceneData?: TimelineItem[]; currentMode?: string }): boolean {
        const container = view.containerEl.children[1] as HTMLElement | undefined;
        if (!container) return false;
        const svg = container.querySelector('.radial-timeline-svg') as SVGSVGElement | null;
        if (!svg) return false;

        const applyGossamerMask = () => {
            if (view.currentMode === 'gossamer') {
                svg.setAttribute('data-gossamer-mode', 'true');
                const elements = svg.querySelectorAll('.rt-scene-path, .rt-number-square, .rt-number-text, .rt-scene-title');
                elements.forEach(el => {
                    const group = el.closest('.rt-scene-group');
                    const itemType = group?.getAttribute('data-item-type');
                    if (itemType !== 'Beat') {
                        el.classList.add('rt-non-selected');
                    }
                });
            } else {
                svg.removeAttribute('data-gossamer-mode');
            }
        };

        const removeExisting = () => {
            svg.querySelectorAll('.rt-gossamer-layer, .rt-gossamer-spokes').forEach(node => node.parentNode?.removeChild(node));
        };

        const captureGeometry = () => {
            let innerRadius: number | null = null;
            let outerRadius: number | null = null;
            const existingGossamerSpoke = svg.querySelector('.rt-gossamer-spokes line') as SVGLineElement | null;
            if (existingGossamerSpoke) {
                const x1 = Number(existingGossamerSpoke.getAttribute('x1') || '0');
                const y1 = Number(existingGossamerSpoke.getAttribute('y1') || '0');
                const x2 = Number(existingGossamerSpoke.getAttribute('x2') || '0');
                const y2 = Number(existingGossamerSpoke.getAttribute('y2') || '0');
                innerRadius = Math.hypot(x1, y1);
                outerRadius = Math.hypot(x2, y2);
            }
            const beatGroups = Array.from(svg.querySelectorAll('.rt-scene-group[data-item-type="Beat"]')) as SVGGElement[];
            if (beatGroups.length > 0) {
                if (innerRadius === null || !Number.isFinite(innerRadius)) {
                    const inners = beatGroups.map(g => Number(g.getAttribute('data-inner-r') || '0')).filter(n => Number.isFinite(n));
                    if (inners.length > 0) innerRadius = Math.min(...inners);
                }
                if (outerRadius === null || !Number.isFinite(outerRadius)) {
                    const outers = beatGroups.map(g => Number(g.getAttribute('data-outer-r') || '0')).filter(n => Number.isFinite(n));
                    if (outers.length > 0) outerRadius = Math.max(...outers);
                }
            }
            if (innerRadius === null || !Number.isFinite(innerRadius)) innerRadius = 200;
            if (outerRadius === null || !Number.isFinite(outerRadius)) outerRadius = innerRadius + 300;

            let outerRingInnerRadius = innerRadius;
            if (beatGroups.length > 0) {
                const inners = beatGroups.map(g => Number(g.getAttribute('data-inner-r') || '0')).filter(n => Number.isFinite(n));
                if (inners.length > 0) outerRingInnerRadius = Math.min(...inners);
            }

            return { innerRadius, outerRadius, outerRingInnerRadius };
        };

        const isGossamerMode = view.currentMode === 'gossamer';
        if (!isGossamerMode) {
            removeExisting();
            applyGossamerMask();
            return true;
        }

        const pluginAny = view.plugin as any; // SAFE: any type used for accessing dynamic gossamer properties
        const run = pluginAny._gossamerLastRun || null;
        if (!run) {
            removeExisting();
            applyGossamerMask();
            return false;
        }

        const scenes: TimelineItem[] = Array.isArray(view.sceneData) && view.sceneData.length > 0
            ? view.sceneData
            : (pluginAny.lastSceneData || []);

        const anglesByBeat: Map<string, number> = pluginAny._beatAngles || new Map<string, number>();
        const beatSlicesByName: Map<string, { startAngle: number; endAngle: number; innerR: number; outerR: number }>
            = pluginAny._beatSlices || new Map();

        const beatPathByName = new Map<string, string>();
        const publishStageColorByBeat = new Map<string, string>();
        if (scenes.length > 0) {
            scenes.forEach(s => {
                if (s.itemType !== 'Plot' || !s.title) return;
                const titleWithoutNumber = (s.title || '').replace(/^\s*\d+(?:\.\d+)?\s+/, '').trim();
                if (s.path) beatPathByName.set(titleWithoutNumber, s.path);
                const publishStage = (s as any)['Publish Stage'] || 'Zero'; // SAFE: any type used for dynamic frontmatter access
                const PUBLISH_STAGE_COLORS = pluginAny.PUBLISH_STAGE_COLORS as Record<string, string> | undefined;
                if (PUBLISH_STAGE_COLORS) {
                    const stageColor = PUBLISH_STAGE_COLORS[publishStage as keyof typeof PUBLISH_STAGE_COLORS] || PUBLISH_STAGE_COLORS.Zero;
                    publishStageColorByBeat.set(titleWithoutNumber, stageColor);
                }
            });
        }

        const { innerRadius, outerRadius, outerRingInnerRadius } = captureGeometry();
        removeExisting();

        const historicalRuns = pluginAny._gossamerHistoricalRuns || [];
        const minMax = pluginAny._gossamerMinMax || null;

        const spokesHtml = renderGossamerMonthSpokes({
            innerRadius,
            outerRadius,
            numActs: this.plugin.settings?.actCount ?? 3
        });
        const layerHtml = renderGossamerLayer(
            scenes || [],
            run,
            { innerRadius, outerRadius },
            anglesByBeat.size ? anglesByBeat : undefined,
            beatPathByName.size ? beatPathByName : undefined,
            historicalRuns,
            minMax,
            outerRingInnerRadius,
            publishStageColorByBeat.size ? publishStageColorByBeat : undefined,
            beatSlicesByName,
            this.plugin.settings?.publishStageColors
        );

        const toNode = (html: string): SVGElement | null => {
            if (!html) return null;
            const parser = new DOMParser();
            const doc = parser.parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${html}</svg>`, 'image/svg+xml');
            return (doc.documentElement.firstElementChild as SVGElement | null);
        };

        const spokesNode = toNode(spokesHtml);
        const layerNode = toNode(layerHtml);
        if (!spokesNode && !layerNode) {
            applyGossamerMask();
            return false;
        }

        const firstSynopsis = svg.querySelector('.rt-scene-info');
        if (firstSynopsis) {
            if (spokesNode) firstSynopsis.parentNode?.insertBefore(spokesNode, firstSynopsis);
            if (layerNode) firstSynopsis.parentNode?.insertBefore(layerNode, firstSynopsis);
        } else {
            if (spokesNode) svg.appendChild(spokesNode);
            if (layerNode) svg.appendChild(layerNode);
        }

        applyGossamerMask();
        return true;
    }

    /**
     * Selectively update the year progress ring, target-date tick/marker,
     * and estimated date elements without full re-render.
     */
    updateProgressAndTicks(containerEl: HTMLElement, currentSceneId?: string | null): boolean {
        const container = containerEl.children[1] as HTMLElement | undefined ?? containerEl;
        const svg = container.querySelector('.radial-timeline-svg') as SVGSVGElement | null;
        if (!svg) return false;

        const baseCircle = svg.querySelector('circle.progress-ring-base') as SVGCircleElement | null;
        if (!baseCircle) return false;
        const progressRadius = Number(baseCircle.getAttribute('r') || '0');
        if (!Number.isFinite(progressRadius) || progressRadius <= 0) return false;

        svg.querySelectorAll('path.progress-ring-fill').forEach(n => n.parentNode?.removeChild(n));
        svg.querySelectorAll('line.target-date-tick, rect.target-date-marker').forEach(n => n.parentNode?.removeChild(n));
        svg.querySelectorAll('line.estimated-date-tick, circle.estimated-date-dot, text.estimation-date-label').forEach(n => n.parentNode?.removeChild(n));
        svg.querySelectorAll('path.progress-ring-base').forEach(n => n.parentNode?.removeChild(n));

        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const yearProgress = (now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24 * 365);
        const currentYearStartAngle = -Math.PI / 2;

        const segmentsHtml = renderProgressRing({ progressRadius, yearProgress, currentYearStartAngle, segmentCount: 6 });
        const tickHtml = renderTargetDateTick({ plugin: this.plugin as any, progressRadius, dateToAngle }); // SAFE: any type used for plugin interface compatibility

        let estimationHtml = '';
        try {
            const pluginAny = this.plugin as any; // SAFE: any type used for dynamic method access
            if (typeof pluginAny.calculateCompletionEstimate === 'function') {
                const scenes: TimelineItem[] = pluginAny.lastSceneData || [];
                const estimateResult = pluginAny.calculateCompletionEstimate(scenes);
                if (estimateResult && this.plugin.settings?.showCompletionEstimate !== false) {
                    if (estimateResult.date) {
                        const yearsDiff = estimateResult.date.getFullYear() - now.getFullYear();
                        if (yearsDiff <= 0) {
                            estimationHtml += renderEstimationArc({ estimateDate: estimateResult.date, progressRadius });
                        }
                    }
                    estimationHtml += renderEstimatedDateElements({ estimate: estimateResult, progressRadius });
                }
            }
        } catch {}

        const combined = `${estimationHtml}${segmentsHtml}${tickHtml}`;

        const parser = new DOMParser();
        const doc = parser.parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${combined}</svg>`, 'image/svg+xml');
        const toInsert: Element[] = Array.from(doc.documentElement.children);
        if (toInsert.length === 0) return true;

        const parent = baseCircle.parentNode;
        if (!parent) return false;
        const nextSibling = baseCircle.nextSibling;
        toInsert.forEach(el => parent.insertBefore(svg.ownerDocument.importNode(el, true), nextSibling));
        return true;
    }
}
