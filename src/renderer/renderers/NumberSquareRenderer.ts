import type { TimelineItem } from '../../types';
import {
    isBeatNote,
    type PluginRendererFacade,
    sortScenes,
    extractGradeFromScene
} from '../../utils/sceneHelpers';
import { makeSceneId } from '../../utils/numberSquareHelpers';
import { computePositions } from '../utils/SceneLayout';
import { resolveDominantScene } from '../components/SubplotDominanceIndicators';
import { shouldShowAllScenesInOuterRing } from '../modules/ModeRenderingHelpers';
import {
    renderOuterRingNumberSquares,
    renderInnerRingsNumberSquaresAllScenes,
    renderNumberSquaresStandard
} from '../components/NumberSquares';
import { parseSceneTitle } from '../../utils/text';
import type { SceneNumberInfo } from '../../utils/constants';
import { getConfiguredActCount } from '../../utils/acts';

// Define the interface for the number square visual resolver logic
export type NumberSquareVisualResolver = (scene: TimelineItem) => { subplotIndex: number };

export interface NumberSquareRenderContext {
    plugin: PluginRendererFacade;
    scenes: TimelineItem[];
    scenesByActAndSubplot: Record<number, Record<string, TimelineItem[]>>;
    masterSubplotOrder: string[];
    ringStartRadii: number[];
    ringWidths: number[];
    sceneGrades: Map<string, string>;
    sceneNumbersMap: Map<string, SceneNumberInfo>;
    numberSquareVisualResolver: NumberSquareVisualResolver | null;
    shouldApplyNumberSquareColors: boolean;
    numActs: number;
}

export function renderNumberSquares(ctx: NumberSquareRenderContext): string {
    const {
        plugin,
        scenes,
        scenesByActAndSubplot,
        masterSubplotOrder,
        ringStartRadii,
        ringWidths,
        sceneGrades,
        sceneNumbersMap,
        numberSquareVisualResolver,
        shouldApplyNumberSquareColors,
        numActs
    } = ctx;

    let svg = '';
    const NUM_RINGS = masterSubplotOrder.length;
    const totalActs = Math.max(3, numActs || getConfiguredActCount(plugin.settings as any));

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
        const actsToRender = sortByWhen ? 1 : totalActs;

        for (let act = 0; act < actsToRender; act++) {
            let startAngle: number;
            let endAngle: number;

            if (sortByWhen) {
                // When date mode: Full 360° circle
                startAngle = -Math.PI / 2;
                endAngle = (3 * Math.PI) / 2;
            } else {
                // Manuscript mode: divide full circle by configured acts
                startAngle = (act * 2 * Math.PI) / totalActs - Math.PI / 2;
                endAngle = ((act + 1) * 2 * Math.PI) / totalActs - Math.PI / 2;
            }

            // Build combined list for this act (or all scenes if using When date)
            const seenPaths = new Set<string>();
            const seenPlotKeys = new Set<string>();
            const combined: TimelineItem[] = [];

            // Group scenes by path first to apply dominant subplot resolution
            const scenesByPathForSquares = new Map<string, TimelineItem[]>();

            scenes.forEach(s => {
                if (s.itemType === 'Backdrop') return; // SKIP BACKDROP

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
                    // Group scenes by path for dominant subplot resolution
                    const key = s.path || `${s.title || ''}::${String(s.when || '')}`;
                    if (!scenesByPathForSquares.has(key)) {
                        scenesByPathForSquares.set(key, []);
                    }
                    scenesByPathForSquares.get(key)!.push(s);
                }
            });

            // Now process grouped scenes, selecting the appropriate one for each path
            // This matches the logic used in the main slice rendering
            scenesByPathForSquares.forEach((scenesForPath, pathKey) => {
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

                combined.push(resolution.scene);
            });

            // CRITICAL: Sort the combined array the same way as main rendering does
            // Chronologue mode always uses chronological sorting
            const forceChronological = isChronologueMode;
            const sortedCombined = sortScenes(combined, sortByWhen, forceChronological);

            // Positions derived from shared geometry using SORTED array
            const positionsDetailed = computePositions(innerROuter, outerROuter, startAngle, endAngle, sortedCombined);
            const positions = new Map<number, { startAngle: number; endAngle: number }>();
            positionsDetailed.forEach((p, i) => positions.set(i, { startAngle: p.startAngle, endAngle: p.endAngle }));

            if (plugin.settings.enableAiSceneAnalysis) {
                sortedCombined.forEach((sceneItem, combinedIdx) => {
                    if (isBeatNote(sceneItem)) return;
                    const uniqueKey = sceneItem.path || `${sceneItem.title || ''}::${sceneItem.number ?? ''}::${sceneItem.when ?? ''}`;
                    const combinedSceneId = makeSceneId(act, ringOuter, combinedIdx, true, true, uniqueKey);
                    extractGradeFromScene(sceneItem, combinedSceneId, sceneGrades, plugin);
                });
            }

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
            resolveSubplotVisual: numberSquareVisualResolver || undefined,
            numActs
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
            resolveSubplotVisual: numberSquareVisualResolver || undefined,
            numActs
        });
    }

    return svg;
}
