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
    
    // Use same radius for first and last labels (no offset)
    let radius = monthLabelRadius+5; // move up to top
    
    return `
      <path id="${pathId}" d="${arcPath(radius, startAngle, endAngle)}" fill="none" />
    `;
  }).join('');
}


