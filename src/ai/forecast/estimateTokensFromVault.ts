import type { MetadataCache, TFile, Vault } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import type { InquiryClassConfig, InquiryMaterialMode, InquirySourcesSettings } from '../../types/settings';
import { normalizeFrontmatterKeys } from '../../utils/frontmatter';
import { normalizeScanRootPatterns, resolveScanRoots, toVaultRoot } from '../../inquiry/utils/scanRoots';
import { cleanEvidenceBody } from '../../inquiry/utils/evidenceCleaning';
import { isPathIncludedByInquiryBooks, resolveInquiryBookResolution } from '../../inquiry/services/bookResolution';
import { getSortedSceneFiles } from '../../utils/manuscript';
import { buildGossamerEvidenceDocument } from '../../gossamer/evidence/buildGossamerEvidence';
import type { InquiryScope } from '../../inquiry/state';
import type { TokenEstimateMethod } from '../tokens/inputTokenEstimate';
import { getAIClient } from '../runtime/aiClient';
import { mapLegacyProviderToAiProvider } from '../settings/aiSettings';

export const FORECAST_CHARS_PER_TOKEN = 4;
export const FORECAST_PROMPT_OVERHEAD_TOKENS = 250;

type InquiryEvidenceMode = 'none' | 'summary' | 'full' | 'mixed';

type InquiryEvidenceBlock = {
    mode: 'summary' | 'full';
    label: string;
    content: string;
};

export interface InquiryTokenEstimate {
    estimatedInputTokens: number;
    evidenceChars: number;
    blockCount: number;
    evidenceMode: InquiryEvidenceMode;
    evidenceLabel: string;
    selectionLabel: string;
    estimationMethod: TokenEstimateMethod;
}

export interface GossamerTokenEstimate {
    estimatedInputTokens: number;
    evidenceChars: number;
    sceneCount: number;
    includedSceneCount: number;
}

const SYNOPSIS_CAPABLE_CLASSES = new Set(['scene', 'outline']);

const extractSummary = (frontmatter: Record<string, unknown>): string => {
    const raw = frontmatter['Summary'];
    if (Array.isArray(raw)) return raw.map(value => String(value)).join('\n').trim();
    if (typeof raw === 'string') return raw.trim();
    if (raw === null || raw === undefined) return '';
    return String(raw).trim();
};

const extractClassValues = (frontmatter: Record<string, unknown>): string[] => {
    const rawClass = frontmatter['Class'];
    const values = Array.isArray(rawClass) ? rawClass : rawClass ? [rawClass] : [];
    return values
        .map(value => (typeof value === 'string' ? value : String(value)).trim().toLowerCase())
        .filter(Boolean);
};

const getClassScopeConfig = (raw?: string[]): { allowAll: boolean; allowed: Set<string> } => {
    const list = (raw || []).map(entry => entry.trim().toLowerCase()).filter(Boolean);
    const allowAll = list.includes('/');
    const allowed = new Set(list.filter(entry => entry !== '/'));
    return { allowAll, allowed };
};

const normalizeMode = (mode?: InquiryMaterialMode, className?: string): InquiryMaterialMode => {
    if (mode === 'full') return 'full';
    if (mode === 'summary') return SYNOPSIS_CAPABLE_CLASSES.has((className || '').toLowerCase()) ? 'summary' : 'full';
    return 'none';
};

const normalizeInquiryClasses = (classes?: InquiryClassConfig[]): InquiryClassConfig[] =>
    (classes || []).map(config => ({
        className: config.className.toLowerCase(),
        enabled: !!config.enabled,
        bookScope: normalizeMode(config.bookScope, config.className),
        sagaScope: normalizeMode(config.sagaScope, config.className),
        referenceScope: normalizeMode(config.referenceScope, config.className)
    }));

const estimateTokensFromChars = (chars: number, promptOverheadTokens = FORECAST_PROMPT_OVERHEAD_TOKENS): number => {
    if (!Number.isFinite(chars) || chars <= 0) return 0;
    return Math.ceil(chars / FORECAST_CHARS_PER_TOKEN) + promptOverheadTokens;
};

const formatInquiryEvidenceLabel = (mode: InquiryEvidenceMode): string => {
    if (mode === 'summary') return 'Summaries';
    if (mode === 'full') return 'Bodies';
    if (mode === 'mixed') return 'Mixed';
    return 'None';
};

const resolveInquiryModeForClass = (
    className: string,
    config: InquiryClassConfig,
    scope: InquiryScope,
    frontmatter: Record<string, unknown>
): InquiryMaterialMode => {
    if (className === 'outline') {
        const scopeValue = typeof frontmatter['Scope'] === 'string'
            ? frontmatter['Scope'].trim().toLowerCase()
            : '';
        const outlineScope: InquiryScope = scopeValue === 'saga' ? 'saga' : 'book';
        return outlineScope === 'saga' ? config.sagaScope : config.bookScope;
    }

    if (SYNOPSIS_CAPABLE_CLASSES.has(className)) {
        return scope === 'saga' ? config.sagaScope : config.bookScope;
    }

    return config.referenceScope;
};

