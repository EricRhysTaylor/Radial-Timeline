/*
 * Backdrop Ring Renderer
 *
 * Renders the "Backdrop" layer in Chronologue mode. Backdrops are time
 * spans (e.g. "Bingley at Netherfield" Sep–Dec 1811) that should appear
 * as bands behind the scene ring.
 *
 * Architecture: overlapping backdrops are placed in separate concentric
 * lanes via greedy interval-graph scheduling. Lane 0 is the outermost
 * (drawn at the layout-engine-allocated radius); each additional lane
 * stacks one BACKDROP_RING_HEIGHT inward. This is the same algorithm
 * used by BackdropMicroRings.ts.
 *
 * The previous architecture tried to render all overlapping backdrops
 * at a single radius with stacked overlay paths and a diagonal pattern
 * fill, which produced visual confusion ("plaid") and a silent-blank
 * SVG bug at depth-3+ overlap. Lanes eliminate that class of problem
 * by construction — within a single lane, segments never overlap.
 */

import type { TimelineItem } from '../../types/timeline';
import { parseDuration, parseWhenField } from '../../utils/date';
import { formatNumber } from '../../utils/svg';
import { BACKDROP_RING_HEIGHT, BACKDROP_TITLE_RADIUS_OFFSET } from '../layout/LayoutConstants';
import { isBeatNote, sortScenes, type PluginRendererFacade } from '../../utils/sceneHelpers';
import { appendSynopsisElementForScene } from '../utils/SynopsisBuilder';
import { makeSceneId } from '../../utils/numberSquareHelpers';


/**
 * Escape XML/SVG special characters in text destined for SVG <text> content
 * or attribute values. A single unescaped `&` (e.g. "Hunsford & Rosings")
 * makes the whole SVG invalid and the browser drops it silently — no console
 * error, just a blank timeline. Must escape `&` first so subsequent
 * replacements don't re-escape ampersands they introduce.
 */
function escapeXml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}


interface BackdropSegment {
    scene: TimelineItem;
    startAngle: number;
    endAngle: number;
    lane: number;
}

export type BackdropRingLayout = {
    segments: BackdropSegment[];
    laneCount: number;
};


/**
 * Build the lane layout for backdrops without drawing anything.
 *
 * Returns the segments tagged with their lane assignment plus the total
 * lane count. Callers can use `laneCount` to reserve radial space (e.g.
 * to shift the micro-backdrop ring inward when laneCount > 1).
 *
 * Filters out backdrops with non-finite angles (e.g. from bad date input)
 * with a console.warn naming the offending file. This prevents a single
 * malformed backdrop from blanking the whole timeline via NaN-string
 * propagation into SVG path coordinates.
 */
