import { beforeEach, describe, expect, it, vi } from 'vitest';

const { buildInquiryEstimateTrace, estimateExecutionPassCountFromPrompt, buildPreparedEstimateArtifacts } = vi.hoisted(() => ({
    buildInquiryEstimateTrace: vi.fn(),
    estimateExecutionPassCountFromPrompt: vi.fn(),
    buildPreparedEstimateArtifacts: vi.fn()
}));
const { prepareRunEstimate } = vi.hoisted(() => ({
    prepareRunEstimate: vi.fn()
}));
const { getCredential } = vi.hoisted(() => ({
    getCredential: vi.fn()
}));
const { countAnthropicTokens } = vi.hoisted(() => ({
    countAnthropicTokens: vi.fn()
}));

vi.mock('../../inquiry/services/inquiryEstimateTrace', () => ({
    buildInquiryEstimateTrace
}));

vi.mock('../../inquiry/runner/InquiryRunnerService', () => ({
    InquiryRunnerService: class {
        estimateExecutionPassCountFromPrompt = estimateExecutionPassCountFromPrompt;
        buildPreparedEstimateArtifacts = buildPreparedEstimateArtifacts;
    }
}));

vi.mock('../runtime/aiClient', () => ({
    getAIClient: vi.fn(() => ({
        prepareRunEstimate
    }))
}));

vi.mock('../credentials/credentials', () => ({
    getCredential
}));

vi.mock('../../api/anthropicApi', () => ({
    countAnthropicTokens
}));

import {
    buildCanonicalExecutionEstimate,
    buildCanonicalGossamerExecutionEstimate,
    buildCanonicalInquiryComponentBreakdown
} from './estimateTokensFromVault';

describe('buildCanonicalExecutionEstimate', () => {
    beforeEach(() => {
        buildInquiryEstimateTrace.mockReset();
        estimateExecutionPassCountFromPrompt.mockReset();
        buildPreparedEstimateArtifacts.mockReset();
        prepareRunEstimate.mockReset();
        getCredential.mockReset();
        countAnthropicTokens.mockReset();
    });

    it('uses provider-counted Anthropic tokens from the canonical trace', async () => {
        buildInquiryEstimateTrace.mockResolvedValue({
            systemPrompt: 'system',
            userPrompt: 'user prompt',
            evidenceText: 'evidence',
            tokenEstimate: {
                inputTokens: 54321,
                outputTokens: 2048,
                totalTokens: 56369,
                inputChars: 0,
                estimationMethod: 'anthropic_count',
                uncertaintyTokens: 512,
                effectiveInputCeiling: 90000,
                expectedPassCount: 1
            },
            outputTokenCap: 4096,
            response: null,
            sanitizationNotes: [],
            notes: []
        });
        estimateExecutionPassCountFromPrompt.mockReturnValue(3);

        const result = await buildCanonicalExecutionEstimate({
            plugin: {} as never,
            provider: 'anthropic',
            modelId: 'claude-sonnet-4-6',
            questionText: 'Analyze this manuscript.',
            scope: 'book',
            scopeLabel: 'Book 1',
            manifestEntries: [],
            vault: {} as never,
            metadataCache: {} as never
        });

        expect(result).toEqual({
            estimatedTokens: 54321,
            method: 'anthropic_count',
            promptEnvelopeCharsAdded: 'system'.length + 'user prompt'.length,
            expectedPassCount: 3,
            maxOutputTokens: 4096
        });
    });

    it('keeps non-Anthropic traces on the existing heuristic method', async () => {
        buildInquiryEstimateTrace.mockResolvedValue({
            systemPrompt: 'system',
            userPrompt: 'user prompt',
            evidenceText: 'evidence',
            tokenEstimate: {
                inputTokens: 12000,
                outputTokens: 1024,
                totalTokens: 13024,
                inputChars: 0,
                estimationMethod: 'heuristic_chars',
                uncertaintyTokens: 3000,
                effectiveInputCeiling: 90000,
                expectedPassCount: 2
            },
            outputTokenCap: 2048,
            response: null,
            sanitizationNotes: [],
            notes: []
        });
        estimateExecutionPassCountFromPrompt.mockReturnValue(undefined);

        const result = await buildCanonicalExecutionEstimate({
            plugin: {} as never,
            provider: 'openai',
            modelId: 'gpt-5.4-mini',
            questionText: 'Analyze this manuscript.',
            scope: 'book',
            scopeLabel: 'Book 1',
            manifestEntries: [],
            vault: {} as never,
            metadataCache: {} as never
        });

        expect(result?.method).toBe('heuristic_chars');
        expect(result?.expectedPassCount).toBe(2);
    });
});

