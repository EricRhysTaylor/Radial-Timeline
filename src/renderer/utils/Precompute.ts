/*
 * Precompute reusable values for timeline rendering.
 * Extracted from TimelineRenderer to keep that file focused on orchestration.
 */

import type { TimelineItem } from '../../types';
import { shouldRenderStoryBeats } from '../modules/ModeRenderingHelpers';
import { isBeatNote, sortScenes, type PluginRendererFacade } from '../../utils/sceneHelpers';
import {
    SVG_SIZE,
    INNER_RADIUS,
    SUBPLOT_OUTER_RADIUS_MAINPLOT,
    SUBPLOT_OUTER_RADIUS_STANDARD,
    SUBPLOT_OUTER_RADIUS_CHRONOLOGUE,
    MONTH_LABEL_RADIUS,
    BACKDROP_RING_HEIGHT,
    MICRO_RING_GAP,
    MICRO_RING_WIDTH
} from '../layout/LayoutConstants';
import { computeRingGeometry } from '../layout/Rings';
import { buildBackdropMicroRingLayout, type BackdropMicroRingLayout } from '../components/BackdropMicroRings';
import { getMostAdvancedStageColor, getLatestGossamerSweepStageColor } from '../../utils/colour';
import { startPerfSegment } from '../utils/Performance';
import { computeSubplotDominanceStates, type SubplotDominanceState } from '../components/SubplotDominanceIndicators';
import { getReadabilityScale } from '../../utils/readability';
import { getConfiguredActCount } from '../../utils/acts';

export interface PrecomputedRenderValues {
    scenesByActAndSubplot: { [act: number]: { [subplot: string]: TimelineItem[] } };
    masterSubplotOrder: string[];
    colorIndexBySubplot: Map<string, number>;
    totalPlotNotes: number;
    plotIndexByKey: Map<string, number>;
    plotsBySubplot: Map<string, TimelineItem[]>;
    ringWidths: number[];
    ringStartRadii: number[];
    lineInnerRadius: number;
    maxStageColor: string;
    subplotDominanceStates: Map<string, SubplotDominanceState>;
    microRingLayout?: BackdropMicroRingLayout;
}

