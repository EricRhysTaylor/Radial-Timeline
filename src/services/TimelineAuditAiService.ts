/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 *
 * Timeline Audit AI Service
 */

import type RadialTimelinePlugin from '../main';
import { runAuditPipeline } from '../timelineAudit/AuditPipeline';
import type { TimelineAuditCallbacks, TimelineAuditPipelineConfig, TimelineAuditResult } from '../timelineAudit/types';

export const TIMELINE_AUDIT_AI_STATE_EVENT = 'timeline-audit-ai-state';

export type TimelineAuditAiJobStatus = 'not_started' | 'running' | 'completed' | 'failed';

export interface TimelineAuditAiJobState {
    status: TimelineAuditAiJobStatus;
    scopeKey: string | null;
    startedAt: number | null;
    completedAt: number | null;
    progressCurrent: number;
    progressTotal: number;
    currentSceneName: string | null;
    message: string;
    error: string | null;
    result: TimelineAuditResult | null;
}

export type TimelineAuditAiRunner = (
    plugin: RadialTimelinePlugin,
    config: TimelineAuditPipelineConfig,
    callbacks?: TimelineAuditCallbacks
) => Promise<TimelineAuditResult>;

export function createTimelineAuditAiJobState(
    overrides: Partial<TimelineAuditAiJobState> = {}
): TimelineAuditAiJobState {
    return {
        status: 'not_started',
        scopeKey: null,
        startedAt: null,
        completedAt: null,
        progressCurrent: 0,
        progressTotal: 0,
        currentSceneName: null,
        message: '',
        error: null,
        result: null,
        ...overrides
    };
}

export function buildTimelineAuditAiScopeKey(
    plugin: Pick<RadialTimelinePlugin, 'settings' | 'getActiveBook'>,
    runContinuityPass: boolean
): string {
    const book = plugin.getActiveBook();
    const scope = book?.sourceFolder?.trim() || plugin.settings.sourcePath || '';
    const bookId = plugin.settings.activeBookId || '';
    return JSON.stringify({ bookId, scope, runContinuityPass });
}

export function resolveTimelineAuditDisplayResult(
    baseResult: TimelineAuditResult | null,
    aiState: TimelineAuditAiJobState,
    scopeKey: string
): TimelineAuditResult | null {
    if (
        aiState.status === 'completed'
        && aiState.scopeKey === scopeKey
        && aiState.result
    ) {
        return aiState.result;
    }

    return baseResult;
}

export class TimelineAuditAiService {
    private state = createTimelineAuditAiJobState();
    private abortController: AbortController | null = null;

    constructor(
        private readonly plugin: RadialTimelinePlugin,
        private readonly runner: TimelineAuditAiRunner = runAuditPipeline
    ) {}

    getState(scopeKey: string): TimelineAuditAiJobState {
        if (this.state.scopeKey !== scopeKey) {
            return createTimelineAuditAiJobState();
        }
        return { ...this.state };
    }

    invalidate(scopeKey: string): void {
        if (this.state.scopeKey !== scopeKey || this.state.status === 'running') {
            return;
        }

        this.state = createTimelineAuditAiJobState();
        this.emit();
    }

    async start(
        scopeKey: string,
        config: Pick<TimelineAuditPipelineConfig, 'runContinuityPass' | 'chronologyWindow' | 'bodyExcerptChars'>
    ): Promise<void> {
        if (this.state.scopeKey === scopeKey && this.state.status === 'running') {
            return;
        }

        this.abortController = new AbortController();
        const startedAt = Date.now();
        this.state = createTimelineAuditAiJobState({
            status: 'running',
            scopeKey,
            startedAt,
            message: 'Preparing AI audit…'
        });
        this.emit();

        try {
            const result = await this.runner(this.plugin, {
                runDeterministicPass: true,
                runContinuityPass: config.runContinuityPass,
                runAiInference: true,
                chronologyWindow: config.chronologyWindow,
                bodyExcerptChars: config.bodyExcerptChars
            }, {
                abortSignal: this.abortController.signal,
                onStageChange: (stage) => {
                    if (stage === 'deterministic') {
                        this.state = { ...this.state, message: 'Refreshing audit context…' };
                    } else if (stage === 'continuity') {
                        this.state = { ...this.state, message: 'Refreshing continuity context…' };
                    } else if (stage === 'ai') {
                        this.state = { ...this.state, message: 'Running AI audit…' };
                    } else if (stage === 'complete') {
                        this.state = { ...this.state, message: 'AI audit complete' };
                    }
                    this.emit();
                },
                onAiProgress: (current, total, sceneName) => {
                    this.state = {
                        ...this.state,
                        message: 'Running AI audit…',
                        progressCurrent: current,
                        progressTotal: total,
                        currentSceneName: sceneName
                    };
                    this.emit();
                }
            });

            if (this.abortController.signal.aborted) {
                return;
            }

            this.state = createTimelineAuditAiJobState({
                status: 'completed',
                scopeKey,
                startedAt,
                completedAt: Date.now(),
                progressCurrent: this.state.progressCurrent,
                progressTotal: this.state.progressTotal,
                currentSceneName: this.state.currentSceneName,
                message: 'AI audit complete',
                result
            });
            this.emit();
        } catch (error) {
            if (this.abortController.signal.aborted) {
                return;
            }

            this.state = createTimelineAuditAiJobState({
                status: 'failed',
                scopeKey,
                startedAt,
                completedAt: Date.now(),
                message: 'AI audit failed',
                error: error instanceof Error ? error.message : String(error)
            });
            this.emit();
        } finally {
            this.abortController = null;
        }
    }

    private emit(): void {
        this.plugin.dispatch(TIMELINE_AUDIT_AI_STATE_EVENT, { ...this.state });
    }
}
