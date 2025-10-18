import { formatNumber, escapeXml } from '../../utils/svg';

export function renderSubplotLabels(params: {
  NUM_RINGS: number;
  ringStartRadii: number[];
  ringWidths: number[];
  masterSubplotOrder: string[];
  outerRingAllScenes: boolean;
}): string {
  const { NUM_RINGS, ringStartRadii, ringWidths, masterSubplotOrder, outerRingAllScenes } = params;
  const totalRings = NUM_RINGS;
  const subplotCount = masterSubplotOrder.length;
  const ringsToUse = Math.min(subplotCount, totalRings);
  let svg = '';
  const act = 3; // Act 3 top
  for (let ringOffset = 0; ringOffset < ringsToUse; ringOffset++) {
    const ring = totalRings - ringOffset - 1;
    const subplot = masterSubplotOrder[ringOffset];
    if (!subplot) continue;
    const innerR = ringStartRadii[ring];
    const outerR = innerR + ringWidths[ring];
    const labelPathId = `subplot-label-path-${ring}`;
    const labelRadius = (innerR + outerR) / 2;
    const availableHeight = ringWidths[ring];
    const fontSize = Math.floor(availableHeight * 0.95);
    const arcLength = Math.PI / 2; // Act 3 span
    const endAngle = -Math.PI / 2; // 12 o'clock
    const startAngle = endAngle - arcLength;
    const arcPixelLength = labelRadius * arcLength;
    const d = `M ${formatNumber(labelRadius * Math.cos(startAngle))} ${formatNumber(labelRadius * Math.sin(startAngle))} A ${formatNumber(labelRadius)} ${formatNumber(labelRadius)} 0 0 1 ${formatNumber(labelRadius * Math.cos(endAngle))} ${formatNumber(labelRadius * Math.sin(endAngle))}`;
    const isOuterRing = ringOffset === 0;
    const labelRaw = (isOuterRing && outerRingAllScenes) ? 'ALL SCENES' : subplot.toUpperCase();
    svg += `
      <path id="${labelPathId}" d="${d}" fill="none" />
      <g class="subplot-label-group" data-font-size="${fontSize}">
        <text class="rt-subplot-ring-label-text" data-subplot-index="${ringOffset}" data-subplot-name="${escapeXml(subplot)}" text-anchor="end">
          <textPath href="#${labelPathId}" startOffset="100%" textLength="${formatNumber(arcPixelLength)}" lengthAdjust="spacingAndGlyphs">${escapeXml(labelRaw)}</textPath>
        </text>
      </g>
    `;
  }
  return svg;
}


