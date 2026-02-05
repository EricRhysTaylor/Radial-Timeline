import type { TimelineItem } from '../../types';
import { isBeatNote } from '../../utils/sceneHelpers';
import { normalizeStatus } from '../../utils/text';
import { isOverdueDateString } from '../../utils/date';
import { STATUS_COLORS } from '../../utils/constants';

// Portable fallback colors (hex values from CSS variable fallbacks)
const PORTABLE_STATUS_COLORS = {
    Working: '#FF69B4',
    Todo: '#cccccc',
    Empty: '#ffffff',
    Due: '#d05e5e',
    Complete: '#22c55e', // Default green for complete
} as const;

export function getFillForScene(
    scene: TimelineItem,
    publishStageColors: Record<string, string>,
    subplotColorResolver?: (subplot: string) => string,
    isOuterAllScenes?: boolean,
    forceSubplotColor?: boolean,
    portableSvg?: boolean
): string {
    // Use portable colors (direct hex) or CSS variable colors
    const statusColors = portableSvg ? PORTABLE_STATUS_COLORS : STATUS_COLORS;
    const stageKeys = Object.keys(publishStageColors);
    const fallbackStage = stageKeys.includes('Zero') ? 'Zero' : (stageKeys[0] || 'Zero');
    const resolveStageKey = (raw: unknown): string => {
        const candidate = Array.isArray(raw) ? raw[0] : raw;
        const value = (candidate ?? fallbackStage).toString().trim();
        if (!value) return fallbackStage;
        const match = stageKeys.find(stage => stage.toLowerCase() === value.toLowerCase());
        return match ?? fallbackStage;
    };

    if (isBeatNote(scene)) {
        return '#FFFFFF';
    }

    const subplotName = scene.subplot && scene.subplot.trim().length > 0 ? scene.subplot : 'Main Plot';
    if (forceSubplotColor && subplotColorResolver) {
        return subplotColorResolver(subplotName);
    }

    const statusList = Array.isArray(scene.status) ? scene.status : [scene.status];
    const norm = normalizeStatus(statusList[0]);
    const publishStage = resolveStageKey(scene['Publish Stage']);
    if (!norm) return `url(#plaidTodo${publishStage})`;
    if (norm === 'Completed') {
        if (isOuterAllScenes && subplotColorResolver) {
            return subplotColorResolver(subplotName);
        }
        const stageColor = publishStageColors[publishStage as keyof typeof publishStageColors]
            || publishStageColors[fallbackStage as keyof typeof publishStageColors]
            || publishStageColors.Zero
            || '#888888';
        return stageColor;
    }
    if (scene.due && isOverdueDateString(scene.due)) return statusColors.Due;
    if (norm === 'Working') return `url(#plaidWorking${publishStage})`;
    if (norm === 'Todo') return `url(#plaidTodo${publishStage})`;
    return statusColors[statusList[0] as keyof typeof statusColors] || statusColors.Todo;
}
