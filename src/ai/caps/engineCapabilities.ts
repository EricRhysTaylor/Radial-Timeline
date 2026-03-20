import {
    modelSupportsSystemRole,
    providerSupportsBatchApi,
    providerSupportsCitations,
    providerSupportsCorpusReuse,
    type AiProvider
} from '../../api/providerCapabilities';
import type {
    AIProviderId,
    Capability,
    EngineCapabilities,
    EngineCapabilitySignal,
    EngineCapabilityStatus,
    ModelInfo
} from '../types';

type EngineImplementationStatus = {
    /** Direct manuscript citation workflow (Inquiry evidence docs -> citations). */
    directManuscriptCitations: boolean;
    /** Grounded/tool attribution workflow (external-source metadata mapping). */
    groundedToolAttribution: boolean;
    corpusReuse: boolean;
    batchAnalysis: boolean;
};

/**
 * Product-level RT implementation status per provider for the normalized
 * recommendation capability layer.
 */
const RT_IMPLEMENTATION_STATUS: Record<Exclude<AIProviderId, 'none'>, EngineImplementationStatus> = {
    anthropic: {
        directManuscriptCitations: true,
        groundedToolAttribution: false,
        corpusReuse: true,
        batchAnalysis: false
    },
    openai: {
        directManuscriptCitations: false,
        groundedToolAttribution: true,
        corpusReuse: true,
        batchAnalysis: false
    },
    google: {
        directManuscriptCitations: false,
        groundedToolAttribution: true,
        corpusReuse: true,
        batchAnalysis: false
    },
    ollama: {
        directManuscriptCitations: false,
        groundedToolAttribution: false,
        corpusReuse: false,
        batchAnalysis: false
    }
};

const LONG_CONTEXT_CAPABILITY: Capability = 'longContext';

export interface EngineModelRef {
    provider: AIProviderId;
    modelId?: string;
    modelAlias?: string;
}

export interface EngineCapabilityMatrixRow {
    provider: AIProviderId;
    modelId: string;
    modelAlias: string;
    modelLabel: string;
    contextWindow: number;
    directManuscriptCitations: EngineCapabilityStatus;
    groundedToolAttribution: EngineCapabilityStatus;
    /** @deprecated Backward-compat alias of directManuscriptCitations. */
    sources: EngineCapabilityStatus;
    corpusReuse: EngineCapabilityStatus;
    largeContext: EngineCapabilityStatus;
    batchAnalysis: EngineCapabilityStatus;
}

function toLegacyProvider(provider: AIProviderId): AiProvider | null {
    if (provider === 'openai' || provider === 'anthropic') return provider;
    if (provider === 'google') return 'gemini';
    if (provider === 'ollama') return 'local';
    return null;
}

function toStatus(providerSupported: boolean, availableInRt: boolean): EngineCapabilityStatus {
    if (providerSupported && availableInRt) return 'available';
    if (providerSupported && !availableInRt) return 'provider_supported_not_used';
    return 'unavailable';
}

function buildSignal(providerSupported: boolean, availableInRt: boolean): EngineCapabilitySignal {
    return {
        status: toStatus(providerSupported, availableInRt),
        providerSupported,
        availableInRt
    };
}

function resolveImplementationStatus(provider: AIProviderId): EngineImplementationStatus {
    if (provider === 'none') {
        return {
            directManuscriptCitations: false,
            groundedToolAttribution: false,
            corpusReuse: false,
            batchAnalysis: false
        };
    }
    return RT_IMPLEMENTATION_STATUS[provider];
}

function providerSupportsGroundedToolAttribution(provider: AiProvider): boolean {
    return provider === 'openai' || provider === 'gemini';
}

function hasLongContext(model: ModelInfo): boolean {
    return model.capabilities.includes(LONG_CONTEXT_CAPABILITY);
}

function resolveStructuredOutputStrength(model: ModelInfo): EngineCapabilities['structuredOutputStrength'] {
    if (model.capabilities.includes('jsonStrict') && model.capabilities.includes('functionCalling')) {
        return 'strong';
    }
    if (model.capabilities.includes('jsonStrict')) return 'basic';
    return 'limited';
}

