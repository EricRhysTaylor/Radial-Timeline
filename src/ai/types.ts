import type { AiStatus } from '../api/providerErrors';

export type AIProviderId = 'openai' | 'anthropic' | 'google' | 'ollama' | 'none';
export type LegacyProviderId = 'openai' | 'anthropic' | 'gemini' | 'local';
export type AccessTier = 1 | 2 | 3 | 4;

export type Capability =
    | 'longContext'
    | 'jsonStrict'
    | 'reasoningStrong'
    | 'highOutputCap'
    | 'toolCalling'
    | 'streaming'
    | 'vision'
    | 'functionCalling';

export type ModelTier = 'DEEP' | 'BALANCED' | 'FAST' | 'LOCAL';
export type ModelStatus = 'stable' | 'legacy' | 'deprecated';

export interface ModelPersonality {
    reasoning: number;
    writing: number;
    determinism: number;
}

export interface ModelInfo {
    provider: AIProviderId;
    id: string;
    alias: string;
    label: string;
    tier: ModelTier;
    capabilities: Capability[];
    personality: ModelPersonality;
    contextWindow: number;
    maxOutput: number;
    status: ModelStatus;
    releasedAt?: string;
    /** Product line grouping (e.g. 'claude-sonnet', 'claude-opus', 'gpt-5', 'gemini-pro'). */
    line?: string;
}

export type ModelPolicy =
    | { type: 'pinned'; pinnedAlias?: string }
    | { type: 'latestStable' };

export interface AIOverrides {
    temperature?: number;
    topP?: number;
    maxOutputMode?: 'auto' | 'high' | 'max';
    reasoningDepth?: 'standard' | 'deep';
    jsonStrict?: boolean;
    seed?: number;
}

export interface AIPrivacySettings {
    allowTelemetry: boolean;
    allowRemoteRegistry: boolean;
    allowProviderSnapshot: boolean;
}

export interface AIAccessProfile {
    anthropicTier?: AccessTier;
    openaiTier?: AccessTier;
    googleTier?: AccessTier;
}

export interface AIFeatureProfile {
    provider?: AIProviderId;
    modelPolicy?: ModelPolicy;
    overrides?: AIOverrides;
}

export interface AIProviderCredentials {
    openaiSecretId?: string;
    anthropicSecretId?: string;
    googleSecretId?: string;
    ollamaSecretId?: string;
}

export interface AIProviderConnectionSettings {
    ollamaBaseUrl?: string;
}

export type AnalysisPackaging = 'automatic' | 'singlePassOnly';

export interface AiSettingsV1 {
    schemaVersion: 1;
    provider: AIProviderId;
    modelPolicy: ModelPolicy;
    analysisPackaging: AnalysisPackaging;
    roleTemplateId?: string;
    overrides: AIOverrides;
    aiAccessProfile: AIAccessProfile;
    privacy: AIPrivacySettings;
    featureProfiles?: Record<string, AIFeatureProfile>;
    credentials?: AIProviderCredentials;
    connections?: AIProviderConnectionSettings;
    migrationWarnings?: string[];
    upgradedBannerPending?: boolean;
    lastThroughputCheck?: AIThroughputCheckResult;
}

export interface AIThroughputCheckResult {
    checkedAt: string;
    provider: Exclude<AIProviderId, 'none'>;
    endpoint: string;
    statusCode: number;
    observedHeaders: Record<string, string>;
    observedFields?: Record<string, string>;
    noLimitInfoAvailable: boolean;
    heuristicTierSuggestion?: AccessTier;
    heuristicSummary: string;
}

export interface GenerateTextRequest {
    modelId: string;
    systemPrompt?: string | null;
    userPrompt: string;
    maxOutputTokens?: number;
    temperature?: number;
    topP?: number;
}

export interface GenerateJsonRequest extends GenerateTextRequest {
    jsonSchema: Record<string, unknown>;
    jsonStrict?: boolean;
}

export interface ProviderExecutionResult {
    success: boolean;
    content: string | null;
    responseData: unknown;
    requestPayload?: unknown;
    aiStatus: AiStatus;
    aiReason?: string;
    aiProvider: LegacyProviderId;
    aiModelRequested: string;
    aiModelResolved: string;
    error?: string;
    sanitizationNotes?: string[];
    retryCount?: number;
}

export interface AIProvider {
    id: AIProviderId;
    supports(capability: Capability): boolean;
    listModels?(): Promise<ModelInfo[]>;
    generateText(req: GenerateTextRequest): Promise<ProviderExecutionResult>;
    generateJson(req: GenerateJsonRequest): Promise<ProviderExecutionResult>;
}

export interface ModelSelectionRequest {
    provider: AIProviderId;
    policy: ModelPolicy;
    requiredCapabilities: Capability[];
    accessTier?: AccessTier;
    contextTokensNeeded?: number;
    outputTokensNeeded?: number;
}

export interface ModelSelectionResult {
    provider: AIProviderId;
    model: ModelInfo;
    warnings: string[];
    reason: string;
}

export interface AIRunRequest {
    feature: string;
    task: string;
    requiredCapabilities: Capability[];
    featureModeInstructions?: string;
    projectContext?: string;
    userInput?: string;
    userQuestion?: string;
    outputRules?: string;
    promptTemplate?: string;
    vars?: Record<string, unknown>;
    promptText?: string;
    systemPrompt?: string | null;
    returnType: 'text' | 'json';
    responseSchema?: Record<string, unknown>;
    policyOverride?: ModelPolicy;
    providerOverride?: AIProviderId;
    overrides?: Partial<AIOverrides>;
    tokenEstimateInput?: number;
    legacySelectionHint?: {
        provider?: LegacyProviderId;
        modelId?: string;
    };
}

export interface AIRunAdvancedContext {
    roleTemplateName: string;
    provider: AIProviderId;
    modelAlias: string;
    modelLabel: string;
    modelSelectionReason: string;
    availabilityStatus: 'visible' | 'not_visible' | 'unknown';
    maxInputTokens: number;
    maxOutputTokens: number;
    analysisPackaging: AnalysisPackaging;
    executionPassCount?: number;
    packagingTriggerReason?: string;
    featureModeInstructions: string;
    finalPrompt: string;
}

export interface AIRunResult {
    content: string | null;
    responseData: unknown;
    provider: AIProviderId;
    modelRequested: string;
    modelResolved: string;
    modelAlias?: string;
    aiStatus: AiStatus;
    aiReason?: string;
    warnings: string[];
    reason: string;
    requestPayload?: unknown;
    error?: string;
    retryCount?: number;
    sanitizationNotes?: string[];
    advancedContext?: AIRunAdvancedContext;
}

export interface RegistryRefreshResult {
    source: 'builtin' | 'cache' | 'remote';
    fetchedAt?: string;
    warning?: string;
}

export interface CanonicalModelRecord {
    provider: 'openai' | 'anthropic' | 'google';
    id: string;
    label?: string;
    createdAt?: string;
    inputTokenLimit?: number;
    outputTokenLimit?: number;
    raw: Record<string, unknown>;
}

export interface SceneRef {
    ref_id: string;
    ref_label?: string;
    ref_path?: string;
}

export interface ProviderSnapshotPayload {
    generatedAt: string;
    summary: {
        openai: number;
        anthropic: number;
        google: number;
    };
    models: CanonicalModelRecord[];
}
