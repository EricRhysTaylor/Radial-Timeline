/**
 * Dedicated APR renderer (small, clean form factor)
 * Keeps geometry simple and crisp for sharing, independent from the main renderer.
 */
import type { TimelineItem } from '../../types';
import { isBeatNote, sortScenes } from '../../utils/sceneHelpers';
import { computePositions } from '../utils/SceneLayout';
import { sceneArcPath } from '../components/SceneArcs';
import { APR_SIZE_PRESETS, APR_STAGE_COLORS, APR_STRUCTURAL_COLORS, AprSize } from './AprConstants';
import { renderDefs } from '../components/Defs';
import { getFillForScene } from '../utils/SceneFill';
import { DEFAULT_SETTINGS } from '../../settings/defaults';
import { renderAprBranding, renderAprCenterPercent } from './AprBranding';

export interface AprRenderOptions {
    size: AprSize;
    bookTitle: string;
    authorName?: string;
    authorUrl?: string;
    progressPercent: number;
    showSubplots?: boolean;
    showActs?: boolean;
    showStatusColors?: boolean;
    showProgressPercent?: boolean;
    stageColors?: Record<string, string>; // optional override (publishStage map)
    actCount?: number; // optional explicit act count override
    backgroundColor?: string;
    transparentCenter?: boolean;
    bookAuthorColor?: string;
    engineColor?: string;
}

export interface AprRenderResult {
    svgString: string;
    width: number;
    height: number;
}

type RingData = {
    subplot: string;
    scenes: TimelineItem[];
    innerR: number;
    outerR: number;
};

export function createAprSVG(scenes: TimelineItem[], opts: AprRenderOptions): AprRenderResult {
    const {
        size,
        bookTitle,
        authorName,
        authorUrl,
        progressPercent,
        showSubplots = true,
        showActs = true,
        showStatusColors = true,
        showProgressPercent = true,
        stageColors,
        actCount,
        backgroundColor,
        transparentCenter,
        bookAuthorColor,
        engineColor
    } = opts;

    const preset = APR_SIZE_PRESETS[size];
    const { svgSize, innerRadius, outerRadius, spokeWidth, borderWidth, actSpokeWidth } = preset;
    const half = svgSize / 2;

    // Normalize stage colors to match Publication mode (settings or defaults)
    const stageColorMap = stageColors || DEFAULT_SETTINGS.publishStageColors;

    // Filter scenes (exclude beat notes always)
    const filteredScenes = scenes.filter(s => !isBeatNote(s));
    const safeScenes = sortScenes(filteredScenes, false, false); // manuscript order equivalent
    if (safeScenes.length === 0) {
        return {
            svgString: emptySvg(svgSize, half),
            width: svgSize,
            height: svgSize
        };
    }

    // Determine acts from data (fallback to 1 if missing), allow override
    const numActs = actCount && actCount > 0
        ? actCount
        : Math.max(...safeScenes.map(s => Number(s.actNumber ?? s.act ?? 1)), 1);

    // Determine subplot rings
    const subplotOrder: string[] = [];
    const scenesBySubplot: Record<string, TimelineItem[]> = {};
    safeScenes.forEach(scene => {
        const subplot = scene.subplot?.trim() || 'Main Plot';
        if (!scenesBySubplot[subplot]) {
            scenesBySubplot[subplot] = [];
            subplotOrder.push(subplot);
        }
        scenesBySubplot[subplot].push(scene);
    });

    const ringsToRender: RingData[] = [];
    if (showSubplots) {
        const ringThickness = (outerRadius - innerRadius) / subplotOrder.length;
        subplotOrder.forEach((subplot, idx) => {
            ringsToRender.push({
                subplot,
                scenes: scenesBySubplot[subplot],
                innerR: innerRadius + idx * ringThickness,
                outerR: innerRadius + (idx + 1) * ringThickness
            });
        });
    } else {
        ringsToRender.push({
            subplot: 'Main Plot',
            scenes: safeScenes,
            innerR: innerRadius,
            outerR: outerRadius
        });
    }

    let svg = `<svg width="${svgSize}" height="${svgSize}" viewBox="-${half} -${half} ${svgSize} ${svgSize}" xmlns="http://www.w3.org/2000/svg" class="apr-svg apr-${size}">`;
    const bgFill = backgroundColor ?? APR_STRUCTURAL_COLORS.background;
    svg += `<rect x="-${half}" y="-${half}" width="${svgSize}" height="${svgSize}" fill="${bgFill}" />`;

    // Publication-mode defs (plaid patterns etc.) + percent shadow filter
    const percentShadow = `
        <filter id="aprPercentShadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="2.2" flood-color="#000" flood-opacity="0.45"/>
        </filter>
    `;
    svg += `<defs>${renderDefs(stageColorMap)}${percentShadow}</defs>`;

    // Draw rings
    svg += `<g class="apr-rings">`;
    ringsToRender.forEach(ring => {
        svg += renderRing(ring, safeScenes, borderWidth, showStatusColors, stageColorMap, numActs);
    });
    svg += `</g>`;

    // Act spokes
    if (showActs) {
        svg += renderActSpokes(numActs, innerRadius, outerRadius, actSpokeWidth);
    }

    // Center hole
    const holeFill = transparentCenter ? 'none' : (backgroundColor ?? APR_STRUCTURAL_COLORS.centerHole);
    svg += `<circle cx="0" cy="0" r="${innerRadius}" fill="${holeFill}" stroke="${APR_STRUCTURAL_COLORS.border}" stroke-opacity="0.35" />`;

    // Center percent (optional)
    if (showProgressPercent) {
        svg += renderAprCenterPercent(progressPercent, size, stageColorMap, innerRadius);
    }

    // Branding on the perimeter
    svg += renderAprBranding({
        bookTitle: bookTitle || 'Working Title',
        authorName,
        authorUrl,
        size,
        bookAuthorColor,
        engineColor
    });

    svg += `</svg>`;

    return { svgString: svg, width: svgSize, height: svgSize };
}

