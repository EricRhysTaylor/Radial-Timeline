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
  outerSpokeInnerRadius?: number;  // Optional: if provided, render additional outer spokes from this radius
}): string {
  const { months, lineInnerRadius, lineOuterRadius, currentMonthIndex, includeIntermediateSpokes = false, outerSpokeInnerRadius } = params;
  
  // Inner calendar spokes - always render these short spokes around the calendar labels
  const innerSpokeStart = lineInnerRadius - 5;
  const innerSpokeEnd = lineInnerRadius + 30;
  
  let svg = '<g class="month-spokes">';
  
  // Render main month spokes and labels
  months.forEach(({ name, angle }, monthIndex) => {
    const isActBoundary = [0, 4, 8].includes(monthIndex);
    const isPastMonth = monthIndex < currentMonthIndex;
    
    // Inner calendar reference spokes (always rendered)
    const innerX1 = formatNumber(innerSpokeStart * Math.cos(angle));
    const innerY1 = formatNumber(innerSpokeStart * Math.sin(angle));
    const innerX2 = formatNumber(innerSpokeEnd * Math.cos(angle));
    const innerY2 = formatNumber(innerSpokeEnd * Math.sin(angle));
    
    svg += `
      <line  
        x1="${innerX1}"
        y1="${innerY1}"
        x2="${innerX2}"
        y2="${innerY2}"
        class="rt-month-spoke-line rt-inner-calendar-spoke${isActBoundary ? ' rt-act-boundary' : ''}${isPastMonth ? ' rt-past-month' : ''}"
      />`;
    
    // Outer spokes (only if outerSpokeInnerRadius is provided)
    if (outerSpokeInnerRadius !== undefined) {
      const outerX1 = formatNumber(outerSpokeInnerRadius * Math.cos(angle));
      const outerY1 = formatNumber(outerSpokeInnerRadius * Math.sin(angle));
      const outerX2 = formatNumber(lineOuterRadius * Math.cos(angle));
      const outerY2 = formatNumber(lineOuterRadius * Math.sin(angle));
      
      // For dashed lines, add stroke-dashoffset to start with a full dash at the outer edge
      const dashOffset = isActBoundary ? '' : ' stroke-dashoffset="2"';
      
      svg += `
      <line  
        x1="${outerX1}"
        y1="${outerY1}"
        x2="${outerX2}"
        y2="${outerY2}"
        class="rt-month-spoke-line${isActBoundary ? ' rt-act-boundary' : ''}${isPastMonth ? ' rt-past-month' : ''}"${dashOffset}
      />`;
    }

    // Inner month labels (curved text paths)
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

  // Render intermediate spokes (dashed mini-ticks between major month markers)
  if (includeIntermediateSpokes && months.length > 0 && outerSpokeInnerRadius !== undefined) {
    const multiplier = 3;
    const majorStep = (2 * Math.PI) / months.length;

    for (let monthIndex = 0; monthIndex < months.length; monthIndex++) {
      for (let step = 1; step < multiplier; step++) {
        const rawAngle = months[monthIndex].angle + (majorStep * step) / multiplier;
        const angle = normalizeAngle(rawAngle);
        const x1 = formatNumber(outerSpokeInnerRadius * Math.cos(angle));
        const y1 = formatNumber(outerSpokeInnerRadius * Math.sin(angle));
        const x2 = formatNumber(lineOuterRadius * Math.cos(angle));
        const y2 = formatNumber(lineOuterRadius * Math.sin(angle));

        svg += `
      <line
        x1="${x1}"
        y1="${y1}"
        x2="${x2}"
        y2="${y2}"
        class="rt-month-spoke-line rt-month-spoke-intermediate"
        stroke-dashoffset="2"
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

