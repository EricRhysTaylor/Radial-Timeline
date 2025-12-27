import { formatNumber } from '../../utils/svg';

export function renderActBorders(params: {
  numActs: number;
  innerRadius: number;
  outerRadius: number;
}): string {
  const { numActs, innerRadius, outerRadius } = params;
  let svg = '';
  for (let act = 0; act < numActs; act++) {
    const angle = (act * 2 * Math.PI) / numActs - Math.PI / 2;
    svg += `
      <line x1="${formatNumber(innerRadius * Math.cos(angle))}" y1="${formatNumber(innerRadius * Math.sin(angle))}"
            x2="${formatNumber(outerRadius * Math.cos(angle))}" y2="${formatNumber(outerRadius * Math.sin(angle))}"
            class="act-border" />
    `;
  }
  return svg;
}


