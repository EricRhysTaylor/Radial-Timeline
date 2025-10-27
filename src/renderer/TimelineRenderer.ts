/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */
/**
 * Radial Timeline Plugin for Obsidian — Renderer
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import { NUM_ACTS, GRID_CELL_BASE, GRID_CELL_WIDTH_EXTRA, GRID_CELL_GAP_X, GRID_CELL_GAP_Y, GRID_HEADER_OFFSET_Y, GRID_LINE_HEIGHT, PLOT_PIXEL_WIDTH, STAGE_ORDER, STAGES_FOR_GRID, STATUSES_FOR_GRID, STATUS_COLORS, SceneNumberInfo } from '../utils/constants';
import type { Scene } from '../main';
import { formatNumber, escapeXml } from '../utils/svg';
import { dateToAngle, isOverdueDateString } from '../utils/date';
import { parseSceneTitle, normalizeStatus, parseSceneTitleComponents, getScenePrefixNumber, getNumberSquareSize } from '../utils/text';
import { 
    extractGradeFromScene, 
    getSceneState, 
    buildSquareClasses, 
    buildTextClasses,
    type PluginRendererFacade
} from '../utils/sceneHelpers';
import { generateNumberSquareGroup, makeSceneId } from '../utils/numberSquareHelpers';
import { normalizeBeatName } from '../utils/gossamer';
import { renderGossamerLayer } from './gossamerLayer';
import { computeRingGeometry } from './layout/Rings';
import { arcPath } from './layout/Paths';
import { renderCenterGrid } from './components/Grid';
import { renderMonthLabelDefs } from './components/Months';
import { renderSubplotLabels } from './components/SubplotLabels';
import { renderDefs, renderProgressRingGradients } from './components/Defs';
import { renderEstimatedDateElements, renderEstimationArc } from './components/Progress';
import { sceneArcPath, renderVoidCellPath } from './components/SceneArcs';
import { renderPlotSlice } from './components/PlotSlices';
import { renderActBorders } from './components/Acts';
import { renderActLabels } from './components/ActLabels';
import { renderTargetDateTick } from './components/ProgressTicks';
import { renderProgressRing } from './components/ProgressRing';
import { serializeSynopsesToString } from './components/Synopses';
import { renderSceneGroup } from './components/Scenes';
import { renderPlotGroup } from './components/Plots';
import { renderMonthSpokesAndInnerLabels, renderGossamerMonthSpokes } from './components/MonthSpokes';
import { renderOuterRingNumberSquares, renderInnerRingsNumberSquaresAllScenes, renderNumberSquaresStandard } from './components/NumberSquares';
import { shouldRenderStoryBeats, shouldShowSubplotRings, shouldShowAllScenesInOuterRing, shouldShowInnerRingContent, getSubplotLabelText } from './modules/ModeRenderingHelpers';
import { renderChronologueTimelineArc } from './components/ChronologueTimeline';

// STATUS_COLORS and SceneNumberInfo now imported from constants

// Stage header tooltips (used for grid row headers Z/A/H/P)
const STAGE_HEADER_TOOLTIPS: Record<string, string> = {
  Zero: 'Zero stage — The raw first draft. Unpolished ideas on the page, no revisions yet.',
  Author: 'Author stage — The author revises and refines the draft after letting it rest.',
  House: 'House stage — Alpha and beta readers give feedback. Publisher or editor reviews the manuscript. Copy-edited and proofed.',
  Press: 'Press stage — Final version is ready for publication.'
};

// Status header tooltips (used for grid column headers Tdo/Wrk/Due/Cmt)
const STATUS_HEADER_TOOLTIPS: Record<string, string> = {
  Todo: 'Todo — tasks or scenes not yet started',
  Working: 'Working — tasks or scenes currently in progress',
  Due: 'Due — tasks or scenes with a past-due date',
  Completed: 'Completed — tasks or scenes finished'
};


// --- Small helpers to centralize ring logic ---

// Offsets are based solely on the outer scene ring's outer radius
const PLOT_TITLE_INSET = -3;

// --- Plot label post-adjust state (prevents duplicate/clobber passes) ---
type PlotAdjustState = { retryId?: number; signature?: string; success?: boolean; lastAbortSignature?: string };
const plotAdjustState = new WeakMap<HTMLElement, PlotAdjustState>();

function getLabelSignature(container: HTMLElement): string {
    const ids = Array.from(container.querySelectorAll('.rt-plot-title textPath'))
        .map((tp) => (tp as SVGTextPathElement).getAttribute('href') || '')
        .join('|');
    return ids;
}

     // px inward from outer scene edge for story beat titles
const ACT_LABEL_OFFSET = 25;     // px outward from outer scene edge for ACT labels
const MONTH_TEXT_INSET = 10;     // px inward toward center from outer perimeter (larger = closer to origin)
const MONTH_TICK_TERMINAL = 35;   // px outward from outer scene edge for month tick lines
const SCENE_TITLE_INSET = 22; // fixed pixels inward from the scene's outer boundary for title path

// --- Tuning constants for plot label rendering ---
const PLOT_FONT_PX = 9; // keep in sync with .plot-title in CSS
const CHAR_WIDTH_EM = 0.62; // approx glyph width in em
const LETTER_SPACING_EM = 0.07; // additional spacing in em
const ESTIMATE_FUDGE_RENDER = 1.35; // generous length when rendering
const PADDING_RENDER_PX = 24; // extra pixels for render
const ANGULAR_GAP_PX = 16; // gap used when checking overlaps
const TEXTPATH_START_NUDGE_RAD = 0.02; // small start nudge for text paths

// --- Small helpers ---
function stripNumericPrefix(title: string | undefined): string {
    const full = title || '';
    const m = full.match(/^(?:\s*\d+(?:\.\d+)?\s+)?(.+)/);
    return m ? m[1] : full;
}

function estimatePixelsFromTitle(title: string, fontPx: number, fudge: number, paddingPx: number): number {
    const approxPerChar = fontPx * (CHAR_WIDTH_EM + LETTER_SPACING_EM) * fudge;
    return Math.max(0, title.length * approxPerChar + paddingPx);
}

function estimateAngleFromTitle(title: string, baseRadius: number, fontPx: number, fudge: number, paddingPx: number): number {
    const px = estimatePixelsFromTitle(title, fontPx, fudge, paddingPx);
    return px / Math.max(1, baseRadius);
}

function getEffectiveScenesForRing(allScenes: Scene[], actIndex: number, subplot: string | undefined, outerAllScenes: boolean, isOuter: boolean, grouped: { [act: number]: { [subplot: string]: Scene[] } }): Scene[] {
    if (isOuter && outerAllScenes) {
        const seenPaths = new Set<string>();
        const seenPlotKeys = new Set<string>();
        const result: Scene[] = [];
        allScenes.forEach(s => {
            const a = s.actNumber !== undefined ? s.actNumber - 1 : 0;
            if (a !== actIndex) return;
            if (s.itemType === 'Plot') {
                const key = `${String(s.title || '')}::${String(s.actNumber ?? '')}`;
                if (seenPlotKeys.has(key)) return;
                seenPlotKeys.add(key);
                result.push(s);
            } else {
                const k = s.path || `${s.title || ''}::${String(s.when || '')}`;
                if (seenPaths.has(k)) return;
                seenPaths.add(k);
                result.push(s);
            }
        });
        return result;
    }
    const list = subplot ? (grouped[actIndex] && grouped[actIndex][subplot]) || [] : [];
    return outerAllScenes ? list.filter(s => s.itemType !== 'Plot') : list.filter(s => s.itemType !== 'Plot');
}

function buildSynopsis(
    plugin: PluginRendererFacade,
    scene: Scene,
    sceneId: string,
    maxTextWidth: number,
    orderedSubplots: string[],
    subplotIndexResolver?: (name: string) => number
): SVGGElement {
    const contentLines = [
        `${scene.title}   ${scene.when?.toLocaleDateString() || ''}`,
        ...(scene.itemType === 'Plot' && scene.Description
            ? plugin.splitIntoBalancedLines(scene.Description, maxTextWidth)
            : scene.synopsis
            ? plugin.splitIntoBalancedLines(scene.synopsis, maxTextWidth)
            : [])
    ];
    
    // For Beat notes, add Gossamer1 score right after Description (before separator)
    if (scene.itemType === 'Plot') {
        const gossamer1 = scene.Gossamer1;
        if (gossamer1 !== undefined && gossamer1 !== null) {
            contentLines.push(`<gossamer>${gossamer1}/100</gossamer>`);
        }
    }
    
    // Add separator
    contentLines.push('\u00A0');
    
    // Add metadata for non-Plot scenes
    if (scene.itemType !== 'Plot') {
        const rawSubplots = orderedSubplots.join(', ');
        contentLines.push(rawSubplots);
        const rawCharacters = (scene.Character || []).join(', ');
        contentLines.push(rawCharacters);
    }
    
    const filtered = contentLines.filter(line => line && line.trim() !== '\u00A0');
    // Pass resolver so SynopsisManager can map each subplot name to the same CSS variable index used in rings
    return plugin.synopsisManager.generateElement(scene, filtered, sceneId, subplotIndexResolver);
}

type PositionInfo = { startAngle: number; endAngle: number; angularSize: number };
function computePositions(innerR: number, outerR: number, startAngle: number, endAngle: number, items: Scene[]): Map<number, PositionInfo> {
    const middleRadius = (innerR + outerR) / 2;
    const plotAngularWidth = PLOT_PIXEL_WIDTH / middleRadius;
    const totalAngularSpace = endAngle - startAngle;
    const plotCount = items.filter(it => it.itemType === 'Plot').length;
    const plotTotalAngularSpace = plotCount * plotAngularWidth;
    const sceneCount = items.filter(it => it.itemType !== 'Plot').length;
    const sceneAngularSize = sceneCount > 0 ? (totalAngularSpace - plotTotalAngularSpace) / sceneCount : 0;

    let current = startAngle;
    const positions = new Map<number, PositionInfo>();
    items.forEach((it, idx) => {
        if (it.itemType === 'Plot') {
            positions.set(idx, { startAngle: current, endAngle: current + plotAngularWidth, angularSize: plotAngularWidth });
            current += plotAngularWidth;
        } else {
            positions.set(idx, { startAngle: current, endAngle: current + sceneAngularSize, angularSize: sceneAngularSize });
            current += sceneAngularSize;
        }
    });
    return positions;
}

function getFillForItem(
    plugin: PluginRendererFacade,
    scene: Scene,
    maxStageColor: string,
    publishStageColors: Record<string, string>,
    totalPlotNotes: number,
    plotIndexByKey: Map<string, number>,
    allowPlotShading: boolean,
    subplotColorResolver?: (subplot: string) => string,
    isOuterAllScenes?: boolean
): string {
    if (scene.itemType === 'Plot') {
        // Solid white for plot beats
        return '#FFFFFF';
    }

    const statusList = Array.isArray(scene.status) ? scene.status : [scene.status];
    const norm = normalizeStatus(statusList[0]);
    const publishStage = scene['Publish Stage'] || 'Zero';
    if (!norm) return `url(#plaidTodo${publishStage})`;
    if (norm === 'Completed') {
        // Completed: use subplot colors in all-scenes mode, else stage color
        if (isOuterAllScenes && subplotColorResolver) {
            const subplotName = scene.subplot && scene.subplot.trim().length > 0 ? scene.subplot : 'Main Plot';
            return subplotColorResolver(subplotName);
        }
        const stageColor = publishStageColors[publishStage as keyof typeof publishStageColors] || publishStageColors.Zero;
        return stageColor;
    }
    if (scene.due && isOverdueDateString(scene.due)) return STATUS_COLORS.Due;
    if (norm === 'Working') return `url(#plaidWorking${publishStage})`;
    if (norm === 'Todo') return `url(#plaidTodo${publishStage})`;
    return STATUS_COLORS[statusList[0] as keyof typeof STATUS_COLORS] || STATUS_COLORS.Todo;
}

/**
 * Measures and adjusts plot label positions after SVG is rendered
 * Uses actual SVG getComputedTextLength() for perfect accuracy
 */
