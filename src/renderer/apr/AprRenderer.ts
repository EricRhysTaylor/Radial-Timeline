/**
 * Dedicated APR renderer (small, clean form factor)
 * Keeps geometry simple and crisp for sharing, independent from the main renderer.
 */
import type { TimelineItem } from '../../types';
import { isBeatNote, sortScenes, sortByManuscriptOrder } from '../../utils/sceneHelpers';
import { computePositions } from '../utils/SceneLayout';
import { sceneArcPath } from '../components/SceneArcs';
import { getPreset, APR_COLORS, APR_TEXT_COLORS, AprSize } from './AprLayoutConfig';
import { renderDefs } from '../components/Defs';
import { getFillForScene } from '../utils/SceneFill';
import { DEFAULT_SETTINGS } from '../../settings/defaults';
import { renderAprBadges, renderAprBranding, renderAprCenterPercent } from './AprBranding';
import { STAGE_ORDER } from '../../utils/constants';

export interface AprRenderOptions {
    size: AprSize;
    bookTitle: string;
    authorName?: string;
    authorUrl?: string;
    progressPercent: number;
    showScenes?: boolean;           // When false, show solid progress ring (bar mode)
    showSubplots?: boolean;
    showActs?: boolean;
    showStatusColors?: boolean;     // Show status colors (Todo, In Progress, etc.)
    showStageColors?: boolean;      // Show publish stage colors (Zero, Author, House, Press)
    grayCompletedScenes?: boolean;  // For SCENES stage: gray out completed scenes
    showProgressPercent?: boolean;
    showBranding?: boolean;
    centerMark?: 'dot' | 'plus' | 'none';
    stageColors?: Record<string, string>; // optional override (publishStage map)
    actCount?: number; // optional explicit act count override
    backgroundColor?: string;
    transparentCenter?: boolean;
    bookAuthorColor?: string;
    authorColor?: string;
    engineColor?: string;
    percentNumberColor?: string; // Color for center percent number
    percentSymbolColor?: string; // Color for center % symbol
    theme?: 'dark' | 'light' | 'none';
    spokeColor?: string; // Custom spokes color (used when theme mode allows custom)
    // Typography settings
    bookTitleFontFamily?: string;
    bookTitleFontWeight?: number;
    bookTitleFontItalic?: boolean;
    bookTitleFontSize?: number;
    authorNameFontFamily?: string;
    authorNameFontWeight?: number;
    authorNameFontItalic?: boolean;
    authorNameFontSize?: number;
    percentNumberFontFamily?: string;
    percentNumberFontWeight?: number;
    percentNumberFontItalic?: boolean;
    percentNumberFontSize1Digit?: number;
    percentNumberFontSize2Digit?: number;
    percentNumberFontSize3Digit?: number;
    percentSymbolFontFamily?: string;
    percentSymbolFontWeight?: number;
    percentSymbolFontItalic?: boolean;
    rtBadgeFontFamily?: string;
    rtBadgeFontWeight?: number;
    rtBadgeFontItalic?: boolean;
    rtBadgeFontSize?: number;
    publishStageLabel?: string;
    showRtAttribution?: boolean;
    revealCampaignEnabled?: boolean;
    nextRevealAt?: number | string | Date;
    debugLabel?: string;
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

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const cssVar = (name: string, fallback: string) => `var(${name}-override, var(${name}, ${fallback}))`;

export function createAprSVG(scenes: TimelineItem[], opts: AprRenderOptions): AprRenderResult {
    const {
        size,
        // Typography options
        bookTitleFontFamily, bookTitleFontWeight, bookTitleFontItalic, bookTitleFontSize,
        authorNameFontFamily, authorNameFontWeight, authorNameFontItalic, authorNameFontSize,
        percentNumberFontFamily, percentNumberFontWeight, percentNumberFontItalic,
        percentNumberFontSize1Digit, percentNumberFontSize2Digit, percentNumberFontSize3Digit,
        percentSymbolFontFamily, percentSymbolFontWeight, percentSymbolFontItalic,
        rtBadgeFontFamily, rtBadgeFontWeight, rtBadgeFontItalic, rtBadgeFontSize,
        publishStageLabel,
        showRtAttribution,
        revealCampaignEnabled,
        nextRevealAt,
        bookTitle,
        authorName,
        authorUrl,
        progressPercent,
        showScenes = true,      // New: when false, shows bar-only mode
        showSubplots = true,
        showActs = true,
        showStatusColors = true,
        showStageColors = true,
        grayCompletedScenes = false,
        showProgressPercent = true,
        showBranding = true,
        centerMark = 'none',
        stageColors,
        actCount,
        backgroundColor,
        transparentCenter,
        bookAuthorColor,
        authorColor,
        engineColor,
        percentNumberColor,
        percentSymbolColor,
        theme = 'dark',
        spokeColor,
        debugLabel
    } = opts;

    const preset = getPreset(size);
    const { svgSize, innerRadius, outerRadius, spokeWidth, borderWidth, actSpokeWidth, patternScale } = preset;
    const half = svgSize / 2;

    // Structural palette based on theme (with optional custom spokes color)
    const structural = resolveStructuralColors(theme, spokeColor);

    // Normalize stage colors to match Publication mode (settings or defaults)
    const stageColorMap = stageColors || DEFAULT_SETTINGS.publishStageColors;
    const stageColorLookup = stageColorMap as Record<string, string>;
    const isThumb = size === 'thumb';
    const showScenesFinal = isThumb ? false : showScenes;
    const showProgressPercentFinal = isThumb ? false : showProgressPercent;
    const showBrandingFinal = isThumb ? false : showBranding;
    const centerMarkFinal = isThumb ? 'none' : centerMark;

    const stageInfo = resolveStageLabel(publishStageLabel);
    const stageBadgeColor = stageColorLookup[stageInfo.key] ?? stageColorMap.Press ?? '#6FB971';
    const revealCountdownDays = resolveRevealCountdownDays(revealCampaignEnabled, nextRevealAt);
    const showRtAttributionFinal = (showRtAttribution ?? true) && !isThumb;

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
    const scenesBySubplot: Record<string, TimelineItem[]> = {};
    safeScenes.forEach(scene => {
        const subplot = scene.subplot?.trim() || 'Main Plot';
        if (!scenesBySubplot[subplot]) {
            scenesBySubplot[subplot] = [];
        }
        scenesBySubplot[subplot].push(scene);
    });

    // Sort subplots: Main Plot always outermost, then by scene count (most → least)
    // Ring index 0 = innermost, so we order: least scenes → most scenes → Main Plot
    const subplotOrder = Object.keys(scenesBySubplot)
        .filter(s => s !== 'Main Plot')
        .sort((a, b) => scenesBySubplot[a].length - scenesBySubplot[b].length); // least to most

    // Main Plot goes last (outermost ring)
    if (scenesBySubplot['Main Plot']) {
        subplotOrder.push('Main Plot');
    }

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

    const bgFill = (transparentCenter || backgroundColor === 'transparent') ? 'none' : (backgroundColor ?? structural.background);
    const holeFill = transparentCenter ? 'none' : (backgroundColor ?? structural.centerHole);
    const bookTitleColorResolved = bookAuthorColor ?? stageColorMap.Press ?? '#6FB971';
    const authorColorResolved = authorColor ?? bookTitleColorResolved;
    const engineColorResolved = engineColor ?? APR_TEXT_COLORS.primary;
    const percentNumberColorResolved = percentNumberColor ?? bookTitleColorResolved;
    const percentSymbolColorResolved = percentSymbolColor ?? bookTitleColorResolved;
    const ringOptions = !showScenesFinal && isThumb
        ? {
            ghostColor: stageColorMap.Press || '#22c55e',
            ghostOpacity: 0.1,
            ghostWidth: (outerRadius - innerRadius) * 0.78,
            showBorders: false
        }
        : undefined;
    const progressColor = stageColorMap.Press || '#22c55e';
    const progressGhostColor = ringOptions?.ghostColor ?? structural.border;
    const progressGhostOpacity = ringOptions?.ghostOpacity ?? 0.25;
    const svgStyle = [
        `--apr-bg: ${bgFill}`,
        `--apr-center-fill: ${holeFill}`,
        `--apr-struct-border: ${structural.border}`,
        `--apr-struct-act-spoke: ${structural.actSpoke}`,
        `--apr-scene-void: ${APR_COLORS.void}`,
        `--apr-scene-neutral: ${APR_COLORS.sceneNeutral}`,
        `--apr-book-title-color: ${bookTitleColorResolved}`,
        `--apr-author-color: ${authorColorResolved}`,
        `--apr-engine-color: ${engineColorResolved}`,
        `--apr-percent-number-color: ${percentNumberColorResolved}`,
        `--apr-percent-symbol-color: ${percentSymbolColorResolved}`,
        `--apr-stage-badge-color: ${stageBadgeColor}`,
        `--apr-countdown-color: ${stageBadgeColor}`,
        `--apr-rt-attrib-color: ${engineColorResolved}`,
        `--apr-progress-color: ${progressColor}`,
        `--apr-progress-ghost-color: ${progressGhostColor}`,
        `--apr-progress-ghost-opacity: ${progressGhostOpacity}`,
        `--apr-center-mark-color: ${progressColor}`
    ].join('; ');

    let svg = `<svg width="${svgSize}" height="${svgSize}" viewBox="-${half} -${half} ${svgSize} ${svgSize}" xmlns="http://www.w3.org/2000/svg" class="apr-svg apr-${size}" style="${svgStyle}">`; // SAFE: inline style used for CSS variable surface in SVG
    svg += `<rect x="-${half}" y="-${half}" width="${svgSize}" height="${svgSize}" fill="${cssVar('--apr-bg', bgFill)}" />`;

    // Publication-mode defs (plaid patterns etc.) + percent shadow filter
    // Use patternScale from preset for denser patterns at smaller sizes
    const percentShadow = `
        <filter id="aprPercentShadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="2.2" flood-color="#000" flood-opacity="0.45"/>
        </filter>
    `;
    svg += `<defs>${renderDefs(stageColorMap, patternScale)}${percentShadow}</defs>`;

    // ─────────────────────────────────────────────────────────────────────────
    // BAR-ONLY MODE (Teaser): Solid progress ring, no scene details
    // ─────────────────────────────────────────────────────────────────────────
    if (!showScenesFinal) {
        svg += renderProgressRing(innerRadius, outerRadius, progressPercent, structural, stageColorMap, ringOptions);
    } else {
        // Normal mode: Draw rings with scene cells
        svg += `<g class="apr-rings">`;
        ringsToRender.forEach(ring => {
            svg += renderRing(ring, safeScenes, borderWidth, showStatusColors, showStageColors, grayCompletedScenes, stageColorMap, numActs, structural);
        });
        svg += `</g>`;

        // Act spokes (only when scenes are shown)
        if (showActs) {
            svg += renderActSpokes(numActs, innerRadius, outerRadius, actSpokeWidth, structural);
        }
    }

    // Center hole
    svg += `<circle cx="0" cy="0" r="${innerRadius}" fill="${cssVar('--apr-center-fill', holeFill)}" stroke="${cssVar('--apr-struct-border', structural.border)}" stroke-opacity="var(--apr-struct-border-opacity, 0.35)" />`;

    if (centerMarkFinal !== 'none') {
        svg += renderCenterMark(innerRadius, centerMarkFinal, progressColor);
    }

    // Center percent (optional)
    if (showProgressPercentFinal) {
        svg += renderAprCenterPercent(progressPercent, size, innerRadius, percentNumberColorResolved, percentSymbolColorResolved, undefined, {
            percentNumberFontFamily,
            percentNumberFontWeight,
            percentNumberFontItalic,
            percentNumberFontSize1Digit,
            percentNumberFontSize2Digit,
            percentNumberFontSize3Digit,
            percentSymbolFontFamily,
            percentSymbolFontWeight,
            percentSymbolFontItalic
        });
    }

    if (showBrandingFinal) {
        // Branding on the perimeter (sanitize placeholder/dummy URLs)
        svg += renderAprBranding({
            bookTitle: bookTitle || 'Working Title',
            authorName,
            authorUrl: sanitizeAuthorUrl(authorUrl),
            size,
            bookAuthorColor: bookTitleColorResolved,
            authorColor: authorColorResolved,
            bookTitleFontFamily,
            bookTitleFontWeight,
            bookTitleFontItalic,
            bookTitleFontSize,
            authorNameFontFamily,
            authorNameFontWeight,
            authorNameFontItalic,
            authorNameFontSize
        });
    }

    if (!isThumb) {
        svg += renderAprBadges({
            size,
            stageLabel: stageInfo.label,
            showStageBadge: true,
            showRtAttribution: showRtAttributionFinal,
            revealCountdownDays,
            rtBadgeFontFamily,
            rtBadgeFontWeight,
            rtBadgeFontItalic,
            rtBadgeFontSize
        });
    }

    if (debugLabel && !isThumb) {
        svg += `<text x="${half - 10}" y="${half - 10}" text-anchor="end" font-family="sans-serif" font-size="10" fill="#ef4444" font-weight="bold">${debugLabel}</text>`;
    }

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
    showStageColors: boolean,
    grayCompletedScenes: boolean,
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

        // Keep consistent manuscript ordering with timeline sorting
        scenesInAct.sort(sortByManuscriptOrder);

        if (scenesInAct.length === 0) {
            // full void arc for this act - use light gray void color
            const voidPath = sceneArcPath(ring.innerR, ring.outerR, actStart, actEnd);
            svg += `<path d="${voidPath}" fill="${cssVar('--apr-scene-void', APR_COLORS.void)}" fill-opacity="var(--apr-scene-void-opacity, 0.85)" stroke="${cssVar('--apr-struct-border', structural.border)}" stroke-width="${borderWidth}" />`;
            continue;
        }

        const positions = computePositions(ring.innerR, ring.outerR, actStart, actEnd, scenesInAct);
        let used = 0;
        scenesInAct.forEach((scene, idx) => {
            const pos = positions.get(idx);
            if (!pos) return;
            used += pos.endAngle - pos.startAngle;
            const color = resolveSceneColor(scene, showStatusColors, showStageColors, grayCompletedScenes, stageColors);
            const path = sceneArcPath(ring.innerR, ring.outerR, pos.startAngle, pos.endAngle);
            svg += `<path d="${path}" fill="${color}" stroke="${cssVar('--apr-struct-border', structural.border)}" stroke-width="${borderWidth}" />`;
        });

        // Void for remaining space in this act, if any - use light gray void color
        const span = actEnd - actStart;
        const remaining = span - used;
        if (remaining > 0.0001) {
            const voidStart = actEnd - remaining;
            const voidPath = sceneArcPath(ring.innerR, ring.outerR, voidStart, actEnd);
            svg += `<path d="${voidPath}" fill="${cssVar('--apr-scene-void', APR_COLORS.void)}" fill-opacity="var(--apr-scene-void-opacity, 0.85)" stroke="${cssVar('--apr-struct-border', structural.border)}" stroke-width="${borderWidth}" />`;
        }
    }

