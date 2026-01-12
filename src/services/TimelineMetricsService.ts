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
    /** Number of incomplete scenes in stages lower than the active stage */
    stragglerCount?: number;
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

        // Count recent completions per stage within the rolling window to detect active working stage
        const recentCompletionsByStage: Record<string, number> = {};
        for (const stage of STAGE_ORDER) {
            recentCompletionsByStage[stage] = 0;
        }
        
        sceneNotesOnly.forEach(scene => {
            if (!isCompleted(scene.status)) return;
            const dueStr = scene.due;
            if (!dueStr) return;
            try {
                const dueDate = new Date(dueStr + 'T00:00:00');
                dueDate.setHours(0, 0, 0, 0);
                const dueTime = dueDate.getTime();
                if (isNaN(dueTime)) return;
                if (dueTime >= windowStartTime && dueTime <= todayTime) {
                    const stage = normalizeStage(scene['Publish Stage']);
                    recentCompletionsByStage[stage]++;
                }
            } catch {
                // ignore parse errors
            }
        });

        // Determine active stage: prefer stage with most recent completions,
        // fall back to highest stage with incomplete work
        let activeStage: (typeof STAGE_ORDER)[number] = 'Zero';
        let maxRecentCompletions = 0;
        
        // Check stages from highest to lowest for recent activity
        for (const stage of [...STAGE_ORDER].reverse()) {
            if (recentCompletionsByStage[stage] > maxRecentCompletions) {
                maxRecentCompletions = recentCompletionsByStage[stage];
                activeStage = stage;
            }
        }
        
        // If no recent completions, fall back to highest stage with incomplete work
        if (maxRecentCompletions === 0) {
            const stageWithIncomplete = [...STAGE_ORDER].reverse().find(stage =>
                sceneNotesOnly.some(scene => normalizeStage(scene['Publish Stage']) === stage && !isCompleted(scene.status))
            );
            const stageWithAnyScenes = [...STAGE_ORDER].reverse().find(stage =>
                sceneNotesOnly.some(scene => normalizeStage(scene['Publish Stage']) === stage)
            );
            activeStage = stageWithIncomplete ?? stageWithAnyScenes ?? 'Zero';
        }
        
        const activeStageIndex = STAGE_ORDER.indexOf(activeStage);
        
        // Count scenes at active stage (for display purposes)
        const stageScenes = sceneNotesOnly.filter(scene => normalizeStage(scene['Publish Stage']) === activeStage);
        if (stageScenes.length === 0 && maxRecentCompletions === 0) return null;

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

        // Count scenes at active stage AND all lower stages (stragglers)
        // This gives us the total work remaining for this revision round
        const scenesAtActiveAndLower = sceneNotesOnly.filter(scene => {
            const sceneStageIndex = STAGE_ORDER.indexOf(normalizeStage(scene['Publish Stage']));
            return sceneStageIndex <= activeStageIndex;
        });

        const processedPaths = new Set<string>();
        let completedAtActiveAndLower = 0;
        let incompleteAtActiveStage = 0;
        let stragglerCount = 0; // incomplete scenes in stages LOWER than active
        
        const currentStatusCounts: Record<string, number> = {};
        
        scenesAtActiveAndLower.forEach(scene => {
            if (!scene.path || processedPaths.has(scene.path)) return;
            processedPaths.add(scene.path);
            
            const sceneStage = normalizeStage(scene['Publish Stage']);
            const sceneStageIndex = STAGE_ORDER.indexOf(sceneStage);
            const normalizedStatus = scene.status?.toString().trim().toLowerCase() || 'todo';
            const isSceneComplete = normalizedStatus === 'complete' || normalizedStatus === 'done' || normalizedStatus === 'completed';
            
            if (isSceneComplete) {
                completedAtActiveAndLower++;
                currentStatusCounts['Completed'] = (currentStatusCounts['Completed'] || 0) + 1;
            } else if (scene.due) {
                try {
                    const dueDate = new Date(scene.due + 'T00:00:00');
                    if (!isNaN(dueDate.getTime()) && dueDate.getTime() < todayTime) {
                        currentStatusCounts['Due'] = (currentStatusCounts['Due'] || 0) + 1;
                    } else {
                        currentStatusCounts[normalizedStatus] = (currentStatusCounts[normalizedStatus] || 0) + 1;
                    }
                } catch {
                    currentStatusCounts[normalizedStatus] = (currentStatusCounts[normalizedStatus] || 0) + 1;
                }
                
                // Track stragglers vs active stage incomplete
                if (sceneStageIndex < activeStageIndex) {
                    stragglerCount++;
                } else {
                    incompleteAtActiveStage++;
                }
            } else {
                currentStatusCounts[normalizedStatus] = (currentStatusCounts[normalizedStatus] || 0) + 1;
                
                // Track stragglers vs active stage incomplete
                if (sceneStageIndex < activeStageIndex) {
                    stragglerCount++;
                } else {
                    incompleteAtActiveStage++;
                }
            }
        });

        this.plugin.latestStatusCounts = currentStatusCounts;

        const totalScenesDeduped = processedPaths.size;
        const totalForEstimate = Math.max(totalScenesDeduped, Math.floor(highestPrefixNumber));
        // Remaining = all incomplete scenes at active stage + all incomplete at lower stages (stragglers)
        const remainingScenes = Math.max(0, totalForEstimate - completedAtActiveAndLower);

        if (remainingScenes <= 0) {
            this.captureLatestStats(totalForEstimate, 0, 0);
            return null;
        }

        // Count completions across ALL stages within the rolling window (not just active stage)
        // This way, completing scenes in any stage contributes to the pace calculation
        const completedPathsWindow = new Set<string>();
        let completedWindow = 0;
        let lastProgressDate: Date | null = null;

        sceneNotesOnly.forEach(scene => {
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

        const hasEnoughSamples = completedWindow >= 2; // require at least 2 completions for a confident pace
        const rawScenesPerDay = completedWindow > 0 ? (completedWindow / windowDays) : 0;
        const scenesPerDay = rawScenesPerDay; // still use raw pace for geometry placement
        const scenesPerWeek = scenesPerDay * 7;
        const daysNeeded = scenesPerDay > 0 ? remainingScenes / scenesPerDay : Number.POSITIVE_INFINITY;
        const estimatedDate = Number.isFinite(daysNeeded) && daysNeeded >= 0
            ? new Date(today.getTime() + Math.ceil(daysNeeded) * 24 * 60 * 60 * 1000)
            : null;

        const staleness = this.classifyStaleness(lastProgressDate, today);
        const labelText = (staleness === 'stalled' || !estimatedDate || !hasEnoughSamples) ? '?' : undefined;

        const result: CompletionEstimate = {
            date: estimatedDate,
            total: totalForEstimate,
            remaining: remainingScenes,
            rate: parseFloat(scenesPerWeek.toFixed(1)),
            stage: activeStage,
            staleness,
            lastProgressDate,
            windowDays,
            labelText,
            isFrozen: false,
            stragglerCount: stragglerCount > 0 ? stragglerCount : undefined
        };

        // Freeze to last fresh estimate if we have no valid rate/date but we had one before
        if (!estimatedDate || scenesPerDay <= 0 || !Number.isFinite(daysNeeded)) {
            const frozen = this.freezeToLastEstimate(activeStage, lastProgressDate, windowDays, stragglerCount);
            this.captureLatestStats(totalForEstimate, remainingScenes, scenesPerWeek);
            return frozen;
        }

        // Store as last fresh estimate for morale-friendly freezing
        this.lastFreshEstimate = { ...result, isFrozen: false, labelText: undefined };
        this.captureLatestStats(totalForEstimate, remainingScenes, scenesPerWeek);
        return result;
    }

    private captureLatestStats(total: number, remaining: number, rate: number): void {
        this.plugin.latestTotalScenes = total;
        this.plugin.latestRemainingScenes = remaining;
        this.plugin.latestScenesPerWeek = rate;
    }

    private freezeToLastEstimate(stage: string, lastProgressDate: Date | null, windowDays: number, stragglerCount?: number): CompletionEstimate | null {
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
            isFrozen: true,
            stragglerCount: stragglerCount && stragglerCount > 0 ? stragglerCount : undefined
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
