import type RadialTimelinePlugin from '../../main';
import type { RadialTimelineSettings } from '../../types';
import { computeCaps, INPUT_TOKEN_GUARD_FACTOR, type ComputedCaps } from '../caps/computeCaps';
import { mapErrorToUserMessage, mapProviderFailureToError, MalformedJsonError } from '../errors';
import { compilePrompt } from '../prompts/compilePrompt';
import { composeEnvelope, CACHE_BREAK_DELIMITER } from '../prompts/composeEnvelope';
import { buildOutputRulesText } from '../prompts/outputRules';
import { modelSupportsSystemRole } from '../../api/providerCapabilities';
import { ModelRegistry } from '../registry/modelRegistry';
import { findSnapshotModel, loadProviderSnapshot, type ProviderSnapshotLoadResult } from '../registry/providerSnapshot';
import { selectModel } from '../router/selectModel';
import { resolveActiveRoleTemplate } from '../roleTemplate';
import { buildDefaultAiSettings } from '../settings/aiSettings';
import { validateAiSettings } from '../settings/validateAiSettings';
import type {
    AIProvider,
    AIProviderId,
    AIRunEstimateResult,
    AIRunPreparedEstimate,
    AIRunRequest,
    AIRunResult,
    AIRunAdvancedContext,
    AiSettingsV1,
    Capability,
    ModelPolicy,
    ModelInfo,
    AccessTier,
    ProviderExecutionResult,
    RegistryRefreshResult
} from '../types';
import { buildProviders } from '../providers/provider';
import { peekGeminiCache } from '../../api/geminiCacheManager';
import { AICache } from './cache';
import { buildTelemetryEvent, emitTelemetry } from './aiTelemetry';
import { AIRateLimiter } from './rateLimit';
import { validateJsonResponse } from './jsonValidator';
import { estimateInputTokens, estimateUncertaintyTokens } from '../tokens/inputTokenEstimate';

const DEFAULT_REMOTE_REGISTRY_URL = 'https://raw.githubusercontent.com/ericrhystaylor/radial-timeline/main/scripts/models/registry.json';
const DEFAULT_REMOTE_PROVIDER_SNAPSHOT_URL = 'https://raw.githubusercontent.com/ericrhystaylor/radial-timeline/HEAD/scripts/models/latest-models.json';

interface PluginWithAiDebug extends RadialTimelinePlugin {
    _aiLastRunAdvancedByFeature?: Record<string, AIRunAdvancedContext>;
}

function getAiSettings(settings: RadialTimelineSettings): AiSettingsV1 {
    const validated = validateAiSettings(settings.aiSettings ?? buildDefaultAiSettings());
    return validated.value;
}

function resolveTier(settings: AiSettingsV1, provider: AIProviderId): AccessTier {
    if (provider === 'anthropic') return settings.aiAccessProfile.anthropicTier ?? 1;
    if (provider === 'openai') return settings.aiAccessProfile.openaiTier ?? 1;
    if (provider === 'google') return settings.aiAccessProfile.googleTier ?? 1;
    return 1;
}

function toProviderKey(feature: string, provider: AIProviderId): string {
    return `${feature}:${provider}`;
}

function estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.max(1, Math.ceil(text.length / 4));
}

function ensureJsonCapability(request: AIRunRequest): Capability[] {
    if (request.returnType !== 'json') return [...request.requiredCapabilities];
    if (request.requiredCapabilities.includes('jsonStrict')) return [...request.requiredCapabilities];
    return [...request.requiredCapabilities, 'jsonStrict'];
}

function mergePolicy(base: ModelPolicy, request: AIRunRequest): ModelPolicy {
    return request.policyOverride ?? base;
}

