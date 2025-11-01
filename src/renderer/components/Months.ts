import { arcPath } from '../layout/Paths';

export function renderMonthLabelDefs(params: {
  months: { name: string; shortName: string; angle: number; isFirst?: boolean; isLast?: boolean }[];
  monthLabelRadius: number;
}): string {
  const { months, monthLabelRadius } = params;
  return months.map(({ angle, isFirst, isLast }, index) => {
    const angleOffset = 0.01;
    const startAngle = angle + angleOffset;
    const endAngle = startAngle + (Math.PI / 24);
    const pathId = `monthLabelPath-${index}`;
    
    // Adjust radius for first and last labels
    let radius = monthLabelRadius;
    if (isFirst) {
      radius = monthLabelRadius + 4; // Start date higher by 4px Max or clipping to of SVG box
    } else if (isLast) {
      radius = monthLabelRadius - 8; // End date lower by 8px
    }
    
    return `
      <path id="${pathId}" d="${arcPath(radius, startAngle, endAngle)}" fill="none" />
    `;
  }).join('');
}


