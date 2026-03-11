import { describe, expect, it } from 'vitest';
import { BUILTIN_MODELS } from '../registry/builtinModels';
import {
    buildEngineCapabilityMatrix,
    resolveEngineCapabilities,
    resolveEngineCapabilitiesForRef
} from './engineCapabilities';
import type { ModelInfo } from '../types';

function byAlias(alias: string): ModelInfo {
    const model = BUILTIN_MODELS.find(entry => entry.alias === alias);
    expect(model).toBeDefined();
    return model!;
}

describe('resolveEngineCapabilities', () => {
    it('marks Anthropic Inquiry-relevant capabilities as available and batch as not yet used', () => {
        const model = byAlias('claude-sonnet-4.6');
        const resolved = resolveEngineCapabilities(model);

        expect(resolved.directManuscriptCitations.status).toBe('available');
        expect(resolved.groundedToolAttribution.status).toBe('unavailable');
        expect(resolved.sources.status).toBe('available');
        expect(resolved.corpusReuse.status).toBe('available');
        expect(resolved.largeContext.status).toBe('available');
        expect(resolved.largeContext.contextWindow).toBe(200000);
        expect(resolved.batchAnalysis.status).toBe('provider_supported_not_used');
    });

    it('marks OpenAI corpus reuse available for system-role models and batch as not yet used', () => {
        const model = byAlias('gpt-5.2-latest');
        const resolved = resolveEngineCapabilities(model);

        expect(resolved.directManuscriptCitations.status).toBe('unavailable');
        expect(resolved.groundedToolAttribution.status).toBe('provider_supported_not_used');
        expect(resolved.sources.status).toBe('unavailable');
        expect(resolved.corpusReuse.status).toBe('available');
        expect(resolved.largeContext.status).toBe('available');
        expect(resolved.batchAnalysis.status).toBe('provider_supported_not_used');
    });

    it('downgrades OpenAI corpus reuse when a model cannot use the system role path', () => {
        const base = byAlias('gpt-5.2-latest');
        const o1LikeModel: ModelInfo = {
            ...base,
            id: 'o1-mini',
            alias: 'o1-mini',
            label: 'o1-mini'
        };

        const resolved = resolveEngineCapabilities(o1LikeModel);
        expect(resolved.corpusReuse.status).toBe('provider_supported_not_used');
    });

    it('marks Gemini reuse and context available but sources and batch unavailable', () => {
        const model = byAlias('gemini-3.1-pro-preview');
        const resolved = resolveEngineCapabilities(model);

        expect(resolved.directManuscriptCitations.status).toBe('unavailable');
        expect(resolved.groundedToolAttribution.status).toBe('provider_supported_not_used');
        expect(resolved.sources.status).toBe('unavailable');
        expect(resolved.corpusReuse.status).toBe('available');
        expect(resolved.largeContext.status).toBe('available');
        expect(resolved.largeContext.contextWindow).toBe(1048576);
        expect(resolved.batchAnalysis.status).toBe('unavailable');
    });

    it('marks local models unavailable for Inquiry-critical capabilities', () => {
        const model = byAlias('ollama-llama3');
        const resolved = resolveEngineCapabilities(model);

        expect(resolved.directManuscriptCitations.status).toBe('unavailable');
        expect(resolved.groundedToolAttribution.status).toBe('unavailable');
        expect(resolved.sources.status).toBe('unavailable');
        expect(resolved.corpusReuse.status).toBe('unavailable');
        expect(resolved.largeContext.status).toBe('unavailable');
        expect(resolved.batchAnalysis.status).toBe('unavailable');
    });

    it('resolves by model reference and builds a per-model matrix row shape', () => {
        const model = byAlias('claude-opus-4.6');
        const byRef = resolveEngineCapabilitiesForRef(BUILTIN_MODELS, {
            provider: model.provider,
            modelId: model.id
        });
        expect(byRef?.modelAlias).toBe('claude-opus-4.6');

        const matrix = buildEngineCapabilityMatrix([model]);
        expect(matrix).toEqual([
            {
                provider: 'anthropic',
                modelId: 'claude-opus-4-6',
                modelAlias: 'claude-opus-4.6',
                modelLabel: 'Claude Opus 4.6',
                contextWindow: 200000,
                directManuscriptCitations: 'available',
                groundedToolAttribution: 'unavailable',
                sources: 'available',
                corpusReuse: 'available',
                largeContext: 'available',
                batchAnalysis: 'provider_supported_not_used'
            }
        ]);
    });
});
