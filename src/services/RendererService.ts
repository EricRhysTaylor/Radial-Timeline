import type { App } from 'obsidian';
import type { Scene } from '../main';
import { addHighlightRectangles as addHighlightRectanglesExt } from '../view/interactions';
import { renderGossamerLayer } from '../renderer/gossamerLayer';
import { renderGossamerMonthSpokes } from '../renderer/components/MonthSpokes';
import { renderProgressRing } from '../renderer/components/ProgressRing';
import { renderTargetDateTick } from '../renderer/components/ProgressTicks';
import { renderEstimatedDateElements, renderEstimationArc } from '../renderer/components/Progress';

export class RendererService {
    private app: App;
    constructor(app: App) { this.app = app; }

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
  updateSearchHighlights(view: { containerEl: HTMLElement; plugin: any; registerDomEvent?: Function }): boolean { // SAFE: any type used for plugin interface compatibility with dynamic properties
        const container = view.containerEl.children[1] as HTMLElement | undefined;
        if (!container) return false;
        const svg = container.querySelector('.radial-timeline-svg') as SVGSVGElement | null;
        if (!svg) return false;

        // Remove existing inline tspan markers
        const existing = svg.querySelectorAll('.rt-search-term');
        existing.forEach(node => node.parentNode?.removeChild(node));

        // Remove search-result classes from number elements
        svg.querySelectorAll('.rt-number-square.rt-search-result').forEach(el => el.classList.remove('rt-search-result'));
        svg.querySelectorAll('.rt-number-text.rt-search-result').forEach(el => el.classList.remove('rt-search-result'));

        // Re-apply highlights if search is active
        try {
            addHighlightRectanglesExt(view as any);
        } catch {}
        return true;
    }

    /**
     * Selectively rebuild or remove the Gossamer layer and spokes inside the existing SVG.
     * - If the view is in gossamer mode, (re)generates spokes + layer and inserts them before synopses.
     * - If not in gossamer mode, removes any existing gossamer elements.
     * Returns true on success, false if SVG or required data is missing (caller may fall back to full refresh).
     */
  updateGossamerLayer(view: { containerEl: HTMLElement; plugin: any; sceneData?: Scene[]; currentMode?: string }): boolean { // SAFE: any type used for plugin interface compatibility with dynamic properties
        const container = view.containerEl.children[1] as HTMLElement | undefined;
        if (!container) return false;
        const svg = container.querySelector('.radial-timeline-svg') as SVGSVGElement | null;
        if (!svg) return false;

        // Always remove existing gossamer groups first
        svg.querySelectorAll('.rt-gossamer-layer, .rt-gossamer-spokes').forEach(node => node.parentNode?.removeChild(node));

        // If not in gossamer mode, nothing else to do
        if (view.currentMode !== 'gossamer') return true;

        const pluginAny = view.plugin as any;
        const run = pluginAny._gossamerLastRun || null;
        if (!run) return false;

        // Gather scenes (prefer cached on view)
        const scenes: Scene[] = Array.isArray((view as any).sceneData) && (view as any).sceneData.length > 0
            ? ((view as any).sceneData as Scene[])
            : (view.plugin.lastSceneData || []);

        // Angles/slices captured during main render
        const anglesByBeat: Map<string, number> = pluginAny._plotBeatAngles || new Map<string, number>();
        const beatSlicesByName: Map<string, { startAngle: number; endAngle: number; innerR: number; outerR: number }>
            = pluginAny._plotBeatSlices || new Map();

        // Build beat → path and publish stage color maps from scenes
        const beatPathByName = new Map<string, string>();
        const publishStageColorByBeat = new Map<string, string>();
        if (scenes.length > 0) {
            scenes.forEach(s => {
                if (s.itemType !== 'Plot' || !s.title) return;
                const titleWithoutNumber = (s.title || '').replace(/^\s*\d+(?:\.\d+)?\s+/, '').trim();
                if (s.path) beatPathByName.set(titleWithoutNumber, s.path);
                const publishStage = (s as any)['Publish Stage'] || 'Zero';
                const PUBLISH_STAGE_COLORS = (view.plugin as any).PUBLISH_STAGE_COLORS as Record<string, string> | undefined;
                if (PUBLISH_STAGE_COLORS) {
                    const stageColor = PUBLISH_STAGE_COLORS[publishStage as keyof typeof PUBLISH_STAGE_COLORS] || PUBLISH_STAGE_COLORS.Zero;
                    publishStageColorByBeat.set(titleWithoutNumber, stageColor);
                }
            });
        }

        // Derive geometry from existing DOM
        // Prefer existing gossamer spokes if present (exact radii)
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
        // Fallback: estimate from plot groups (min inner, max outer)
        if (innerRadius === null || outerRadius === null) {
            const plotGroups = Array.from(svg.querySelectorAll('.rt-scene-group[data-item-type="Beat"]')) as SVGGElement[];
            if (plotGroups.length > 0) {
                const inners = plotGroups.map(g => Number(g.getAttribute('data-inner-r') || '0')).filter(n => Number.isFinite(n));
                const outers = plotGroups.map(g => Number(g.getAttribute('data-outer-r') || '0')).filter(n => Number.isFinite(n));
                if (inners.length > 0) innerRadius = Math.min(...inners);
                if (outers.length > 0) outerRadius = Math.max(...outers);
            }
        }
        // Last-resort defaults
        if (innerRadius === null || !Number.isFinite(innerRadius)) innerRadius = 200;
        if (outerRadius === null || !Number.isFinite(outerRadius)) outerRadius = innerRadius + 300;

        // Outer ring inner radius for beat outlines
        let outerRingInnerRadius = innerRadius;
        {
            const plotGroups = Array.from(svg.querySelectorAll('.rt-scene-group[data-item-type="Beat"]')) as SVGGElement[];
            if (plotGroups.length > 0) {
                const inners = plotGroups.map(g => Number(g.getAttribute('data-inner-r') || '0')).filter(n => Number.isFinite(n));
                if (inners.length > 0) outerRingInnerRadius = Math.min(...inners);
            }
        }

        // Historical runs and band
        const historicalRuns = pluginAny._gossamerHistoricalRuns || [];
        const minMax = pluginAny._gossamerMinMax || null;

        // Build spoke and layer markup
        const spokesHtml = renderGossamerMonthSpokes({ innerRadius, outerRadius });
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
            view.plugin.settings?.publishStageColors
        );

