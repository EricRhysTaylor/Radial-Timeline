import type { RadialTimelineSettings } from '../types';

const MIN_ACTS = 3;

export function getConfiguredActCount(settings?: RadialTimelineSettings): number {
    const raw = settings?.actCount;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
        return Math.max(MIN_ACTS, Math.floor(raw));
    }
    return MIN_ACTS;
}

export function parseActLabels(settings: RadialTimelineSettings | undefined, actCount: number): string[] {
    const raw = settings?.actLabelsRaw ?? '';
    const labels = raw
        .split(',')
        .map(label => label.trim())
        .filter(label => label.length > 0);
    if (labels.length === 0) return [];
    return labels.slice(0, actCount);
}

export function shouldShowActLabels(settings?: RadialTimelineSettings): boolean {
    return settings?.showActLabels ?? true;
}

export function resolveActLabel(
    actIndex: number,
    labels: string[],
    showActLabelsFlag: boolean
): string {
    if (!showActLabelsFlag) return String(actIndex + 1);
    const label = labels[actIndex];
    return label && label.length > 0 ? label : `Act ${actIndex + 1}`;
}

export function clampActNumber(actNumber: number | undefined, actCount: number): number {
    const n = typeof actNumber === 'number' && Number.isFinite(actNumber) ? Math.floor(actNumber) : 1;
    if (n < 1) return 1;
    if (n > actCount) return actCount;
    return n;
}


