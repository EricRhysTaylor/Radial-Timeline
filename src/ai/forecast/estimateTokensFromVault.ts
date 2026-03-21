import type { MetadataCache, TFile, Vault } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import type { BookProfile, InquiryClassConfig, InquirySourcesSettings, SceneInclusion } from '../../types/settings';
import { normalizeFrontmatterKeys } from '../../utils/frontmatter';
import { normalizeScanRootPatterns, resolveScanRoots, toVaultRoot } from '../../inquiry/utils/scanRoots';
import { cleanEvidenceBody } from '../../inquiry/utils/evidenceCleaning';
import { isPathIncludedByInquiryBooks, resolveInquiryBookResolution } from '../../inquiry/services/bookResolution';
import { InquiryCorpusResolver } from '../../inquiry/services/InquiryCorpusResolver';
import { hashString } from '../../inquiry/services/InquiryCorpusService';
import { buildInquiryEstimateTrace } from '../../inquiry/services/inquiryEstimateTrace';
import { InquiryRunnerService } from '../../inquiry/runner/InquiryRunnerService';
import type { CorpusManifest, CorpusManifestEntry } from '../../inquiry/runner/types';
import { INQUIRY_SCHEMA_VERSION } from '../../inquiry/constants';
import { getSortedSceneFiles } from '../../utils/manuscript';
import { buildGossamerEvidenceDocument } from '../../gossamer/evidence/buildGossamerEvidence';
import type { InquiryScope } from '../../inquiry/state';
import type { TokenEstimateMethod } from '../tokens/inputTokenEstimate';
import type { RTCorpusTokenEstimate } from '../types';
import { logCountingForensics } from '../diagnostics/countingForensics';
import { readSceneId } from '../../utils/sceneIds';

export const FORECAST_CHARS_PER_TOKEN = 4;
export const FORECAST_PROMPT_OVERHEAD_TOKENS = 250;

type InquiryEvidenceMode = 'excluded' | 'summary' | 'full' | 'mixed';

type InquiryEvidenceBlock = {
    mode: 'summary' | 'full';
    label: string;
    content: string;
};

type CanonicalExecutionEstimateParams = {
    plugin: RadialTimelinePlugin;
    provider: 'openai' | 'anthropic' | 'google' | 'ollama' | 'none' | 'gemini' | 'local';
    modelId: string;
    questionText: string;
    scope: InquiryScope;
    activeBookId?: string;
    scopeLabel: string;
    manifestEntries: CorpusManifestEntry[];
    vault: Vault;
    metadataCache: MetadataCache;
    frontmatterMappings?: Record<string, string>;
};

export interface InquiryTokenEstimate {
    corpus: RTCorpusTokenEstimate;
    blockCount: number;
    evidenceMode: InquiryEvidenceMode;
    evidenceLabel: string;
    selectionLabel: string;
    providerExecutionEstimate?: {
        estimatedTokens: number;
        method: TokenEstimateMethod;
        promptEnvelopeCharsAdded: number;
        expectedPassCount?: number;
        maxOutputTokens?: number;
    };
}

