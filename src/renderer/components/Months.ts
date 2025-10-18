import { arcPath } from '../layout/Paths';

export function renderMonthLabelDefs(params: {
  months: { name: string; shortName: string; angle: number }[];
  monthLabelRadius: number;
}): string {
  const { months, monthLabelRadius } = params;
  return months.map(({ angle }, index) => {
    const angleOffset = 0.01;
    const startAngle = angle + angleOffset;
    const endAngle = startAngle + (Math.PI / 24);
    const pathId = `monthLabelPath-${index}`;
    return `
      <path id="${pathId}" d="${arcPath(monthLabelRadius, startAngle, endAngle)}" fill="none" />
    `;
  }).join('');
}


