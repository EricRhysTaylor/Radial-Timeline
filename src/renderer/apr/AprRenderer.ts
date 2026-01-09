/**
 * APR (Author Progress Report) Renderer
 * 
 * Dedicated SVG renderer for shareable, spoiler-safe progress graphics.
 * Completely independent of the main timeline renderer.
 */

import { TimelineItem } from '../../types';
import { 
    APR_SIZE_PRESETS, 
    APR_STAGE_COLORS, 
    APR_STATUS_COLORS,
    APR_STRUCTURAL_COLORS,
    APR_MOMENTUM_BAR,
    APR_SCENE_GAP_RAD,
    APR_MIN_SCENE_ARC_RAD,
    AprSize, 
    AprViewMode 
} from './AprConstants';
import { renderAprBranding, renderAprCenterPercent } from './AprBranding';

// =============================================================================
// TYPES
// =============================================================================

export interface AprRenderOptions {
    /** View mode: full (acts+subplots), scenes (acts only), momentum (bar only) */
    viewMode: AprViewMode;
    /** Export size preset */
    size: AprSize;
    /** Book title for branding */
    bookTitle: string;
    /** Optional author name for branding */
    authorName?: string;
    /** Optional link URL for book title */
    authorUrl?: string;
    /** Calculated progress percentage (0-100) */
    progressPercent: number;
}

export interface AprRenderResult {
    svgString: string;
    width: number;
    height: number;
}

interface ProcessedScene {
    scene: TimelineItem;
    subplot: string;
    act: number;
    stageColor: string;
}

interface ActGroup {
    act: number;
    scenes: ProcessedScene[];
    startAngle: number;
    endAngle: number;
}

interface SubplotRing {
    subplot: string;
    scenes: ProcessedScene[];
}

// =============================================================================
// MAIN RENDER FUNCTION
// =============================================================================

/**
 * Create an APR SVG graphic
 */
export function createAprSVG(
    scenes: TimelineItem[],
    options: AprRenderOptions
): AprRenderResult {
    const { viewMode, size, bookTitle, authorName, authorUrl, progressPercent } = options;
    const preset = APR_SIZE_PRESETS[size];
    const { svgSize, innerRadius, outerRadius } = preset;
    const halfSize = svgSize / 2;
    
    // Process scenes
    const processed = processScenes(scenes);
    
    // Start SVG
    let svg = `<svg 
        width="${svgSize}" 
        height="${svgSize}" 
        viewBox="-${halfSize} -${halfSize} ${svgSize} ${svgSize}"
        xmlns="http://www.w3.org/2000/svg"
        class="apr-svg apr-${viewMode} apr-${size}">`;
    
    // Background (transparent for embedding)
    svg += `<rect x="-${halfSize}" y="-${halfSize}" width="${svgSize}" height="${svgSize}" fill="${APR_STRUCTURAL_COLORS.background}" />`;
    
    // Render based on mode
    if (viewMode === 'momentum') {
        svg += renderMomentumMode(progressPercent, size);
    } else if (viewMode === 'scenes') {
        svg += renderScenesMode(processed, size);
    } else {
        svg += renderFullMode(processed, size);
    }
    
    // Center hole (black circle)
    svg += `<circle cx="0" cy="0" r="${innerRadius}" fill="${APR_STRUCTURAL_COLORS.centerHole}" />`;
    
    // Center percentage text
    svg += renderAprCenterPercent(progressPercent, size);
    
    // Branding (perimeter text)
    svg += renderAprBranding({
        bookTitle: bookTitle || 'Working Title',
        authorName,
        authorUrl,
        size,
    });
    
    svg += '</svg>';
    
    return {
        svgString: svg,
        width: svgSize,
        height: svgSize,
    };
}

// =============================================================================
// SCENE PROCESSING
// =============================================================================

function processScenes(scenes: TimelineItem[]): ProcessedScene[] {
    return scenes.map(scene => ({
        scene,
        subplot: scene.subplot || 'Main',
        act: typeof scene.act === 'number' ? scene.act : 1,
        stageColor: getStageColor(scene),
    }));
}

function getStageColor(scene: TimelineItem): string {
    // Check publishStage first - handle array or string
    const rawStage = (scene as any).publishStage;
    const stageValue = Array.isArray(rawStage) ? rawStage[0] : rawStage;
    const stage = (typeof stageValue === 'string') ? stageValue.toLowerCase() : null;
    
    if (stage && APR_STAGE_COLORS[stage as keyof typeof APR_STAGE_COLORS]) {
        return APR_STAGE_COLORS[stage as keyof typeof APR_STAGE_COLORS];
    }
    
    // Fall back to status - handle array or string
    const rawStatus = (scene as any).status;
    const statusValue = Array.isArray(rawStatus) ? rawStatus[0] : rawStatus;
    const status = (typeof statusValue === 'string') ? statusValue.toLowerCase() : null;
    
    if (status === 'complete' || status === 'completed') {
        return APR_STATUS_COLORS.complete;
    }
    if (status === 'active' || status === 'in-progress') {
        return APR_STATUS_COLORS.active;
    }
    
    return APR_STAGE_COLORS.default;
}