export function computeCacheableValues(
    plugin: PluginRendererFacade,
    scenes: TimelineItem[]
): PrecomputedRenderValues {
    const stopPrecompute = startPerfSegment(plugin, 'timeline.precompute');

    const currentMode = (plugin.settings as any).currentMode || 'narrative';
    const isChronologueMode = currentMode === 'chronologue';
    const isPublicationMode = currentMode === 'publication';
    const readabilityScale = getReadabilityScale(plugin.settings as any);
    const sortByWhen = isChronologueMode ? true : ((plugin.settings as any).sortByWhenDate ?? false);
    const forceChronological = isChronologueMode;

    const allSubplotsSet = new Set<string>();
    let hasBackdrops = false;
    scenes.forEach(scene => {
        if (scene.itemType === 'Backdrop') {
            hasBackdrops = true;
            return;
        }
        const key = scene.subplot && scene.subplot.trim().length > 0 ? scene.subplot : 'Main Plot';
        allSubplotsSet.add(key);
    });
    const allSubplots = Array.from(allSubplotsSet);

    // Add virtual 'Backdrop' subplot for Chronologue mode to reserve space
    const showBackdropRing = (plugin.settings as any).showBackdropRing ?? true;
    const shouldIncludeBackdrop = isChronologueMode && hasBackdrops && showBackdropRing;
    const microRingConfigs = Array.isArray((plugin.settings as any).chronologueBackdropMicroRings)
        ? (plugin.settings as any).chronologueBackdropMicroRings
        : [];
    const microRingLayout = (shouldIncludeBackdrop && microRingConfigs.length > 0)
        ? buildBackdropMicroRingLayout({ scenes, configs: microRingConfigs })
        : undefined;
    const microRingLaneCount = microRingLayout?.laneCount ?? 0;
    const shouldIncludeMicroBackdrop = shouldIncludeBackdrop && microRingLaneCount > 0;

    if (shouldIncludeBackdrop) {
        allSubplots.push('Backdrop');
    }
    if (shouldIncludeMicroBackdrop) {
        allSubplots.push('MicroBackdrop');
    }

    const NUM_RINGS = allSubplots.length;

    const shouldShowBeats = shouldRenderStoryBeats(plugin);
    const allScenesPlotNotes = shouldShowBeats ? scenes.filter(s => isBeatNote(s)) : [];
    const totalPlotNotes = allScenesPlotNotes.length;
    const plotIndexByKey = new Map<string, number>();
    allScenesPlotNotes.forEach((p, i) => plotIndexByKey.set(`${String(p.title || '')}::${String(p.actNumber ?? '')}`, i));
    const plotsBySubplot = new Map<string, TimelineItem[]>();
    allScenesPlotNotes.forEach(p => {
        const key = String(p.subplot || '');
        const arr = plotsBySubplot.get(key) || [];
        arr.push(p);
        plotsBySubplot.set(key, arr);
    });

    const scenesByActAndSubplot: { [act: number]: { [subplot: string]: TimelineItem[] } } = {};

    if (sortByWhen) {
        scenesByActAndSubplot[0] = {};
        scenes.forEach(scene => {
            if (scene.itemType === 'Backdrop') return;
            const subplot = scene.subplot && scene.subplot.trim().length > 0 ? scene.subplot : 'Main Plot';
            if (!scenesByActAndSubplot[0][subplot]) {
                scenesByActAndSubplot[0][subplot] = [];
            }
            scenesByActAndSubplot[0][subplot].push(scene);
        });
        Object.keys(scenesByActAndSubplot[0]).forEach(subplot => {
            scenesByActAndSubplot[0][subplot] = sortScenes(scenesByActAndSubplot[0][subplot], true, forceChronological);
        });
    } else {
        const numActs = getConfiguredActCount(plugin.settings as any);
        for (let act = 0; act < numActs; act++) {
            scenesByActAndSubplot[act] = {};
        }
        scenes.forEach(scene => {
            if (scene.itemType === 'Backdrop') return;
            const act = scene.actNumber !== undefined ? scene.actNumber - 1 : 0;
            const validAct = (act >= 0 && act < numActs) ? act : 0;
            const subplot = scene.subplot && scene.subplot.trim().length > 0 ? scene.subplot : 'Main Plot';
            if (!scenesByActAndSubplot[validAct][subplot]) {
                scenesByActAndSubplot[validAct][subplot] = [];
            }
            scenesByActAndSubplot[validAct][subplot].push(scene);
        });
        for (let act = 0; act < numActs; act++) {
            Object.keys(scenesByActAndSubplot[act] || {}).forEach(subplot => {
                scenesByActAndSubplot[act][subplot] = sortScenes(scenesByActAndSubplot[act][subplot], false, false);
            });
        }
    }

    const allSubplotsMap = new Map<string, number>();
    const actsToCheck = sortByWhen ? 1 : getConfiguredActCount(plugin.settings as any);

    for (let actIndex = 0; actIndex < actsToCheck; actIndex++) {
        Object.entries(scenesByActAndSubplot[actIndex] || {}).forEach(([subplot, scenes]) => {
            allSubplotsMap.set(subplot, (allSubplotsMap.get(subplot) || 0) + scenes.length);
        });
    }

    const subplotCounts = Array.from(allSubplotsMap.entries()).map(([subplot, count]) => ({
        subplot,
        count
    }));

    subplotCounts.sort((a, b) => {
        if (a.subplot === 'Main Plot' || !a.subplot) return -1;
        if (b.subplot === 'Main Plot' || !b.subplot) return 1;
        if (a.count !== b.count) return b.count - a.count;
        return a.subplot.localeCompare(b.subplot);
    });

    const baseSubplotOrder = subplotCounts.map(item => item.subplot);

    // Stable color index map (pre-reorder) so colors remain consistent across modes
    const colorIndexBySubplot = new Map<string, number>();
    baseSubplotOrder.forEach((subplot, idx) => {
        colorIndexBySubplot.set(subplot, idx % 16);
    });

    let masterSubplotOrder = [...baseSubplotOrder];

    // For Chronologue mode, ensure 'Backdrop' is the second ring from the outside
    // Outer Ring (ringOffset=0) is typically Main Plot or All Scenes.
    // Backdrop (ringOffset=1) should be next.
    if (shouldIncludeBackdrop) {
        masterSubplotOrder = masterSubplotOrder.filter(s => s !== 'Backdrop' && s !== 'MicroBackdrop');
        const insertIndex = masterSubplotOrder.length > 0 ? 1 : 0;
        masterSubplotOrder.splice(insertIndex, 0, 'Backdrop');
        if (shouldIncludeMicroBackdrop) {
            masterSubplotOrder.splice(insertIndex + 1, 0, 'MicroBackdrop');
        }
    }

    const subplotDominanceStates = computeSubplotDominanceStates({
        scenes,
        masterSubplotOrder,
        dominantSubplots: plugin.settings.dominantSubplots
    });

    const subplotOuterRadius = isChronologueMode
        ? SUBPLOT_OUTER_RADIUS_CHRONOLOGUE
        : isPublicationMode
            ? SUBPLOT_OUTER_RADIUS_MAINPLOT
            : SUBPLOT_OUTER_RADIUS_STANDARD[readabilityScale];

    const fixedRings: Array<{ index: number; width: number }> = [];
    const backdropSubplotIndex = masterSubplotOrder.indexOf('Backdrop');
    if (shouldIncludeBackdrop && backdropSubplotIndex !== -1) {
        fixedRings.push({
            index: NUM_RINGS - 1 - backdropSubplotIndex,
            width: BACKDROP_RING_HEIGHT
        });
    }
    const microBackdropSubplotIndex = masterSubplotOrder.indexOf('MicroBackdrop');
    if (shouldIncludeMicroBackdrop && microBackdropSubplotIndex !== -1) {
        const microRingWidth = microRingLaneCount * (MICRO_RING_WIDTH + MICRO_RING_GAP);
        if (microRingWidth > 0) {
            fixedRings.push({
                index: NUM_RINGS - 1 - microBackdropSubplotIndex,
                width: microRingWidth
            });
        }
    }

    const ringGeo = computeRingGeometry({
        size: SVG_SIZE,
        innerRadius: INNER_RADIUS,
        subplotOuterRadius,
        outerRadius: MONTH_LABEL_RADIUS,
        numRings: NUM_RINGS,
        monthTickTerminal: 0,
        monthTextInset: 0,
        fixedRings
    });

    // In Gossamer mode, use the latest sweep stage color (reflects when analysis was run)
    // Otherwise use the most advanced publish stage color
    const isGossamerMode = currentMode === 'gossamer';
    const maxStageColor = isGossamerMode
        ? getLatestGossamerSweepStageColor(scenes, plugin.settings.publishStageColors).color
        : getMostAdvancedStageColor(scenes, plugin.settings.publishStageColors);

    stopPrecompute();

    return {
        scenesByActAndSubplot,
        masterSubplotOrder,
        colorIndexBySubplot,
        totalPlotNotes,
        plotIndexByKey,
        plotsBySubplot,
        ringWidths: ringGeo.ringWidths,
        ringStartRadii: ringGeo.ringStartRadii,
        lineInnerRadius: ringGeo.lineInnerRadius,
        maxStageColor,
        subplotDominanceStates,
        microRingLayout
    };
}
