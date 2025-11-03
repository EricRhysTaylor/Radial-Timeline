import { arcPath } from '../layout/Paths';

export function renderMonthLabelDefs(params: {
  months: { name: string; shortName: string; angle: number; isFirst?: boolean; isLast?: boolean }[];
  monthLabelRadius: number;
  chronologueDateRadius: number;
}): string {
  const { months, monthLabelRadius, chronologueDateRadius } = params;
  return months.map(({ angle, isFirst, isLast }, index) => {
    const angleOffset = 0.01;
    const startAngle = angle + angleOffset;
    const endAngle = startAngle + (Math.PI / 24);
    const pathId = `monthLabelPath-${index}`;
    
    // Use chronologue radius for first/last labels, regular radius for month labels
    let radius = (isFirst || isLast) ? chronologueDateRadius : monthLabelRadius;
    
    return `
      <path id="${pathId}" d="${arcPath(radius, startAngle, endAngle)}" fill="none" />
    `;
  }).join('');
}