// =============================================================================
// FULL MODE - Acts + Subplots
// =============================================================================

function renderFullMode(scenes: ProcessedScene[], size: AprSize): string {
    const preset = APR_SIZE_PRESETS[size];
    const { innerRadius, outerRadius, spokeWidth, borderWidth, actSpokeWidth } = preset;
    
    if (scenes.length === 0) return '';
    
    // Group by subplot, maintaining order of first appearance
    const subplotOrder: string[] = [];
    const subplotMap = new Map<string, ProcessedScene[]>();
    
    scenes.forEach(s => {
        if (!subplotMap.has(s.subplot)) {
            subplotOrder.push(s.subplot);
            subplotMap.set(s.subplot, []);
        }
        subplotMap.get(s.subplot)!.push(s);
    });
    
    const numRings = subplotOrder.length;
    const ringThickness = (outerRadius - innerRadius) / numRings;
    
    // Group scenes by act for spoke positioning
    const actGroups = groupByAct(scenes);
    const totalScenes = scenes.length;
    const fullCircle = 2 * Math.PI;
    const startAngle = -Math.PI / 2; // Start at top
    
    let svg = '<g class="apr-rings">';
    
    // Render each subplot ring
    subplotOrder.forEach((subplot, ringIndex) => {
        const ringScenes = subplotMap.get(subplot)!;
        const ringInner = innerRadius + (ringIndex * ringThickness);
        const ringOuter = ringInner + ringThickness;
        
        svg += renderRing(ringScenes, scenes, ringInner, ringOuter, startAngle, fullCircle, borderWidth);
    });
    
    svg += '</g>';
    
    // Render act spokes (full radius)
    svg += renderActSpokes(actGroups, scenes.length, innerRadius, outerRadius, startAngle, actSpokeWidth);
    
    // Render scene spokes (dividers between scenes)
    svg += renderSceneSpokes(scenes, innerRadius, outerRadius, startAngle, spokeWidth);
    
    return svg;
}

// =============================================================================
// SCENES MODE - Single Ring with Acts
// =============================================================================

function renderScenesMode(scenes: ProcessedScene[], size: AprSize): string {
    const preset = APR_SIZE_PRESETS[size];
    const { innerRadius, outerRadius, spokeWidth, actSpokeWidth } = preset;
    
    if (scenes.length === 0) return '';
    
    // Single ring, thicker than full mode rings
    const ringInner = innerRadius;
    const ringOuter = outerRadius;
    
    const actGroups = groupByAct(scenes);
    const fullCircle = 2 * Math.PI;
    const startAngle = -Math.PI / 2;
    
    let svg = '<g class="apr-rings">';
    
    // Single ring with all scenes
    svg += renderRing(scenes, scenes, ringInner, ringOuter, startAngle, fullCircle, preset.borderWidth);
    
    svg += '</g>';
    
    // Act spokes
    svg += renderActSpokes(actGroups, scenes.length, innerRadius, outerRadius, startAngle, actSpokeWidth);
    
    // Scene spokes
    svg += renderSceneSpokes(scenes, innerRadius, outerRadius, startAngle, spokeWidth);
    
    return svg;
}

// =============================================================================
// MOMENTUM MODE - Progress Bar Only
// =============================================================================

function renderMomentumMode(percent: number, size: AprSize): string {
    const preset = APR_SIZE_PRESETS[size];
    const { svgSize } = preset;
    
    const barWidth = svgSize * APR_MOMENTUM_BAR.width;
    const barHeight = APR_MOMENTUM_BAR.height;
    const barRadius = APR_MOMENTUM_BAR.borderRadius;
    const yPos = APR_MOMENTUM_BAR.yOffset;
    
    const fillWidth = (barWidth * percent) / 100;
    
    return `
        <g class="apr-momentum-bar">
            <!-- Track -->
            <rect 
                x="${-barWidth / 2}" 
                y="${yPos}" 
                width="${barWidth}" 
                height="${barHeight}" 
                rx="${barRadius}" 
                fill="${APR_MOMENTUM_BAR.trackColor}" 
            />
            <!-- Fill -->
            <rect 
                x="${-barWidth / 2}" 
                y="${yPos}" 
                width="${fillWidth}" 
                height="${barHeight}" 
                rx="${barRadius}" 
                fill="${APR_MOMENTUM_BAR.fillColor}" 
            />
        </g>
    `;
}

// =============================================================================
// RING RENDERING
// =============================================================================

