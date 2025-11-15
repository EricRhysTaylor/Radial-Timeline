import type { TimelineItem } from '../../types';
import { formatNumber } from '../../utils/svg';
import { getSceneState, buildSquareClasses, buildTextClasses, extractGradeFromScene, isBeatNote, type PluginRendererFacade } from '../../utils/sceneHelpers';
import { getScenePrefixNumber, getNumberSquareSize, parseSceneTitle } from '../../utils/text';
import { generateNumberSquareGroup, makeSceneId } from '../../utils/numberSquareHelpers';

/**
 * Unified number square rendering function
 * Handles both All Scenes mode (with pre-calculated positions) and Main Plot mode (with on-the-fly calculation)
 */
export function renderNumberSquaresUnified(params: {
  plugin: PluginRendererFacade;
  scenes: TimelineItem[];
  sceneGrades: Map<string, string>;
  // For All Scenes mode (outer ring)
  positions?: Map<number, { startAngle: number; endAngle: number }>;
  squareRadius?: number;
  act?: number;
  ringOuter?: number;
  // For Main Plot mode (standard)
  NUM_RINGS?: number;
  masterSubplotOrder?: string[];
  ringStartRadii?: number[];
  ringWidths?: number[];
  scenesByActAndSubplot?: Record<number, Record<string, TimelineItem[]>>;
  sceneNumbersMap?: Map<string, { number: string; x: number; y: number; width: number; height: number }>;
  enableSubplotColors?: boolean;
  resolveSubplotVisual?: (scene: TimelineItem) => { subplotIndex: number } | null;
}): string {
  const { 
    plugin, 
    scenes, 
    sceneGrades, 
    positions, 
    squareRadius, 
    act, 
    ringOuter,
    NUM_RINGS,
    masterSubplotOrder,
    ringStartRadii,
    ringWidths,
    scenesByActAndSubplot,
    sceneNumbersMap,
    enableSubplotColors = false,
    resolveSubplotVisual
  } = params;

  let svg = '<g class="rt-number-squares">';

  scenes.forEach((scene, idx) => {
    if (isBeatNote(scene)) return;
    
    const number = getScenePrefixNumber(scene.title, scene.number);
    if (!number) return;

    let sceneStartAngle: number;
    let textPathRadius: number;
    let sceneId: string;

    if (positions && squareRadius !== undefined && act !== undefined && ringOuter !== undefined) {
      // All Scenes mode: use pre-calculated positions
      const pos = positions.get(idx);
      if (!pos) return;
      sceneStartAngle = pos.startAngle;
      textPathRadius = squareRadius;
      sceneId = makeSceneId(act, ringOuter, idx, true, true);
    } else if (NUM_RINGS && masterSubplotOrder && ringStartRadii && ringWidths && scenesByActAndSubplot) {
      // Main Plot mode: calculate positions on-the-fly
      const subplot = scene.subplot || 'Main Plot';
      const subplotIndex = masterSubplotOrder.indexOf(subplot);
      const ring = NUM_RINGS - 1 - subplotIndex;
      
      // Check if using When date sorting
      const currentMode = (plugin.settings as any).currentMode || 'narrative';
      const isChronologueMode = currentMode === 'chronologue';
      const sortByWhen = isChronologueMode ? true : ((plugin.settings as any).sortByWhenDate ?? false);
      
      const sceneActNumber = scene.actNumber !== undefined ? scene.actNumber : 1;
      // When using When date sorting, all scenes are in act 0
      const actIndex = sortByWhen ? 0 : (sceneActNumber - 1);
      
      const scenesInActAndSubplot = (scenesByActAndSubplot[actIndex] && scenesByActAndSubplot[actIndex][subplot]) || [];
      const filteredScenes = scenesInActAndSubplot.filter(s => !isBeatNote(s));
      const sceneIndex = filteredScenes.indexOf(scene);
      
      // Calculate angles based on sorting method
      let startAngle: number;
      let endAngle: number;
      
      if (sortByWhen) {
        // When date mode: Full 360° circle
        startAngle = -Math.PI / 2;
        endAngle = (3 * Math.PI) / 2;
      } else {
        // Manuscript mode: 120° wedges for each Act
        startAngle = (actIndex * 2 * Math.PI) / 3 - Math.PI / 2; // NUM_ACTS = 3
        endAngle = ((actIndex + 1) * 2 * Math.PI) / 3 - Math.PI / 2;
      }
      
      const innerR = ringStartRadii[ring];
      const outerR = innerR + ringWidths[ring];
      const totalAngularSpace = endAngle - startAngle;
      const sceneAngularSize = filteredScenes.length > 0 ? totalAngularSpace / filteredScenes.length : 0;
      let currentAngle = startAngle;
      for (let i = 0; i < sceneIndex; i++) currentAngle += sceneAngularSize;
      sceneStartAngle = currentAngle;
      textPathRadius = (ringStartRadii[ring] + (ringStartRadii[ring] + ringWidths[ring])) / 2;
      sceneId = `scene-path-${actIndex}-${ring}-${sceneIndex}`;
    } else {
      return; // Invalid parameters
    }

    const squareSize = getNumberSquareSize(number);
    const squareX = textPathRadius * Math.cos(sceneStartAngle);
    const squareY = textPathRadius * Math.sin(sceneStartAngle);
    
    const { isSceneOpen, isSearchMatch, hasEdits } = getSceneState(scene, plugin);
    const squareClasses = buildSquareClasses(isSceneOpen, isSearchMatch, hasEdits);
    let textClasses = buildTextClasses(isSceneOpen, isSearchMatch, hasEdits);
    
    const grade = sceneGrades.get(sceneId);
    if (plugin.settings.enableAiSceneAnalysis && grade) {
      textClasses += ` rt-grade-${grade}`;
    }

    // Store in sceneNumbersMap if provided (Main Plot mode)
    if (sceneNumbersMap) {
      sceneNumbersMap.set(sceneId, { number, x: squareX, y: squareY, width: squareSize.width, height: squareSize.height });
    }

    const subplotVisual = enableSubplotColors && resolveSubplotVisual ? resolveSubplotVisual(scene) : null;

    svg += generateNumberSquareGroup(
      squareX,
      squareY,
      squareSize,
      squareClasses,
      sceneId,
      number,
      textClasses,
      grade,
      {
        cornerRadius: 4,
        subplotIndex: subplotVisual?.subplotIndex
      }
    );
  });

  svg += '</g>';
  return svg;
}