    // Ring frames (inner/outer)
    svg += `<circle r="${ring.outerR}" fill="none" stroke="${cssVar('--apr-struct-border', structural.border)}" stroke-width="${borderWidth}" />`;
    svg += `<circle r="${ring.innerR}" fill="none" stroke="${cssVar('--apr-struct-border', structural.border)}" stroke-width="${borderWidth}" />`;

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
        svg += `<line x1="${x1.toFixed(3)}" y1="${y1.toFixed(3)}" x2="${x2.toFixed(3)}" y2="${y2.toFixed(3)}" stroke="${cssVar('--apr-struct-act-spoke', structural.actSpoke)}" stroke-width="${spokeWidth}" />`;
    }
    svg += `</g>`;
    return svg;
}

/**
 * Resolve the fill color for a scene based on teaser reveal settings
 * 
 * @param scene - The scene to color
 * @param showStatusColors - Show Todo/In Progress/Done/Overdue colors
 * @param showStageColors - Show Zero/Author/House/Press colors  
 * @param grayCompletedScenes - Gray out completed scenes (for SCENES stage)
 * @param stageColors - Color map from settings
 */
function resolveSceneColor(
    scene: TimelineItem,
    showStatusColors: boolean,
    showStageColors: boolean,
    grayCompletedScenes: boolean,
    stageColors: Record<string, string>
): string {
    // When no colors at all, use neutral gray
    if (!showStatusColors && !showStageColors) return cssVar('--apr-scene-neutral', APR_COLORS.sceneNeutral);

    // Check if scene is "completed" (has a publish stage set)
    // Use bracket notation since 'Publish Stage' has a space
    const rawStageValue = scene['Publish Stage'];
    const rawStage = Array.isArray(rawStageValue) ? rawStageValue[0] : rawStageValue;
    const stage = (rawStage || '').toString().trim().toLowerCase();
    const isCompleted = stage && stage !== '' && stage !== 'zero';

    // SCENES stage: gray out completed scenes to hide publishing progress
    if (grayCompletedScenes && isCompleted) {
        return cssVar('--apr-scene-neutral', APR_COLORS.sceneNeutral);
    }

    // When only status colors (not stage colors), show active work but not publish stages
    if (showStatusColors && !showStageColors) {
        // For completed scenes, use neutral (we don't want to show Zero/Author/House/Press)
        if (isCompleted) return cssVar('--apr-scene-neutral', APR_COLORS.sceneNeutral);
        // For active work, use getFillForScene which respects status
        return getFillForScene(scene, stageColors);
    }

    // Full colors: use getFillForScene for everything
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

function resolveStageLabel(stageLabel?: string): { label: string; key: string } {
    const raw = (stageLabel ?? 'Zero').toString().trim();
    const match = STAGE_ORDER.find(stage => stage.toLowerCase() === raw.toLowerCase());
    const resolved = (match ?? raw) || 'Zero';
    return { label: resolved.toUpperCase(), key: resolved };
}

function normalizeTimestamp(value?: number | string | Date): number | undefined {
    if (!value) return undefined;
    if (value instanceof Date) {
        const ms = value.getTime();
        return Number.isFinite(ms) ? ms : undefined;
    }
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : undefined;
    }
    if (typeof value === 'string') {
        const ms = Date.parse(value);
        return Number.isFinite(ms) ? ms : undefined;
    }
    return undefined;
}