function renderRing(
    ringScenes: ProcessedScene[],
    allScenes: ProcessedScene[],
    innerR: number,
    outerR: number,
    startAngle: number,
    fullCircle: number,
    borderWidth: number
): string {
    const totalScenes = allScenes.length;
    const anglePerScene = fullCircle / totalScenes;
    
    let svg = '';
    
    ringScenes.forEach(ps => {
        // Find this scene's global index
        const globalIndex = allScenes.indexOf(ps);
        if (globalIndex === -1) return;
        
        const sceneStart = startAngle + (globalIndex * anglePerScene) + APR_SCENE_GAP_RAD;
        const sceneEnd = startAngle + ((globalIndex + 1) * anglePerScene) - APR_SCENE_GAP_RAD;
        const sceneArc = Math.max(sceneEnd - sceneStart, APR_MIN_SCENE_ARC_RAD);
        
        svg += renderArc(innerR, outerR, sceneStart, sceneStart + sceneArc, ps.stageColor, borderWidth);
    });
    
    return svg;
}

function renderArc(
    innerR: number, 
    outerR: number, 
    startAngle: number, 
    endAngle: number, 
    fillColor: string,
    borderWidth: number
): string {
    // Create an arc path (annular sector)
    const largeArc = (endAngle - startAngle) > Math.PI ? 1 : 0;
    
    const innerStartX = innerR * Math.cos(startAngle);
    const innerStartY = innerR * Math.sin(startAngle);
    const innerEndX = innerR * Math.cos(endAngle);
    const innerEndY = innerR * Math.sin(endAngle);
    
    const outerStartX = outerR * Math.cos(startAngle);
    const outerStartY = outerR * Math.sin(startAngle);
    const outerEndX = outerR * Math.cos(endAngle);
    const outerEndY = outerR * Math.sin(endAngle);
    
    // Path: outer arc (clockwise) -> line to inner -> inner arc (counter-clockwise) -> close
    const pathD = [
        `M ${fmt(outerStartX)} ${fmt(outerStartY)}`,
        `A ${outerR} ${outerR} 0 ${largeArc} 1 ${fmt(outerEndX)} ${fmt(outerEndY)}`,
        `L ${fmt(innerEndX)} ${fmt(innerEndY)}`,
        `A ${innerR} ${innerR} 0 ${largeArc} 0 ${fmt(innerStartX)} ${fmt(innerStartY)}`,
        'Z'
    ].join(' ');
    
    return `<path 
        d="${pathD}" 
        fill="${fillColor}" 
        stroke="${APR_STRUCTURAL_COLORS.border}" 
        stroke-width="${borderWidth}" 
    />`;
}

// =============================================================================
// SPOKES
// =============================================================================

function renderActSpokes(
    actGroups: ActGroup[],
    totalScenes: number,
    innerR: number,
    outerR: number,
    startAngle: number,
    spokeWidth: number
): string {
    const fullCircle = 2 * Math.PI;
    const anglePerScene = fullCircle / totalScenes;
    
    let svg = '<g class="apr-act-spokes">';
    
    // Track which scene indices start new acts
    let sceneIndex = 0;
    actGroups.forEach((group, groupIndex) => {
        if (groupIndex === 0) {
            // First act starts at top - no spoke needed there (or we could add it)
        }
        
        // Spoke at the START of this act
        const angle = startAngle + (sceneIndex * anglePerScene);
        svg += renderSpoke(angle, innerR, outerR, spokeWidth, APR_STRUCTURAL_COLORS.actSpoke);
        
        sceneIndex += group.scenes.length;
    });
    
    svg += '</g>';
    return svg;
}

function renderSceneSpokes(
    scenes: ProcessedScene[],
    innerR: number,
    outerR: number,
    startAngle: number,
    spokeWidth: number
): string {
    const totalScenes = scenes.length;
    const fullCircle = 2 * Math.PI;
    const anglePerScene = fullCircle / totalScenes;
    
    let svg = '<g class="apr-scene-spokes">';
    
    // Spoke at each scene boundary
    for (let i = 0; i < totalScenes; i++) {
        const angle = startAngle + (i * anglePerScene);
        svg += renderSpoke(angle, innerR, outerR, spokeWidth, APR_STRUCTURAL_COLORS.spoke);
    }
    
    svg += '</g>';
    return svg;
}

function renderSpoke(
    angle: number,
    innerR: number,
    outerR: number,
    width: number,
    color: string
): string {
    const x1 = innerR * Math.cos(angle);
    const y1 = innerR * Math.sin(angle);
    const x2 = outerR * Math.cos(angle);
    const y2 = outerR * Math.sin(angle);
    
    return `<line 
        x1="${fmt(x1)}" y1="${fmt(y1)}" 
        x2="${fmt(x2)}" y2="${fmt(y2)}" 
        stroke="${color}" 
        stroke-width="${width}" 
    />`;
}

// =============================================================================
// HELPERS
// =============================================================================

function groupByAct(scenes: ProcessedScene[]): ActGroup[] {
    const actMap = new Map<number, ProcessedScene[]>();
    const actOrder: number[] = [];
    
    scenes.forEach(s => {
        if (!actMap.has(s.act)) {
            actOrder.push(s.act);
            actMap.set(s.act, []);
        }
        actMap.get(s.act)!.push(s);
    });
    
    return actOrder.map(act => ({
        act,
        scenes: actMap.get(act)!,
        startAngle: 0, // Computed later if needed
        endAngle: 0,
    }));
}

function fmt(n: number): string {
    return n.toFixed(3);
}