function hash(input: string): string {
    let h = 2166136261;
    for (let i = 0; i < input.length; i += 1) {
        h ^= input.charCodeAt(i);
        h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return (h >>> 0).toString(16);
}

function mergeOverrides(base: AiSettingsV1['overrides'], request: AIRunRequest): AiSettingsV1['overrides'] {
    return {
        ...base,
        ...(request.overrides || {})
    };
}

function buildCacheKey(params: {
    provider: string;
    modelAlias: string;
    returnType: string;
    feature: string;
    task: string;
    prompt: string;
}): string {
    return hash(`${params.provider}|${params.modelAlias}|${params.returnType}|${params.feature}|${params.task}|${params.prompt}`);
}

function getProjectContext(plugin: RadialTimelinePlugin, request: AIRunRequest): string {
    if (request.projectContext && request.projectContext.trim().length > 0) {
        return request.projectContext;
    }
    const activeBook = typeof plugin.getActiveBookTitle === 'function'
        ? plugin.getActiveBookTitle()
        : 'Unknown Book';
    return `Project: Radial Timeline\nBook: ${activeBook}\nFeature: ${request.feature}\nTask: ${request.task}`;
}

function getOutputRules(request: AIRunRequest): string {
    return buildOutputRulesText({
        outputRules: request.outputRules,
        returnType: request.returnType,
        responseSchema: request.responseSchema
    });
}

function setLastRunAdvanced(plugin: RadialTimelinePlugin, feature: string, context: AIRunAdvancedContext): void {
    const target = plugin as PluginWithAiDebug;
    if (!target._aiLastRunAdvancedByFeature) {
        target._aiLastRunAdvancedByFeature = {};
    }
    target._aiLastRunAdvancedByFeature[feature] = context;
}

function toSnapshotProvider(provider: AIProviderId): 'openai' | 'anthropic' | 'google' | null {
    if (provider === 'openai' || provider === 'anthropic' || provider === 'google') return provider;
    return null;
}

export class AIClient {
    private registry: ModelRegistry;
    private providers: Record<AIProviderId, AIProvider | null>;
    private cache = new AICache();
    private limiter = new AIRateLimiter();
    private registryReady = false;
    private providerSnapshot: ProviderSnapshotLoadResult = { source: 'none', snapshot: null };
    private providerSnapshotReady = false;

    constructor(private plugin: RadialTimelinePlugin) {
        this.providers = buildProviders(plugin);
        this.registry = new ModelRegistry({
            remoteRegistryUrl: DEFAULT_REMOTE_REGISTRY_URL,
            allowRemoteRegistry: true,
            readCache: async () => this.plugin.settings.aiRegistryCacheJson ?? null,
            writeCache: async (content: string) => {
                this.plugin.settings.aiRegistryCacheJson = content;
                await this.plugin.saveSettings();
            }
        });
    }

    async refreshRegistry(forceRemote?: boolean): Promise<RegistryRefreshResult> {
        this.registry = new ModelRegistry({
            remoteRegistryUrl: DEFAULT_REMOTE_REGISTRY_URL,
            allowRemoteRegistry: true,
            readCache: async () => this.plugin.settings.aiRegistryCacheJson ?? null,
            writeCache: async (content: string) => {
                this.plugin.settings.aiRegistryCacheJson = content;
                await this.plugin.saveSettings();
            }
        });
        const result = await this.registry.refresh();
        this.registryReady = true;
        return result;
    }

    async refreshProviderSnapshot(forceRemote?: boolean): Promise<ProviderSnapshotLoadResult> {
        this.providerSnapshot = await loadProviderSnapshot({
            enabled: true,
            forceRemote,
            url: DEFAULT_REMOTE_PROVIDER_SNAPSHOT_URL,
            readCache: async () => this.plugin.settings.aiProviderSnapshotCacheJson ?? null,
            writeCache: async (content: string) => {
                this.plugin.settings.aiProviderSnapshotCacheJson = content;
                await this.plugin.saveSettings();
            }
        });
        this.providerSnapshotReady = true;
        return this.providerSnapshot;
    }

    private parseCacheFetchedAt(raw: string | null | undefined): string | null {
        if (!raw) return null;
        try {
            const parsed = JSON.parse(raw) as { fetchedAt?: unknown };
            if (typeof parsed.fetchedAt !== 'string' || !parsed.fetchedAt.trim()) return null;
            const timestamp = Date.parse(parsed.fetchedAt);
            if (!Number.isFinite(timestamp)) return null;
            return new Date(timestamp).toISOString();
        } catch {
            return null;
        }
    }

    getLastModelUpdateAt(): string | null {
        const registryFetchedAt = this.parseCacheFetchedAt(this.plugin.settings.aiRegistryCacheJson ?? null);
        const snapshotFetchedAt = this.parseCacheFetchedAt(this.plugin.settings.aiProviderSnapshotCacheJson ?? null);
        const candidates = [registryFetchedAt, snapshotFetchedAt]
            .filter((value): value is string => !!value)
            .map(value => Date.parse(value))
            .filter(value => Number.isFinite(value));
        if (!candidates.length) return null;
        return new Date(Math.max(...candidates)).toISOString();
    }

    async updateModelData(forceRemote = true): Promise<{
        registry: RegistryRefreshResult;
        snapshot: ProviderSnapshotLoadResult;
        lastUpdatedAt: string | null;
    }> {
        const [registry, snapshot] = await Promise.all([
            this.refreshRegistry(forceRemote),
            this.refreshProviderSnapshot(forceRemote)
        ]);
        return {
            registry,
            snapshot,
            lastUpdatedAt: this.getLastModelUpdateAt()
        };
    }

    async refreshModelDataIfStale(maxAgeMs = 24 * 60 * 60 * 1000): Promise<boolean> {
        const lastUpdatedAt = this.getLastModelUpdateAt();
        const lastUpdateTs = lastUpdatedAt ? Date.parse(lastUpdatedAt) : Number.NaN;
        const isStale = !Number.isFinite(lastUpdateTs) || (Date.now() - lastUpdateTs) > maxAgeMs;
        if (!isStale) return false;
        try {
            await this.updateModelData(true);
        } catch {
            // Silent background refresh: offline or remote errors should not block UI.
        }
        return true;
    }

    async getRegistryModels(forceRemote?: boolean): Promise<ModelInfo[]> {
        if (!this.registryReady || forceRemote) {
            await this.refreshRegistry(forceRemote);
        }
        return this.registry.getAll();
    }

    async getProviderSnapshot(forceRemote?: boolean): Promise<ProviderSnapshotLoadResult> {
        if (!this.providerSnapshotReady || forceRemote) {
            return this.refreshProviderSnapshot(forceRemote);
        }
        return this.providerSnapshot;
    }

    async prepareRunEstimate(request: AIRunRequest): Promise<AIRunEstimateResult> {
        const aiSettings = getAiSettings(this.plugin.settings);
        if (!this.registryReady) {
            await this.refreshRegistry(false);
        }

        const featureProfile = aiSettings.featureProfiles?.[request.feature];
        const provider = request.providerOverride
            ?? featureProfile?.provider
            ?? aiSettings.provider;

        if (provider === 'none') {
            return {
                ok: false,
                result: {
                    content: null,
                    responseData: null,
                    provider,
                    modelRequested: 'none',
                    modelResolved: 'none',
                    aiStatus: 'unavailable',
                    warnings: ['AI provider is disabled.'],
                    reason: 'Provider is set to none.',
                    error: 'AI provider is disabled.'
                }
            };
        }

        const basePolicy = featureProfile?.modelPolicy ?? aiSettings.modelPolicy;
        const policy = mergePolicy(basePolicy, request);
        const requiredCapabilities = ensureJsonCapability(request);

        const compiledPrompt = request.promptTemplate
            ? compilePrompt(request.promptTemplate, request.vars || {})
            : {
                systemPrompt: request.systemPrompt,
                userPrompt: request.promptText || ''
            };
        const roleTemplate = resolveActiveRoleTemplate(this.plugin, aiSettings);
        const featureModeInstructions = (
            request.featureModeInstructions
            || compiledPrompt.systemPrompt
            || request.systemPrompt
            || ''
        ).trim();
        const useDocumentBlocks = provider === 'anthropic'
            && request.feature.toLowerCase().includes('inquiry')
            && (request.evidenceDocuments?.length ?? 0) > 0;

        const envelope = composeEnvelope({
            roleTemplateName: roleTemplate.name,
            roleTemplateText: roleTemplate.prompt,
            projectContext: getProjectContext(this.plugin, request),
            featureModeInstructions,
            userInput: useDocumentBlocks
                ? ''
                : (request.userInput ?? compiledPrompt.userPrompt ?? request.promptText ?? ''),
            userQuestion: request.userQuestion,
            outputRules: getOutputRules(request),
            placeUserQuestionLast: request.feature.toLowerCase().includes('inquiry'),
            cacheBreakDelimiter: (provider === 'anthropic' || provider === 'google')
                ? CACHE_BREAK_DELIMITER : undefined
        });
        const userPrompt = envelope.userPrompt || '';
        const systemPrompt = envelope.systemPrompt || '';
        const evidenceDocuments = useDocumentBlocks ? request.evidenceDocuments : undefined;

        const heuristicEstimate = Number.isFinite(request.tokenEstimateInput)
            ? Math.max(0, Math.floor(request.tokenEstimateInput as number))
            : estimateTokens(envelope.finalPrompt) + ((evidenceDocuments || []).reduce((sum, doc) => (
                sum + estimateTokens(doc.title || '') + estimateTokens(doc.content || '')
            ), 0));
        const initialSelection = selectModel(this.registry.getAll(), {
            provider,
            policy,
            requiredCapabilities,
            accessTier: resolveTier(aiSettings, provider),
            contextTokensNeeded: heuristicEstimate,
            outputTokensNeeded: 0
        });

        const overrides = mergeOverrides(aiSettings.overrides, request);
        const caps = computeCaps({
            provider,
            model: initialSelection.model,
            accessTier: resolveTier(aiSettings, provider),
            feature: request.feature,
            overrides
        });
        const effectiveInputCeiling = Math.floor(caps.maxInputTokens * INPUT_TOKEN_GUARD_FACTOR);

        const countedEstimate = Number.isFinite(request.tokenEstimateInput)
            ? {
                inputTokens: heuristicEstimate,
                method: 'heuristic_chars' as const
            }
            : await estimateInputTokens({
                plugin: this.plugin,
                provider,
                modelId: initialSelection.model.id,
                systemPrompt,
                userPrompt,
                evidenceDocuments,
                citationsEnabled: caps.citationsEnabled,
                safeInputBudget: effectiveInputCeiling
            });
        let tokenEstimateInput = countedEstimate.inputTokens;
        let tokenEstimateMethod = countedEstimate.method;
        const tokenEstimateUncertainty = estimateUncertaintyTokens(tokenEstimateMethod, effectiveInputCeiling);
        const expectedPassCount = effectiveInputCeiling > 0
            ? Math.max(1, Math.ceil(tokenEstimateInput / effectiveInputCeiling))
            : 1;

        const cacheKey = buildCacheKey({
            provider,
            modelAlias: initialSelection.model.alias,
            returnType: request.returnType,
            feature: request.feature,
            task: request.task,
            prompt: envelope.finalPrompt
        });

        return {
            ok: true,
            estimate: {
                provider,
                model: initialSelection.model,
                modelSelectionReason: initialSelection.reason,
                warnings: [...initialSelection.warnings],
                requiredCapabilities,
                roleTemplateName: roleTemplate.name,
                featureModeInstructions,
                systemPrompt,
                userPrompt,
                finalPrompt: envelope.finalPrompt,
                useDocumentBlocks,
                evidenceDocuments,
                tokenEstimateInput,
                tokenEstimateMethod,
                tokenEstimateUncertainty,
                expectedPassCount,
                maxInputTokens: caps.maxInputTokens,
                maxOutputTokens: caps.maxOutputTokens,
                effectiveInputCeiling,
                requestPerMinute: caps.requestPerMinute,
                temperature: caps.temperature,
                topP: overrides.topP,
                jsonStrict: overrides.jsonStrict ?? true,
                thinkingBudgetTokens: caps.thinkingBudgetTokens,
                citationsEnabled: caps.citationsEnabled,
                retryPolicy: caps.retryPolicy,
                analysisPackaging: aiSettings.analysisPackaging,
                resolvedOverrides: overrides,
                allowTelemetry: aiSettings.privacy.allowTelemetry,
                cacheKey
            }
        };
    }

    async run(request: AIRunRequest): Promise<AIRunResult> {
        const prepared = request.preparedEstimate
            ? { ok: true as const, estimate: request.preparedEstimate }
            : await this.prepareRunEstimate(request);
        if (!prepared.ok) {
            return prepared.result;
        }

        const estimate = prepared.estimate;
        const provider = estimate.provider;
        const modelSelection = {
            model: estimate.model,
            warnings: [...estimate.warnings],
            reason: estimate.modelSelectionReason
        };
        const tokenEstimateInput = estimate.tokenEstimateInput;
        const effectiveInputCeiling = estimate.effectiveInputCeiling;
        const caps: ComputedCaps = {
            maxInputTokens: estimate.maxInputTokens,
            maxOutputTokens: estimate.maxOutputTokens,
            safeChunkThreshold: 1,
            temperature: estimate.temperature,
            retryPolicy: estimate.retryPolicy,
            requestPerMinute: estimate.requestPerMinute,
            thinkingBudgetTokens: estimate.thinkingBudgetTokens,
            citationsEnabled: estimate.citationsEnabled
        };
        const systemPrompt = estimate.systemPrompt;
        const userPrompt = estimate.userPrompt;

        if (tokenEstimateInput > effectiveInputCeiling) {
            // Always expose the guard; Inquiry-specific chunking should happen in feature orchestration.
            const message = `Input token estimate ${tokenEstimateInput} exceeds safe threshold (${effectiveInputCeiling}).`;
            return {
                content: null,
                responseData: null,
                provider,
                modelRequested: modelSelection.model.id,
                modelResolved: modelSelection.model.id,
                modelAlias: modelSelection.model.alias,
                aiStatus: 'rejected',
                aiReason: 'truncated',
                warnings: [...modelSelection.warnings, message],
                reason: `${modelSelection.reason} Token guard rejected request before execution.`,
                error: message,
                advancedContext: {
                    roleTemplateName: estimate.roleTemplateName,
                    provider,
                    modelAlias: modelSelection.model.alias,
                    modelLabel: modelSelection.model.label,
                    modelSelectionReason: modelSelection.reason,
                    availabilityStatus: 'unknown',
                    maxInputTokens: estimate.maxInputTokens,
                    maxOutputTokens: estimate.maxOutputTokens,
                    analysisPackaging: estimate.analysisPackaging,
                    executionPassCount: 1,
                    totalInputTokens: tokenEstimateInput,
                    featureModeInstructions: estimate.featureModeInstructions,
                    finalPrompt: estimate.finalPrompt
                }
            };
        }

        const providerClient = this.providers[provider];
        if (!providerClient) {
            return {
                content: null,
                responseData: null,
                provider,
                modelRequested: modelSelection.model.id,
                modelResolved: modelSelection.model.id,
                modelAlias: modelSelection.model.alias,
                aiStatus: 'unavailable',
                warnings: [...modelSelection.warnings, `Provider client missing for ${provider}.`],
                reason: modelSelection.reason,
                error: `Provider client missing for ${provider}.`
            };
        }

        const cacheKey = estimate.cacheKey;
        const cached = this.cache.get<AIRunResult>(cacheKey);
        if (cached) {
            return {
                ...cached,
                warnings: [...cached.warnings, 'Served from in-memory cache.']
            };
        }

        await this.limiter.waitForSlot(toProviderKey(request.feature, provider), caps.requestPerMinute);

        const snapshotState = await this.getProviderSnapshot(false);
        const snapshotProvider = toSnapshotProvider(provider);
        const availableModel = snapshotProvider
            ? findSnapshotModel(snapshotState.snapshot, snapshotProvider, modelSelection.model.id)
            : null;
        const availabilityStatus: AIRunAdvancedContext['availabilityStatus'] = !snapshotProvider
            ? 'unknown'
            : !snapshotState.snapshot
            ? 'unknown'
            : (availableModel ? 'visible' : 'not_visible');

        // Truth-safe reuse state — warm only when provable
        const cacheDelimiterUsed = (provider === 'anthropic' || provider === 'google')
            && request.feature.toLowerCase().includes('inquiry');
        let reuseState: AIRunAdvancedContext['reuseState'] = 'idle';
        if (provider === 'anthropic') {
            // Anthropic: warm when delimiter used — cache_control blocks are definitely sent
            reuseState = cacheDelimiterUsed ? 'warm' : 'eligible';
        } else if (provider === 'google') {
            reuseState = cacheDelimiterUsed ? 'eligible' : 'idle';
        } else if (provider === 'openai' && systemPrompt
                   && modelSupportsSystemRole('openai', modelSelection.model.id)) {
            reuseState = 'eligible';
        }

        // Compute cached stable ratio from delimiter split.
        // Single stableText variable — reused for ratio estimation and optimistic peek.
        // Uses tokenEstimateInput (same estimator as pressure bar fillRatio) for visual consistency.
        let cachedStableRatio: number | undefined;
        let cachedStableTokens: number | undefined;
        let stableText: string | undefined;
        if (cacheDelimiterUsed) {
            const delimIndex = userPrompt.indexOf(CACHE_BREAK_DELIMITER);
            if (delimIndex > 0) {
                stableText = userPrompt.slice(0, delimIndex);
                // Anthropic: only user stable block is cached
                // Gemini: system instruction goes inside cached content too
                const stableTokens = provider === 'google'
                    ? estimateTokens(stableText) + estimateTokens(systemPrompt)
                    : estimateTokens(stableText);
                cachedStableTokens = stableTokens;
                cachedStableRatio = tokenEstimateInput > 0
                    ? Math.min(stableTokens / tokenEstimateInput, 1) : 0;
            }
        }

        // Optimistic warm: if the in-memory cache store already has a valid entry,
        // we know the upcoming execute will hit it. Set warm + ratio immediately
        // so the UI shows the hatched overlay from the start of the run.
        const optimisticWarm = provider === 'google' && cacheDelimiterUsed
            && stableText !== undefined && cachedStableRatio !== undefined
            && peekGeminiCache(modelSelection.model.id, systemPrompt, stableText);

        if (optimisticWarm) {
            reuseState = 'warm';
        }

        const advancedContext: AIRunAdvancedContext = {
            roleTemplateName: estimate.roleTemplateName,
            provider,
            modelAlias: modelSelection.model.alias,
            modelLabel: modelSelection.model.label,
            modelSelectionReason: modelSelection.reason,
            availabilityStatus,
            maxInputTokens: caps.maxInputTokens,
            maxOutputTokens: caps.maxOutputTokens,
            analysisPackaging: estimate.analysisPackaging,
            tokenEstimateMethod: estimate.tokenEstimateMethod,
            tokenEstimateUncertainty: estimate.tokenEstimateUncertainty,
            executionPassCount: 1,
            reuseState,
            // Anthropic: set immediately (cache_control blocks always sent)
            // Gemini optimistic: set when peek confirms cache exists
            cachedStableRatio: (provider === 'anthropic' && cacheDelimiterUsed) || optimisticWarm
                ? cachedStableRatio : undefined,
            cachedStableTokens: (provider === 'anthropic' && cacheDelimiterUsed) || optimisticWarm
                ? cachedStableTokens : undefined,
            totalInputTokens: tokenEstimateInput,
            featureModeInstructions: estimate.featureModeInstructions,
            finalPrompt: estimate.finalPrompt
        };
        setLastRunAdvanced(this.plugin, request.feature, advancedContext);

        const execution = await this.execute(providerClient, {
            modelId: modelSelection.model.id,
            systemPrompt,
            userPrompt,
            maxOutputTokens: caps.maxOutputTokens,
            temperature: caps.temperature,
            topP: estimate.topP,
            jsonSchema: request.responseSchema,
            jsonStrict: estimate.jsonStrict,
            thinkingBudgetTokens: caps.thinkingBudgetTokens,
            citationsEnabled: caps.citationsEnabled,
            evidenceDocuments: estimate.useDocumentBlocks ? estimate.evidenceDocuments : undefined
        }, request.returnType, caps);

        if (provider === 'openai' && execution.aiTransportLane) {
            advancedContext.openAiTransportLane = execution.aiTransportLane;
            setLastRunAdvanced(this.plugin, request.feature, advancedContext);
        }

        // Post-execute: confirm or downgrade Gemini reuseState
        if (provider === 'google' && cacheDelimiterUsed) {
            if (execution.cacheUsed) {
                // Confirmed — ensure warm + ratio are set (covers first-run case too)
                advancedContext.reuseState = 'warm';
                advancedContext.cachedStableRatio = cachedStableRatio;
                advancedContext.cachedStableTokens = cachedStableTokens;
                advancedContext.cacheStatus = execution.cacheStatus;
                setLastRunAdvanced(this.plugin, request.feature, advancedContext);
            } else if (optimisticWarm) {
                // Peek said yes but execute said no — downgrade
                advancedContext.reuseState = 'eligible';
                advancedContext.cachedStableRatio = undefined;
                advancedContext.cachedStableTokens = undefined;
                setLastRunAdvanced(this.plugin, request.feature, advancedContext);
            }
        }

        const warnings = [...modelSelection.warnings];
        if (execution.aiReason === 'truncated') {
            warnings.push('Provider indicated truncation risk.');
        }

        if (execution.aiStatus !== 'success' || !execution.content) {
            const mappedError = mapProviderFailureToError({
                provider,
                error: execution.error,
                aiStatus: execution.aiStatus,
                aiReason: execution.aiReason
            });
            return {
                content: execution.content,
                responseData: execution.responseData,
                provider,
                modelRequested: execution.aiModelRequested,
                modelResolved: execution.aiModelResolved,
                modelAlias: modelSelection.model.alias,
                aiStatus: execution.aiStatus,
                aiReason: execution.aiReason,
                warnings,
                reason: modelSelection.reason,
                requestPayload: execution.requestPayload,
                aiTransportLane: execution.aiTransportLane,
                error: mapErrorToUserMessage(mappedError),
                retryCount: execution.retryCount,
                sanitizationNotes: execution.sanitizationNotes,
                advancedContext,
                citations: execution.citations
            };
        }

        if (request.returnType === 'json') {
            const validation = validateJsonResponse(execution.content, request.responseSchema, provider);
            if (!validation.ok) {
                if (caps.retryPolicy.retryMalformedJson && caps.retryPolicy.maxAttempts > 0) {
                    const retry = await this.execute(providerClient, {
                        modelId: modelSelection.model.id,
                        systemPrompt,
                        userPrompt,
                        maxOutputTokens: caps.maxOutputTokens,
                        temperature: caps.temperature,
                        topP: estimate.topP,
                        jsonSchema: request.responseSchema,
                        jsonStrict: estimate.jsonStrict
                    }, request.returnType, caps);

                    if (retry.aiStatus === 'success' && retry.content) {
                        const retryValidation = validateJsonResponse(retry.content, request.responseSchema, provider);
                        if (retryValidation.ok) {
                            const result: AIRunResult = {
                                content: retry.content,
                                responseData: retry.responseData,
                                provider,
                                modelRequested: retry.aiModelRequested,
                                modelResolved: retry.aiModelResolved,
                                modelAlias: modelSelection.model.alias,
                                aiStatus: retry.aiStatus,
                                aiReason: retry.aiReason,
                                warnings: [...warnings, 'Initial JSON parse failed; retry succeeded.'],
                                reason: modelSelection.reason,
                                requestPayload: retry.requestPayload,
                                aiTransportLane: retry.aiTransportLane,
                                retryCount: (retry.retryCount ?? 0) + 1,
                                sanitizationNotes: retry.sanitizationNotes,
                                advancedContext,
                                citations: retry.citations
                            };
                            this.cache.set(cacheKey, result);
                            emitTelemetry(estimate.allowTelemetry, buildTelemetryEvent(request, result));
                            return result;
                        }
                    }
                }

                const parseError = validation.error ?? new MalformedJsonError('Invalid JSON response.', { provider });
                return {
                    content: execution.content,
                    responseData: execution.responseData,
                    provider,
                    modelRequested: execution.aiModelRequested,
                    modelResolved: execution.aiModelResolved,
                    modelAlias: modelSelection.model.alias,
                    aiStatus: 'rejected',
                    aiReason: 'invalid_response',
                    warnings: [...warnings, 'JSON validation failed.'],
                    reason: modelSelection.reason,
                    requestPayload: execution.requestPayload,
                    aiTransportLane: execution.aiTransportLane,
                    error: mapErrorToUserMessage(parseError),
                    retryCount: execution.retryCount,
                    sanitizationNotes: execution.sanitizationNotes,
                    advancedContext,
                    citations: execution.citations
                };
            }
        }

        const result: AIRunResult = {
            content: execution.content,
            responseData: execution.responseData,
            provider,
            modelRequested: execution.aiModelRequested,
            modelResolved: execution.aiModelResolved,
            modelAlias: modelSelection.model.alias,
            aiStatus: execution.aiStatus,
            aiReason: execution.aiReason,
            warnings,
            reason: modelSelection.reason,
            requestPayload: execution.requestPayload,
            aiTransportLane: execution.aiTransportLane,
            retryCount: execution.retryCount,
            sanitizationNotes: execution.sanitizationNotes,
            advancedContext,
            citations: execution.citations
        };

        this.cache.set(cacheKey, result);
        emitTelemetry(estimate.allowTelemetry, buildTelemetryEvent(request, result));
        return result;
    }

    private async execute(
        provider: AIProvider,
        params: {
            modelId: string;
            systemPrompt?: string | null;
            userPrompt: string;
            maxOutputTokens: number;
            temperature?: number;
            topP?: number;
            jsonSchema?: Record<string, unknown>;
            jsonStrict?: boolean;
            thinkingBudgetTokens?: number;
            citationsEnabled?: boolean;
            evidenceDocuments?: { title: string; content: string }[];
        },
        returnType: 'text' | 'json',
        _caps: ComputedCaps
    ): Promise<ProviderExecutionResult> {
        if (returnType === 'json') {
            return provider.generateJson({
                modelId: params.modelId,
                systemPrompt: params.systemPrompt ?? null,
                userPrompt: params.userPrompt,
                maxOutputTokens: params.maxOutputTokens,
                temperature: params.temperature,
                topP: params.topP,
                jsonSchema: params.jsonSchema || { type: 'object' },
                jsonStrict: params.jsonStrict,
                thinkingBudgetTokens: params.thinkingBudgetTokens,
                citationsEnabled: params.citationsEnabled,
                evidenceDocuments: params.evidenceDocuments
            });
        }

        return provider.generateText({
            modelId: params.modelId,
            systemPrompt: params.systemPrompt ?? null,
            userPrompt: params.userPrompt,
            maxOutputTokens: params.maxOutputTokens,
            temperature: params.temperature,
            topP: params.topP,
            thinkingBudgetTokens: params.thinkingBudgetTokens,
            citationsEnabled: params.citationsEnabled,
            evidenceDocuments: params.evidenceDocuments
        });
    }
}

export function getAIClient(plugin: RadialTimelinePlugin): AIClient {
    const anyPlugin = plugin as unknown as { _aiClient?: AIClient };
    if (!anyPlugin._aiClient) {
        anyPlugin._aiClient = new AIClient(plugin);
    }
    return anyPlugin._aiClient;
}

export function getLastAiAdvancedContext(
    plugin: RadialTimelinePlugin,
    feature: string
): AIRunAdvancedContext | null {
    const target = plugin as PluginWithAiDebug;
    return target._aiLastRunAdvancedByFeature?.[feature] ?? null;
}
