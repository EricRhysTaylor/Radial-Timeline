import type { TimelineChapterMarker } from '../../utils/timelineChapters';
import { escapeXml, formatNumber } from '../../utils/svg';

export interface OuterRingChapterBoundaryGeometry {
    startAngle: number;
    outerR: number;
}

const CHAPTER_TICK_INSET = 2;
const CHAPTER_TICK_LENGTH = 8;
const CHAPTER_TICK_PAIR_GAP_PX = 5;
const CHAPTER_TICK_HIT_STROKE = 10;

export function renderNarrativeChapterMarkers(params: {
    markers: TimelineChapterMarker[];
    boundaryGeometryByScenePath: Map<string, OuterRingChapterBoundaryGeometry>;
}): string {
    const { markers, boundaryGeometryByScenePath } = params;
    if (markers.length === 0 || boundaryGeometryByScenePath.size === 0) return '';

    const markerSvg = markers.map((marker) => {
        const geometry = boundaryGeometryByScenePath.get(marker.resolvedScenePath);
        if (!geometry) return '';

        const tickInnerRadius = geometry.outerR + CHAPTER_TICK_INSET;
        const tickOuterRadius = tickInnerRadius + CHAPTER_TICK_LENGTH;
        const midRadius = tickInnerRadius + (CHAPTER_TICK_LENGTH / 2);
        const angleOffset = CHAPTER_TICK_PAIR_GAP_PX / Math.max(midRadius, 1);
        const safeTitle = escapeXml(marker.title);
        const tooltipText = escapeXml(`Chapter: ${marker.title}`);

        const buildTickLine = (angle: number, className: string, strokeWidth: number): string => {
            const x1 = formatNumber(tickInnerRadius * Math.cos(angle));
            const y1 = formatNumber(tickInnerRadius * Math.sin(angle));
            const x2 = formatNumber(tickOuterRadius * Math.cos(angle));
            const y2 = formatNumber(tickOuterRadius * Math.sin(angle));
            return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${className}" stroke-width="${strokeWidth}" />`;
        };

        return `
            <g class="rt-chapter-marker" data-scene-path="${escapeXml(marker.resolvedScenePath)}" data-chapter-title="${safeTitle}">
                <line x1="${formatNumber(tickInnerRadius * Math.cos(geometry.startAngle))}" y1="${formatNumber(tickInnerRadius * Math.sin(geometry.startAngle))}" x2="${formatNumber(tickOuterRadius * Math.cos(geometry.startAngle))}" y2="${formatNumber(tickOuterRadius * Math.sin(geometry.startAngle))}" class="rt-chapter-marker-hit rt-tooltip-target" stroke-width="${CHAPTER_TICK_HIT_STROKE}" data-tooltip="${tooltipText}" data-tooltip-placement="top" />
                ${buildTickLine(geometry.startAngle - (angleOffset / 2), 'rt-chapter-marker-line', 1.4)}
                ${buildTickLine(geometry.startAngle + (angleOffset / 2), 'rt-chapter-marker-line', 1.4)}
            </g>
        `;
    }).filter(Boolean).join('');

    if (!markerSvg) return '';
    return `<g class="rt-chapter-markers">${markerSvg}</g>`;
}
