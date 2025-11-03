import { formatNumber } from '../../utils/svg';

const normalizeAngle = (angle: number): number => {
  const twoPi = Math.PI * 2;
  let normalized = angle % twoPi;
  if (normalized > Math.PI) {
    normalized -= twoPi;
  } else if (normalized <= -Math.PI) {
    normalized += twoPi;
  }
  return normalized;
};

export function renderMonthSpokesAndInnerLabels(params: {
  months: { name: string; shortName: string; angle: number }[];
  lineInnerRadius: number;
  lineOuterRadius: number;
  currentMonthIndex: number;
  includeIntermediateSpokes?: boolean;
}): string {
  const { months, lineInnerRadius, lineOuterRadius, currentMonthIndex, includeIntermediateSpokes = false } = params;
  let svg = '<g class="month-spokes">';
  months.forEach(({ name, angle }, monthIndex) => {
    const x1 = formatNumber((lineInnerRadius - 5) * Math.cos(angle));
    const y1 = formatNumber((lineInnerRadius - 5) * Math.sin(angle));
    const x2 = formatNumber(lineOuterRadius * Math.cos(angle));
    const y2 = formatNumber(lineOuterRadius * Math.sin(angle));

    const isActBoundary = [0, 4, 8].includes(monthIndex);
    const isPastMonth = monthIndex < currentMonthIndex;

    svg += `
      <line  
        x1="${x1}"
        y1="${y1}"
        x2="${x2}"
        y2="${y2}"
        class="rt-month-spoke-line${isActBoundary ? ' rt-act-boundary' : ''}${isPastMonth ? ' rt-past-month' : ''}"
      />`;

    const innerLabelRadius = lineInnerRadius;
    const pixelToRadian = (5 * 2 * Math.PI) / (2 * Math.PI * innerLabelRadius);
    const startAngle = angle + pixelToRadian;
    const endAngle = angle + (Math.PI / 6);
    const innerPathId = `innerMonthPath-${name}`;

    svg += `
      <path id="${innerPathId}"
        d="
          M ${formatNumber(innerLabelRadius * Math.cos(startAngle))} ${formatNumber(innerLabelRadius * Math.sin(startAngle))}
          A ${formatNumber(innerLabelRadius)} ${formatNumber(innerLabelRadius)} 0 0 1 ${formatNumber(innerLabelRadius * Math.cos(endAngle))} ${formatNumber(innerLabelRadius * Math.sin(endAngle))}
        "
        fill="none"
      />
      <text class="rt-month-label" ${isPastMonth ? 'opacity="0.5"' : ''}>
        <textPath href="#${innerPathId}" startOffset="0" text-anchor="start">
          ${months[monthIndex].shortName}
        </textPath>
      </text>
    `;
  });

  if (includeIntermediateSpokes && months.length > 0) {
    const multiplier = 3;
    const majorStep = (2 * Math.PI) / months.length;

    for (let monthIndex = 0; monthIndex < months.length; monthIndex++) {
      for (let step = 1; step < multiplier; step++) {
        const rawAngle = months[monthIndex].angle + (majorStep * step) / multiplier;
        const angle = normalizeAngle(rawAngle);
        const x1 = formatNumber((lineInnerRadius - 5) * Math.cos(angle));
        const y1 = formatNumber((lineInnerRadius - 5) * Math.sin(angle));
        const x2 = formatNumber(lineOuterRadius * Math.cos(angle));
        const y2 = formatNumber(lineOuterRadius * Math.sin(angle));

        svg += `
      <line
        x1="${x1}"
        y1="${y1}"
        x2="${x2}"
        y2="${y2}"
        class="rt-month-spoke-line rt-month-spoke-intermediate"
      />`;
      }
    }
  }
  svg += '</g>';
  return svg;
}

export function renderGossamerMonthSpokes(params: {
  innerRadius: number;
  outerRadius: number;
}): string {
  const { innerRadius, outerRadius } = params;
  let spokesHtml = '';
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * 2 * Math.PI - Math.PI / 2;
    const x1 = formatNumber(innerRadius * Math.cos(angle));
    const y1 = formatNumber(innerRadius * Math.sin(angle));
    const x2 = formatNumber(outerRadius * Math.cos(angle));
    const y2 = formatNumber(outerRadius * Math.sin(angle));
    const isActBoundary = [0, 4, 8].includes(i);
    spokesHtml += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="rt-month-spoke-line rt-gossamer-grid-spoke${isActBoundary ? ' rt-act-boundary' : ''}"/>`;
  }
  return `<g class="rt-gossamer-spokes">${spokesHtml}</g>`;
}

