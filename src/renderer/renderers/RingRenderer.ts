import type { TimelineItem } from '../../types';
import { formatNumber, escapeXml } from '../../utils/svg';
import { parseSceneTitle } from '../../utils/text';
import {
    isBeatNote,
    type PluginRendererFacade,
    sortScenes,
    extractPosition,
    extractGradeFromScene
} from '../../utils/sceneHelpers';
import { makeSceneId } from '../../utils/numberSquareHelpers';
import {
    TEXTPATH_START_NUDGE_RAD,
    BEAT_TEXT_RADIUS,
    BEAT_FONT_PX,
    ESTIMATE_FUDGE_RENDER,
    PADDING_RENDER_PX,
    SCENE_TITLE_INSET
} from '../layout/LayoutConstants';
import { computePositions } from '../utils/SceneLayout';
import { getFillForScene } from '../utils/SceneFill';
import { estimatePixelsFromTitle } from '../utils/LabelMetrics';
import { sceneArcPath, renderVoidCellPath } from '../components/SceneArcs';
import { renderSceneGroup } from '../components/Scenes';
import { shouldRenderStoryBeats, shouldShowAllScenesInOuterRing } from '../modules/ModeRenderingHelpers';
import { appendSynopsisElementForScene } from '../utils/SynopsisBuilder';
import { resolveDominantScene } from '../components/SubplotDominanceIndicators';
import type { StageColorMap } from '../utils/Gossamer';
import { getReadabilityMultiplier } from '../../utils/readability';

export interface RingRenderContext {
    plugin: PluginRendererFacade;
    scenes: TimelineItem[];
    actsToRender: number;
    sortByWhen: boolean;
    isChronologueMode: boolean;
    forceChronological: boolean;
    masterSubplotOrder: string[];
    colorIndexBySubplot: Map<string, number>;
    ringStartRadii: number[];
    ringWidths: number[];
    scenesByActAndSubplot: Record<number, Record<string, TimelineItem[]>>;
    PUBLISH_STAGE_COLORS: StageColorMap;
    maxTextWidth: number;
    synopsesElements: SVGGElement[];
    sceneGrades: Map<string, string>;
    manuscriptOrderPositions?: Map<string, { startAngle: number; endAngle: number }>;
    numActs: number;
    /** APR mode - suppress all text rendering */
    isAprMode?: boolean;
    /** APR reveal options */
    aprShowSubplots?: boolean;  // Show all rings vs single Main Plot ring
    aprShowActs?: boolean;      // Show act divisions vs full circle  
    aprShowStatus?: boolean;    // Show real stage colors vs neutral gray
}

