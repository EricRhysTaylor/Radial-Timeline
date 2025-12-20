/*
 * Backdrop Ring Renderer
 * Renders the "Backdrop" layer in Chronologue mode.
 */

import type { TimelineItem } from '../../types/timeline';
import { parseDuration, calculateTimeSpan, parseWhenField } from '../../utils/date';
import { formatNumber } from '../../utils/svg';
import { BACKDROP_RING_HEIGHT, BACKDROP_TITLE_RADIUS_OFFSET } from '../layout/LayoutConstants';
import type { PluginRendererFacade } from '../../utils/sceneHelpers';
import { appendSynopsisElementForScene } from '../utils/SynopsisBuilder';
import { makeSceneId } from '../../utils/numberSquareHelpers';

/**
 * Map a time value to an angular position on the timeline arc
 */
function mapTimeToAngle(timeMs: number, startMs: number, endMs: number): number {
    if (endMs === startMs) return -Math.PI / 2;
    const progress = (timeMs - startMs) / (endMs - startMs);
    // Chronologue maps 0..1 to -PI/2 .. 3PI/2 (top start, clockwise)
    return progress * 2 * Math.PI - Math.PI / 2;
}

interface BackdropSegment {
    scene: TimelineItem;
    startAngle: number;
    endAngle: number;
}

export type BackdropRingOptions = {
    plugin: PluginRendererFacade;
    scenes: TimelineItem[];
    availableRadius: number; // Required: the lane radius must be determined by layout engine
    synopsesElements: SVGGElement[];
    maxTextWidth: number;
    masterSubplotOrder: string[];
};

