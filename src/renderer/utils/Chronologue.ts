/*
 * Helper to generate outer label data for Chronologue mode.
 */

import type { TimelineItem } from '../../types';
import { isBeatNote, sortScenes, type PluginRendererFacade } from '../../utils/sceneHelpers';
import { calculateTimeSpan, generateChronologicalTicks, durationSelectionToMs, parseDurationDetail } from '../../utils/date';
import { formatNumber } from '../../utils/svg';
import { startPerfSegment } from '../utils/Performance';
import {
    renderChronologueTimelineArc,
    renderChronologicalBackboneArc,
    type ChronologueSceneEntry
} from '../components/ChronologueTimeline';
import { renderBackdropRing } from '../components/BackdropRing';
import { getRuntimeCapPercent } from '../../view/interactions/ChronologueShiftController';
import { parseRuntimeField } from '../../utils/runtimeEstimator';

export type ChronologueLabel = {
    name: string;
    shortName: string;
    angle: number;
    isMajor?: boolean;
    isFirst?: boolean;
    isLast?: boolean;
    sceneIndex?: number;
    earthDate?: string;
};

export function buildChronologueOuterLabels(
    plugin: PluginRendererFacade,
    scenes: TimelineItem[]
): ChronologueLabel[] {
    const stopChronoLabels = startPerfSegment(plugin, 'timeline.chronologue-labels');
    const startAngle = -Math.PI / 2;
    const endAngle = (3 * Math.PI) / 2;

    const seenPaths = new Set<string>();
    const combined: TimelineItem[] = [];
    scenes.forEach(s => {
        if (isBeatNote(s) || s.itemType === 'Backdrop') {
            return;
        }

        const key = s.path || `${s.title || ''}::${String(s.when || '')}`;
        if (!seenPaths.has(key)) {
            seenPaths.add(key);
            combined.push(s);
        }
    });

    const sortByWhen = true;
    const forceChronological = true;
    const sortedScenes = sortScenes(combined, sortByWhen, forceChronological);

    const validDates = sortedScenes
        .map(s => s.when)
        .filter((when): when is Date => when instanceof Date && !isNaN(when.getTime()));
    const timeSpan = validDates.length > 0 ? calculateTimeSpan(validDates) : undefined;

    const sceneStartAngles: number[] = [];
    let sceneAngularSize = 0;
    if (sortedScenes.length > 0) {
        const totalAngularSpace = endAngle - startAngle;
        sceneAngularSize = totalAngularSpace / sortedScenes.length;

        sortedScenes.forEach((_, idx) => {
            const sceneStartAngle = startAngle + (idx * sceneAngularSize);
            sceneStartAngles.push(sceneStartAngle);
        });
    }

    const chronoTicks = generateChronologicalTicks(sortedScenes, sceneStartAngles, sceneAngularSize, timeSpan);
    const outerLabels = chronoTicks.map(tick => ({
        name: tick.name,
        shortName: tick.shortName,
        angle: tick.angle,
        isMajor: tick.isMajor,
        isFirst: tick.isFirst,
        isLast: tick.isLast,
        sceneIndex: tick.sceneIndex,
        earthDate: tick.earthDate
    }));
    stopChronoLabels();
    return outerLabels;
}

export type ChronologueOverlayOptions = {
    plugin: PluginRendererFacade;
    scenes: TimelineItem[];
    subplotOuterRadius: number;
    manuscriptOrderPositions?: Map<string, { startAngle: number; endAngle: number }>;
    ringStartRadii: number[];
    ringWidths: number[];
    masterSubplotOrder?: string[];
    chronologueSceneEntries?: ChronologueSceneEntry[];
    durationArcRadius?: number;
    synopsesElements?: SVGGElement[];
    maxTextWidth?: number;
    useRuntimeMode?: boolean;
};

export function renderChronologueOverlays({
    plugin,
    scenes,
    subplotOuterRadius,
    manuscriptOrderPositions,
    ringStartRadii,
    ringWidths,
    masterSubplotOrder = [],
    chronologueSceneEntries,
    durationArcRadius = 0,
    synopsesElements = [],
    maxTextWidth = 0,
    useRuntimeMode = false
}: ChronologueOverlayOptions): string {
    const stopChronoOverlays = startPerfSegment(plugin, 'timeline.chronologue-overlays');
    let svg = '';

    // Calculate cap: use runtime cap percent when in runtime mode, otherwise use duration setting
    let durationCapMs: number | null;
    if (useRuntimeMode) {
        // Calculate max runtime from all scenes (in ms)
        let maxRuntimeMs = 0;
        scenes.forEach(scene => {
            if (scene.itemType === 'Scene' || scene.itemType === 'Backdrop') {
                const runtimeSeconds = parseRuntimeField(scene.Runtime);
                if (runtimeSeconds !== null && runtimeSeconds > 0) {
                    const runtimeMs = runtimeSeconds * 1000;
                    if (runtimeMs > maxRuntimeMs) {
                        maxRuntimeMs = runtimeMs;
                    }
                }
            }
        });
        // Apply the cap percent (0 = minimum stub, 100 = full max runtime)
        const capPercent = getRuntimeCapPercent();
        if (capPercent === 0) {
            // Minimum stub - use a very small cap to make all arcs minimal
            durationCapMs = 1000; // 1 second minimum
        } else {
            durationCapMs = (capPercent / 100) * maxRuntimeMs;
        }
    } else {
        durationCapMs = durationSelectionToMs(plugin.settings.chronologueDurationCapSelection);
    }
    const chronologueTimelineArc = renderChronologueTimelineArc(
        scenes,
        subplotOuterRadius,
        manuscriptOrderPositions,
        durationCapMs,
        durationArcRadius,
        chronologueSceneEntries,
        useRuntimeMode
    );
    if (chronologueTimelineArc) {
        svg += chronologueTimelineArc;
    }

    const outerRingIndex = ringStartRadii.length - 1;
    const outerRingInnerR = ringStartRadii[outerRingIndex];
    const outerRingOuterR = outerRingInnerR + ringWidths[outerRingIndex];

    let customThresholdMs: number | undefined = undefined;
    if (plugin.settings.discontinuityThreshold) {
        const parsed = parseDurationDetail(plugin.settings.discontinuityThreshold);
        if (parsed) {
            customThresholdMs = parsed.ms;
        }
    }

    svg += renderChronologicalBackboneArc(
        scenes,
        outerRingInnerR,
        outerRingOuterR,
        3,
        manuscriptOrderPositions,
        chronologueSceneEntries,
        customThresholdMs
    );

    // Render Backdrop Ring - ONLY if it was pre-allocated a virtual lane by the layout engine
    const backdropSubplotIndex = masterSubplotOrder.indexOf('Backdrop');
    if (backdropSubplotIndex !== -1) {
        const numRings = ringStartRadii.length;
        // Find the specific ring index for this subplot
        // Ring indices go from 0 (inner) to NUM_RINGS-1 (outer)
        const ringIndex = numRings - 1 - backdropSubplotIndex;

        if (ringIndex >= 0 && ringIndex < numRings) {
            // Use precise middle radius of the allocated ring lane
            const backdropRadius = ringStartRadii[ringIndex] + ringWidths[ringIndex] / 2;

            svg += renderBackdropRing({
                plugin,
                scenes,
                availableRadius: backdropRadius,
                synopsesElements,
                maxTextWidth,
                masterSubplotOrder
            });
        }
    }

    stopChronoOverlays();
    return svg;
}

