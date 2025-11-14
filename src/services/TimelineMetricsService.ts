import type RadialTimelinePlugin from '../main';
import type { TimelineItem } from '../types';
import { isBeatNote } from '../utils/sceneHelpers';

export interface CompletionEstimate {
    date: Date | null;
    total: number;
    remaining: number;
    rate: number;
}

export class TimelineMetricsService {
    constructor(private plugin: RadialTimelinePlugin) {}

    calculateCompletionEstimate(scenes: TimelineItem[]): CompletionEstimate | null {
        const sceneNotesOnly = scenes.filter(scene => !isBeatNote(scene));
        if (sceneNotesOnly.length === 0) return null;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const allScenesComplete = sceneNotesOnly.every(scene => {
            const publishStage = scene['Publish Stage']?.toString().trim().toLowerCase() || '';
            const sceneStatus = scene.status?.toString().trim().toLowerCase() || '';
            return publishStage === 'press' && (sceneStatus === 'complete' || sceneStatus === 'done');
        });

        if (allScenesComplete) {
            const targetDate = this.plugin.settings.targetCompletionDate
                ? new Date(this.plugin.settings.targetCompletionDate + 'T00:00:00')
                : null;
            this.captureLatestStats(sceneNotesOnly.length, 0, 0);
            return { date: targetDate, total: sceneNotesOnly.length, remaining: 0, rate: 0 };
        }

        const startOfYear = new Date(today.getFullYear(), 0, 1);
        const startOfYearTime = startOfYear.getTime();
        const todayTime = today.getTime();
        const daysPassedThisYear = Math.max(1, Math.round((todayTime - startOfYearTime) / (1000 * 60 * 60 * 24)));

        let completedThisYear = 0;
        const completedPathsThisYear = new Set<string>();

        sceneNotesOnly.forEach(scene => {
            const dueDateStr = scene.due;
            const scenePath = scene.path;
            const sceneStatus = scene.status?.toString().trim().toLowerCase();

            if (sceneStatus !== 'complete' && sceneStatus !== 'done') return;
            if (!scenePath || completedPathsThisYear.has(scenePath)) return;
            if (!dueDateStr) return;

            try {
                const dueDate = new Date(dueDateStr + 'T00:00:00');
                dueDate.setHours(0, 0, 0, 0);
                const dueTime = dueDate.getTime();

                if (!isNaN(dueTime) && dueTime >= startOfYearTime && dueTime < todayTime) {
                    completedThisYear++;
                    completedPathsThisYear.add(scenePath);
                }
            } catch {
                // ignore parse errors
            }
        });

        if (completedThisYear <= 0) {
            this.captureLatestStats(sceneNotesOnly.length, sceneNotesOnly.length, 0);
            return null;
        }

        const scenesPerDay = completedThisYear / daysPassedThisYear;
        const processedPaths = new Set<string>();
        const currentStatusCounts = sceneNotesOnly.reduce((acc, scene) => {
            if (!scene.path || processedPaths.has(scene.path)) {
                return acc;
            }
            processedPaths.add(scene.path);

            const normalizedStatus = scene.status?.toString().trim().toLowerCase() || 'Todo';

            if (normalizedStatus === 'complete' || normalizedStatus === 'done') {
                acc['Completed'] = (acc['Completed'] || 0) + 1;
            } else if (scene.due) {
                try {
                    const dueDate = new Date(scene.due + 'T00:00:00');
                    if (!isNaN(dueDate.getTime()) && dueDate.getTime() < todayTime) {
                        acc['Due'] = (acc['Due'] || 0) + 1;
                    } else {
                        acc[normalizedStatus] = (acc[normalizedStatus] || 0) + 1;
                    }
                } catch {
                    acc[normalizedStatus] = (acc[normalizedStatus] || 0) + 1;
                }
            } else {
                acc[normalizedStatus] = (acc[normalizedStatus] || 0) + 1;
            }
            return acc;
        }, {} as Record<string, number>);

        this.plugin.latestStatusCounts = currentStatusCounts;

        const completedCount = currentStatusCounts['Completed'] || 0;
        const totalScenes = Object.values(currentStatusCounts).reduce((sum, count) => sum + count, 0);
        const remainingScenes = totalScenes - completedCount;

        if (remainingScenes <= 0) {
            this.captureLatestStats(totalScenes, 0, scenesPerDay * 7);
            return null;
        }

        const daysNeeded = remainingScenes / scenesPerDay;
        if (!isFinite(daysNeeded) || daysNeeded < 0 || scenesPerDay <= 0) {
            this.captureLatestStats(totalScenes, remainingScenes, scenesPerDay * 7);
            return null;
        }

        const scenesPerWeek = scenesPerDay * 7;
        const estimatedDate = new Date(today);
        estimatedDate.setDate(today.getDate() + Math.ceil(daysNeeded));

        this.captureLatestStats(totalScenes, remainingScenes, scenesPerWeek);

        return {
            date: estimatedDate,
            total: totalScenes,
            remaining: remainingScenes,
            rate: parseFloat(scenesPerWeek.toFixed(1))
        };
    }

    private captureLatestStats(total: number, remaining: number, rate: number): void {
        this.plugin.latestTotalScenes = total;
        this.plugin.latestRemainingScenes = remaining;
        this.plugin.latestScenesPerWeek = rate;
    }
}
