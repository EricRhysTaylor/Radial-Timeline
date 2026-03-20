import { describe, expect, it } from 'vitest';
import { BUILTIN_MODELS } from '../../ai/registry/builtinModels';
import type { ModelInfo } from '../../ai/types';
import type { ResolvedInquiryEngine } from './inquiryModelResolver';
import { computeInquiryAdvisoryContext } from './inquiryAdvisory';

function getModel(modelId: string) {
    const model = BUILTIN_MODELS.find(entry => entry.id === modelId);
    if (!model) throw new Error(`Missing builtin model: ${modelId}`);
    return model;
}

function buildResolvedEngine(model: ModelInfo, providerLabel?: string): ResolvedInquiryEngine {
    return {
        provider: model.provider,
        modelId: model.id,
        modelAlias: model.alias,
        modelLabel: model.label,
        providerLabel: providerLabel ?? model.provider,
        contextWindow: model.contextWindow,
        maxOutput: model.maxOutput,
        selectionReason: 'test',
        policySource: 'globalPolicy'
    };
}

describe('computeInquiryAdvisoryContext', () => {
    it('prioritizes sources recommendation over single-pass option', () => {
        const currentModel = getModel('gpt-5.1-chat-latest');
        const advisory = computeInquiryAdvisoryContext({
            scope: 'book',
            focusLabel: 'B1',
            resolvedEngine: buildResolvedEngine(currentModel, 'OpenAI'),
            currentModel,
            models: BUILTIN_MODELS,
            analysisPackaging: 'automatic',
            estimatedInputTokens: 300000,
            corpusFingerprint: 'fp-1',
            overrideSummary: { active: false, classCount: 0, itemCount: 0, total: 0 },
        });

        expect(advisory).not.toBeNull();
        expect(advisory?.recommendation.reasonCode).toBe('sources_preferred');
        expect(advisory?.recommendation.provider).toBe('anthropic');
        expect(advisory?.recommendation.options).toHaveLength(1);
        expect(advisory?.recommendation.message).toBe('Citation-backed alternative:');
    });

    it('returns null when the current engine already has sources and fits in one pass', () => {
        const currentModel = getModel('claude-sonnet-4-6');
        const advisory = computeInquiryAdvisoryContext({
            scope: 'book',
            focusLabel: 'B1',
            resolvedEngine: buildResolvedEngine(currentModel, 'Anthropic'),
            currentModel,
            models: BUILTIN_MODELS,
            analysisPackaging: 'automatic',
            estimatedInputTokens: 300000,
            corpusFingerprint: 'fp-2',
            overrideSummary: { active: false, classCount: 0, itemCount: 0, total: 0 },
        });

        expect(advisory).toBeNull();
    });

    it('returns corpus reuse recommendation when fingerprint is reused and current engine lacks reuse', () => {
        const currentModel = getModel('llama3');
        const advisory = computeInquiryAdvisoryContext({
            scope: 'book',
            focusLabel: 'B1',
            resolvedEngine: buildResolvedEngine(currentModel, 'Ollama'),
            currentModel,
            models: [currentModel, getModel('gemini-3.1-pro-preview')],
            analysisPackaging: 'automatic',
            estimatedInputTokens: 12000,
            corpusFingerprint: 'fp-reuse',
            corpusFingerprintReused: true,
            overrideSummary: { active: false, classCount: 0, itemCount: 0, total: 0 },
        });

        expect(advisory).not.toBeNull();
        expect(advisory?.recommendation.reasonCode).toBe('cost_reuse_preferred');
        expect(advisory?.recommendation.provider).toBe('google');
        expect(advisory?.recommendation.options).toHaveLength(1);
    });

    it('returns precision recommendation for deep analysis questions when another engine is stronger', () => {
        const openAiStrong = getModel('gpt-5.2-chat-latest');
        const currentModel: ModelInfo = {
            ...openAiStrong,
            id: 'gpt-5.2-precision-lite-test',
            alias: 'gpt-5.2-precision-lite-test',
            label: 'GPT-5.2 Precision Lite Test',
            capabilities: openAiStrong.capabilities.filter(capability => capability !== 'reasoningStrong')
        };
        const advisory = computeInquiryAdvisoryContext({
            scope: 'book',
            focusLabel: 'B1',
            resolvedEngine: buildResolvedEngine(currentModel, 'OpenAI'),
            currentModel,
            models: [currentModel, getModel('gemini-3.1-pro-preview')],
            analysisPackaging: 'automatic',
            estimatedInputTokens: 10000,
            corpusFingerprint: 'fp-precision',
            corpusFingerprintReused: false,
            questionText: 'Compare thematic contradictions and evaluate the causal tradeoffs across this arc.',
            overrideSummary: { active: false, classCount: 0, itemCount: 0, total: 0 },
        });

        expect(advisory).not.toBeNull();
        expect(advisory?.recommendation.reasonCode).toBe('precision_analysis_preferred');
        expect(advisory?.recommendation.provider).toBe('google');
        expect(advisory?.recommendation.options).toHaveLength(1);
    });

    it('does not suggest a single-pass switch for only a minor pass-count gain', () => {
        const currentModel = getModel('claude-sonnet-4-5-20250929');
        const advisory = computeInquiryAdvisoryContext({
            scope: 'book',
            focusLabel: 'B1',
            resolvedEngine: buildResolvedEngine(currentModel, 'Anthropic'),
            currentModel,
            models: BUILTIN_MODELS,
            analysisPackaging: 'automatic',
            estimatedInputTokens: 220000,
            corpusFingerprint: 'fp-pass-threshold',
            overrideSummary: { active: false, classCount: 0, itemCount: 0, total: 0 },
        });

        expect(advisory).toBeNull();
    });

    it('returns null when no meaningful advisory advantage exists', () => {
        const currentModel = getModel('claude-sonnet-4-6');
        const advisory = computeInquiryAdvisoryContext({
            scope: 'book',
            focusLabel: 'B1',
            resolvedEngine: buildResolvedEngine(currentModel, 'Anthropic'),
            currentModel,
            models: BUILTIN_MODELS,
            analysisPackaging: 'automatic',
            estimatedInputTokens: 30000,
            corpusFingerprint: 'fp-3',
            overrideSummary: { active: false, classCount: 0, itemCount: 0, total: 0 },
        });

        expect(advisory).toBeNull();
    });

    it('keeps createdAt stable when advisory identity does not change', () => {
        const currentModel = getModel('gpt-5.2-chat-latest');
        const first = computeInquiryAdvisoryContext({
            scope: 'book',
            focusLabel: 'B1',
            resolvedEngine: buildResolvedEngine(currentModel, 'OpenAI'),
            currentModel,
            models: BUILTIN_MODELS,
            analysisPackaging: 'automatic',
            estimatedInputTokens: 40000,
            corpusFingerprint: 'fp-4',
            overrideSummary: { active: false, classCount: 0, itemCount: 0, total: 0 },
        });

        expect(first).not.toBeNull();

        const second = computeInquiryAdvisoryContext({
            scope: 'book',
            focusLabel: 'B1',
            resolvedEngine: buildResolvedEngine(currentModel, 'OpenAI'),
            currentModel,
            models: BUILTIN_MODELS,
            analysisPackaging: 'automatic',
            estimatedInputTokens: 40000,
            corpusFingerprint: 'fp-4',
            overrideSummary: { active: false, classCount: 0, itemCount: 0, total: 0 },
            previousContext: first,
        });

        expect(second).not.toBeNull();
        expect(second?.createdAt).toBe(first?.createdAt);
    });
});
