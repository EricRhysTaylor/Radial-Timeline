/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import { formatNumber } from '../../utils/svg';
import { Scene } from '../../main';
import { parseWhenField, calculateTimeSpan, generateTimeLabels, TimeLabelInfo } from '../../utils/date';

/**
 * Render the chronological timeline arc with proportional tick marks
 * This creates a 3px arc around the outer perimeter with tick marks positioned
 * based on actual time proportions, not scene positions.
 */
export function renderChronologueTimelineArc(
    scenes: Scene[],
    outerRadius: number,
    arcWidth: number = 3
): string {
    // Parse all When fields and filter out invalid dates
    const validDates: Date[] = [];
    const sceneDates = new Map<Scene, Date>();
    
    scenes.forEach(scene => {
        const whenDate = parseWhenField(typeof scene.when === 'string' ? scene.when : '');
        if (whenDate) {
            validDates.push(whenDate);
            sceneDates.set(scene, whenDate);
        }
    });
    
    if (validDates.length === 0) {
        return ''; // No valid dates to render
    }
    
    // Calculate time span
    const timeSpan = calculateTimeSpan(validDates);
    const earliestDate = validDates.reduce((earliest, current) => 
        current.getTime() < earliest.getTime() ? current : earliest
    );
    
    // Generate time labels
    const timeLabels = generateTimeLabels(timeSpan, earliestDate);
    
    let svg = '';
    
    // Render the main 3px arc
    const arcRadius = outerRadius + 10; // Position outside the scene ring
    svg += `<g class="rt-chronologue-timeline-arc">`;
    
    // Main arc path (full circle)
    const arcPath = `M ${formatNumber(arcRadius)} 0 A ${formatNumber(arcRadius)} ${formatNumber(arcRadius)} 0 1 1 ${formatNumber(-arcRadius)} 0 A ${formatNumber(arcRadius)} ${formatNumber(arcRadius)} 0 1 1 ${formatNumber(arcRadius)} 0`;
    svg += `<path d="${arcPath}" fill="none" stroke="var(--text-muted)" stroke-width="${arcWidth}" opacity="0.6"/>`;
    
    // Render tick marks for each scene with valid When field
    sceneDates.forEach((date, scene) => {
        const angle = mapTimeToAngle(date.getTime(), earliestDate.getTime(), earliestDate.getTime() + timeSpan.totalMs);
        const tickLength = 8; // Length of tick mark extending outward
        
        const x1 = formatNumber(arcRadius * Math.cos(angle));
        const y1 = formatNumber(arcRadius * Math.sin(angle));
        const x2 = formatNumber((arcRadius + tickLength) * Math.cos(angle));
        const y2 = formatNumber((arcRadius + tickLength) * Math.sin(angle));
        
        svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--text-muted)" stroke-width="1" opacity="0.8"/>`;
    });
    
    // Render time labels
    timeLabels.forEach((label: TimeLabelInfo, index: number) => {
        const labelRadius = arcRadius + 20; // Position labels outside tick marks
        const x = formatNumber(labelRadius * Math.cos(label.angle));
        const y = formatNumber(labelRadius * Math.sin(label.angle));
        
        svg += `<text x="${x}" y="${y}" class="rt-chronologue-time-label" text-anchor="middle" dominant-baseline="middle" font-size="10" fill="var(--text-muted)" opacity="0.7">${label.text}</text>`;
    });
    
    svg += `</g>`;
    
    return svg;
}

/**
 * Map a time value to an angular position on the timeline arc
 */
function mapTimeToAngle(timeMs: number, startMs: number, endMs: number): number {
    const progress = (timeMs - startMs) / (endMs - startMs);
    return progress * 2 * Math.PI - Math.PI / 2; // Start at top (12 o'clock)
}

/**
 * Render elapsed time arc between two selected scenes
 */
export function renderElapsedTimeArc(
    scene1: Scene,
    scene2: Scene,
    outerRadius: number,
    arcWidth: number = 2
): string {
    const date1 = parseWhenField(typeof scene1.when === 'string' ? scene1.when : '');
    const date2 = parseWhenField(typeof scene2.when === 'string' ? scene2.when : '');
    
    if (!date1 || !date2) {
        return '';
    }
    
    // Determine which scene is earlier
    const [earlierScene, laterScene] = date1.getTime() < date2.getTime() ? [scene1, scene2] : [scene2, scene1];
    const [earlierDate, laterDate] = date1.getTime() < date2.getTime() ? [date1, date2] : [date2, date1];
    
    const arcRadius = outerRadius + 15; // Position between main arc and tick marks
    const startAngle = mapTimeToAngle(earlierDate.getTime(), earlierDate.getTime(), laterDate.getTime());
    const endAngle = mapTimeToAngle(laterDate.getTime(), earlierDate.getTime(), laterDate.getTime());
    
    // Create arc path
    const largeArcFlag = (endAngle - startAngle) > Math.PI ? 1 : 0;
    const x1 = formatNumber(arcRadius * Math.cos(startAngle));
    const y1 = formatNumber(arcRadius * Math.sin(startAngle));
    const x2 = formatNumber(arcRadius * Math.cos(endAngle));
    const y2 = formatNumber(arcRadius * Math.sin(endAngle));
    
    const arcPath = `M ${x1} ${y1} A ${formatNumber(arcRadius)} ${formatNumber(arcRadius)} 0 ${largeArcFlag} 1 ${x2} ${y2}`;
    
    return `<g class="rt-elapsed-time-arc">
        <path d="${arcPath}" fill="none" stroke="var(--interactive-accent)" stroke-width="${arcWidth}" opacity="0.8"/>
    </g>`;
}