function resolveReasoningSupport(model: ModelInfo): EngineCapabilities['reasoningSupport'] {
    if (model.capabilities.includes('reasoningStrong')) return 'strong';
    if (model.capabilities.includes('longContext')) return 'standard';
    return 'limited';
}

function resolveCorpusReuseAvailableInRt(
    model: ModelInfo,
    provider: AiProvider,
    implementationStatus: EngineImplementationStatus
): boolean {
    if (!implementationStatus.corpusReuse) return false;
    if (provider !== 'openai') return true;
    return modelSupportsSystemRole('openai', model.id);
}

export function resolveEngineCapabilities(model: ModelInfo): EngineCapabilities {
    const legacyProvider = toLegacyProvider(model.provider);
    const implementationStatus = resolveImplementationStatus(model.provider);

    const supportsDirectManuscriptCitations = legacyProvider
        ? providerSupportsCitations(legacyProvider)
        : false;
    const directManuscriptCitationsAvailableInRt = supportsDirectManuscriptCitations
        && implementationStatus.directManuscriptCitations;

    const supportsGroundedToolAttribution = legacyProvider
        ? providerSupportsGroundedToolAttribution(legacyProvider)
        : false;
    const groundedToolAttributionAvailableInRt = supportsGroundedToolAttribution
        && implementationStatus.groundedToolAttribution;

    const supportsCorpusReuse = legacyProvider ? providerSupportsCorpusReuse(legacyProvider) : false;
    const corpusReuseAvailableInRt = legacyProvider
        ? supportsCorpusReuse && resolveCorpusReuseAvailableInRt(model, legacyProvider, implementationStatus)
        : false;

    const supportsBatch = legacyProvider ? providerSupportsBatchApi(legacyProvider) : false;
    const batchAvailableInRt = supportsBatch && implementationStatus.batchAnalysis;

    const supportsLargeContext = hasLongContext(model) && model.contextWindow > 0;
    const directManuscriptCitationsSignal = buildSignal(
        supportsDirectManuscriptCitations,
        directManuscriptCitationsAvailableInRt
    );
    const groundedToolAttributionSignal = buildSignal(
        supportsGroundedToolAttribution,
        groundedToolAttributionAvailableInRt
    );

    return {
        provider: model.provider,
        modelId: model.id,
        modelAlias: model.alias,
        modelLabel: model.label,
        directManuscriptCitations: directManuscriptCitationsSignal,
        groundedToolAttribution: groundedToolAttributionSignal,
        // Backward compat for callers not migrated yet.
        sources: directManuscriptCitationsSignal,
        corpusReuse: buildSignal(supportsCorpusReuse, corpusReuseAvailableInRt),
        largeContext: {
            ...buildSignal(supportsLargeContext, supportsLargeContext),
            contextWindow: model.contextWindow
        },
        batchAnalysis: buildSignal(supportsBatch, batchAvailableInRt),
        structuredOutputStrength: resolveStructuredOutputStrength(model),
        reasoningSupport: resolveReasoningSupport(model)
    };
}

export function resolveEngineCapabilitiesForRef(
    models: ModelInfo[],
    ref: EngineModelRef
): EngineCapabilities | null {
    const model = models.find(entry => {
        if (entry.provider !== ref.provider) return false;
        if (ref.modelId && entry.id === ref.modelId) return true;
        if (ref.modelAlias && entry.alias === ref.modelAlias) return true;
        return false;
    });
    return model ? resolveEngineCapabilities(model) : null;
}

export function buildEngineCapabilityMatrix(models: ModelInfo[]): EngineCapabilityMatrixRow[] {
    return models.map(model => {
        const resolved = resolveEngineCapabilities(model);
        return {
            provider: resolved.provider,
            modelId: resolved.modelId,
            modelAlias: resolved.modelAlias,
            modelLabel: resolved.modelLabel,
            contextWindow: resolved.largeContext.contextWindow,
            directManuscriptCitations: resolved.directManuscriptCitations.status,
            groundedToolAttribution: resolved.groundedToolAttribution.status,
            sources: resolved.sources.status,
            corpusReuse: resolved.corpusReuse.status,
            largeContext: resolved.largeContext.status,
            batchAnalysis: resolved.batchAnalysis.status
        };
    });
}