        // Convert snippets to SVG nodes using DOMParser
        const toNode = (html: string): SVGElement | null => {
            if (!html) return null;
            const parser = new DOMParser();
            const doc = parser.parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${html}</svg>`, 'image/svg+xml');
            return (doc.documentElement.firstElementChild as SVGElement | null);
        };

        const spokesNode = toNode(spokesHtml);
        const layerNode = toNode(layerHtml);
        if (!spokesNode && !layerNode) return false;

        // Insert before synopses so synopses remain on top
        const firstSynopsis = svg.querySelector('.rt-scene-info');
        if (firstSynopsis) {
            if (spokesNode) firstSynopsis.parentNode?.insertBefore(spokesNode, firstSynopsis);
            if (layerNode) firstSynopsis.parentNode?.insertBefore(layerNode, firstSynopsis);
        } else {
            if (spokesNode) svg.appendChild(spokesNode);
            if (layerNode) svg.appendChild(layerNode);
        }

        return true;
    }

    /**
     * Selectively update the year progress ring, target-date tick/marker,
     * and estimated date elements without full re-render.
     */
  updateProgressAndTicks(view: { containerEl: HTMLElement; plugin: any; sceneData?: Scene[] }): boolean { // SAFE: any type used for plugin interface compatibility with dynamic properties
        const container = view.containerEl.children[1] as HTMLElement | undefined;
        if (!container) return false;
        const svg = container.querySelector('.radial-timeline-svg') as SVGSVGElement | null;
        if (!svg) return false;

        // Locate the base circle to derive radius and as insertion anchor
        const baseCircle = svg.querySelector('circle.progress-ring-base') as SVGCircleElement | null;
        if (!baseCircle) return false;
        const progressRadius = Number(baseCircle.getAttribute('r') || '0');
        if (!Number.isFinite(progressRadius) || progressRadius <= 0) return false;

        // Remove existing dynamic elements (keep the base circle)
        svg.querySelectorAll('path.progress-ring-fill').forEach(n => n.parentNode?.removeChild(n));
        svg.querySelectorAll('line.target-date-tick, rect.target-date-marker').forEach(n => n.parentNode?.removeChild(n));
        svg.querySelectorAll('line.estimated-date-tick, circle.estimated-date-dot, text.estimation-date-label').forEach(n => n.parentNode?.removeChild(n));
        // Remove estimation arc path(s) but do not remove the base circle
        svg.querySelectorAll('path.progress-ring-base').forEach(n => n.parentNode?.removeChild(n));

        // Compute current year progress
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const yearProgress = (now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24 * 365);
        const currentYearStartAngle = -Math.PI / 2;

        // date -> angle helper (aligns 12 o'clock at -PI/2, clockwise)
        const dateToAngle = (d: Date): number => {
            const m = d.getMonth();
            const day = d.getDate();
            const daysInMonth = new Date(d.getFullYear(), m + 1, 0).getDate();
            const yearPos = m / 12 + (day / daysInMonth) / 12;
            return ((yearPos + 0.75) % 1) * Math.PI * 2; // +0.75 turns 0 to -PI/2
        };

        // Build markup
        const segmentsHtml = renderProgressRing({ progressRadius, yearProgress, currentYearStartAngle, segmentCount: 6 });
        const tickHtml = renderTargetDateTick({ plugin: view.plugin, progressRadius, dateToAngle });

        // Estimated date/arc if available
        let estimationHtml = '';
        try {
            if ((view.plugin.settings.showEstimate ?? true) && typeof view.plugin.calculateCompletionEstimate === 'function') {
                const scenes: Scene[] = (view as any).sceneData || (view.plugin as any).lastSceneData || [];
                const estimateResult = view.plugin.calculateCompletionEstimate(scenes);
                if (estimateResult) {
                    // Only draw arc for current/past year (mirror renderer logic)
                    const yearsDiff = estimateResult.date.getFullYear() - now.getFullYear();
                    if (yearsDiff <= 0) {
                        estimationHtml += renderEstimationArc({ estimateDate: estimateResult.date, progressRadius });
                    }
                    estimationHtml += renderEstimatedDateElements({ estimateDate: estimateResult.date, progressRadius });
                }
            }
        } catch {}

        const combined = `${estimationHtml}${segmentsHtml}${tickHtml}`;

        // Parse to SVG nodes
        const parser = new DOMParser();
        const doc = parser.parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${combined}</svg>`, 'image/svg+xml');
        const toInsert: Element[] = Array.from(doc.documentElement.children);
        if (toInsert.length === 0) return true; // nothing to add

        // Insert immediately after the base circle to preserve z-order
        const parent = baseCircle.parentNode;
        if (!parent) return false;
        const nextSibling = baseCircle.nextSibling;
        toInsert.forEach(el => parent.insertBefore(svg.ownerDocument.importNode(el, true), nextSibling));
        return true;
    }
}


