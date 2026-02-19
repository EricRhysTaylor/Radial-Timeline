import type RadialTimelinePlugin from '../../main';
import type { RadialTimelineSettings } from '../../types';
import { computeCaps, type ComputedCaps } from '../caps/computeCaps';
import { mapErrorToUserMessage, mapProviderFailureToError, MalformedJsonError } from '../errors';
import { compilePrompt } from '../prompts/compilePrompt';
import { composeEnvelope } from '../prompts/composeEnvelope';
import { ModelRegistry } from '../registry/modelRegistry';
import { findSnapshotModel, loadProviderSnapshot, type ProviderSnapshotLoadResult } from '../registry/providerSnapshot';
import { selectModel } from '../router/selectModel';
import { buildDefaultAiSettings } from '../settings/aiSettings';
import { validateAiSettings } from '../settings/validateAiSettings';
import type {
    AIProvider,
    AIProviderId,
    AIRunRequest,
    AIRunResult,
    AIRunAdvancedContext,
    AiSettingsV1,
    Capability,
    ModelPolicy,
    ModelInfo,
    ProviderExecutionResult
} from '../types';
import { buildProviders } from '../providers/provider';
import { AICache } from './cache';
import { buildTelemetryEvent, emitTelemetry } from './aiTelemetry';
import { AIRateLimiter } from './rateLimit';
import { validateJsonResponse } from './jsonValidator';

const DEFAULT_REMOTE_REGISTRY_URL = 'https://raw.githubusercontent.com/ericrhystaylor/radial-timeline/main/scripts/models/registry.json';
const DEFAULT_REMOTE_PROVIDER_SNAPSHOT_URL = 'https://raw.githubusercontent.com/ericrhystaylor/radial-timeline/main/scripts/models/latest-models.json';

type RoleTemplate = {
    id: string;
    name: string;
    prompt: string;
};

interface PluginWithAiDebug extends RadialTimelinePlugin {
    _aiLastRunAdvancedByFeature?: Record<string, AIRunAdvancedContext>;
}

function getAiSettings(settings: RadialTimelineSettings): AiSettingsV1 {
    const validated = validateAiSettings(settings.aiSettings ?? buildDefaultAiSettings());
    return validated.value;
}