export function renderBackdropRing({
    plugin,
    scenes,
    availableRadius,
    synopsesElements,
    maxTextWidth,
    masterSubplotOrder
}: BackdropRingOptions): string {
    // 1. Filter for valid Backdrop items
    const backdropItems = scenes.filter(s => s.itemType === 'Backdrop' && s.when && (s.Duration || s.End));
    if (backdropItems.length === 0) return '';

    // 2. Identify Time Span of the *entire* View (not just backdrop items)
    // IMPORTANT: Per user request, Backdrop items MUST NOT influence the timeline range.
    // The range is determined purely by 'Scene' type items.
    const allValidDates = scenes
        .filter(s => s.itemType === 'Scene')
        .map(s => s.when)
        .filter((d): d is Date => d instanceof Date && !isNaN(d.getTime()));

    if (allValidDates.length === 0) {
        return '';
    }

    const timeSpan = calculateTimeSpan(allValidDates);
    // calculateTimeSpan does not return start/end dates, so compute them locally
    const sortedDates = allValidDates.slice().sort((a, b) => a.getTime() - b.getTime());
    const earliest = sortedDates[0];
    const latest = sortedDates[sortedDates.length - 1];

    const startMs = earliest.getTime();
    const endMs = latest.getTime();
    const totalDuration = endMs - startMs;

    if (totalDuration <= 0) {
        return '';
    }

    // 3. Process segments
    const segments: BackdropSegment[] = backdropItems.map((item, index) => {
        const itemStart = item.when!.getTime();

        let itemEnd: number;
        if (item.End) {
            // Parse End field (e.g., "2085-04-15" or "04/15/2085")
            const parsedEnd = parseWhenField(item.End);
            itemEnd = parsedEnd ? parsedEnd.getTime() : itemStart;
        } else {
            const duration = parseDuration(item.Duration!) || 0;
            itemEnd = itemStart + duration;
        }

        // Clamp to view range so rings are only plotted where they overlap with scenes
        const clampedStart = Math.max(itemStart, startMs);
        const clampedEnd = Math.min(itemEnd, endMs);

        // If the item is entirely outside the scene range, we'll return null and filter it
        if (clampedStart >= clampedEnd) {
            return null;
        }

        return {
            scene: item,
            startAngle: mapTimeToAngle(clampedStart, startMs, endMs),
            endAngle: mapTimeToAngle(clampedEnd, startMs, endMs)
        };
    }).filter((seg): seg is BackdropSegment => seg !== null);

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
    // We'll add a class `rt-backdrop-overlap` if it overlaps.

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

    let svg = `<g class="rt-backdrop-ring">`;

    // Background Circle for the whole ring (Void Style)
    // Use a specific class to avoid global 'rt-void-cell' fill behavior
    svg += `<circle cx="0" cy="0" r="${formatNumber(availableRadius)}" class="rt-backdrop-ring-background" stroke-width="${BACKDROP_RING_HEIGHT}" pointer-events="none" />`;

    segments.forEach((seg, idx) => {
        const isOverlapping = overlaps.has(idx);
        const largeArcFlag = (seg.endAngle - seg.startAngle) > Math.PI ? 1 : 0;

        // Arc Geometry
        const x1 = formatNumber(availableRadius * Math.cos(seg.startAngle));
        const y1 = formatNumber(availableRadius * Math.sin(seg.startAngle));
        const x2 = formatNumber(availableRadius * Math.cos(seg.endAngle));
        const y2 = formatNumber(availableRadius * Math.sin(seg.endAngle));

        const d = `M ${x1} ${y1} A ${formatNumber(availableRadius)} ${formatNumber(availableRadius)} 0 ${largeArcFlag} 1 ${x2} ${y2}`;

        // Text Path Geometry (shifted outward by offset constant)
        const textRadius = availableRadius + BACKDROP_TITLE_RADIUS_OFFSET;
        const tx1 = formatNumber(textRadius * Math.cos(seg.startAngle));
        const ty1 = formatNumber(textRadius * Math.sin(seg.startAngle));
        const tx2 = formatNumber(textRadius * Math.cos(seg.endAngle));
        const ty2 = formatNumber(textRadius * Math.sin(seg.endAngle));
        const td = `M ${tx1} ${ty1} A ${formatNumber(textRadius)} ${formatNumber(textRadius)} 0 ${largeArcFlag} 1 ${tx2} ${ty2}`;

        const TD_COL_DY = 16; // Standard row height for synopsis metadata

        // Unique ID for text path
        const pathId = `backdrop-arc-${idx}`;
        const sceneUniqueKey = seg.scene.path || `${seg.scene.title || ''}::${seg.scene.number ?? ''}::${seg.scene.when ?? ''}`;
        const sceneId = makeSceneId(0, 1, idx, true, true, sceneUniqueKey);

        // Populate Synopsis
        appendSynopsisElementForScene({
            plugin,
            scene: seg.scene,
            sceneId,
            maxTextWidth,
            masterSubplotOrder,
            scenes,
            targets: synopsesElements
        });

        // Create a standard scene group wrapper so interactions (Synopsis, Click) work automatically
        const encodedPath = encodeURIComponent(seg.scene.path || '');
        const currentSegmentClass = `rt-backdrop-segment ${isOverlapping ? 'rt-backdrop-overlap' : ''}`;
        svg += `<g class="rt-scene-group" data-item-type="Backdrop" data-path="${encodedPath}">`;

        // 1. Definition Path (invisible, for text)
        svg += `<defs><path id="${pathId}" d="${td}" /></defs>`;

        // 2. Visible Arc
        // If overlapping, we apply alternating dashoffset via inline style
        // SAFE: inline style used for dynamic stroke-dashoffset that varies per element based on index
        const dashStyle = isOverlapping
            ? `stroke-dasharray: 10, 10; stroke-dashoffset: ${idx * 10};`
            : '';

        // Add rt-scene-path class so interactions can find the ID
        svg += `<path id="${sceneId}" d="${d}" class="${currentSegmentClass} rt-scene-path" style="${dashStyle}" fill="none" stroke-width="${BACKDROP_RING_HEIGHT}" pointer-events="all" data-scene-id="${sceneId}" />`; // SAFE: inline style used for dynamic stroke-dashoffset

        // 3. Repeating Text
        const title = seg.scene.title || 'Untitled';
        // Arc Length = radius * angle
        const arcLen = textRadius * (seg.endAngle - seg.startAngle);
        // Estimate char width: font-size 20px is ~14px wide for this monospace font
        const content = (title + ' • ').repeat(Math.ceil(arcLen / (title.length * 14 + 30)));

        svg += `<text class="rt-backdrop-label">
            <textPath href="#${pathId}" startOffset="0" spacing="auto">
                ${content}
            </textPath>
        </text>`;

        svg += `</g>`;

        // Synopsis (Transparent hover target usually handled by shared synopsis logic, 
        // but here we might need specific hover area since it's a specific ring?)
        // The user said "synopsis would still be there". 
        // The main renderer handles Synopsis via `appendSynopsisElementForScene`.
        // We just need to make sure `extractGradeFromScene` or whatever generates the ID matches.
        // actually, main renderer generates synopses for ALL scenes passed to it.
        // `timeline.ts` line 342 iterates all scenes.
        // Our `Backdrop` items are in `scenes` array.
        // But `timeline.ts` skips them if it expects acts/subplots? 
        // We added logic to SceneDataService to put them in "Backdrop" subplot.
        // We need to ensure the main loop in TimelineRenderer doesn't skip them or render them in the normal rings.
        // Wait, main renderer renders RINGS based on subplots. 
        // If "Backdrop" is a subplot, it might try to render a normal ring for it!
        // We probably want to EXCLUDE Backdrop items from the standard ring loop.
    });

    svg += `</g>`;
    return svg;
}
