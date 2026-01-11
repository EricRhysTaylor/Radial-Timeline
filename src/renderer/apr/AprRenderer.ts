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
    showScenes?: boolean;      // When false, show solid progress ring (bar mode)
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
    theme?: 'dark' | 'light';
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
        showScenes = true,      // New: when false, shows bar-only mode
        showSubplots = true,
        showActs = true,
        showStatusColors = true,
        showProgressPercent = true,
        stageColors,
        actCount,
        backgroundColor,
        transparentCenter,
        bookAuthorColor,
        engineColor,
        theme = 'dark'
    } = opts;

    const preset = APR_SIZE_PRESETS[size];
    const { svgSize, innerRadius, outerRadius, spokeWidth, borderWidth, actSpokeWidth } = preset;
    const half = svgSize / 2;

    // Structural palette based on theme
    const structural = resolveStructuralColors(theme);

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
    const bgFill = (transparentCenter || backgroundColor === 'transparent') ? 'none' : (backgroundColor ?? structural.background);
    svg += `<rect x="-${half}" y="-${half}" width="${svgSize}" height="${svgSize}" fill="${bgFill}" />`;

    // Publication-mode defs (plaid patterns etc.) + percent shadow filter
    const percentShadow = `
        <filter id="aprPercentShadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="2.2" flood-color="#000" flood-opacity="0.45"/>
        </filter>
    `;
    svg += `<defs>${renderDefs(stageColorMap)}${percentShadow}</defs>`;

    // ─────────────────────────────────────────────────────────────────────────
    // BAR-ONLY MODE (Teaser): Solid progress ring, no scene details
    // ─────────────────────────────────────────────────────────────────────────
    if (!showScenes) {
        svg += renderProgressRing(innerRadius, outerRadius, progressPercent, structural, stageColorMap);
    } else {
        // Normal mode: Draw rings with scene cells
        svg += `<g class="apr-rings">`;
        ringsToRender.forEach(ring => {
            svg += renderRing(ring, safeScenes, borderWidth, showStatusColors, stageColorMap, numActs, structural);
        });
        svg += `</g>`;

        // Act spokes (only when scenes are shown)
        if (showActs) {
            svg += renderActSpokes(numActs, innerRadius, outerRadius, actSpokeWidth, structural);
        }
    }

    // Center hole
    const holeFill = transparentCenter ? 'none' : (backgroundColor ?? structural.centerHole);
    svg += `<circle cx="0" cy="0" r="${innerRadius}" fill="${holeFill}" stroke="${structural.border}" stroke-opacity="0.35" />`;

    // Center percent (optional)
    if (showProgressPercent) {
        svg += renderAprCenterPercent(progressPercent, size, stageColorMap, innerRadius);
    }

    // Branding on the perimeter (sanitize placeholder/dummy URLs)
    svg += renderAprBranding({
        bookTitle: bookTitle || 'Working Title',
        authorName,
        authorUrl: sanitizeAuthorUrl(authorUrl),
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
    numActs: number,
    structural: ReturnType<typeof resolveStructuralColors>
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
            svg += `<path d="${voidPath}" fill="var(--rt-color-empty, ${APR_STAGE_COLORS.default})" fill-opacity="0.75" stroke="${structural.border}" stroke-width="${borderWidth}" />`;
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
            svg += `<path d="${path}" fill="${color}" stroke="${structural.border}" stroke-width="${borderWidth}" />`;
        });

        // Void for remaining space in this act, if any
        const span = actEnd - actStart;
        const remaining = span - used;
        if (remaining > 0.0001) {
            const voidStart = actEnd - remaining;
            const voidPath = sceneArcPath(ring.innerR, ring.outerR, voidStart, actEnd);
            svg += `<path d="${voidPath}" fill="var(--rt-color-empty, ${APR_STAGE_COLORS.default})" fill-opacity="0.75" stroke="${structural.border}" stroke-width="${borderWidth}" />`;
        }
    }

    // Ring frames (inner/outer)
    svg += `<circle r="${ring.outerR}" fill="none" stroke="${structural.border}" stroke-width="${borderWidth}" />`;
    svg += `<circle r="${ring.innerR}" fill="none" stroke="${structural.border}" stroke-width="${borderWidth}" />`;

    return svg;
}

