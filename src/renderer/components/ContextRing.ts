/*
 * Context Ring Renderer
 * Renders the "Context" layer in Chronologue mode.
 */

import type { TimelineItem } from '../../types/timeline';
import { parseDuration, calculateTimeSpan } from '../../utils/date';
import { formatNumber } from '../../utils/svg';
import { CONTEXT_RING_RADIUS, CONTEXT_RING_HEIGHT } from '../layout/LayoutConstants';

/**
 * Map a time value to an angular position on the timeline arc
 */
function mapTimeToAngle(timeMs: number, startMs: number, endMs: number): number {
    if (endMs === startMs) return -Math.PI / 2;
    const progress = (timeMs - startMs) / (endMs - startMs);
    // Chronologue maps 0..1 to -PI/2 .. 3PI/2 (top start, clockwise)
    return progress * 2 * Math.PI - Math.PI / 2;
}

interface ContextSegment {
    scene: TimelineItem;
    startAngle: number;
    endAngle: number;
    colorIndex: number; // For styling
}

export function renderContextRing(
    scenes: TimelineItem[],
    availableRadius: number = CONTEXT_RING_RADIUS
): string {
    // 1. Filter for valid Context items
    const contextItems = scenes.filter(s => s.itemType === 'Context' && s.when && s.Duration);
    if (contextItems.length === 0) return '';

    // 2. Identify Time Span of the *entire* View (not just context items)
    // We normally use the full range of all scenes to align with the main timeline
    // Collect ALL valid dates from ALL scenes to establish the global timeline range
    const allValidDates = scenes
        .map(s => s.when)
        .filter((d): d is Date => d instanceof Date && !isNaN(d.getTime()));

    if (allValidDates.length === 0) return '';

    const timeSpan = calculateTimeSpan(allValidDates);
    // calculateTimeSpan does not return start/end dates, so compute them locally
    const sortedDates = allValidDates.slice().sort((a, b) => a.getTime() - b.getTime());
    const earliest = sortedDates[0];
    const latest = sortedDates[sortedDates.length - 1];

    const startMs = earliest.getTime();
    const endMs = latest.getTime();
    const totalDuration = endMs - startMs;

    if (totalDuration <= 0) return '';

    // 3. Process segments
    const segments: ContextSegment[] = contextItems.map((item, index) => {
        const itemStart = item.when!.getTime();
        const duration = parseDuration(item.Duration!) || 0;
        const itemEnd = itemStart + duration;

        // Clamp to view range? Or allow rendering even if outside? 
        // Ideally should match timeline.

        return {
            scene: item,
            startAngle: mapTimeToAngle(itemStart, startMs, endMs),
            endAngle: mapTimeToAngle(itemEnd, startMs, endMs),
            colorIndex: index % 6 // Cycle through 6 colors? Or use some hashing?
        };
    });

    // 4. Render Segments
    // Strategy for overlaps: 
    // Render ALL segments.
    // If a segment overlaps with another, apply a dash pattern to the *overlapping* ones (or all).
    // User requested "alternating pattern".
    // Simple implementation: dashed lines for all, offset by index?
    // Let's try: Base layer solid (if single). If overlap, dash.

    // Actually, just render them as arcs. The user wants to see *what* is overlapping.
    // If Item A and Item B overlap:
    // Render Item A. Render Item B.
    // If they are both solid, B covers A.
    // We will use stroke-dasharray for ALL context arcs to allow "mixing".
    // Or, we can detect overlaps and only dash then.
    // For now, let's implement the "solid" arc with a repeating text label.
    // We'll add a class `rt-context-overlap` if it overlaps.

    // Detection of overlaps for styling
    // Simple N^2 check is fine for typical number of contexts
    const overlaps = new Set<number>();
    for (let i = 0; i < segments.length; i++) {
        for (let j = i + 1; j < segments.length; j++) {
            const s1 = segments[i];
            const s2 = segments[j];

            // Angular overlap check (handle wrap-around? Time is linear here mostly)
            // But angles go -PI/2 to 3PI/2.
            if (Math.max(s1.startAngle, s2.startAngle) < Math.min(s1.endAngle, s2.endAngle)) {
                overlaps.add(i);
                overlaps.add(j);
            }
        }
    }

    let svg = `<g class="rt-context-ring">`;

    segments.forEach((seg, idx) => {
        const isOverlapping = overlaps.has(idx);
        const largeArcFlag = (seg.endAngle - seg.startAngle) > Math.PI ? 1 : 0;

        // Arc Geometry
        const x1 = formatNumber(availableRadius * Math.cos(seg.startAngle));
        const y1 = formatNumber(availableRadius * Math.sin(seg.startAngle));
        const x2 = formatNumber(availableRadius * Math.cos(seg.endAngle));
        const y2 = formatNumber(availableRadius * Math.sin(seg.endAngle));

        const d = `M ${x1} ${y1} A ${formatNumber(availableRadius)} ${formatNumber(availableRadius)} 0 ${largeArcFlag} 1 ${x2} ${y2}`;

        // Unique ID for text path
        const pathId = `context-arc-${idx}`;

        // Classes
        // .rt-context-segment
        // .rt-context-segment-overlap (if overlapping)
        // .rt-context-color-N (for colors)
        const segmentClass = `rt-context-segment rt-context-color-${seg.colorIndex} ${isOverlapping ? 'rt-context-overlap' : ''}`;

        // 1. Definition Path (invisible, for text)
        svg += `<defs><path id="${pathId}" d="${d}" /></defs>`;

        // 2. Visible Arc
        // If overlapping, we might apply a dasharray via CSS or attribute
        // User asked for "alternating pattern". We can use dashoffset based on index to shift the dashes
        // SAFE: inline style used for dynamic stroke-dashoffset that varies per element based on index
        const dashStyle = isOverlapping
            ? `stroke-dasharray: 10, 10; stroke-dashoffset: ${idx * 10};`
            : '';

        svg += `<path d="${d}" class="${segmentClass}" style="${dashStyle}" fill="none" stroke-width="${CONTEXT_RING_HEIGHT}" />`; // SAFE: inline style used for dynamic stroke-dashoffset

        // 3. Repeating Text
        // "micro font or bit font"
        // Repeats title over and over
        const title = (seg.scene.title || 'Untitled').toUpperCase();
        // create a long string of repeating title
        // Estimated characters needed: Arc Length / char width.
        // Arc Length = radius * angle
        const arcLen = availableRadius * (seg.endAngle - seg.startAngle);
        // Estimate char width ~ 6px for micro font?
        const content = (title + ' • ').repeat(Math.ceil(arcLen / (title.length * 8 + 20)));

        svg += `<text class="rt-context-label" dy="5">
            <textPath href="#${pathId}" startOffset="0" spacing="auto">
                ${content}
            </textPath>
        </text>`;

        // Synopsis (Transparent hover target usually handled by shared synopsis logic, 
        // but here we might need specific hover area since it's a specific ring?)
        // The user said "synopsis would still be there". 
        // The main renderer handles Synopsis via `appendSynopsisElementForScene`.
        // We just need to make sure `extractGradeFromScene` or whatever generates the ID matches.
        // Actually, main renderer generates synopses for ALL scenes passed to it.
        // `timeline.ts` line 342 iterates all scenes.
        // Our `Context` items are in `scenes` array.
        // But `timeline.ts` skips them if it expects acts/subplots? 
        // We added logic to SceneDataService to put them in "Context" subplot.
        // We need to ensure the main loop in TimelineRenderer doesn't skip them or render them in the normal rings.
        // Wait, main renderer renders RINGS based on subplots. 
        // If "Context" is a subplot, it might try to render a normal ring for it!
        // We probably want to EXCLUDE Context items from the standard ring loop.
    });

    svg += `</g>`;
    return svg;
}
