import type { Capability, ModelInfo } from '../types';

const DEEP_CAPS: Capability[] = ['longContext', 'jsonStrict', 'reasoningStrong', 'highOutputCap'];
const FAST_CAPS: Capability[] = ['jsonStrict', 'streaming'];
const LOCAL_CAPS: Capability[] = ['jsonStrict'];

/*
 * Minimum-viable model catalog (2026-05-22).
 *
 * Policy: one top model per provider, plus a Google fast/deep split where
 * the speed/depth tradeoff is genuinely a quality dimension (not cost).
 * Picker UX infrastructure stays intact so models can be re-added later
 * via the deliberate quarterly promotion process in
 * docs/engineering/standards/model-promotion.md.
 *
 * Adding a model is a replacement, not an accretion. Run
 * `npm run gates` after any change to keep the catalog contract test
 * and the model coverage gate happy.
 */
export const BUILTIN_MODELS: ModelInfo[] = [
    {
        provider: 'anthropic',
        id: 'claude-opus-4-7',
        alias: 'claude-opus-4.7',
        label: 'Claude Opus 4.7',
        line: 'claude-opus',
        tier: 'DEEP',
        capabilities: [...DEEP_CAPS],
        personality: { reasoning: 10, writing: 10, determinism: 9 },
        contextWindow: 1000000,
        maxOutput: 16000,
        releasedAt: '2026-04-16',
        status: 'stable',
        rollout: {
            channel: 'stable',
            status: 'stable',
            lane: 'default'
        }
    },
    {
        provider: 'openai',
        id: 'gpt-5.5',
        alias: 'gpt-5.5',
        label: 'GPT-5.5',
        line: 'gpt-5',
        tier: 'BALANCED',
        capabilities: [...DEEP_CAPS, 'toolCalling', 'functionCalling'],
        personality: { reasoning: 10, writing: 9, determinism: 9 },
        contextWindow: 1050000,
        maxOutput: 128000,
        releasedAt: '2026-04-23',
        status: 'stable',
        rollout: {
            channel: 'stable',
            status: 'stable',
            lane: 'default'
        },
        constraints: {
            supportsTemperature: false,
            supportsTopP: false,
            supportsReasoningEffort: true,
            preferredOpenAiEndpoint: 'responses'
        }
    },
    {
        provider: 'google',
        id: 'gemini-3.1-pro-preview',
        alias: 'gemini-3.1-pro-preview',
        label: 'Gemini 3.1 Pro Preview',
        line: 'gemini-pro',
        tier: 'DEEP',
        capabilities: ['longContext', 'jsonStrict', 'reasoningStrong', 'highOutputCap', 'streaming'],
        personality: { reasoning: 9, writing: 8, determinism: 8 },
        contextWindow: 1048576,
        maxOutput: 65536,
        status: 'preview',
        constraints: { cacheVsCitationsExclusive: true }
    },
    {
        provider: 'google',
        id: 'gemini-3.5-flash',
        alias: 'gemini-3.5-flash',
        label: 'Gemini 3.5 Flash',
        line: 'gemini-flash',
        tier: 'FAST',
        capabilities: ['longContext', 'jsonStrict', 'reasoningStrong', 'highOutputCap', 'streaming'],
        personality: { reasoning: 8, writing: 8, determinism: 8 },
        contextWindow: 1048576,
        maxOutput: 65536,
        releasedAt: '2026-05-01',
        status: 'stable',
        constraints: { cacheVsCitationsExclusive: true }
    },
    {
        provider: 'ollama',
        id: 'llama3',
        alias: 'ollama-llama3',
        label: 'Ollama Llama 3',
        line: 'ollama-llama',
        tier: 'LOCAL',
        capabilities: [...LOCAL_CAPS],
        personality: { reasoning: 6, writing: 6, determinism: 5 },
        contextWindow: 32000,
        maxOutput: 4000,
        status: 'stable'
    },
    {
        provider: 'ollama',
        id: 'local-model',
        alias: 'ollama-local-model',
        label: 'Local Model',
        line: 'ollama-local',
        tier: 'LOCAL',
        capabilities: [...LOCAL_CAPS],
        personality: { reasoning: 5, writing: 5, determinism: 4 },
        contextWindow: 32000,
        maxOutput: 4000,
        status: 'legacy'
    },
    {
        provider: 'none',
        id: 'none',
        alias: 'none',
        label: 'None',
        tier: 'FAST',
        capabilities: [...FAST_CAPS],
        personality: { reasoning: 0, writing: 0, determinism: 10 },
        contextWindow: 0,
        maxOutput: 0,
        status: 'legacy'
    }
];

export function findBuiltinByAlias(alias: string): ModelInfo | undefined {
    return BUILTIN_MODELS.find(model => model.alias === alias);
}

export function findBuiltinByProviderModel(provider: ModelInfo['provider'], modelId: string): ModelInfo | undefined {
    return BUILTIN_MODELS.find(model => model.provider === provider && model.id === modelId);
}
