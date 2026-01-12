import { formatNumber } from '../../utils/svg';
import { dateToAngle } from '../../utils/date';
import type { CompletionEstimate } from '../../services/TimelineMetricsService';

export function renderEstimatedDateElements(params: {
  estimate: CompletionEstimate;
  progressRadius: number;
}): string {
  const { estimate, progressRadius } = params;
  const estimateDate = estimate.date;
  const stalenessClass = estimate.staleness ? ` estimate-${estimate.staleness}` : '';
  const stageClass = estimate.stage ? ` estimate-stage-${estimate.stage}` : '';
  const labelText = estimate.labelText;
  const displayDate = estimateDate === null ? new Date(new Date().getFullYear(), 0, 1) : estimateDate;
  const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
  const dateDisplay = labelText ?? dateFormatter.format(displayDate);
  
  // null date means "use default angle" (book complete, no target set)
  let absoluteDatePos: number;
  
  if (estimateDate === null) {
    // Use exact default angle (-PI/2) to match target tick default
    absoluteDatePos = -Math.PI / 2;
  } else {
    // Use same dateToAngle function as target tick (from utils/date)
    absoluteDatePos = dateToAngle(estimateDate);
  }

  const tickOuterRadius = progressRadius + 5;
  const tickInnerRadius = progressRadius - 35;
  const tickOuterX = tickOuterRadius * Math.cos(absoluteDatePos);
  const tickOuterY = tickOuterRadius * Math.sin(absoluteDatePos);
  const tickInnerX = tickInnerRadius * Math.cos(absoluteDatePos);
  const tickInnerY = tickInnerRadius * Math.sin(absoluteDatePos);

  let svg = '';
  if ([tickOuterX, tickOuterY, tickInnerX, tickInnerY].every((v) => Number.isFinite(v))) {
    svg += `
      <line x1="${formatNumber(tickOuterX)}" y1="${formatNumber(tickOuterY)}" x2="${formatNumber(tickInnerX)}" y2="${formatNumber(tickInnerY)}" class="estimated-date-tick${stageClass}${stalenessClass}" />
      <circle cx="${formatNumber(tickInnerX)}" cy="${formatNumber(tickInnerY)}" r="4" class="estimated-date-dot${stageClass}${stalenessClass}" />
    `;
  }

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
      <text x="${labelX}" y="${labelY}" text-anchor="middle" dominant-baseline="middle" class="estimation-date-label${stageClass}${stalenessClass}">${dateDisplay}</text>
    `;
  }
  return svg;
}


export function renderEstimationArc(params: {
  estimateDate: Date | null;
  progressRadius: number;
}): string {
  const { estimateDate, progressRadius } = params;
  
  // Don't render arc if date is null (default angle)
  if (estimateDate === null) {
    return '';
  }
  
  const startAngle = -Math.PI / 2; // 12 o'clock
  
  // Use same dateToAngle function for consistency
  const estimatedDateAngle = dateToAngle(estimateDate);
  
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