// Legacy functions - now just wrappers around the unified function
export function renderOuterRingNumberSquares(params: {
  plugin: PluginRendererFacade;
  act: number;
  ringOuter: number;
  squareRadiusOuter: number;
  positions: Map<number, { startAngle: number; endAngle: number }>;
  combined: TimelineItem[];
  sceneGrades: Map<string, string>;
  enableSubplotColors?: boolean;
  resolveSubplotVisual?: (scene: TimelineItem) => { subplotIndex: number } | null;
}): string {
  return renderNumberSquaresUnified({
    plugin: params.plugin,
    scenes: params.combined,
    sceneGrades: params.sceneGrades,
    positions: params.positions,
    squareRadius: params.squareRadiusOuter,
    act: params.act,
    ringOuter: params.ringOuter,
    enableSubplotColors: params.enableSubplotColors,
    resolveSubplotVisual: params.resolveSubplotVisual
  });
}

export function renderInnerRingsNumberSquaresAllScenes(params: {
  plugin: PluginRendererFacade;
  NUM_RINGS: number;
  masterSubplotOrder: string[];
  ringStartRadii: number[];
  ringWidths: number[];
  scenesByActAndSubplot: Record<number, Record<string, TimelineItem[]>>;
  scenes: TimelineItem[];
  sceneGrades: Map<string, string>;
  enableSubplotColors?: boolean;
  resolveSubplotVisual?: (scene: TimelineItem) => { subplotIndex: number } | null;
}): string {
  const { plugin, NUM_RINGS, masterSubplotOrder, ringStartRadii, ringWidths, scenesByActAndSubplot, scenes, sceneGrades, enableSubplotColors = false, resolveSubplotVisual } = params;
  
  // Check if using When date sorting
  const currentMode = (plugin.settings as any).currentMode || 'narrative';
  const isChronologueMode = currentMode === 'chronologue';
  const sortByWhen = isChronologueMode ? true : ((plugin.settings as any).sortByWhenDate ?? false);
  
  let svg = '';
  scenes.forEach((scene) => {
    if (isBeatNote(scene)) return;
    const number = getScenePrefixNumber(scene.title, scene.number);
    if (!number) return;
    const subplot = scene.subplot && scene.subplot.trim().length > 0 ? scene.subplot : 'Main Plot';
    // Skip Main Plot scenes - they're always in the outer ring, not inner rings
    if (subplot === 'Main Plot') return;
    const subplotIndex = masterSubplotOrder.indexOf(subplot);
    if (subplotIndex === -1) return;
    const ring = NUM_RINGS - 1 - subplotIndex;
    if (ring < 0 || ring >= NUM_RINGS) return;
    
    // When using When date sorting, all scenes are in act 0
    // When using manuscript order, use the scene's actual act
    const sceneActNumber = scene.actNumber !== undefined ? scene.actNumber : 1;
    const actIndex = sortByWhen ? 0 : (sceneActNumber - 1);
    
    const scenesInActAndSubplot = (scenesByActAndSubplot[actIndex] && scenesByActAndSubplot[actIndex][subplot]) || [];
    const filteredScenesForIndex = scenesInActAndSubplot.filter(s => !isBeatNote(s));
    // Find scene by path/title instead of object reference (fixes first-render bug)
    const sceneKey = scene.path || scene.title || '';
    const sceneIndex = filteredScenesForIndex.findIndex(s => (s.path || s.title || '') === sceneKey);
    if (sceneIndex === -1) return;
    
    // Calculate angles based on sorting method
    let startAngle: number;
    let endAngle: number;
    
    if (sortByWhen) {
      // When date mode: Full 360° circle
      startAngle = -Math.PI / 2;
      endAngle = (3 * Math.PI) / 2;
    } else {
      // Manuscript mode: 120° wedges for each Act
      startAngle = (actIndex * 2 * Math.PI) / 3 - Math.PI / 2; // NUM_ACTS = 3
      endAngle = ((actIndex + 1) * 2 * Math.PI) / 3 - Math.PI / 2;
    }
    const innerR = ringStartRadii[ring];
    const outerR = innerR + ringWidths[ring];
    const middleRadius = (innerR + outerR) / 2;
    const totalAngularSpace = endAngle - startAngle;
    const sceneAngularSize = filteredScenesForIndex.length > 0 ? totalAngularSpace / filteredScenesForIndex.length : 0;
    let currentAngle = startAngle;
    for (let i = 0; i < sceneIndex; i++) currentAngle += sceneAngularSize;
    const sceneStartAngle = currentAngle;
    const textPathRadius = (innerR + outerR) / 2;
    const squareSize = getNumberSquareSize(number);
    const squareX = textPathRadius * Math.cos(sceneStartAngle);
    const squareY = textPathRadius * Math.sin(sceneStartAngle);
    const { isSceneOpen, isSearchMatch, hasEdits } = getSceneState(scene, plugin);
    const squareClasses = buildSquareClasses(isSceneOpen, isSearchMatch, hasEdits);
    let textClasses = buildTextClasses(isSceneOpen, isSearchMatch, hasEdits);
    const sceneId = `scene-path-${actIndex}-${ring}-${sceneIndex}`;
    extractGradeFromScene(scene, sceneId, sceneGrades, plugin);
    const grade = sceneGrades.get(sceneId);
    if (plugin.settings.enableAiSceneAnalysis && grade) textClasses += ` rt-grade-${grade}`;
    const subplotVisual = enableSubplotColors && resolveSubplotVisual ? resolveSubplotVisual(scene) : null;
    svg += generateNumberSquareGroup(
      squareX,
      squareY,
      squareSize,
      squareClasses,
      sceneId,
      number,
      textClasses,
      grade,
      {
        cornerRadius: 4,
        subplotIndex: subplotVisual?.subplotIndex
      }
    );
  });
  return svg;
}

export function renderNumberSquaresStandard(params: {
  plugin: PluginRendererFacade;
  NUM_RINGS: number;
  masterSubplotOrder: string[];
  ringStartRadii: number[];
  ringWidths: number[];
  scenesByActAndSubplot: Record<number, Record<string, TimelineItem[]>>;
  scenes: TimelineItem[];
  sceneGrades: Map<string, string>;
  sceneNumbersMap: Map<string, { number: string; x: number; y: number; width: number; height: number }>;
  enableSubplotColors?: boolean;
  resolveSubplotVisual?: (scene: TimelineItem) => { subplotIndex: number } | null;
}): string {
  return renderNumberSquaresUnified({
    plugin: params.plugin,
    scenes: params.scenes,
    sceneGrades: params.sceneGrades,
    NUM_RINGS: params.NUM_RINGS,
    masterSubplotOrder: params.masterSubplotOrder,
    ringStartRadii: params.ringStartRadii,
    ringWidths: params.ringWidths,
    scenesByActAndSubplot: params.scenesByActAndSubplot,
    sceneNumbersMap: params.sceneNumbersMap,
    enableSubplotColors: params.enableSubplotColors,
    resolveSubplotVisual: params.resolveSubplotVisual
  });
}