function resolveRevealCountdownDays(enabled?: boolean, nextRevealAt?: number | string | Date): number | undefined {
    if (!enabled) return undefined;
    const nextRevealMs = normalizeTimestamp(nextRevealAt);
    if (!nextRevealMs) return undefined;
    const diffMs = nextRevealMs - Date.now();
    if (diffMs <= 0) return undefined;
    return Math.ceil(diffMs / MS_PER_DAY);
}

function resolveStructuralColors(theme: 'dark' | 'light' | 'none', customSpokeColor?: string) {
    // If custom color provided, apply it to all structural elements (spokes, borders, act spokes)
    if (customSpokeColor) {
        return {
            spoke: customSpokeColor,
            actSpoke: customSpokeColor,
            border: customSpokeColor,
            centerHole: theme === 'light' ? '#ffffff' : '#0a0a0a',
            background: theme === 'light' ? '#ffffff' : 'transparent'
        };
    }

    if (theme === 'light') {
        return {
            spoke: 'rgba(0, 0, 0, 0.5)',
            actSpoke: 'rgba(0, 0, 0, 0.65)',
            border: 'rgba(0, 0, 0, 0.35)',
            centerHole: '#ffffff',
            background: '#ffffff'
        };
    }
    if (theme === 'none') {
        // No strokes at all - shapes touch each other
        return {
            spoke: 'none',
            actSpoke: 'none',
            border: 'none',
            centerHole: 'transparent',
            background: 'transparent'
        };
    }
    // Default: dark theme
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
    stageColors: Record<string, string>,
    options?: {
        ghostColor?: string;
        ghostOpacity?: number;
        ghostWidth?: number;
        showBorders?: boolean;
    }
): string {
    const midR = (innerR + outerR) / 2;
    const ringWidth = outerR - innerR;
    const progressWidth = ringWidth * 0.78;
    const progressColor = stageColors.Press || '#22c55e';
    const ghostColor = options?.ghostColor ?? structural.border;
    const ghostOpacity = options?.ghostOpacity ?? 0.25;
    const ghostWidth = options?.ghostWidth ?? ringWidth;
    const showBorders = options?.showBorders ?? true;

    // Track (empty ring)
    let svg = `<g class="apr-progress-ring">`;
    svg += `<circle cx="0" cy="0" r="${midR}" fill="none" stroke="${cssVar('--apr-progress-ghost-color', ghostColor)}" stroke-width="${ghostWidth}" stroke-opacity="${cssVar('--apr-progress-ghost-opacity', String(ghostOpacity))}" />`;

    // Progress arc
    if (progressPercent > 0) {
        const clampedPercent = Math.min(100, Math.max(0, progressPercent));

        if (clampedPercent >= 100) {
            // Full circle
            svg += `<circle cx="0" cy="0" r="${midR}" fill="none" stroke="${cssVar('--apr-progress-color', progressColor)}" stroke-width="${progressWidth}" />`;
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

            svg += `<path d="M ${x1.toFixed(3)} ${y1.toFixed(3)} A ${midR} ${midR} 0 ${largeArcFlag} 1 ${x2.toFixed(3)} ${y2.toFixed(3)}" fill="none" stroke="${cssVar('--apr-progress-color', progressColor)}" stroke-width="${progressWidth}" stroke-linecap="round" />`;
        }
    }

    // Outer and inner border circles
    if (showBorders) {
        svg += `<circle cx="0" cy="0" r="${outerR}" fill="none" stroke="${cssVar('--apr-struct-border', structural.border)}" stroke-width="1.5" />`;
        svg += `<circle cx="0" cy="0" r="${innerR}" fill="none" stroke="${cssVar('--apr-struct-border', structural.border)}" stroke-width="1.5" />`;
    }

    svg += `</g>`;
    return svg;
}

function renderCenterMark(
    innerR: number,
    mode: 'dot' | 'plus',
    color: string
): string {
    if (mode === 'dot') {
        const markerRadius = Math.max(2, innerR * 0.1);
        return `<circle cx="0" cy="0" r="${markerRadius}" fill="${cssVar('--apr-center-mark-color', color)}" fill-opacity="0.6" />`;
    }

    const size = Math.max(6, innerR * 0.6);
    const half = size / 2;
    const strokeWidth = Math.max(1, innerR * 0.08);
    return `
        <g class="apr-center-plus" stroke="${cssVar('--apr-center-mark-color', color)}" stroke-opacity="0.7" stroke-width="${strokeWidth}" stroke-linecap="round">
            <line x1="0" y1="${-half}" x2="0" y2="${half}" />
            <line x1="${-half}" y1="0" x2="${half}" y2="0" />
        </g>
    `;
}