export function buildBackdropRingLayout(scenes: TimelineItem[]): BackdropRingLayout {
    // 1. Filter for valid Backdrop items.
    const backdropItems = scenes.filter(s => s.itemType === 'Backdrop' && s.when && (s.Duration || s.End));
    if (backdropItems.length === 0) {
        return { segments: [], laneCount: 0 };
    }

    // 2. Build the scene-ring reference (same dedup+sort as Chronologue.ts)
    //    so our angular calculations align with the scene squares.
    const seenPaths = new Set<string>();
    const candidates: TimelineItem[] = [];
    scenes.forEach(s => {
        if (isBeatNote(s) || s.itemType === 'Backdrop') return;
        const key = s.path || `${s.title || ''}::${String(s.when || '')}`;
        if (!seenPaths.has(key)) {
            if (s.when && s.when instanceof Date && !isNaN(s.when.getTime())) {
                seenPaths.add(key);
                candidates.push(s);
            }
        }
    });
    const sortedScenes = sortScenes(candidates, true, true);
    if (sortedScenes.length === 0) {
        return { segments: [], laneCount: 0 };
    }

    const startAngle = -Math.PI / 2;
    const endAngle = (3 * Math.PI) / 2;
    const totalAngle = endAngle - startAngle;
    const angularSize = totalAngle / sortedScenes.length;

    function mapTimestampToSceneIndexAngle(timeMs: number, bias: 'start' | 'end' = 'end'): number {
        let prevIndex = -1;
        for (let i = 0; i < sortedScenes.length; i++) {
            const sceneTime = sortedScenes[i].when!.getTime();
            const condition = bias === 'start' ? sceneTime < timeMs : sceneTime <= timeMs;
            if (condition) prevIndex = i;
            else break;
        }
        if (prevIndex === -1) return startAngle;
        if (prevIndex === sortedScenes.length - 1) {
            return startAngle + (prevIndex * angularSize) + angularSize;
        }
        const prevScene = sortedScenes[prevIndex];
        const nextScene = sortedScenes[prevIndex + 1];
        const prevTime = prevScene.when!.getTime();
        const nextTime = nextScene.when!.getTime();
        const segmentDuration = nextTime - prevTime;
        const progress = segmentDuration > 0 ? (timeMs - prevTime) / segmentDuration : 0;
        const prevAngle = startAngle + (prevIndex * angularSize);
        return prevAngle + (progress * angularSize);
    }

    // 3. Compute angular extents for each backdrop.
    const rawSegments: BackdropSegment[] = [];
    backdropItems.forEach(item => {
        const itemStart = item.when!.getTime();
        let itemEnd: number;
        if (item.End) {
            const parsedEnd = parseWhenField(item.End);
            itemEnd = parsedEnd ? parsedEnd.getTime() : itemStart;
        } else {
            const duration = parseDuration(item.Duration!) || 0;
            itemEnd = itemStart + duration;
        }

        const viewStartMs = sortedScenes[0].when!.getTime();
        const viewEndMs = sortedScenes[sortedScenes.length - 1].when!.getTime();
        const clampedStartMs = Math.max(itemStart, viewStartMs);
        const clampedEndMs = Math.min(itemEnd, viewEndMs);

        if (clampedStartMs >= clampedEndMs && itemStart < viewStartMs && itemEnd < viewStartMs) return;
        if (clampedStartMs >= clampedEndMs && itemStart > viewEndMs) return;

        let computedStartAngle = mapTimestampToSceneIndexAngle(clampedStartMs, 'start');
        let computedEndAngle = mapTimestampToSceneIndexAngle(clampedEndMs, 'end');

        // Guard against zero-width and full-circle degenerate paths.
        const epsilon = 0.002;
        const span = computedEndAngle - computedStartAngle;
        const fullCircleSpan = totalAngle - epsilon;
        if (span <= 0) {
            computedEndAngle = computedStartAngle + epsilon;
        } else if (span >= totalAngle - 1e-4) {
            computedEndAngle = computedStartAngle + fullCircleSpan;
        }

        // Defensive: drop any segment whose angles are non-finite (NaN from
        // bad upstream date parse). Browsers render "NaN" path coordinates
        // as nothing, which silently blanked the whole timeline in the
        // pre-lane architecture.
        if (!Number.isFinite(computedStartAngle) || !Number.isFinite(computedEndAngle)) {
            // eslint-disable-next-line no-console
            console.warn(
                '[radial-timeline] dropping backdrop with non-finite angles:',
                item.title || item.path,
                { startAngle: computedStartAngle, endAngle: computedEndAngle }
            );
            return;
        }

        rawSegments.push({
            scene: item,
            startAngle: computedStartAngle,
            endAngle: computedEndAngle,
            lane: -1,
        });
    });

    if (rawSegments.length === 0) {
        return { segments: [], laneCount: 0 };
    }

    // 4. Greedy lane assignment, sorted by start angle.
    //    Identical algorithm to BackdropMicroRings.ts — produces the
    //    minimum number of lanes needed so that no two segments in the
    //    same lane overlap angularly.
    const sortedByStart = rawSegments.slice().sort((a, b) => a.startAngle - b.startAngle);
    const lanes: BackdropSegment[][] = [];
    sortedByStart.forEach(segment => {
        let assigned = false;
        for (let laneIndex = 0; laneIndex < lanes.length; laneIndex++) {
            const overlaps = lanes[laneIndex].some(existing =>
                segment.startAngle < existing.endAngle && segment.endAngle > existing.startAngle
            );
            if (!overlaps) {
                segment.lane = laneIndex;
                lanes[laneIndex].push(segment);
                assigned = true;
                break;
            }
        }
        if (!assigned) {
            segment.lane = lanes.length;
            lanes.push([segment]);
        }
    });

    return { segments: sortedByStart, laneCount: lanes.length };
}


export type BackdropRingOptions = {
    plugin: PluginRendererFacade;
    scenes: TimelineItem[]; // still needed for the synopsis appender's context
    layout: BackdropRingLayout;
    availableRadius: number; // center radius of the outermost lane (lane 0)
    synopsesElements: SVGGElement[];
    maxTextWidth: number;
    masterSubplotOrder: string[];
};

