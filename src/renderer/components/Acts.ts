import { formatNumber } from '../../utils/svg';

export function renderActBorders(params: {
  NUM_ACTS: number;
  innerRadius: number;
  outerRadius: number;
}): string {
  const { NUM_ACTS, innerRadius, outerRadius } = params;
  let svg = '';
  for (let act = 0; act < NUM_ACTS; act++) {
    const angle = (act * 2 * Math.PI) / NUM_ACTS - Math.PI / 2;
    svg += `
      <line x1="${formatNumber(innerRadius * Math.cos(angle))}" y1="${formatNumber(innerRadius * Math.sin(angle))}"
            x2="${formatNumber(outerRadius * Math.cos(angle))}" y2="${formatNumber(outerRadius * Math.sin(angle))}"
            class="act-border" />
    `;
  }
  return svg;
}


