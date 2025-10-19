import { formatNumber } from '../../utils/svg';

export function renderActLabels(params: {
  NUM_ACTS: number;
  outerMostOuterRadius: number;
  actLabelOffset: number;
  maxStageColor: string;
}): string {
  const { NUM_ACTS, outerMostOuterRadius, actLabelOffset, maxStageColor } = params;
  let svg = '';
  const actLabelRadius = outerMostOuterRadius + actLabelOffset;
  for (let act = 0; act < NUM_ACTS; act++) {
    const angle = (act * 2 * Math.PI) / NUM_ACTS - Math.PI / 2;
    const angleOffset = -0.085;
    const startAngleAct = angle + angleOffset;
    const endAngleAct = startAngleAct + (Math.PI / 12);
    const actPathId = `actPath-${act}`;
    svg += `
      <path id="${actPathId}" d="
        M ${formatNumber(actLabelRadius * Math.cos(startAngleAct))} ${formatNumber(actLabelRadius * Math.sin(startAngleAct))}
        A ${formatNumber(actLabelRadius)} ${formatNumber(actLabelRadius)} 0 0 1 ${formatNumber(actLabelRadius * Math.cos(endAngleAct))} ${formatNumber(actLabelRadius * Math.sin(endAngleAct))}
      " fill="none" />
      <text class="rt-act-label" fill="${maxStageColor}">
        <textPath href="#${actPathId}" startOffset="0" text-anchor="start">ACT ${act + 1}</textPath>
      </text>
    `;
  }
  return svg;
}


