import type {
    AIProviderId,
    AiSettingsV1,
    AIRoleTemplate,
    LocalLlmSettings,
    ModelPolicy
} from '../types';

export const AI_SETTINGS_SCHEMA_VERSION = 1;
export const DEFAULT_CANONICAL_PROVIDER: Exclude<AIProviderId, 'none'> = 'openai';
export const DEFAULT_CANONICAL_MODEL_ALIAS = 'gpt-5.4';
export const DEFAULT_CREDENTIAL_SECRET_IDS = {
    openaiSecretId: 'rt.openai.api-key',
    anthropicSecretId: 'rt.anthropic.api-key',
    googleSecretId: 'rt.google.api-key',
    ollamaSecretId: 'rt.ollama.api-key'
} as const;
export type CredentialSecretField = keyof typeof DEFAULT_CREDENTIAL_SECRET_IDS;
export type CredentialSecretProvider = 'openai' | 'anthropic' | 'google' | 'ollama';

export const DEFAULT_MODEL_POLICY: ModelPolicy = { type: 'latestStable' };
export const DEFAULT_LOCAL_LLM_SETTINGS: LocalLlmSettings = {
    enabled: true,
    backend: 'ollama',
    baseUrl: 'http://localhost:11434/v1',
    defaultModelId: 'llama3',
    instructions: '',
    sendPulseToAiReport: true,
    timeoutMs: 45000,
    maxRetries: 1,
    jsonMode: 'response_format'
};
export const BUILTIN_ROLE_TEMPLATES: AIRoleTemplate[] = [
    {
        id: 'commercial_genre',
        name: 'Commercial Genre Fiction (Balanced Depth)',
        prompt: 'Act as a developmental editor for a commercial genre novel. Prioritize pacing, clarity, and emotional stakes. Ensure each scene moves the plot or deepens character conflict. Keep prose lean; prefer tension and subtext to exposition. Focus feedback on momentum, scene purpose, and reader engagement.',
        isBuiltIn: true
    },
    {
        id: 'literary',
        name: 'Literary / Character-Driven Fiction',
        prompt: 'Act as a developmental editor for a literary or character-driven novel. Emphasize emotional resonance, internal conflict, and subtext. Feedback should focus on authenticity of character motivation, narrative voice, and thematic depth. Avoid line-level polish; focus on the psychological realism of each beat.',
        isBuiltIn: true
    },
    {
        id: 'young_adult',
        name: 'Young Adult / Coming-of-Age',
        prompt: 'Act as a developmental editor for a young adult coming-of-age novel. Focus on pacing, clear emotional arcs, and voice consistency. Ensure stakes feel personal and immediate. Highlight areas where dialogue or internal monologue can better show growth or vulnerability. Keep feedback focused on concise and energetic prose.',
        isBuiltIn: true
    },
    {
        id: 'science_fiction',
        name: 'Epic or Hard Science Fiction / World-Building Focus',
        prompt: 'Act as a developmental editor for a science-fiction novel with complex world-building. Balance clarity and immersion; ensure exposition is dramatized through character action or dialogue. Focus feedback on world logic, pacing through discovery, and integrating big ideas without slowing emotional momentum. Prioritize cohesion between technology, society, and theme.',
        isBuiltIn: true
    },
    {
        id: 'thriller',
        name: 'Mystery / Thriller / Suspense',
        prompt: 'Act as a developmental editor for a mystery or thriller novel. Emphasize pacing, tension, and clarity of motive. Identify where reveals or reversals land too early or too late. Ensure reader curiosity and suspense are sustained through every scene. Keep feedback focused on plot mechanics and emotional rhythm.',
        isBuiltIn: true
    },
    {
        id: 'romance',
        name: 'Romance / Emotional-Arc Focused Fiction',
        prompt: 'Act as a developmental editor for a romance or emotionally driven narrative. Focus feedback on relationship dynamics, emotional authenticity, and pacing of attraction/conflict/resolution. Ensure internal and external conflicts are intertwined. Highlight where subtext or tension could replace exposition.',
        isBuiltIn: true
    }
];

export function cloneBuiltInRoleTemplates(): AIRoleTemplate[] {
    return BUILTIN_ROLE_TEMPLATES.map(template => ({ ...template }));
}

export function cloneDefaultLocalLlmSettings(): LocalLlmSettings {
    return { ...DEFAULT_LOCAL_LLM_SETTINGS };
}

export function buildDefaultAiSettings(): AiSettingsV1 {
    return {
        schemaVersion: AI_SETTINGS_SCHEMA_VERSION,
        provider: DEFAULT_CANONICAL_PROVIDER,
        modelPolicy: { ...DEFAULT_MODEL_POLICY },
        analysisPackaging: 'automatic',
        localLlm: cloneDefaultLocalLlmSettings(),
        roleTemplateId: 'commercial_genre',
        roleTemplates: cloneBuiltInRoleTemplates(),
        overrides: {
            maxOutputMode: 'auto',
            reasoningDepth: 'standard',
            jsonStrict: true
        },
        aiAccessProfile: {
            anthropicTier: 1,
            openaiTier: 1,
            googleTier: 1
        },
        privacy: {
            allowTelemetry: false,
            allowRemoteRegistry: false,
            allowProviderSnapshot: false
        },
        featureProfiles: {},
        credentials: {
            ...DEFAULT_CREDENTIAL_SECRET_IDS
        },
        connections: {},
        migrationWarnings: [],
        upgradedBannerPending: false
    };
}
