import { formatNumber } from '../../utils/svg';

export function renderActLabels(params: {
  numActs: number;
  actLabels: string[];
  showActLabels: boolean;
  outerMostOuterRadius: number;
  actLabelOffset: number;
  maxStageColor: string;
}): string {
  const { numActs, actLabels, showActLabels, outerMostOuterRadius, actLabelOffset, maxStageColor } = params;
  let svg = '';
  const actLabelRadius = outerMostOuterRadius + actLabelOffset;
  for (let act = 0; act < numActs; act++) {
    const angle = (act * 2 * Math.PI) / numActs - Math.PI / 2;
    const angleOffset = -0.085;
    const startAngleAct = angle + angleOffset;
    const endAngleAct = startAngleAct + (Math.PI / 12);
    const actPathId = `actPath-${act}`;
    const labelText = showActLabels
      ? (actLabels[act] && actLabels[act].length > 0 ? actLabels[act] : `Act ${act + 1}`)
      : `${act + 1}`;
    svg += `
      <path id="${actPathId}" d="
        M ${formatNumber(actLabelRadius * Math.cos(startAngleAct))} ${formatNumber(actLabelRadius * Math.sin(startAngleAct))}
        A ${formatNumber(actLabelRadius)} ${formatNumber(actLabelRadius)} 0 0 1 ${formatNumber(actLabelRadius * Math.cos(endAngleAct))} ${formatNumber(actLabelRadius * Math.sin(endAngleAct))}
      " fill="none" />
      <text class="rt-act-label" fill="${maxStageColor}">
        <textPath href="#${actPathId}" startOffset="0" text-anchor="start">${labelText}</textPath>
      </text>
    `;
  }
  return svg;
}


