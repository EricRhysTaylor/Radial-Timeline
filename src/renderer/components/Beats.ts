import type { TimelineItem } from '../../types';
import { formatNumber } from '../../utils/svg';

export function renderBeatGroup(params: {
  beat: TimelineItem;
  act: number;
  ring: number;
  idx: number;
  innerR: number;
  outerR: number;
  startAngle: number;
  endAngle: number;
}): string {
  const { beat, act, ring, idx, innerR, outerR, startAngle, endAngle } = params;
  const groupId = `scene-group-${act}-${ring}-${idx}`;
  return `
    <g class="rt-scene-group beats" data-item-type="Beat" data-act="${act}" data-ring="${ring}" data-idx="${idx}" data-start-angle="${formatNumber(startAngle)}" data-end-angle="${formatNumber(endAngle)}" data-inner-r="${formatNumber(innerR)}" data-outer-r="${formatNumber(outerR)}" data-path="${beat.path ? encodeURIComponent(beat.path) : ''}" id="${groupId}">
  `;
}

