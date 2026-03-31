import { describe, expect, it, vi } from 'vitest';
import type RadialTimelinePlugin from '../main';
import {
    TimelineAuditAiService,
    buildTimelineAuditAiScopeKey,
    createTimelineAuditAiJobState,
    resolveTimelineAuditDisplayResult,
    TIMELINE_AUDIT_AI_STATE_EVENT,
    type TimelineAuditAiJobState
} from './TimelineAuditAiService';
import type { TimelineAuditResult } from '../timelineAudit/types';

function makePlugin() {
    const dispatched: TimelineAuditAiJobState[] = [];
    const plugin = {
        settings: {
            activeBookId: 'book-1',
            sourcePath: 'Books/Novel'
        },
        getActiveBook: () => ({ sourceFolder: 'Books/Novel' }),
        dispatch: (type: string, detail: TimelineAuditAiJobState) => {
            if (type === TIMELINE_AUDIT_AI_STATE_EVENT) {
                dispatched.push(detail);
            }
        }
    } as unknown as RadialTimelinePlugin;

    return { plugin, dispatched };
}

function makeResult(label: string): TimelineAuditResult {
    return {
        findings: [],
        stats: {
            totalScenes: 1,
            aligned: label === 'base' ? 1 : 0,
            warnings: 0,
            contradictions: label === 'ai' ? 1 : 0,
            missingWhen: 0
        },
        appliedSuggestionCount: 0,
        unresolvedCount: 0
    };
}

describe('TimelineAuditAiService', () => {
    it('starts explicitly, updates running state immediately, and preserves completed state by scope', async () => {
        const { plugin, dispatched } = makePlugin();
        const result = makeResult('ai');
        const runner = vi.fn(async (_plugin, _config, callbacks) => {
            callbacks?.onStageChange?.('ai');
            callbacks?.onAiProgress?.(2, 5, 'Scene Two');
            return result;
        });

        const service = new TimelineAuditAiService(plugin, runner);
        const scopeKey = buildTimelineAuditAiScopeKey(plugin, true);
        const promise = service.start(scopeKey, {
            runContinuityPass: true,
            chronologyWindow: 2,
            bodyExcerptChars: 2600
        });

        expect(service.getState(scopeKey).status).toBe('running');
        await promise;

        const state = service.getState(scopeKey);
        expect(state.status).toBe('completed');
        expect(state.progressCurrent).toBe(2);
        expect(state.progressTotal).toBe(5);
        expect(state.currentSceneName).toBe('Scene Two');
        expect(state.result).toBe(result);
        expect(dispatched.some((entry) => entry.status === 'running')).toBe(true);
        expect(dispatched.some((entry) => entry.status === 'completed')).toBe(true);
    });

    it('resolves displayed results only when the completed AI state matches the current scope', () => {
        const { plugin } = makePlugin();
        const scopeKey = buildTimelineAuditAiScopeKey(plugin, true);
        const otherScopeKey = buildTimelineAuditAiScopeKey(plugin, false);
        const base = makeResult('base');
        const ai = makeResult('ai');

        expect(resolveTimelineAuditDisplayResult(
            base,
            createTimelineAuditAiJobState({
                status: 'completed',
                scopeKey,
                result: ai
            }),
            scopeKey
        )).toBe(ai);

        expect(resolveTimelineAuditDisplayResult(
            base,
            createTimelineAuditAiJobState({
                status: 'completed',
                scopeKey,
                result: ai
            }),
            otherScopeKey
        )).toBe(base);
    });

    it('invalidates completed AI state when requested for the current scope', async () => {
        const { plugin } = makePlugin();
        const service = new TimelineAuditAiService(plugin, async () => makeResult('ai'));
        const scopeKey = buildTimelineAuditAiScopeKey(plugin, true);

        await service.start(scopeKey, {
            runContinuityPass: true,
            chronologyWindow: 2,
            bodyExcerptChars: 2600
        });
        expect(service.getState(scopeKey).status).toBe('completed');

        service.invalidate(scopeKey);
        expect(service.getState(scopeKey).status).toBe('not_started');
    });
});