export interface GossamerTokenEstimate {
    corpus: RTCorpusTokenEstimate;
    includedSceneCount: number;
    providerExecutionEstimate: {
        estimatedTokens: number;
        method: TokenEstimateMethod;
        promptEnvelopeCharsAdded: number;
    };
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

const normalizeMode = (mode?: SceneInclusion, className?: string): SceneInclusion => {
    if (mode === 'full') return 'full';
    if (mode === 'summary') return SYNOPSIS_CAPABLE_CLASSES.has((className || '').toLowerCase()) ? 'summary' : 'full';
    return 'excluded';
};

const normalizeInquiryClasses = (classes?: InquiryClassConfig[]): InquiryClassConfig[] =>
    (classes || []).map(config => ({
        className: config.className.toLowerCase(),
        enabled: !!config.enabled,
        bookScope: normalizeMode(config.bookScope, config.className),
        sagaScope: normalizeMode(config.sagaScope, config.className),
        referenceScope: normalizeMode(config.referenceScope, config.className)
    }));

const estimateCorpusTokensFromChars = (chars: number): number => {
    if (!Number.isFinite(chars) || chars <= 0) return 0;
    return Math.ceil(chars / FORECAST_CHARS_PER_TOKEN);
};

const estimateExecutionTokensFromChars = (
    chars: number,
    promptOverheadTokens = FORECAST_PROMPT_OVERHEAD_TOKENS
): number => estimateCorpusTokensFromChars(chars) + Math.max(0, Math.floor(promptOverheadTokens));

const formatInquiryEvidenceLabel = (mode: InquiryEvidenceMode): string => {
    if (mode === 'summary') return 'Summaries';
    if (mode === 'full') return 'Bodies';
    if (mode === 'mixed') return 'Mixed';
    return 'Exclude';
};

const resolveInquiryModeForClass = (
    className: string,
    config: InquiryClassConfig,
    scope: InquiryScope,
    frontmatter: Record<string, unknown>
): SceneInclusion => {
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
    scopeFilter?: { scope: InquiryScope; activeBookId?: string },
    bookProfiles?: BookProfile[]
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
        bookInclusion: inquirySources?.bookInclusion,
        bookProfiles
    });

    let allFiles = vault.getMarkdownFiles().filter(file =>
        vaultRoots.some(root => !root || file.path === root || file.path.startsWith(`${root}/`))
        && isPathIncludedByInquiryBooks(file.path, bookResolution.candidates, scopeFilter?.scope)
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
        resolvedFocusBookId = scopeFilter.activeBookId
            && includedBooks.some(book => book.rootPath === scopeFilter.activeBookId)
            ? scopeFilter.activeBookId
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

const buildCanonicalManifest = (
    questionId: string,
    modelId: string,
    entries: CorpusManifestEntry[]
): CorpusManifest => {
    const now = Date.now();
    const fingerprintSource = entries
        .map(entry => `${entry.path}:${entry.sceneId ?? ''}:${entry.mtime}:${entry.mode}`)
        .sort()
        .join('|');
    const fingerprintRaw = `${INQUIRY_SCHEMA_VERSION}|${questionId}|${modelId}|${fingerprintSource}`;
    const classCounts = entries.reduce<Record<string, number>>((acc, entry) => {
        acc[entry.class] = (acc[entry.class] || 0) + 1;
        return acc;
    }, {});

    return {
        entries,
        fingerprint: hashString(fingerprintRaw),
        generatedAt: now,
        resolvedRoots: [],
        allowedClasses: Array.from(new Set(entries.map(entry => entry.class))),
        synopsisOnly: !entries.some(entry => entry.mode === 'full'),
        classCounts
    };
};

const resolveCanonicalFocusLabel = (
    vault: Vault,
    metadataCache: MetadataCache,
    inquirySources: InquirySourcesSettings | undefined,
    frontmatterMappings: Record<string, string> | undefined,
    scope: InquiryScope,
    activeBookId?: string
): string => {
    if (scope === 'saga') return String.fromCharCode(931);
    const resolver = new InquiryCorpusResolver(vault, metadataCache, frontmatterMappings);
    const snapshot = resolver.resolve({
        scope,
        activeBookId,
        sources: inquirySources ?? { scanRoots: [], bookInclusion: {}, classes: [], classCounts: {}, resolvedScanRoots: [] }
    });
    if (activeBookId) {
        const match = snapshot.books.find(book => book.id === activeBookId);
        if (match) return match.displayLabel;
    }
    return snapshot.books[0]?.displayLabel ?? '?';
};

export const buildCanonicalExecutionEstimate = async (
    params: CanonicalExecutionEstimateParams
): Promise<InquiryTokenEstimate['providerExecutionEstimate']> => {
    const provider = params.provider === 'google'
        ? 'gemini'
        : params.provider === 'ollama'
            ? 'local'
            : params.provider;
    if (provider === 'none') {
        throw new Error('Canonical Inquiry estimate is unavailable for provider none.');
    }
    const runner = new InquiryRunnerService(
        params.plugin,
        params.vault,
        params.metadataCache,
        params.frontmatterMappings
    );
    const trace = await buildInquiryEstimateTrace(runner, {
        scope: params.scope,
        activeBookId: params.activeBookId,
        scopeLabel: params.scopeLabel,
        targetSceneIds: [],
        selectionMode: 'discover',
        mode: 'flow',
        questionId: 'estimate-snapshot',
        questionText: params.questionText,
        questionZone: 'setup',
        corpus: buildCanonicalManifest('estimate-snapshot', params.modelId, params.manifestEntries),
        rules: {
            sagaOutlineScope: 'saga-only',
            bookOutlineScope: 'book-only',
            crossScopeUsage: 'conflict-only'
        },
        ai: {
            provider,
            modelId: params.modelId,
            modelLabel: params.modelId
        }
    });
    const estimatedTokens = trace.tokenEstimate.inputTokens;
    const chunkPlanPassCount = runner.estimateExecutionPassCountFromPrompt(trace.userPrompt, {
        estimatedInputTokens: estimatedTokens,
        safeInputTokens: trace.tokenEstimate.effectiveInputCeiling
    });
    const expectedPassCount = chunkPlanPassCount
        ?? trace.tokenEstimate.expectedPassCount
        ?? 1;

    return {
        estimatedTokens,
        method: trace.tokenEstimate.estimationMethod ?? 'heuristic_chars',
        promptEnvelopeCharsAdded: (trace.systemPrompt?.length ?? 0) + (trace.userPrompt?.length ?? 0),
        expectedPassCount,
        maxOutputTokens: trace.outputTokenCap
    };
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
    scopeContext?: { scope?: InquiryScope; activeBookId?: string; label?: string };
    promptOverheadTokens?: number;
    bookProfiles?: BookProfile[];
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
        { scope, activeBookId: params.scopeContext?.activeBookId },
        params.bookProfiles
    );
    const blocks: InquiryEvidenceBlock[] = [];
    const manifestEntries: CorpusManifestEntry[] = [];
    const scenePaths = new Set<string>();
    const outlinePaths = new Set<string>();
    const referencePaths = new Set<string>();

    if (!classScope.allowAll && classScope.allowed.size === 0) {
        const corpus: RTCorpusTokenEstimate = {
            sceneCount: 0,
            outlineCount: 0,
            referenceCount: 0,
            evidenceChars: 0,
            estimatedTokens: 0,
            method: 'rt_chars_heuristic',
            breakdown: {
                scenesTokens: 0,
                outlineTokens: 0,
                referenceTokens: 0
            }
        };
        return {
            corpus,
            blockCount: 0,
            evidenceMode: 'excluded',
            evidenceLabel: 'Exclude',
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
            if (normalizedMode === 'excluded') continue;
            const manifestEntryBase: CorpusManifestEntry = {
                path: file.path,
                mtime: file.stat?.mtime ?? Date.now(),
                class: className,
                mode: normalizedMode,
                isTarget: false
            };
            if (className === 'scene') {
                manifestEntryBase.sceneId = readSceneId(frontmatter);
            } else if (className === 'outline') {
                manifestEntryBase.scope = 'book';
            }
            manifestEntries.push(manifestEntryBase);

            if (normalizedMode === 'summary') {
                const summary = extractSummary(frontmatter);
                if (!summary) continue;
                blocks.push({
                    mode: 'summary',
                    label: `${className}: ${file.path}`,
                    content: summary
                });
                if (className === 'scene') {
                    scenePaths.add(file.path);
                } else if (className === 'outline') {
                    outlinePaths.add(file.path);
                } else {
                    referencePaths.add(file.path);
                }
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
            if (className === 'scene') {
                scenePaths.add(file.path);
            } else if (className === 'outline') {
                outlinePaths.add(file.path);
            } else {
                referencePaths.add(file.path);
            }
        }
    }

    const modeSet = new Set(blocks.map(block => block.mode));
    const evidenceMode: InquiryEvidenceMode = modeSet.size === 0
        ? 'excluded'
        : modeSet.size === 2
            ? 'mixed'
            : modeSet.has('summary')
                ? 'summary'
                : 'full';
    const evidenceChars = blocks.reduce((sum, block) => sum + block.label.length + block.content.length + 6, 0);
    const sceneChars = blocks
        .filter(block => block.label.startsWith('scene: '))
        .reduce((sum, block) => sum + block.label.length + block.content.length + 6, 0);
    const outlineChars = blocks
        .filter(block => block.label.startsWith('outline: '))
        .reduce((sum, block) => sum + block.label.length + block.content.length + 6, 0);
    const referenceChars = Math.max(0, evidenceChars - sceneChars - outlineChars);
    const breakdown = {
        scenesTokens: estimateCorpusTokensFromChars(sceneChars),
        outlineTokens: estimateCorpusTokensFromChars(outlineChars),
        referenceTokens: estimateCorpusTokensFromChars(referenceChars)
    };
    const corpusEstimate: RTCorpusTokenEstimate = {
        sceneCount: scenePaths.size,
        outlineCount: outlinePaths.size,
        referenceCount: referencePaths.size,
        evidenceChars,
        estimatedTokens: breakdown.scenesTokens + breakdown.outlineTokens + breakdown.referenceTokens,
        method: 'rt_chars_heuristic',
        breakdown
    };
    const questionText = params.questionText || 'Analyze the corpus and return findings.';
    let providerExecutionEstimate: InquiryTokenEstimate['providerExecutionEstimate'] = {
        estimatedTokens: estimateExecutionTokensFromChars(evidenceChars, params.promptOverheadTokens),
        method: 'heuristic_chars',
        promptEnvelopeCharsAdded: (params.promptOverheadTokens ?? FORECAST_PROMPT_OVERHEAD_TOKENS) * FORECAST_CHARS_PER_TOKEN
    };
    if (params.plugin && params.provider && params.modelId && manifestEntries.length > 0) {
        try {
            providerExecutionEstimate = await buildCanonicalExecutionEstimate({
                plugin: params.plugin,
                provider: params.provider,
                modelId: params.modelId,
                questionText,
                scope,
                activeBookId: selected.resolvedFocusBookId,
                scopeLabel: resolveCanonicalFocusLabel(
                    params.vault,
                    params.metadataCache,
                    params.inquirySources,
                    params.frontmatterMappings,
                    scope,
                    selected.resolvedFocusBookId
                ),
                manifestEntries,
                vault: params.vault,
                metadataCache: params.metadataCache,
                frontmatterMappings: params.frontmatterMappings
            });
        } catch {
            // Keep heuristic execution estimate when canonical execution estimate cannot be prepared.
        }
    }
    const scopePrefix = params.scopeContext?.label ? `${params.scopeContext.label} — ` : '';

    const filesIncluded = [
        ...Array.from(scenePaths),
        ...Array.from(outlinePaths),
        ...Array.from(referencePaths)
    ].sort((a, b) => a.localeCompare(b));
    logCountingForensics({
        path: 'inquiry',
        phase: 'settings_forecast',
        scope,
        filesIncluded,
        sceneCount: corpusEstimate.sceneCount,
        outlineCount: corpusEstimate.outlineCount,
        referenceCount: corpusEstimate.referenceCount,
        totalEvidenceChars: corpusEstimate.evidenceChars,
        promptEnvelopeCharsAdded: 0,
        tokenMethodUsed: corpusEstimate.method,
        finalTokenEstimate: corpusEstimate.estimatedTokens
    });
    if (providerExecutionEstimate) {
        logCountingForensics({
            path: 'inquiry',
            phase: 'settings_provider_execution',
            scope,
            filesIncluded,
            sceneCount: corpusEstimate.sceneCount,
            outlineCount: corpusEstimate.outlineCount,
            referenceCount: corpusEstimate.referenceCount,
            totalEvidenceChars: corpusEstimate.evidenceChars,
            promptEnvelopeCharsAdded: providerExecutionEstimate.promptEnvelopeCharsAdded,
            tokenMethodUsed: providerExecutionEstimate.method,
            finalTokenEstimate: providerExecutionEstimate.estimatedTokens
        });
    }

    return {
        corpus: corpusEstimate,
        blockCount: blocks.length,
        evidenceMode,
        evidenceLabel: formatInquiryEvidenceLabel(evidenceMode),
        selectionLabel: `${scopePrefix}${selected.selectionLabel}`,
        providerExecutionEstimate
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
    const corpusEstimate: RTCorpusTokenEstimate = {
        sceneCount: evidence.totalScenes,
        outlineCount: 0,
        referenceCount: 0,
        evidenceChars,
        estimatedTokens: estimateCorpusTokensFromChars(evidenceChars),
        method: 'rt_chars_heuristic',
        breakdown: {
            scenesTokens: estimateCorpusTokensFromChars(evidenceChars),
            outlineTokens: 0,
            referenceTokens: 0
        }
    };
    const providerExecutionEstimate = {
        estimatedTokens: estimateExecutionTokensFromChars(evidenceChars, params.promptOverheadTokens),
        method: 'heuristic_chars' as const,
        promptEnvelopeCharsAdded: (params.promptOverheadTokens ?? FORECAST_PROMPT_OVERHEAD_TOKENS) * FORECAST_CHARS_PER_TOKEN
    };
    logCountingForensics({
        path: 'gossamer',
        phase: 'settings_forecast',
        scope: 'book',
        filesIncluded: sceneFiles.map(file => file.path).sort((a, b) => a.localeCompare(b)),
        sceneCount: corpusEstimate.sceneCount,
        outlineCount: corpusEstimate.outlineCount,
        referenceCount: corpusEstimate.referenceCount,
        totalEvidenceChars: corpusEstimate.evidenceChars,
        promptEnvelopeCharsAdded: 0,
        tokenMethodUsed: corpusEstimate.method,
        finalTokenEstimate: corpusEstimate.estimatedTokens
    });
    logCountingForensics({
        path: 'gossamer',
        phase: 'settings_provider_execution',
        scope: 'book',
        filesIncluded: sceneFiles.map(file => file.path).sort((a, b) => a.localeCompare(b)),
        sceneCount: corpusEstimate.sceneCount,
        outlineCount: corpusEstimate.outlineCount,
        referenceCount: corpusEstimate.referenceCount,
        totalEvidenceChars: corpusEstimate.evidenceChars,
        promptEnvelopeCharsAdded: providerExecutionEstimate.promptEnvelopeCharsAdded,
        tokenMethodUsed: providerExecutionEstimate.method,
        finalTokenEstimate: providerExecutionEstimate.estimatedTokens
    });

    return {
        corpus: corpusEstimate,
        includedSceneCount: evidence.includedScenes,
        providerExecutionEstimate
    };
}
