export function computeRingGeometry(params: {
  size: number;
  innerRadius: number;
  subplotOuterRadius: number;  // Outer edge of subplot rings
  outerRadius: number;          // Outer boundary for month labels/ticks
  numRings: number;
  monthTickTerminal: number;
  monthTextInset: number;
}) {
  const { size, innerRadius, subplotOuterRadius, outerRadius, numRings, monthTickTerminal, monthTextInset } = params;
  // Guard against zero rings to avoid NaNs downstream
  if (!Number.isFinite(numRings) || numRings <= 0) {
    const lineInnerRadius = innerRadius;
    const lineOuterRadius = outerRadius;
    const monthLabelRadius = lineOuterRadius - monthTextInset;
    return { ringWidths: [] as number[], ringStartRadii: [] as number[], lineInnerRadius, lineOuterRadius, monthLabelRadius };
  }
  const availableSpace = subplotOuterRadius - innerRadius;
  const reductionFactor = 1;
  const sumOfSeries = (reductionFactor === 1) ? numRings : (1 - Math.pow(reductionFactor, numRings)) / (1 - reductionFactor);
  const initialRingWidth = availableSpace / sumOfSeries;
  const ringWidths = Array.from({ length: numRings }, (_, i) => initialRingWidth * Math.pow(reductionFactor, i));
  const ringStartRadii = ringWidths.reduce((acc, width, i) => {
    const previousRadius = i === 0 ? innerRadius : acc[i - 1] + ringWidths[i - 1];
    acc.push(previousRadius);
    return acc;
  }, [] as number[]);
  const lineInnerRadius = ringStartRadii[0] - 20;
  const lineOuterRadius = outerRadius;  // Use the explicit outerRadius for month labels
  const monthLabelRadius = lineOuterRadius - monthTextInset;
  return { ringWidths, ringStartRadii, lineInnerRadius, lineOuterRadius, monthLabelRadius };
}


