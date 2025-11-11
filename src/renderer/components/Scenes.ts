import type { TimelineItem } from '../../main';
import { formatNumber } from '../../utils/svg';
import { isBeatNote } from '../../utils/sceneHelpers';

export function renderSceneGroup(params: {
  scene: TimelineItem;
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
    <g class="rt-scene-group${isBeatNote(scene) ? ' beats' : ''}" data-item-type="${isBeatNote(scene) ? 'Beat' : 'Scene'}" data-act="${act}" data-ring="${ring}" data-idx="${idx}" data-start-angle="${formatNumber(startAngle)}" data-end-angle="${formatNumber(endAngle)}" data-inner-r="${formatNumber(innerR)}" data-outer-r="${formatNumber(outerR)}" data-subplot-index="${String(subplotIdxAttr)}" data-path="${scene.path ? encodeURIComponent(scene.path) : ''}" id="${groupId}">
  `;
}


