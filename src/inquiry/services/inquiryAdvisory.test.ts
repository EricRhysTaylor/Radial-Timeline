import { describe, expect, it } from 'vitest';
import { BUILTIN_MODELS } from '../../ai/registry/builtinModels';
import { buildDefaultAiSettings } from '../../ai/settings/aiSettings';
import type { ResolvedInquiryEngine } from './inquiryModelResolver';
import { computeInquiryAdvisoryContext } from './inquiryAdvisory';

function getModel(modelId: string) {
    const model = BUILTIN_MODELS.find(entry => entry.id === modelId);
    if (!model) throw new Error(`Missing builtin model: ${modelId}`);
    return model;
}

function buildResolvedEngine(modelId: string, providerLabel: string): ResolvedInquiryEngine {
    const model = getModel(modelId);
    return {
        provider: model.provider,
        modelId: model.id,
        modelAlias: model.alias,
        modelLabel: model.label,
        providerLabel,
        contextWindow: model.contextWindow,
        maxOutput: model.maxOutput,
        selectionReason: 'test',
        policySource: 'globalPolicy'
    };
}

describe('computeInquiryAdvisoryContext', () => {
    it('returns single-pass recommendation when current engine needs multiple passes', () => {
        const aiSettings = buildDefaultAiSettings();
        aiSettings.provider = 'openai';

        const advisory = computeInquiryAdvisoryContext({
            scope: 'book',
            focusLabel: 'B1',
            resolvedEngine: buildResolvedEngine('gpt-5.1-chat-latest', 'OpenAI'),
            currentModel: getModel('gpt-5.1-chat-latest'),
            models: BUILTIN_MODELS,
            aiSettings,
            analysisPackaging: 'automatic',
            estimatedInputTokens: 300000,
            expectedPassCount: 3,
            corpusFingerprint: 'fp-1',
            overrideSummary: { active: false, classCount: 0, itemCount: 0, total: 0 },
        });

        expect(advisory).not.toBeNull();
        expect(advisory?.recommendation.reasonCode).toBe('single_pass_preferred');
        expect(advisory?.recommendation.provider).toBe('google');
    });

    it('returns sources recommendation when current engine lacks Sources support', () => {
        const aiSettings = buildDefaultAiSettings();
        aiSettings.provider = 'openai';

        const advisory = computeInquiryAdvisoryContext({
            scope: 'book',
            focusLabel: 'B1',
            resolvedEngine: buildResolvedEngine('gpt-5.2-chat-latest', 'OpenAI'),
            currentModel: getModel('gpt-5.2-chat-latest'),
            models: BUILTIN_MODELS,
            aiSettings,
            analysisPackaging: 'automatic',
            estimatedInputTokens: 40000,
            expectedPassCount: 1,
            corpusFingerprint: 'fp-2',
            overrideSummary: { active: false, classCount: 0, itemCount: 0, total: 0 },
        });

        expect(advisory).not.toBeNull();
        expect(advisory?.recommendation.reasonCode).toBe('sources_preferred');
        expect(advisory?.recommendation.provider).toBe('anthropic');
    });

    it('returns null when no meaningful advisory delta exists', () => {
        const aiSettings = buildDefaultAiSettings();
        aiSettings.provider = 'anthropic';

        const advisory = computeInquiryAdvisoryContext({
            scope: 'book',
            focusLabel: 'B1',
            resolvedEngine: buildResolvedEngine('claude-sonnet-4-6', 'Anthropic'),
            currentModel: getModel('claude-sonnet-4-6'),
            models: BUILTIN_MODELS,
            aiSettings,
            analysisPackaging: 'automatic',
            estimatedInputTokens: 30000,
            expectedPassCount: 1,
            corpusFingerprint: 'fp-3',
            overrideSummary: { active: false, classCount: 0, itemCount: 0, total: 0 },
        });

        expect(advisory).toBeNull();
    });

    it('keeps createdAt stable when advisory identity does not change', () => {
        const aiSettings = buildDefaultAiSettings();
        aiSettings.provider = 'openai';

        const first = computeInquiryAdvisoryContext({
            scope: 'book',
            focusLabel: 'B1',
            resolvedEngine: buildResolvedEngine('gpt-5.2-chat-latest', 'OpenAI'),
            currentModel: getModel('gpt-5.2-chat-latest'),
            models: BUILTIN_MODELS,
            aiSettings,
            analysisPackaging: 'automatic',
            estimatedInputTokens: 40000,
            expectedPassCount: 1,
            corpusFingerprint: 'fp-4',
            overrideSummary: { active: false, classCount: 0, itemCount: 0, total: 0 },
        });

        expect(first).not.toBeNull();

        const second = computeInquiryAdvisoryContext({
            scope: 'book',
            focusLabel: 'B1',
            resolvedEngine: buildResolvedEngine('gpt-5.2-chat-latest', 'OpenAI'),
            currentModel: getModel('gpt-5.2-chat-latest'),
            models: BUILTIN_MODELS,
            aiSettings,
            analysisPackaging: 'automatic',
            estimatedInputTokens: 40000,
            expectedPassCount: 1,
            corpusFingerprint: 'fp-4',
            overrideSummary: { active: false, classCount: 0, itemCount: 0, total: 0 },
            previousContext: first,
        });

        expect(second).not.toBeNull();
        expect(second?.createdAt).toBe(first?.createdAt);
    });
});
