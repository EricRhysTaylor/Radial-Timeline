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

export type ChronologueLabel = {
    name: string;
    shortName: string;
    angle: number;
    isMajor?: boolean;
    isFirst?: boolean;
    isLast?: boolean;
    sceneIndex?: number;
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
        if (isBeatNote(s)) {
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
        sceneIndex: tick.sceneIndex
    }));
    stopChronoLabels();
    return outerLabels;
}

export function renderChronologueOverlays(
    plugin: PluginRendererFacade,
    scenes: TimelineItem[],
    subplotOuterRadius: number,
    manuscriptOrderPositions: Map<string, { startAngle: number; endAngle: number }> | undefined,
    ringStartRadii: number[],
    ringWidths: number[],
    chronologueSceneEntries?: ChronologueSceneEntry[],
    durationArcRadius: number = 0
): string {
    const stopChronoOverlays = startPerfSegment(plugin, 'timeline.chronologue-overlays');
    let svg = '';

    const durationCapMs = durationSelectionToMs(plugin.settings.chronologueDurationCapSelection);
    const chronologueTimelineArc = renderChronologueTimelineArc(
        scenes,
        subplotOuterRadius,
        manuscriptOrderPositions,
        durationCapMs,
        durationArcRadius,
        chronologueSceneEntries
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

    outerLabels.forEach(({ shortName, isFirst, isLast }, index) => {
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

        const labelHtml = `
            <text class="${labelClass}" ${isPastMonth ? 'opacity="0.5"' : ''}>
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