// Helpers

function emptySvg(svgSize: number, half: number): string {
    return `<svg width="${svgSize}" height="${svgSize}" viewBox="-${half} -${half} ${svgSize} ${svgSize}" xmlns="http://www.w3.org/2000/svg"></svg>`;
}

function renderRing(
    ring: RingData,
    allScenes: TimelineItem[],
    borderWidth: number,
    showStatusColors: boolean,
    stageColors: Record<string, string>,
    numActs: number
): string {
    const ringScenes = ring.scenes;
    const actScenes: TimelineItem[][] = [];
    for (let i = 0; i < numActs; i++) actScenes.push([]);

    // Bucket by act (1-based in data)
    ringScenes.forEach(scene => {
        const actIdx = Math.max(0, Number(scene.actNumber ?? scene.act ?? 1) - 1);
        actScenes[Math.min(actIdx, numActs - 1)].push(scene);
    });

    let svg = '';
    for (let act = 0; act < numActs; act++) {
        const actStart = -Math.PI / 2 + (act * 2 * Math.PI) / numActs;
        const actEnd = -Math.PI / 2 + ((act + 1) * 2 * Math.PI) / numActs;
        const scenesInAct = actScenes[act];

        // Sort by scene number (fallback to title) to mirror Publication order
        scenesInAct.sort((a, b) => {
            const na = parseFloat(String(a.number ?? a.title ?? 0)) || 0;
            const nb = parseFloat(String(b.number ?? b.title ?? 0)) || 0;
            if (na !== nb) return na - nb;
            return (a.title || '').localeCompare(b.title || '');
        });

        if (scenesInAct.length === 0) {
            // full void arc for this act
            const voidPath = sceneArcPath(ring.innerR, ring.outerR, actStart, actEnd);
            svg += `<path d="${voidPath}" fill="var(--rt-color-empty, ${APR_STAGE_COLORS.default})" fill-opacity="0.75" stroke="${APR_STRUCTURAL_COLORS.border}" stroke-width="${borderWidth}" />`;
            continue;
        }

        const positions = computePositions(ring.innerR, ring.outerR, actStart, actEnd, scenesInAct);
        let used = 0;
        scenesInAct.forEach((scene, idx) => {
            const pos = positions.get(idx);
            if (!pos) return;
            used += pos.endAngle - pos.startAngle;
            const color = resolveSceneColor(scene, showStatusColors, stageColors);
            const path = sceneArcPath(ring.innerR, ring.outerR, pos.startAngle, pos.endAngle);
            svg += `<path d="${path}" fill="${color}" stroke="${APR_STRUCTURAL_COLORS.border}" stroke-width="${borderWidth}" />`;
        });

        // Void for remaining space in this act, if any
        const span = actEnd - actStart;
        const remaining = span - used;
        if (remaining > 0.0001) {
            const voidStart = actEnd - remaining;
            const voidPath = sceneArcPath(ring.innerR, ring.outerR, voidStart, actEnd);
            svg += `<path d="${voidPath}" fill="var(--rt-color-empty, ${APR_STAGE_COLORS.default})" fill-opacity="0.75" stroke="${APR_STRUCTURAL_COLORS.border}" stroke-width="${borderWidth}" />`;
        }
    }

    // Ring frames (inner/outer)
    svg += `<circle r="${ring.outerR}" fill="none" stroke="${APR_STRUCTURAL_COLORS.border}" stroke-width="${borderWidth}" />`;
    svg += `<circle r="${ring.innerR}" fill="none" stroke="${APR_STRUCTURAL_COLORS.border}" stroke-width="${borderWidth}" />`;

    return svg;
}

function renderActSpokes(numActs: number, innerR: number, outerR: number, spokeWidth: number): string {
    if (numActs <= 1) return '';
    let svg = `<g class="apr-act-spokes">`;
    for (let i = 0; i < numActs; i++) {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / numActs;
        const x1 = innerR * Math.cos(angle);
        const y1 = innerR * Math.sin(angle);
        const x2 = outerR * Math.cos(angle);
        const y2 = outerR * Math.sin(angle);
        svg += `<line x1="${x1.toFixed(3)}" y1="${y1.toFixed(3)}" x2="${x2.toFixed(3)}" y2="${y2.toFixed(3)}" stroke="${APR_STRUCTURAL_COLORS.actSpoke}" stroke-width="${spokeWidth}" />`;
    }
    svg += `</g>`;
    return svg;
}

function resolveSceneColor(scene: TimelineItem, showStatusColors: boolean, stageColors: Record<string, string>): string {
    const neutral = `var(--rt-color-empty, ${APR_STAGE_COLORS.default})`;
    if (!showStatusColors) return neutral;
    return getFillForScene(scene, stageColors);
}
