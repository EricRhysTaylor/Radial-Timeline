import { describe, expect, it } from 'vitest';
import { BUILTIN_MODELS } from '../../ai/registry/builtinModels';
import { buildDefaultAiSettings } from '../../ai/settings/aiSettings';
import { resolveInquiryEngine } from './inquiryModelResolver';

describe('resolveInquiryEngine', () => {
    it('does not fall back to legacy provider fields when canonical AI settings disable AI', () => {
        const plugin = {
            settings: {
                aiSettings: {
                    ...buildDefaultAiSettings(),
                    provider: 'none'
                },
                defaultAiProvider: 'openai',
                openaiModelId: 'gpt-5.4'
            }
        } as any;

        const resolved = resolveInquiryEngine(plugin, BUILTIN_MODELS);

        expect(resolved.provider).toBe('none');
        expect(resolved.blocked).toBe(true);
        expect(resolved.policySource).toBe('disabled');
        expect(resolved.modelId).toBe('');
    });

    it('fails closed when the canonical provider is not configured', () => {
        const plugin = {
            settings: {
                aiSettings: {
                    ...buildDefaultAiSettings(),
                    provider: 'ollama',
                    connections: {
                        ...buildDefaultAiSettings().connections,
                        ollamaBaseUrl: ''
                    }
                }
            }
        } as any;

        const resolved = resolveInquiryEngine(plugin, BUILTIN_MODELS);

        expect(resolved.provider).toBe('ollama');
        expect(resolved.hasCredential).toBe(false);
        expect(resolved.blocked).toBe(true);
        expect(resolved.blockReason).toContain('Ollama base URL');
    });

    it('fails closed when canonical AI settings contain an invalid provider id', () => {
        const plugin = {
            settings: {
                aiSettings: {
                    ...buildDefaultAiSettings(),
                    provider: 'legacy-openai'
                }
            }
        } as any;

        const resolved = resolveInquiryEngine(plugin, BUILTIN_MODELS);

        expect(resolved.provider).toBe('none');
        expect(resolved.hasCredential).toBe(false);
        expect(resolved.blocked).toBe(true);
        expect(resolved.blockReason).toContain('invalid provider');
    });
});
