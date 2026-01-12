import type { PluginRendererFacade } from '../../utils/sceneHelpers';
import { formatNumber, escapeXml } from '../../utils/svg';

const STAGE_ORDER = ['Zero', 'Author', 'House', 'Press'] as const;
type Stage = typeof STAGE_ORDER[number];

// Hotspot radius for target ticks (large enough for easy hover/touch, matching estimate tick)
const TARGET_HOTSPOT_RADIUS = 20;

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
 * Build a concise tooltip for a target tick.
 * Shows date and approximate days/scenes remaining.
 */
function buildEnhancedTooltip(
    stage: Stage,
    targetDate: Date,
    today: Date,
    isOverdue: boolean,
    enhancedData?: TargetTickEnhancedData
): string {
    const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    
    // Line 1: Stage and date
    let tooltip = isOverdue 
        ? `${stage} target: ${dateFormatter.format(targetDate)} (OVERDUE)`
        : `${stage} target: ${dateFormatter.format(targetDate)}`;
    
    if (!enhancedData) return tooltip;
    
    const remaining = enhancedData.stageRemaining[stage] ?? 0;
    const daysUntil = Math.ceil((targetDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
    
    if (isOverdue && remaining > 0) {
        // Overdue: show how many scenes remain
        tooltip += `\n${remaining} scene${remaining !== 1 ? 's' : ''} remaining`;
    } else if (!isOverdue && remaining > 0) {
        // Not overdue with work to do: show approximate days and scenes
        tooltip += `\n~${daysUntil} days · ${remaining} scene${remaining !== 1 ? 's' : ''} remaining`;
    }
    // Note: Don't show "Stage complete!" - if remaining is 0, it might just mean
    // no scenes have reached that stage yet (not actually complete)
    
    return tooltip;
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
        // Hotspot center (at the marker position)
        const hotspotCx = formatNumber(targetTickInnerRadius * Math.cos(targetDateAngle));
        const hotspotCy = formatNumber(targetTickInnerRadius * Math.sin(targetDateAngle));
        
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
                    class="target-date-marker${stageClass}"
                />
                <circle 
                    cx="${hotspotCx}" cy="${hotspotCy}" 
                    r="${TARGET_HOTSPOT_RADIUS}" 
                    class="rt-target-hotspot rt-tooltip-target"
                    data-tooltip="${escapedTooltip}"
                    data-tooltip-placement="top"
                    fill="transparent"
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
                // Hotspot center (at the marker position)
                const hotspotCx = formatNumber(targetTickInnerRadius * Math.cos(targetDateAngle));
                const hotspotCy = formatNumber(targetTickInnerRadius * Math.sin(targetDateAngle));
                
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
                            class="target-date-marker${stageClass}${overdueClass}"
                        />
                        <circle 
                            cx="${hotspotCx}" cy="${hotspotCy}" 
                            r="${TARGET_HOTSPOT_RADIUS}" 
                            class="rt-target-hotspot rt-tooltip-target"
                            data-tooltip="${escapedTooltip}"
                            data-tooltip-placement="top"
                            fill="transparent"
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
                    const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    const daysUntil = Math.ceil((targetDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
                    const tooltipText = `Target: ${dateFormatter.format(targetDate)}\n~${daysUntil} days`;
                    const escapedTooltip = escapeXml(tooltipText);
                    
                    const lineX1 = formatNumber(targetTickOuterRadius * Math.cos(targetDateAngle));
                    const lineY1 = formatNumber(targetTickOuterRadius * Math.sin(targetDateAngle));
                    const lineX2 = formatNumber((targetTickInnerRadius + 3) * Math.cos(targetDateAngle));
                    const lineY2 = formatNumber((targetTickInnerRadius + 3) * Math.sin(targetDateAngle));
                    
                    const markerX = formatNumber(targetTickInnerRadius * Math.cos(targetDateAngle) - targetMarkerSize / 2);
                    const markerY = formatNumber(targetTickInnerRadius * Math.sin(targetDateAngle) - targetMarkerSize / 2);
                    const hotspotCx = formatNumber(targetTickInnerRadius * Math.cos(targetDateAngle));
                    const hotspotCy = formatNumber(targetTickInnerRadius * Math.sin(targetDateAngle));
                    
                    svg += `
                        <g class="rt-target-tick-group rt-target-legacy">
                            <line
                                x1="${lineX1}" y1="${lineY1}"
                                x2="${lineX2}" y2="${lineY2}"
                                class="target-date-tick"
                            />
                            <rect 
                                x="${markerX}" y="${markerY}" 
                                width="${targetMarkerSize}" height="${targetMarkerSize}" 
                                class="target-date-marker"
                            />
                            <circle 
                                cx="${hotspotCx}" cy="${hotspotCy}" 
                                r="${TARGET_HOTSPOT_RADIUS}" 
                                class="rt-target-hotspot rt-tooltip-target"
                                data-tooltip="${escapedTooltip}"
                                data-tooltip-placement="top"
                                fill="transparent"
                            />
                        </g>`;
                }
            } catch (e) {
                // Error parsing target date - skip
            }
        }
    }
    
    return svg;
}


