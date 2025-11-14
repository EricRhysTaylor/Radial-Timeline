import { PLOT_PIXEL_WIDTH } from '../layout/LayoutConstants';
import type { TimelineItem } from '../../types';
import { isBeatNote } from '../../utils/sceneHelpers';

export type PositionInfo = { startAngle: number; endAngle: number; angularSize: number };

export function computePositions(innerR: number, outerR: number, startAngle: number, endAngle: number, items: TimelineItem[]): Map<number, PositionInfo> {
    const middleRadius = (innerR + outerR) / 2;
    const plotAngularWidth = PLOT_PIXEL_WIDTH / middleRadius;
    const totalAngularSpace = endAngle - startAngle;
    const plotCount = items.filter(it => isBeatNote(it)).length;
    const plotTotalAngularSpace = plotCount * plotAngularWidth;
    const sceneCount = items.filter(it => !isBeatNote(it)).length;
    const sceneAngularSize = sceneCount > 0 ? (totalAngularSpace - plotTotalAngularSpace) / sceneCount : 0;

    let current = startAngle;
    const positions = new Map<number, PositionInfo>();
    items.forEach((it, idx) => {
        if (isBeatNote(it)) {
            positions.set(idx, { startAngle: current, endAngle: current + plotAngularWidth, angularSize: plotAngularWidth });
            current += plotAngularWidth;
        } else {
            positions.set(idx, { startAngle: current, endAngle: current + sceneAngularSize, angularSize: sceneAngularSize });
            current += sceneAngularSize;
        }
    });
    return positions;
}

export function getEffectiveScenesForRing(
    allScenes: TimelineItem[],
    actIndex: number,
    subplot: string | undefined,
    outerAllScenes: boolean,
    isOuter: boolean,
    grouped: { [act: number]: { [subplot: string]: TimelineItem[] } }
): TimelineItem[] {
    if (isOuter && outerAllScenes) {
        const seenPaths = new Set<string>();
        const seenPlotKeys = new Set<string>();
        const result: TimelineItem[] = [];
        allScenes.forEach(s => {
            const a = s.actNumber !== undefined ? s.actNumber - 1 : 0;
            if (a !== actIndex) return;
            if (isBeatNote(s)) {
                const key = `${String(s.title || '')}::${String(s.actNumber ?? '')}`;
                if (seenPlotKeys.has(key)) return;
                seenPlotKeys.add(key);
                result.push(s);
            } else {
                const k = s.path || `${s.title || ''}::${String(s.when || '')}`;
                if (seenPaths.has(k)) return;
                seenPaths.add(k);
                result.push(s);
            }
        });
        return result;
    }

    const list = subplot ? (grouped[actIndex] && grouped[actIndex][subplot]) || [] : [];
    return outerAllScenes ? list.filter(s => !isBeatNote(s)) : list.filter(s => !isBeatNote(s));
}