export function renderRings(ctx: RingRenderContext): string {
    const {
        plugin,
        scenes,
        actsToRender,
        sortByWhen,
        isChronologueMode,
        forceChronological,
        masterSubplotOrder,
        colorIndexBySubplot,
        ringStartRadii,
        ringWidths,
        scenesByActAndSubplot,
        PUBLISH_STAGE_COLORS,
        maxTextWidth,
        synopsesElements,
        sceneGrades,
        manuscriptOrderPositions,
        numActs,
        isAprMode = false,
        aprShowSubplots = true,
        aprShowActs = true,
        aprShowStatus = true
    } = ctx;

    let svg = '';
    const fontScale = getReadabilityMultiplier(plugin.settings as any);
    const NUM_RINGS = masterSubplotOrder.length;
    const readabilityScale = (plugin.settings as any).readabilityScale || 'normal';
    // Use the value from constant, handling the structure
    const beatTextRadius = BEAT_TEXT_RADIUS[readabilityScale as keyof typeof BEAT_TEXT_RADIUS] || BEAT_TEXT_RADIUS.normal;

    const resolveSubplotColorIndex = (subplotName: string): number => {
        const key = subplotName && subplotName.trim().length > 0 ? subplotName : 'Main Plot';
        if (colorIndexBySubplot.has(key)) return colorIndexBySubplot.get(key)!;
        const fallback = colorIndexBySubplot.get('Main Plot');
        return fallback !== undefined ? fallback : 0;
    };

    // Helper for subplot color check
    const subplotColorFor = (subplotName: string) => {
        const normalized = resolveSubplotColorIndex(subplotName) % 16;
        const varName = `--rt-subplot-colors-${normalized}`;
        // Note: getComputedStyle is DOM-dependent, might not be ideal in all contexts but keeping extracted logic same
        try {
            // In node env or non-browser this might fail or return empty.
            // Assuming this runs in browser context where document exists.
            const computed = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
            return computed || '#EFBDEB';
        } catch (e) {
            return '#EFBDEB';
        }
    };

    // Check if we need to force subplot fill colors
    const currentMode = (plugin.settings as any).currentMode || 'narrative';
    const forceSubplotFillColors = currentMode === 'narrative' || currentMode === 'chronologue';

    // Loop through Acts
    for (let act = 0; act < actsToRender; act++) {
        const totalRings = NUM_RINGS;
        const subplotCount = masterSubplotOrder.length;
        const ringsToUse = Math.min(subplotCount, totalRings);

        // In APR mode with showSubplots=false, only render the outermost ring
        const maxRingOffset = (isAprMode && !aprShowSubplots) ? 1 : ringsToUse;
        
        for (let ringOffset = 0; ringOffset < maxRingOffset; ringOffset++) {
            const ring = totalRings - ringOffset - 1; // Start from outermost

            const innerR = ringStartRadii[ring];
            const outerR = innerR + ringWidths[ring];

            // Calculate angles
            let startAngle: number;
            let endAngle: number;

            if (sortByWhen) {
                startAngle = -Math.PI / 2;
                endAngle = (3 * Math.PI) / 2;
            } else {
                // Manuscript mode: divide full circle by configured acts
                const totalActsDivisor = actsToRender || numActs;
                startAngle = (act * 2 * Math.PI) / totalActsDivisor - Math.PI / 2;
                endAngle = ((act + 1) * 2 * Math.PI) / totalActsDivisor - Math.PI / 2;
            }

            const subplot = masterSubplotOrder[ringOffset];
            if (subplot === 'Backdrop') continue; // SKIP VIRTUAL BACKDROP SUBPLOT

            const isOuterRing = ringOffset === 0;

            // --- Outer Ring Special Handling ---
            if (isOuterRing && shouldShowAllScenesInOuterRing(plugin)) {
                // Build combined list for this Act
                const seenPaths = new Set<string>();
                const seenPlotKeys = new Set<string>();
                const combined: TimelineItem[] = [];

                const scenesByPath = new Map<string, TimelineItem[]>();
                scenes.forEach(s => {
                    if (s.itemType === 'Backdrop') return; // EXCLUDE BACKDROP

                    if (!sortByWhen) {
                        const sAct = s.actNumber !== undefined ? s.actNumber - 1 : 0;
                        if (sAct !== act) return;
                    }

                    if (isBeatNote(s)) {
                        if (isChronologueMode) return;
                        const pKey = `${String(s.title || '')}::${String(s.actNumber ?? '')}`;
                        if (!seenPlotKeys.has(pKey)) {
                            seenPlotKeys.add(pKey);
                            combined.push(s);
                        }
                    } else {
                        const key = s.path || `${s.title || ''}::${String(s.when || '')}`;
                        if (!scenesByPath.has(key)) {
                            scenesByPath.set(key, []);
                        }
                        scenesByPath.get(key)!.push(s);
                    }
                });

                scenesByPath.forEach((scenesForPath, pathKey) => {
                    if (seenPaths.has(pathKey)) return;
                    seenPaths.add(pathKey);

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

                    // Extract grade
                    const sceneIndex = combined.length - 1;
                    const uniqueKey = resolution.scene?.path || `${resolution.scene?.title || ''}::${resolution.scene?.number ?? ''}::${resolution.scene?.when ?? ''}`;
                    const allScenesSceneId = makeSceneId(act, NUM_RINGS - 1, sceneIndex, true, true, uniqueKey);
                    extractGradeFromScene(resolution.scene, allScenesSceneId, sceneGrades, plugin);
                });

                const sortedCombined = sortScenes(combined, sortByWhen, forceChronological);
                const positions = computePositions(innerR, outerR, startAngle, endAngle, sortedCombined);

                // Store positions for Level 4 duration arcs (chronologue mode only)
                if (isChronologueMode && manuscriptOrderPositions) {
                    sortedCombined.forEach((scene, idx) => {
                        const position = positions.get(idx);
                        if (position) {
                            // Use path as primary key, fallback to title for scenes without paths
                            const key = scene.path || `title:${scene.title || ''}`;
                            manuscriptOrderPositions.set(key, position);
                        }
                    });
                }

                // Render
                sortedCombined.forEach((scene, idx) => {
                    const { text } = parseSceneTitle(scene.title || '', scene.number);
                    const position = positions.get(idx)!;
                    const sceneStartAngle = position.startAngle;
                    const sceneEndAngle = position.endAngle;

                    const effectiveOuterR = isBeatNote(scene) ? (outerR + 2) : outerR;

                    // Capture beat angles for Gossamer
                    if (isBeatNote(scene) && scene.title) {
                        const titleWithoutNumber = scene.title.replace(/^\s*\d+(?:\.\d+)?\s+/, '').trim();
                        const center = (sceneStartAngle + sceneEndAngle) / 2;
                        (plugin as any)._beatAngles.set(titleWithoutNumber, center);
                        if (!(plugin as any)._beatSlices) (plugin as any)._beatSlices = new Map();
                        (plugin as any)._beatSlices.set(titleWithoutNumber, {
                            startAngle: sceneStartAngle,
                            endAngle: sceneEndAngle,
                            innerR: innerR,
                            outerR: effectiveOuterR
                        });
                    }

                    const sceneTitleInset = SCENE_TITLE_INSET + ((fontScale - 1) * 18);
                    const textPathRadius = Math.max(innerR, outerR - sceneTitleInset);
                    const textPathLargeArcFlag = (sceneEndAngle - (sceneStartAngle + TEXTPATH_START_NUDGE_RAD)) > Math.PI ? 1 : 0;

                    // In APR mode with showStatus=false, use neutral Zero stage color for all scenes
                    const color = (isAprMode && !aprShowStatus) 
                        ? PUBLISH_STAGE_COLORS.Zero 
                        : getFillForScene(scene, PUBLISH_STAGE_COLORS, subplotColorFor, true, forceSubplotFillColors);
                    const arcPathStr = sceneArcPath(innerR, effectiveOuterR, sceneStartAngle, sceneEndAngle);
                    const sceneUniqueKey = scene.path || `${scene.title || ''}::${scene.number ?? ''}::${scene.when ?? ''}`;
                    const sceneId = makeSceneId(act, ring, idx, true, true, sceneUniqueKey);

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
                    const dyOffset = 0;

                    // Beat title estimation
                    const rawTitleFull = (() => {
                        const full = scene.title || '';
                        const m = full.match(/^(?:\s*\d+(?:\.\d+)?\s+)?(.+)/);
                        return m ? m[1] : full;
                    })();

                    const estimatedWidth = estimatePixelsFromTitle(
                        rawTitleFull,
                        BEAT_FONT_PX * fontScale,
                        ESTIMATE_FUDGE_RENDER,
                        PADDING_RENDER_PX * fontScale
                    );
                    const labelStartAngle = sceneStartAngle;
                    const labelEndAngle = sceneStartAngle + (estimatedWidth / beatTextRadius);
                    const desiredAngleArc = labelEndAngle - labelStartAngle;
                    const largeArcFlag = desiredAngleArc > Math.PI ? 1 : 0;

                    const subplotIdxAttr = (() => {
                        const name = scene.subplot && scene.subplot.trim().length > 0 ? scene.subplot : 'Main Plot';
                        return Math.max(0, masterSubplotOrder.indexOf(name));
                    })();
                    const subplotColorIdxAttr = resolveSubplotColorIndex(scene.subplot || 'Main Plot');

                    const plotStrokeAttr = (() => {
                        if (isBeatNote(scene)) {
                            const publishStage = scene['Publish Stage'] || 'Zero';
                            const stageColor = PUBLISH_STAGE_COLORS[publishStage as keyof typeof PUBLISH_STAGE_COLORS] || PUBLISH_STAGE_COLORS.Zero;
                            return `stroke="${stageColor}" stroke-width="2"`;
                        }
                        return '';
                    })();

                    svg += `
                        ${renderSceneGroup({
                            scene,
                            act,
                            ring,
                            idx,
                            innerR,
                            outerR: effectiveOuterR,
                            startAngle: sceneStartAngle,
                            endAngle: sceneEndAngle,
                            subplotIdxAttr,
                            subplotColorIdxAttr,
                            titleInset: sceneTitleInset
                        })}
                            <path id="${sceneId}"
                                  d="${arcPathStr}" 
                                  fill="${color}" 
                                  ${plotStrokeAttr}
                                  class="${sceneClasses}"/>
                            ${!isAprMode && !isBeatNote(scene) ? `
                            <path id="textPath-${act}-${ring}-outer-${idx}" 
                                  d="M ${formatNumber(textPathRadius * Math.cos(sceneStartAngle + TEXTPATH_START_NUDGE_RAD))} ${formatNumber(textPathRadius * Math.sin(sceneStartAngle + TEXTPATH_START_NUDGE_RAD))} 
                                     A ${formatNumber(textPathRadius)} ${formatNumber(textPathRadius)} 0 ${textPathLargeArcFlag} 1 ${formatNumber(textPathRadius * Math.cos(sceneEndAngle))} ${formatNumber(textPathRadius * Math.sin(sceneEndAngle))}" 
                                  fill="none"/>
                            <text class="rt-scene-title${scene.path && plugin.openScenePaths.has(scene.path) ? ' rt-scene-is-open' : ''}" dy="${dyOffset}" data-scene-id="${sceneId}">
                                <textPath href="#textPath-${act}-${ring}-outer-${idx}" startOffset="4">
                                    ${text}
                                </textPath>
                            </text>` : !isAprMode && isBeatNote(scene) ? `
                            <path id="plot-label-arc-${act}-${ring}-outer-${idx}" 
                                  d="M ${formatNumber(beatTextRadius * Math.cos(labelStartAngle))} ${formatNumber(beatTextRadius * Math.sin(labelStartAngle))} 
                                     A ${formatNumber(beatTextRadius)} ${formatNumber(beatTextRadius)} 0 ${largeArcFlag} 1 ${formatNumber(beatTextRadius * Math.cos(labelEndAngle))} ${formatNumber(beatTextRadius * Math.sin(labelEndAngle))}" 
                                  data-slice-start="${formatNumber(sceneStartAngle)}" data-radius="${formatNumber(beatTextRadius)}" fill="none"/>
                            <text class="rt-storybeat-title" dy="-3">
                                <textPath href="#plot-label-arc-${act}-${ring}-outer-${idx}" startOffset="2">
                                    ${escapeXml(rawTitleFull)}
                                </textPath>
                            </text>
                            ` : ``}
                        </g>`;
                });

                // Void cells
                const totalUsedSpace = Array.from(positions.values()).reduce((sum, p) => sum + p.angularSize, 0);
                const totalAngularSpace = endAngle - startAngle;
                const remainingVoidSpace = totalAngularSpace - totalUsedSpace;
                if (remainingVoidSpace > 0.001) {
                    const voidStartAngle = startAngle + totalUsedSpace;
                    const voidEndAngle = endAngle;
                    svg += renderVoidCellPath(innerR, outerR, voidStartAngle, voidEndAngle);
                }

                continue; // Continue to next ring loop (which iterates rings for this act)
            }

            // --- Inner Rings (or Outer when toggle off) ---
            const currentScenes = subplot ? (scenesByActAndSubplot[act][subplot] || []) : [];

            if (currentScenes && currentScenes.length > 0) {
                const sortedCurrentScenes = sortScenes(currentScenes, sortByWhen, forceChronological);

                const isAllScenesMode = shouldShowAllScenesInOuterRing(plugin);
                const effectiveScenes = sortedCurrentScenes.filter(scene => !isBeatNote(scene));

                const scenePositions = computePositions(innerR, outerR, startAngle, endAngle, effectiveScenes);

                effectiveScenes.forEach((scene, idx) => {
                    const { text } = parseSceneTitle(scene.title || '', scene.number);
                    const position = scenePositions.get(idx);
                    if (!position) return;

                    const sceneStartAngle = position.startAngle;
                    const sceneEndAngle = position.endAngle;
                    const sceneTitleInset = SCENE_TITLE_INSET + ((fontScale - 1) * 18);
                    const textPathRadius = Math.max(innerR, outerR - sceneTitleInset);
                    const textPathLargeArcFlag = (sceneEndAngle - (sceneStartAngle + TEXTPATH_START_NUDGE_RAD)) > Math.PI ? 1 : 0;

                    // In APR mode with showStatus=false, use neutral Zero stage color for all scenes
                    const color = (isAprMode && !aprShowStatus)
                        ? PUBLISH_STAGE_COLORS.Zero
                        : getFillForScene(
                            scene,
                            PUBLISH_STAGE_COLORS,
                            subplotColorFor,
                            isAllScenesMode,
                            forceSubplotFillColors
                        );

                    const arcPathStr = sceneArcPath(innerR, outerR, sceneStartAngle, sceneEndAngle);
                    const sceneUniqueKey = scene.path || `${scene.title || ''}::${scene.number ?? ''}::${scene.when ?? ''}`;
                    const sceneId = makeSceneId(act, ring, idx, false, false, sceneUniqueKey);

                    const subplotIdxAttr = (() => {
                        const name = scene.subplot && scene.subplot.trim().length > 0 ? scene.subplot : 'Main Plot';
                        return Math.max(0, masterSubplotOrder.indexOf(name));
                    })();
                    const subplotColorIdxAttr = resolveSubplotColorIndex(scene.subplot || 'Main Plot');

                    let sceneClasses = "rt-scene-path rt-scene-arc";
                    if (scene.path && plugin.openScenePaths.has(scene.path)) sceneClasses += " rt-scene-is-open";

                    const dyOffset = 0;

                    svg += `
                        ${renderSceneGroup({
                            scene,
                            act,
                            ring,
                            idx,
                            innerR,
                            outerR,
                            startAngle: sceneStartAngle,
                            endAngle: sceneEndAngle,
                            subplotIdxAttr,
                            subplotColorIdxAttr,
                            titleInset: sceneTitleInset
                        })}
                            <path id="${sceneId}"
                                  d="${arcPathStr}" 
                                  fill="${color}" 
                                  class="${sceneClasses}"/>

                            ${!isAprMode && !isBeatNote(scene) ? `
                            <path id="textPath-${act}-${ring}-${idx}" 
                                  d="M ${formatNumber(textPathRadius * Math.cos(sceneStartAngle + TEXTPATH_START_NUDGE_RAD))} ${formatNumber(textPathRadius * Math.sin(sceneStartAngle + TEXTPATH_START_NUDGE_RAD))} 
                                     A ${formatNumber(textPathRadius)} ${formatNumber(textPathRadius)} 0 ${textPathLargeArcFlag} 1 ${formatNumber(textPathRadius * Math.cos(sceneEndAngle))} ${formatNumber(textPathRadius * Math.sin(sceneEndAngle))}" 
                                  fill="none"/>
                            <text class="rt-scene-title${scene.path && plugin.openScenePaths.has(scene.path) ? ' rt-scene-is-open' : ''}" data-scene-id="${sceneId}">
                                <textPath href="#textPath-${act}-${ring}-${idx}" startOffset="4">
                                    ${text}
                                </textPath>
                            </text>` : ``}
                        </g>`;
                });

                // Void cells for inner rings
                const totalUsedSpace = Array.from(scenePositions.values()).reduce((sum, p) => sum + p.angularSize, 0);
                const totalAngularSpace = endAngle - startAngle;
                const remainingVoidSpace = totalAngularSpace - totalUsedSpace;

                if (remainingVoidSpace > 0.001) {
                    const voidStartAngle = startAngle + totalUsedSpace;
                    const voidEndAngle = endAngle;
                    svg += renderVoidCellPath(innerR, outerR, voidStartAngle, voidEndAngle);
                }
            } else {
                // No scenes, render empty void ring
                svg += renderVoidCellPath(innerR, outerR, startAngle, endAngle);
            }
        }
    }

    return svg;
}
