import type { PluginRendererFacade } from '../../utils/sceneHelpers';
import { formatNumber, escapeXml } from '../../utils/svg';

const STAGE_ORDER = ['Zero', 'Author', 'House', 'Press'] as const;
type Stage = typeof STAGE_ORDER[number];

/**
 * Enhanced data for target tick tooltips.
 * When provided, tooltips show Required Pace Calculator and Stage Milestone Alerts.
 */
export interface TargetTickEnhancedData {
    /** Remaining scenes per stage */
    stageRemaining: Record<Stage, number>;
    /** Current pace (scenes per week) */
    currentPace: number;
    /** Current estimated completion stage (for auto mode) */
    estimatedStage: Stage | null;
    /** Estimated completion date (for auto mode) */
    estimatedDate: Date | null;
}

/**
 * Build an enhanced tooltip for a target tick.
 * Shows date, remaining scenes, days until target, required pace, and milestone alerts.
 */
function buildEnhancedTooltip(
    stage: Stage,
    targetDate: Date,
    today: Date,
    isOverdue: boolean,
    enhancedData?: TargetTickEnhancedData
): string {
    const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const lines: string[] = [];
    
    // Line 1: Stage and date
    if (isOverdue) {
        lines.push(`${stage} target: ${dateFormatter.format(targetDate)} (OVERDUE)`);
    } else {
        lines.push(`${stage} target: ${dateFormatter.format(targetDate)}`);
    }
    
    if (!enhancedData) return lines.join('\n');
    
    const remaining = enhancedData.stageRemaining[stage] ?? 0;
    const daysUntil = Math.ceil((targetDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
    
    if (isOverdue) {
        // Overdue: show how many scenes remain
        if (remaining > 0) {
            lines.push(`${remaining} scene${remaining !== 1 ? 's' : ''} remaining`);
        }
    } else if (daysUntil > 0 && remaining > 0) {
        // Line 2: Milestone alert (days and scenes remaining)
        lines.push(`${daysUntil} day${daysUntil !== 1 ? 's' : ''} · ${remaining} scene${remaining !== 1 ? 's' : ''} remaining`);
        
        // Line 3: Required pace calculator
        const weeksUntil = daysUntil / 7;
        if (weeksUntil > 0) {
            const requiredPace = remaining / weeksUntil;
            const paceFormatted = requiredPace.toFixed(1);
            lines.push(`Required: ${paceFormatted}/week to hit target`);
            
            // Line 4: Compare with current pace
            if (enhancedData.currentPace > 0) {
                const diff = enhancedData.currentPace - requiredPace;
                if (Math.abs(diff) >= 0.1) {
                    if (diff > 0) {
                        lines.push(`Current: ${enhancedData.currentPace.toFixed(1)}/week (+${diff.toFixed(1)} ahead)`);
                    } else {
                        lines.push(`Current: ${enhancedData.currentPace.toFixed(1)}/week (${diff.toFixed(1)} behind)`);
                    }
                } else {
                    lines.push(`Current: ${enhancedData.currentPace.toFixed(1)}/week (on pace)`);
                }
            }
        }
    } else if (remaining === 0) {
        lines.push('Stage complete!');
    }
    
    return lines.join('\n');
}

/**
 * Renders all stage target date ticks on the timeline.
 * Each stage gets its own tick with the stage color, or red if overdue.
 * 
 * Auto Mode: When all target dates are blank, shows a single tick for the 
 * estimated completion stage at the estimated completion date.
 */
export function renderTargetDateTick(params: { 
    plugin: PluginRendererFacade; 
    progressRadius: number; 
    dateToAngle: (d: Date) => number;
    enhancedData?: TargetTickEnhancedData;
}): string {
    const { plugin, progressRadius, dateToAngle, enhancedData } = params;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const targetTickOuterRadius = progressRadius + 5;
    const targetTickInnerRadius = progressRadius - 35;
    const targetMarkerSize = 8;
    
    let svg = '';
    
    const stageTargetDates = plugin.settings.stageTargetDates;
    
    // Check if ALL target date fields are blank (enables auto mode)
    const hasAnyTargetDate = stageTargetDates && STAGE_ORDER.some(s => stageTargetDates[s]);
    const isAutoMode = !hasAnyTargetDate && enhancedData?.estimatedStage && enhancedData?.estimatedDate;
    
    if (isAutoMode && enhancedData) {
        // AUTO MODE: Show single tick for estimated completion stage at estimated date
        const stage = enhancedData.estimatedStage!;
        const estimatedDate = enhancedData.estimatedDate!;
        const targetDateAngle = dateToAngle(estimatedDate);
        
        // Build tooltip for auto mode
        const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const remaining = enhancedData.stageRemaining[stage] ?? 0;
        const lines: string[] = [
            `${stage} est. completion: ${dateFormatter.format(estimatedDate)}`,
        ];
        if (remaining > 0 && enhancedData.currentPace > 0) {
            lines.push(`${remaining} remaining at ${enhancedData.currentPace.toFixed(1)}/week`);
        }
        const escapedTooltip = escapeXml(lines.join('\n'));
        
        const stageClass = ` target-stage-${stage.toLowerCase()}`;
        const lineX1 = formatNumber(targetTickOuterRadius * Math.cos(targetDateAngle));
        const lineY1 = formatNumber(targetTickOuterRadius * Math.sin(targetDateAngle));
        const lineX2 = formatNumber((targetTickInnerRadius + 3) * Math.cos(targetDateAngle));
        const lineY2 = formatNumber((targetTickInnerRadius + 3) * Math.sin(targetDateAngle));
        const markerX = formatNumber(targetTickInnerRadius * Math.cos(targetDateAngle) - targetMarkerSize / 2);
        const markerY = formatNumber(targetTickInnerRadius * Math.sin(targetDateAngle) - targetMarkerSize / 2);
        
        svg += `
            <g class="rt-target-tick-group${stageClass} rt-target-auto-mode" data-stage="${stage}">
                <line
                    x1="${lineX1}" y1="${lineY1}"
                    x2="${lineX2}" y2="${lineY2}"
                    class="target-date-tick${stageClass}"
                />
                <rect 
                    x="${markerX}" y="${markerY}" 
                    width="${targetMarkerSize}" height="${targetMarkerSize}" 
                    class="target-date-marker${stageClass} rt-tooltip-target"
                    data-tooltip="${escapedTooltip}"
                    data-tooltip-placement="top"
                />
            </g>`;
        
        return svg;
    }
    
    // MANUAL MODE: Render stage-specific target ticks (only show ticks with dates set)
    if (stageTargetDates) {
        for (const stage of STAGE_ORDER) {
            const dateStr = stageTargetDates[stage];
            if (!dateStr) continue; // Skip blank dates
            
            try {
                const targetDate = new Date(dateStr + 'T00:00:00');
                if (isNaN(targetDate.getTime())) continue;
                
                const isOverdue = targetDate < today;
                const targetDateAngle = dateToAngle(targetDate);
                
                // Build enhanced tooltip with pace calculator and milestone alerts
                const tooltipText = buildEnhancedTooltip(stage, targetDate, today, isOverdue, enhancedData);
                const escapedTooltip = escapeXml(tooltipText);
                
                const overdueClass = isOverdue ? ' target-overdue' : '';
                const stageClass = ` target-stage-${stage.toLowerCase()}`;
                
                const lineX1 = formatNumber(targetTickOuterRadius * Math.cos(targetDateAngle));
                const lineY1 = formatNumber(targetTickOuterRadius * Math.sin(targetDateAngle));
                const lineX2 = formatNumber((targetTickInnerRadius + 3) * Math.cos(targetDateAngle));
                const lineY2 = formatNumber((targetTickInnerRadius + 3) * Math.sin(targetDateAngle));
                
                const markerX = formatNumber(targetTickInnerRadius * Math.cos(targetDateAngle) - targetMarkerSize / 2);
                const markerY = formatNumber(targetTickInnerRadius * Math.sin(targetDateAngle) - targetMarkerSize / 2);
                
                svg += `
                    <g class="rt-target-tick-group${stageClass}${overdueClass}" data-stage="${stage}">
                        <line
                            x1="${lineX1}" y1="${lineY1}"
                            x2="${lineX2}" y2="${lineY2}"
                            class="target-date-tick${stageClass}${overdueClass}"
                        />
                        <rect 
                            x="${markerX}" y="${markerY}" 
                            width="${targetMarkerSize}" height="${targetMarkerSize}" 
                            class="target-date-marker${stageClass}${overdueClass} rt-tooltip-target"
                            data-tooltip="${escapedTooltip}"
                            data-tooltip-placement="top"
                        />
                    </g>`;
            } catch (e) {
                // Error parsing target date - skip this stage
            }
        }
    }
    
    // Legacy support: also render old single targetCompletionDate if set and no new dates
    // This ensures backwards compatibility during migration
    if (!stageTargetDates?.Zero && !stageTargetDates?.Author && !stageTargetDates?.House && !stageTargetDates?.Press) {
        if (plugin.settings.targetCompletionDate) {
            try {
                const targetDate = new Date(plugin.settings.targetCompletionDate + 'T00:00:00');
                if (!isNaN(targetDate.getTime()) && targetDate > today) {
                    const targetDateAngle = dateToAngle(targetDate);
                    
                    const lineX1 = formatNumber(targetTickOuterRadius * Math.cos(targetDateAngle));
                    const lineY1 = formatNumber(targetTickOuterRadius * Math.sin(targetDateAngle));
                    const lineX2 = formatNumber((targetTickInnerRadius + 3) * Math.cos(targetDateAngle));
                    const lineY2 = formatNumber((targetTickInnerRadius + 3) * Math.sin(targetDateAngle));
                    
                    const markerX = formatNumber(targetTickInnerRadius * Math.cos(targetDateAngle) - targetMarkerSize / 2);
                    const markerY = formatNumber(targetTickInnerRadius * Math.sin(targetDateAngle) - targetMarkerSize / 2);
                    
                    svg += `
                        <line
                            x1="${lineX1}" y1="${lineY1}"
                            x2="${lineX2}" y2="${lineY2}"
                            class="target-date-tick"
                        />
                        <rect 
                            x="${markerX}" y="${markerY}" 
                            width="${targetMarkerSize}" height="${targetMarkerSize}" 
                            class="target-date-marker"
                        />`;
                }
            } catch (e) {
                // Error parsing target date - skip
            }
        }
    }
    
    return svg;
}


