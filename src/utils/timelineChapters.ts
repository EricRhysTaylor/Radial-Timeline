import type { TimelineItem } from '../types';
import { isSceneItem } from './sceneHelpers';

export const SHARED_CHAPTER_FIELD_KEY = 'Chapter';

export interface TimelineChapterMarker {
    sourcePath?: string;
    sourceType: 'Scene' | 'Beat' | 'Backdrop';
    title: string;
    resolvedScenePath: string;
    resolvedTimelinePosition: number;
}

function normalizeKey(key: string): string {
    return key.toLowerCase().replace(/[\s_-]/g, '');
}

export function readSharedChapterTitle(frontmatter?: Record<string, unknown>): string | undefined {
    if (!frontmatter) return undefined;

    for (const [key, value] of Object.entries(frontmatter)) {
        if (normalizeKey(key) !== 'chapter') continue;
        if (typeof value !== 'string') return undefined;
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : undefined;
    }

    return undefined;
}

function isSupportedChapterSource(
    item: TimelineItem
): item is TimelineItem & { itemType: 'Scene' | 'Beat' | 'Backdrop' } {
    return item.itemType === 'Scene' || item.itemType === 'Beat' || item.itemType === 'Backdrop' || !item.itemType;
}

function resolveSourceType(item: TimelineItem): TimelineChapterMarker['sourceType'] | null {
    if (item.itemType === 'Beat' || item.itemType === 'Backdrop') {
        return item.itemType;
    }
    if (isSceneItem(item)) {
        return 'Scene';
    }
    return null;
}

export function resolveTimelineChapterMarkers(
    orderedItems: TimelineItem[]
): TimelineChapterMarker[] {
    const resolved: TimelineChapterMarker[] = [];
    const pending: Array<Pick<TimelineChapterMarker, 'sourcePath' | 'sourceType' | 'title'>> = [];
    let resolvedTimelinePosition = 0;

    for (const item of orderedItems) {
        if (!isSupportedChapterSource(item)) continue;

        const chapterTitle = readSharedChapterTitle(item.rawFrontmatter);
        const sourceType = resolveSourceType(item);
        if (!sourceType) continue;

        if (isSceneItem(item) && item.path) {
            resolvedTimelinePosition += 1;

            for (const marker of pending) {
                resolved.push({
                    ...marker,
                    resolvedScenePath: item.path,
                    resolvedTimelinePosition,
                });
            }
            pending.length = 0;

            if (chapterTitle) {
                resolved.push({
                    sourcePath: item.path,
                    sourceType,
                    title: chapterTitle,
                    resolvedScenePath: item.path,
                    resolvedTimelinePosition,
                });
            }
            continue;
        }

        if (chapterTitle) {
            pending.push({
                sourcePath: item.path,
                sourceType,
                title: chapterTitle,
            });
        }
    }

    return resolved;
}

export function groupTimelineChapterMarkersByScenePath(
    markers: TimelineChapterMarker[]
): Record<string, TimelineChapterMarker[]> {
    return markers.reduce<Record<string, TimelineChapterMarker[]>>((acc, marker) => {
        if (!acc[marker.resolvedScenePath]) {
            acc[marker.resolvedScenePath] = [];
        }
        acc[marker.resolvedScenePath].push(marker);
        return acc;
    }, {});
}
