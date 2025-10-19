import { formatNumber } from '../../utils/svg';

export function renderEstimatedDateElements(params: {
  estimateDate: Date;
  progressRadius: number;
}): string {
  const { estimateDate, progressRadius } = params;
  const estimatedMonth = estimateDate.getMonth();
  const estimatedDay = estimateDate.getDate();
  const estimatedDaysInMonth = new Date(estimateDate.getFullYear(), estimatedMonth + 1, 0).getDate();
  const estimatedYearPos = estimatedMonth / 12 + estimatedDay / estimatedDaysInMonth / 12;
  const absoluteDatePos = ((estimatedYearPos + 0.75) % 1) * Math.PI * 2;

  const tickOuterRadius = progressRadius + 5;
  const tickInnerRadius = progressRadius - 35;
  const tickOuterX = tickOuterRadius * Math.cos(absoluteDatePos);
  const tickOuterY = tickOuterRadius * Math.sin(absoluteDatePos);
  const tickInnerX = tickInnerRadius * Math.cos(absoluteDatePos);
  const tickInnerY = tickInnerRadius * Math.sin(absoluteDatePos);

  let svg = '';
  if ([tickOuterX, tickOuterY, tickInnerX, tickInnerY].every((v) => Number.isFinite(v))) {
    svg += `
      <line x1="${formatNumber(tickOuterX)}" y1="${formatNumber(tickOuterY)}" x2="${formatNumber(tickInnerX)}" y2="${formatNumber(tickInnerY)}" class="estimated-date-tick" />
      <circle cx="${formatNumber(tickInnerX)}" cy="${formatNumber(tickInnerY)}" r="4" class="estimated-date-dot" />
    `;
  }

  const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit' });
  const dateDisplay = `${dateFormatter.format(estimateDate)}`;

  const labelRadius = progressRadius - 45;
  const maxOffset = -18;
  const offsetX = maxOffset * Math.cos(absoluteDatePos);
  const maxYOffset = 5;
  const offsetY = -maxYOffset * Math.sin(absoluteDatePos);
  const labelXNum = labelRadius * Math.cos(absoluteDatePos) + offsetX;
  const labelYNum = labelRadius * Math.sin(absoluteDatePos) + offsetY;
  if (Number.isFinite(labelXNum) && Number.isFinite(labelYNum)) {
    const labelX = formatNumber(labelXNum);
    const labelY = formatNumber(labelYNum);
    svg += `
      <text x="${labelX}" y="${labelY}" text-anchor="middle" dominant-baseline="middle" class="estimation-date-label">${dateDisplay}</text>
    `;
  }
  return svg;
}


export function renderEstimationArc(params: {
  estimateDate: Date;
  progressRadius: number;
}): string {
  const { estimateDate, progressRadius } = params;
  const startAngle = -Math.PI / 2; // 12 o'clock
  const estimatedMonth = estimateDate.getMonth();
  const estimatedDay = estimateDate.getDate();
  const estimatedDaysInMonth = new Date(estimateDate.getFullYear(), estimatedMonth + 1, 0).getDate();
  const estimatedYearPos = estimatedMonth / 12 + estimatedDay / estimatedDaysInMonth / 12;
  const estimatedDateAngle = ((estimatedYearPos + 0.75) % 1) * Math.PI * 2;
  let arcAngleSpan = estimatedDateAngle - startAngle;
  if (arcAngleSpan < 0) arcAngleSpan += 2 * Math.PI;
  const x0 = progressRadius * Math.cos(startAngle);
  const y0 = progressRadius * Math.sin(startAngle);
  const x1 = progressRadius * Math.cos(estimatedDateAngle);
  const y1 = progressRadius * Math.sin(estimatedDateAngle);
  if (![x0, y0, x1, y1].every(Number.isFinite)) return '';
  return `
    <path d="M ${x0} ${y0} A ${progressRadius} ${progressRadius} 0 ${arcAngleSpan > Math.PI ? 1 : 0} 1 ${x1} ${y1}" class="progress-ring-base" />
  `;
}