function renderActSpokes(numActs: number, innerR: number, outerR: number, spokeWidth: number, structural: ReturnType<typeof resolveStructuralColors>): string {
    if (numActs <= 1) return '';
    let svg = `<g class="apr-act-spokes">`;
    for (let i = 0; i < numActs; i++) {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / numActs;
        const x1 = innerR * Math.cos(angle);
        const y1 = innerR * Math.sin(angle);
        const x2 = outerR * Math.cos(angle);
        const y2 = outerR * Math.sin(angle);
        svg += `<line x1="${x1.toFixed(3)}" y1="${y1.toFixed(3)}" x2="${x2.toFixed(3)}" y2="${y2.toFixed(3)}" stroke="${structural.actSpoke}" stroke-width="${spokeWidth}" />`;
    }
    svg += `</g>`;
    return svg;
}

function resolveSceneColor(scene: TimelineItem, showStatusColors: boolean, stageColors: Record<string, string>): string {
    const neutral = `var(--rt-color-empty, ${APR_STAGE_COLORS.default})`;
    if (!showStatusColors) return neutral;
    return getFillForScene(scene, stageColors);
}

function sanitizeAuthorUrl(url?: string): string | undefined {
    if (!url) return undefined;
    const trimmed = url.trim();
    if (!trimmed) return undefined;
    const placeholder = 'https://your-site.com';
    if (trimmed.toLowerCase() === placeholder.toLowerCase()) return undefined;
    return trimmed;
}

function resolveStructuralColors(theme: 'dark' | 'light') {
    if (theme === 'light') {
        return {
            spoke: 'rgba(0, 0, 0, 0.5)',
            actSpoke: 'rgba(0, 0, 0, 0.65)',
            border: 'rgba(0, 0, 0, 0.35)',
            centerHole: '#ffffff',
            background: '#ffffff'
        };
    }
    return {
        spoke: 'rgba(255, 255, 255, 0.4)',
        actSpoke: 'rgba(255, 255, 255, 0.7)',
        border: 'rgba(255, 255, 255, 0.25)',
        centerHole: '#0a0a0a',
        background: 'transparent'
    };
}

/**
 * Render a solid progress ring (bar-only mode / teaser mode)
 * Shows a single ring with progress filled as an arc
 */
function renderProgressRing(
    innerR: number,
    outerR: number,
    progressPercent: number,
    structural: ReturnType<typeof resolveStructuralColors>,
    stageColors: Record<string, string>
): string {
    const midR = (innerR + outerR) / 2;
    const ringWidth = outerR - innerR;
    
    // Track (empty ring)
    let svg = `<g class="apr-progress-ring">`;
    svg += `<circle cx="0" cy="0" r="${midR}" fill="none" stroke="${structural.border}" stroke-width="${ringWidth}" stroke-opacity="0.3" />`;
    
    // Progress arc
    if (progressPercent > 0) {
        const progressColor = stageColors.Press || '#22c55e'; // Use Press stage color for progress
        const clampedPercent = Math.min(100, Math.max(0, progressPercent));
        
        if (clampedPercent >= 100) {
            // Full circle
            svg += `<circle cx="0" cy="0" r="${midR}" fill="none" stroke="${progressColor}" stroke-width="${ringWidth}" />`;
        } else {
            // Arc from top (-90°) clockwise
            const angle = (clampedPercent / 100) * 2 * Math.PI;
            const startAngle = -Math.PI / 2;
            const endAngle = startAngle + angle;
            
            const x1 = midR * Math.cos(startAngle);
            const y1 = midR * Math.sin(startAngle);
            const x2 = midR * Math.cos(endAngle);
            const y2 = midR * Math.sin(endAngle);
            
            const largeArcFlag = angle > Math.PI ? 1 : 0;
            
            svg += `<path d="M ${x1.toFixed(3)} ${y1.toFixed(3)} A ${midR} ${midR} 0 ${largeArcFlag} 1 ${x2.toFixed(3)} ${y2.toFixed(3)}" fill="none" stroke="${progressColor}" stroke-width="${ringWidth}" stroke-linecap="round" />`;
        }
    }
    
    // Outer and inner border circles
    svg += `<circle cx="0" cy="0" r="${outerR}" fill="none" stroke="${structural.border}" stroke-width="1.5" />`;
    svg += `<circle cx="0" cy="0" r="${innerR}" fill="none" stroke="${structural.border}" stroke-width="1.5" />`;
    
    svg += `</g>`;
    return svg;
}
