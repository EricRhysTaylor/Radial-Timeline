/**
 * Radial Timeline Plugin for Obsidian — Renderer
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import { NUM_ACTS, GRID_CELL_BASE, GRID_CELL_WIDTH_EXTRA, GRID_CELL_GAP_X, GRID_CELL_GAP_Y, GRID_HEADER_OFFSET_Y, GRID_LINE_HEIGHT, STAGE_ORDER, STAGES_FOR_GRID, STATUSES_FOR_GRID, STATUS_COLORS, SceneNumberInfo } from '../utils/constants';
import type { TimelineItem } from '../types';
import { formatNumber, escapeXml } from '../utils/svg';
import { dateToAngle, isOverdueDateString } from '../utils/date';
import { parseSceneTitle, normalizeStatus, parseSceneTitleComponents, getScenePrefixNumber, getNumberSquareSize } from '../utils/text';
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
    BEAT_TITLE_INSET,
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
import type { CompletionEstimate } from './utils/Estimation';
import { renderProgressRingBaseLayer } from './utils/ProgressRing';


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
        const maxTextWidth = MAX_TEXT_WIDTH;
        
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
                       xmlns="http://www.w3.org/2000/svg" class="radial-timeline-svg" 
                       preserveAspectRatio="xMidYMid meet">`;
        

        // Hidden config group consumed by the stylesheet (e.g. to tint buttons, etc.)
        svg += `<g id="timeline-config-data" data-max-stage-color="${maxStageColor}"></g>`;

        // Create defs for patterns and gradients
        svg += `<defs>`;
        
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
        
        // Use appropriate subplot outer radius based on mode (needed for ring rendering)
        const subplotOuterRadius = isChronologueMode 
            ? SUBPLOT_OUTER_RADIUS_CHRONOLOGUE 
            : isSubplotMode 
            ? SUBPLOT_OUTER_RADIUS_MAINPLOT 
            : SUBPLOT_OUTER_RADIUS_STANDARD;
        
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
    
        // **Include the `<style>` code here**
        svg = `<svg width="${size}" height="${size}" viewBox="-${size / 2} -${size / 2} ${size} ${size}" xmlns="http://www.w3.org/2000/svg" class="radial-timeline-svg" ${isChronologueMode ? 'data-chronologue-mode="true"' : ''} preserveAspectRatio="xMidYMid meet">`;
        

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
        const estimateResult: CompletionEstimate | null = plugin.settings.showEstimate === false
            ? null
            : plugin.calculateCompletionEstimate(scenes);
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

            const sceneId = makeSceneId(actIndex, ring, sceneIndex, false, false);
            
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
        let manuscriptOrderPositions: Map<string, { startAngle: number; endAngle: number }> | undefined;

        // Determine how many acts to render based on sorting method
        // When date sorting: Use full 360° circle (only "act 0")
        // Manuscript order: Use 3 Act zones of 120° each
        const actsToRender = sortByWhen ? 1 : NUM_ACTS;
        
        const stopRingRender = startPerfSegment(plugin, 'timeline.render-rings');

        // Draw scenes and dummy scenes
        for (let act = 0; act < actsToRender; act++) {
            const totalRings = NUM_RINGS;
            const subplotCount = masterSubplotOrder.length;
            const ringsToUse = Math.min(subplotCount, totalRings);

            for (let ringOffset = 0; ringOffset < ringsToUse; ringOffset++) {
                const ring = totalRings - ringOffset - 1; // Start from the outermost ring
                
                const innerR = ringStartRadii[ring];
                const outerR = innerR + ringWidths[ring];
                
                // Calculate angles based on sorting method
                let startAngle: number;
                let endAngle: number;
                
                if (sortByWhen) {
                    // When date mode: Full 360° circle
                    startAngle = -Math.PI / 2; // Start at top (12 o'clock)
                    endAngle = (3 * Math.PI) / 2; // Full circle
                } else {
                    // Manuscript mode: 120° wedges for each Act
                    startAngle = (act * 2 * Math.PI) / NUM_ACTS - Math.PI / 2;
                    endAngle = ((act + 1) * 2 * Math.PI) / NUM_ACTS - Math.PI / 2;
                }
                
                // Compute which content to show for this ring
                const subplot = masterSubplotOrder[ringOffset];
                const isOuterRing = ringOffset === 0;

                // Special handling: when outer ring narrative mode is ON, draw each subplot's scenes
                // in the outer ring using the same angular positions they have in their own subplot rings.
                if (isOuterRing && shouldShowAllScenesInOuterRing(plugin)) {
                    // Use the outer scope sortByWhen and forceChronological variables (already set at line 540-541)
                    
                    // Build a single combined, manuscript-ordered list of items (unique by path for scenes
                    // and unique by title+act for Plot notes) for this act only.
                    const seenPaths = new Set<string>();
                    const seenPlotKeys = new Set<string>();
                    const combined: TimelineItem[] = [];
                    
                    // Group scenes by path to handle scenes in multiple subplots
                    const scenesByPath = new Map<string, TimelineItem[]>();
                    scenes.forEach(s => {
                        // When using When date sorting, include all scenes (ignore Act)
                        // When using manuscript order, filter by Act
                        if (!sortByWhen) {
                            const sAct = s.actNumber !== undefined ? s.actNumber - 1 : 0;
                            if (sAct !== act) return;
                        }
                        
                        if (isBeatNote(s)) {
                            // Skip beats entirely in Chronologue mode - beats should never appear
                            if (isChronologueMode) return;
                            
                            // Plot notes are handled separately (no multi-subplot logic needed)
                            const pKey = `${String(s.title || '')}::${String(s.actNumber ?? '')}`;
                            if (!seenPlotKeys.has(pKey)) {
                                seenPlotKeys.add(pKey);
                                combined.push(s);
                            }
                        } else {
                            // Group scenes by path
                            const key = s.path || `${s.title || ''}::${String(s.when || '')}`;
                            if (!scenesByPath.has(key)) {
                                scenesByPath.set(key, []);
                            }
                            scenesByPath.get(key)!.push(s);
                        }
                    });
                    
                    // Now process grouped scenes, selecting the appropriate one for each path
                    scenesByPath.forEach((scenesForPath, pathKey) => {
                        if (seenPaths.has(pathKey)) return;
                        seenPaths.add(pathKey);
                        
                        // Select which Scene object to use based on dominant subplot preference
                        const scenePath = scenesForPath[0].path;
                        const resolution = resolveDominantScene({
                            scenePath,
                            candidateScenes: scenesForPath,
                            masterSubplotOrder,
                            dominantSubplots: plugin.settings.dominantSubplots
                        });

                        if (scenePath && resolution.storedPreference && !resolution.preferenceMatched && plugin.settings.dominantSubplots) {
                            delete plugin.settings.dominantSubplots[scenePath];
                        }

                        combined.push(resolution.scene);
                        
                        // Extract grade from 2beats for All Scenes mode using helper
                        const sceneIndex = combined.length - 1; // Current index in combined array
                        const allScenesSceneId = makeSceneId(act, NUM_RINGS - 1, sceneIndex, true, true);
                        extractGradeFromScene(resolution.scene, allScenesSceneId, sceneGrades, plugin);
                    });
                    
                    // Sort the combined array - Chronologue mode forces chronological
                    const sortedCombined = sortScenes(combined, sortByWhen, forceChronological);

                    // Compute angular positions for all combined items
                    const positions = computePositions(innerR, outerR, startAngle, endAngle, sortedCombined);
                    
                    // Store positions for Level 4 duration arcs (chronologue mode only)
                    // Create a map keyed by scene identifier (path or title) for lookup
                    if (isChronologueMode) {
                        manuscriptOrderPositions = new Map();
                        sortedCombined.forEach((scene, idx) => {
                            const position = positions.get(idx);
                            if (position) {
                                // Use path as primary key, fallback to title for scenes without paths
                                const key = scene.path || `title:${scene.title || ''}`;
                                manuscriptOrderPositions!.set(key, position);
                            }
                        });
                    }

                    // Stacking removed

                    // Story beat labels will be measured and adjusted after SVG is rendered
                    const beatTextRadius = outerR - BEAT_TITLE_INSET;

                    sortedCombined.forEach((scene, idx) => {
                            const { number, text } = parseSceneTitle(scene.title || '', scene.number);
                        const position = positions.get(idx)!;
                            const sceneStartAngle = position.startAngle;
                            const sceneEndAngle = position.endAngle;
                        
                        // Extend plot slices slightly beyond the outer ring for a subtle "poke"
                        const effectiveOuterR = isBeatNote(scene) ? (outerR + 2) : outerR;
                        
                        // Capture exact angles and geometry for Gossamer plot beats
                        if (isBeatNote(scene) && scene.title) {
                            // Strip the scene number prefix (e.g., "1 Opening Image" -> "Opening Image")
                            const titleWithoutNumber = scene.title.replace(/^\s*\d+(?:\.\d+)?\s+/, '').trim();
                            // Use exact title (no normalization) for angle lookup
                            const center = (sceneStartAngle + sceneEndAngle) / 2;
                            (plugin as any)._beatAngles.set(titleWithoutNumber, center);
                            // Also capture slice geometry for gossamer outlines
                            if (!(plugin as any)._beatSlices) (plugin as any)._beatSlices = new Map();
                            (plugin as any)._beatSlices.set(titleWithoutNumber, {
                                startAngle: sceneStartAngle,
                                endAngle: sceneEndAngle,
                                innerR: innerR,
                                outerR: effectiveOuterR
                            });
                        }
                        
                        // Scene titles: fixed inset from the top (outer) boundary of the cell
                        const textPathRadius = Math.max(innerR, outerR - SCENE_TITLE_INSET);

                        const color = getFillForScene(scene, PUBLISH_STAGE_COLORS, subplotColorFor, true, forceSubplotFillColors);
                        const arcPath = sceneArcPath(innerR, effectiveOuterR, sceneStartAngle, sceneEndAngle);
                        const sceneId = makeSceneId(act, ring, idx, true, true);
                        
                        // --- Create synopsis for OUTER ring item using matching ID ---
                        appendSynopsisElementForScene({
                            plugin,
                            scene,
                            sceneId,
                            maxTextWidth,
                            masterSubplotOrder,
                            scenes,
                            targets: synopsesElements
                        });
                        let sceneClasses = 'rt-scene-path';
                        if (scene.path && plugin.openScenePaths.has(scene.path)) sceneClasses += ' rt-scene-is-open';
                        const dyOffset = 0; // keep scene titles exactly on the midline path

                        // Use a single y-axis (radius) for all story beat labels; no outward stacking
                        // Story beat titles are inset a fixed amount from the outer scene edge
                        const beatTextRadius = outerR - BEAT_TITLE_INSET;

                        // Strip numeric prefix for beat titles
                        const rawTitleFull = (() => {
                            const full = scene.title || '';
                            const m = full.match(/^(?:\s*\d+(?:\.\d+)?\s+)?(.+)/);
                            return m ? m[1] : full;
                        })();
                        
                        // Initial rendering uses a generous estimate - will be adjusted after DOM insertion
                        const estimatedWidth = estimatePixelsFromTitle(rawTitleFull, BEAT_FONT_PX, ESTIMATE_FUDGE_RENDER, PADDING_RENDER_PX);
                        const labelStartAngle = sceneStartAngle;
                        const labelEndAngle = sceneStartAngle + (estimatedWidth / beatTextRadius);
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
                            if (isBeatNote(scene)) {
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
                            ${isBeatNote(scene) ? `` : ``}

                            ${!isBeatNote(scene) ? `
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
                                  d="M ${formatNumber(beatTextRadius * Math.cos(labelStartAngle))} ${formatNumber(beatTextRadius * Math.sin(labelStartAngle))} 
                                     A ${formatNumber(beatTextRadius)} ${formatNumber(beatTextRadius)} 0 ${largeArcFlag} 1 ${formatNumber(beatTextRadius * Math.cos(labelEndAngle))} ${formatNumber(beatTextRadius * Math.sin(labelEndAngle))}" 
                                  data-slice-start="${formatNumber(sceneStartAngle)}" data-radius="${formatNumber(beatTextRadius)}" fill="none"/>
                            <text class="rt-storybeat-title" dy="-3">
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
                        // Chronologue mode always uses chronological sorting
                        const currentMode = (plugin.settings as any).currentMode || 'narrative';
                        const isChronologueMode = currentMode === 'chronologue';
                        const sortByWhen = isChronologueMode ? true : ((plugin.settings as any).sortByWhenDate ?? false);
                        const forceChronological = isChronologueMode;
                        
                        // Build before/after strings for single log output
                        const beforeList = currentScenes.map((s, i) => {
                            const pos = extractPosition(s);
                            return `[${i}]pos:${pos}`;
                        }).join(', ');
                        
                        const sortedCurrentScenes = sortScenes(currentScenes, sortByWhen, forceChronological);
                        
                        const afterList = sortedCurrentScenes.map((s, i) => {
                            const pos = extractPosition(s);
                            return `[${i}]pos:${pos}`;
                        }).join(', ');
                        
                        // Separate Plot notes and Scene notes for different sizing
                        // Suppress Plot notes for ALL rings unless they should be rendered
                        const shouldShowBeats = shouldRenderStoryBeats(plugin);
                        const isOuterRingAllScenes = isOuterRing && shouldShowAllScenesInOuterRing(plugin);
                        const isAllScenesMode = shouldShowAllScenesInOuterRing(plugin);
                        const effectiveScenes = sortedCurrentScenes.filter(scene => !isBeatNote(scene));
                        
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
            
                            // Determine the color of a scene based on current mode + status
                            const color = getFillForScene(
                                scene,
                                PUBLISH_STAGE_COLORS,
                                subplotColorFor,
                                isAllScenesMode,
                                forceSubplotFillColors
                            );
            
                        
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
                            let sceneClasses = "rt-scene-path rt-scene-arc";
                            if (scene.path && plugin.openScenePaths.has(scene.path)) sceneClasses += " rt-scene-is-open";
                            // Don't add search-result class to scene paths anymore
            
                            // In createTimelineSVG method, replace the font size calculation with a fixed size:
                            const fontSize = 18; // Fixed font size for all rings
                            // No vertical offset; follow textPath baseline
            
                            // (No story beat labels rendered in inner rings)
            
                            svg += `
                            ${renderSceneGroup({ scene, act, ring, idx, innerR, outerR, startAngle: sceneStartAngle, endAngle: sceneEndAngle, subplotIdxAttr })}
                                <path id="${sceneId}"
                                      d="${arcPath}" 
                                      fill="${color}" 
                                      class="${sceneClasses}"/>

                                <!-- Scene title path (using only the text part) - Skip for Plot notes -->
                                ${!isBeatNote(scene) ? `
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
                        // Empty subplot ring. When outer-ring-narrative is ON, do NOT place Plot notes here.
                        if (!shouldShowAllScenesInOuterRing(plugin)) {
                            // Only in non-narrative mode do we place Plot notes in empty rings
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
                                const sceneId = `scene-path-${act}-${ring}-${idx}`;
                                svg += renderBeatSlice({ act, ring, idx, innerR, outerR, startAngle: plotStartAngle, endAngle: plotEndAngle, sceneId, beat: plotNote });
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
        const keyX = size/2 - 200; // Position from right edge
        const keyY = -size/2 + 50; // Position from top
        const swatchSize = 20;
        const textOffset = 30;
        const lineHeight = GRID_LINE_HEIGHT; // Reduced for tighter spacing

        // Calculate the number of scenes for each status using a Set to track unique scenes
        // Filter out Plot items, only count Scene items
        const sceneNotesOnly = scenes.filter(scene => !isBeatNote(scene));
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
                    // Handle invalid date format - count scenes with invalid due dates by status
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
            if (isBeatNote(scene)) return;
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
            if (isBeatNote(scene)) return;
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
            if (isBeatNote(scene)) return;
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
        svg += renderSubplotLabels({ NUM_RINGS, ringStartRadii, ringWidths, masterSubplotOrder, plugin });
        svg += `</g>`;

        // Add number squares after background layer but before synopses
        if (shouldShowAllScenesInOuterRing(plugin)) {
            // In outer-ring-narrative mode, draw number squares for ALL rings
            
        svg += `<g class="rt-number-squares">`;
            
            // First, draw squares for the outer ring (all scenes combined)
            const ringOuter = NUM_RINGS - 1;
            const innerROuter = ringStartRadii[ringOuter];
            const outerROuter = innerROuter + ringWidths[ringOuter];
            const squareRadiusOuter = (innerROuter + outerROuter) / 2;

            // Determine number of acts to iterate based on sorting method
            const currentMode = (plugin.settings as any).currentMode || 'narrative';
            const isChronologueMode = currentMode === 'chronologue';
            const sortByWhen = isChronologueMode ? true : ((plugin.settings as any).sortByWhenDate ?? false);
            const actsToRender = sortByWhen ? 1 : NUM_ACTS;

            for (let act = 0; act < actsToRender; act++) {
                let startAngle: number;
                let endAngle: number;
                
                if (sortByWhen) {
                    // When date mode: Full 360° circle
                    startAngle = -Math.PI / 2;
                    endAngle = (3 * Math.PI) / 2;
                } else {
                    // Manuscript mode: 120° wedges
                    startAngle = (act * 2 * Math.PI) / NUM_ACTS - Math.PI / 2;
                    endAngle = ((act + 1) * 2 * Math.PI) / NUM_ACTS - Math.PI / 2;
                }

                // Build combined list for this act (or all scenes if using When date)
                const seenPaths = new Set<string>();
                const seenPlotKeys = new Set<string>();
                const combined: TimelineItem[] = [];

                scenes.forEach(s => {
                    // When using When date sorting, include all scenes (ignore Act)
                    // When using manuscript order, filter by Act
                    if (!sortByWhen) {
                        const sAct = s.actNumber !== undefined ? s.actNumber - 1 : 0;
                        if (sAct !== act) return;
                    }
                    
                    if (isBeatNote(s)) {
                        // Skip beats entirely in Chronologue mode - beats should never appear
                        if (isChronologueMode) return;
                        
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
                
                // CRITICAL: Sort the combined array the same way as main rendering does
                // Chronologue mode always uses chronological sorting
                const forceChronological = isChronologueMode;
                const sortedCombined = sortScenes(combined, sortByWhen, forceChronological);

                // Positions derived from shared geometry using SORTED array
                const positionsDetailed = computePositions(innerROuter, outerROuter, startAngle, endAngle, sortedCombined);
                const positions = new Map<number, { startAngle: number; endAngle: number }>();
                positionsDetailed.forEach((p, i) => positions.set(i, { startAngle: p.startAngle, endAngle: p.endAngle }));

                // Draw squares for non-Plot scenes that have a number
                svg += renderOuterRingNumberSquares({
                    plugin,
                    act,
                    ringOuter,
                    squareRadiusOuter,
                    positions,
                    combined: sortedCombined,
                    sceneGrades,
                    enableSubplotColors: shouldApplyNumberSquareColors,
                    resolveSubplotVisual: numberSquareVisualResolver || undefined
                });
            }
            
            // Then, draw squares for inner subplot rings (excluding Main Plot which is the outer ring)
            svg += renderInnerRingsNumberSquaresAllScenes({
                plugin,
                NUM_RINGS,
                masterSubplotOrder,
                ringStartRadii,
                ringWidths,
                scenesByActAndSubplot,
                scenes,
                sceneGrades,
                enableSubplotColors: shouldApplyNumberSquareColors,
                resolveSubplotVisual: numberSquareVisualResolver || undefined
            });
            
            svg += `</g>`;
        } else if (!shouldShowAllScenesInOuterRing(plugin)) {
            svg += renderNumberSquaresStandard({
                plugin,
                NUM_RINGS,
                masterSubplotOrder,
                ringStartRadii,
                ringWidths,
                scenesByActAndSubplot,
                scenes,
                sceneGrades,
                sceneNumbersMap,
                enableSubplotColors: shouldApplyNumberSquareColors,
                resolveSubplotVisual: numberSquareVisualResolver || undefined
            });
        }
        
        // Close rotatable container
        svg += `</g>`;
        
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

        // Add synopses LAST so they appear on top of everything (including gossamer plots)
        svg += synopsisHTML;

        // Close static root container
        svg += `</g>`;

        // Add rotation toggle control (non-rotating UI), positioned above top edge (Act 2 marker vicinity)
        // Place the button near the Act 2 label (start of Act 2 boundary) and slightly outside along local y-axis
        svg += renderRotationToggle({ numActs: NUM_ACTS, actualOuterRadius });

        // Add Chronologue mode arcs
        if (isChronologueMode) {
            svg += renderChronologueOverlays({
                plugin,
                scenes,
                subplotOuterRadius,
                manuscriptOrderPositions,
                ringStartRadii,
                ringWidths,
                chronologueSceneEntries,
                durationArcRadius: CHRONOLOGUE_DURATION_ARC_RADIUS
            });

            // Render boundary date labels on top of chronologue arcs
            if (boundaryLabelsHtml) {
                svg += boundaryLabelsHtml;
            }
        }

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
