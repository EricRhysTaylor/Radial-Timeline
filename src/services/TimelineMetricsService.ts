import type RadialTimelinePlugin from '../main';
import type { TimelineItem } from '../types';
import { isBeatNote } from '../utils/sceneHelpers';
import { STAGE_ORDER } from '../utils/constants';
import { parseSceneTitle } from '../utils/text';

export interface CompletionEstimate {
    date: Date | null;
    total: number;
    remaining: number;
    rate: number;
    stage: string;
    staleness: 'fresh' | 'warn' | 'late' | 'stalled';
    lastProgressDate: Date | null;
    windowDays: number;
    labelText?: string;
    isFrozen?: boolean;
}

export class TimelineMetricsService {
    private lastFreshEstimate: CompletionEstimate | null = null;

    constructor(private plugin: RadialTimelinePlugin) {}

    calculateCompletionEstimate(scenes: TimelineItem[]): CompletionEstimate | null {
        const sceneNotesOnly = scenes.filter(scene => !isBeatNote(scene));
        if (sceneNotesOnly.length === 0) return null;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTime = today.getTime();
        const windowDays = this.clampWindowDays(this.plugin.settings.completionEstimateWindowDays ?? 30);
        const windowStartTime = todayTime - windowDays * 24 * 60 * 60 * 1000;

        const normalizeStage = (raw: unknown): (typeof STAGE_ORDER)[number] => {
            const v = (raw ?? 'Zero').toString().trim().toLowerCase();
            const match = STAGE_ORDER.find(stage => stage.toLowerCase() === v);
            return match ?? 'Zero';
        };

        const isCompleted = (status: TimelineItem['status']): boolean => {
            const val = Array.isArray(status) ? status[0] : status;
            const normalized = (val ?? '').toString().trim().toLowerCase();
            return normalized === 'complete' || normalized === 'completed' || normalized === 'done';
        };

        // Determine active publish stage: highest stage that still has incomplete work
        const stageWithIncomplete = [...STAGE_ORDER].reverse().find(stage =>
            sceneNotesOnly.some(scene => normalizeStage(scene['Publish Stage']) === stage && !isCompleted(scene.status))
        );
        const stageWithAnyScenes = [...STAGE_ORDER].reverse().find(stage =>
            sceneNotesOnly.some(scene => normalizeStage(scene['Publish Stage']) === stage)
        );
        const activeStage = stageWithIncomplete ?? stageWithAnyScenes ?? 'Zero';
        const stageScenes = sceneNotesOnly.filter(scene => normalizeStage(scene['Publish Stage']) === activeStage);
        if (stageScenes.length === 0) return null;

        // Compute highest scene number across all scenes (any stage) as a floor for total count
        const seenForMax = new Set<string>();
        let highestPrefixNumber = 0;
        sceneNotesOnly.forEach(scene => {
            if (!scene.path || seenForMax.has(scene.path)) return;
            seenForMax.add(scene.path);
            const { number } = parseSceneTitle(scene.title || '', scene.number);
            if (number) {
                const n = parseFloat(String(number));
                if (!isNaN(n)) {
                    highestPrefixNumber = Math.max(highestPrefixNumber, n);
                }
            }
        });

        const processedPaths = new Set<string>();
        const currentStatusCounts = stageScenes.reduce((acc, scene) => {
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
        const totalScenesDeduped = processedPaths.size;
        const totalForStage = Math.max(totalScenesDeduped, Math.floor(highestPrefixNumber));
        const remainingScenes = Math.max(0, totalForStage - completedCount);

        if (remainingScenes <= 0) {
            this.captureLatestStats(totalForStage, 0, 0);
            return null;
        }

        // Count completions in the active stage within the rolling window
        const completedPathsWindow = new Set<string>();
        let completedWindow = 0;
        let lastProgressDate: Date | null = null;

        stageScenes.forEach(scene => {
            const scenePath = scene.path;
            if (!scenePath) return;
            if (!isCompleted(scene.status)) return;

            const dueStr = scene.due;
            if (!dueStr) return;

            try {
                const dueDate = new Date(dueStr + 'T00:00:00');
                dueDate.setHours(0, 0, 0, 0);
                const dueTime = dueDate.getTime();
                if (isNaN(dueTime)) return;

                if (!lastProgressDate || dueTime > lastProgressDate.getTime()) {
                    lastProgressDate = new Date(dueTime);
                }

                if (dueTime >= windowStartTime && dueTime <= todayTime) {
                    if (!completedPathsWindow.has(scenePath)) {
                        completedPathsWindow.add(scenePath);
                        completedWindow++;
                    }
                }
            } catch {
                // ignore parse errors
            }
        });

        const hasEnoughSamples = completedWindow >= 2; // require at least 2 completions for a meaningful pace
        const scenesPerDay = hasEnoughSamples ? (completedWindow / windowDays) : 0;
        const scenesPerWeek = scenesPerDay * 7;
        const daysNeeded = scenesPerDay > 0 ? remainingScenes / scenesPerDay : Number.POSITIVE_INFINITY;
        const estimatedDate = Number.isFinite(daysNeeded) && daysNeeded >= 0
            ? new Date(today.getTime() + Math.ceil(daysNeeded) * 24 * 60 * 60 * 1000)
            : null;

        const staleness = this.classifyStaleness(lastProgressDate, today);
        const labelText = (staleness === 'stalled' || !estimatedDate || !hasEnoughSamples) ? '?' : undefined;

        const result: CompletionEstimate = {
            date: estimatedDate,
            total: totalForStage,
            remaining: remainingScenes,
            rate: parseFloat(scenesPerWeek.toFixed(1)),
            stage: activeStage,
            staleness,
            lastProgressDate,
            windowDays,
            labelText,
            isFrozen: false
        };

        // Freeze to last fresh estimate if we have no valid rate/date but we had one before
        if (!estimatedDate || scenesPerDay <= 0 || !Number.isFinite(daysNeeded)) {
            const frozen = this.freezeToLastEstimate(activeStage, lastProgressDate, windowDays);
            this.captureLatestStats(totalForStage, remainingScenes, scenesPerWeek);
            return frozen;
        }

        // Store as last fresh estimate for morale-friendly freezing
        this.lastFreshEstimate = { ...result, isFrozen: false, labelText: undefined };
        this.captureLatestStats(totalForStage, remainingScenes, scenesPerWeek);
        return result;
    }

    private captureLatestStats(total: number, remaining: number, rate: number): void {
        this.plugin.latestTotalScenes = total;
        this.plugin.latestRemainingScenes = remaining;
        this.plugin.latestScenesPerWeek = rate;
    }

    private freezeToLastEstimate(stage: string, lastProgressDate: Date | null, windowDays: number): CompletionEstimate | null {
        if (!this.lastFreshEstimate || this.lastFreshEstimate.stage !== stage) {
            return null;
        }
        const staleness = this.classifyStaleness(lastProgressDate, new Date());
        return {
            ...this.lastFreshEstimate,
            staleness,
            lastProgressDate: lastProgressDate ?? this.lastFreshEstimate.lastProgressDate,
            windowDays,
            labelText: '?',
            isFrozen: true
        };
    }

    private classifyStaleness(lastProgressDate: Date | null, today: Date): CompletionEstimate['staleness'] {
        if (!lastProgressDate) return 'stalled';
        const msInDay = 24 * 60 * 60 * 1000;
        const daysSince = Math.floor((today.getTime() - lastProgressDate.getTime()) / msInDay);
        if (daysSince <= 7) return 'fresh';
        if (daysSince <= 10) return 'warn';
        if (daysSince <= 20) return 'late';
        return 'stalled';
    }

    private clampWindowDays(value: number): number {
        if (!Number.isFinite(value)) return 30;
        return Math.min(90, Math.max(14, Math.round(value)));
    }
}
