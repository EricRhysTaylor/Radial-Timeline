export function renderProgressRing(params: {
    progressRadius: number;
    yearProgress: number;
    currentYearStartAngle: number;
    segmentCount?: number;
}): string {
    const { progressRadius, yearProgress, currentYearStartAngle, segmentCount = 6 } = params;
    const fullCircleAngle = 2 * Math.PI;
    const segmentAngle = fullCircleAngle / segmentCount;
    const completeSegments = Math.floor(yearProgress * segmentCount);
    const partialSegmentAngle = (yearProgress * segmentCount - completeSegments) * segmentAngle;
    let svg = '';
    for (let i = 0; i < segmentCount; i++) {
        const segStart = currentYearStartAngle + (i * segmentAngle);
        let segEnd = segStart + segmentAngle;
        if (i > completeSegments) continue;
        if (i === completeSegments && partialSegmentAngle > 0) {
            segEnd = segStart + partialSegmentAngle;
        }
        svg += `
            <path
                d="
                    M ${progressRadius * Math.cos(segStart)} ${progressRadius * Math.sin(segStart)}
                    A ${progressRadius} ${progressRadius} 0 ${(segEnd - segStart) > Math.PI ? 1 : 0} 1 
                    ${progressRadius * Math.cos(segEnd)} ${progressRadius * Math.sin(segEnd)}
                "
                class="progress-ring-fill"
                stroke="url(#linearColors${i+1})"
            />
        `;
    }
    return svg;
}