export function adjustPlotLabelsAfterRender(container: HTMLElement, attempt: number = 0): void {
    const state = plotAdjustState.get(container) || {};
    // If container is no longer in DOM, stop
    if (!container.isConnected) return;
    const labels = container.querySelectorAll('.rt-plot-title');
    if (labels.length === 0) return;
    
    const SPACE_BEFORE_DASH = 6; // pixels - tighter spacing before dash
    const SPACE_AFTER_DASH = 4;   // pixels - tighter spacing after dash
    const TEXT_START_OFFSET = 2;  // pixels - matches the startOffset in textPath
    const EXTRA_BREATHING_ROOM = 16; // pixels - extra space to ensure text doesn't crowd
    
    interface LabelData {
        element: SVGTextElement;
        textPath: SVGTextPathElement;
        pathElement: SVGPathElement;
        pathId: string;
        originalStartAngle: number;
        textLength: number;
        radius: number;
    }
    
    // If container or SVG isn't visible yet, defer
    const svgRoot = container.querySelector('svg.radial-timeline-svg') as SVGSVGElement | null;
    const isHidden = !svgRoot || svgRoot.getBoundingClientRect().width === 0 || document.visibilityState === 'hidden';
    const MAX_ATTEMPTS = 10;
    const signature = getLabelSignature(container);
    
    // Reset state if signature changed (new labels), otherwise keep existing state
    if (state.signature !== signature) {
        state.signature = signature;
        state.success = false;
        if (state.retryId) cancelAnimationFrame(state.retryId);
        plotAdjustState.set(container, state);
    }

    if (isHidden && attempt < MAX_ATTEMPTS) {
        const rafId = requestAnimationFrame(() => adjustPlotLabelsAfterRender(container, attempt + 1));
        state.retryId = rafId;
        plotAdjustState.set(container, state);
        // cleanup will happen before setting a new one or when state.signature changes above
        return;
    }

    // Gather all label data
    const labelData: LabelData[] = [];
    let measurableCount = 0;
    labels.forEach((label) => {
        const textElement = label as SVGTextElement;
        const textPath = textElement.querySelector('textPath') as SVGTextPathElement;
        if (!textPath) return;
        
        const pathId = textPath.getAttribute('href')?.substring(1);
        if (!pathId) return;
        
        const pathElement = container.querySelector(`#${pathId}`) as SVGPathElement;
        if (!pathElement) return;
        
        // Get actual rendered text length
        const textLength = textPath.getComputedTextLength();
        if (textLength === 0) {
            return; // Skip if not yet rendered
        }
        measurableCount++;
        
        // Get the path's d attribute to extract start angle and radius
        const d = pathElement.getAttribute('d');
        if (!d) return;
        
        // Parse the arc path: M x1 y1 A radius radius 0 largeArc sweep x2 y2
        const arcMatch = d.match(/M\s+([-\d.]+)\s+([-\d.]+)\s+A\s+([-\d.]+)/);
        if (!arcMatch) return;
        
        const x = parseFloat(arcMatch[1]);
        const y = parseFloat(arcMatch[2]);
        const radius = parseFloat(arcMatch[3]);
        
        // Calculate original start angle from x,y coordinates
        const originalStartAngle = Math.atan2(y, x);
        
        labelData.push({
            element: textElement,
            textPath,
            pathElement,
            pathId,
            originalStartAngle,
            textLength,
            radius
        });
    });

    // If some labels weren't measurable yet, try again shortly (max attempts)
    if (measurableCount < labels.length && attempt < MAX_ATTEMPTS) {
        // When text is not laid out yet (hidden), allow a small timeout to settle
        state.signature = signature;
        state.success = false;
        plotAdjustState.set(container, state);
        window.setTimeout(() => adjustPlotLabelsAfterRender(container, attempt + 1), 50);
        return;
    }

    // If still not measurable, abort to avoid clobbering previous good layout
    if (measurableCount === 0 && attempt >= MAX_ATTEMPTS) {
        // Silent abort: preserve previous positions without logging
        state.lastAbortSignature = signature;
        plotAdjustState.set(container, state);
        return;
    }

    // Always proceed with adjustment when measurable

    // (debug logs removed)
    
    // Sort by original start angle; if equal, sort by path id to keep stable order
    labelData.sort((a, b) => {
        if (a.originalStartAngle === b.originalStartAngle) return a.pathId.localeCompare(b.pathId);
        return a.originalStartAngle - b.originalStartAngle;
    });
    
    // Adjust positions to prevent overlap
    let lastEnd = Number.NEGATIVE_INFINITY;
    const adjustments: Array<{ data: LabelData; newStartAngle: number; needsDash: boolean; dashAngle?: number; pathAngleSpan: number }> = [];
    
    labelData.forEach((data) => {
        // Path needs to be longer than text: startOffset + textLength + breathing room
        const pathWidth = TEXT_START_OFFSET + data.textLength + EXTRA_BREATHING_ROOM;
        const pathAngleSpan = pathWidth / Math.max(1, data.radius);
        
        // For overlap detection, use just the text + offset (tighter)
        const textOnlyWidth = TEXT_START_OFFSET + data.textLength;
        const textAngleSpan = textOnlyWidth / Math.max(1, data.radius);
        
        let startAngle = data.originalStartAngle;
        let needsDash = false;
        let dashAngle: number | undefined;
        
        // Check for overlap using text-only span with small epsilon
        const epsilon = 2 / Math.max(1, data.radius); // ~2px
        if (startAngle <= lastEnd + epsilon) {
            const spaceBeforeDash = SPACE_BEFORE_DASH / Math.max(1, data.radius);
            const spaceAfterDash = SPACE_AFTER_DASH / Math.max(1, data.radius);
            dashAngle = lastEnd + spaceBeforeDash;
            startAngle = lastEnd + spaceBeforeDash + spaceAfterDash;
            needsDash = true;
        }
        
        // Track last end using text-only span (tighter for next overlap check)
        const endAngle = startAngle + textAngleSpan;
        lastEnd = endAngle;
        
        // But render with the fuller path span
        adjustments.push({ 
            data, 
            newStartAngle: startAngle, 
            needsDash, 
            dashAngle,
            pathAngleSpan 
        });
    });
    
    // Apply adjustments
    adjustments.forEach(({ data, newStartAngle, needsDash, dashAngle, pathAngleSpan }) => {
        const endAngle = newStartAngle + pathAngleSpan;
        
        const x1 = data.radius * Math.cos(newStartAngle);
        const y1 = data.radius * Math.sin(newStartAngle);
        const x2 = data.radius * Math.cos(endAngle);
        const y2 = data.radius * Math.sin(endAngle);
        const largeArc = pathAngleSpan > Math.PI ? 1 : 0;
        
        const newPath = `M ${formatNumber(x1)} ${formatNumber(y1)} A ${formatNumber(data.radius)} ${formatNumber(data.radius)} 0 ${largeArc} 1 ${formatNumber(x2)} ${formatNumber(y2)}`;
        data.pathElement.setAttribute('d', newPath);
        
        // Add or remove dash separator (glyph along tangent)
        if (needsDash && dashAngle !== undefined) {
            let separator = container.querySelector(`#plot-separator-${data.pathId}`) as SVGTextElement;
            if (!separator) {
                separator = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                // Use full path id for uniqueness
                separator.setAttribute('id', `plot-separator-${data.pathId}`);
                // Match previous implementation for styling/visibility
                separator.setAttribute('class', 'rt-plot-title rt-plot-dash-separator');
                // Ensure centered on tangent
                separator.setAttribute('text-anchor', 'middle');
                // Match plot label baseline offset
                separator.setAttribute('dy', '-3');
                separator.textContent = '—';
                data.pathElement.parentElement?.appendChild(separator);
            }
            const dashRadius = data.radius + 1; // 2px closer to origin
            const dx = dashRadius * Math.cos(dashAngle);
            const dy = dashRadius * Math.sin(dashAngle);
            const deg = (dashAngle + Math.PI / 2) * 180 / Math.PI;
            separator.setAttribute('transform', `translate(${formatNumber(dx)}, ${formatNumber(dy)}) rotate(${formatNumber(deg)})`);
        } else {
            const separator = container.querySelector(`#plot-separator-${data.pathId}`);
            separator?.remove();
        }

        // (debug logs removed)
    });
    // (debug logs removed)
    state.success = true;
    plotAdjustState.set(container, state);
}