export function renderBackdropRing({
    plugin,
    scenes,
    layout,
    availableRadius,
    synopsesElements,
    maxTextWidth,
    masterSubplotOrder,
}: BackdropRingOptions): string {
    if (!layout.segments.length) return '';

    let svg = `<g class="rt-backdrop-ring">`;

    // Background + borders per lane.
    for (let lane = 0; lane < layout.laneCount; lane++) {
        const laneCenter = availableRadius - lane * BACKDROP_RING_HEIGHT;
        svg += `<circle cx="0" cy="0" r="${formatNumber(laneCenter)}" class="rt-backdrop-ring-background" stroke-width="${BACKDROP_RING_HEIGHT}" pointer-events="none" fill="none" />`;
        const innerBorderR = laneCenter - (BACKDROP_RING_HEIGHT / 2);
        const outerBorderR = laneCenter + (BACKDROP_RING_HEIGHT / 2);
        svg += `<circle cx="0" cy="0" r="${formatNumber(innerBorderR)}" class="rt-backdrop-border" fill="none" />`;
        svg += `<circle cx="0" cy="0" r="${formatNumber(outerBorderR)}" class="rt-backdrop-border" fill="none" />`;
    }

    // One segment per backdrop, drawn at its lane's radius.
    layout.segments.forEach((seg, idx) => {
        const laneCenter = availableRadius - seg.lane * BACKDROP_RING_HEIGHT;
        const largeArcFlag = (seg.endAngle - seg.startAngle) > Math.PI ? 1 : 0;

        // Text path runs along the lane (offset by constant — currently
        // negative so text rides just inside the lane's outer border).
        const textRadius = laneCenter + BACKDROP_TITLE_RADIUS_OFFSET;
        const tx1 = formatNumber(textRadius * Math.cos(seg.startAngle));
        const ty1 = formatNumber(textRadius * Math.sin(seg.startAngle));
        const tx2 = formatNumber(textRadius * Math.cos(seg.endAngle));
        const ty2 = formatNumber(textRadius * Math.sin(seg.endAngle));
        const td = `M ${tx1} ${ty1} A ${formatNumber(textRadius)} ${formatNumber(textRadius)} 0 ${largeArcFlag} 1 ${tx2} ${ty2}`;

        const pathId = `backdrop-arc-${idx}`;
        const sceneUniqueKey = seg.scene.path || `${seg.scene.title || ''}::${seg.scene.number ?? ''}::${seg.scene.when ?? ''}`;
        const sceneId = makeSceneId(0, 1, idx, true, true, sceneUniqueKey);

        appendSynopsisElementForScene({
            plugin,
            scene: seg.scene,
            sceneId,
            maxTextWidth,
            masterSubplotOrder,
            scenes,
            targets: synopsesElements,
        });

        const encodedPath = encodeURIComponent(seg.scene.path || '');
        svg += `<g class="rt-scene-group" data-item-type="Backdrop" data-path="${encodedPath}" data-backdrop-lane="${seg.lane}">`;
        svg += `<defs><path id="${pathId}" d="${td}" /></defs>`;

        // Filled box geometry for the segment, centered on the lane radius.
        const segmentHeight = BACKDROP_RING_HEIGHT - 2;
        const halfHeight = segmentHeight / 2;
        const boxInnerRadius = laneCenter - halfHeight;
        const boxOuterRadius = laneCenter + halfHeight;
        const boxLargeArcFlag = largeArcFlag;

        const startInnerX = formatNumber(boxInnerRadius * Math.cos(seg.startAngle));
        const startInnerY = formatNumber(boxInnerRadius * Math.sin(seg.startAngle));
        const startOuterX = formatNumber(boxOuterRadius * Math.cos(seg.startAngle));
        const startOuterY = formatNumber(boxOuterRadius * Math.sin(seg.startAngle));
        const endInnerX = formatNumber(boxInnerRadius * Math.cos(seg.endAngle));
        const endInnerY = formatNumber(boxInnerRadius * Math.sin(seg.endAngle));
        const endOuterX = formatNumber(boxOuterRadius * Math.cos(seg.endAngle));
        const endOuterY = formatNumber(boxOuterRadius * Math.sin(seg.endAngle));

        const boxPath = `M ${startOuterX} ${startOuterY} ` +
            `A ${formatNumber(boxOuterRadius)} ${formatNumber(boxOuterRadius)} 0 ${boxLargeArcFlag} 1 ${endOuterX} ${endOuterY} ` +
            `L ${endInnerX} ${endInnerY} ` +
            `A ${formatNumber(boxInnerRadius)} ${formatNumber(boxInnerRadius)} 0 ${boxLargeArcFlag} 0 ${startInnerX} ${startInnerY} ` +
            `Z`;

        svg += `<path id="${sceneId}" d="${boxPath}" class="rt-backdrop-segment rt-scene-path" pointer-events="all" data-scene-id="${sceneId}" />`;

        // Repeating title text along the textPath.
        const title = seg.scene.title || 'Untitled';
        const textPadding = 4;
        const totalArcLen = textRadius * (seg.endAngle - seg.startAngle);
        const usableArcLen = Math.max(0, totalArcLen - (textPadding * 2));
        const estimatedTextWidth = (title.length * 14) + 30;
        const repeatCount = Math.ceil(usableArcLen / estimatedTextWidth) + 2;
        // CRITICAL: escape XML special characters in the title before injecting
        // into SVG text content. An unescaped `&` (e.g. "Hunsford & Rosings")
        // produces invalid SVG that browsers silently drop — blanking the
        // whole timeline with no console error.
        const safeTitle = escapeXml(title);
        const content = (safeTitle + ' • ').repeat(repeatCount);

        svg += `<text class="rt-backdrop-label">
            <textPath href="#${pathId}" startOffset="${textPadding}" spacing="auto" method="align">
                ${content}
            </textPath>
        </text>`;

        svg += `</g>`;
    });

    svg += `</g>`;
    return svg;
}
