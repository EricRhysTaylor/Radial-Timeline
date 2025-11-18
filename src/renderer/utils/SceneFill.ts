import type { TimelineItem } from '../../types';
import { isBeatNote } from '../../utils/sceneHelpers';
import { normalizeStatus } from '../../utils/text';
import { isOverdueDateString } from '../../utils/date';
import { STATUS_COLORS } from '../../utils/constants';

export function getFillForScene(
    scene: TimelineItem,
    publishStageColors: Record<string, string>,
    subplotColorResolver?: (subplot: string) => string,
    isOuterAllScenes?: boolean,
    forceSubplotColor?: boolean
): string {
    if (isBeatNote(scene)) {
        return '#FFFFFF';
    }

    const subplotName = scene.subplot && scene.subplot.trim().length > 0 ? scene.subplot : 'Main Plot';
    if (forceSubplotColor && subplotColorResolver) {
        return subplotColorResolver(subplotName);
    }

    const statusList = Array.isArray(scene.status) ? scene.status : [scene.status];
    const norm = normalizeStatus(statusList[0]);
    const publishStage = scene['Publish Stage'] || 'Zero';
    if (!norm) return `url(#plaidTodo${publishStage})`;
    if (norm === 'Completed') {
        if (isOuterAllScenes && subplotColorResolver) {
            return subplotColorResolver(subplotName);
        }
        const stageColor = publishStageColors[publishStage as keyof typeof publishStageColors] || publishStageColors.Zero;
        return stageColor;
    }
    if (scene.due && isOverdueDateString(scene.due)) return STATUS_COLORS.Due;
    if (norm === 'Working') return `url(#plaidWorking${publishStage})`;
    if (norm === 'Todo') return `url(#plaidTodo${publishStage})`;
    return STATUS_COLORS[statusList[0] as keyof typeof STATUS_COLORS] || STATUS_COLORS.Todo;
}
