import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIRunResult } from '../../ai/types';

vi.mock('../../ai/runtime/aiClient', () => ({
    getAIClient: vi.fn(() => ({}))
}));

import { getAIClient } from '../../ai/runtime/aiClient';
import { InquiryRunnerService } from './InquiryRunnerService';

const TEST_AI = {
    provider: 'openai',
    modelId: 'gpt-5.2-chat-latest',
    modelLabel: 'GPT-5.2'
} as const;

function createService() {
    return new InquiryRunnerService(
        { settings: {} } as never,
        {} as never,
        {} as never
    ) as unknown as Record<string, unknown>;
}

function buildPrecheck(overrides?: Partial<{
    onePassFit: 'fits' | 'overflows' | 'unknown';
    inputTokens: number;
    safeInputTokens: number;
}>): Record<string, unknown> {
    const onePassFit = overrides?.onePassFit ?? 'overflows';
    const inputTokens = overrides?.inputTokens ?? 220000;
    const safeInputTokens = overrides?.safeInputTokens ?? 140000;
    return {
        ok: true,
        inputTokens,
        safeInputTokens,
        onePassFit,
        exceedsSafeBudget: onePassFit === 'overflows',
        estimationMethod: 'heuristic_chars',
        uncertaintyTokens: 0,
        preparedEstimate: null
    };
}

function buildChunkedSuccessRun(): AIRunResult {
    return {
        content: '{"ok":true}',
        responseData: {},
        provider: 'openai',
        modelRequested: TEST_AI.modelId,
        modelResolved: TEST_AI.modelId,
        aiStatus: 'success',
        warnings: [],
        reason: 'chunked success',
        advancedContext: {
            roleTemplateName: 'Default Role Template',
            provider: 'openai',
            modelAlias: 'gpt-5.2',
            modelLabel: TEST_AI.modelLabel,
            modelSelectionReason: 'test',
            availabilityStatus: 'unknown',
            maxInputTokens: 200000,
            maxOutputTokens: 12000,
            analysisPackaging: 'automatic',
            executionPassCount: 3,
            featureModeInstructions: '',
            finalPrompt: ''
        }
    };
}

function buildRunResult(overrides?: Partial<AIRunResult>): AIRunResult {
    return {
        content: '{"ok":true}',
        responseData: {},
        provider: 'openai',
        modelRequested: TEST_AI.modelId,
        modelResolved: TEST_AI.modelId,
        aiStatus: 'success',
        warnings: [],
        reason: 'test run',
        ...overrides
    };
}

function setGlobalFlag(key: string, value: unknown) {
    Object.defineProperty(globalThis, key, {
        configurable: true,
        value
    });
}

