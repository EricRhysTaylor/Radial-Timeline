import type { TimelineItem } from '../../main';
import { formatNumber } from '../../utils/svg';

export function sceneArcPath(innerR: number, outerR: number, startAngle: number, endAngle: number): string {
  return `
    M ${formatNumber(innerR * Math.cos(startAngle))} ${formatNumber(innerR * Math.sin(startAngle))}
    L ${formatNumber(outerR * Math.cos(startAngle))} ${formatNumber(outerR * Math.sin(startAngle))}
    A ${formatNumber(outerR)} ${formatNumber(outerR)} 0 0 1 ${formatNumber(outerR * Math.cos(endAngle))} ${formatNumber(outerR * Math.sin(endAngle))}
    L ${formatNumber(innerR * Math.cos(endAngle))} ${formatNumber(innerR * Math.sin(endAngle))}
    A ${formatNumber(innerR)} ${formatNumber(innerR)} 0 0 0 ${formatNumber(innerR * Math.cos(startAngle))} ${formatNumber(innerR * Math.sin(startAngle))}
  `;
}

export function renderVoidCellPath(innerR: number, outerR: number, startAngle: number, endAngle: number): string {
  const path = sceneArcPath(innerR, outerR, startAngle, endAngle);
  return `<path d="${path}" class="rt-void-cell"/>`;
}


