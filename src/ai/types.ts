import type { AiStatus } from '../api/providerErrors';

export type AIProviderId = 'openai' | 'anthropic' | 'google' | 'ollama' | 'none';
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
export type ModelStatus = 'stable' | 'preview' | 'legacy' | 'deprecated';
export type ModelRolloutStatus = 'stable' | 'provisional' | 'deprecated';
export type ModelReleaseChannel = 'stable' | 'pro' | 'rollback' | 'snapshot' | 'legacy';

export interface ModelRolloutMeta {
    /** Public release channel used by picker/resolver curation. */
    channel: ModelReleaseChannel;
    /** Hide from normal author-facing picker while keeping model available internally. */
    hiddenFromPicker?: boolean;
    /** Canonical predecessor/superseded model id in this line. */
    supersedes?: string;
}

export interface ModelRolloutInfo extends ModelRolloutMeta {
    /** Lifecycle status for deliberate model rollouts. */
    status: ModelRolloutStatus;
    /** Explicit rollback target for this model line. */
    fallbackModelId?: string;
    /** Optional lane classification (for example: default vs pro). */
    lane?: 'default' | 'pro';
    /** Indicates this model is a dated/snapshot variant of a canonical model. */
    datedVariantOf?: string;
}

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
    /** Optional rollout metadata used for safe latest-stable promotion and rollback clarity. */
    rollout?: ModelRolloutInfo;
    /** Model-specific runtime constraints that affect capability combinations. */
    constraints?: {
        /** When true, provider cache and citations/grounding cannot be used simultaneously. */
        cacheVsCitationsExclusive?: boolean;
        /** Known limitations for diagnostics/logging (not author-facing UI). */
        knownLimitations?: string[];
    };
}

export type EngineCapabilityStatus =
    | 'available'
    | 'provider_supported_not_used'
    | 'unavailable';

export interface EngineCapabilitySignal {
    status: EngineCapabilityStatus;
    providerSupported: boolean;
    availableInRt: boolean;
}

export interface EngineContextCapabilitySignal extends EngineCapabilitySignal {
    contextWindow: number;
}

export interface EngineCapabilities {
    provider: AIProviderId;
    modelId: string;
    modelAlias: string;
    modelLabel: string;
    /** Direct manuscript citations in RT Inquiry (document-backed source mapping). */
    directManuscriptCitations: EngineCapabilitySignal;
    /** Grounded/tool attribution (for example web/file/tool citation metadata). */
    groundedToolAttribution: EngineCapabilitySignal;
    corpusReuse: EngineCapabilitySignal;
    largeContext: EngineContextCapabilitySignal;
    batchAnalysis: EngineCapabilitySignal;
    structuredOutputStrength?: 'strong' | 'basic' | 'limited';
    reasoningSupport?: 'strong' | 'standard' | 'limited';
    /** Model-level constraints affecting capability combinations. */
    constraints: {
        cacheVsCitationsExclusive: boolean;
    };
    /** Whether this model is a preview (not production-stable). */
    isPreview: boolean;
}

export type ModelPolicy =
    | { type: 'pinned'; pinnedAlias?: string }
    | { type: 'latestPro' }
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

export type AnalysisPackaging = 'automatic' | 'singlePassOnly' | 'segmented';

export interface AIRoleTemplate {
    id: string;
    name: string;
    prompt: string;
    isBuiltIn: boolean;
}