const getNormalizedFrontmatter = (
    metadataCache: MetadataCache,
    file: TFile,
    frontmatterMappings?: Record<string, string>
): Record<string, unknown> => {
    const cache = metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter as Record<string, unknown> | undefined;
    if (!frontmatter) return {};
    return normalizeFrontmatterKeys(frontmatter, frontmatterMappings);
};

const selectInquiryFiles = (
    vault: Vault,
    metadataCache: MetadataCache,
    inquirySources?: InquirySourcesSettings,
    frontmatterMappings?: Record<string, string>,
    scopeFilter?: { scope: InquiryScope; focusBookId?: string }
): { files: TFile[]; selectionLabel: string; resolvedFocusBookId?: string } => {
    const scanRoots = normalizeScanRootPatterns(inquirySources?.scanRoots);
    if (!scanRoots.length) {
        return { files: [], selectionLabel: 'No scan roots configured' };
    }

    const resolvedRoots = (inquirySources?.resolvedScanRoots && inquirySources.resolvedScanRoots.length)
        ? inquirySources.resolvedScanRoots
        : resolveScanRoots(scanRoots, vault).resolvedRoots;
    const vaultRoots = resolvedRoots.map(toVaultRoot);
    const bookResolution = resolveInquiryBookResolution({
        vault,
        metadataCache,
        resolvedVaultRoots: vaultRoots,
        frontmatterMappings,
        bookInclusion: inquirySources?.bookInclusion
    });

    let allFiles = vault.getMarkdownFiles().filter(file =>
        vaultRoots.some(root => !root || file.path === root || file.path.startsWith(`${root}/`))
        && isPathIncludedByInquiryBooks(file.path, bookResolution.candidates)
    );

    // When scope is 'book', restrict files to a single focused book.
    // Mirrors the filtering applied by buildEvidenceBlocks in InquiryRunnerService.
    let resolvedFocusBookId: string | undefined;
    if (scopeFilter?.scope === 'book') {
        const includedBooks = bookResolution.candidates
            .filter(candidate => candidate.included)
            .sort((a, b) => {
                const numA = a.bookNumber ?? Number.POSITIVE_INFINITY;
                const numB = b.bookNumber ?? Number.POSITIVE_INFINITY;
                if (numA !== numB) return numA - numB;
                return a.rootPath.localeCompare(b.rootPath);
            });
        resolvedFocusBookId = scopeFilter.focusBookId
            && includedBooks.some(book => book.rootPath === scopeFilter.focusBookId)
            ? scopeFilter.focusBookId
            : includedBooks[0]?.rootPath;

        if (resolvedFocusBookId) {
            allFiles = allFiles.filter(file =>
                file.path === resolvedFocusBookId || file.path.startsWith(`${resolvedFocusBookId}/`)
            );
        }
    }

    const selectionLabel = resolvedRoots.length
        ? `${resolvedRoots.length} scan root${resolvedRoots.length === 1 ? '' : 's'}`
        : 'No resolved scan roots';
    return { files: allFiles, selectionLabel, resolvedFocusBookId };
};