type OuterLabelRenderParams = {
    outerLabels: ChronologueLabel[];
    isChronologueMode: boolean;
    currentMonthIndex: number;
};

export function renderOuterLabelTexts({
    outerLabels,
    isChronologueMode,
    currentMonthIndex
}: OuterLabelRenderParams): { labelsSvg: string; boundaryLabelsHtml: string } {
    let labelsSvg = '';
    let boundaryLabelsHtml = '';

    outerLabels.forEach(({ shortName, isFirst, isLast, earthDate, sceneIndex }, index) => {
        const pathId = `monthLabelPath-${index}`;

        // Only apply past month dimming in non-chronologue modes
        const isPastMonth = !isChronologueMode && index < currentMonthIndex;

        let labelClass = 'rt-month-label-outer';
        if (isFirst) {
            labelClass = 'rt-month-label-outer rt-date-boundary rt-date-first';
        } else if (isLast) {
            labelClass = 'rt-month-label-outer rt-date-boundary rt-date-last';
        }

        let labelContent = shortName;
        if ((isFirst || isLast) && shortName.includes('\n')) {
            const lines = shortName.split('\n');
            labelContent = lines
                .map((line, i) => `<tspan x="0" dy="${i === 0 ? 0 : '0.9em'}">${line}</tspan>`)
                .join('');
        }

        // Add data-earth-date so alien (planetary) mode can swap labels
        const earthDateAttr = earthDate ? ` data-earth-date="${earthDate}"` : '';
        // Add data-scene-index so runtime mode can associate labels with scene runtimes
        const sceneIndexAttr = sceneIndex !== undefined ? ` data-scene-index="${sceneIndex}"` : '';

        const labelHtml = `
            <text class="${labelClass}"${earthDateAttr}${sceneIndexAttr} ${isPastMonth ? 'opacity="0.5"' : ''}>
                <textPath href="#${pathId}" startOffset="0" text-anchor="start">
                    ${labelContent}
                </textPath>
            </text>
        `;

        if (isChronologueMode && (isFirst || isLast)) {
            boundaryLabelsHtml += labelHtml;
        } else {
            labelsSvg += labelHtml;
        }
    });

    return { labelsSvg, boundaryLabelsHtml };
}

type ChronoTickParams = {
    outerLabels: ChronologueLabel[];
    monthTickStart: number;
    monthTickEnd: number;
};

export function renderChronologueOuterTicks({
    outerLabels,
    monthTickStart,
    monthTickEnd
}: ChronoTickParams): string {
    if (!outerLabels.length) {
        return '';
    }

    let svg = '<g class="rt-chronological-outer-ticks">';
    outerLabels.forEach(({ angle, isMajor, shortName, isFirst, isLast, sceneIndex }) => {
        const tickStart = monthTickStart;
        const dataAttrs = sceneIndex !== undefined ? ` data-scene-index="${sceneIndex}"` : '';

        if (isMajor) {
            const tickEnd = monthTickEnd;
            const x1 = formatNumber(tickStart * Math.cos(angle));
            const y1 = formatNumber(tickStart * Math.sin(angle));
            const x2 = formatNumber(tickEnd * Math.cos(angle));
            const y2 = formatNumber(tickEnd * Math.sin(angle));
            const boundaryClass = isFirst ? ' rt-date-first' : (isLast ? ' rt-date-last' : '');

            svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" 
                class="rt-chronological-tick rt-chronological-tick-major${boundaryClass}"${dataAttrs}/>`;
        } else if (shortName === '') {
            const tickEnd = (monthTickStart + monthTickEnd) / 2;
            const x1 = formatNumber(tickStart * Math.cos(angle));
            const y1 = formatNumber(tickStart * Math.sin(angle));
            const x2 = formatNumber(tickEnd * Math.cos(angle));
            const y2 = formatNumber(tickEnd * Math.sin(angle));

            svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" 
                class="rt-chronological-tick rt-chronological-tick-minor"${dataAttrs}/>`;
        }
    });
    svg += '</g>';
    return svg;
}
