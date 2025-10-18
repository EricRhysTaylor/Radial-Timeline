import type { Scene } from '../../main';
import { formatNumber } from '../../utils/svg';

export function renderSceneGroup(params: {
  scene: Scene;
  act: number;
  ring: number;
  idx: number;
  innerR: number;
  outerR: number;
  startAngle: number;
  endAngle: number;
  subplotIdxAttr: string | number;
}): string {
  const { scene, act, ring, idx, innerR, outerR, startAngle, endAngle, subplotIdxAttr } = params;
  const groupId = `scene-group-${act}-${ring}-${idx}`;
  return `
    <g class="rt-scene-group" data-item-type="${scene.itemType === 'Plot' ? 'Plot' : 'Scene'}" data-act="${act}" data-ring="${ring}" data-idx="${idx}" data-start-angle="${formatNumber(startAngle)}" data-end-angle="${formatNumber(endAngle)}" data-inner-r="${formatNumber(innerR)}" data-outer-r="${formatNumber(outerR)}" data-subplot-index="${String(subplotIdxAttr)}" data-path="${scene.path ? encodeURIComponent(scene.path) : ''}" id="${groupId}">
  `;
}