describe('InquiryRunnerService packaging policy', () => {
    beforeEach(() => {
        vi.mocked(getAIClient).mockReturnValue({} as never);
    });

    it('automatic overflow + chunk failure returns packaging_failed', async () => {
        const service = createService();
        const getAnalysisPackaging = vi.fn().mockReturnValue('automatic');
        const getPackagingPrecheck = vi.fn().mockResolvedValue(buildPrecheck({ onePassFit: 'overflows' }));
        const runChunkedInquiry = vi.fn().mockResolvedValue({
            ok: false,
            failureStage: 'chunk_execution',
            failureReason: 'chunk failed',
            tokenUsageKnown: false
        });
        const runInquiryRequest = vi.fn();
        Object.assign(service, {
            getAnalysisPackaging,
            getPackagingPrecheck,
            runChunkedInquiry,
            runInquiryRequest
        });

        const result = await (service.callProvider as (...args: unknown[]) => Promise<Record<string, unknown>>) (
            'system',
            'user',
            TEST_AI,
            { type: 'object' },
            0.2,
            4000,
            'question'
        );

        expect(result.aiStatus).toBe('rejected');
        expect(result.aiReason).toBe('packaging_failed');
        expect(result.analysisPackaging).toBe('automatic');
        expect(result.executionState).toBe('packaging_failed');
        expect(result.executionPath).toBe('multi_pass');
        expect(result.failureStage).toBe('chunk_execution');
        expect(result.tokenUsageKnown).toBe(false);
        expect(runChunkedInquiry).toHaveBeenCalledTimes(1);
        expect(runChunkedInquiry).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                packagingPrecheck: expect.objectContaining({
                    inputTokens: 220000,
                    safeInputTokens: 140000,
                    onePassFit: 'overflows'
                })
            })
        );
        expect(runInquiryRequest).not.toHaveBeenCalled();
    });

    it('segmented overflow + chunk failure returns packaging_failed', async () => {
        const service = createService();
        const getAnalysisPackaging = vi.fn().mockReturnValue('segmented');
        const getPackagingPrecheck = vi.fn().mockResolvedValue(buildPrecheck({ onePassFit: 'overflows' }));
        const runChunkedInquiry = vi.fn().mockResolvedValue({
            ok: false,
            failureStage: 'chunk_execution',
            failureReason: 'chunk failed',
            tokenUsageKnown: false
        });
        const runInquiryRequest = vi.fn();
        Object.assign(service, {
            getAnalysisPackaging,
            getPackagingPrecheck,
            runChunkedInquiry,
            runInquiryRequest
        });

        const result = await (service.callProvider as (...args: unknown[]) => Promise<Record<string, unknown>>) (
            'system',
            'user',
            TEST_AI,
            { type: 'object' },
            0.2,
            4000,
            'question'
        );

        expect(result.aiStatus).toBe('rejected');
        expect(result.aiReason).toBe('packaging_failed');
        expect(result.analysisPackaging).toBe('segmented');
        expect(result.executionState).toBe('packaging_failed');
        expect(result.executionPath).toBe('multi_pass');
        expect(result.failureStage).toBe('chunk_execution');
        expect(result.tokenUsageKnown).toBe(false);
        expect(runChunkedInquiry).toHaveBeenCalledTimes(1);
        expect(runInquiryRequest).not.toHaveBeenCalled();
    });

    it('segmented never enters one-pass send path', async () => {
        const service = createService();
        const getAnalysisPackaging = vi.fn().mockReturnValue('segmented');
        const getPackagingPrecheck = vi.fn().mockResolvedValue(buildPrecheck({ onePassFit: 'fits' }));
        const runChunkedInquiry = vi.fn().mockResolvedValue({
            ok: true,
            run: buildChunkedSuccessRun(),
            tokenUsageKnown: false
        });
        const runInquiryRequest = vi.fn();
        Object.assign(service, {
            getAnalysisPackaging,
            getPackagingPrecheck,
            runChunkedInquiry,
            runInquiryRequest
        });

        const result = await (service.callProvider as (...args: unknown[]) => Promise<Record<string, unknown>>) (
            'system',
            'user',
            TEST_AI,
            { type: 'object' },
            0.2,
            4000,
            'question'
        );

        expect(result.success).toBe(true);
        expect(result.executionState).toBe('dispatched_to_provider');
        expect(result.executionPath).toBe('multi_pass');
        expect(result.failureStage).toBeUndefined();
        expect(result.tokenUsageKnown).toBe(false);
        expect(runChunkedInquiry).toHaveBeenCalledTimes(1);
        expect(runInquiryRequest).not.toHaveBeenCalled();
    });

    it('singlePassOnly overflow still blocks before send', async () => {
        const service = createService();
        const getAnalysisPackaging = vi.fn().mockReturnValue('singlePassOnly');
        const getPackagingPrecheck = vi.fn().mockResolvedValue(buildPrecheck({ onePassFit: 'overflows' }));
        const runChunkedInquiry = vi.fn();
        const runInquiryRequest = vi.fn();
        Object.assign(service, {
            getAnalysisPackaging,
            getPackagingPrecheck,
            runChunkedInquiry,
            runInquiryRequest
        });

        const result = await (service.callProvider as (...args: unknown[]) => Promise<Record<string, unknown>>) (
            'system',
            'user',
            TEST_AI,
            { type: 'object' },
            0.2,
            4000,
            'question'
        );

        expect(result.aiStatus).toBe('rejected');
        expect(result.aiReason).toBe('truncated');
        expect(result.executionState).toBe('blocked_before_send');
        expect(result.executionPath).toBe('one_pass');
        expect(result.failureStage).toBe('preflight');
        expect(result.tokenUsageKnown).toBe(false);
        expect(runChunkedInquiry).not.toHaveBeenCalled();
        expect(runInquiryRequest).not.toHaveBeenCalled();
    });

    it('returns explicit preflight packaging failure when authoritative precheck is unavailable', async () => {
        const service = createService();
        const getAnalysisPackaging = vi.fn().mockReturnValue('automatic');
        const getPackagingPrecheck = vi.fn().mockResolvedValue({
            ok: false,
            reason: 'prepareRunEstimate unavailable'
        });
        const runChunkedInquiry = vi.fn();
        const runInquiryRequest = vi.fn();
        Object.assign(service, {
            getAnalysisPackaging,
            getPackagingPrecheck,
            runChunkedInquiry,
            runInquiryRequest
        });

        const result = await (service.callProvider as (...args: unknown[]) => Promise<Record<string, unknown>>) (
            'system',
            'user',
            TEST_AI,
            { type: 'object' },
            0.2,
            4000,
            'question'
        );

        expect(result.aiStatus).toBe('rejected');
        expect(result.aiReason).toBe('packaging_failed');
        expect(result.failureStage).toBe('preflight');
        expect(String(result.error)).toContain('packaging/parsing failure');
        expect(runChunkedInquiry).not.toHaveBeenCalled();
        expect(runInquiryRequest).not.toHaveBeenCalled();
    });

    it('records OpenAI transport lane in trace notes for logging', () => {
        const service = createService();
        const trace = { notes: [] as string[] } as Record<string, unknown>;

        (service.applyOpenAiTransportLaneTraceNote as (traceArg: Record<string, unknown>, response: Record<string, unknown>) => void)(
            trace,
            {
                aiProvider: 'openai',
                aiTransportLane: 'responses'
            }
        );

        expect(trace.openAiTransportLane).toBe('responses');
        expect(trace.notes).toContain('OpenAI transport lane: responses.');
    });

    it('recovers invalid chunk JSON and continues multi-pass execution', async () => {
        const service = createService();
        const buildEvidenceChunkPrompts = vi.fn().mockReturnValue({
            prompts: ['chunk-1', 'chunk-2'],
            maxChunkTokens: 12000,
            maxChunkChars: 48000,
            evidenceChars: 96000,
            prefixChars: 2000,
            targetPasses: 2
        });
        const runInquiryRequest = vi.fn()
            .mockResolvedValueOnce(buildRunResult({
                aiStatus: 'rejected',
                aiReason: 'invalid_response',
                content: [
                    '```json',
                    '{',
                    '  "summaryFlow": "Recovered flow summary",',
                    '  "summaryDepth": "Recovered depth summary",',
                    '  "verdict": { "flow": 0.62, "depth": 0.58, "impact": "low", "assessmentConfidence": "low" },',
                    '  "findings": []',
                    '}',
                    '```'
                ].join('\n')
            }))
            .mockResolvedValueOnce(buildRunResult({
                aiStatus: 'success',
                content: JSON.stringify({
                    summaryFlow: 'Chunk 2 flow summary',
                    summaryDepth: 'Chunk 2 depth summary',
                    verdict: { flow: 0.64, depth: 0.57, impact: 'low', assessmentConfidence: 'low' },
                    findings: []
                })
            }))
            .mockResolvedValueOnce(buildRunResult({
                aiStatus: 'success',
                content: JSON.stringify({
                    summaryFlow: 'Synthesis flow summary',
                    summaryDepth: 'Synthesis depth summary',
                    verdict: { flow: 0.66, depth: 0.61, impact: 'low', assessmentConfidence: 'medium' },
                    findings: []
                })
            }));
        Object.assign(service, {
            buildEvidenceChunkPrompts,
            runInquiryRequest
        });

        const result = await (service.runChunkedInquiry as (...args: unknown[]) => Promise<Record<string, unknown>>) (
            {} as never,
            {
                systemPrompt: 'system',
                userPrompt: 'Question\nEvidence:\n## Scene A\nBody',
                ai: TEST_AI,
                jsonSchema: { type: 'object' },
                temperature: 0.2,
                maxTokens: 4000
            }
        );

        expect(result.ok).toBe(true);
        expect(result.run.aiReason).toBe('recovered_invalid_response');
        expect(runInquiryRequest).toHaveBeenCalledTimes(3);
    });

    it('aborts immediately in strict debug mode when chunk 1 requires recovery', async () => {
        const service = createService();
        const buildEvidenceChunkPrompts = vi.fn().mockReturnValue({
            prompts: ['chunk-1', 'chunk-2'],
            maxChunkTokens: 12000,
            maxChunkChars: 48000,
            evidenceChars: 96000,
            prefixChars: 2000,
            targetPasses: 2
        });
        const runInquiryRequest = vi.fn().mockResolvedValueOnce(buildRunResult({
            aiStatus: 'rejected',
            aiReason: 'invalid_response',
            content: [
                '```json',
                '{',
                '  "summaryFlow": "Recovered flow summary",',
                '  "summaryDepth": "Recovered depth summary",',
                '  "verdict": { "flow": 0.62, "depth": 0.58, "impact": "low", "assessmentConfidence": "low" },',
                '  "findings": []',
                '}',
                '```'
            ].join('\n')
        }));
        Object.assign(service, {
            buildEvidenceChunkPrompts,
            runInquiryRequest
        });
        setGlobalFlag('__RT_INQUIRY_STRICT_DEBUG__', true);

        try {
            const result = await (service.runChunkedInquiry as (...args: unknown[]) => Promise<Record<string, unknown>>) (
                {} as never,
                {
                    systemPrompt: 'system',
                    userPrompt: 'Question\nEvidence:\n## Scene A\nBody',
                    ai: TEST_AI,
                    jsonSchema: { type: 'object' },
                    temperature: 0.2,
                    maxTokens: 4000
                }
            );

            expect(result.ok).toBe(false);
            expect(result.failureStage).toBe('chunk_execution');
            expect(String(result.failureReason)).toContain('Strict recovery debug abort');
            expect(runInquiryRequest).toHaveBeenCalledTimes(1);
        } finally {
            delete (globalThis as Record<string, unknown>).__RT_INQUIRY_STRICT_DEBUG__;
        }
    });

    it('aggregates full multi-pass usage across chunks and synthesis', async () => {
        const service = createService();
        const buildEvidenceChunkPrompts = vi.fn().mockReturnValue({
            prompts: ['chunk-1', 'chunk-2'],
            maxChunkTokens: 12000,
            maxChunkChars: 48000,
            evidenceChars: 96000,
            prefixChars: 2000,
            targetPasses: 2
        });
        const runInquiryRequest = vi.fn()
            .mockResolvedValueOnce(buildRunResult({
                responseData: { usage: { input_tokens: 100, output_tokens: 20 } }
            }))
            .mockResolvedValueOnce(buildRunResult({
                responseData: { usage: { input_tokens: 80, output_tokens: 10 } }
            }))
            .mockResolvedValueOnce(buildRunResult({
                responseData: { usage: { input_tokens: 30, output_tokens: 15 } }
            }));
        Object.assign(service, {
            buildEvidenceChunkPrompts,
            runInquiryRequest
        });

        const result = await (service.runChunkedInquiry as (...args: unknown[]) => Promise<Record<string, unknown>>) (
            {} as never,
            {
                systemPrompt: 'system',
                userPrompt: 'Question\nEvidence:\n## Scene A\nBody',
                ai: TEST_AI,
                jsonSchema: { type: 'object' },
                temperature: 0.2,
                maxTokens: 4000
            }
        );

        expect(result.ok).toBe(true);
        expect(result.tokenUsageKnown).toBe(true);
        expect(result.tokenUsageScope).toBe('full');
        expect(result.usage).toEqual({
            inputTokens: 210,
            outputTokens: 45,
            totalTokens: 255
        });
    });

    it('labels multi-pass usage as synthesis-only when chunk usage is unavailable', async () => {
        const service = createService();
        const buildEvidenceChunkPrompts = vi.fn().mockReturnValue({
            prompts: ['chunk-1', 'chunk-2'],
            maxChunkTokens: 12000,
            maxChunkChars: 48000,
            evidenceChars: 96000,
            prefixChars: 2000,
            targetPasses: 2
        });
        const runInquiryRequest = vi.fn()
            .mockResolvedValueOnce(buildRunResult({ responseData: {} }))
            .mockResolvedValueOnce(buildRunResult({ responseData: {} }))
            .mockResolvedValueOnce(buildRunResult({
                responseData: { usage: { input_tokens: 30, output_tokens: 15 } }
            }));
        Object.assign(service, {
            buildEvidenceChunkPrompts,
            runInquiryRequest
        });

        const result = await (service.runChunkedInquiry as (...args: unknown[]) => Promise<Record<string, unknown>>) (
            {} as never,
            {
                systemPrompt: 'system',
                userPrompt: 'Question\nEvidence:\n## Scene A\nBody',
                ai: TEST_AI,
                jsonSchema: { type: 'object' },
                temperature: 0.2,
                maxTokens: 4000
            }
        );

        expect(result.ok).toBe(true);
        expect(result.tokenUsageKnown).toBe(true);
        expect(result.tokenUsageScope).toBe('synthesis_only');
        expect(result.usage).toEqual({
            inputTokens: 30,
            outputTokens: 15,
            totalTokens: undefined
        });
    });

    it('emits exact chunk and synthesis progress for multi-pass execution', async () => {
        const service = createService();
        const buildEvidenceChunkPrompts = vi.fn().mockReturnValue({
            prompts: ['chunk-1', 'chunk-2'],
            maxChunkTokens: 12000,
            maxChunkChars: 48000,
            evidenceChars: 96000,
            prefixChars: 2000,
            targetPasses: 2
        });
        const runInquiryRequest = vi.fn()
            .mockResolvedValueOnce(buildRunResult())
            .mockResolvedValueOnce(buildRunResult())
            .mockResolvedValueOnce(buildRunResult());
        const onProgress = vi.fn();
        Object.assign(service, {
            buildEvidenceChunkPrompts,
            runInquiryRequest
        });

        const result = await (service.runChunkedInquiry as (...args: unknown[]) => Promise<Record<string, unknown>>) (
            {} as never,
            {
                systemPrompt: 'system',
                userPrompt: 'Question\nEvidence:\n## Scene A\nBody',
                ai: TEST_AI,
                jsonSchema: { type: 'object' },
                temperature: 0.2,
                maxTokens: 4000,
                onProgress
            }
        );

        expect(result.ok).toBe(true);
        expect(onProgress).toHaveBeenNthCalledWith(1, {
            phase: 'chunk',
            currentPass: 1,
            totalPasses: 3,
            chunkIndex: 1,
            chunkTotal: 2
        });
        expect(onProgress).toHaveBeenNthCalledWith(2, {
            phase: 'chunk',
            currentPass: 2,
            totalPasses: 3,
            chunkIndex: 2,
            chunkTotal: 2
        });
        expect(onProgress).toHaveBeenNthCalledWith(3, {
            phase: 'synthesis',
            currentPass: 3,
            totalPasses: 3,
            chunkTotal: 2
        });
    });
});