function resolveTier(settings: AiSettingsV1, provider: AIProviderId): 1 | 2 | 3 {
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
    if (request.profileOverride) {
        return {
            type: 'profile',
            profile: request.profileOverride
        };
    }
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

function getRoleTemplate(plugin: RadialTimelinePlugin, aiSettings: AiSettingsV1): RoleTemplate {
    const templates = plugin.settings.aiContextTemplates || [];
    const preferredId = (aiSettings.roleTemplateId || plugin.settings.activeAiContextTemplateId || '').trim();
    const selected = templates.find(entry => entry.id === preferredId) || templates[0];
    if (selected) {
        return {
            id: selected.id,
            name: selected.name || selected.id || 'Role Template',
            prompt: selected.prompt || 'You are an editorial analysis assistant.'
        };
    }
    return {
        id: 'default',
        name: 'Default Role Template',
        prompt: 'You are an editorial analysis assistant.'
    };
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
    if (request.outputRules && request.outputRules.trim().length > 0) {
        return request.outputRules;
    }
    if (request.returnType === 'json') {
        const schemaText = request.responseSchema
            ? JSON.stringify(request.responseSchema, null, 2)
            : '{}';
        return `Return JSON only. Validate against this schema:\n${schemaText}`;
    }
    return 'Return plain text only.';
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
            allowRemoteRegistry: false,
            readCache: async () => this.plugin.settings.aiRegistryCacheJson ?? null,
            writeCache: async (content: string) => {
                this.plugin.settings.aiRegistryCacheJson = content;
                await this.plugin.saveSettings();
            }
        });
    }

    async refreshRegistry(forceRemote?: boolean): Promise<void> {
        const settings = getAiSettings(this.plugin.settings);
        this.registry = new ModelRegistry({
            remoteRegistryUrl: DEFAULT_REMOTE_REGISTRY_URL,
            allowRemoteRegistry: forceRemote ?? settings.privacy.allowRemoteRegistry,
            readCache: async () => this.plugin.settings.aiRegistryCacheJson ?? null,
            writeCache: async (content: string) => {
                this.plugin.settings.aiRegistryCacheJson = content;
                await this.plugin.saveSettings();
            }
        });
        await this.registry.refresh();
        this.registryReady = true;
    }

    async refreshProviderSnapshot(forceRemote?: boolean): Promise<ProviderSnapshotLoadResult> {
        const settings = getAiSettings(this.plugin.settings);
        this.providerSnapshot = await loadProviderSnapshot({
            enabled: forceRemote ?? settings.privacy.allowProviderSnapshot,
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

    async run(request: AIRunRequest): Promise<AIRunResult> {
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
                content: null,
                responseData: null,
                provider,
                modelRequested: 'none',
                modelResolved: 'none',
                aiStatus: 'unavailable',
                warnings: ['AI provider is disabled.'],
                reason: 'Provider is set to none.',
                error: 'AI provider is disabled.'
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
        const roleTemplate = getRoleTemplate(this.plugin, aiSettings);
        const featureModeInstructions = (
            request.featureModeInstructions
            || compiledPrompt.systemPrompt
            || request.systemPrompt
            || ''
        ).trim();
        const envelope = composeEnvelope({
            roleTemplateName: roleTemplate.name,
            roleTemplateText: roleTemplate.prompt,
            projectContext: getProjectContext(this.plugin, request),
            featureModeInstructions,
            userInput: request.userInput ?? compiledPrompt.userPrompt ?? request.promptText ?? '',
            userQuestion: request.userQuestion,
            outputRules: getOutputRules(request),
            placeUserQuestionLast: request.feature.toLowerCase().includes('inquiry')
        });
        const userPrompt = envelope.userPrompt || '';
        const systemPrompt = envelope.systemPrompt || '';

        const tokenEstimateInput = request.tokenEstimateInput ?? estimateTokens(envelope.finalPrompt);
        const modelSelection = selectModel(this.registry.getAll(), {
            provider,
            policy,
            requiredCapabilities,
            accessTier: resolveTier(aiSettings, provider),
            contextTokensNeeded: tokenEstimateInput,
            outputTokensNeeded: 0
        });

        const overrides = mergeOverrides(aiSettings.overrides, request);
        const caps = computeCaps({
            provider,
            model: modelSelection.model,
            accessTier: resolveTier(aiSettings, provider),
            feature: request.feature,
            overrides
        });

        if (tokenEstimateInput > Math.floor(caps.maxInputTokens * 0.8)) {
            // Always expose the guard; Inquiry-specific chunking should happen in feature orchestration.
            const message = `Input token estimate ${tokenEstimateInput} exceeds safe threshold (${Math.floor(caps.maxInputTokens * 0.8)}).`;
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
                error: message
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

        const cacheKey = buildCacheKey({
            provider,
            modelAlias: modelSelection.model.alias,
            returnType: request.returnType,
            feature: request.feature,
            task: request.task,
            prompt: envelope.finalPrompt
        });
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

        const advancedContext: AIRunAdvancedContext = {
            roleTemplateName: roleTemplate.name,
            provider,
            modelAlias: modelSelection.model.alias,
            modelLabel: modelSelection.model.label,
            modelSelectionReason: modelSelection.reason,
            availabilityStatus,
            maxInputTokens: caps.maxInputTokens,
            maxOutputTokens: caps.maxOutputTokens,
            featureModeInstructions,
            finalPrompt: envelope.finalPrompt
        };
        setLastRunAdvanced(this.plugin, request.feature, advancedContext);

        const execution = await this.execute(providerClient, {
            modelId: modelSelection.model.id,
            systemPrompt,
            userPrompt,
            maxOutputTokens: caps.maxOutputTokens,
            temperature: caps.temperature,
            topP: overrides.topP,
            jsonSchema: request.responseSchema,
            jsonStrict: overrides.jsonStrict ?? true
        }, request.returnType, caps);

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
                error: mapErrorToUserMessage(mappedError),
                retryCount: execution.retryCount,
                sanitizationNotes: execution.sanitizationNotes,
                advancedContext
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
                        topP: overrides.topP,
                        jsonSchema: request.responseSchema,
                        jsonStrict: overrides.jsonStrict ?? true
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
                                retryCount: (retry.retryCount ?? 0) + 1,
                                sanitizationNotes: retry.sanitizationNotes,
                                advancedContext
                            };
                            this.cache.set(cacheKey, result);
                            emitTelemetry(aiSettings.privacy.allowTelemetry, buildTelemetryEvent(request, result));
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
                    error: mapErrorToUserMessage(parseError),
                    retryCount: execution.retryCount,
                    sanitizationNotes: execution.sanitizationNotes,
                    advancedContext
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
            retryCount: execution.retryCount,
            sanitizationNotes: execution.sanitizationNotes,
            advancedContext
        };

        this.cache.set(cacheKey, result);
        emitTelemetry(aiSettings.privacy.allowTelemetry, buildTelemetryEvent(request, result));
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
                jsonStrict: params.jsonStrict
            });
        }

        return provider.generateText({
            modelId: params.modelId,
            systemPrompt: params.systemPrompt ?? null,
            userPrompt: params.userPrompt,
            maxOutputTokens: params.maxOutputTokens,
            temperature: params.temperature,
            topP: params.topP
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
