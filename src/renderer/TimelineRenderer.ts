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

// STATUS_COLORS and SceneNumberInfo now imported from constants

// Stage header tooltips (used for grid row headers Z/A/H/P)
const STAGE_HEADER_TOOLTIPS: Record<string, string> = {
  Zero: 'Zero stage — The raw first draft. Unpolished ideas on the page, no edits yet.',
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

     // px inward from outer scene edge for plot beats titles
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
            : []),
        '\u00A0'
    ];
    if (scene.itemType !== 'Plot') {
        const rawSubplots = orderedSubplots.join(', ');
        contentLines.push(rawSubplots);
        const rawCharacters = (scene.Character || []).join(', ');
        contentLines.push(rawCharacters);
    }
    const filtered = contentLines.filter(line => line && line.trim() !== '\u00A0');
    // Pass resolver so SynopsisManager can map each subplot name to the same CSS var index used in rings
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
    
        // Calculate total available space
        const availableSpace = outerRadius - innerRadius;
    
        // Set the reduction factor for ring widths (if you want equal widths, set reductionFactor to 1)
        const reductionFactor = 1; // For equal ring widths
        const N = NUM_RINGS;
    
        // Calculate the sum of the geometric series (simplifies to N when reductionFactor is 1)
        const sumOfSeries = (reductionFactor === 1) ? N : (1 - Math.pow(reductionFactor, N)) / (1 - reductionFactor);
    
        // Calculate the initial ring width to fill the available space
        const initialRingWidth = availableSpace / sumOfSeries;
    
        // Calculate each ring's width
        const ringWidths = Array.from({ length: N }, (_, i) => initialRingWidth * Math.pow(reductionFactor, i));
    
        // Calculate the start radii for each ring
        const ringStartRadii = ringWidths.reduce((acc, width, i) => {
            const previousRadius = i === 0 ? innerRadius : acc[i - 1] + ringWidths[i - 1];
            acc.push(previousRadius);
            return acc;
        }, [] as number[]);
    
        // Months radius outer and inner
        const lineInnerRadius = ringStartRadii[0] - 20;
        // Month tick ring sits a fixed offset from the outer scene edge
        const lineOuterRadius = ringStartRadii[N - 1] + ringWidths[N - 1] + MONTH_TICK_TERMINAL;
    
        // **Include the `<style>` code here**
        svg = `<svg width="${size}" height="${size}" viewBox="-${size / 2} -${size / 2} ${size} ${size}" xmlns="http://www.w3.org/2000/svg" class="radial-timeline-svg" preserveAspectRatio="xMidYMid meet">`;
        

        // After radii are known, compute global stacking map (outer-ring all-scenes only)
        if (plugin.settings.outerRingAllScenes) {
            // No global stacking computation
        }

        // Access the publishStageColors from settings
        const PUBLISH_STAGE_COLORS = plugin.settings.publishStageColors;

        // Begin defs act
        svg += `<defs>`;
        
        // Define patterns for Working and Todo states with Publish Stage colors
        svg += `${Object.entries(PUBLISH_STAGE_COLORS).map(([stage, color]) => {
            // Use full stage color for plaid patterns, opacity will control subtlety
            return `
            <pattern id="plaidWorking${stage}" patternUnits="userSpaceOnUse" width="80" height="20" patternTransform="rotate(-20)">
                <rect width="80" height="20" fill="var(--rt-color-working)" opacity="var(--rt-color-plaid-opacity)"/>
                <path d="M 0 10 Q 2.5 -5, 5 10 Q 7.5 25, 10 10 Q 12.5 5, 15 10 Q 17.5 25, 20 10 Q 22.5 -5, 25 10 Q 27.5 25, 30 10 Q 32.5 5, 35 10 Q 37.5 25, 40 10 Q 42.5 -5, 45 10 Q 47.5 25, 50 10 Q 52.5 5, 55 10 Q 57.5 25, 60 10 Q 62.5 -5, 65 10 Q 67.5 25, 70 10 Q 72.5 5, 75 10 Q 77.5 25, 80 10" 
                    stroke="${color}" 
                    stroke-opacity="var(--rt-color-plaid-stroke-opacity)" 
                    stroke-width="1.5" 
                    fill="none" />
            </pattern>
            
            <pattern id="plaidTodo${stage}" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)">
                <rect width="10" height="10" fill="var(--rt-color-todo)" opacity="var(--rt-color-plaid-opacity)"/>
                <line x1="0" y1="0" x2="0" y2="10" 
                    stroke="${color}" 
                    stroke-width="1.5" 
                    stroke-opacity="0.5"/>
                <line x1="0" y1="0" x2="10" y2="0" 
                    stroke="${color}" 
                    stroke-width="1.5" 
                    stroke-opacity="0.5"/>
            </pattern>
        `;}).join('')}`;
        
        // Define Lucide icon symbols for center publish-stage key
        svg += `
            <symbol id="icon-circle-slash" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                <line x1="9" x2="15" y1="15" y2="9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </symbol>
            <symbol id="icon-smile" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                <line x1="9" x2="9.01" y1="9" y2="9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                <line x1="15" x2="15.01" y1="9" y2="9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </symbol>
            <symbol id="icon-house" viewBox="0 0 24 24">
                <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </symbol>
            <symbol id="icon-printer" viewBox="0 0 24 24">
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                <path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                <rect x="6" y="14" width="12" height="8" rx="1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </symbol>
            <symbol id="icon-arrow-right-dash" viewBox="0 0 24 24">
                <path d="M11 9a1 1 0 0 0 1-1V5.061a1 1 0 0 1 1.811-.75l6.836 6.836a1.207 1.207 0 0 1 0 1.707l-6.836 6.835a1 1 0 0 1-1.811-.75V16a1 1 0 0 0-1-1H9a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M4 9v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </symbol>
            <symbol id="icon-arrow-down" viewBox="0 0 24 24">
                <path d="M15 11a1 1 0 0 0 1 1h2.939a1 1 0 0 1 .75 1.811l-6.835 6.836a1.207 1.207 0 0 1-1.707 0L4.31 13.81a1 1 0 0 1 .75-1.811H8a1 1 0 0 0 1-1V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </symbol>
            <symbol id="icon-bookmark-check" viewBox="0 0 24 24">
                <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="m9 10 2 2 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </symbol>
            <!-- Arrow Up/Down From Line (toggle rotation) -->
            <symbol id="icon-arrow-up-from-line" viewBox="0 0 24 24">
                <path d="m18 9-6-6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                <path d="M12 3v14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                <path d="M5 21h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </symbol>
            <symbol id="icon-arrow-down-from-line" viewBox="0 0 24 24">
                <path d="M19 3H5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                <path d="M12 21V7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                <path d="m6 15 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
            </symbol>
        `;

        // Define outer arc paths for months
        months.forEach(({ name, angle }, index) => {
            // Calculate angular offset for 9px at the label radius
            // Month text path sits a fixed inset from the month tick ring
            const outerlabelRadius = lineOuterRadius - MONTH_TEXT_INSET;
            // Convert 5px to radians based on the circle's circumference
            const pixelToRadian = (5 * 2 * Math.PI) / (2 * Math.PI * outerlabelRadius);
            
            // Make the month offset very small, similar to but positive (clockwise) for Acts
            const angleOffset = 0.01; // Half of previous value (0.02)
            const startAngle = angle + angleOffset;  // Small offset to move label clockwise
            const endAngle = startAngle + (Math.PI / 24); // Short arc length
  
            const pathId = `monthLabelPath-${index}`;

            svg += `
                <path id="${pathId}"
                    d="
                        M ${formatNumber(outerlabelRadius * Math.cos(startAngle))} ${formatNumber(outerlabelRadius * Math.sin(startAngle))}
                        A ${formatNumber(outerlabelRadius)} ${formatNumber(outerlabelRadius)} 0 0 1 ${formatNumber(outerlabelRadius * Math.cos(endAngle))} ${formatNumber(outerlabelRadius * Math.sin(endAngle))}
                    "
                    fill="none"
                />
            `;
        });

        // Add filter for plot title background on hover (separate SVG effect)
        svg += `
            <filter id="plotTextBg" x="-25%" y="-25%" width="150%" height="150%">
                <feMorphology in="SourceAlpha" operator="dilate" radius="1.8" result="DILATE"/>
                <feFlood flood-color="#000000" result="BLACK"/>
                <feComposite in="BLACK" in2="DILATE" operator="in" result="BG"/>
                <feMerge>
                    <feMergeNode in="BG"/>
                    <feMergeNode in="SourceGraphic"/>
                </feMerge>
            </filter>
        `;

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
        svg += `<defs>
            <linearGradient id="linearColors1" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#FF0000"></stop>
                <stop offset="100%" stop-color="#FF7F00"></stop>
            </linearGradient>
            <linearGradient id="linearColors2" x1="0.5" y1="0" x2="0.5" y2="1">
                <stop offset="0%" stop-color="#FF7F00"></stop>
                <stop offset="100%" stop-color="#FFFF00"></stop>
            </linearGradient>
            <linearGradient id="linearColors3" x1="1" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#FFFF00"></stop>
                <stop offset="100%" stop-color="#00FF00"></stop>
            </linearGradient>
            <linearGradient id="linearColors4" x1="1" y1="1" x2="0" y2="0">
                <stop offset="0%" stop-color="#00FF00"></stop>
                <stop offset="100%" stop-color="#0000FF"></stop>
            </linearGradient>
            <linearGradient id="linearColors5" x1="0.5" y1="1" x2="0.5" y2="0">
                <stop offset="0%" stop-color="#0000FF"></stop>
                <stop offset="100%" stop-color="#4B0082"></stop>
            </linearGradient>
            <linearGradient id="linearColors6" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0%" stop-color="#4B0082"></stop>
                <stop offset="100%" stop-color="#8F00FF"></stop>
            </linearGradient>
        </defs>`;

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
         const estimateResult = plugin.calculateCompletionEstimate(scenes);

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
             
             if (yearsDiff > 0) {
                 // For multi-year estimates, the base circle already provides the full purple background
                 // No additional circle needed - year indicator in label shows multi-year status
             } else {
                 // For current year estimates, draw partial arc from January 1 to estimated date position
                 const estimatedYearPos = estimatedMonth/12 + estimatedDay/estimatedDaysInMonth/12;
                 const estimatedDateAngle = ((estimatedYearPos + 0.75) % 1) * Math.PI * 2;
                 
                 let arcAngleSpan = estimatedDateAngle - startAngle;
                 if (arcAngleSpan < 0) arcAngleSpan += 2 * Math.PI;
                 
                 svg += `
                     <path
                         d="
                             M ${progressRadius * Math.cos(startAngle)} ${progressRadius * Math.sin(startAngle)}
                             A ${progressRadius} ${progressRadius} 0 ${arcAngleSpan > Math.PI ? 1 : 0} 1 
                             ${progressRadius * Math.cos(estimatedDateAngle)} ${progressRadius * Math.sin(estimatedDateAngle)}
                         "
                         class="progress-ring-base"
                     />
                 `;
             }

         }
         // --- Draw Estimation Arc --- END ---

         
        // BEGIN add the month spokes group (existing code)
        svg += `<g class="month-spokes">`;

        // For each month, draw the inner spoke and labels
    
        // Then modify the inner month labels to curve along the inner arc
        months.forEach(({ name, angle }, monthIndex) => {
            const x1 = formatNumber((lineInnerRadius - 5) * Math.cos(angle));
            const y1 = formatNumber((lineInnerRadius - 5) * Math.sin(angle));
            const x2 = formatNumber(lineOuterRadius * Math.cos(angle));
            const y2 = formatNumber(lineOuterRadius * Math.sin(angle));

            // Check if this is an Act boundary (months 0, 4, or 8)
            const isActBoundary = [0, 4, 8].includes(monthIndex);
            // Check if this month has passed
            const isPastMonth = monthIndex < currentMonthIndex;

            // Draw the spoke line
            svg += `
                <line  
                    x1="${x1}"
                    y1="${y1}"
                    x2="${x2}"
                    y2="${y2}"
                    class="rt-month-spoke-line${isActBoundary ? ' rt-act-boundary' : ''}${isPastMonth ? ' rt-past-month' : ''}"
                />`;

            // Create curved path for inner month labels
            const innerLabelRadius = lineInnerRadius;
            const pixelToRadian = (5 * 2 * Math.PI) / (2 * Math.PI * innerLabelRadius);
            const startAngle = angle + pixelToRadian;
            const endAngle = angle + (Math.PI / 6);
            
            const innerPathId = `innerMonthPath-${name}`;
            
            svg += `
                <path id="${innerPathId}"
                    d="
                        M ${formatNumber(innerLabelRadius * Math.cos(startAngle))} ${formatNumber(innerLabelRadius * Math.sin(startAngle))}
                        A ${formatNumber(innerLabelRadius)} ${formatNumber(innerLabelRadius)} 0 0 1 ${formatNumber(innerLabelRadius * Math.cos(endAngle))} ${formatNumber(innerLabelRadius * Math.sin(endAngle))}
                    "
                    fill="none"
                />
                <text class="rt-month-label" ${isPastMonth ? 'opacity="0.5"' : ''}>
                    <textPath href="#${innerPathId}" startOffset="0" text-anchor="start">
                        ${months[monthIndex].shortName}
                    </textPath>
                </text>
            `;
        });

        // Close the month spokes lines and text labels group
        svg += `</g>`;


        // Create six segments for the rainbow (Year Progress)
        const segmentCount = 6;
        const fullCircleAngle = 2 * Math.PI;
        const segmentAngle = fullCircleAngle / segmentCount;
        
        // Calculate how many complete segments to show based on year progress
        const completeSegments = Math.floor(yearProgress * segmentCount);
        
        // Calculate the partial segment angle (for the last visible segment)
        const partialSegmentAngle = (yearProgress * segmentCount - completeSegments) * segmentAngle;
        
        // Draw each segment that should be visible
        for (let i = 0; i < segmentCount; i++) {
            // Calculate this segment's start and end angles
            const segStart = currentYearStartAngle + (i * segmentAngle);
            let segEnd = segStart + segmentAngle;
            
            // If this is beyond what should be shown based on year progress, skip it
            if (i > completeSegments) continue;
            
            // If this is the last partial segment, adjust the end angle
            if (i === completeSegments && partialSegmentAngle > 0) {
                segEnd = segStart + partialSegmentAngle;
            }
            
            // Create the arc path for this segment
            svg += `
                <path
                    d="
                        M ${progressRadius * Math.cos(segStart)} ${progressRadius * Math.sin(segStart)}
                        A ${progressRadius} ${progressRadius} 0 ${(segEnd - segStart) > Math.PI ? 1 : 0} 1 
                        ${progressRadius * Math.cos(segEnd)} ${progressRadius * Math.sin(segEnd)}
                    "
                    class="progress-ring-fill"
                    stroke="url(#linearColors${i+1})"
                />
            `;
        }



        // --- START: Draw Target Completion Marker ---
        let targetDateAngle = -Math.PI / 2; // Default to 12 o'clock (top)

        if (plugin.settings.targetCompletionDate) {
            try {
                // Parse the date string, ensuring it's treated as local time
                const targetDate = new Date(plugin.settings.targetCompletionDate + 'T00:00:00');
                const today = new Date();
                today.setHours(0, 0, 0, 0); // Normalize today to the beginning of the day

                // Only use the date if it's valid and in the future
                if (!isNaN(targetDate.getTime()) && targetDate > today) {
                    targetDateAngle = dateToAngle(targetDate);
                    if (plugin.settings.debug) {
                        plugin.log(`[Timeline Target] Using target date: ${targetDate.toISOString().slice(0,10)}, Angle: ${targetDateAngle.toFixed(2)}`);
                    }
                } else {
                     if (plugin.settings.debug) {
                        plugin.log(`[Timeline Target] Target date ${plugin.settings.targetCompletionDate} is invalid or not in the future. Using default.`);
                     }
                }
            } catch (e) {
                if (plugin.settings.debug) {
                   plugin.log(`[Timeline Target] Error parsing target date ${plugin.settings.targetCompletionDate}. Using default. Error: ${e}`);
                }
                // Keep default angle if parsing fails
            }
        } else {
            if (plugin.settings.debug) {
                plugin.log(`[Timeline Target] No target date set. Using default 12 o'clock.`);
            }
            // Keep default angle if setting is not present
        }

        // Define radii and size (similar to estimation marker)
        // const targetTickRadius = progressRadius; // Position relative to the progress ring - REMOVED
        // const targetTickHalfLength = 8; // How far the tick extends in/out - REMOVED
        const targetTickOuterRadius = progressRadius + 5; // Match red tick outer radius
        const targetTickInnerRadius = progressRadius - 35; // Match red tick inner radius
        const targetMarkerSize = 8; // Size of the square marker

        // Draw the tick mark line
        svg += `
            <line
                x1="${formatNumber(targetTickOuterRadius * Math.cos(targetDateAngle))}"
                y1="${formatNumber(targetTickOuterRadius * Math.sin(targetDateAngle))}"
                x2="${formatNumber((targetTickInnerRadius+3) * Math.cos(targetDateAngle))}"
                y2="${formatNumber((targetTickInnerRadius+3) * Math.sin(targetDateAngle))}"
                class="target-date-tick"
            />
        `;

        // Draw the square marker centered on the INNER radius (to match red dot position)
        const markerX = formatNumber(targetTickInnerRadius * Math.cos(targetDateAngle) - targetMarkerSize / 2);
        const markerY = formatNumber(targetTickInnerRadius * Math.sin(targetDateAngle) - targetMarkerSize / 2);
        svg += `
            <rect
                x="${markerX}"
                y="${markerY}"
                width="${targetMarkerSize}"
                height="${targetMarkerSize}"
                class="target-date-marker"
            />
        `;
        // --- END: Draw Target Completion Marker ---

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
        for (let act = 0; act < NUM_ACTS; act++) {
            const angle = (act * 2 * Math.PI) / NUM_ACTS - Math.PI / 2;
            // ACT labels sit a fixed offset from the outer scene edge
            const actLabelRadius = actualOuterRadiusForActs + ACT_LABEL_OFFSET;
            const angleOffset = -0.085;
            const startAngleAct = angle + angleOffset;
            const endAngleAct = startAngleAct + (Math.PI / 12);
            const actPathId = `actPath-${act}`;
            svg += `
                <path id="${actPathId}"
                    d="
                        M ${formatNumber(actLabelRadius * Math.cos(startAngleAct))} ${formatNumber(actLabelRadius * Math.sin(startAngleAct))}
                        A ${formatNumber(actLabelRadius)} ${formatNumber(actLabelRadius)} 0 0 1 ${formatNumber(actLabelRadius * Math.cos(endAngleAct))} ${formatNumber(actLabelRadius * Math.sin(endAngleAct))}
                    "
                    fill="none"
                />
                <text class="rt-act-label" fill="${maxStageColor}">
                    <textPath href="#${actPathId}" startOffset="0" text-anchor="start">
                        ACT ${act + 1}
                    </textPath>
                </text>
            `;
        }

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
                if (isOuterRing && plugin.settings.outerRingAllScenes) {
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

                    combined.forEach((scene, idx) => {
                            const { number, text } = parseSceneTitle(scene.title || '');
                        const position = positions.get(idx)!;
                            const sceneStartAngle = position.startAngle;
                            const sceneEndAngle = position.endAngle;
                        // Scene titles: fixed inset from the top (outer) boundary of the cell
                        const textPathRadius = Math.max(innerR, outerR - SCENE_TITLE_INSET);

                        const color = scene.itemType === 'Plot' 
                            ? '#E6E6E6' 
                            : getFillForItem(plugin, scene, maxStageColor, PUBLISH_STAGE_COLORS, totalPlotNotes, plotIndexByKey, true, subplotColorFor, true);

                        // Extend plot slices slightly beyond the outer ring for a subtle "poke"
                        const effectiveOuterR = scene.itemType === 'Plot' ? (outerR + 2) : outerR;
                        const arcPath = buildCellArcPath(innerR, effectiveOuterR, sceneStartAngle, sceneEndAngle);
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
                            synopsesElements.push(synopsisElOuter);
                        } catch {}
                        let sceneClasses = 'rt-scene-path';
                        if (scene.path && plugin.openScenePaths.has(scene.path)) sceneClasses += ' rt-scene-is-open';
                        const dyOffset = 0; // keep scene titles exactly on the midline path

                        // Use a single y-axis (radius) for all plot labels; no outward stacking
                        // Plot titles are inset a fixed amount from the outer scene edge
                        const plotTextRadius = outerR - PLOT_TITLE_INSET;

                        // Compute a path that starts at the slice but is long enough for the full title
                        const rawTitleFull = (() => {
                            const full = scene.title || '';
                            const m = full.match(/^(?:\s*\d+(?:\.\d+)?\s+)?(.+)/);
                            return m ? m[1] : full;
                        })();
                        const fontPxForPlot = PLOT_FONT_PX;
                        const desiredPixels = estimatePixelsFromTitle(rawTitleFull, PLOT_FONT_PX, ESTIMATE_FUDGE_RENDER, PADDING_RENDER_PX);
                        const desiredAngleArc = desiredPixels / plotTextRadius;
                        
                        const labelStartAngle = sceneStartAngle; // initial; post-layout adjuster will move if needed
                        const labelEndAngle = sceneStartAngle + desiredAngleArc;
                        const largeArcFlag = desiredAngleArc > Math.PI ? 1 : 0;

                        const subplotIdxAttr = (() => {
                            const name = scene.subplot && scene.subplot.trim().length > 0 ? scene.subplot : 'Main Plot';
                            const i = Math.max(0, masterSubplotOrder.indexOf(name));
                            return i;
                        })();

                        // No separator needed; spacing handled in positioning

                        svg += `
                        <g class="rt-scene-group" data-item-type="Scene" data-act="${act}" data-ring="${ring}" data-idx="${idx}" data-start-angle="${formatNumber(sceneStartAngle)}" data-end-angle="${formatNumber(sceneEndAngle)}" data-inner-r="${formatNumber(innerR)}" data-outer-r="${formatNumber(effectiveOuterR)}" data-subplot-index="${subplotIdxAttr}" data-path="${scene.path ? encodeURIComponent(scene.path) : ''}" id="scene-group-${act}-${ring}-outer-${idx}">
                            <path id="${sceneId}"
                                  d="${arcPath}" 
                                  fill="${color}" 
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
                            <path id="plotTextPath-outer-${act}-${ring}-${idx}" 
                                  d="M ${formatNumber(plotTextRadius * Math.cos(labelStartAngle))} ${formatNumber(plotTextRadius * Math.sin(labelStartAngle))} 
                                     A ${formatNumber(plotTextRadius)} ${formatNumber(plotTextRadius)} 0 ${largeArcFlag} 1 ${formatNumber(plotTextRadius * Math.cos(labelEndAngle))} ${formatNumber(plotTextRadius * Math.sin(labelEndAngle))}" 
                                  data-slice-start="${formatNumber(sceneStartAngle)}" data-radius="${formatNumber(plotTextRadius)}" fill="none"/>
                            <text class="rt-plot-title" dy="-3">
                                <textPath href="#plotTextPath-outer-${act}-${ring}-${idx}" startOffset="2">
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
                        const voidArcPath = buildCellArcPath(innerR, outerR, voidStartAngle, voidEndAngle);
                        svg += `<path d="${voidArcPath}" class="rt-void-cell"/>`;
                    }

                    continue; // Done with outer ring for this act
                }

                // Inner rings (or outer when toggle off): use subplot-specific scenes
                const currentScenes = subplot ? (scenesByActAndSubplot[act][subplot] || []) : [];

                if (currentScenes && currentScenes.length > 0) {

                    if (currentScenes && currentScenes.length > 0) {
                        // Separate Plot notes and Scene notes for different sizing
                        // Suppress Plot notes for ALL rings unless outer ring + all-scenes mode
                        const isOuterRingAllScenes = isOuterRing && plugin.settings.outerRingAllScenes === true;
                        const isAllScenesMode = plugin.settings.outerRingAllScenes === true;
                        const effectiveScenes = currentScenes.filter(scene => scene.itemType !== "Plot");
                        
                        // Compute positions for this ring using shared helper
                        const scenePositions = computePositions(innerR, outerR, startAngle, endAngle, effectiveScenes);


            
                        effectiveScenes.forEach((scene, idx) => {
                            const { number, text } = parseSceneTitle(scene.title || '');
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
                            const arcPath = buildCellArcPath(innerR, outerR, sceneStartAngle, sceneEndAngle);
            
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
                            <g class="rt-scene-group" data-item-type="Scene" data-act="${act}" data-ring="${ring}" data-idx="${idx}" data-start-angle="${formatNumber(sceneStartAngle)}" data-end-angle="${formatNumber(sceneEndAngle)}" data-inner-r="${formatNumber(innerR)}" data-outer-r="${formatNumber(outerR)}" data-subplot-index="${subplotIdxAttr}" data-path="${scene.path ? encodeURIComponent(scene.path) : ''}" id="scene-group-${act}-${ring}-${idx}">
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
                            const voidArcPath = buildCellArcPath(innerR, outerR, voidStartAngle, voidEndAngle);
                            svg += `<path d="${voidArcPath}" class="rt-void-cell"/>`;
                        }
                    } else {
                        // Empty subplot ring. When outer-ring-all-scenes is ON, do NOT place Plot notes here.
                        if (!plugin.settings.outerRingAllScenes) {
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
                                // Extend the plot slice outer edge by 2px so it slightly exceeds the ring
                                const plotArcPath = buildCellArcPath(innerR, outerR + 2, plotStartAngle, plotEndAngle);
                                const sceneId = `scene-path-${act}-${ring}-${idx}`;
                                svg += `
                                <g class="rt-scene-group" data-item-type="Plot" data-act="${act}" data-ring="${ring}" data-idx="${idx}" data-start-angle="${formatNumber(plotStartAngle)}" data-end-angle="${formatNumber(plotEndAngle)}" data-inner-r="${formatNumber(innerR)}" data-outer-r="${formatNumber(outerR + 2)}" data-path="${plotNote.path ? encodeURIComponent(plotNote.path) : ''}" id="scene-group-${act}-${ring}-${idx}">
                                    <path id="${sceneId}"
                                          d="${plotArcPath}" 
                                          fill="#E6E6E6" 
                                          class="rt-scene-path"/>
                                    <line 
                                        x1="${formatNumber(innerR * Math.cos(plotEndAngle))}" 
                                        y1="${formatNumber(innerR * Math.sin(plotEndAngle))}"
                                        x2="${formatNumber((outerR + 2) * Math.cos(plotEndAngle))}" 
                                        y2="${formatNumber((outerR + 2) * Math.sin(plotEndAngle))}"
                                        stroke="#000000" stroke-width="1" shape-rendering="crispEdges" />
                                </g>`;
                                currentAngle += plotAngularWidth;
                            });
                            if (remainingSpace > 0.001) {
                                const voidArcPath = buildCellArcPath(innerR, outerR, currentAngle, endAngle);
                                svg += `<path d="${voidArcPath}" class="rt-void-cell"/>`;
                            }
                        } else {
                            const voidArcPath = buildCellArcPath(innerR, outerR, startAngle, endAngle);
                                svg += `<path d="${voidArcPath}" class="rt-void-cell"/>`;
                            }
                        } else {
                            // All-scenes mode: just fill empty ring with a void cell
                            const voidArcPath = buildCellArcPath(innerR, outerR, startAngle, endAngle);
                            svg += `<path d="${voidArcPath}" class="rt-void-cell"/>`;
                        }
                    }
                } else {
                    // Empty subplot code
                    const arcPath = buildCellArcPath(innerR, outerR, startAngle, endAngle);
                    svg += `<path d="${arcPath}" class="rt-void-cell"/>`;
                }
            }
        }

        // After all scenes are drawn, add just the act borders (vertical lines only)
        for (let act = 0; act < NUM_ACTS; act++) {
            const angle = (act * 2 * Math.PI) / NUM_ACTS - Math.PI / 2;
            
            // Draw only the vertical line (y-axis spoke) for each act boundary
            svg += `<line 
                x1="${formatNumber(innerRadius * Math.cos(angle))}" 
                y1="${formatNumber(innerRadius * Math.sin(angle))}"
                x2="${formatNumber(outerRadius * Math.cos(angle))}" 
                y2="${formatNumber(outerRadius * Math.sin(angle))}"
                class="act-border"
            />`;
        }

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
            const { number } = parseSceneTitle(scene.title || '');
            if (number && typeof number === 'string') {
                const asNum = Number(number.replace(/\D/g, ''));
                if (!isNaN(asNum)) maxSceneNumber = Math.max(maxSceneNumber, asNum);
            }
        });
        const baseTotalScenes = Math.max(uniqueSceneCount, maxSceneNumber);

        const currentYearLabel = new Date().getFullYear();
        const headerY = startYGrid - (cellGapY + GRID_HEADER_OFFSET_Y);

        // Calculate estimated total scenes: max(unique scene files, highest numeric prefix from titles)
        const uniqueScenesCount = processedPathsForGrid.size;
        const seenForMax = new Set<string>();
        let highestPrefixNumber = 0;
        scenes.forEach(scene => {
            if (scene.itemType === 'Plot') return;
            if (!scene.path || seenForMax.has(scene.path)) return;
            seenForMax.add(scene.path);
            const { number } = parseSceneTitle(scene.title || '');
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

        svg += `
             <g class="color-key-center">
                 <!-- Column headers (status) -->
                 ${statusesForGrid.map((status, c) => {
                     const label = status === 'Todo' ? 'Tdo' : status === 'Working' ? 'Wrk' : status === 'Completed' ? 'Cmt' : 'Due';
                     const x = startXGrid + c * (cellWidth + cellGapX) + (cellWidth / 2);
                     const y = headerY;
                     const tip = STATUS_HEADER_TOOLTIPS[status] || status;
                     return `
                         <g class="status-header">
                             <text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="alphabetic" class="center-key-text status-header-letter">${label}</text>
                             <rect x="${x - 18}" y="${y - 18}" width="36" height="24" fill="transparent" pointer-events="all">
                                 <title>${tip}</title>
                             </rect>
                         </g>
                     `;
                 }).join('')}

                 <!-- Row headers (stages) and year -->
                 <!-- Old top-left year removed -->
                 <!-- Year bottom-right, left-justified to last column edge -->
                 <text x="${startXGrid + gridWidth}" y="${startYGrid + gridHeight + (cellGapY + 16)}" text-anchor="end" dominant-baseline="alphabetic" class="center-key-text">${currentYearLabel}//${estimatedTotalScenes}</text>
                 ${stagesForGrid.map((stage, r) => {
                     const short = stage === 'Zero' ? 'Z' : stage === 'Author' ? 'A' : stage === 'House' ? 'H' : 'P';
                     const xh = startXGrid - 12;
                     const yh = startYGrid + r * (cellHeight + cellGapY) + (cellHeight / 2 + 1);
                     const tooltip = STAGE_HEADER_TOOLTIPS[stage] || stage;
                     return `
                         <g class="stage-header">
                             <text x="${xh}" y="${yh}" text-anchor="end" dominant-baseline="middle" class="center-key-text stage-header-letter">${short}</text>
                             <rect x="${xh - 14}" y="${yh - 14}" width="28" height="28" fill="transparent" pointer-events="all">
                                 <title>${tooltip}</title>
                             </rect>
                         </g>
                     `;
                 }).join('')}

                 <!-- Grid cells -->
                 ${stagesForGrid.map((stage, r) => {
                    return `${statusesForGrid.map((status, c) => {
                        const count = gridCounts[stage][status] || 0;
                        const x = startXGrid + c * (cellWidth + cellGapX);
                        const y = startYGrid + r * (cellHeight + cellGapY);
                        const completeRow = isStageCompleteForGridRow(r, gridCounts, stagesForGrid, maxStageIdxForGrid);
                        if (completeRow) {
                            const mostAdvancedStage = stagesForGrid[maxStageIdxForGrid];
                            const solid = (PUBLISH_STAGE_COLORS[mostAdvancedStage as keyof typeof PUBLISH_STAGE_COLORS] || '#888888');
                            return `
                                <g transform="translate(${x}, ${y})">
                                    <rect x="0" y="0" width="${cellWidth}" height="${cellHeight}" fill="${solid}">
                                        ${count > 0 ? `<title>${stage} • ${status}: ${count}</title>` : ''}
                                    </rect>
                                    ${status === 'Completed' && count > 0 ? `<text x="2" y="${cellHeight - 3}" text-anchor="start" dominant-baseline="alphabetic" class="grid-completed-count">${count}</text>` : ''}
                                    <use href="#icon-bookmark-check" x="${(cellWidth - 18) / 2}" y="${(cellHeight - 18) / 2}" width="18" height="18" class="completed-icon" />
                                </g>
                            `;
                        }
                        return renderGridCell(stage, status, x, y, count, cellWidth, cellHeight);
                    }).join('')}`;
                }).join('')}

                 <!-- Per-stage progress arrows -->
                 ${(() => {
                    // Use already computed maxStageIdxForGrid; if none, show nothing
                    if (maxStageIdxForGrid === -1) return '';
                    return stagesForGrid.map((stage, r) => {
                        let arrowId = '';
                        if (r === maxStageIdxForGrid) {
                            arrowId = 'icon-arrow-right-dash';
                        } else if (r < maxStageIdxForGrid) {
                            arrowId = 'icon-arrow-down';
                        } else {
                            return '';
                        }
                        const ax = startXGrid + gridWidth + 4;
                        const ay = startYGrid + r * (cellHeight + cellGapY) + (cellHeight / 2);
                        return `<use href=\"#${arrowId}\" x=\"${ax}\" y=\"${ay - 12}\" width=\"24\" height=\"24\" style=\"color: var(--text-normal)\" />`;
                    }).join('');
                })()}
             </g>
         `;

        // Add tick mark and label for the estimated completion date if available
        // (Moved here to draw AFTER center stats so it appears on top)
        if (estimateResult) {
            const estimatedCompletionDate = estimateResult.date; // Get date again

            // Use estimateResult.date for calculations
            const estimatedMonth = estimatedCompletionDate.getMonth();
            const estimatedDay = estimatedCompletionDate.getDate();
            const estimatedDaysInMonth = new Date(estimatedCompletionDate.getFullYear(), estimatedMonth + 1, 0).getDate();
            const estimatedYearPos = estimatedMonth/12 + estimatedDay/estimatedDaysInMonth/12;
            const absoluteDatePos = ((estimatedYearPos + 0.75) % 1) * Math.PI * 2;

            // ... (calculate tick mark positions using absoluteDatePos) ...
            const tickOuterRadius = progressRadius + 5;
            const tickInnerRadius = progressRadius - 35;
            const tickOuterX = tickOuterRadius * Math.cos(absoluteDatePos);
            const tickOuterY = tickOuterRadius * Math.sin(absoluteDatePos);
            const tickInnerX = tickInnerRadius * Math.cos(absoluteDatePos);
            const tickInnerY = tickInnerRadius * Math.sin(absoluteDatePos);
            
            svg += `
                <line 
                    x1="${formatNumber(tickOuterX)}" 
                    y1="${formatNumber(tickOuterY)}" 
                    x2="${formatNumber(tickInnerX)}" 
                    y2="${formatNumber(tickInnerY)}" 
                    class="estimated-date-tick" 
                />
                <circle 
                    cx="${formatNumber(tickInnerX)}" 
                    cy="${formatNumber(tickInnerY)}" 
                    r="4" 
                    class="estimated-date-dot" 
                />
            `;

            // Use estimateResult.date for display format (no year-count prefix)
            const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit' });
            const dateDisplay = `${dateFormatter.format(estimatedCompletionDate)}`;
            
            // --- Get stats string from estimateResult --- START ---
            const total = estimateResult.total;
            const remaining = estimateResult.remaining;
            const rate = estimateResult.rate; // Already rounded
            const statsDisplay = `${total}:${remaining}:${rate}`; // Compact format
            // --- Get stats string from estimateResult --- END ---

            // ... (calculate label positions using absoluteDatePos) ...
            const labelRadius = progressRadius - 45;
            // Fixed offset for label placement
            const maxOffset = -18;
            const offsetX = maxOffset * Math.cos(absoluteDatePos);
            const maxYOffset = 5;
            const offsetY = -maxYOffset * Math.sin(absoluteDatePos);
            const labelX = formatNumber(labelRadius * Math.cos(absoluteDatePos) + offsetX);
            const labelY = formatNumber(labelRadius * Math.sin(absoluteDatePos) + offsetY);

            svg += `
                <text
                    x="${labelX}"
                    y="${labelY}"
                    text-anchor="middle"
                    dominant-baseline="middle"
                    class="estimation-date-label"
                >
                    ${dateDisplay}
                </text>
            `;

            //   Replace dateDisplay above for complete stats ${dateDisplay} ${statsDisplay}
        }

        // First, add the background layer with subplot labels
        // --- START: Subplot Label Generation ---
        // Wrap subplot labels in a background layer for proper z-index
        svg += `<g class="background-layer">`;
        
        // Only show subplot labels in Act 3 (top position)
        const act = 3; // Act 3 is at the top (12 o'clock)
        const totalRings = NUM_RINGS;
        const subplotCount = masterSubplotOrder.length;
        const ringsToUse = Math.min(subplotCount, totalRings);
        
        for (let ringOffset = 0; ringOffset < ringsToUse; ringOffset++) {
            const ring = totalRings - ringOffset - 1; // Start from the outermost ring
            const subplot = masterSubplotOrder[ringOffset];
            
            // Skip empty subplot
            if (!subplot) continue;
            
            const innerR = ringStartRadii[ring];
            const outerR = innerR + ringWidths[ring];
            
            // Create a unique ID for the label path
            const labelPathId = `subplot-label-path-${ring}`;
            const labelRadius = (innerR + outerR) / 2; // Center of the ring
            
            // Calculate available height for text (y-axis distance)
            const availableHeight = ringWidths[ring];
            
            // Calculate dynamic font size based on available height
            // Use 95% of available height to fill more space
            const fontSize = Math.floor(availableHeight * 0.95);
            
            // Define arc to END at 270 degrees (12 o'clock) for right justification start
            // Use 90 degrees for the arc length to span Act 3
            const arcLength = Math.PI / 2; // 90 degrees span
            const endAngle = -Math.PI / 2; // End at 12 o'clock position
            const startAngle = endAngle - arcLength; // Start 90 degrees earlier (180 deg)
            
            // Calculate the actual length of the arc path in pixels
            const arcPixelLength = labelRadius * arcLength; 
            
            // Ensure subplot text is properly escaped
            const isOuterRing = ringOffset === 0;
            const labelRaw = (isOuterRing && plugin.settings.outerRingAllScenes) ? 'ALL SCENES' : subplot.toUpperCase();
            const safeSubplotText = plugin.safeSvgText(labelRaw);
            
            // Create the path for the label - will set CSS variable via JavaScript
            svg += `
                <g class="subplot-label-group" data-font-size="${fontSize}">
                    <path id="${labelPathId}"
                        d="M ${formatNumber(labelRadius * Math.cos(startAngle))} ${formatNumber(labelRadius * Math.sin(startAngle))}
                        A ${formatNumber(labelRadius)} ${formatNumber(labelRadius)} 0 0 1 
                        ${formatNumber(labelRadius * Math.cos(endAngle))} ${formatNumber(labelRadius * Math.sin(endAngle))}"
                        class="subplot-ring-label-path"
                    />
                    <text class="rt-subplot-label-text" data-subplot-index="${ringOffset}" data-subplot-name="${escapeXml(subplot)}">
                        <textPath href="#${labelPathId}" startOffset="100%" text-anchor="end"
                                textLength="${arcPixelLength}" lengthAdjust="spacingAndGlyphs">
                            ${safeSubplotText}
                        </textPath>
                    </text>
                </g>
            `;
        }
        
        // Close the background layer group
        svg += `</g>`;
        // --- END: Subplot Label Generation ---

        // Add number squares after background layer but before synopses
        if (plugin.settings.outerRingAllScenes) {
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
                combined.forEach((scene, idx) => {
                    if (scene.itemType === 'Plot') return;
                    const number = getScenePrefixNumber(scene.title);
                    if (!number) return;

                    const pos = positions.get(idx);
                    if (!pos) return;
                    const sceneStartAngle = pos.startAngle;

                    const squareSize = getNumberSquareSize(number);
                    const squareX = squareRadiusOuter * Math.cos(sceneStartAngle);
                    const squareY = squareRadiusOuter * Math.sin(sceneStartAngle);

                    const { isSceneOpen, isSearchMatch, hasEdits } = getSceneState(scene, plugin);
                    const squareClasses = buildSquareClasses(isSceneOpen, isSearchMatch, hasEdits);
                    let textClasses = buildTextClasses(isSceneOpen, isSearchMatch, hasEdits);

                    // Match the sceneId format used in the outer ring scene arcs
                    const sceneId = makeSceneId(act, ringOuter, idx, true, true);

                    // Get grade for this scene from the grades map
                    const grade = sceneGrades.get(sceneId);
                    if (plugin.settings.enableAiBeats && grade) {
                        textClasses += ` rt-grade-${grade}`;
                    }
                    svg += generateNumberSquareGroup(squareX, squareY, squareSize, squareClasses, sceneId, number, textClasses, grade);
                });
            }
            
            // Then, draw squares for inner subplot rings (excluding Main Plot since it's on outer ring)
            
        scenes.forEach((scene) => {
                if (scene.itemType === "Plot") return;
                
                const number = getScenePrefixNumber(scene.title);
                if (!number) return;
                
                const subplot = scene.subplot && scene.subplot.trim().length > 0 ? scene.subplot : 'Main Plot';
                
                // Skip Main Plot scenes since they're already on the outer ring
                if (subplot === 'Main Plot') {
                return;
            }
            
                const subplotIndex = masterSubplotOrder.indexOf(subplot);
                if (subplotIndex === -1) return;
                
                const ring = NUM_RINGS - 1 - subplotIndex;
                if (ring < 0 || ring >= NUM_RINGS) return;
                
                const sceneActNumber = scene.actNumber !== undefined ? scene.actNumber : 1;
                const actIndex = sceneActNumber - 1;
                const scenesInActAndSubplot = (scenesByActAndSubplot[actIndex] && scenesByActAndSubplot[actIndex][subplot]) || [];
                const isAllScenesMode = plugin.settings.outerRingAllScenes === true;
                const filteredScenesForIndex = isAllScenesMode ? scenesInActAndSubplot.filter(s => s.itemType !== "Plot") : scenesInActAndSubplot;
                const sceneIndex = filteredScenesForIndex.indexOf(scene);
                if (sceneIndex === -1) return;
                
                const startAngle = (actIndex * 2 * Math.PI) / NUM_ACTS - Math.PI / 2;
                const endAngle = ((actIndex + 1) * 2 * Math.PI) / NUM_ACTS - Math.PI / 2;
                
                const plotNotes = isAllScenesMode ? [] : scenesInActAndSubplot.filter(s => s.itemType === "Plot");
                const sceneNotes = isAllScenesMode ? scenesInActAndSubplot.filter(s => s.itemType !== "Plot") : scenesInActAndSubplot.filter(s => s.itemType !== "Plot");
                
                const innerR = ringStartRadii[ring];
                const outerR = innerR + ringWidths[ring];
                const middleRadius = (innerR + outerR) / 2;
                const plotAngularWidth = PLOT_PIXEL_WIDTH / middleRadius;
                
                const totalAngularSpace = endAngle - startAngle;
                const plotTotalAngularSpace = plotNotes.length * plotAngularWidth;
                const remainingAngularSpace = totalAngularSpace - plotTotalAngularSpace;
                const sceneAngularSize = sceneNotes.length > 0 ? remainingAngularSpace / sceneNotes.length : 0;
                
                let currentAngle = startAngle;
                for (let i = 0; i < sceneIndex; i++) {
                    const sceneAtIndex = filteredScenesForIndex[i];
                    if (sceneAtIndex.itemType === "Plot") {
                        currentAngle += plotAngularWidth;
                    } else {
                        currentAngle += sceneAngularSize;
                    }
                }
                const sceneStartAngle = currentAngle;
                
                const textPathRadius = (innerR + outerR) / 2;
                const squareSize = getNumberSquareSize(number);
                const squareX = textPathRadius * Math.cos(sceneStartAngle);
                const squareY = textPathRadius * Math.sin(sceneStartAngle);
                
                const { isSceneOpen, isSearchMatch, hasEdits } = getSceneState(scene, plugin);
                const squareClasses = buildSquareClasses(isSceneOpen, isSearchMatch, hasEdits);
                let textClasses = buildTextClasses(isSceneOpen, isSearchMatch, hasEdits);
                
                const sceneId = `scene-path-${actIndex}-${ring}-${sceneIndex}`;
                
                // Extract grade for inner ring scenes too
                extractGradeFromScene(scene, sceneId, sceneGrades, plugin);
                
                // Get grade for this scene from the grades map
                const grade = sceneGrades.get(sceneId);
                if (plugin.settings.enableAiBeats && grade) {
                    textClasses += ` rt-grade-${grade}`;
                }
                svg += generateNumberSquareGroup(squareX, squareY, squareSize, squareClasses, sceneId, number, textClasses, grade);
            });
            
            svg += `</g>`;
        } else if (!plugin.settings.outerRingAllScenes) {
            svg += `<g class="rt-number-squares">`;
            scenes.forEach((scene) => {
                // Skip number squares for Plot notes
                if (scene.itemType === "Plot") {
                    return;
                }
            
            const { number } = parseSceneTitle(scene.title || '');
            if (number) {
                const subplot = scene.subplot || "Main Plot";
                const subplotIndex = masterSubplotOrder.indexOf(subplot);
                const ring = NUM_RINGS - 1 - subplotIndex;
                
                // Get the scenes for this act and subplot to determine correct index
                const sceneActNumber = scene.actNumber !== undefined ? scene.actNumber : 1;
                const actIndex = sceneActNumber - 1;
                const scenesInActAndSubplot = (scenesByActAndSubplot[actIndex] && scenesByActAndSubplot[actIndex][subplot]) || [];
                const filteredScenes = scenesInActAndSubplot.filter(s => s.itemType !== "Plot");
                const sceneIndex = filteredScenes.indexOf(scene);
                
                const startAngle = (actIndex * 2 * Math.PI) / NUM_ACTS - Math.PI / 2;
                const endAngle = ((actIndex + 1) * 2 * Math.PI) / NUM_ACTS - Math.PI / 2;
                
                // Use the same positioning logic as scene rendering (no plot notes when toggle is off)
                const innerR = ringStartRadii[ring];
                const outerR = innerR + ringWidths[ring];
                const middleRadius = (innerR + outerR) / 2;
                const totalAngularSpace = endAngle - startAngle;
                const sceneAngularSize = filteredScenes.length > 0 ? totalAngularSpace / filteredScenes.length : 0;
                
                // Calculate this scene's position
                let currentAngle = startAngle;
                let sceneStartAngle = startAngle;
                
                for (let i = 0; i < sceneIndex; i++) {
                    currentAngle += sceneAngularSize;
                }
                sceneStartAngle = currentAngle;
                
                const textPathRadius = (ringStartRadii[ring] + (ringStartRadii[ring] + ringWidths[ring])) / 2;
                
                // Reuse the existing square size calculation
                const getSquareSize = getNumberSquareSize;

                const squareSize = getSquareSize(number);
                const squareX = textPathRadius * Math.cos(sceneStartAngle) + 2;
                const squareY = textPathRadius * Math.sin(sceneStartAngle) + 2;
          
                // Store scene number information for square and synopsis
                const sceneId = `scene-path-${actIndex}-${ring}-${sceneIndex}`;
                sceneNumbersMap.set(sceneId, {
                    number,
                    x: squareX,
                    y: squareY,
                    width: squareSize.width,
                    height: squareSize.height
                });

                // Use helper functions for consistent behavior
                const sceneState = getSceneState(scene, plugin);
                const squareClasses = buildSquareClasses(sceneState.isSceneOpen, sceneState.isSearchMatch, sceneState.hasEdits);
                let textClasses = buildTextClasses(sceneState.isSceneOpen, sceneState.isSearchMatch, sceneState.hasEdits);

                // Get grade from our Map for this scene
                const grade = sceneGrades.get(sceneId);
                if (plugin.settings.enableAiBeats && grade) {
                    textClasses += ` rt-grade-${grade}`;
                }
                
                // Use helper function for consistent DOM structure
                svg += generateNumberSquareGroup(squareX, squareY, squareSize, squareClasses, sceneId, number, textClasses, grade);

            }
        });
        svg += `</g>`;
        }
        
        // Close rotatable container
        svg += `</g>`;
        
        // Create container for all synopses
        const synopsesContainer = document.createElementNS("http://www.w3.org/2000/svg", "g");
        synopsesContainer.setAttribute("class", "synopses-container");

        // Add all synopsis elements to the container
        synopsesElements.forEach(element => {
            synopsesContainer.appendChild(element);
        });

        // Serialize the synopses container to SVG string
        const serializer = new XMLSerializer();
        const synopsesHTML = serializer.serializeToString(synopsesContainer);

        // Then add the synopses on top (non-rotating)
        svg += synopsesHTML;

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