describe('buildCanonicalInquiryComponentBreakdown', () => {
    beforeEach(() => {
        buildPreparedEstimateArtifacts.mockReset();
        getCredential.mockReset();
        countAnthropicTokens.mockReset();
    });

    it('derives additive Anthropic component deltas from the prepared request', async () => {
        getCredential.mockResolvedValue('anth-key');
        buildPreparedEstimateArtifacts.mockResolvedValue({
            preparedEstimate: {
                systemPrompt: 'System Role Template:\nROLE',
                userPrompt: [
                    'Project Context:\n(none)\n\n',
                    'Feature Mode Instructions:\nFEATURE\n\n',
                    'User Input:\nINPUT\n\n',
                    'Output Schema / Formatting Rules:\nRULES\n\n<<<CACHE_BREAK>>>\n\n',
                    'User Question (highest priority):\nQUESTION'
                ].join(''),
                citationsEnabled: true
            },
            evidenceDocuments: [
                { title: 'Book outline', content: 'OUTLINE', evidenceClass: 'outline' },
                { title: 'Scene 1', content: 'SCENE', evidenceClass: 'scene' },
                { title: 'Reference 1', content: 'REFERENCE', evidenceClass: 'character' }
            ]
        });
        countAnthropicTokens.mockImplementation(async (_apiKey, _modelId, systemPrompt, userPrompt, _citationsEnabled, evidenceDocuments) => {
            const docTitles = (evidenceDocuments ?? []).map(doc => doc.title).join('|');
            if (!systemPrompt && userPrompt === '' && docTitles === 'Book outline') {
                return { provider: 'anthropic', modelId: 'claude-sonnet-4-6', inputTokens: 10, source: 'provider_count' };
            }
            if (!systemPrompt && userPrompt === '' && docTitles === 'Book outline|Scene 1') {
                return { provider: 'anthropic', modelId: 'claude-sonnet-4-6', inputTokens: 35, source: 'provider_count' };
            }
            if (!systemPrompt && userPrompt === '' && docTitles === 'Book outline|Scene 1|Reference 1') {
                return { provider: 'anthropic', modelId: 'claude-sonnet-4-6', inputTokens: 47, source: 'provider_count' };
            }
            if (!systemPrompt && userPrompt.includes('Project Context:') && !userPrompt.includes('Feature Mode Instructions:')) {
                return { provider: 'anthropic', modelId: 'claude-sonnet-4-6', inputTokens: 52, source: 'provider_count' };
            }
            if (!systemPrompt && userPrompt.includes('Feature Mode Instructions:') && !userPrompt.includes('User Input:')) {
                return { provider: 'anthropic', modelId: 'claude-sonnet-4-6', inputTokens: 66, source: 'provider_count' };
            }
            if (!systemPrompt && userPrompt.includes('User Input:') && !userPrompt.includes('Output Schema / Formatting Rules:')) {
                return { provider: 'anthropic', modelId: 'claude-sonnet-4-6', inputTokens: 81, source: 'provider_count' };
            }
            if (!systemPrompt && userPrompt.includes('Output Schema / Formatting Rules:') && !userPrompt.includes('User Question (highest priority):')) {
                return { provider: 'anthropic', modelId: 'claude-sonnet-4-6', inputTokens: 96, source: 'provider_count' };
            }
            if (!systemPrompt && userPrompt.includes('User Question (highest priority):')) {
                return { provider: 'anthropic', modelId: 'claude-sonnet-4-6', inputTokens: 108, source: 'provider_count' };
            }
            if (systemPrompt === 'System Role Template:\nROLE') {
                return { provider: 'anthropic', modelId: 'claude-sonnet-4-6', inputTokens: 121, source: 'provider_count' };
            }
            throw new Error(`Unexpected count request: system=${String(systemPrompt)} user=${userPrompt.slice(0, 40)} docs=${docTitles}`);
        });

        const result = await buildCanonicalInquiryComponentBreakdown({
            plugin: {} as never,
            provider: 'anthropic',
            modelId: 'claude-sonnet-4-6',
            questionText: 'Why does the plateau happen?',
            scope: 'book',
            scopeLabel: 'Book 1',
            manifestEntries: [],
            vault: {} as never,
            metadataCache: {} as never
        });

        expect(result).toEqual({
            provider: 'anthropic',
            totalTokens: 121,
            sceneDocumentTokens: 25,
            outlineDocumentTokens: 10,
            referenceDocumentTokens: 12,
            systemPromptTokens: 13,
            promptSections: [
                { key: 'projectContext', label: 'Project context section', tokens: 5 },
                { key: 'featureInstructions', label: 'Feature instructions', tokens: 14 },
                { key: 'userInput', label: 'User input', tokens: 15 },
                { key: 'outputRules', label: 'Output rules + JSON schema', tokens: 15 },
                { key: 'userQuestion', label: 'User question', tokens: 12 }
            ]
        });
    });
});

describe('buildCanonicalGossamerExecutionEstimate', () => {
    beforeEach(() => {
        prepareRunEstimate.mockReset();
    });

    it('uses the canonical prepared estimate when available', async () => {
        prepareRunEstimate.mockResolvedValue({
            ok: true,
            estimate: {
                tokenEstimateInput: 27500,
                tokenEstimateMethod: 'anthropic_count',
                systemPrompt: 'system',
                userPrompt: 'user prompt'
            }
        });

        const result = await buildCanonicalGossamerExecutionEstimate({
            plugin: {} as never,
            provider: 'anthropic',
            modelId: 'claude-sonnet-4-6',
            promptText: 'Analyze beat momentum.'
        });

        expect(result).toEqual({
            estimatedTokens: 27500,
            method: 'anthropic_count',
            promptEnvelopeCharsAdded: 'system'.length + 'user prompt'.length
        });
    });

    it('throws when the canonical prepared estimate cannot be built', async () => {
        prepareRunEstimate.mockResolvedValue({
            ok: false,
            result: {
                error: 'preview unavailable',
                reason: 'preview unavailable'
            }
        });

        await expect(buildCanonicalGossamerExecutionEstimate({
            plugin: {} as never,
            provider: 'anthropic',
            modelId: 'claude-sonnet-4-6',
            promptText: 'Analyze beat momentum.'
        })).rejects.toThrow('preview unavailable');
    });
});
