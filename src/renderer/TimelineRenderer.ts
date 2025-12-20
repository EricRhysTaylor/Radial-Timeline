/**
 * Radial Timeline Plugin for Obsidian — Renderer
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import { NUM_ACTS, STAGE_ORDER, STAGES_FOR_GRID, STATUSES_FOR_GRID, STATUS_COLORS, SceneNumberInfo } from '../utils/constants';
import {
    GRID_CELL_BASE,
    GRID_CELL_WIDTH_EXTRA,
    GRID_CELL_GAP_X,
    GRID_CELL_GAP_Y,
    GRID_HEADER_OFFSET_Y,
    GRID_LINE_HEIGHT,
} from './layout/LayoutConstants';
import { renderRings, type RingRenderContext } from './renderers/RingRenderer';
import { computeGridData } from './utils/GridData';
import { renderNumberSquares, type NumberSquareRenderContext, type NumberSquareVisualResolver } from './renderers/NumberSquareRenderer';
import type { TimelineItem } from '../types';
import { formatNumber, escapeXml } from '../utils/svg';
import { dateToAngle, isOverdueDateString } from '../utils/date';
import { parseSceneTitle, normalizeStatus, parseSceneTitleComponents, getScenePrefixNumber } from '../utils/text';
import {
    extractGradeFromScene,
    getSceneState,
    buildSquareClasses,
    buildTextClasses,
    extractPosition,
    sortScenes,
    isBeatNote,
    type PluginRendererFacade
} from '../utils/sceneHelpers';
import { generateNumberSquareGroup, makeSceneId } from '../utils/numberSquareHelpers';
import { normalizeBeatName } from '../utils/gossamer';
import { buildChronologueOuterLabels, renderChronologueOverlays, renderOuterLabelTexts, renderChronologueOuterTicks } from './utils/Chronologue';
import { getMostAdvancedStageColor } from '../utils/colour';
import { computeCacheableValues, type PrecomputedRenderValues } from './utils/Precompute';
import { computeRingGeometry } from './layout/Rings';
import { arcPath } from './layout/Paths';
import {
    SVG_SIZE,
    INNER_RADIUS,
    SUBPLOT_OUTER_RADIUS_MAINPLOT,
    SUBPLOT_OUTER_RADIUS_STANDARD,
    SUBPLOT_OUTER_RADIUS_CHRONOLOGUE,
    MONTH_LABEL_RADIUS,
    CHRONOLOGUE_DATE_RADIUS,
    MONTH_TICK_END,
    MONTH_TICK_START,
    ACT_LABEL_RADIUS,
    CHRONOLOGUE_DURATION_ARC_RADIUS,
    ELAPSED_ARC_RADIUS,
    ELAPSED_TICK_LENGTH,
    SCENE_TITLE_INSET,
    SYNOPSIS_INSET,
    BEAT_TEXT_RADIUS,
    TEXTPATH_START_NUDGE_RAD,
    MAX_TEXT_WIDTH,
    PLOT_PIXEL_WIDTH,
    BEAT_FONT_PX,
    ESTIMATE_FUDGE_RENDER,
    PADDING_RENDER_PX,
    ANGULAR_GAP_PX
} from './layout/LayoutConstants';
import { computePositions, getEffectiveScenesForRing, type PositionInfo } from './utils/SceneLayout';
import { startPerfSegment } from './utils/Performance';
import { getFillForScene } from './utils/SceneFill';
import { estimatePixelsFromTitle } from './utils/LabelMetrics';
import { renderCenterGrid } from './components/Grid';
import { renderMonthLabelDefs } from './components/Months';
import { renderSubplotLabels } from './components/SubplotLabels';
import { renderSubplotDominanceIndicators, computeSubplotDominanceStates, resolveDominantScene, type SubplotDominanceState } from './components/SubplotDominanceIndicators';
import { renderDefs } from './components/Defs';
import { renderEstimatedDateElements } from './components/Progress';
import { sceneArcPath, renderVoidCellPath } from './components/SceneArcs';
import { renderBeatSlice } from './components/BeatSlices';
import { renderActBorders } from './components/Acts';
import { renderActLabels } from './components/ActLabels';
import { renderTargetDateTick } from './components/ProgressTicks';
import { renderProgressRing } from './components/ProgressRing';
import { serializeSynopsesToString } from './components/Synopses';
import { renderSceneGroup } from './components/Scenes';
import { renderBeatGroup } from './components/Beats';
import { renderCalendarSpokesLayer } from './utils/MonthSpokes';
import { renderOuterRingNumberSquares, renderInnerRingsNumberSquaresAllScenes, renderNumberSquaresStandard } from './components/NumberSquares';
import { shouldRenderStoryBeats, shouldShowSubplotRings, shouldShowAllScenesInOuterRing, shouldShowInnerRingContent, getSubplotLabelText } from './modules/ModeRenderingHelpers';
import { collectChronologueSceneEntries, type ChronologueSceneEntry } from './components/ChronologueTimeline';
import { appendSynopsisElementForScene } from './utils/SynopsisBuilder';
import { renderGossamerOverlay, type StageColorMap } from './utils/Gossamer';
import { renderRotationToggle } from './utils/RotationToggle';
import { renderVersionIndicator } from './components/VersionIndicator';
import { renderHelpIcon } from './components/HelpIcon';
import type { CompletionEstimate } from './utils/Estimation';
import { renderProgressRingBaseLayer } from './utils/ProgressRing';
import { getReadabilityMultiplier, getReadabilityScale } from '../utils/readability';
import { getVersionCheckService } from '../services/VersionCheckService';


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

function computeSceneTitleInset(fontScale: number): number {
    if (!Number.isFinite(fontScale) || fontScale <= 1) return SCENE_TITLE_INSET;
    const extraInset = (fontScale - 1) * 18;
    return SCENE_TITLE_INSET + extraInset;
}

export function createTimelineSVG(
    plugin: PluginRendererFacade,
    scenes: TimelineItem[],
): { svgString: string; maxStageColor: string } {
    const stopTotalPerf = startPerfSegment(plugin, 'timeline.total');
    const sceneCount = scenes.length;
    const size = SVG_SIZE;
    const innerRadius = INNER_RADIUS;
    const monthLabelRadius = MONTH_LABEL_RADIUS;
    const chronologueDateRadius = CHRONOLOGUE_DATE_RADIUS;
    const monthTickStart = MONTH_TICK_START;
    const monthTickEnd = MONTH_TICK_END;
    const readabilityScale = getReadabilityScale(plugin.settings as any);
    const fontScale = getReadabilityMultiplier(plugin.settings as any);
    const maxTextWidth = MAX_TEXT_WIDTH * fontScale;
    const readabilityClass = `rt-font-scale-${readabilityScale}`;
    const sceneTitleInset = computeSceneTitleInset(fontScale);

    // Synopses are hidden by CSS until hover - no need to log anything

    const stopPrepPerf = startPerfSegment(plugin, 'timeline.scene-prep');
    const precomputed = computeCacheableValues(plugin, scenes);
    stopPrepPerf();

    // Extract precomputed values
    const {
        scenesByActAndSubplot,
        masterSubplotOrder,
        totalPlotNotes,
        plotIndexByKey,
        plotsBySubplot,
        ringWidths,
        ringStartRadii,
        lineInnerRadius,
        maxStageColor,
        subplotDominanceStates
    } = precomputed;

    const NUM_RINGS = masterSubplotOrder.length;
    const currentMode = (plugin.settings as any).currentMode || 'narrative';
    const shouldApplyNumberSquareColors = currentMode !== 'gossamer';
    const numberSquareVisualResolver = shouldApplyNumberSquareColors
        ? (scene: TimelineItem) => {
            const subplotName = scene.subplot && scene.subplot.trim().length > 0 ? scene.subplot : 'Main Plot';
            const idx = masterSubplotOrder.indexOf(subplotName);
            const normalized = idx >= 0 ? (idx % 16) : 0;
            return {
                subplotIndex: normalized
            };
        }
        : null;
    const subplotColorFor = (subplotName: string) => {
        const idx = masterSubplotOrder.indexOf(subplotName);
        const normalized = idx >= 0 ? idx % 16 : 0;
        const varName = `--rt-subplot-colors-${normalized}`;
        const computed = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
        return computed || '#EFBDEB';
    };
    const forceSubplotFillColors = currentMode === 'narrative' || currentMode === 'chronologue';

    // Create SVG root and expose the dominant publish-stage colour for CSS via a hidden <g> element
    let svg = `<svg width="${size}" height="${size}" viewBox="-${size / 2} -${size / 2} ${size} ${size}" 
                       xmlns="http://www.w3.org/2000/svg" class="radial-timeline-svg ${readabilityClass}" data-font-scale="${readabilityScale}"
                       preserveAspectRatio="xMidYMid meet">`;


    // Hidden config group consumed by the stylesheet (e.g. to tint buttons, etc.)
    svg += `<g id="timeline-config-data" data-max-stage-color="${maxStageColor}"></g>`;

    // Create defs for patterns and gradients


    // Create a map to store scene number information for the scene square and synopsis
    const sceneNumbersMap = new Map<string, SceneNumberInfo>();

    // Determine sorting method (needed for later logic; pulled out for readability)
    const isChronologueMode = currentMode === 'chronologue';
    const isSubplotMode = currentMode === 'subplot';
    const sortByWhen = isChronologueMode ? true : ((plugin.settings as any).sortByWhenDate ?? false);
    const forceChronological = isChronologueMode;
    const chronologueSceneEntries: ChronologueSceneEntry[] | undefined = isChronologueMode
        ? collectChronologueSceneEntries(scenes)
        : undefined;

    // Use appropriate subplot outer radius based on mode and readability scale
    const subplotOuterRadius = isChronologueMode
        ? SUBPLOT_OUTER_RADIUS_CHRONOLOGUE
        : isSubplotMode
            ? SUBPLOT_OUTER_RADIUS_MAINPLOT
            : SUBPLOT_OUTER_RADIUS_STANDARD[readabilityScale];

    // Fixed beat text radius based on readability scale (independent of subplot outer radius)
    const beatTextRadius = BEAT_TEXT_RADIUS[readabilityScale];

    const standardMonths = Array.from({ length: 12 }, (_, i) => {
        const angle = (i / 12) * 2 * Math.PI - Math.PI / 2;
        const name = new Date(2000, i).toLocaleString('en-US', { month: 'long' });
        const shortName = new Date(2000, i).toLocaleString('en-US', { month: 'short' }).slice(0, 3);
        return { name, shortName, angle };
    });
    const months = standardMonths;

    let outerLabels: { name: string; shortName: string; angle: number; isMajor?: boolean; isFirst?: boolean; isLast?: boolean; sceneIndex?: number }[];
    if (isChronologueMode) {
        outerLabels = buildChronologueOuterLabels(plugin, scenes);
    } else {
        outerLabels = standardMonths;
    }




    // After radii are known, compute global stacking map (outer-ring narrative only)
    if (shouldShowAllScenesInOuterRing(plugin)) {
        // No global stacking computation
    }

    // Access the publishStageColors from settings
    const PUBLISH_STAGE_COLORS = plugin.settings.publishStageColors as StageColorMap;

    // Begin defs act
    svg += `<defs>`;

    // Define patterns for Working and Todo states with Publish Stage colors
    svg += renderDefs(PUBLISH_STAGE_COLORS);


    // Define outer arc paths for months (use outerLabels which may be chronological ticks)
    svg += renderMonthLabelDefs({ months: outerLabels, monthLabelRadius, chronologueDateRadius });


    // Close defs act
    svg += `</defs>`;

    // Open static container (non-rotating root)
    svg += `<g id="timeline-root">`;





    // Get current month index (0-11)
    const currentMonthIndex = new Date().getMonth();

    // Store boundary labels (first/last) to render on top later in chronologue mode
    let boundaryLabelsHtml = '';

    const outerLabelRender = renderOuterLabelTexts({
        outerLabels,
        isChronologueMode,
        currentMonthIndex
    });
    svg += outerLabelRender.labelsSvg;
    boundaryLabelsHtml = outerLabelRender.boundaryLabelsHtml;

    // --- Draw Act labels early (below story beat labels) into rotatable group later ---

    // First add the progress ring (RAINBOW YEAR PROGRESS)
    // Calculate year progress
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    const yearProgress = (now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24 * 365);
    // TEMP TEST: Force full year display to see all colors
    // const yearProgress = 1; // TEMP TEST: Force 100% to display all segments

    // Create progress ring
    const progressRadius = lineInnerRadius + 15;
    const estimateResult: CompletionEstimate | null = plugin.calculateCompletionEstimate(scenes);
    const circumference = 2 * Math.PI * progressRadius;
    // const progressLength = circumference * yearProgress; // No longer needed for arc calc
    const currentYearStartAngle = -Math.PI / 2; // Start at 12 o'clock
    const currentYearEndAngle = currentYearStartAngle + (2 * Math.PI * yearProgress);

    // Define rainbow gradients for the segments
    svg += renderProgressRingBaseLayer({
        progressRadius,
        estimateResult
    });


    // Month spokes and inner labels (always calendar months)
    svg += renderCalendarSpokesLayer({
        months,
        lineInnerRadius,
        monthTickEnd,
        currentMonthIndex,
        subplotOuterRadius,
        isChronologueMode
    });

    // Add outer chronological tick marks in Chronologue mode
    if (isChronologueMode) {
        const ticksSvg = renderChronologueOuterTicks({
            outerLabels,
            monthTickStart,
            monthTickEnd
        });
        if (ticksSvg) {
            svg += ticksSvg;
        }
    }


    // Draw the year progress ring segments
    svg += renderProgressRing({ progressRadius, yearProgress, currentYearStartAngle, segmentCount: 6 });



    // Target completion tick/marker
    svg += renderTargetDateTick({ plugin, progressRadius, dateToAngle });


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
        // When using When date sorting, all scenes are in act 0
        // When using manuscript order, use the scene's actual act
        const currentMode = (plugin.settings as any).currentMode || 'narrative';
        const isChronologueMode = currentMode === 'chronologue';
        const sortByWhen = isChronologueMode ? true : ((plugin.settings as any).sortByWhenDate ?? false);

        const sceneActNumber = scene.actNumber !== undefined ? scene.actNumber : 1;
        const actIndex = sortByWhen ? 0 : (sceneActNumber - 1);
        const scenesInActAndSubplot = (scenesByActAndSubplot[actIndex] && scenesByActAndSubplot[actIndex][subplot]) || [];

        // Never generate inner-ring synopses for Plot notes here
        if (isBeatNote(scene)) {
            return;
        }

        const filteredScenesForIndex = scenesInActAndSubplot.filter(s => !isBeatNote(s));
        const sceneIndex = filteredScenesForIndex.indexOf(scene);

        const sceneUniqueKey = scene.path || `${scene.title || ''}::${scene.number ?? ''}::${scene.when ?? ''}`;
        const sceneId = makeSceneId(actIndex, ring, sceneIndex, false, false, sceneUniqueKey);

        // Extract grade from 2beats using helper function
        extractGradeFromScene(scene, sceneId, sceneGrades, plugin);

        appendSynopsisElementForScene({
            plugin,
            scene,
            sceneId,
            maxTextWidth,
            masterSubplotOrder,
            scenes,
            targets: synopsesElements
        });
    });

    // Open rotatable container – scenes and act labels/borders only
    svg += `<g id="timeline-rotatable">`;
    // Track last story beat label end-angle per act to prevent overlap when laying out labels
    const lastBeatEndByAct: { [key: string]: number } = {};

    // Only show Act labels when using manuscript order (not When date sorting)
    if (!sortByWhen) {
        // --- Draw Act labels at fixed radius ---
        svg += renderActLabels({ NUM_ACTS, outerMostOuterRadius: ACT_LABEL_RADIUS, actLabelOffset: 0, maxStageColor });
    }

    // Initialize beat angles map for Gossamer (clear any stale data from previous render)
    (plugin as any)._beatAngles = new Map();

    // Store manuscript-order scene positions for Level 4 duration arcs (keyed by scene path or title)
    // Initialize map if in Chronologue mode so RingRenderer can populate it
    const manuscriptOrderPositions: Map<string, { startAngle: number; endAngle: number }> | undefined = isChronologueMode ? new Map() : undefined;

    // Determine how many acts to render based on sorting method
    // When date sorting: Use full 360° circle (only "act 0")
    // Manuscript order: Use 3 Act zones of 120° each
    const actsToRender = sortByWhen ? 1 : NUM_ACTS;

    const stopRingRender = startPerfSegment(plugin, 'timeline.render-rings');

    const ringRenderContext: RingRenderContext = {
        plugin,
        scenes,
        actsToRender,
        sortByWhen,
        isChronologueMode,
        forceChronological,
        masterSubplotOrder,
        ringStartRadii,
        ringWidths,
        scenesByActAndSubplot,
        PUBLISH_STAGE_COLORS,
        maxTextWidth,
        synopsesElements,
        sceneGrades,
        manuscriptOrderPositions
    };

    svg += renderRings(ringRenderContext);

    stopRingRender();

    // After all scenes are drawn, add just the act borders (vertical lines only)
    svg += renderActBorders({ NUM_ACTS, innerRadius, outerRadius: subplotOuterRadius });

    if (shouldShowSubplotRings(plugin)) {
        svg += renderSubplotDominanceIndicators({
            masterSubplotOrder,
            ringStartRadii,
            ringWidths,
            subplotStates: subplotDominanceStates,
            subplotColorFor
        });
    }

    // Calculate the actual outermost outerRadius (first ring's outer edge)
    const actualOuterRadius = ringStartRadii[NUM_RINGS - 1] + ringWidths[NUM_RINGS - 1];

    // (Act labels moved earlier to be under story beat labels)

    // Add color key with decorative elements
    const keyX = size / 2 - 200; // Position from right edge
    const keyY = -size / 2 + 50; // Position from top
    const swatchSize = 20;
    const textOffset = 30;
    const lineHeight = GRID_LINE_HEIGHT; // Reduced for tighter spacing

    // Calculate grid data (status counts, grid counts, estimates)
    const { statusCounts, gridCounts, estimatedTotalScenes } = computeGridData(scenes);

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
    // define arrays for grid rendering
    const stagesForGrid = [...STAGES_FOR_GRID];
    const statusesForGrid = [...STATUSES_FOR_GRID];

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



    const currentYearLabel = String(new Date().getFullYear());
    const headerY = startYGrid - (cellGapY + GRID_HEADER_OFFSET_Y);



    // Determine the most advanced stage index present in the grid
    let maxStageIdxForGrid = -1;
    for (let i = 0; i < stagesForGrid.length; i++) {
        const rc = gridCounts[stagesForGrid[i]];
        const rowTotal = (rc.Todo || 0) + (rc.Working || 0) + (rc.Due || 0) + (rc.Completed || 0);
        if (rowTotal > 0) maxStageIdxForGrid = i;
    }





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
    if (estimateResult && (plugin.settings as any).showCompletionEstimate !== false) {
        svg += renderEstimatedDateElements({ estimateDate: estimateResult.date, progressRadius });
    }

    // Subplot label background layer
    svg += `<g class="background-layer">`;
    svg += renderSubplotLabels({ NUM_RINGS, ringStartRadii, ringWidths, masterSubplotOrder, plugin });
    svg += `</g>`;

    // Add number squares after background layer but before synopses
    const numberSquareContext: NumberSquareRenderContext = {
        plugin,
        scenes,
        scenesByActAndSubplot,
        masterSubplotOrder,
        ringStartRadii,
        ringWidths,
        sceneGrades,
        sceneNumbersMap,
        numberSquareVisualResolver: numberSquareVisualResolver || null,
        shouldApplyNumberSquareColors
    };

    svg += renderNumberSquares(numberSquareContext);

    // Close rotatable container
    svg += `</g>`;

    let chronologueOverlaysHtml = '';
    // Add Chronologue mode arcs
    if (isChronologueMode) {
        chronologueOverlaysHtml = renderChronologueOverlays({
            plugin,
            scenes,
            subplotOuterRadius,
            manuscriptOrderPositions,
            ringStartRadii,
            ringWidths,
            masterSubplotOrder,
            chronologueSceneEntries,
            durationArcRadius: CHRONOLOGUE_DURATION_ARC_RADIUS,
            synopsesElements,
            maxTextWidth
        });
    }

    // Serialize synopses to string and store HTML for later insertion
    const synopsisHTML = serializeSynopsesToString(synopsesElements);

    // --- Gossamer momentum layer ---
    svg += renderGossamerOverlay({
        plugin,
        scenes,
        innerRadius,
        actualOuterRadius,
        ringStartRadii,
        numRings: NUM_RINGS,
        publishStageColors: PUBLISH_STAGE_COLORS
    });

    // Add synopses LAST so they appear on top of everything (including gossamer plots and Chronologue arcs)
    svg += chronologueOverlaysHtml;

    // Render boundary date labels on top of chronologue arcs
    if (isChronologueMode && boundaryLabelsHtml) {
        svg += boundaryLabelsHtml;
    }

    svg += synopsisHTML;

    // Close static root container
    svg += `</g>`;

    // Add rotation toggle control (non-rotating UI), positioned above top edge (Act 2 marker vicinity)
    // Place the button near the Act 2 label (start of Act 2 boundary) and slightly outside along local y-axis
    svg += renderRotationToggle({ numActs: NUM_ACTS, actualOuterRadius });

    // Add version indicator (bottom-right corner)
    try {
        const versionService = getVersionCheckService();
        svg += renderVersionIndicator({
            version: versionService.getCurrentVersion(),
            hasUpdate: versionService.isUpdateAvailable(),
            latestVersion: versionService.getLatestVersion() || undefined
        });
    } catch {
        // Version service not initialized yet - render without update info
        // Will be updated on next render after version check completes
    }

    // Add help icon (bottom-right corner)
    svg += renderHelpIcon();

    // Add JavaScript to handle synopsis visibility
    const scriptSection = ``;

    // If not in debug mode, close SVG normally
    svg += `${scriptSection}</svg>`;

    const generatedSvgString = svg; // Assuming svg holds the final string

    // Find the max stage color (assuming maxStageColor variable exists here)
    // const maxStageColor = ... // Needs to be defined/calculated earlier

    // Return both the string and the color
    stopTotalPerf();
    return { svgString: generatedSvgString, maxStageColor: maxStageColor };
}
