/*
 * Backdrop Ring Renderer
 * Renders the "Backdrop" layer in Chronologue mode.
 */

import type { TimelineItem } from '../../types/timeline';
import { parseDuration, calculateTimeSpan, parseWhenField } from '../../utils/date';
import { formatNumber } from '../../utils/svg';
import { BACKDROP_RING_HEIGHT, BACKDROP_TITLE_RADIUS_OFFSET } from '../layout/LayoutConstants';
import { isBeatNote, type PluginRendererFacade } from '../../utils/sceneHelpers';
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

    // 2. Identify Time Span of the *entire* View
    // IMPORTANT: Per user request, Backdrop items must NOT influence the timeline range.
    // However, we must use the exact same filtering as Chronologue.ts to ensure alignment.
    // This allows scenes with undefined itemType (which default to Scene) to define the range.
    const allValidDates = scenes
        .filter(s => !isBeatNote(s) && s.itemType !== 'Backdrop')
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

    // Removed unused totalDuration check to fix linting error
    // const totalDuration = endMs - startMs;
    // if (totalDuration <= 0) return '';

    // 3. Process segments
    // IMPORTANT: The `Chronologue.ts` and `generateChronologicalTicks` logic positions scenes evenly around the circle
    // based on their index (equal angular spacing), NOT proportional to time.
    // Therefore, mapping Backdrop time directly to angle using `mapTimeToAngle` (linear time interpolation) is INCORRECT
    // because the scene ring is NOT linear time. It is index-based.

    // To align the Backdrop with the scenes, we must find where the Backdrop's start/end dates fall within the
    // sorted list of scenes and interpolate between the angular positions of those scenes.

    // Sort valid dates/scenes chronologically to match the ring layout
    const sortedScenes = scenes
        .filter(s => !isBeatNote(s) && s.itemType !== 'Backdrop' && s.when && !isNaN(s.when.getTime()))
        .sort((a, b) => a.when!.getTime() - b.when!.getTime());

    if (sortedScenes.length === 0) return '';

    // Helper: Map a timestamp to an angle by interpolating between scene indices
    // The scene ring maps scenes to angles: Start = -PI/2, End = 3PI/2.
    // Each scene occupies `totalAngle / numScenes`.
    // Scene[i] starts at `startAngle + (i * angularSize)`.
    const startAngle = -Math.PI / 2;
    const endAngle = (3 * Math.PI) / 2;
    const totalAngle = endAngle - startAngle;
    const angularSize = totalAngle / sortedScenes.length;

    function mapTimestampToSceneIndexAngle(timeMs: number): number {
        // Find the index of the scene just before this time
        let prevIndex = -1;
        for (let i = 0; i < sortedScenes.length; i++) {
            if (sortedScenes[i].when!.getTime() <= timeMs) {
                prevIndex = i;
            } else {
                break;
            }
        }

        // If before the first scene
        if (prevIndex === -1) {
             // For backdrops starting before the first scene, we can clamp to the start (as requested)
             // or project backwards. Since "clampedStart" handles the bounding, if we are here,
             // it means we are effectively at index 0.
             // BUT: We want to support time-based interpolation between scenes if possible.
             // If we are strictly index-based, "time" between Scene A and Scene B is linear only between their indices.
             return startAngle;
        }

        // If after the last scene
        if (prevIndex === sortedScenes.length - 1) {
            return startAngle + (prevIndex * angularSize) + angularSize; // End of last scene
        }

        // Interpolate between Scene[i] and Scene[i+1]
        const prevScene = sortedScenes[prevIndex];
        const nextScene = sortedScenes[prevIndex + 1];
        const prevTime = prevScene.when!.getTime();
        const nextTime = nextScene.when!.getTime();
        
        const segmentDuration = nextTime - prevTime;
        // Avoid division by zero if scenes are at same time
        const progress = segmentDuration > 0 ? (timeMs - prevTime) / segmentDuration : 0;
        
        // The gap between scene starts is `angularSize`.
        // Scene[i] starts at `angle`. Scene[i+1] starts at `angle + angularSize`.
        // So we interpolate within that angular slice.
        const prevAngle = startAngle + (prevIndex * angularSize);
        return prevAngle + (progress * angularSize);
    }


    const segments: BackdropSegment[] = backdropItems.map((item, index) => {
        const itemStart = item.when!.getTime();
        
        let itemEnd: number;
        if (item.End) {
            const parsedEnd = parseWhenField(item.End);
            itemEnd = parsedEnd ? parsedEnd.getTime() : itemStart;
        } else {
            const duration = parseDuration(item.Duration!) || 0;
            itemEnd = itemStart + duration;
        }

        // Clamp to valid date range (though range is now technically discrete scenes)
        // We use the start/end timestamps of the first/last scene as the bounding box
        const viewStartMs = sortedScenes[0].when!.getTime();
        const viewEndMs = sortedScenes[sortedScenes.length - 1].when!.getTime();

        const clampedStartMs = Math.max(itemStart, viewStartMs);
        const clampedEndMs = Math.min(itemEnd, viewEndMs);

        // Filter out if strictly outside
        if (clampedStartMs >= clampedEndMs && itemStart < viewStartMs && itemEnd < viewStartMs) return null;
        if (clampedStartMs >= clampedEndMs && itemStart > viewEndMs) return null;

        // Ensure we at least show a sliver if it overlaps a single point or is very short but valid
        // Actually, if clampedStart == clampedEnd, it's a point. Backdrop usually implies duration.
        // Let's allow it.

        let computedStartAngle = mapTimestampToSceneIndexAngle(clampedStartMs);
        let computedEndAngle = mapTimestampToSceneIndexAngle(clampedEndMs);

        // Guard: if the backdrop spans the entire scene range (start == end == full circle),
        // the arc would collapse to a point because start/end coordinates are identical.
        // Nudge the end angle slightly so we still render a visible segment and label.
        const epsilon = 0.002; // small angle to avoid zero-length paths
        const span = computedEndAngle - computedStartAngle;
        const fullCircleSpan = totalAngle - epsilon;
        if (span <= 0) {
            computedEndAngle = computedStartAngle + epsilon;
        } else if (span >= totalAngle - 1e-4) {
            computedEndAngle = computedStartAngle + fullCircleSpan;
        }

        return {
            scene: item,
            startAngle: computedStartAngle,
            endAngle: computedEndAngle
        };
    }).filter((seg): seg is BackdropSegment => seg !== null);

    // 4. Render Segments
    // Strategy:
    // - Render base arc for each backdrop (solid style).
    // - Separately render overlay arcs only for the angular portions that actually overlap (>=2 active).
    //   Overlays alternate outline/solid and cycle hue based on overlap depth within that interval.

    let svg = `<g class="rt-backdrop-ring">`;

    // Background Circle for the whole ring (Void Style)
    // Use a specific class to avoid global 'rt-void-cell' fill behavior
    // UPDATED: User requested to match Subplot ring architecture.
    // 1. Base layer: Solid white/theme-bg stroke for the full 20px height
    // 2. Borders: Thin 1px strokes at inner and outer edges
    
    // Base "Body" of the ring
    svg += `<circle cx="0" cy="0" r="${formatNumber(availableRadius)}" class="rt-backdrop-ring-background" stroke-width="${BACKDROP_RING_HEIGHT}" pointer-events="none" fill="none" />`;

    // Inner and Outer borders (mimic subplot ring edges)
    const innerBorderR = availableRadius - (BACKDROP_RING_HEIGHT / 2);
    const outerBorderR = availableRadius + (BACKDROP_RING_HEIGHT / 2);
    svg += `<circle cx="0" cy="0" r="${formatNumber(innerBorderR)}" class="rt-backdrop-border" fill="none" />`;
    svg += `<circle cx="0" cy="0" r="${formatNumber(outerBorderR)}" class="rt-backdrop-border" fill="none" />`;

    // Precompute overlap intervals (where 2+ arcs are active)
    type Interval = { start: number; end: number; active: number[] };
    const events: Array<{ angle: number; type: 'start' | 'end'; idx: number }> = [];
    segments.forEach((seg, idx) => {
        events.push({ angle: seg.startAngle, type: 'start', idx });
        events.push({ angle: seg.endAngle, type: 'end', idx });
    });
    // Sort: end before start at same angle
    events.sort((a, b) => a.angle === b.angle ? (a.type === 'end' ? -1 : 1) : a.angle - b.angle);

    const intervals: Interval[] = [];
    const active: number[] = [];
    let prevAngle: number | null = null;
    for (const ev of events) {
        if (prevAngle !== null && ev.angle > prevAngle && active.length > 1) {
            intervals.push({ start: prevAngle, end: ev.angle, active: [...active] });
        }
        if (ev.type === 'start') {
            active.push(ev.idx);
        } else {
            const pos = active.indexOf(ev.idx);
            if (pos >= 0) active.splice(pos, 1);
        }
        prevAngle = ev.angle;
    }

    segments.forEach((seg, idx) => {
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
        const currentSegmentClass = `rt-backdrop-segment`;
        const labelClass = `rt-backdrop-label`;
        svg += `<g class="rt-scene-group" data-item-type="Backdrop" data-path="${encodedPath}">`;

        // 1. Definition Path (invisible, for text)
        svg += `<defs><path id="${pathId}" d="${td}" /></defs>`;

        // Use slightly smaller height for the segment to show the borders clearly (1px inset)
        const segmentHeight = BACKDROP_RING_HEIGHT - 2; 
        const halfHeight = segmentHeight / 2;
        
        // Use full height geometry without inset for solid fill
        const boxInnerRadius = availableRadius - halfHeight;
        const boxOuterRadius = availableRadius + halfHeight;
        const boxLargeArcFlag = (seg.endAngle - seg.startAngle) > Math.PI ? 1 : 0;
        
        // Box corners
        const startInnerX = formatNumber(boxInnerRadius * Math.cos(seg.startAngle));
        const startInnerY = formatNumber(boxInnerRadius * Math.sin(seg.startAngle));
        const startOuterX = formatNumber(boxOuterRadius * Math.cos(seg.startAngle));
        const startOuterY = formatNumber(boxOuterRadius * Math.sin(seg.startAngle));
        const endInnerX = formatNumber(boxInnerRadius * Math.cos(seg.endAngle));
        const endInnerY = formatNumber(boxInnerRadius * Math.sin(seg.endAngle));
        const endOuterX = formatNumber(boxOuterRadius * Math.cos(seg.endAngle));
        const endOuterY = formatNumber(boxOuterRadius * Math.sin(seg.endAngle));
        
        // Full box path: start outer -> arc to end outer -> line to end inner -> arc back to start inner -> close
        const boxPath = `M ${startOuterX} ${startOuterY} ` +
            `A ${formatNumber(boxOuterRadius)} ${formatNumber(boxOuterRadius)} 0 ${boxLargeArcFlag} 1 ${endOuterX} ${endOuterY} ` +
            `L ${endInnerX} ${endInnerY} ` +
            `A ${formatNumber(boxInnerRadius)} ${formatNumber(boxInnerRadius)} 0 ${boxLargeArcFlag} 0 ${startInnerX} ${startInnerY} ` +
            `Z`;
        
        // 2. Visible Segment (Filled Geometry)
        // Replaces the stroked arc with a filled closed path geometry
        svg += `<path id="${sceneId}" d="${boxPath}" class="${currentSegmentClass} rt-scene-path" pointer-events="all" data-scene-id="${sceneId}" />`;
        
        // 3. Repeating Text
        const title = seg.scene.title || 'Untitled';
        // Arc Length = radius * angle, minus padding (8px at each end = 16px total)
        // Use full available arc length for repeat calculation
        const textPadding = 4;
        const totalArcLen = textRadius * (seg.endAngle - seg.startAngle);
        const usableArcLen = Math.max(0, totalArcLen - (textPadding * 2));
        
        // Estimate char width more conservatively to ensure filling
        // font-size 20px, avg char width approx 12-14px.
        // Adding extra repeats to be safe since textPath clips overflow automatically.
        const estimatedTextWidth = (title.length * 14) + 30; // +30 for the bullet/spacing
        const repeatCount = Math.ceil(usableArcLen / estimatedTextWidth) + 2; // +2 buffer
        
        const content = (title + ' • ').repeat(repeatCount);

        svg += `<text class="${labelClass}">
            <textPath href="#${pathId}" startOffset="${textPadding}" spacing="auto" method="align">
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

    // 4b. Overlay only the truly overlapping angular slices
    const overlayRadius = availableRadius;
    const boxHeight = BACKDROP_RING_HEIGHT - 2;
    const halfHeight = boxHeight / 2;
    const overlayInnerR = overlayRadius - halfHeight;
    const overlayOuterR = overlayRadius + halfHeight;

    const buildBoxPath = (start: number, end: number) => {
        const boxLargeArcFlag = (end - start) > Math.PI ? 1 : 0;
        const startInnerX = formatNumber(overlayInnerR * Math.cos(start));
        const startInnerY = formatNumber(overlayInnerR * Math.sin(start));
        const startOuterX = formatNumber(overlayOuterR * Math.cos(start));
        const startOuterY = formatNumber(overlayOuterR * Math.sin(start));
        const endInnerX = formatNumber(overlayInnerR * Math.cos(end));
        const endInnerY = formatNumber(overlayInnerR * Math.sin(end));
        const endOuterX = formatNumber(overlayOuterR * Math.cos(end));
        const endOuterY = formatNumber(overlayOuterR * Math.sin(end));
        return `M ${startOuterX} ${startOuterY} ` +
            `A ${formatNumber(overlayOuterR)} ${formatNumber(overlayOuterR)} 0 ${boxLargeArcFlag} 1 ${endOuterX} ${endOuterY} ` +
            `L ${endInnerX} ${endInnerY} ` +
            `A ${formatNumber(overlayInnerR)} ${formatNumber(overlayInnerR)} 0 ${boxLargeArcFlag} 0 ${startInnerX} ${startInnerY} ` +
            `Z`;
    };

    intervals.forEach((interval, intervalIdx) => {
        const { start, end, active: activeSegments } = interval;
        activeSegments.forEach((segIdx, depth) => {
            const hueClass = `rt-backdrop-hue-${depth % 8}`; // map depth to a finite hue set
            const parityClass = depth % 2 === 0 ? 'rt-backdrop-overlap-even' : 'rt-backdrop-overlap-odd';
            const overlayClass = `rt-backdrop-segment rt-backdrop-overlap ${parityClass} ${hueClass}`;
            const path = buildBoxPath(start, end);
            svg += `<path d="${path}" class="${overlayClass}" pointer-events="none" />`;
        });
    });

    svg += `</g>`;
    return svg;
}