export interface AiSettingsV1 {
    schemaVersion: 1;
    provider: AIProviderId;
    modelPolicy: ModelPolicy;
    analysisPackaging: AnalysisPackaging;
    roleTemplateId?: string;
    roleTemplates?: AIRoleTemplate[];
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

export type SourceAttributionType =
    | 'direct_manuscript'
    | 'tool_file'
    | 'tool_url'
    | 'grounded';

export interface DirectManuscriptCitation {
    attributionType?: 'direct_manuscript';
    citedText: string;
    documentIndex: number;
    documentTitle?: string;
    startCharIndex?: number;
    endCharIndex?: number;
}

export interface ExternalAttributionCitation {
    attributionType: Exclude<SourceAttributionType, 'direct_manuscript'>;
    sourceLabel: string;
    citedText?: string;
    sourceId?: string;
    fileId?: string;
    filename?: string;
    url?: string;
    title?: string;
    startCharIndex?: number;
    endCharIndex?: number;
}

export type SourceCitation = DirectManuscriptCitation | ExternalAttributionCitation;

export interface EvidenceDocument {
    title: string;
    content: string;
}

export interface GenerateTextRequest {
    modelId: string;
    systemPrompt?: string | null;
    userPrompt: string;
    maxOutputTokens?: number;
    temperature?: number;
    topP?: number;
    thinkingBudgetTokens?: number;
    citationsEnabled?: boolean;
    evidenceDocuments?: EvidenceDocument[];
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
    aiProvider: AIProviderId;
    aiModelRequested: string;
    aiModelResolved: string;
    error?: string;
    sanitizationNotes?: string[];
    retryCount?: number;
    /** True when a provider-level content cache was used (e.g. Gemini cachedContent). */
    cacheUsed?: boolean;
    /** Whether the cache was a hit (reuse) or freshly created. */
    cacheStatus?: 'hit' | 'created';
    /** OpenAI-only transport truth for runtime/log alignment. */
    aiTransportLane?: 'chat_completions' | 'responses';
    /** Normalized source attribution (direct manuscript citations or tool/grounded attribution). */
    citations?: SourceCitation[];
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
    preparedEstimate?: AIRunPreparedEstimate;
    /** Per-scene evidence documents for provider-level citations. */
    evidenceDocuments?: EvidenceDocument[];
}

export type InputTokenEstimateMethod = 'heuristic_chars' | 'anthropic_count';
export type RTCorpusEstimateMethod = 'rt_chars_heuristic';

export interface RTCorpusTokenBreakdown {
    scenesTokens: number;
    outlineTokens: number;
    referenceTokens: number;
}

export interface RTCorpusTokenEstimate {
    sceneCount: number;
    outlineCount: number;
    referenceCount: number;
    evidenceChars: number;
    estimatedTokens: number;
    method: RTCorpusEstimateMethod;
    breakdown: RTCorpusTokenBreakdown;
}

export interface AIRunPreparedEstimate {
    provider: Exclude<AIProviderId, 'none'>;
    model: ModelInfo;
    modelSelectionReason: string;
    warnings: string[];
    requiredCapabilities: Capability[];
    roleTemplateName: string;
    featureModeInstructions: string;
    systemPrompt: string;
    userPrompt: string;
    finalPrompt: string;
    useDocumentBlocks: boolean;
    evidenceDocuments?: EvidenceDocument[];
    tokenEstimateInput: number;
    tokenEstimateMethod: InputTokenEstimateMethod;
    tokenEstimateUncertainty: number;
    expectedPassCount: number;
    maxInputTokens: number;
    maxOutputTokens: number;
    effectiveInputCeiling: number;
    requestPerMinute: number;
    temperature: number;
    topP?: number;
    jsonStrict: boolean;
    thinkingBudgetTokens?: number;
    citationsEnabled?: boolean;
    retryPolicy: {
        maxAttempts: number;
        baseDelayMs: number;
        retryMalformedJson: boolean;
    };
    analysisPackaging: AnalysisPackaging;
    resolvedOverrides: AIOverrides;
    allowTelemetry: boolean;
    cacheKey: string;
}

export type AIRunEstimateResult =
    | { ok: true; estimate: AIRunPreparedEstimate }
    | { ok: false; result: AIRunResult };

export interface AIRunAdvancedContext {
    roleTemplateName: string;
    provider: AIProviderId;
    modelAlias: string;
    modelLabel: string;
    modelSelectionReason: string;
    availabilityStatus: 'visible' | 'not_visible' | 'unknown';
    maxInputTokens: number;
    maxOutputTokens: number;
    tokenEstimateMethod?: InputTokenEstimateMethod;
    tokenEstimateUncertainty?: number;
    analysisPackaging: AnalysisPackaging;
    executionPassCount?: number;
    packagingTriggerReason?: string;
    reuseState?: 'idle' | 'eligible' | 'warm';
    /** 0–1: fraction of total input in the cached stable prefix (only set when reuseState is warm). */
    cachedStableRatio?: number;
    /** Estimated token count of the cached stable portion. */
    cachedStableTokens?: number;
    /** Estimated total input tokens (same estimator as pressure bar fillRatio). */
    totalInputTokens?: number;
    /** Whether the Gemini cache was a hit (reuse) or freshly created. */
    cacheStatus?: 'hit' | 'created';
    /** OpenAI-only transport truth for runtime/log alignment. */
    openAiTransportLane?: 'chat_completions' | 'responses';
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
    /** OpenAI-only transport truth for runtime/log alignment. */
    aiTransportLane?: 'chat_completions' | 'responses';
    error?: string;
    retryCount?: number;
    sanitizationNotes?: string[];
    advancedContext?: AIRunAdvancedContext;
    /** Normalized source attribution from provider responses. */
    citations?: SourceCitation[];
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