export function createTimelineSVG(
  plugin: PluginRendererFacade,
  scenes: Scene[],
): { svgString: string; maxStageColor: string } {
    
        const sceneCount = scenes.length;
        const size = 1600;
        const margin = 37; //KEY VALUE reduce timeline radius to make more room for ring text at top. Offset from the SVG edge to the First Plot Ring
        const innerRadius = 200; // the first ring is 200px from the center
        const outerRadius = size / 2 - margin;
        const maxTextWidth = 500; // Define maxTextWidth for the synopsis text
    
        // --- Find Max Publish Stage --- START ---
        const stageOrder = [...STAGE_ORDER];
        let maxStageIndex = 0; // Default to Zero index
        scenes.forEach(scene => {
            const rawStage = scene["Publish Stage"];
            const stage = (STAGE_ORDER as readonly string[]).includes(rawStage as string) ? (rawStage as typeof STAGE_ORDER[number]) : 'Zero';
            const currentIndex = stageOrder.indexOf(stage);
            if (currentIndex > maxStageIndex) {
                maxStageIndex = currentIndex;
            }
        });
        const maxStageName = stageOrder[maxStageIndex];
        // Add check before accessing settings potentially
        const maxStageColor =
        plugin.settings.publishStageColors[maxStageName as keyof typeof plugin.settings.publishStageColors] || plugin.settings.publishStageColors.Zero;
 
        // --- Find Max Publish Stage --- END ---

        // Create SVG root and expose the dominant publish-stage colour for CSS via a hidden <g> element
        let svg = `<svg width="${size}" height="${size}" viewBox="-${size / 2} -${size / 2} ${size} ${size}" 
                       xmlns="http://www.w3.org/2000/svg" class="radial-timeline-svg" 
                       preserveAspectRatio="xMidYMid meet">`;
        

        // Hidden config group consumed by the stylesheet (e.g. to tint buttons, etc.)
        svg += `<g id="timeline-config-data" data-max-stage-color="${maxStageColor}"></g>`;

        // (Debug overlay and search banner removed)
        
        // Center the origin in the middle of the SVG
        svg += `<g transform="translate(${size / 2}, ${size / 2})">`;
        
        // Create defs for patterns and gradients (opened later after SVG root)

        // (Debug overlay and search banner removed)
        
        // Center the origin in the middle of the SVG
        svg += `<g transform="translate(${size / 2}, ${size / 2})">`;
        
        // Create defs for patterns and gradients
        svg += `<defs>`;

        // Create a map to store scene number information for the scene square and synopsis
        const sceneNumbersMap = new Map<string, SceneNumberInfo>();
    
        // Collect all unique subplots (normalize empty to "Main Plot")
        const allSubplotsSet = new Set<string>();
        scenes.forEach(scene => {
            const key = scene.subplot && scene.subplot.trim().length > 0 ? scene.subplot : 'Main Plot';
            allSubplotsSet.add(key);
        });
        const allSubplots = Array.from(allSubplotsSet);
    
        // Dynamically set NUM_RINGS based on the number of unique subplots
        const NUM_RINGS = allSubplots.length;
    
        // Ring colors are now handled by CSS variables and dynamic color logic
    
        // Precompute plot note indexes and grouping to avoid repeated scans
        const allScenesPlotNotes = scenes.filter(s => s.itemType === 'Plot');
        const totalPlotNotes = allScenesPlotNotes.length;
        const plotIndexByKey = new Map<string, number>();
        allScenesPlotNotes.forEach((p, i) => plotIndexByKey.set(`${String(p.title || '')}::${String(p.actNumber ?? '')}`, i));
        const plotsBySubplot = new Map<string, Scene[]>();
        allScenesPlotNotes.forEach(p => {
            const key = String(p.subplot || '');
            const arr = plotsBySubplot.get(key) || [];
            arr.push(p);
            plotsBySubplot.set(key, arr);
        });

        // Global stacking for plot titles across all acts (outer-ring all-scenes only)
        // Stacking map removed

        // Group scenes by Act and Subplot
        const scenesByActAndSubplot: { [act: number]: { [subplot: string]: Scene[] } } = {};
    
        for (let act = 0; act < NUM_ACTS; act++) {
            scenesByActAndSubplot[act] = {};
        }
    
        scenes.forEach(scene => {
            const act = scene.actNumber !== undefined ? scene.actNumber - 1 : 0; // Subtract 1 for 0-based index, default to 0 if undefined
    
            // Ensure act is within valid range
            const validAct = (act >= 0 && act < NUM_ACTS) ? act : 0;
    
            const subplot = scene.subplot && scene.subplot.trim().length > 0 ? scene.subplot : 'Main Plot';
    
            if (!scenesByActAndSubplot[validAct][subplot]) {
                scenesByActAndSubplot[validAct][subplot] = [];
            }
    
            scenesByActAndSubplot[validAct][subplot].push(scene);
        });
    
        // Define the months and their angles
        const months = Array.from({ length: 12 }, (_, i) => {
            const angle = (i / 12) * 2 * Math.PI - Math.PI / 2; // Adjust so January is at the top
            const name = new Date(2000, i).toLocaleString('en-US', { month: 'long' });
            const shortName = new Date(2000, i).toLocaleString('en-US', { month: 'short' }).slice(0, 3);
            return { name, shortName, angle };
        });
    
        // Compute ring widths and radii via helper
        const N = NUM_RINGS;
        const ringGeo = computeRingGeometry({
            size,
            innerRadius,
            outerRadius,
            numRings: N,
            monthTickTerminal: MONTH_TICK_TERMINAL,
            monthTextInset: MONTH_TEXT_INSET,
        });
        const { ringWidths, ringStartRadii, lineInnerRadius, lineOuterRadius, monthLabelRadius } = ringGeo;
    
        // **Include the `<style>` code here**
        svg = `<svg width="${size}" height="${size}" viewBox="-${size / 2} -${size / 2} ${size} ${size}" xmlns="http://www.w3.org/2000/svg" class="radial-timeline-svg" preserveAspectRatio="xMidYMid meet">`;
        

        // After radii are known, compute global stacking map (outer-ring all-scenes only)
        if (shouldShowAllScenesInOuterRing(plugin)) {
            // No global stacking computation
        }

        // Access the publishStageColors from settings
        const PUBLISH_STAGE_COLORS = plugin.settings.publishStageColors;

        // Begin defs act
        svg += `<defs>`;
        
        // Define patterns for Working and Todo states with Publish Stage colors
        svg += renderDefs(PUBLISH_STAGE_COLORS);
        

        // Define outer arc paths for months
        svg += renderMonthLabelDefs({ months, monthLabelRadius });


        // Close defs act
        svg += `</defs>`;

        // Open static container (non-rotating root)
        svg += `<g id="timeline-root">`;

        // Reusable helper to build a full ring cell arc path (inner->outer->outer arc->inner->inner arc)
        const buildCellArcPath = (innerR: number, outerR: number, startAngle: number, endAngle: number): string => {
            return `
                                M ${formatNumber(innerR * Math.cos(startAngle))} ${formatNumber(innerR * Math.sin(startAngle))}
                                L ${formatNumber(outerR * Math.cos(startAngle))} ${formatNumber(outerR * Math.sin(startAngle))}
                                A ${formatNumber(outerR)} ${formatNumber(outerR)} 0 0 1 ${formatNumber(outerR * Math.cos(endAngle))} ${formatNumber(outerR * Math.sin(endAngle))}
                                L ${formatNumber(innerR * Math.cos(endAngle))} ${formatNumber(innerR * Math.sin(endAngle))}
                                A ${formatNumber(innerR)} ${formatNumber(innerR)} 0 0 0 ${formatNumber(innerR * Math.cos(startAngle))} ${formatNumber(innerR * Math.sin(startAngle))}
                            `;
        };

        // Helper: evenly spaced rainbow color across N items (HSL)
        const computeRainbowColor = (index: number, total: number): string => {
            if (!Number.isFinite(index) || !Number.isFinite(total) || total <= 0) {
                return '#888888';
            }
            const hue = (index / total) * 360; // 0..360
            const saturation = 85; // percent
            const lightness = 55; // percent
            return `hsl(${Math.round(hue)}, ${saturation}%, ${lightness}%)`;
        };

        // Get current month index (0-11)
        const currentMonthIndex = new Date().getMonth();

        //outer months Labels
        months.forEach(({ name }, index) => {
            const pathId = `monthLabelPath-${index}`;
            const isPastMonth = index < currentMonthIndex;
            svg += `
                <text class="rt-month-label-outer" ${isPastMonth ? 'opacity="0.5"' : ''}>
                    <textPath href="#${pathId}" startOffset="0" text-anchor="start">
                        ${name}
                    </textPath>
                </text>
            `;
        });

        // --- Draw Act labels early (below plot labels) into rotatable group later ---

        // First add the progress ring (RAINBOW YEAR PROGRESS)
        // Calculate year progress
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        
        const yearProgress = (now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24 * 365);
        // TEMP TEST: Force full year display to see all colors
        // const yearProgress = 1; // TEMP TEST: Force 100% to display all segments

        // Create progress ring
        const progressRadius = lineInnerRadius + 15;
        const circumference = 2 * Math.PI * progressRadius;
        // const progressLength = circumference * yearProgress; // No longer needed for arc calc
        const currentYearStartAngle = -Math.PI / 2; // Start at 12 o'clock
        const currentYearEndAngle = currentYearStartAngle + (2 * Math.PI * yearProgress);

        // Define rainbow gradients for the segments
        svg += renderProgressRingGradients();

        // Add the base purple circle (provides background for entire ring)
        svg += `
            <circle
                cx="0"
                cy="0"
                r="${progressRadius}"
                class="progress-ring-base"
            />
        `;

         // --- Draw Estimation Arc --- START ---
         const estimateResult = plugin.settings.showEstimate === false ? null : plugin.calculateCompletionEstimate(scenes);

         // --- TEMPORARY DEBUG OVERRIDE FOR QUADRANT TESTING --- START ---
         // Uncomment ONE of the following lines to force the estimated date for testing positioning.
         // Remember to remove or comment out this block when done testing!

         // --- Quadrant Midpoints ---
         // const estimatedCompletionDate = new Date(new Date().getFullYear() + 1, 1, 15); // Feb 15 (Quadrant 4 - Top Right)
         // const estimatedCompletionDate = new Date(new Date().getFullYear() + 1, 4, 15); // May 15 (Quadrant 1 - Bottom Right)
         // const estimatedCompletionDate = new Date(new Date().getFullYear() + 1, 7, 15); // Aug 15 (Quadrant 2 - Bottom Left)
         // const estimatedCompletionDate = new Date(new Date().getFullYear() + 1, 10, 15); // Nov 15 (Quadrant 3 - Top Left)

         // --- Cardinal Directions ---
         // const estimatedCompletionDate = new Date(new Date().getFullYear() + 1, 0, 1);  // Jan 1 (Top, -90 deg)
         // const estimatedCompletionDate = new Date(new Date().getFullYear() + 1, 3, 1);  // Apr 1 (Right, 0 deg)
         // const estimatedCompletionDate = new Date(new Date().getFullYear() + 1, 6, 1);  // Jul 1 (Bottom, 90 deg)
         // const estimatedCompletionDate = new Date(new Date().getFullYear() + 1, 9, 1);  // Oct 1 (Left, 180 deg)
         // --- TEMPORARY DEBUG OVERRIDE FOR QUADRANT TESTING --- END ---

         // Only proceed if estimate calculation was successful
         if (estimateResult) {
             // Use estimateResult.date instead of estimatedCompletionDate
             const estimatedCompletionDate = estimateResult.date;

             const startAngle = -Math.PI/2; // 12 o'clock position

             if (plugin.settings.debug) {
                 plugin.log(`[Timeline Estimate] Calculating arc for date: ${estimatedCompletionDate.toISOString().split('T')[0]}`);
             }
             
             const estimatedYear = estimatedCompletionDate.getFullYear();
             const estimatedMonth = estimatedCompletionDate.getMonth();
             const estimatedDay = estimatedCompletionDate.getDate();
             
             const estimatedDaysInMonth = new Date(estimatedYear, estimatedMonth + 1, 0).getDate();
             const now = new Date(); // Need current time for diff calculations
             const yearsDiff = estimatedCompletionDate.getFullYear() - now.getFullYear();

             // Note: Red circles removed - year indicators now shown in date label instead
             
            if (yearsDiff <= 0) {
                svg += renderEstimationArc({ estimateDate: estimatedCompletionDate, progressRadius });
            }

         }
         // --- Draw Estimation Arc --- END ---

         
        // Month spokes and inner labels
        svg += renderMonthSpokesAndInnerLabels({ months, lineInnerRadius, lineOuterRadius, currentMonthIndex });


        // Draw the year progress ring segments
        svg += renderProgressRing({ progressRadius, yearProgress, currentYearStartAngle, segmentCount: 6 });



        // Target completion tick/marker
        svg += renderTargetDateTick({ plugin, progressRadius, dateToAngle });

        // Create master subplot order before the act loop
        const masterSubplotOrder = (() => {
            // Create a combined set of all subplots from all acts
            const allSubplotsMap = new Map<string, number>();
            
            // Iterate through all acts to gather all subplots
            for (let actIndex = 0; actIndex < NUM_ACTS; actIndex++) {
                Object.entries(scenesByActAndSubplot[actIndex] || {}).forEach(([subplot, scenes]) => {
                    // Add scenes count to existing count or initialize
                    allSubplotsMap.set(subplot, (allSubplotsMap.get(subplot) || 0) + scenes.length);
                });
            }
            
            // Convert map to array of subplot objects
            const subplotCounts = Array.from(allSubplotsMap.entries()).map(([subplot, count]) => ({
                subplot,
                count
            }));

            // Sort subplot, but ensure "Main Plot" or empty subplot is first
            subplotCounts.sort((a, b) => {
                // If either subplot is "Main Plot" or empty, prioritize it
                if (a.subplot === "Main Plot" || !a.subplot) return -1;
                if (b.subplot === "Main Plot" || !b.subplot) return 1;
                // Otherwise, sort by count as before
                return b.count - a.count;
            });

            return subplotCounts.map(item => item.subplot);
        })();

        // Resolver for subplot CSS color variables (Ring 1 = outermost = subplotColors[0])
        const subplotCssColor = (name: string): string => {
            const idx = masterSubplotOrder.indexOf(name);
            if (idx < 0) return '#EFBDEB'; // fallback for not found
            
            // Map subplot index to settings array - outermost ring (Ring 1) uses subplotColors[0]
            const colorIdx = idx % 16; // Direct order: outermost (idx=0) = Ring 1 = subplotColors[0]
            const varName = `--rt-subplot-colors-${colorIdx}`;
            const root = document.documentElement;
            const computed = getComputedStyle(root).getPropertyValue(varName).trim();
            return computed || '#EFBDEB';
        };



        // Synopses at end to be above all other elements
        const synopsesElements: SVGGElement[] = [];
        
        // Create a Map to store grade information by sceneId (NEW)
        const sceneGrades = new Map<string, string>();
        
        scenes.forEach((scene) => {
            // Handle undefined subplot with a default "Main Plot"
            const subplot = scene.subplot && scene.subplot.trim().length > 0 ? scene.subplot : 'Main Plot';
            const subplotIndex = masterSubplotOrder.indexOf(subplot);
            const ring = NUM_RINGS - 1 - subplotIndex;
            
            // Handle undefined actNumber with a default of 1
            const actNumber = scene.actNumber !== undefined ? scene.actNumber : 1;
            
            // Get the scenes for this act and subplot to determine correct index
            const sceneActNumber = scene.actNumber !== undefined ? scene.actNumber : 1;
            const actIndex = sceneActNumber - 1;
            const scenesInActAndSubplot = (scenesByActAndSubplot[actIndex] && scenesByActAndSubplot[actIndex][subplot]) || [];

            // Never generate inner-ring synopses for Plot notes here
            if (scene.itemType === 'Plot') {
                return;
            }

            const filteredScenesForIndex = scenesInActAndSubplot.filter(s => s.itemType !== 'Plot');
            const sceneIndex = filteredScenesForIndex.indexOf(scene);

            const sceneId = makeSceneId(actIndex, ring, sceneIndex, false, false);
            
            // Extract grade from 2beats using helper function
            extractGradeFromScene(scene, sceneId, sceneGrades, plugin);
            
            // Skip content generation for placeholder scenes
            if (!scene.title) {
                return;
            }
            
            // Build ordered subplot to show with synopsis
            const allSceneSubplots = scenes.filter(s => s.path === scene.path).map(s => s.subplot).filter((s): s is string => s !== undefined);
            const sceneSubplot = scene.subplot || 'Main Plot';
            const orderedSubplots = [sceneSubplot, ...allSceneSubplots.filter(s => s !== sceneSubplot)];

            const synopsisElement = buildSynopsis(
                plugin,
                scene,
                sceneId,
                maxTextWidth,
                orderedSubplots,
                (name) => {
                    const idx = masterSubplotOrder.indexOf(name);
                    if (idx < 0) return 0;
                    return idx % 16; // Direct order: outermost (idx=0) = Ring 1 = subplotColors[0]
                }
            );
            synopsesElements.push(synopsisElement);
        });

        // Open rotatable container – scenes and act labels/borders only
        svg += `<g id="timeline-rotatable">`;
        // Track last plot label end-angle per act to prevent overlap when laying out labels
        const lastPlotEndByAct: { [key: string]: number } = {};
        // --- Draw Act labels here so they rotate ---
        const actualOuterRadiusForActs = ringStartRadii[NUM_RINGS - 1] + ringWidths[NUM_RINGS - 1];
        svg += renderActLabels({ NUM_ACTS, outerMostOuterRadius: actualOuterRadiusForActs, actLabelOffset: ACT_LABEL_OFFSET, maxStageColor });

        // Initialize plot beat angles map for Gossamer (clear any stale data from previous render)
        (plugin as any)._plotBeatAngles = new Map();

        // Draw scenes and dummy scenes (existing code remains as is)
        for (let act = 0; act < NUM_ACTS; act++) {
            const totalRings = NUM_RINGS;
            const subplotCount = masterSubplotOrder.length;
            const ringsToUse = Math.min(subplotCount, totalRings);

            for (let ringOffset = 0; ringOffset < ringsToUse; ringOffset++) {
                const ring = totalRings - ringOffset - 1; // Start from the outermost ring
                
                const innerR = ringStartRadii[ring];
                const outerR = innerR + ringWidths[ring];
                
                const startAngle = (act * 2 * Math.PI) / NUM_ACTS - Math.PI / 2;
                const endAngle = ((act + 1) * 2 * Math.PI) / NUM_ACTS - Math.PI / 2;
                
                // Compute which content to show for this ring
                const subplot = masterSubplotOrder[ringOffset];
                const isOuterRing = ringOffset === 0;

                // Special handling: when outer ring all-scenes mode is ON, draw each subplot's scenes
                // in the outer ring using the same angular positions they have in their own subplot rings.
                if (isOuterRing && shouldShowAllScenesInOuterRing(plugin)) {
                    // Build a single combined, manuscript-ordered list of items (unique by path for scenes
                    // and unique by title+act for Plot notes) for this act only.
                    const seenPaths = new Set<string>();
                    const seenPlotKeys = new Set<string>();
                    const combined: Scene[] = [];

                    scenes.forEach(s => {
                        const sAct = s.actNumber !== undefined ? s.actNumber - 1 : 0;
                        if (sAct !== act) return;
                        if (s.itemType === 'Plot') {
                            const pKey = `${String(s.title || '')}::${String(s.actNumber ?? '')}`;
                            if (seenPlotKeys.has(pKey)) return;
                            seenPlotKeys.add(pKey);
                            combined.push(s);
                            } else {
                            const key = s.path || `${s.title || ''}::${String(s.when || '')}`;
                            if (seenPaths.has(key)) return;
                            seenPaths.add(key);
                            combined.push(s);
                            
                            // Extract grade from 2beats for All Scenes mode using helper
                            const sceneIndex = combined.length - 1; // Current index in combined array
                            const allScenesSceneId = makeSceneId(act, NUM_RINGS - 1, sceneIndex, true, true);
                            extractGradeFromScene(s, allScenesSceneId, sceneGrades, plugin);
                        }
                    });

                    // Compute angular positions for all combined items
                    const positions = computePositions(innerR, outerR, startAngle, endAngle, combined);

                    // Stacking removed

                    // Render combined items into the outer ring
                    // Helper to resolve subplot color from CSS variables (Ring 1 = outermost = subplotColors[0])
                    const subplotColorFor = (subplotName: string) => {
                        const idx = masterSubplotOrder.indexOf(subplotName);
                        if (idx < 0) return '#EFBDEB'; // fallback for not found
                        
                        // Map subplot index to settings array - outermost ring (Ring 1) uses subplotColors[0]
                        const colorIdx = idx % 16; // Direct order: outermost (idx=0) = Ring 1 = subplotColors[0]
                        const varName = `--rt-subplot-colors-${colorIdx}`;
                        const computed = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
                        return computed || '#EFBDEB';
                    };

                    // Plot labels will be measured and adjusted after SVG is rendered
                    const plotTextRadius = outerR - PLOT_TITLE_INSET;

                    combined.forEach((scene, idx) => {
                            const { number, text } = parseSceneTitle(scene.title || '', scene.number);
                        const position = positions.get(idx)!;
                            const sceneStartAngle = position.startAngle;
                            const sceneEndAngle = position.endAngle;
                        
                        // Extend plot slices slightly beyond the outer ring for a subtle "poke"
                        const effectiveOuterR = scene.itemType === 'Plot' ? (outerR + 2) : outerR;
                        
                        // Capture exact angles and geometry for Gossamer plot beats
                        if (scene.itemType === 'Plot' && scene.title) {
                            // Strip the scene number prefix (e.g., "1 Opening Image" -> "Opening Image")
                            const titleWithoutNumber = scene.title.replace(/^\s*\d+(?:\.\d+)?\s+/, '').trim();
                            // Use exact title (no normalization) for angle lookup
                            const center = (sceneStartAngle + sceneEndAngle) / 2;
                            (plugin as any)._plotBeatAngles.set(titleWithoutNumber, center);
                            // Also capture slice geometry for gossamer outlines
                            if (!(plugin as any)._plotBeatSlices) (plugin as any)._plotBeatSlices = new Map();
                            (plugin as any)._plotBeatSlices.set(titleWithoutNumber, {
                                startAngle: sceneStartAngle,
                                endAngle: sceneEndAngle,
                                innerR: innerR,
                                outerR: effectiveOuterR
                            });
                        }
                        
                        // Scene titles: fixed inset from the top (outer) boundary of the cell
                        const textPathRadius = Math.max(innerR, outerR - SCENE_TITLE_INSET);

                        const color = scene.itemType === 'Plot' 
                            ? '#E6E6E6' 
                            : getFillForItem(plugin, scene, maxStageColor, PUBLISH_STAGE_COLORS, totalPlotNotes, plotIndexByKey, true, subplotColorFor, true);
                        const arcPath = sceneArcPath(innerR, effectiveOuterR, sceneStartAngle, sceneEndAngle);
                        const sceneId = makeSceneId(act, ring, idx, true, true);
                        
                        // --- Create synopsis for OUTER ring item using matching ID ---
                        try {
                            const allSceneSubplots = scenes.filter(s => s.path === scene.path).map(s => s.subplot).filter((s): s is string => s !== undefined);
                            const sceneSubplot = scene.subplot || 'Main Plot';
                            const orderedSubplots = [sceneSubplot, ...allSceneSubplots.filter(s => s !== sceneSubplot)];
                            const synopsisElOuter = buildSynopsis(
                                plugin,
                                scene,
                                sceneId,
                                maxTextWidth,
                                orderedSubplots,
                                (name) => {
                                    const idx = masterSubplotOrder.indexOf(name);
                                    if (idx < 0) return 0;
                                    return idx % 16; // Direct order: outermost (idx=0) = Ring 1 = subplotColors[0]
                                }
                            );
                            // If this is a Plot note, append Gossamer info if available
                            synopsesElements.push(synopsisElOuter);
                        } catch {}
                        let sceneClasses = 'rt-scene-path';
                        if (scene.path && plugin.openScenePaths.has(scene.path)) sceneClasses += ' rt-scene-is-open';
                        const dyOffset = 0; // keep scene titles exactly on the midline path

                        // Use a single y-axis (radius) for all plot labels; no outward stacking
                        // Plot titles are inset a fixed amount from the outer scene edge
                        const plotTextRadius = outerR - PLOT_TITLE_INSET;

                        // Strip numeric prefix for plot titles
                        const rawTitleFull = (() => {
                            const full = scene.title || '';
                            const m = full.match(/^(?:\s*\d+(?:\.\d+)?\s+)?(.+)/);
                            return m ? m[1] : full;
                        })();
                        
                        // Initial rendering uses a generous estimate - will be adjusted after DOM insertion
                        const estimatedWidth = estimatePixelsFromTitle(rawTitleFull, PLOT_FONT_PX, ESTIMATE_FUDGE_RENDER, PADDING_RENDER_PX);
                        const labelStartAngle = sceneStartAngle;
                        const labelEndAngle = sceneStartAngle + (estimatedWidth / plotTextRadius);
                        const desiredAngleArc = labelEndAngle - labelStartAngle;
                        const largeArcFlag = desiredAngleArc > Math.PI ? 1 : 0;

                        const subplotIdxAttr = (() => {
                            const name = scene.subplot && scene.subplot.trim().length > 0 ? scene.subplot : 'Main Plot';
                            const i = Math.max(0, masterSubplotOrder.indexOf(name));
                            return i;
                        })();

                        // No separator needed; spacing handled in positioning
                        
                        // Get publish stage color for plot slices
                        const plotStrokeAttr = (() => {
                            if (scene.itemType === 'Plot') {
                                const publishStage = scene['Publish Stage'] || 'Zero';
                                const stageColor = PUBLISH_STAGE_COLORS[publishStage as keyof typeof PUBLISH_STAGE_COLORS] || PUBLISH_STAGE_COLORS.Zero;
                                return `stroke="${stageColor}" stroke-width="2"`;
                            }
                            return '';
                        })();

                        svg += `
                        ${renderSceneGroup({ scene, act, ring, idx, innerR, outerR: effectiveOuterR, startAngle: sceneStartAngle, endAngle: sceneEndAngle, subplotIdxAttr })}
                            <path id="${sceneId}"
                                  d="${arcPath}" 
                                  fill="${color}" 
                                  ${plotStrokeAttr}
                                  class="${sceneClasses}"/>
                            ${scene.itemType === 'Plot' ? `` : ``}

                            ${scene.itemType !== 'Plot' ? `
                            <path id="textPath-${act}-${ring}-outer-${idx}" 
                                  d="M ${formatNumber(textPathRadius * Math.cos(sceneStartAngle + TEXTPATH_START_NUDGE_RAD))} ${formatNumber(textPathRadius * Math.sin(sceneStartAngle + TEXTPATH_START_NUDGE_RAD))} 
                                     A ${formatNumber(textPathRadius)} ${formatNumber(textPathRadius)} 0 0 1 ${formatNumber(textPathRadius * Math.cos(sceneEndAngle))} ${formatNumber(textPathRadius * Math.sin(sceneEndAngle))}" 
                                  fill="none"/>
                            <text class="rt-scene-title${scene.path && plugin.openScenePaths.has(scene.path) ? ' rt-scene-is-open' : ''}" dy="${dyOffset}" data-scene-id="${sceneId}">
                                <textPath href="#textPath-${act}-${ring}-outer-${idx}" startOffset="4">
                                    ${text}
                                </textPath>
                            </text>` : `
                            <path id="plot-label-arc-${act}-${ring}-outer-${idx}" 
                                  d="M ${formatNumber(plotTextRadius * Math.cos(labelStartAngle))} ${formatNumber(plotTextRadius * Math.sin(labelStartAngle))} 
                                     A ${formatNumber(plotTextRadius)} ${formatNumber(plotTextRadius)} 0 ${largeArcFlag} 1 ${formatNumber(plotTextRadius * Math.cos(labelEndAngle))} ${formatNumber(plotTextRadius * Math.sin(labelEndAngle))}" 
                                  data-slice-start="${formatNumber(sceneStartAngle)}" data-radius="${formatNumber(plotTextRadius)}" fill="none"/>
                            <text class="rt-plot-title" dy="-3">
                                <textPath href="#plot-label-arc-${act}-${ring}-outer-${idx}" startOffset="2">
                                    ${escapeXml(rawTitleFull)}
                                </textPath>
                            </text>
                            `}
                        </g>`;

                        // Number squares are drawn in a single dedicated pass for the outer ring below
                    });

                    // Fill any remaining angular space on the outer ring with a void cell
                    const totalUsedSpace = Array.from(positions.values()).reduce((sum, p) => sum + p.angularSize, 0);
                    const totalAngularSpace = endAngle - startAngle;
                    const remainingVoidSpace = totalAngularSpace - totalUsedSpace;
                    if (remainingVoidSpace > 0.001) {
                        const voidStartAngle = startAngle + totalUsedSpace;
                        const voidEndAngle = endAngle;
                        svg += renderVoidCellPath(innerR, outerR, voidStartAngle, voidEndAngle);
                    }

                    continue; // Done with outer ring for this act
                }

                // Inner rings (or outer when toggle off): use subplot-specific scenes
                const currentScenes = subplot ? (scenesByActAndSubplot[act][subplot] || []) : [];

                if (currentScenes && currentScenes.length > 0) {

                    if (currentScenes && currentScenes.length > 0) {
                        // Separate Plot notes and Scene notes for different sizing
                        // Suppress Plot notes for ALL rings unless they should be rendered
                        const shouldShowBeats = shouldRenderStoryBeats(plugin);
                        const isOuterRingAllScenes = isOuterRing && shouldShowAllScenesInOuterRing(plugin);
                        const isAllScenesMode = shouldShowAllScenesInOuterRing(plugin);
                        const effectiveScenes = currentScenes.filter(scene => scene.itemType !== "Plot");
                        
                        // Compute positions for this ring using shared helper
                        const scenePositions = computePositions(innerR, outerR, startAngle, endAngle, effectiveScenes);


            
                        effectiveScenes.forEach((scene, idx) => {
                            const { number, text } = parseSceneTitle(scene.title || '', scene.number);
                            const position = scenePositions.get(idx);
                            if (!position) return; // Skip if position is undefined
                            const sceneStartAngle = position.startAngle;
                            const sceneEndAngle = position.endAngle;
                            // Scene titles: fixed inset from the top (outer) boundary of the cell
                            const textPathRadius = Math.max(innerR, outerR - SCENE_TITLE_INSET);
            
                            // Determine the color of a scene based on its status and due date
                            const color = (() => {
                                const statusList = Array.isArray(scene.status) ? scene.status : [scene.status];
                                const norm = normalizeStatus(statusList[0]);
                                
                                // Get the publish stage for pattern selection
                                const publishStage = scene["Publish Stage"] || 'Zero';
                                
                                // If status is empty/undefined/null, treat it as "Todo" with plaid pattern
                                if (!norm) {
                                    return `url(#plaidTodo${publishStage})`;
                                }
                                
                                if (norm === 'Completed') {
                                    // In all-scenes mode, tint inner-ring scenes (non–Main Plot) by subplot color
                                    if (isAllScenesMode) {
                                        const subplotName = scene.subplot && scene.subplot.trim().length > 0 ? scene.subplot : 'Main Plot';
                                        if (subplotName !== 'Main Plot') {
                                            return subplotCssColor(subplotName);
                                        }
                                    }
                                    const stageColor = PUBLISH_STAGE_COLORS[publishStage as keyof typeof PUBLISH_STAGE_COLORS] || PUBLISH_STAGE_COLORS.Zero;
                                    return stageColor;
                                }
                                
                                // Check due date before checking working/todo
                                if (scene.due && isOverdueDateString(scene.due)) {
                                    return STATUS_COLORS.Due; // Return Due color if overdue
                                }
                                
                                // If not overdue (or no due date), check for working/todo status
                                if (norm === 'Working') {
                                    return `url(#plaidWorking${publishStage})`;
                                }
                                if (norm === 'Todo') {
                                    return `url(#plaidTodo${publishStage})`;
                                }
                                
                                // Fallback to other status colors or Todo
                                return STATUS_COLORS[statusList[0] as keyof typeof STATUS_COLORS] || STATUS_COLORS.Todo;
                            })();
            
                        
                            // Construct the arc path for the scene
                            const arcPath = sceneArcPath(innerR, outerR, sceneStartAngle, sceneEndAngle);
            
                            const sceneId = `scene-path-${act}-${ring}-${idx}`;

                            // Derive subplot index for matching synopsis color mapping
                            const subplotIdxAttr = (() => {
                                const name = scene.subplot && scene.subplot.trim().length > 0 ? scene.subplot : 'Main Plot';
                                const i = Math.max(0, masterSubplotOrder.indexOf(name));
                                return i;
                            })();
            
                            // Apply appropriate CSS classes based on open status and search match
                            let sceneClasses = "rt-scene-path";
                            if (scene.path && plugin.openScenePaths.has(scene.path)) sceneClasses += " rt-scene-is-open";
                            // Don't add search-result class to scene paths anymore
            
                            // In createTimelineSVG method, replace the font size calculation with a fixed size:
                            const fontSize = 18; // Fixed font size for all rings
                            // No vertical offset; follow textPath baseline
            
                            // (No plot labels rendered in inner rings)
            
                            svg += `
                            ${renderSceneGroup({ scene, act, ring, idx, innerR, outerR, startAngle: sceneStartAngle, endAngle: sceneEndAngle, subplotIdxAttr })}
                                <path id="${sceneId}"
                                      d="${arcPath}" 
                                      fill="${color}" 
                                      class="${sceneClasses}"/>

                                <!-- Scene title path (using only the text part) - Skip for Plot notes -->
                                ${scene.itemType !== "Plot" ? `
                                <path id="textPath-${act}-${ring}-${idx}" 
                                      d="M ${formatNumber(textPathRadius * Math.cos(sceneStartAngle + TEXTPATH_START_NUDGE_RAD))} ${formatNumber(textPathRadius * Math.sin(sceneStartAngle + TEXTPATH_START_NUDGE_RAD))} 
                                         A ${formatNumber(textPathRadius)} ${formatNumber(textPathRadius)} 0 0 1 ${formatNumber(textPathRadius * Math.cos(sceneEndAngle))} ${formatNumber(textPathRadius * Math.sin(sceneEndAngle))}" 
                                      fill="none"/>
                                <text class="rt-scene-title${scene.path && plugin.openScenePaths.has(scene.path) ? ' rt-scene-is-open' : ''}" data-scene-id="${sceneId}">
                                    <textPath href="#textPath-${act}-${ring}-${idx}" startOffset="4">
                                        ${text}
                                    </textPath>
                                </text>` : `

                                `}
                            </g>`;
                        });
                        
                        // Fill any remaining angular space with gray void cells
                        const totalUsedSpace = Array.from(scenePositions.values()).reduce((sum, p) => sum + p.angularSize, 0);
                        const totalAngularSpace = endAngle - startAngle;
                        const remainingVoidSpace = totalAngularSpace - totalUsedSpace;
                        
                        if (remainingVoidSpace > 0.001) {
                            const voidStartAngle = startAngle + totalUsedSpace;
                            const voidEndAngle = endAngle;
                            const voidArcPath = sceneArcPath(innerR, outerR, voidStartAngle, voidEndAngle);
                            svg += `<path d="${voidArcPath}" class="rt-void-cell"/>`;
                        }
                    } else {
                        // Empty subplot ring. When outer-ring-all-scenes is ON, do NOT place Plot notes here.
                        if (!shouldShowAllScenesInOuterRing(plugin)) {
                            // Only in non-all-scenes mode do we place Plot notes in empty rings
                        const plotNotesInSubplot = plotsBySubplot.get(subplot) || [];
                        if (plotNotesInSubplot.length > 0) {
                            const middleRadius = (innerR + outerR) / 2;
                            const plotAngularWidth = PLOT_PIXEL_WIDTH / middleRadius;
                            const totalPlotSpace = plotNotesInSubplot.length * plotAngularWidth;
                            const remainingSpace = (endAngle - startAngle) - totalPlotSpace;
                            let currentAngle = startAngle;
                            plotNotesInSubplot.forEach((plotNote, idx) => {
                                const plotStartAngle = currentAngle;
                                const plotEndAngle = currentAngle + plotAngularWidth;
                                const plotIndex = plotIndexByKey.get(`${plotNote.title}::${plotNote.actNumber}`) ?? 0;
                                const totalPlots = totalPlotNotes;
                                const maxAdjustment = 40;
                                const adjustmentRange = maxAdjustment * 2;
                                const position = totalPlots > 1 ? plotIndex / (totalPlots - 1) : 0.5;
                                const adjustment = (position * adjustmentRange) - maxAdjustment;
                                const plotColor = adjustment < 0 
                                    ? plugin.darkenColor(maxStageColor, Math.abs(adjustment))
                                    : plugin.lightenColor(maxStageColor, adjustment);
                                const sceneId = `scene-path-${act}-${ring}-${idx}`;
                                svg += renderPlotSlice({ act, ring, idx, innerR, outerR, startAngle: plotStartAngle, endAngle: plotEndAngle, sceneId, plot: plotNote });
                                currentAngle += plotAngularWidth;
                            });
                            if (remainingSpace > 0.001) {
                                svg += renderVoidCellPath(innerR, outerR, currentAngle, endAngle);
                            }
                        } else {
                            svg += renderVoidCellPath(innerR, outerR, startAngle, endAngle);
                            }
                        } else {
                            // All-scenes mode: just fill empty ring with a void cell
                            svg += renderVoidCellPath(innerR, outerR, startAngle, endAngle);
                        }
                    }
                } else {
                    // Empty subplot code
                    svg += renderVoidCellPath(innerR, outerR, startAngle, endAngle);
                }
            }
        }

        // After all scenes are drawn, add just the act borders (vertical lines only)
        svg += renderActBorders({ NUM_ACTS, innerRadius, outerRadius });

        // Calculate the actual outermost outerRadius (first ring's outer edge)
        const actualOuterRadius = ringStartRadii[NUM_RINGS - 1] + ringWidths[NUM_RINGS - 1];
       
        // (Act labels moved earlier to be under plot labels)

        // Add color key with decorative elements
        const keyX = size/2 - 200; // Position from right edge
        const keyY = -size/2 + 50; // Position from top
        const swatchSize = 20;
        const textOffset = 30;
        const lineHeight = GRID_LINE_HEIGHT; // Reduced for tighter spacing

        // Calculate the number of scenes for each status using a Set to track unique scenes
        // Filter out Plot items, only count Scene items
        const sceneNotesOnly = scenes.filter(scene => scene.itemType !== "Plot");
        const processedScenes = new Set<string>(); // Track scenes by their path
        const statusCounts = sceneNotesOnly.reduce((acc, scene) => {
            // Skip if we've already processed this scene
            if (scene.path && processedScenes.has(scene.path)) {
                return acc;
            }
            
            // Mark scene as processed
            if (scene.path) {
                processedScenes.add(scene.path);
            }
            
            const normalizedStatus = scene.status?.toString().trim().toLowerCase() || '';
            
            // If status is empty/undefined/null, count it as "Todo"
            if (!normalizedStatus || normalizedStatus === '') {
                acc["Todo"] = (acc["Todo"] || 0) + 1;
                return acc;
            }
            
            if (normalizedStatus === "complete") {
                // For completed scenes, count by Publish Stage
                const publishStage = scene["Publish Stage"] || 'Zero';
                // Use the publishStage directly with type safety
                const validStage = publishStage as keyof typeof PUBLISH_STAGE_COLORS;
                acc[validStage] = (acc[validStage] || 0) + 1;
            } else if (scene.due) {
                 // Parse date directly from string components
                const originalDueString = scene.due;
                const parts = originalDueString.split('-').map(Number);

                // Ensure we have valid parts before proceeding
                if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
                    const dueYear = parts[0];
                    const dueMonth = parts[1] - 1; // Convert 1-based month
                    const dueDay = parts[2];
                    
                    // Get today's date parts
                    const today = new Date();
                    const todayYear = today.getFullYear();
                    const todayMonth = today.getMonth();
                    const todayDay = today.getDate();
                    
                    // Compare dates by parts - overdue only if date is strictly before today
                    let isOverdue = false;
                    if (dueYear < todayYear) {
                        isOverdue = true;
                    } else if (dueYear === todayYear) {
                        if (dueMonth < todayMonth) {
                            isOverdue = true;
                        } else if (dueMonth === todayMonth) {
                            if (dueDay < todayDay) {
                                isOverdue = true;
                            }
                            // Same day is NOT overdue
                        }
                    }
                    
                    if (isOverdue) {
                        // Non-complete scenes that are past due date are counted as Due
                        acc["Due"] = (acc["Due"] || 0) + 1;
                    } else {
                        // For files due today or in the future, count them by their status
                        let statusKey = "Todo"; // Default to Todo
                        if (scene.status) {
                            if (Array.isArray(scene.status) && scene.status.length > 0) {
                                statusKey = String(scene.status[0]);
                            } else if (typeof scene.status === 'string') {
                                statusKey = scene.status;
                            }
                        }
                        acc[statusKey] = (acc[statusKey] || 0) + 1;
                    }
                } else {
                    // Handle invalid date format
                    if (plugin.settings.debug) {
                        plugin.log(`WARN: Invalid date format in status count: ${originalDueString}`);
                    }
                    // Count scenes with invalid due dates by status
                    let statusKey = "Todo"; 
                    if (scene.status) {
                        if (Array.isArray(scene.status) && scene.status.length > 0) {
                            statusKey = String(scene.status[0]);
                        } else if (typeof scene.status === 'string') {
                            statusKey = scene.status;
                        }
                    }
                    acc[statusKey] = (acc[statusKey] || 0) + 1;
                }
            } else {
                // All other scenes (no due date) are counted by their status
                let statusKey = "Todo"; // Default to Todo
                if (scene.status) {
                    if (Array.isArray(scene.status) && scene.status.length > 0) {
                        statusKey = String(scene.status[0]);
                    } else if (typeof scene.status === 'string') {
                        statusKey = scene.status;
                    }
                }
                acc[statusKey] = (acc[statusKey] || 0) + 1;
            }
            return acc;
        }, {} as Record<string, number>);

        // Save status counts for completion estimate
        plugin.latestStatusCounts = statusCounts;

        // Add center color key
        const centerRadius = innerRadius * 0.7; // Slightly smaller than innerRadius
        const centerKeySize = 20; // Size of color swatches
        const centerLineHeight = 44; // 36px icon/square + 4px top/bottom padding for breathing room

        // Separate stage colors and status colors
        const stageColorEntries = Object.entries(PUBLISH_STAGE_COLORS);
        const ICON_ID_MAP: Record<string, string> = {
            Zero: 'icon-circle-slash',
            Author: 'icon-smile',
            House: 'icon-house',
            Press: 'icon-printer'
        };
        const statusColorEntries = Object.entries(STATUS_COLORS)
            .filter(([status]) => status !== 'Empty' && status !== 'Complete');

        // Calculate heights for alignment
        const maxEntries = Math.max(stageColorEntries.length, statusColorEntries.length);
        const totalHeight = maxEntries * centerLineHeight;
        const startY = -totalHeight / 2 + centerLineHeight / 2;

        // --- Stage × Status Grid (center) ---
        // Compute per-stage per-status counts (Scenes only, unique by path)
        const stagesForGrid = [...STAGES_FOR_GRID];
        const statusesForGrid = [...STATUSES_FOR_GRID];
        const processedPathsForGrid = new Set<string>();
        const gridCounts: Record<string, Record<string, number>> = {};
        stagesForGrid.forEach(s => { gridCounts[s] = { Todo: 0, Working: 0, Due: 0, Completed: 0 }; });

        scenes.forEach(scene => {
            if (scene.itemType === "Plot") return;
            if (!scene.path || processedPathsForGrid.has(scene.path)) return;
            processedPathsForGrid.add(scene.path);

            const rawStage = scene["Publish Stage"];
            const stageKey = (STAGES_FOR_GRID as readonly string[]).includes(rawStage as string) ? (rawStage as typeof STAGES_FOR_GRID[number]) : 'Zero';

            const normalized = normalizeStatus(scene.status);
            let bucket: string = 'Todo';
            if (normalized === 'Completed') {
                bucket = 'Completed';
            } else if (scene.due && isOverdueDateString(scene.due)) {
                bucket = 'Due';
            } else if (normalized) {
                bucket = normalized;
            }

            if (!(bucket in gridCounts[stageKey])) {
                // Coerce unexpected statuses into Todo
                bucket = 'Todo';
            }
            gridCounts[stageKey][bucket] += 1;
        });

        // Layout for grid
        const cellBase = GRID_CELL_BASE; // base size
        const cellWidth = Math.round(cellBase * 1.5) + GRID_CELL_WIDTH_EXTRA;  // widen cells further so horizontal gap can be 2px
        const cellHeight = cellBase; // restore original height
        const cellGapY = GRID_CELL_GAP_Y;   // tighter vertical gap
        const cellGapX = GRID_CELL_GAP_X; // exact horizontal gap between rectangles
        const gridWidth = statusesForGrid.length * cellWidth + (statusesForGrid.length - 1) * cellGapX;
        const gridHeight = stagesForGrid.length * cellHeight + (stagesForGrid.length - 1) * cellGapY;
        const startXGrid = -gridWidth / 2;
        const startYGrid = -gridHeight / 2;

        // Determine total scenes baseline for alpha scaling
        // Use the larger of: unique Scene files count OR max numeric scene prefix in titles
        const uniqueSceneCount = processedPathsForGrid.size;
        const seenTitlePaths = new Set<string>();
        let maxSceneNumber = 0;
        scenes.forEach(scene => {
            if (scene.itemType === 'Plot') return;
            if (!scene.path || seenTitlePaths.has(scene.path)) return;
            seenTitlePaths.add(scene.path);
            const { number } = parseSceneTitle(scene.title || '', scene.number);
            if (number && typeof number === 'string') {
                const asNum = Number(number.replace(/\D/g, ''));
                if (!isNaN(asNum)) maxSceneNumber = Math.max(maxSceneNumber, asNum);
            }
        });
        const baseTotalScenes = Math.max(uniqueSceneCount, maxSceneNumber);

        const currentYearLabel = String(new Date().getFullYear());
        const headerY = startYGrid - (cellGapY + GRID_HEADER_OFFSET_Y);

        // Calculate estimated total scenes: max(unique scene files, highest numeric prefix from titles)
        const uniqueScenesCount = processedPathsForGrid.size;
        const seenForMax = new Set<string>();
        let highestPrefixNumber = 0;
        scenes.forEach(scene => {
            if (scene.itemType === 'Plot') return;
            if (!scene.path || seenForMax.has(scene.path)) return;
            seenForMax.add(scene.path);
            const { number } = parseSceneTitle(scene.title || '', scene.number);
            if (number) {
                const n = parseFloat(String(number));
                if (!isNaN(n)) {
                    highestPrefixNumber = Math.max(highestPrefixNumber, n);
                }
            }
        });
        const estimatedTotalScenes = Math.max(uniqueScenesCount, Math.floor(highestPrefixNumber));

        // Determine the most advanced stage index present in the grid
        let maxStageIdxForGrid = -1;
        for (let i = 0; i < stagesForGrid.length; i++) {
            const rc = gridCounts[stagesForGrid[i]];
            const rowTotal = (rc.Todo || 0) + (rc.Working || 0) + (rc.Due || 0) + (rc.Completed || 0);
            if (rowTotal > 0) maxStageIdxForGrid = i;
        }

        // Helper: stage completion for grid row
        const isStageCompleteForGridRow = (rowIndex: number, gridCounts: Record<string, Record<string, number>>, stages: string[], maxStageIdxForGrid: number): boolean => {
            const stage = stages[rowIndex];
            const rc = gridCounts[stage];
            const rowTotal = (rc.Todo || 0) + (rc.Working || 0) + (rc.Due || 0) + (rc.Completed || 0);
            return rowTotal === 0 && (maxStageIdxForGrid > rowIndex);
        };

        // Helper: render a grid cell rect (no icon)
        const renderGridCell = (stage: string, status: string, x: number, y: number, count: number, cellWidth: number, cellHeight: number): string => {
            let fillAttr = '';
            if (status === 'Completed') {
                const solid = (PUBLISH_STAGE_COLORS[stage as keyof typeof PUBLISH_STAGE_COLORS] || '#888888');
                fillAttr = `fill="${solid}"`;
            } else if (status === 'Working') {
                fillAttr = `fill="url(#plaidWorking${stage})"`;
            } else if (status === 'Todo') {
                fillAttr = `fill="url(#plaidTodo${stage})"`;
            } else if (status === 'Due') {
                fillAttr = `fill="var(--rt-color-due)"`;
            } else {
                fillAttr = `fill="#888888"`;
            }
            const cellOpacity = count <= 0 ? 0.10 : 1;
            return `
                <g transform="translate(${x}, ${y})">
                    <rect x="0" y="0" width="${cellWidth}" height="${cellHeight}" ${fillAttr} fill-opacity="${cellOpacity}">
                        ${count > 0 ? `<title>${stage} • ${status}: ${count}</title>` : ''}
                    </rect>
                    ${status === 'Completed' && count > 0 ? `<text x="2" y="${cellHeight - 3}" text-anchor="start" dominant-baseline="alphabetic" class="grid-completed-count">${count}</text>` : ''}
                </g>
            `;
        };

        svg += renderCenterGrid({
            statusesForGrid,
            stagesForGrid,
            gridCounts,
            PUBLISH_STAGE_COLORS,
            currentYearLabel,
            estimatedTotalScenes,
            startXGrid,
            startYGrid,
            cellWidth,
            cellHeight,
            cellGapX,
            cellGapY,
            headerY,
            stageTooltips: STAGE_HEADER_TOOLTIPS,
            statusTooltips: STATUS_HEADER_TOOLTIPS,
        });

        // Add tick mark and label for the estimated completion date if available
        // (Moved here to draw AFTER center stats so it appears on top)
        if (estimateResult) {
            svg += renderEstimatedDateElements({ estimateDate: estimateResult.date, progressRadius });
        }

        // Subplot label background layer
        svg += `<g class="background-layer">`;
        svg += renderSubplotLabels({ NUM_RINGS, ringStartRadii, ringWidths, masterSubplotOrder });
        svg += `</g>`;

        // Add number squares after background layer but before synopses
        if (shouldShowAllScenesInOuterRing(plugin)) {
            // In outer-ring-all-scenes mode, draw number squares for ALL rings
            
        svg += `<g class="rt-number-squares">`;
            
            // First, draw squares for the outer ring (all scenes combined)
            const ringOuter = NUM_RINGS - 1;
            const innerROuter = ringStartRadii[ringOuter];
            const outerROuter = innerROuter + ringWidths[ringOuter];
            const squareRadiusOuter = (innerROuter + outerROuter) / 2;

            for (let act = 0; act < NUM_ACTS; act++) {
                
                const startAngle = (act * 2 * Math.PI) / NUM_ACTS - Math.PI / 2;
                const endAngle = ((act + 1) * 2 * Math.PI) / NUM_ACTS - Math.PI / 2;

                // Build combined list for this act (unique scenes by path, unique plots by title+act)
                const seenPaths = new Set<string>();
                const seenPlotKeys = new Set<string>();
                const combined: Scene[] = [];

                scenes.forEach(s => {
                    const sAct = s.actNumber !== undefined ? s.actNumber - 1 : 0;
                    if (sAct !== act) return;
                    if (s.itemType === 'Plot') {
                        const pKey = `${String(s.title || '')}::${String(s.actNumber ?? '')}`;
                        if (seenPlotKeys.has(pKey)) return;
                        seenPlotKeys.add(pKey);
                        combined.push(s);
                    } else {
                        const key = s.path || `${s.title || ''}::${String(s.when || '')}`;
                        if (seenPaths.has(key)) return;
                        seenPaths.add(key);
                        combined.push(s);
                    }
                });



                // Positions derived from shared geometry
                const positionsDetailed = computePositions(innerROuter, outerROuter, startAngle, endAngle, combined);
                const positions = new Map<number, { startAngle: number; endAngle: number }>();
                positionsDetailed.forEach((p, i) => positions.set(i, { startAngle: p.startAngle, endAngle: p.endAngle }));

                // Draw squares for non-Plot scenes that have a number
                svg += renderOuterRingNumberSquares({ plugin, act, ringOuter, squareRadiusOuter, positions, combined, sceneGrades });
            }
            
            // Then, draw squares for inner subplot rings (excluding Main Plot since it's on outer ring)
            
            svg += renderInnerRingsNumberSquaresAllScenes({ plugin, NUM_RINGS, masterSubplotOrder, ringStartRadii, ringWidths, scenesByActAndSubplot, scenes, sceneGrades });
            
            svg += `</g>`;
        } else if (!shouldShowAllScenesInOuterRing(plugin)) {
            svg += renderNumberSquaresStandard({ plugin, NUM_RINGS, masterSubplotOrder, ringStartRadii, ringWidths, scenesByActAndSubplot, scenes, sceneGrades, sceneNumbersMap });
        }
        
        // Close rotatable container
        svg += `</g>`;
        
        // Serialize synopses to string and store HTML for later insertion
        const synopsisHTML = serializeSynopsesToString(synopsesElements);

        // --- Gossamer momentum layer ---
        {
            // Only render Gossamer layer if we're in Gossamer mode
            // Check if any view is in gossamer mode
            // SAFE: any type used for accessing app property on PluginRendererFacade
            const views = (plugin as any).app.workspace.getLeavesOfType('radial-timeline');
            const isGossamerMode = views.some((leaf: { view: { currentMode?: string } }) => {
                const view = leaf.view as { currentMode?: string };
                return view?.currentMode === 'gossamer';
            });

            if (isGossamerMode) {
                // Map 0–100 to a band that aligns with darker grid lines: use innerRadius for 0 and actualOuterRadius for 100
                const polar = { innerRadius, outerRadius: actualOuterRadius };
                // Calculate the inner radius of the outer ring (where plot slices begin)
                const outerRingInnerRadius = ringStartRadii[NUM_RINGS - 1];
                const run = (plugin as any)._gossamerLastRun || null;

                // Collect actual angles from rendered plot slices (set during outer ring rendering loop above)
                const anglesByBeat = (plugin as any)._plotBeatAngles || new Map<string, number>();

                // Map beat names to their Beat note paths to enable dot click/open
                const beatPathByName = new Map<string, string>();
                scenes.forEach(s => {
                    if (s.itemType !== 'Plot' || !s.title || !s.path) return;
                    const titleWithoutNumber = s.title.replace(/^\s*\d+(?:\.\d+)?\s+/, '').trim();
                    beatPathByName.set(titleWithoutNumber, s.path);
                });

                // Map beat names to their publish stage colors for gossamer dots and spokes
                const publishStageColorByBeat = new Map<string, string>();
                scenes.forEach(s => {
                    if (s.itemType !== 'Plot' || !s.title) return;
                    const titleWithoutNumber = s.title.replace(/^\s*\d+(?:\.\d+)?\s+/, '').trim();
                    const publishStage = s['Publish Stage'] || 'Zero';
                    const stageColor = PUBLISH_STAGE_COLORS[publishStage as keyof typeof PUBLISH_STAGE_COLORS] || PUBLISH_STAGE_COLORS.Zero;
                    publishStageColorByBeat.set(titleWithoutNumber, stageColor);
                });

                // Collect beat slice geometry from rendered plot slices (set during outer ring rendering)
                const beatSlicesByName = (plugin as any)._plotBeatSlices || new Map();

                // Render month/act spokes BEFORE gossamer layer so they appear on top of scenes but behind gossamer plots
                svg += renderGossamerMonthSpokes({ innerRadius, outerRadius: actualOuterRadius });

                // Get historical runs and min/max band from plugin
                const historicalRuns = (plugin as any)._gossamerHistoricalRuns || [];
                const minMax = (plugin as any)._gossamerMinMax || null;

                // Render gossamer layer with all runs and band AFTER spokes so plots appear on top
                const layer = renderGossamerLayer(
                    scenes,
                    run,
                    polar,
                    anglesByBeat.size ? anglesByBeat : undefined,
                    beatPathByName,
                    historicalRuns, // Historical runs (Gossamer2-5)
                    minMax, // Min/max band
                    outerRingInnerRadius,
                    publishStageColorByBeat,
                    beatSlicesByName
                );
                if (layer) svg += layer;
            }
        }

        // Add synopses LAST so they appear on top of everything (including gossamer plots)
        svg += synopsisHTML;

        // Close static root container
        svg += `</g>`;

        // Add rotation toggle control (non-rotating UI), positioned above top edge (Act 2 marker vicinity)
        // Place the button near the Act 2 label (start of Act 2 boundary) and slightly outside along local y-axis
        const act2BaseAngle = (1 * 2 * Math.PI) / NUM_ACTS - Math.PI / 2; // Act 2 start (π/6 ≈ 30°)
        const act2Angle = act2BaseAngle; // use exact axis angle; no label offset
        const arrowRadius = actualOuterRadius + 46; // +3px further outward along local y-axis
        // Fine-tune: adjust to a net -0.225° from the axis
        const arrowAngleAdjust = -(0.60 * Math.PI) / 180; // -0.225° in radians total
        const arrowAngle = act2Angle + arrowAngleAdjust;
        const arrowX = formatNumber(arrowRadius * Math.cos(arrowAngle));
        const arrowY = formatNumber(arrowRadius * Math.sin(arrowAngle));
        const arrowRotateDeg = (act2BaseAngle + Math.PI / 2) * 180 / Math.PI - 90; // rotate CCW 90° from radial alignment
        svg += `
            <g id="rotation-toggle" class="rotation-toggle" transform="translate(${arrowX}, ${arrowY}) rotate(${formatNumber(arrowRotateDeg)})">
                <use id="rotation-arrow-up" class="arrow-icon" href="#icon-arrow-up-from-line" x="-14.4" y="-14.4" width="26" height="26" />
                <use id="rotation-arrow-down" class="arrow-icon is-hidden" href="#icon-arrow-down-from-line" x="-14.4" y="-14.4" width="26" height="26" />
                <rect x="-18" y="-18" width="36" height="36" fill="transparent" pointer-events="all">
                    <title>Rotate timeline</title>
                </rect>
            </g>
        `;

        // Add Chronologue timeline arc if in Chronologue mode
        if ((plugin as any).settings.currentMode === 'chronologue') {
            const chronologueArc = renderChronologueTimelineArc(scenes, outerRadius);
            svg += chronologueArc;
        }

        // Add JavaScript to handle synopsis visibility
        const scriptSection = ``;

        // If not in debug mode, close SVG normally
        svg += `${scriptSection}</svg>`;

        const generatedSvgString = svg; // Assuming svg holds the final string

        // Find the max stage color (assuming maxStageColor variable exists here)
        // const maxStageColor = ... // Needs to be defined/calculated earlier

        // Return both the string and the color
        return { svgString: generatedSvgString, maxStageColor: maxStageColor };
    }
