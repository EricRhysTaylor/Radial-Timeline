export function computeRingGeometry(params: {
  size: number;
  innerRadius: number;
  outerRadius: number;
  numRings: number;
  monthTickTerminal: number;
  monthTextInset: number;
}) {
  const { size, innerRadius, outerRadius, numRings, monthTickTerminal, monthTextInset } = params;
  // Guard against zero rings to avoid NaNs downstream
  if (!Number.isFinite(numRings) || numRings <= 0) {
    const lineInnerRadius = innerRadius;
    const lineOuterRadius = innerRadius + monthTickTerminal;
    const monthLabelRadius = lineOuterRadius - monthTextInset;
    return { ringWidths: [] as number[], ringStartRadii: [] as number[], lineInnerRadius, lineOuterRadius, monthLabelRadius };
  }
  const availableSpace = outerRadius - innerRadius;
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
  const lineOuterRadius = ringStartRadii[numRings - 1] + ringWidths[numRings - 1] + monthTickTerminal;
  const monthLabelRadius = lineOuterRadius - monthTextInset;
  return { ringWidths, ringStartRadii, lineInnerRadius, lineOuterRadius, monthLabelRadius };
}


