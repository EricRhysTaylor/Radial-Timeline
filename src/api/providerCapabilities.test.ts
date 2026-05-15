import { describe, expect, it } from 'vitest';
import { BUILTIN_MODELS } from '../ai/registry/builtinModels';
import { getModelRequestProfile } from '../ai/registry/modelRequestProfiles';
import { sanitizeDispatchParams } from './providerCapabilities';

describe('sanitizeDispatchParams', () => {
    it('strips OpenAI GPT-5.5 sampling controls before dispatch', () => {
        const result = sanitizeDispatchParams('openai', {
            modelId: 'gpt-5.5',
            systemPrompt: 'You are precise.',
            userPrompt: 'Return JSON.',
            maxOutputTokens: 2048,
            temperature: 0.2,
            topP: 0.9
        });

        expect(result.params.temperature).toBeUndefined();
        expect(result.params.topP).toBeUndefined();
        expect(result.notes).toContain('Stripped temperature for openai/gpt-5.5: model does not support temperature');
        expect(result.notes).toContain('Stripped topP for openai/gpt-5.5: model does not support topP');
    });

    it('keeps OpenAI GPT-5.4 sampling controls unchanged', () => {
        const result = sanitizeDispatchParams('openai', {
            modelId: 'gpt-5.4',
            userPrompt: 'Return JSON.',
            maxOutputTokens: 2048,
            temperature: 0.2,
            topP: 0.9
        });

        expect(result.params.temperature).toBe(0.2);
        expect(result.params.topP).toBe(0.9);
        expect(result.notes).toEqual([]);
    });

    it('centralizes GPT-5.5 request profile metadata for provider adapters', () => {
        expect(getModelRequestProfile('openai', 'gpt-5.5')).toMatchObject({
            supportsTemperature: false,
            supportsTopP: false,
            supportsJsonSchema: true,
            supportsPromptCache: true,
            supportsReasoningEffort: true,
            preferredOpenAiEndpoint: 'responses'
        });
    });

    it('resolves an explicit request profile for every curated cloud model', () => {
        const cloudModels = BUILTIN_MODELS.filter(model =>
            model.provider === 'openai'
            || model.provider === 'anthropic'
            || model.provider === 'google'
        );

        expect(cloudModels.length).toBeGreaterThan(0);
        for (const model of cloudModels) {
            const profile = getModelRequestProfile(model.provider, model.id);
            expect(typeof profile.supportsTemperature, model.id).toBe('boolean');
            expect(typeof profile.supportsTopP, model.id).toBe('boolean');
            expect(typeof profile.supportsJsonSchema, model.id).toBe('boolean');
            expect(typeof profile.supportsPromptCache, model.id).toBe('boolean');
            expect(typeof profile.supportsCitations, model.id).toBe('boolean');
            expect(typeof profile.supportsEvidenceDocuments, model.id).toBe('boolean');
            expect(typeof profile.supportsThinkingBudget, model.id).toBe('boolean');
            expect(typeof profile.supportsDisableThinking, model.id).toBe('boolean');
        }
    });

    it('treats Gemini thinking models as managed-sampling models', () => {
        const profile = getModelRequestProfile('google', 'gemini-2.5-pro');

        expect(profile.supportsTemperature).toBe(false);
        expect(profile.supportsTopP).toBe(false);
        expect(profile.supportsDisableThinking).toBe(true);
    });

    it('strips Gemini managed-sampling controls using the shared request profile', () => {
        const result = sanitizeDispatchParams('google', {
            modelId: 'gemini-2.5-pro',
            userPrompt: 'Return JSON.',
            maxOutputTokens: 2048,
            temperature: 0.2,
            topP: 0.9,
            disableThinking: true
        });

        expect(result.params.temperature).toBeUndefined();
        expect(result.params.topP).toBeUndefined();
        expect(result.params.disableThinking).toBe(true);
        expect(result.notes).toContain('Stripped temperature for google/gemini-2.5-pro: model does not support temperature');
        expect(result.notes).toContain('Stripped topP for google/gemini-2.5-pro: model does not support topP');
    });
});
