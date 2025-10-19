import { sceneArcPath } from './SceneArcs';
import { renderPlotGroup } from '../components/Plots';
import { formatNumber } from '../../utils/svg';
import type { Scene } from '../../main';

export function renderPlotSlice(params: {
  act: number;
  ring: number;
  idx: number;
  innerR: number;
  outerR: number;
  startAngle: number;
  endAngle: number;
  sceneId: string;
  plot: Scene;
}): string {
  const { act, ring, idx, innerR, outerR, startAngle, endAngle, sceneId, plot } = params;
  const pathD = sceneArcPath(innerR, outerR + 2, startAngle, endAngle);
  return `
    ${renderPlotGroup({ plot, act, ring, idx, innerR, outerR: outerR + 2, startAngle, endAngle })}
      <path id="${sceneId}" d="${pathD}" fill="#E6E6E6" class="rt-scene-path"/>
      <line x1="${formatNumber(innerR * Math.cos(endAngle))}" y1="${formatNumber(innerR * Math.sin(endAngle))}" x2="${formatNumber((outerR + 2) * Math.cos(endAngle))}" y2="${formatNumber((outerR + 2) * Math.sin(endAngle))}" stroke="#000000" stroke-width="1" shape-rendering="crispEdges" />
    </g>
  `;
}


