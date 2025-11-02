import type { PluginRendererFacade } from '../../utils/sceneHelpers';
import { formatNumber } from '../../utils/svg';

export function renderTargetDateTick(params: { plugin: PluginRendererFacade; progressRadius: number; dateToAngle: (d: Date) => number; }): string {
    const { plugin, progressRadius, dateToAngle } = params;
    let targetDateAngle = -Math.PI / 2;
    if (plugin.settings.targetCompletionDate) {
        try {
            const targetDate = new Date(plugin.settings.targetCompletionDate + 'T00:00:00');
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (!isNaN(targetDate.getTime()) && targetDate > today) {
                targetDateAngle = dateToAngle(targetDate);
            }
        } catch (e) {
            // Error parsing target date - use default 12 o'clock
        }
    }

    const targetTickOuterRadius = progressRadius + 5;
    const targetTickInnerRadius = progressRadius - 35;
    const targetMarkerSize = 8;

    const line = `
        <line
            x1="${formatNumber(targetTickOuterRadius * Math.cos(targetDateAngle))}"
            y1="${formatNumber(targetTickOuterRadius * Math.sin(targetDateAngle))}"
            x2="${formatNumber((targetTickInnerRadius+3) * Math.cos(targetDateAngle))}"
            y2="${formatNumber((targetTickInnerRadius+3) * Math.sin(targetDateAngle))}"
            class="target-date-tick"
        />`;

    const markerX = formatNumber(targetTickInnerRadius * Math.cos(targetDateAngle) - targetMarkerSize / 2);
    const markerY = formatNumber(targetTickInnerRadius * Math.sin(targetDateAngle) - targetMarkerSize / 2);
    const marker = `
        <rect x="${markerX}" y="${markerY}" width="${targetMarkerSize}" height="${targetMarkerSize}" class="target-date-marker" />`;

    return `${line}
${marker}`;
}