export async function estimateInquiryTokens(params: {
    plugin?: RadialTimelinePlugin;
    provider?: 'openai' | 'anthropic' | 'google' | 'ollama' | 'none' | 'gemini' | 'local';
    modelId?: string;
    questionText?: string;
    vault: Vault;
    metadataCache: MetadataCache;
    inquirySources?: InquirySourcesSettings;
    frontmatterMappings?: Record<string, string>;
    scopeContext?: { scope?: InquiryScope; focusBookId?: string; label?: string };
    promptOverheadTokens?: number;
}): Promise<InquiryTokenEstimate> {
    const scope: InquiryScope = params.scopeContext?.scope === 'saga' ? 'saga' : 'book';
    const classes = normalizeInquiryClasses(params.inquirySources?.classes);
    const classConfigMap = new Map(classes.map(config => [config.className, config]));
    const classScope = getClassScopeConfig(params.inquirySources?.classScope);
    const selected = selectInquiryFiles(
        params.vault,
        params.metadataCache,
        params.inquirySources,
        params.frontmatterMappings,
        { scope, focusBookId: params.scopeContext?.focusBookId }
    );
    const blocks: InquiryEvidenceBlock[] = [];

    if (!classScope.allowAll && classScope.allowed.size === 0) {
        return {
            estimatedInputTokens: 0,
            evidenceChars: 0,
            blockCount: 0,
            evidenceMode: 'none',
            evidenceLabel: 'None',
            estimationMethod: 'heuristic_chars',
            selectionLabel: params.scopeContext?.label
                ? `${params.scopeContext.label} (${selected.selectionLabel})`
                : selected.selectionLabel
        };
    }

    for (const file of selected.files) {
        const frontmatter = getNormalizedFrontmatter(params.metadataCache, file, params.frontmatterMappings);
        const classValues = extractClassValues(frontmatter);
        if (!classValues.length) continue;

        for (const className of classValues) {
            if (!classScope.allowAll && !classScope.allowed.has(className)) continue;
            const config = classConfigMap.get(className);
            if (!config || !config.enabled) continue;

            // Book scope excludes saga outlines — mirrors buildEvidenceBlocks filtering.
            if (scope === 'book' && className === 'outline') {
                const outlineScopeValue = typeof frontmatter['Scope'] === 'string'
                    ? frontmatter['Scope'].trim().toLowerCase()
                    : '';
                if (outlineScopeValue === 'saga') continue;
            }

            const mode = resolveInquiryModeForClass(className, config, scope, frontmatter);
            const normalizedMode = normalizeMode(mode, className);
            if (normalizedMode === 'none') continue;

            if (normalizedMode === 'summary') {
                const summary = extractSummary(frontmatter);
                if (!summary) continue;
                blocks.push({
                    mode: 'summary',
                    label: `${className}: ${file.path}`,
                    content: summary
                });
                continue;
            }

            const raw = await params.vault.read(file);
            const cleanedBody = cleanEvidenceBody(raw);
            if (!cleanedBody) continue;
            blocks.push({
                mode: 'full',
                label: `${className}: ${file.path}`,
                content: cleanedBody
            });
        }
    }

    const modeSet = new Set(blocks.map(block => block.mode));
    const evidenceMode: InquiryEvidenceMode = modeSet.size === 0
        ? 'none'
        : modeSet.size === 2
            ? 'mixed'
            : modeSet.has('summary')
                ? 'summary'
                : 'full';
    const evidenceChars = blocks.reduce((sum, block) => sum + block.label.length + block.content.length + 6, 0);
    const heuristicEstimate = estimateTokensFromChars(evidenceChars, params.promptOverheadTokens);
    const evidenceText = blocks.map(block => `## ${block.label}\n${block.content}`).join('\n\n');
    const questionText = params.questionText || 'Analyze the corpus and return findings.';
    const systemPrompt = 'You are an editorial analysis engine.';
    const userPrompt = [
        questionText,
        '',
        'Evidence:',
        evidenceText
    ].join('\n');
    let estimatedInputTokens = heuristicEstimate;
    let estimationMethod: TokenEstimateMethod = 'heuristic_chars';
    if (params.plugin && params.provider && params.modelId) {
        try {
            const prepared = await getAIClient(params.plugin).prepareRunEstimate({
                feature: 'InquiryMode',
                task: 'SettingsForecastInquiry',
                requiredCapabilities: ['longContext', 'jsonStrict', 'reasoningStrong', 'highOutputCap'],
                featureModeInstructions: systemPrompt,
                userInput: userPrompt,
                promptText: userPrompt,
                userQuestion: questionText,
                systemPrompt: null,
                returnType: 'json',
                responseSchema: { type: 'object' },
                providerOverride: mapLegacyProviderToAiProvider(params.provider),
                evidenceDocuments: blocks.map(block => ({
                    title: block.label,
                    content: block.content
                }))
            });
            if (prepared.ok) {
                estimatedInputTokens = prepared.estimate.tokenEstimateInput;
                estimationMethod = prepared.estimate.tokenEstimateMethod;
            }
        } catch {
            // Keep heuristic fallback for forecast mode when preparation fails.
        }
    }
    const scopePrefix = params.scopeContext?.label ? `${params.scopeContext.label} — ` : '';

    return {
        estimatedInputTokens,
        evidenceChars,
        blockCount: blocks.length,
        evidenceMode,
        evidenceLabel: formatInquiryEvidenceLabel(evidenceMode),
        estimationMethod,
        selectionLabel: `${scopePrefix}${selected.selectionLabel}`
    };
}

/**
 * Estimate Gossamer input tokens from scene bodies.
 * Always reads full scene body content — no summary mode.
 */
export async function estimateGossamerTokens(params: {
    plugin: RadialTimelinePlugin;
    vault: Vault;
    metadataCache: MetadataCache;
    frontmatterMappings?: Record<string, string>;
    promptOverheadTokens?: number;
}): Promise<GossamerTokenEstimate> {
    const { files: sceneFiles } = await getSortedSceneFiles(params.plugin);
    const evidence = await buildGossamerEvidenceDocument({
        sceneFiles,
        vault: params.vault,
        metadataCache: params.metadataCache,
        frontmatterMappings: params.frontmatterMappings
    });
    const evidenceChars = evidence.includedScenes > 0 ? evidence.text.length : 0;
    const estimatedInputTokens = estimateTokensFromChars(evidenceChars, params.promptOverheadTokens);

    return {
        estimatedInputTokens,
        evidenceChars,
        sceneCount: evidence.totalScenes,
        includedSceneCount: evidence.includedScenes
    };
}
