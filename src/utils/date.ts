export function dateToAngle(date: Date): number {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const dayOfYear = (date.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24);
  const daysInYear =
    (new Date(date.getFullYear(), 11, 31).getTime() - startOfYear.getTime()) /
      (1000 * 60 * 60 * 24) +
    1;
  const progress = dayOfYear / daysInYear;
  return progress * 2 * Math.PI - Math.PI / 2;
} 