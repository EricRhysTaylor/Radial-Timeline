import type { Scene } from '../../main';
import { formatNumber } from '../../utils/svg';
import { getSceneState, buildSquareClasses, buildTextClasses, extractGradeFromScene, type PluginRendererFacade } from '../../utils/sceneHelpers';
import { getScenePrefixNumber, getNumberSquareSize, parseSceneTitle } from '../../utils/text';
import { generateNumberSquareGroup, makeSceneId } from '../../utils/numberSquareHelpers';

/**
 * Unified number square rendering function
 * Handles both All Scenes mode (with pre-calculated positions) and Main Plot mode (with on-the-fly calculation)
 */
export function renderNumberSquaresUnified(params: {
  plugin: PluginRendererFacade;
  scenes: Scene[];
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
  scenesByActAndSubplot?: Record<number, Record<string, Scene[]>>;
  sceneNumbersMap?: Map<string, { number: string; x: number; y: number; width: number; height: number }>;
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
    sceneNumbersMap
  } = params;

  let svg = '<g class="rt-number-squares">';

  scenes.forEach((scene, idx) => {
    if (scene.itemType === 'Plot') return;
    
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
      const sceneActNumber = scene.actNumber !== undefined ? scene.actNumber : 1;
      const actIndex = sceneActNumber - 1;
      const scenesInActAndSubplot = (scenesByActAndSubplot[actIndex] && scenesByActAndSubplot[actIndex][subplot]) || [];
      const filteredScenes = scenesInActAndSubplot.filter(s => s.itemType !== 'Plot');
      const sceneIndex = filteredScenes.indexOf(scene);
      const startAngle = (actIndex * 2 * Math.PI) / 3 - Math.PI / 2; // NUM_ACTS = 3
      const endAngle = ((actIndex + 1) * 2 * Math.PI) / 3 - Math.PI / 2;
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

    svg += generateNumberSquareGroup(squareX, squareY, squareSize, squareClasses, sceneId, number, textClasses, grade);
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
  combined: Scene[];
  sceneGrades: Map<string, string>;
}): string {
  return renderNumberSquaresUnified({
    plugin: params.plugin,
    scenes: params.combined,
    sceneGrades: params.sceneGrades,
    positions: params.positions,
    squareRadius: params.squareRadiusOuter,
    act: params.act,
    ringOuter: params.ringOuter
  });
}

export function renderInnerRingsNumberSquaresAllScenes(params: {
  plugin: PluginRendererFacade;
  NUM_RINGS: number;
  masterSubplotOrder: string[];
  ringStartRadii: number[];
  ringWidths: number[];
  scenesByActAndSubplot: Record<number, Record<string, Scene[]>>;
  scenes: Scene[];
  sceneGrades: Map<string, string>;
}): string {
  const { plugin, NUM_RINGS, masterSubplotOrder, ringStartRadii, ringWidths, scenesByActAndSubplot, scenes, sceneGrades } = params;
  let svg = '';
  scenes.forEach((scene) => {
    if (scene.itemType === 'Plot') return;
    const number = getScenePrefixNumber(scene.title, scene.number);
    if (!number) return;
    const subplot = scene.subplot && scene.subplot.trim().length > 0 ? scene.subplot : 'Main Plot';
    if (subplot === 'Main Plot') return;
    const subplotIndex = masterSubplotOrder.indexOf(subplot);
    if (subplotIndex === -1) return;
    const ring = NUM_RINGS - 1 - subplotIndex;
    if (ring < 0 || ring >= NUM_RINGS) return;
    const sceneActNumber = scene.actNumber !== undefined ? scene.actNumber : 1;
    const actIndex = sceneActNumber - 1;
    const scenesInActAndSubplot = (scenesByActAndSubplot[actIndex] && scenesByActAndSubplot[actIndex][subplot]) || [];
    const filteredScenesForIndex = scenesInActAndSubplot.filter(s => s.itemType !== 'Plot');
    const sceneIndex = filteredScenesForIndex.indexOf(scene);
    if (sceneIndex === -1) return;
    const startAngle = (actIndex * 2 * Math.PI) / 3 - Math.PI / 2; // NUM_ACTS = 3
    const endAngle = ((actIndex + 1) * 2 * Math.PI) / 3 - Math.PI / 2;
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
    svg += generateNumberSquareGroup(squareX, squareY, squareSize, squareClasses, sceneId, number, textClasses, grade);
  });
  return svg;
}

export function renderNumberSquaresStandard(params: {
  plugin: PluginRendererFacade;
  NUM_RINGS: number;
  masterSubplotOrder: string[];
  ringStartRadii: number[];
  ringWidths: number[];
  scenesByActAndSubplot: Record<number, Record<string, Scene[]>>;
  scenes: Scene[];
  sceneGrades: Map<string, string>;
  sceneNumbersMap: Map<string, { number: string; x: number; y: number; width: number; height: number }>;
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
    sceneNumbersMap: params.sceneNumbersMap
  });
}


