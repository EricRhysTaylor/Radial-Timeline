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
    // Right-justify act labels against the Act axis
    // Anchor at the axis (plus small offset), extend path backwards to the left
    const anchorOffset = 0.02;
    const endAngleAct = angle + anchorOffset;
    const startAngleAct = endAngleAct - (Math.PI / 3); // Long enough arc for long titles
    
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
        <textPath href="#${actPathId}" startOffset="100%" text-anchor="end">${labelText}</textPath>
      </text>
    `;
  }
  return svg;
}


