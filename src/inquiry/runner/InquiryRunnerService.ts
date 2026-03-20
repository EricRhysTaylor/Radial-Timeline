import { TFile } from 'obsidian';
import type { MetadataCache, Vault } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { normalizeFrontmatterKeys } from '../../utils/frontmatter';
import { INQUIRY_MAX_OUTPUT_TOKENS, INQUIRY_SCHEMA_VERSION } from '../constants';
import { PROVIDER_MAX_OUTPUT_TOKENS } from '../../constants/tokenLimits';
import type { EvidenceDocumentMeta, InquiryAiStatus, InquiryCitation, InquiryConfidence, InquiryFinding, InquiryResult, InquirySeverity, InquiryTokenUsageScope } from '../state';
import type {
    CorpusManifestEntry,
    InquiryAiProvider,
    InquiryExecutionPath,
    InquiryExecutionState,
    InquiryFailureStage,
    InquiryOmnibusInput,
    InquiryOmnibusQuestion,
    InquiryRunExecutionOptions,
    InquiryRunProgressEvent,
    InquiryRunTrace,
    InquiryRunner,
    InquiryRunnerInput
} from './types';
import { getAIClient } from '../../ai/runtime/aiClient';
import { buildDefaultAiSettings, mapAiProviderToLegacyProvider, mapLegacyProviderToAiProvider } from '../../ai/settings/aiSettings';
import { validateAiSettings } from '../../ai/settings/validateAiSettings';
import type { AIRunPreparedEstimate, AIRunResult, AnalysisPackaging, SceneRef } from '../../ai/types';
import { extractTokenUsage } from '../../ai/usage/providerUsage';
import { readSceneId } from '../../utils/sceneIds';
import { buildSceneRefIndex, isStableSceneId, normalizeSceneRef } from '../../ai/references/sceneRefNormalizer';
import { cleanEvidenceBody } from '../utils/evidenceCleaning';
import { estimateTokensFromChars, type TokenEstimateMethod } from '../../ai/tokens/inputTokenEstimate';
import { logCountingForensics } from '../../ai/diagnostics/countingForensics';
import { buildInquiryJsonSchema, buildInquiryOmnibusJsonSchema } from '../jsonSchema';
import { buildInquiryPromptParts, buildInquiryPromptScaffold, INQUIRY_ROLE_TEMPLATE_GUARDRAIL } from '../promptScaffold';

export { cleanEvidenceBody } from '../utils/evidenceCleaning';

const BOOK_FOLDER_REGEX = /^Book\s+(\d+)/i;
const SINGLE_PASS_PLANNING_BUDGET_ERROR =
    'This request exceeds the single-pass planning budget. Switch Execution Preference to Automatic, or reduce scope.';

function isSinglePassPlanningBudgetError(message: string): boolean {
    const normalized = message.toLowerCase();
    return normalized.includes('single-pass planning budget')
        || normalized.includes('safe limit for a single pass');
}

type EvidenceBlock = {
    label: string;
    content: string;
    meta?: EvidenceDocumentMeta;
};

type OnePassFitState = 'fits' | 'overflows' | 'unknown';

type SceneSnapshot = {
    path: string;
    label: string;
    title: string;
    sceneId: string;
    summary: string;  // Extended Summary field (frontmatter["Summary"])
    sceneNumber?: number;
};

type RawInquiryFinding = {
    ref_id?: string;
    ref_label?: string;
    ref_path?: string;
    kind?: string;
    lens?: string;
    headline?: string;
    bullets?: string[];
    role?: string;
    impact?: string;
    assessmentConfidence?: string;
    severity?: string;
    confidence?: string;
};

type RawInquiryResponse = {
    schema_version?: number;
    summary?: string;
    summaryFlow?: string;
    summaryDepth?: string;
    verdict?: {
        flow?: number;
        depth?: number;
        impact?: string;
        assessmentConfidence?: string;
        severity?: string;
        confidence?: string;
    };
    findings?: RawInquiryFinding[];
};

type RawOmnibusQuestionResult = RawInquiryResponse & {
    question_id?: string;
    question_zone?: string;
    questionId?: string;
    questionZone?: string;
};

type RawOmnibusResponse = {
    schema_version?: number;
    results?: RawOmnibusQuestionResult[];
};

type ProviderResult = {
    success: boolean;
    content: string | null;
    responseData: unknown;
    requestPayload?: unknown;
    provider: InquiryAiProvider;
    modelId?: string;
    aiProvider?: InquiryAiProvider;
    aiModelRequested?: string;
    aiModelResolved?: string;
    aiStatus?: InquiryAiStatus;
    aiReason?: string;
    error?: string;
    sanitizationNotes?: string[];
    retryCount?: number;
    analysisPackaging?: AnalysisPackaging;
    executionPassCount?: number;
    packagingTriggerReason?: string;
    executionState?: InquiryExecutionState;
    executionPath?: InquiryExecutionPath;
    failureStage?: InquiryFailureStage;
    cacheReuseState?: 'idle' | 'eligible' | 'warm';
    cacheStatus?: 'hit' | 'created';
    cachedStableRatio?: number;
    cachedStableTokens?: number;
    tokenUsageKnown?: boolean;
    tokenUsageScope?: InquiryTokenUsageScope;
    usage?: InquiryRunTrace['usage'];
    aiTransportLane?: 'chat_completions' | 'responses';
    citations?: InquiryCitation[];
};

type MultiPassExecutionResult =
    | {
        ok: true;
        run: AIRunResult;
        tokenUsageKnown: boolean;
        tokenUsageScope?: InquiryTokenUsageScope;
        usage?: InquiryRunTrace['usage'];
    }
    | {
        ok: false;
        failureStage: 'preflight' | 'chunk_execution' | 'synthesis';
        failureReason: string;
        tokenUsageKnown: boolean;
        tokenUsageScope?: InquiryTokenUsageScope;
        usage?: InquiryRunTrace['usage'];
    };

type ChunkPromptPlan = {
    prompts: string[];
    maxChunkTokens: number;
    maxChunkChars: number;
    evidenceChars: number;
    prefixChars: number;
    targetPasses: number | null;
};

type SceneRefLedger = {
    allowedSceneIds: Set<string>;
    synthesisBlock: string;
};

type UsageAccumulator = {
    totalPasses: number;
    passesWithAnyUsage: number;
    passesWithInput: number;
    passesWithOutput: number;
    passesWithTotal: number;
    passesWithCacheAwareUsage: number;
    synthesisHasUsage: boolean;
    chunkHasUsage: boolean;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    rawInputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
};

export class InquiryRunnerService implements InquiryRunner {
    private tokenEstimateCache = new Map<string, InquiryRunTrace['tokenEstimate']>();

    constructor(
        private plugin: RadialTimelinePlugin,
        private vault: Vault,
        private metadataCache: MetadataCache,
        private frontmatterMappings?: Record<string, string>
    ) {}

    async run(input: InquiryRunnerInput): Promise<InquiryResult> {
        const { result } = await this.runWithTrace(input);
        return result;
    }

    async runWithTrace(
        input: InquiryRunnerInput,
        options?: InquiryRunExecutionOptions
    ): Promise<{ result: InquiryResult; trace: InquiryRunTrace }> {
        const { trace, evidenceBlocks } = await this.buildInitialTrace(input);
        const evidenceDocMeta = evidenceBlocks.map(b => b.meta).filter((m): m is EvidenceDocumentMeta => !!m);
        const { systemPrompt, userPrompt } = trace;

        const jsonSchema = this.getJsonSchema();
        const temperature = 0.2;
        const maxTokens = this.getOutputTokenCap(input.ai.provider);
        let response: ProviderResult | null = null;

        try {
            response = await this.callProvider(
                systemPrompt,
                userPrompt,
                input.ai,
                jsonSchema,
                temperature,
                maxTokens,
                input.questionText,
                evidenceBlocks,
                options
            );
            if (response.sanitizationNotes?.length) {
                trace.sanitizationNotes.push(...response.sanitizationNotes);
            }
            if (response.requestPayload) {
                trace.requestPayload = response.requestPayload;
            }
            if (typeof response.retryCount === 'number') {
                trace.retryCount = response.retryCount;
            }
            if (response.analysisPackaging) {
                trace.analysisPackaging = response.analysisPackaging;
            }
            if (typeof response.executionPassCount === 'number') {
                trace.executionPassCount = response.executionPassCount;
            }
            if (response.packagingTriggerReason) {
                trace.packagingTriggerReason = response.packagingTriggerReason;
            }
            trace.response = {
                content: response.content,
                responseData: response.responseData,
                aiStatus: response.aiStatus,
                aiReason: response.aiReason,
                error: response.error
            };
            this.applyResponseExecutionReporting(trace, response);
            this.applyOpenAiTransportLaneTraceNote(trace, response);
            const finalPassCount = typeof response.executionPassCount === 'number' && response.executionPassCount > 0
                ? response.executionPassCount
                : 1;

            if (!response.success || !response.content || response.aiStatus !== 'success') {
                const status = response.aiStatus || 'unknown';
                const reason = response.aiReason ? ` (${response.aiReason})` : '';
                trace.notes.push(`Provider status: ${status}${reason}.`);
                if (response.error) {
                    trace.notes.push(`Provider error: ${response.error}`);
                }
                const recovered = this.tryRecoverSingleInvalidResponse(input, response, trace, 'provider', evidenceDocMeta);
                if (recovered) {
                    return { result: recovered, trace };
                }
                return {
                    result: this.buildStubResult(input, this.getAiMetaFromResponse(response), response.error),
                    trace
                };
            }

            options?.onProgress?.({
                phase: 'finalizing',
                currentPass: finalPassCount,
                totalPasses: finalPassCount,
                detail: 'Provider response received. Finalizing the result.'
            });

            try {
                const parsed = this.parseResponse(response.content);
                return { result: this.buildResult(input, parsed, this.getAiMetaFromResponse(response), response.citations, evidenceDocMeta), trace };
            } catch (parseError) {
                const message = parseError instanceof Error ? parseError.message : String(parseError);
                trace.notes.push(`Parse error: ${message}`);
                trace.executionState = 'dispatched_to_provider';
                trace.failureStage = 'provider_response_parsing';
                trace.tokenUsageKnown = trace.tokenUsageKnown ?? !!trace.usage;
                const usage = trace.usage ?? this.extractUsage(response.aiProvider ?? response.provider, response.responseData);
                if (usage) trace.usage = usage;
                const recovered = this.tryRecoverSingleInvalidResponse(input, response, trace, 'parse', evidenceDocMeta);
                if (recovered) {
                    return { result: recovered, trace };
                }
                const fallbackMeta = this.withParseFailureMeta(this.getAiMetaFromResponse(response), response.aiStatus ?? 'rejected');
                return {
                    result: this.buildStubResult(input, fallbackMeta, parseError),
                    trace
                };
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (response) {
                trace.notes.push(`Runner error after response: ${message}`);
                const fallbackMeta = this.withParseFailureMeta(this.getAiMetaFromResponse(response), response.aiStatus ?? 'rejected');
                return { result: this.buildStubResult(input, fallbackMeta, error), trace };
            }
            trace.notes.push(`Runner error: ${message}`);
            return { result: this.buildStubResult(input, this.buildFallbackAiMeta(input), error), trace };
        }
    }

    async runOmnibusWithTrace(
        input: InquiryOmnibusInput
    ): Promise<{ results: InquiryResult[]; trace: InquiryRunTrace; rawResponse?: RawOmnibusResponse | null }> {
        const { trace, evidenceBlocks } = await this.buildOmnibusTrace(input);
        const evidenceDocMeta = evidenceBlocks.map(b => b.meta).filter((m): m is EvidenceDocumentMeta => !!m);
        const { systemPrompt, userPrompt } = trace;

        const jsonSchema = this.getOmnibusJsonSchema();
        const temperature = 0.2;
        const maxTokens = this.getOutputTokenCap(input.ai.provider);
        let response: ProviderResult | null = null;

        try {
            response = await this.callProvider(
                systemPrompt,
                userPrompt,
                input.ai,
                jsonSchema,
                temperature,
                maxTokens,
                input.questions.map(question => question.question).join('\n'),
                evidenceBlocks
            );
            if (response.sanitizationNotes?.length) {
                trace.sanitizationNotes.push(...response.sanitizationNotes);
            }
            if (response.requestPayload) {
                trace.requestPayload = response.requestPayload;
            }
            if (typeof response.retryCount === 'number') {
                trace.retryCount = response.retryCount;
            }
            if (response.analysisPackaging) {
                trace.analysisPackaging = response.analysisPackaging;
            }
            if (typeof response.executionPassCount === 'number') {
                trace.executionPassCount = response.executionPassCount;
            }
            if (response.packagingTriggerReason) {
                trace.packagingTriggerReason = response.packagingTriggerReason;
            }
            trace.response = {
                content: response.content,
                responseData: response.responseData,
                aiStatus: response.aiStatus,
                aiReason: response.aiReason,
                error: response.error
            };
            this.applyResponseExecutionReporting(trace, response);
            this.applyOpenAiTransportLaneTraceNote(trace, response);

            if (!response.success || !response.content || response.aiStatus !== 'success') {
                const status = response.aiStatus || 'unknown';
                const reason = response.aiReason ? ` (${response.aiReason})` : '';
                trace.notes.push(`Provider status: ${status}${reason}.`);
                if (response.error) {
                    trace.notes.push(`Provider error: ${response.error}`);
                }
                const recovered = this.tryRecoverOmnibusInvalidResponse(input, response, trace, 'provider', evidenceDocMeta);
                if (recovered) {
                    return recovered;
                }
                const aiMeta = this.getAiMetaFromResponse(response);
                return {
                    results: this.buildOmnibusStubResults(input, aiMeta, response.error),
                    trace,
                    rawResponse: null
                };
            }

            try {
                const parsed = this.parseOmnibusResponse(response.content);
                const aiMeta = this.getAiMetaFromResponse(response);
                return {
                    results: this.buildOmnibusResults(input, parsed, aiMeta, trace, response.citations, evidenceDocMeta),
                    trace,
                    rawResponse: parsed
                };
            } catch (parseError) {
                const message = parseError instanceof Error ? parseError.message : String(parseError);
                trace.notes.push(`Parse error: ${message}`);
                trace.executionState = 'dispatched_to_provider';
                trace.failureStage = 'provider_response_parsing';
                trace.tokenUsageKnown = trace.tokenUsageKnown ?? !!trace.usage;
                const usage = trace.usage ?? this.extractUsage(response.aiProvider ?? response.provider, response.responseData);
                if (usage) trace.usage = usage;
                const recovered = this.tryRecoverOmnibusInvalidResponse(input, response, trace, 'parse', evidenceDocMeta);
                if (recovered) {
                    return recovered;
                }
                const fallbackMeta = this.withParseFailureMeta(this.getAiMetaFromResponse(response), response.aiStatus ?? 'rejected');
                return {
                    results: this.buildOmnibusStubResults(input, fallbackMeta, parseError),
                    trace,
                    rawResponse: null
                };
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (response) {
                trace.notes.push(`Runner error after response: ${message}`);
                const fallbackMeta = this.withParseFailureMeta(this.getAiMetaFromResponse(response), response.aiStatus ?? 'rejected');
                return {
                    results: this.buildOmnibusStubResults(input, fallbackMeta, error),
                    trace,
                    rawResponse: null
                };
            }
            trace.notes.push(`Runner error: ${message}`);
            return {
                results: this.buildOmnibusStubResults(input, this.buildFallbackAiMeta(input), error),
                trace,
                rawResponse: null
            };
        }
    }

    async buildTrace(input: InquiryRunnerInput): Promise<InquiryRunTrace> {
        const { trace } = await this.buildInitialTrace(input);
        return trace;
    }

    estimateExecutionPassCountFromPrompt(
        userPrompt: string,
        options?: {
            estimatedInputTokens?: number;
            safeInputTokens?: number;
        }
    ): number {
        const chunkPlan = this.buildEvidenceChunkPrompts(userPrompt, {
            maxChunkTokens: 12000,
            estimatedInputTokens: options?.estimatedInputTokens,
            safeInputTokens: options?.safeInputTokens
        });
        if (!chunkPlan || chunkPlan.prompts.length <= 1) return 1;
        return chunkPlan.prompts.length + 1;
    }

    private async buildEvidenceBlocks(input: InquiryRunnerInput): Promise<EvidenceBlock[]> {
        const blocks: EvidenceBlock[] = [];
        const sceneEntries = input.corpus.entries
            .filter(entry => entry.class === 'scene')
            .filter(entry => this.isModeActive(entry.mode));
        const outlineEntries = input.corpus.entries
            .filter(entry => entry.class === 'outline')
            .filter(entry => this.isModeActive(entry.mode));
        const referenceEntries = input.corpus.entries
            .filter(entry => entry.class !== 'scene' && entry.class !== 'outline')
            .filter(entry => this.isModeActive(entry.mode));

        if (input.scope === 'saga') {
            const sagaOutlines = await this.collectOutlines(outlineEntries.filter(entry => entry.scope === 'saga'), 'Saga outline');
            blocks.push(...sagaOutlines);
        }

        const bookOutlines = await this.collectOutlines(outlineEntries.filter(entry => entry.scope !== 'saga'), 'Book outline');
        blocks.push(...bookOutlines);

        const scenes = await this.buildSceneSnapshots(sceneEntries);
        const sceneModeByPath = new Map(
            sceneEntries.map(entry => [entry.path, this.normalizeEntryMode(entry.mode)])
        );
        for (const scene of scenes) {
            const mode = sceneModeByPath.get(scene.path) ?? 'excluded';
            const sceneLabel = scene.title ? `${scene.title} (${scene.label})` : scene.label;
            const sceneMeta: EvidenceDocumentMeta = { title: scene.title || scene.label, path: scene.path, sceneId: scene.sceneId, evidenceClass: 'scene' };
            if (mode === 'summary') {
                if (!scene.summary) continue;
                blocks.push({ label: `Scene ${sceneLabel} (${scene.sceneId}) (Summary)`, content: scene.summary, meta: sceneMeta });
                continue;
            }
            if (mode === 'full') {
                const content = await this.readFileContent(scene.path);
                if (!content) continue;
                blocks.push({ label: `Scene ${sceneLabel} (${scene.sceneId}) (Full)`, content, meta: sceneMeta });
            }
        }

        const references = await this.collectReferenceDocs(referenceEntries);
        blocks.push(...references);
        const dedupedBlocks: EvidenceBlock[] = [];
        const seenBlockKeys = new Set<string>();
        blocks.forEach(block => {
            const key = `${block.label}\u0000${block.content}`;
            if (seenBlockKeys.has(key)) return;
            seenBlockKeys.add(key);
            dedupedBlocks.push(block);
        });

        if (!dedupedBlocks.length) {
            dedupedBlocks.push({ label: 'Evidence', content: 'No evidence available for the selected scope.' });
        }

        // Hard guard: Inquiry corpus must never include Synopsis-sourced content.
        // Catches accidental reintroduction of Synopsis semantics in future changes.
        if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') {
            for (const block of dedupedBlocks) {
                if (/\bsynopsis\b/i.test(block.label)) {
                    console.warn(
                        `[Inquiry guard] Evidence block label "${block.label}" contains "synopsis". ` +
                        `Inquiry corpus must use Summary only. This may indicate a regression.`
                    );
                }
            }
        }

        return dedupedBlocks;
    }

    private async buildSceneSnapshots(entries: CorpusManifestEntry[]): Promise<SceneSnapshot[]> {
        const scenes: SceneSnapshot[] = [];
        const seenPaths = new Set<string>();

        entries.forEach(entry => {
            const normalizedPath = entry.path.trim();
            if (!normalizedPath || seenPaths.has(normalizedPath)) return;
            seenPaths.add(normalizedPath);
            const file = this.vault.getAbstractFileByPath(entry.path);
            if (!file || !('path' in file)) return;
            if (!this.isTFile(file)) return;
            const frontmatter = this.getFrontmatter(file);
            const summary = this.extractSummary(frontmatter);
            const sceneNumber = this.extractSceneNumber(frontmatter) ?? this.extractSceneNumberFromText(file.basename);
            const title = this.getSceneTitle(file, frontmatter);
            const sceneId = this.resolveCanonicalSceneId(entry.sceneId ?? readSceneId(frontmatter) ?? undefined);
            if (!sceneId) {
                console.warn(`[Inquiry] Scene "${file.path}" is missing canonical YAML id (scn_<hash>); skipping scene evidence block.`);
                return;
            }
            scenes.push({
                path: file.path,
                label: '',
                title,
                sceneId,
                summary,
                sceneNumber
            });
        });

        scenes.sort((a, b) => {
            const numA = a.sceneNumber ?? Number.POSITIVE_INFINITY;
            const numB = b.sceneNumber ?? Number.POSITIVE_INFINITY;
            if (numA !== numB) return numA - numB;
            return a.path.localeCompare(b.path);
        });

        scenes.forEach((scene, index) => {
            const labelNumber = scene.sceneNumber ?? index + 1;
            scene.label = `S${this.clampLabelNumber(labelNumber)}`;
        });

        return scenes;
    }

    private getSceneTitle(file: TFile, frontmatter: Record<string, unknown>): string {
        const rawTitle = frontmatter['Title'] ?? frontmatter['title'];
        if (typeof rawTitle === 'string' && rawTitle.trim()) {
            return rawTitle.trim();
        }
        return file.basename;
    }

    private async collectOutlines(entries: CorpusManifestEntry[], fallbackLabel: string): Promise<EvidenceBlock[]> {
        const blocks: EvidenceBlock[] = [];
        for (const entry of entries) {
            const mode = this.normalizeEntryMode(entry.mode);
            if (mode === 'excluded') continue;
            const baseLabel = entry.scope === 'book'
                ? this.buildBookOutlineLabel(entry.path, fallbackLabel)
                : fallbackLabel;
            const meta: EvidenceDocumentMeta = { title: baseLabel, path: entry.path, evidenceClass: 'outline' };
            if (mode === 'summary') {
                const summary = this.getSummaryForPath(entry.path);
                if (!summary) continue;
                blocks.push({ label: `${baseLabel} (Summary)`, content: summary, meta });
                continue;
            }
            const content = await this.readFileContent(entry.path);
            if (!content) continue;
            blocks.push({ label: `${baseLabel} (Full)`, content, meta });
        }
        return blocks;
    }

    private async collectReferenceDocs(entries: CorpusManifestEntry[]): Promise<EvidenceBlock[]> {
        const blocks: EvidenceBlock[] = [];
        for (const entry of entries) {
            const mode = this.normalizeEntryMode(entry.mode);
            if (mode === 'excluded') continue;
            const baseLabel = this.buildReferenceLabel(entry);
            const meta: EvidenceDocumentMeta = { title: baseLabel, path: entry.path, evidenceClass: this.formatClassLabel(entry.class) };
            if (mode === 'summary') {
                const summary = this.getSummaryForPath(entry.path);
                if (!summary) continue;
                blocks.push({ label: `${baseLabel} (Summary)`, content: summary, meta });
                continue;
            }
            const content = await this.readFileContent(entry.path);
            if (!content) continue;
            blocks.push({ label: `${baseLabel} (Full)`, content, meta });
        }
        return blocks;
    }

    private buildReferenceLabel(entry: CorpusManifestEntry): string {
        const classLabel = this.formatClassLabel(entry.class);
        const file = this.vault.getAbstractFileByPath(entry.path);
        if (file && this.isTFile(file)) {
            const title = this.getReferenceTitle(file);
            if (title) {
                return `${classLabel}: ${title}`;
            }
        }
        return classLabel;
    }

    private formatClassLabel(value: string): string {
        if (!value) return 'Reference';
        return value
            .replace(/[_-]+/g, ' ')
            .trim()
            .split(/\s+/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }

    private buildBookOutlineLabel(path: string, fallback: string): string {
        const match = BOOK_FOLDER_REGEX.exec(path.split('/').find(segment => BOOK_FOLDER_REGEX.test(segment)) || '');
        if (match) {
            return `Book ${match[1]} outline`;
        }
        const filename = path.split('/').pop() || '';
        return filename ? `${fallback} (${filename})` : fallback;
    }

    private async readFileContent(path: string): Promise<string | null> {
        const file = this.vault.getAbstractFileByPath(path);
        if (!file || !this.isTFile(file)) return null;
        try {
            const raw = await this.vault.read(file);
            return cleanEvidenceBody(raw);
        } catch {
            return null;
        }
    }

    private getSummaryForPath(path: string): string | null {
        const file = this.vault.getAbstractFileByPath(path);
        if (!file || !this.isTFile(file)) return null;
        const frontmatter = this.getFrontmatter(file);
        const summary = this.extractSummary(frontmatter);
        return summary ? summary : null;
    }

    private normalizeEntryMode(mode?: CorpusManifestEntry['mode']): 'excluded' | 'summary' | 'full' {
        if (mode === 'full') return 'full';
        if (mode === 'summary') return 'summary';
        return 'excluded';
    }

    private isModeActive(mode?: CorpusManifestEntry['mode']): boolean {
        return this.normalizeEntryMode(mode) !== 'excluded';
    }

    private buildManifestSubjectLabel(entry: CorpusManifestEntry): string {
        if (entry.sceneId) return entry.sceneId;
        const filename = entry.path.split('/').pop() || entry.path;
        return filename.replace(/\.[^.]+$/i, '');
    }

    private buildCorpusManifestLines(entries: CorpusManifestEntry[]): string[] {
        return entries.map(entry => {
            const mode = this.normalizeEntryMode(entry.mode);
            const isTarget = entry.isTarget === true;
            return `${this.buildManifestSubjectLabel(entry)} | class=${entry.class} | mode=${mode} | isTarget=${isTarget}`;
        });
    }

    private buildPrompt(
        input: InquiryRunnerInput,
        evidence: EvidenceBlock[]
    ): { systemPrompt: string; userPrompt: string; evidenceText: string } {
        const evidenceText = evidence.map(block => {
            return `## ${block.label}\n${block.content}`;
        }).join('\n\n');
        const { systemPrompt, userPrompt } = buildInquiryPromptScaffold({
            task: input.questionText,
            lens: input.mode,
            selectionMode: input.selectionMode,
            targetSceneIds: input.targetSceneIds,
            corpusManifestLines: this.buildCorpusManifestLines(input.corpus.entries),
            evidenceText
        });

        return { systemPrompt, userPrompt, evidenceText };
    }

    private buildOmnibusPrompt(
        input: InquiryOmnibusInput,
        evidence: EvidenceBlock[]
    ): { systemPrompt: string; userPrompt: string; evidenceText: string } {
        const systemPrompt = [
            'You are an editorial analysis engine.',
            'Scores are corpus-level diagnostics, not answer quality.',
            'Scope clarification:',
            'Book: material = scenes in this book (summary-based unless configured otherwise).',
            'Saga: material = books in saga (outlines + scene summaries unless configured otherwise).',
            'Return JSON only. No prose outside JSON.'
        ].join('\n');

        const schema = [
            '{',
            `  "schema_version": ${INQUIRY_SCHEMA_VERSION},`,
            '  "results": [',
            '    {',
            '      "question_id": "setup-core",',
            '      "question_zone": "setup|pressure|payoff",',
            '      "summaryFlow": "1-2 sentence flow summary (pacing, momentum, compression, timing, pressure phrasing).",',
            '      "summaryDepth": "1-2 sentence depth summary (coherence, subtext, logic, alignment, implication phrasing).",',
            '      "verdict": {',
            '        "flow": 0,',
            '        "depth": 0,',
            '        "impact": "low|medium|high",',
            '        "assessmentConfidence": "low|medium|high"',
            '      },',
            '      "findings": [',
            '        {',
            '          "ref_id": "scn_a1b2c3d4",',
            '          "ref_label": "S12 · Scene title (optional)",',
            '          "ref_path": "Book 1/12 Scene.md (optional debug path)",',
            '          "kind": "loose_end|continuity|escalation|conflict|unclear|strength",',
            '          "lens": "flow|depth|both (optional)",',
            '          "headline": "short line",',
            '          "bullets": ["optional", "points"],',
            '          "impact": "low|medium|high",',
            '          "assessmentConfidence": "low|medium|high"',
            '        }',
            '      ]',
            '    }',
            '  ]',
            '}'
        ].join('\n');

        const evidenceText = evidence.map(block => {
            return `## ${block.label}\n${block.content}`;
        }).join('\n\n');

        const questionLines = input.questions.map((question, index) => {
            const zoneLabel = question.zone === 'setup' ? 'Setup' : question.zone === 'pressure' ? 'Pressure' : 'Payoff';
            return `${index + 1}) [${question.id}] ${zoneLabel}: ${question.question}`;
        });
        const { instructionText } = buildInquiryPromptParts({
            task: questionLines.join('\n'),
            lens: input.mode,
            selectionMode: input.selectionMode,
            targetSceneIds: input.targetSceneIds,
            corpusManifestLines: this.buildCorpusManifestLines(input.corpus.entries),
            evidenceText
        });

        const userPrompt = [
            instructionText,
            '',
            'Answer every listed question using the same evidence and return one result per question.',
            'Return JSON only with summaryFlow, summaryDepth, verdict.flow, verdict.depth, impact, assessmentConfidence, and findings for every question.',
            'Return JSON only using the exact schema below.',
            '',
            schema,
            '',
            'TASK:',
            questionLines.join('\n'),
            '',
            'LENS:',
            input.mode,
            '',
            'SELECTION MODE:',
            input.selectionMode,
            '',
            'TARGET SCENES:',
            ...(input.targetSceneIds.length ? input.targetSceneIds.map(sceneId => `- ${sceneId}`) : ['- no target scenes selected']),
            '',
            'CORPUS MANIFEST:',
            ...this.buildCorpusManifestLines(input.corpus.entries).map(line => `- ${line}`),
            '',
            'EVIDENCE:',
            evidenceText
        ].join('\n');

        return { systemPrompt, userPrompt, evidenceText };
    }

    private getJsonSchema(): Record<string, unknown> {
        return buildInquiryJsonSchema();
    }

    private getOmnibusJsonSchema(): Record<string, unknown> {
        return buildInquiryOmnibusJsonSchema();
    }

    private async callProvider(
        systemPrompt: string,
        userPrompt: string,
        ai: InquiryRunnerInput['ai'],
        jsonSchema: Record<string, unknown>,
        temperature: number,
        maxTokens: number,
        userQuestion?: string,
        evidenceBlocks?: EvidenceBlock[],
        executionOptions?: InquiryRunExecutionOptions
    ): Promise<ProviderResult> {
        const aiClient = getAIClient(this.plugin);
        const analysisPackaging = this.getAnalysisPackaging();
        const packagingPrecheck = await this.getPackagingPrecheck({
            aiClient,
            systemPrompt,
            userPrompt,
            ai,
            userQuestion,
            jsonSchema,
            temperature,
            maxTokens,
            evidenceBlocks
        });
        if (!packagingPrecheck.ok) {
            const reason = `Unable to prepare an authoritative provider execution estimate. ${packagingPrecheck.reason}`.trim();
            return this.buildPackagingFailedResult(
                ai,
                analysisPackaging,
                reason,
                'preflight',
                false
            );
        }
        const precheck = packagingPrecheck;

        /**
         * Inquiry packaging policy (overflow = tokenEstimateInput > effectiveInputCeiling)
         *
         * Mode            One-pass fit check role         One-pass permission         Required route
         * singlePassOnly  hard gate                        allowed only if fits        overflow/unknown => reject before send
         * automatic       routing hint                     allowed only if fits        overflow/unknown => multi-pass
         * segmented       informational                    never                        always multi-pass
         *
         * If required multi-pass fails, return packaging_failed.
         * Do not emit single-pass-limit rejection for automatic/segmented.
         */
        const onePassFit = precheck.onePassFit;
        const requiresMultiPass = analysisPackaging === 'segmented'
            || (analysisPackaging === 'automatic' && onePassFit !== 'fits');

        if (analysisPackaging === 'singlePassOnly' && onePassFit === 'overflows') {
            const reason = `Estimated input ${Math.round(precheck.inputTokens).toLocaleString()} exceeds safe input budget ${Math.round(precheck.safeInputTokens).toLocaleString()} for this Inquiry request.`;
            return this.buildSinglePassOnlyOverflowResult(ai, reason);
        }

        if (analysisPackaging === 'singlePassOnly' && onePassFit === 'unknown') {
            const reason = 'Unable to verify one-pass fit for this request. Single-pass only mode blocks execution without fit confirmation.';
            return this.buildSinglePassOnlyUnknownFitResult(ai, reason);
        }

        if (requiresMultiPass) {
            const triggerReason = analysisPackaging === 'segmented'
                ? 'Segmented mode forces multi-pass segmentation.'
                : onePassFit === 'overflows'
                    ? `Estimated input ${Math.round(precheck.inputTokens).toLocaleString()} exceeded safe input budget ${Math.round(precheck.safeInputTokens).toLocaleString()}.`
                    : 'One-pass fit estimate was unavailable, so automatic mode preferred multi-pass packaging.';
            const multiPass = await this.runChunkedInquiry(aiClient, {
                systemPrompt,
                userPrompt,
                userQuestion,
                ai,
                jsonSchema,
                temperature,
                maxTokens,
                evidenceBlocks,
                executionOptions,
                packagingPrecheck: {
                    inputTokens: precheck.inputTokens,
                    safeInputTokens: precheck.safeInputTokens,
                    onePassFit: precheck.onePassFit
                }
            });
            if (multiPass.ok) {
                return this.toProviderResult(this.withExecutionContext(multiPass.run, {
                    analysisPackaging,
                    executionPassCount: multiPass.run.advancedContext?.executionPassCount,
                    packagingTriggerReason: triggerReason
                }), {
                    usage: multiPass.usage,
                    tokenUsageScope: multiPass.tokenUsageScope
                });
            }
            const reason = analysisPackaging === 'segmented'
                ? 'Segmented mode requires multi-pass packaging, but chunking/synthesis did not complete.'
                : onePassFit === 'overflows'
                    ? `Automatic mode routed to multi-pass because estimated input ${Math.round(precheck.inputTokens).toLocaleString()} exceeded safe input budget ${Math.round(precheck.safeInputTokens).toLocaleString()}, but chunking/synthesis did not complete.`
                    : 'Automatic mode preferred multi-pass because one-pass fit was unknown, but chunking/synthesis did not complete.';
            const reasonWithStage = `${reason} ${multiPass.failureReason}`.trim();
            return this.buildPackagingFailedResult(
                ai,
                analysisPackaging,
                reasonWithStage,
                multiPass.failureStage,
                multiPass.tokenUsageKnown,
                multiPass.usage,
                multiPass.tokenUsageScope
            );
        }

        executionOptions?.onProgress?.({
            phase: 'one_pass',
            currentPass: 1,
            totalPasses: 1,
            detail: 'Waiting for the provider response.'
        });
        this.throwIfAborted(executionOptions?.shouldAbort);
        let run = await this.runInquiryRequest(aiClient, {
            task: 'AnalyzeCorpus',
            systemPrompt,
            userPrompt,
            userQuestion,
            ai,
            jsonSchema,
            temperature,
            maxTokens,
            evidenceBlocks,
            preparedEstimate: precheck.preparedEstimate
        });
        run = this.withExecutionContext(run, {
            analysisPackaging,
            executionPassCount: 1
        });

        // Inquiry specialization: if single-pass truncates, package and synthesize unless explicitly disabled.
        if (run.aiReason === 'truncated') {
            if (analysisPackaging === 'singlePassOnly') {
                run = this.withExecutionContext({
                    ...run,
                    aiStatus: run.aiStatus === 'success' ? 'rejected' : run.aiStatus,
                    aiReason: run.aiReason || 'truncated',
                    error: run.error || SINGLE_PASS_PLANNING_BUDGET_ERROR,
                    warnings: [
                        ...(run.warnings || []),
                        'Single-pass only is enabled, so large-manuscript packaging was skipped.'
                    ]
                }, {
                    analysisPackaging,
                    executionPassCount: 1,
                    packagingTriggerReason: 'Single-pass response exceeded the planning budget, but automatic packaging is disabled.'
                });
            } else {
                const multiPass = await this.runChunkedInquiry(aiClient, {
                    systemPrompt,
                    userPrompt,
                    userQuestion,
                    ai,
                    jsonSchema,
                    temperature,
                    maxTokens,
                    evidenceBlocks,
                    executionOptions,
                    packagingPrecheck: {
                        inputTokens: precheck.inputTokens,
                        safeInputTokens: precheck.safeInputTokens,
                        onePassFit: precheck.onePassFit
                    }
                });
                if (multiPass.ok) {
                    run = multiPass.run;
                } else {
                    return this.buildPackagingFailedResult(
                        ai,
                        analysisPackaging,
                        `Single-pass response was truncated, and fallback multi-pass packaging did not complete. ${multiPass.failureReason}`.trim(),
                        multiPass.failureStage,
                        multiPass.tokenUsageKnown,
                        multiPass.usage,
                        multiPass.tokenUsageScope
                    );
                }
            }
        }

        return this.toProviderResult(run);
    }

    private async runInquiryRequest(
        aiClient: ReturnType<typeof getAIClient>,
        options: {
            task: string;
            systemPrompt: string;
            userPrompt: string;
            userQuestion?: string;
            ai: InquiryRunnerInput['ai'];
            jsonSchema: Record<string, unknown>;
            temperature: number;
            maxTokens: number;
            evidenceBlocks?: EvidenceBlock[];
            preparedEstimate?: AIRunPreparedEstimate | null;
        }
    ): Promise<AIRunResult> {
        const preparedEstimate = options.preparedEstimate
            ?? await this.prepareInquiryRunEstimate(aiClient, {
                task: options.task,
                systemPrompt: options.systemPrompt,
                userPrompt: options.userPrompt,
                userQuestion: options.userQuestion,
                ai: options.ai,
                jsonSchema: options.jsonSchema,
                temperature: options.temperature,
                maxTokens: options.maxTokens,
                evidenceBlocks: options.evidenceBlocks
            });
        return aiClient.run({
            feature: 'InquiryMode',
            task: options.task,
            requiredCapabilities: ['longContext', 'jsonStrict', 'reasoningStrong', 'highOutputCap'],
            featureModeInstructions: [
                options.systemPrompt,
                INQUIRY_ROLE_TEMPLATE_GUARDRAIL
            ].filter(Boolean).join('\n'),
            userInput: options.userPrompt,
            userQuestion: options.userQuestion,
            promptText: options.userPrompt,
            systemPrompt: undefined,
            returnType: 'json',
            responseSchema: options.jsonSchema,
            providerOverride: mapLegacyProviderToAiProvider(options.ai.provider),
            overrides: {
                temperature: options.temperature,
                maxOutputMode: this.resolveMaxOutputMode(options.maxTokens),
                reasoningDepth: 'deep',
                jsonStrict: true
            },
            preparedEstimate: preparedEstimate ?? undefined,
            evidenceDocuments: options.evidenceBlocks?.length
                ? options.evidenceBlocks.map(block => ({
                    title: block.label,
                    content: block.content
                }))
                : undefined
        });
    }

    private async prepareInquiryRunEstimate(
        aiClient: ReturnType<typeof getAIClient>,
        options: {
            task: string;
            systemPrompt: string;
            userPrompt: string;
            userQuestion?: string;
            ai: InquiryRunnerInput['ai'];
            jsonSchema: Record<string, unknown>;
            temperature: number;
            maxTokens: number;
            evidenceBlocks?: EvidenceBlock[];
        }
    ): Promise<AIRunPreparedEstimate | null> {
        const prepared = await aiClient.prepareRunEstimate({
            feature: 'InquiryMode',
            task: options.task,
            requiredCapabilities: ['longContext', 'jsonStrict', 'reasoningStrong', 'highOutputCap'],
            featureModeInstructions: [
                options.systemPrompt,
                INQUIRY_ROLE_TEMPLATE_GUARDRAIL
            ].filter(Boolean).join('\n'),
            userInput: options.userPrompt,
            userQuestion: options.userQuestion,
            promptText: options.userPrompt,
            systemPrompt: undefined,
            returnType: 'json',
            responseSchema: options.jsonSchema,
            providerOverride: mapLegacyProviderToAiProvider(options.ai.provider),
            overrides: {
                temperature: options.temperature,
                maxOutputMode: this.resolveMaxOutputMode(options.maxTokens),
                reasoningDepth: 'deep',
                jsonStrict: true
            },
            evidenceDocuments: options.evidenceBlocks?.length
                ? options.evidenceBlocks.map(block => ({
                    title: block.label,
                    content: block.content
                }))
                : undefined
        });
        if (!prepared.ok) return null;
        return prepared.estimate;
    }

    private resolveMaxOutputMode(maxTokens: number): 'auto' | 'high' | 'max' {
        if (maxTokens >= 12000) return 'max';
        if (maxTokens >= 4000) return 'high';
        return 'auto';
    }

    private hashText(input: string): string {
        let hash = 2166136261;
        for (let i = 0; i < input.length; i += 1) {
            hash ^= input.charCodeAt(i);
            hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
        }
        return (hash >>> 0).toString(16);
    }

    private getAnalysisPackaging(): AnalysisPackaging {
        const aiSettings = validateAiSettings(this.plugin.settings.aiSettings ?? buildDefaultAiSettings()).value;
        const pkg = aiSettings.analysisPackaging;
        return pkg === 'singlePassOnly' ? 'singlePassOnly'
            : pkg === 'segmented' ? 'segmented'
            : 'automatic';
    }

    private async getPackagingPrecheck(options: {
        aiClient: ReturnType<typeof getAIClient>;
        systemPrompt: string;
        userPrompt: string;
        ai: InquiryRunnerInput['ai'];
        userQuestion?: string;
        jsonSchema: Record<string, unknown>;
        temperature: number;
        maxTokens: number;
        evidenceBlocks?: EvidenceBlock[];
    }): Promise<
        | {
            ok: true;
            inputTokens: number;
            safeInputTokens: number;
            onePassFit: OnePassFitState;
            exceedsSafeBudget: boolean;
            estimationMethod: TokenEstimateMethod;
            uncertaintyTokens: number;
            preparedEstimate: AIRunPreparedEstimate | null;
        }
        | {
            ok: false;
            reason: string;
        }
    > {
        try {
            const preparedEstimate = await this.prepareInquiryRunEstimate(options.aiClient, {
                task: 'InquiryPackagingPrecheck',
                systemPrompt: options.systemPrompt,
                userPrompt: options.userPrompt,
                userQuestion: options.userQuestion,
                ai: options.ai,
                jsonSchema: options.jsonSchema,
                temperature: options.temperature,
                maxTokens: options.maxTokens,
                evidenceBlocks: options.evidenceBlocks
            });
            if (!preparedEstimate) {
                throw new Error('prepareRunEstimate unavailable');
            }
            const exceedsSafeBudget = preparedEstimate.tokenEstimateInput > preparedEstimate.effectiveInputCeiling;
            return {
                ok: true,
                inputTokens: preparedEstimate.tokenEstimateInput,
                safeInputTokens: preparedEstimate.effectiveInputCeiling,
                onePassFit: exceedsSafeBudget ? 'overflows' : 'fits',
                exceedsSafeBudget,
                estimationMethod: preparedEstimate.tokenEstimateMethod,
                uncertaintyTokens: preparedEstimate.tokenEstimateUncertainty,
                preparedEstimate
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                ok: false,
                reason: message
            };
        }
    }

    private buildSinglePassOnlyOverflowResult(
        ai: InquiryRunnerInput['ai'],
        reason: string
    ): ProviderResult {
        return {
            success: false,
            content: null,
            responseData: null,
            provider: ai.provider,
            modelId: ai.modelId,
            aiProvider: ai.provider,
            aiModelRequested: ai.modelId,
            aiModelResolved: ai.modelId,
            aiStatus: 'rejected',
            aiReason: 'truncated',
            error: SINGLE_PASS_PLANNING_BUDGET_ERROR,
            analysisPackaging: 'singlePassOnly',
            executionPassCount: 1,
            packagingTriggerReason: reason,
            executionState: 'blocked_before_send',
            executionPath: 'one_pass',
            failureStage: 'preflight',
            tokenUsageKnown: false
        };
    }

    private buildSinglePassOnlyUnknownFitResult(
        ai: InquiryRunnerInput['ai'],
        reason: string
    ): ProviderResult {
        return {
            success: false,
            content: null,
            responseData: null,
            provider: ai.provider,
            modelId: ai.modelId,
            aiProvider: ai.provider,
            aiModelRequested: ai.modelId,
            aiModelResolved: ai.modelId,
            aiStatus: 'rejected',
            aiReason: 'packaging_failed',
            error: 'Unable to verify one-pass fit in Single-pass only mode. Try again, or switch Execution Preference to Automatic.',
            analysisPackaging: 'singlePassOnly',
            executionPassCount: 1,
            packagingTriggerReason: reason,
            executionState: 'blocked_before_send',
            executionPath: 'one_pass',
            failureStage: 'preflight',
            tokenUsageKnown: false
        };
    }

    private buildPackagingFailedResult(
        ai: InquiryRunnerInput['ai'],
        analysisPackaging: AnalysisPackaging,
        reason: string,
        failureStage: InquiryFailureStage,
        tokenUsageKnown: boolean,
        usage?: InquiryRunTrace['usage'],
        tokenUsageScope?: InquiryTokenUsageScope
    ): ProviderResult {
        const stageLabel = failureStage === 'chunk_execution'
            ? 'chunk execution'
            : failureStage === 'synthesis'
                ? 'synthesis'
                : 'preflight packaging';
        return {
            success: false,
            content: null,
            responseData: null,
            provider: ai.provider,
            modelId: ai.modelId,
            aiProvider: ai.provider,
            aiModelRequested: ai.modelId,
            aiModelResolved: ai.modelId,
            aiStatus: 'rejected',
            aiReason: 'packaging_failed',
            error: `The run failed during multi-pass ${stageLabel}. RT did not receive valid structured output for a required pass. This is a packaging/parsing failure in the current Inquiry path. Open Inquiry Log for details.`,
            analysisPackaging,
            executionPassCount: 1,
            packagingTriggerReason: reason,
            executionState: 'packaging_failed',
            executionPath: 'multi_pass',
            failureStage,
            tokenUsageKnown,
            tokenUsageScope,
            usage
        };
    }

    private withExecutionContext(
        run: AIRunResult,
        context: {
            analysisPackaging: AnalysisPackaging;
            executionPassCount?: number;
            packagingTriggerReason?: string;
        }
    ): AIRunResult {
        if (!run.advancedContext) return run;
        return {
            ...run,
            advancedContext: {
                ...run.advancedContext,
                analysisPackaging: context.analysisPackaging,
                executionPassCount: context.executionPassCount ?? run.advancedContext.executionPassCount,
                packagingTriggerReason: context.packagingTriggerReason ?? run.advancedContext.packagingTriggerReason
            }
        };
    }

    private toProviderResult(
        run: AIRunResult,
        options?: {
            usage?: InquiryRunTrace['usage'];
            tokenUsageScope?: InquiryTokenUsageScope;
        }
    ): ProviderResult {
        const legacyProvider = mapAiProviderToLegacyProvider(run.provider);
        const executionPath: InquiryExecutionPath = (run.advancedContext?.executionPassCount ?? 1) > 1
            ? 'multi_pass'
            : 'one_pass';
        const usage = options?.usage ?? this.extractUsage(run.provider, run.responseData);
        const usageKnown = !!usage;
        const preflightBlocked = run.aiStatus === 'rejected'
            && run.aiReason === 'truncated'
            && typeof run.reason === 'string'
            && run.reason.toLowerCase().includes('token guard rejected request before execution');
        const executionState: InquiryExecutionState = preflightBlocked
            ? 'blocked_before_send'
            : 'dispatched_to_provider';
        const failureStage: InquiryFailureStage | undefined = run.aiStatus === 'success'
            ? undefined
            : (preflightBlocked ? 'preflight' : 'provider_response_parsing');
        return {
            success: run.aiStatus === 'success' && !!run.content,
            content: run.content,
            responseData: run.responseData,
            requestPayload: run.requestPayload,
            provider: legacyProvider,
            modelId: run.modelResolved || run.modelRequested,
            aiProvider: legacyProvider,
            aiModelRequested: run.modelRequested,
            aiModelResolved: run.modelResolved || run.modelRequested,
            aiStatus: run.aiStatus,
            aiReason: run.aiReason,
            error: run.error,
            sanitizationNotes: run.sanitizationNotes,
            retryCount: run.retryCount,
            analysisPackaging: run.advancedContext?.analysisPackaging,
            executionPassCount: run.advancedContext?.executionPassCount,
            packagingTriggerReason: run.advancedContext?.packagingTriggerReason,
            executionState,
            executionPath,
            failureStage,
            cacheReuseState: run.advancedContext?.reuseState,
            cacheStatus: run.advancedContext?.cacheStatus,
            cachedStableRatio: run.advancedContext?.cachedStableRatio,
            cachedStableTokens: run.advancedContext?.cachedStableTokens,
            tokenUsageKnown: usageKnown,
            tokenUsageScope: options?.tokenUsageScope,
            usage,
            aiTransportLane: run.aiTransportLane ?? run.advancedContext?.openAiTransportLane,
            citations: run.citations?.map(c => ({ ...c }))
        };
    }

    private async runChunkedInquiry(
        aiClient: ReturnType<typeof getAIClient>,
        options: {
            systemPrompt: string;
            userPrompt: string;
            userQuestion?: string;
            ai: InquiryRunnerInput['ai'];
            jsonSchema: Record<string, unknown>;
            temperature: number;
            maxTokens: number;
            evidenceBlocks?: EvidenceBlock[];
            executionOptions?: InquiryRunExecutionOptions;
            packagingPrecheck?: {
                inputTokens: number;
                safeInputTokens: number;
                onePassFit: OnePassFitState;
            };
        }
    ): Promise<MultiPassExecutionResult> {
        const chunkPlan = this.buildEvidenceChunkPrompts(options.userPrompt, {
            maxChunkTokens: 12000,
            estimatedInputTokens: options.packagingPrecheck?.inputTokens,
            safeInputTokens: options.packagingPrecheck?.safeInputTokens
        });
        if (!chunkPlan || chunkPlan.prompts.length <= 1) {
            console.warn('[Inquiry] Chunked execution aborted: evidence could not be split into multiple chunks.');
            return {
                ok: false,
                failureStage: 'preflight',
                failureReason: 'Evidence could not be split into multiple chunks.',
                tokenUsageKnown: false
            };
        }

        console.info(
            `[Inquiry] Chunked execution: ${chunkPlan.prompts.length} chunks to process `
            + `(chunk budget ~${Math.round(chunkPlan.maxChunkTokens).toLocaleString()} tokens, `
            + `evidence chars=${Math.round(chunkPlan.evidenceChars).toLocaleString()}, `
            + `target passes=${chunkPlan.targetPasses ?? 'n/a'}).`
        );
        const chunkOutputs: string[] = [];
        const totalPasses = chunkPlan.prompts.length + 1;
        const usageAccumulator = this.createUsageAccumulator(totalPasses);
        const recoveredStages: string[] = [];
        const sceneRefLedger = this.buildSceneRefLedger(options.evidenceBlocks);
        for (let i = 0; i < chunkPlan.prompts.length; i += 1) {
            this.throwIfAborted(options.executionOptions?.shouldAbort);
            options.executionOptions?.onProgress?.({
                phase: 'chunk',
                currentPass: i + 1,
                totalPasses,
                chunkIndex: i + 1,
                chunkTotal: chunkPlan.prompts.length,
                detail: `Waiting for pass ${i + 1} of ${totalPasses}.`
            });
            const chunkRun = await this.runInquiryRequest(aiClient, {
                task: `AnalyzeCorpusChunk${i + 1}`,
                systemPrompt: options.systemPrompt,
                userPrompt: chunkPlan.prompts[i],
                userQuestion: options.userQuestion,
                ai: options.ai,
                jsonSchema: options.jsonSchema,
                temperature: options.temperature,
                maxTokens: options.maxTokens
            });
            this.recordUsage(usageAccumulator, this.extractUsage(options.ai.provider, chunkRun.responseData), 'chunk');
            this.throwIfAborted(options.executionOptions?.shouldAbort);
            if (chunkRun.aiStatus !== 'success' || !chunkRun.content) {
                const recoveredChunkJson = this.tryRecoverChunkInvalidResponse(chunkRun, i + 1, chunkPlan.prompts.length);
                if (recoveredChunkJson) {
                    if (i === 0 || this.shouldAbortOnRecoveredInvalidResponse('chunk', i + 1)) {
                        const usageSummary = this.finalizeUsageAccumulator(usageAccumulator);
                        return {
                            ok: false,
                            failureStage: 'chunk_execution',
                            failureReason: i === 0
                                ? `[Inquiry] Chunk 1 health check failed: pass 1 required local JSON extraction.`
                                : `[Inquiry] Strict recovery debug abort: chunk ${i + 1}/${chunkPlan.prompts.length} required local JSON extraction.`,
                            tokenUsageKnown: usageSummary.tokenUsageKnown,
                            tokenUsageScope: usageSummary.tokenUsageScope,
                            usage: usageSummary.usage
                        };
                    }
                    recoveredStages.push(`chunk ${i + 1}/${chunkPlan.prompts.length}`);
                    chunkOutputs.push(recoveredChunkJson);
                    continue;
                }
                const failureReason = `[Inquiry] Chunk ${i + 1}/${chunkPlan.prompts.length} failed:`
                    + ` status=${chunkRun.aiStatus}, reason=${chunkRun.aiReason ?? 'none'}`
                    + `, error=${chunkRun.error ?? 'none'}`
                    + `, prompt_chars=${chunkPlan.prompts[i].length}`
                    + `, response_chars=${chunkRun.content?.length ?? 0}`;
                console.warn(failureReason);
                if (this.isChunkDebugEnabled() && i === 0) {
                    console.info('[Inquiry] Chunk 1 prompt (full):');
                    console.info(chunkPlan.prompts[i]);
                    console.info('[Inquiry] Chunk 1 raw response (full):');
                    console.info(chunkRun.content || '<empty>');
                }
                const usageSummary = this.finalizeUsageAccumulator(usageAccumulator);
                return {
                    ok: false,
                    failureStage: 'chunk_execution',
                    failureReason,
                    tokenUsageKnown: usageSummary.tokenUsageKnown,
                    tokenUsageScope: usageSummary.tokenUsageScope,
                    usage: usageSummary.usage
                };
            }
            if (i === 0) {
                const chunkOneHealth = this.assessChunkRefHealth(chunkRun.content, sceneRefLedger.allowedSceneIds);
                if (!chunkOneHealth.ok) {
                    const usageSummary = this.finalizeUsageAccumulator(usageAccumulator);
                    return {
                        ok: false,
                        failureStage: 'chunk_execution',
                        failureReason: `[Inquiry] Chunk 1 health check failed: ${chunkOneHealth.reason}`,
                        tokenUsageKnown: usageSummary.tokenUsageKnown,
                        tokenUsageScope: usageSummary.tokenUsageScope,
                        usage: usageSummary.usage
                    };
                }
            }
            chunkOutputs.push(chunkRun.content);
        }

        const marker = '\nEvidence:\n';
        const splitAt = options.userPrompt.indexOf(marker);
        if (splitAt < 0) {
            const usageSummary = this.finalizeUsageAccumulator(usageAccumulator);
            return {
                ok: false,
                failureStage: 'preflight',
                failureReason: 'Evidence marker missing before synthesis stage.',
                tokenUsageKnown: usageSummary.tokenUsageKnown,
                tokenUsageScope: usageSummary.tokenUsageScope,
                usage: usageSummary.usage
            };
        }
        const prefix = options.userPrompt.slice(0, splitAt + marker.length);
        const synthesisEvidence = [
            sceneRefLedger.synthesisBlock,
            chunkOutputs
                .map((output, index) => `## Pass ${index + 1} result\n${output}`)
                .join('\n\n')
        ]
            .filter(Boolean)
            .join('\n\n');

        this.throwIfAborted(options.executionOptions?.shouldAbort);
        options.executionOptions?.onProgress?.({
            phase: 'synthesis',
            currentPass: totalPasses,
            totalPasses,
            chunkTotal: chunkPlan.prompts.length,
            detail: `Waiting for pass ${totalPasses} of ${totalPasses}.`
        });
        let synthesisRun = await this.runInquiryRequest(aiClient, {
            task: 'SynthesizeChunkAnalyses',
            systemPrompt: options.systemPrompt,
            userPrompt: `${prefix}${synthesisEvidence}`,
            userQuestion: options.userQuestion,
            ai: options.ai,
            jsonSchema: options.jsonSchema,
            temperature: options.temperature,
            maxTokens: options.maxTokens
        });
        this.recordUsage(usageAccumulator, this.extractUsage(options.ai.provider, synthesisRun.responseData), 'synthesis');
        this.throwIfAborted(options.executionOptions?.shouldAbort);

        if (synthesisRun.aiStatus !== 'success' || !synthesisRun.content) {
            const recoveredSynthesisRun = this.tryRecoverSynthesisInvalidResponse(synthesisRun, chunkOutputs.length);
            if (recoveredSynthesisRun) {
                if (this.shouldAbortOnRecoveredInvalidResponse('synthesis')) {
                    const usageSummary = this.finalizeUsageAccumulator(usageAccumulator);
                    return {
                        ok: false,
                        failureStage: 'synthesis',
                        failureReason: '[Inquiry] Strict recovery debug abort: synthesis required local JSON extraction.',
                        tokenUsageKnown: usageSummary.tokenUsageKnown,
                        tokenUsageScope: usageSummary.tokenUsageScope,
                        usage: usageSummary.usage
                    };
                }
                recoveredStages.push('synthesis');
                synthesisRun = recoveredSynthesisRun;
            } else {
                const failureReason = `[Inquiry] Synthesis pass failed after ${chunkOutputs.length} successful chunks:`
                    + ` status=${synthesisRun.aiStatus}, reason=${synthesisRun.aiReason ?? 'none'}`
                    + `, error=${synthesisRun.error ?? 'none'}`;
                console.warn(failureReason);
                const usageSummary = this.finalizeUsageAccumulator(usageAccumulator);
                return {
                    ok: false,
                    failureStage: 'synthesis',
                    failureReason,
                    tokenUsageKnown: usageSummary.tokenUsageKnown,
                    tokenUsageScope: usageSummary.tokenUsageScope,
                    usage: usageSummary.usage
                };
            }
        }

        const passCount = totalPasses;
        const usageSummary = this.finalizeUsageAccumulator(usageAccumulator);
        const hadRecoveredStages = recoveredStages.length > 0;
        const recoveryWarning = hadRecoveredStages
            ? `Inquiry recovered invalid structured output during ${recoveredStages.join(', ')}. Result marked degraded.`
            : null;
        return {
            ok: true,
            tokenUsageKnown: usageSummary.tokenUsageKnown,
            tokenUsageScope: usageSummary.tokenUsageScope,
            usage: usageSummary.usage,
            run: this.withExecutionContext({
                ...synthesisRun,
                aiReason: hadRecoveredStages ? 'recovered_invalid_response' : synthesisRun.aiReason,
                warnings: [...(synthesisRun.warnings || []), `Inquiry chunked execution used ${chunkPlan.prompts.length} chunks before synthesis.`]
                    .concat(recoveryWarning ? [recoveryWarning] : [])
            }, {
                analysisPackaging: 'automatic',
                executionPassCount: passCount,
                packagingTriggerReason: 'Single-pass request exceeded the planning budget, so structured packaging and synthesis were used.'
            })
        };
    }

    private throwIfAborted(shouldAbort?: (() => boolean) | undefined): void {
        if (shouldAbort?.()) {
            throw new Error('Inquiry run aborted.');
        }
    }

    private buildEvidenceChunkPrompts(
        userPrompt: string,
        options: {
            maxChunkTokens: number;
            estimatedInputTokens?: number;
            safeInputTokens?: number;
        }
    ): ChunkPromptPlan | null {
        const marker = '\nEvidence:\n';
        const splitAt = userPrompt.indexOf(marker);
        if (splitAt < 0) return null;
        const prefix = userPrompt.slice(0, splitAt + marker.length);
        const evidence = userPrompt.slice(splitAt + marker.length).trim();
        if (!evidence) return null;

        const maxChunkTokens = this.resolveChunkTokenBudget({
            defaultChunkTokens: options.maxChunkTokens,
            estimatedInputTokens: options.estimatedInputTokens,
            safeInputTokens: options.safeInputTokens,
            prefixChars: prefix.length,
            evidenceChars: evidence.length
        });
        const maxChars = Math.max(1200, maxChunkTokens * 4);
        const sections = evidence.split(/\n\n(?=##\s)/g).filter(Boolean);
        if (!sections.length) return null;

        const chunks: string[] = [];
        let current = '';

        const pushChunk = (text: string): void => {
            const trimmed = text.trim();
            if (trimmed.length > 0) chunks.push(trimmed);
        };

        const pushSection = (section: string): void => {
            const candidate = current ? `${current}\n\n${section}` : section;
            if (candidate.length <= maxChars) {
                current = candidate;
                return;
            }
            if (current) {
                pushChunk(current);
                current = '';
            }
            if (section.length <= maxChars) {
                current = section;
                return;
            }
            const paragraphs = section.split(/\n{2,}/g).filter(Boolean);
            let subCurrent = '';
            paragraphs.forEach(paragraph => {
                const subCandidate = subCurrent ? `${subCurrent}\n\n${paragraph}` : paragraph;
                if (subCandidate.length <= maxChars) {
                    subCurrent = subCandidate;
                } else {
                    pushChunk(subCurrent || paragraph.slice(0, maxChars));
                    subCurrent = paragraph.length > maxChars ? paragraph.slice(0, maxChars) : paragraph;
                }
            });
            if (subCurrent) pushChunk(subCurrent);
        };

        sections.forEach(pushSection);
        if (current) pushChunk(current);

        const safeInputTokens = Number.isFinite(options.safeInputTokens)
            ? Math.max(0, Math.floor(options.safeInputTokens as number))
            : 0;
        const estimatedInputTokens = Number.isFinite(options.estimatedInputTokens)
            ? Math.max(0, Math.floor(options.estimatedInputTokens as number))
            : 0;
        const targetPasses = safeInputTokens > 0 && estimatedInputTokens > 0
            ? Math.max(2, Math.ceil(estimatedInputTokens / safeInputTokens))
            : null;

        return {
            prompts: chunks.map(chunk => `${prefix}${chunk}`),
            maxChunkTokens,
            maxChunkChars: maxChars,
            evidenceChars: evidence.length,
            prefixChars: prefix.length,
            targetPasses
        };
    }

    private resolveChunkTokenBudget(params: {
        defaultChunkTokens: number;
        estimatedInputTokens?: number;
        safeInputTokens?: number;
        prefixChars: number;
        evidenceChars: number;
    }): number {
        const defaultChunkTokens = Math.max(1200, Math.floor(params.defaultChunkTokens));
        const safeInputTokens = Number.isFinite(params.safeInputTokens)
            ? Math.max(0, Math.floor(params.safeInputTokens as number))
            : 0;
        if (safeInputTokens <= 0) return defaultChunkTokens;

        const evidenceTokens = Math.max(1, estimateTokensFromChars(params.evidenceChars));
        const prefixTokens = Math.max(1, estimateTokensFromChars(params.prefixChars));
        const headroomTokens = Math.max(1500, Math.floor(safeInputTokens * 0.15));
        const safeEvidenceBudget = Math.max(1200, safeInputTokens - prefixTokens - headroomTokens);
        let targetChunkTokens = Math.max(defaultChunkTokens, safeEvidenceBudget);

        const estimatedInputTokens = Number.isFinite(params.estimatedInputTokens)
            ? Math.max(0, Math.floor(params.estimatedInputTokens as number))
            : 0;
        if (estimatedInputTokens > 0) {
            const targetPasses = Math.max(2, Math.ceil(estimatedInputTokens / safeInputTokens));
            const targetPerPassEvidence = Math.max(1200, Math.ceil(evidenceTokens / targetPasses));
            targetChunkTokens = Math.min(targetChunkTokens, targetPerPassEvidence);
        }

        return Math.max(1200, Math.min(120000, targetChunkTokens));
    }

    private tryRecoverChunkInvalidResponse(
        run: AIRunResult,
        chunkIndex: number,
        chunkTotal: number
    ): string | null {
        const recovered = this.recoverInvalidResponsePayload({
            aiReason: run.aiReason,
            content: run.content,
            parse: content => this.parseResponse(content),
            onRecovered: () => {
                console.warn(`[Inquiry] Chunk ${chunkIndex}/${chunkTotal}: recovered invalid_response via local JSON extraction.`);
            }
        });
        return recovered ? JSON.stringify(recovered) : null;
    }

    private tryRecoverSynthesisInvalidResponse(
        run: AIRunResult,
        completedChunkCount: number
    ): AIRunResult | null {
        const recovered = this.recoverInvalidResponsePayload({
            aiReason: run.aiReason,
            content: run.content,
            parse: content => this.parseResponse(content),
            onRecovered: () => {
                console.warn(`[Inquiry] Synthesis: recovered invalid_response via local JSON extraction after ${completedChunkCount} chunks.`);
            }
        });
        if (!recovered) return null;
        return {
            ...run,
            aiStatus: 'success',
            aiReason: 'recovered_invalid_response',
            content: JSON.stringify(recovered),
            warnings: [...(run.warnings || []), 'Synthesis invalid_response recovered via local JSON extraction.']
        };
    }

    private shouldAbortOnRecoveredInvalidResponse(
        phase: 'chunk' | 'synthesis',
        chunkIndex?: number
    ): boolean {
        const abortOnAnyRecovery = this.readBooleanDebugFlag('RT_INQUIRY_ABORT_ON_ANY_RECOVERY', '__RT_INQUIRY_ABORT_ON_ANY_RECOVERY__');
        if (abortOnAnyRecovery) return true;
        if (phase !== 'chunk' || chunkIndex !== 1) return false;
        return this.readBooleanDebugFlag('RT_INQUIRY_STRICT_DEBUG', '__RT_INQUIRY_STRICT_DEBUG__')
            || this.readBooleanDebugFlag('RT_INQUIRY_ABORT_ON_FIRST_RECOVERY', '__RT_INQUIRY_ABORT_ON_FIRST_RECOVERY__');
    }

    private readBooleanDebugFlag(envKey: string, globalKey: string): boolean {
        const fromEnv = typeof process !== 'undefined' && process.env?.[envKey] === '1';
        const fromGlobal = typeof globalThis !== 'undefined'
            && (globalThis as Record<string, unknown>)[globalKey] === true;
        return fromEnv || fromGlobal;
    }

    private isChunkDebugEnabled(): boolean {
        const fromEnv = typeof process !== 'undefined' && process.env?.RT_INQUIRY_CHUNK_DEBUG === '1';
        const fromGlobal = typeof globalThis !== 'undefined'
            && (globalThis as { __RT_INQUIRY_CHUNK_DEBUG__?: unknown }).__RT_INQUIRY_CHUNK_DEBUG__ === true;
        return fromEnv || fromGlobal;
    }

    private createUsageAccumulator(totalPasses: number): UsageAccumulator {
        return {
            totalPasses,
            passesWithAnyUsage: 0,
            passesWithInput: 0,
            passesWithOutput: 0,
            passesWithTotal: 0,
            passesWithCacheAwareUsage: 0,
            synthesisHasUsage: false,
            chunkHasUsage: false,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            rawInputTokens: 0,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0
        };
    }

    private recordUsage(
        accumulator: UsageAccumulator,
        usage: InquiryRunTrace['usage'] | undefined,
        phase: 'chunk' | 'synthesis'
    ): void {
        if (!usage) return;
        accumulator.passesWithAnyUsage += 1;
        if (typeof usage.inputTokens === 'number') {
            accumulator.passesWithInput += 1;
            accumulator.inputTokens += usage.inputTokens;
        }
        if (typeof usage.outputTokens === 'number') {
            accumulator.passesWithOutput += 1;
            accumulator.outputTokens += usage.outputTokens;
        }
        if (typeof usage.totalTokens === 'number') {
            accumulator.passesWithTotal += 1;
            accumulator.totalTokens += usage.totalTokens;
        }
        const hasCacheAwareUsage = typeof usage.rawInputTokens === 'number'
            || typeof usage.cacheReadInputTokens === 'number'
            || typeof usage.cacheCreationInputTokens === 'number';
        if (hasCacheAwareUsage) {
            accumulator.passesWithCacheAwareUsage += 1;
            accumulator.rawInputTokens += usage.rawInputTokens ?? 0;
            accumulator.cacheReadInputTokens += usage.cacheReadInputTokens ?? 0;
            accumulator.cacheCreationInputTokens += usage.cacheCreationInputTokens ?? 0;
        }
        if (phase === 'synthesis') {
            accumulator.synthesisHasUsage = true;
        } else {
            accumulator.chunkHasUsage = true;
        }
    }

    private finalizeUsageAccumulator(accumulator: UsageAccumulator): {
        tokenUsageKnown: boolean;
        tokenUsageScope?: InquiryTokenUsageScope;
        usage?: InquiryRunTrace['usage'];
    } {
        if (accumulator.passesWithAnyUsage <= 0) {
            return { tokenUsageKnown: false };
        }

        const synthesisOnly = accumulator.passesWithAnyUsage === 1
            && accumulator.synthesisHasUsage
            && !accumulator.chunkHasUsage;
        const fullInputKnown = accumulator.passesWithInput === accumulator.totalPasses;
        const fullOutputKnown = accumulator.passesWithOutput === accumulator.totalPasses;
        const fullTotalKnown = accumulator.passesWithTotal === accumulator.totalPasses
            || (fullInputKnown && fullOutputKnown);
        const fullCacheAwareKnown = accumulator.passesWithCacheAwareUsage === accumulator.totalPasses;
        const usageScope: InquiryTokenUsageScope = synthesisOnly
            ? 'synthesis_only'
            : (accumulator.passesWithAnyUsage === accumulator.totalPasses && fullTotalKnown
                ? 'full'
                : 'partial');
        const usage = synthesisOnly
            ? {
                inputTokens: accumulator.passesWithInput > 0 ? accumulator.inputTokens : undefined,
                outputTokens: accumulator.passesWithOutput > 0 ? accumulator.outputTokens : undefined,
                totalTokens: accumulator.passesWithTotal > 0
                    ? accumulator.totalTokens
                    : (accumulator.passesWithInput > 0 && accumulator.passesWithOutput > 0
                        ? accumulator.inputTokens + accumulator.outputTokens
                        : undefined),
                rawInputTokens: accumulator.passesWithCacheAwareUsage > 0
                    ? accumulator.rawInputTokens
                    : undefined,
                cacheReadInputTokens: accumulator.passesWithCacheAwareUsage > 0
                    ? accumulator.cacheReadInputTokens
                    : undefined,
                cacheCreationInputTokens: accumulator.passesWithCacheAwareUsage > 0
                    ? accumulator.cacheCreationInputTokens
                    : undefined
            }
            : {
                inputTokens: fullInputKnown ? accumulator.inputTokens : undefined,
                outputTokens: fullOutputKnown ? accumulator.outputTokens : undefined,
                totalTokens: fullTotalKnown
                    ? (accumulator.passesWithTotal === accumulator.totalPasses
                        ? accumulator.totalTokens
                        : accumulator.inputTokens + accumulator.outputTokens)
                    : undefined,
                rawInputTokens: fullCacheAwareKnown ? accumulator.rawInputTokens : undefined,
                cacheReadInputTokens: fullCacheAwareKnown ? accumulator.cacheReadInputTokens : undefined,
                cacheCreationInputTokens: fullCacheAwareKnown ? accumulator.cacheCreationInputTokens : undefined
            };
        return {
            tokenUsageKnown: true,
            tokenUsageScope: usageScope,
            usage
        };
    }

    private parseResponse(content: string): RawInquiryResponse {
        return this.parseJsonFromContent<RawInquiryResponse>(content);
    }

    private parseOmnibusResponse(content: string): RawOmnibusResponse {
        return this.parseJsonFromContent<RawOmnibusResponse>(content);
    }

    private parseJsonFromContent<T>(content: string): T {
        const jsonText = this.extractJson(content);
        if (!jsonText) {
            throw new Error('Unable to locate JSON in AI response.');
        }
        return JSON.parse(jsonText) as T;
    }

    private extractJson(content: string): string | null {
        const trimmed = content.trim();
        if (!trimmed) return null;
        const blockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (blockMatch) {
            return blockMatch[1].trim();
        }
        const firstBrace = trimmed.indexOf('{');
        const lastBrace = trimmed.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            return trimmed.slice(firstBrace, lastBrace + 1);
        }
        return null;
    }

    private buildSceneRefLedger(evidenceBlocks?: EvidenceBlock[]): SceneRefLedger {
        const allowedSceneIds = new Set<string>();
        const ledgerLines: string[] = [];
        (evidenceBlocks || []).forEach(block => {
            const meta = block.meta;
            if (!meta || meta.evidenceClass !== 'scene' || !isStableSceneId(meta.sceneId)) return;
            const sceneId = String(meta.sceneId).trim().toLowerCase();
            if (allowedSceneIds.has(sceneId)) return;
            allowedSceneIds.add(sceneId);
            const title = (meta.title || '').replace(/\s+/g, ' ').trim() || sceneId;
            const path = (meta.path || '').trim();
            ledgerLines.push(path ? `- ${sceneId} | ${title} | ${path}` : `- ${sceneId} | ${title}`);
        });
        const synthesisBlock = ledgerLines.length
            ? [
                'Allowed scene refs for findings:',
                'Reuse only these exact ref_id values in the final result.',
                ...ledgerLines
            ].join('\n')
            : '';
        return { allowedSceneIds, synthesisBlock };
    }

    private assessChunkRefHealth(
        content: string,
        allowedSceneIds: Set<string>
    ): { ok: true } | { ok: false; reason: string } {
        let parsed: RawInquiryResponse;
        try {
            parsed = this.parseResponse(content);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return { ok: false, reason: `pass 1 could not be parsed (${message}).` };
        }

        const findings = Array.isArray(parsed.findings) ? parsed.findings : [];
        const invalidRefs = findings
            .map(finding => String(finding.ref_id || '').trim().toLowerCase())
            .filter(refId => !!refId && !allowedSceneIds.has(refId));

        if (invalidRefs.length) {
            return { ok: false, reason: `pass 1 returned scene refs outside the active corpus: ${invalidRefs.join(', ')}.` };
        }

        const bindableFindings = findings.filter(finding => {
            const refId = String(finding.ref_id || '').trim().toLowerCase();
            return !!refId && allowedSceneIds.has(refId);
        });

        if (findings.length > 0 && bindableFindings.length === 0) {
            return { ok: false, reason: 'pass 1 returned findings, but none referenced a valid scene in the active corpus.' };
        }

        return { ok: true };
    }

    private buildResult(
        input: InquiryRunnerInput,
        parsed: RawInquiryResponse,
        aiMeta: Pick<InquiryResult, 'aiProvider' | 'aiModelRequested' | 'aiModelResolved' | 'aiStatus' | 'aiReason'>,
        citations?: InquiryCitation[],
        evidenceDocumentMeta?: EvidenceDocumentMeta[]
    ): InquiryResult {
        const verdict = parsed.verdict || {};
        const flow = this.normalizeScore(verdict.flow);
        const depth = this.normalizeScore(verdict.depth);
        const impact = this.normalizeImpact(verdict.impact ?? verdict.severity);
        const assessmentConfidence = this.normalizeAssessmentConfidence(verdict.assessmentConfidence ?? verdict.confidence);

        const findings = Array.isArray(parsed.findings) ? parsed.findings : [];
        const sceneRefIndex = this.buildCanonicalSceneRefIndex(input);
        this.assertFindingRefsResolve(findings, sceneRefIndex);
        const mappedFindings = findings.map(finding => this.mapFinding(finding, sceneRefIndex));

        const summaryFlow = parsed.summaryFlow
            ? String(parsed.summaryFlow)
            : (parsed.summary ? String(parsed.summary) : 'No summary provided.');
        const summaryDepth = parsed.summaryDepth
            ? String(parsed.summaryDepth)
            : (parsed.summary ? String(parsed.summary) : summaryFlow);
        const summary = parsed.summary
            ? String(parsed.summary)
            : (summaryFlow || summaryDepth || 'No summary provided.');

        return {
            runId: `run-${Date.now()}`,
            scope: input.scope,
            scopeLabel: input.scopeLabel,
            mode: input.mode,
            questionId: input.questionId,
            questionZone: input.questionZone,
            summary,
            summaryFlow,
            summaryDepth,
            verdict: {
                flow,
                depth,
                impact,
                assessmentConfidence
            },
            findings: mappedFindings,
            corpusFingerprint: input.corpus.fingerprint,
            ...aiMeta,
            ...(citations?.length ? { citations } : {}),
            ...(evidenceDocumentMeta?.length ? { evidenceDocumentMeta } : {})
        };
    }

    private buildOmnibusResults(
        input: InquiryOmnibusInput,
        parsed: RawOmnibusResponse,
        aiMeta: Pick<InquiryResult, 'aiProvider' | 'aiModelRequested' | 'aiModelResolved' | 'aiStatus' | 'aiReason'>,
        trace: InquiryRunTrace,
        citations?: InquiryCitation[],
        evidenceDocumentMeta?: EvidenceDocumentMeta[]
    ): InquiryResult[] {
        const results = Array.isArray(parsed.results) ? parsed.results : [];
        const resultsById = new Map<string, RawOmnibusQuestionResult>();
        const resultsByIndex = new Map<number, RawOmnibusQuestionResult>();

        results.forEach((entry, index) => {
            const id = typeof entry.question_id === 'string'
                ? entry.question_id
                : (typeof entry.questionId === 'string' ? entry.questionId : '');
            if (id) {
                resultsById.set(id, entry);
                return;
            }
            resultsByIndex.set(index, entry);
        });

        const built: InquiryResult[] = [];
        input.questions.forEach((question, index) => {
            const raw = resultsById.get(question.id) ?? resultsByIndex.get(index);
            const questionInput = this.buildOmnibusQuestionInput(input, question);
            if (!raw) {
                trace.notes.push(`Omnibus response missing question: ${question.id}.`);
                built.push(this.buildOmnibusMissingResult(questionInput, aiMeta));
                return;
            }
            built.push(this.buildResult(questionInput, raw, aiMeta, citations, evidenceDocumentMeta));
        });

        return built;
    }

    private buildOmnibusStubResults(
        input: InquiryOmnibusInput,
        aiMeta: Pick<InquiryResult, 'aiProvider' | 'aiModelRequested' | 'aiModelResolved' | 'aiStatus' | 'aiReason'>,
        error?: unknown
    ): InquiryResult[] {
        return input.questions.map(question => {
            const questionInput = this.buildOmnibusQuestionInput(input, question);
            return this.buildStubResult(questionInput, aiMeta, error);
        });
    }

    private buildOmnibusMissingResult(
        input: InquiryRunnerInput,
        aiMeta: Pick<InquiryResult, 'aiProvider' | 'aiModelRequested' | 'aiModelResolved' | 'aiStatus' | 'aiReason'>
    ): InquiryResult {
        const fallbackMeta = {
            ...aiMeta,
            aiStatus: 'rejected' as InquiryAiStatus,
            aiReason: 'invalid_response'
        };
        return this.buildStubResult(input, fallbackMeta, new Error('Omnibus response missing this question.'));
    }

    private buildOmnibusQuestionInput(
        input: InquiryOmnibusInput,
        question: InquiryOmnibusQuestion
    ): InquiryRunnerInput {
        return {
            scope: input.scope,
            scopeLabel: input.scopeLabel,
            targetSceneIds: input.targetSceneIds,
            selectionMode: input.selectionMode,
            activeBookId: input.activeBookId,
            mode: input.mode,
            questionId: question.id,
            questionText: question.question,
            questionZone: question.zone,
            corpus: input.corpus,
            rules: input.rules,
            ai: input.ai
        };
    }

    private mapFinding(
        raw: RawInquiryFinding,
        sceneRefIndex: ReturnType<typeof buildSceneRefIndex>
    ): InquiryFinding {
        const kind = this.normalizeFindingKind(raw.kind);
        const normalizedRef = this.normalizeFindingRef(raw, sceneRefIndex);
        const lens = this.normalizeFindingLens(raw.lens);
        const bullets = Array.isArray(raw.bullets)
            ? raw.bullets.map(value => String(value)).filter(Boolean)
            : [];
        return {
            refId: normalizedRef.ref_id,
            kind,
            status: kind === 'none' ? 'resolved' : 'unclear',
            impact: this.normalizeImpact(raw.impact ?? raw.severity),
            assessmentConfidence: this.normalizeAssessmentConfidence(raw.assessmentConfidence ?? raw.confidence),
            headline: raw.headline ? String(raw.headline) : 'Finding',
            bullets,
            related: [],
            evidenceType: 'mixed',
            lens,
            role: this.normalizeFindingRole(raw.role)
        };
    }

    private buildCanonicalSceneRefIndex(input: InquiryRunnerInput): ReturnType<typeof buildSceneRefIndex> {
        type SceneRefIndexEntry = Parameters<typeof buildSceneRefIndex>[0][number];
        const entries: SceneRefIndexEntry[] = [];

        input.corpus.entries
            .filter(entry => entry.class === 'scene')
            .forEach(entry => {
                const sceneId = this.resolveCanonicalSceneId(entry.sceneId);
                if (!sceneId) return;
                const file = this.vault.getAbstractFileByPath(entry.path);
                const filename = entry.path.split('/').pop() || entry.path;
                const stem = filename.replace(/\.[^.]+$/i, '');
                let title = stem;
                let sceneNumber: number | undefined;
                const aliases = new Set<string>([filename, stem]);

                if (file && this.isTFile(file)) {
                    const frontmatter = this.getFrontmatter(file);
                    title = this.getSceneTitle(file, frontmatter) || stem;
                    sceneNumber = this.extractSceneNumber(frontmatter) ?? this.extractSceneNumberFromText(file.basename);
                    aliases.add(file.basename);
                    aliases.add(file.path);
                } else {
                    sceneNumber = this.extractSceneNumberFromText(stem);
                }

                if (title) aliases.add(title);
                if (sceneNumber !== undefined) {
                    aliases.add(String(sceneNumber));
                    aliases.add(`S${sceneNumber}`);
                    aliases.add(`Scene ${sceneNumber}`);
                }

                entries.push({
                    sceneId,
                    path: entry.path,
                    label: filename,
                    sceneNumber,
                    title,
                    aliases: Array.from(aliases)
                });
            });

        return buildSceneRefIndex(entries);
    }

    private resolveFindingFallbackRefId(input: InquiryRunnerInput): string {
        const primaryTargetSceneId = input.targetSceneIds.find(sceneId => isStableSceneId(sceneId));
        if (primaryTargetSceneId) {
            return primaryTargetSceneId.trim().toLowerCase();
        }
        const firstSceneId = input.corpus.entries.find(entry => entry.class === 'scene' && isStableSceneId(entry.sceneId))?.sceneId;
        if (firstSceneId) return firstSceneId.toLowerCase();
        if (isStableSceneId(input.scopeLabel)) return input.scopeLabel.trim().toLowerCase();
        return input.scopeLabel;
    }

    private normalizeFindingRef(
        raw: RawInquiryFinding,
        sceneRefIndex: ReturnType<typeof buildSceneRefIndex>
    ): SceneRef {
        const normalized = normalizeSceneRef({
            ref_id: raw.ref_id ? String(raw.ref_id) : undefined,
            ref_label: raw.ref_label ? String(raw.ref_label) : undefined,
            ref_path: raw.ref_path ? String(raw.ref_path) : undefined
        }, sceneRefIndex);

        if (normalized.warning) {
            console.warn(`[Inquiry] ${normalized.warning}`);
        }
        return normalized.ref;
    }

    private assertFindingRefsResolve(
        findings: RawInquiryFinding[],
        sceneRefIndex: ReturnType<typeof buildSceneRefIndex>
    ): void {
        const unresolved = findings
            .map(finding => {
                const normalized = normalizeSceneRef({
                    ref_id: finding.ref_id ? String(finding.ref_id) : undefined,
                    ref_label: finding.ref_label ? String(finding.ref_label) : undefined,
                    ref_path: finding.ref_path ? String(finding.ref_path) : undefined
                }, sceneRefIndex);
                if (!normalized.unresolved) return null;
                return finding.ref_id || finding.ref_label || finding.ref_path || '(missing ref)';
            })
            .filter((value): value is string => !!value);
        if (!unresolved.length) return;
        throw new Error(`AI response referenced scenes outside the active corpus: ${unresolved.join(', ')}`);
    }

    private resolveCanonicalSceneId(value: string | undefined): string | undefined {
        if (!isStableSceneId(value)) return undefined;
        return String(value).trim().toLowerCase();
    }

    private buildStubResult(
        input: InquiryRunnerInput,
        aiMeta: Pick<InquiryResult, 'aiProvider' | 'aiModelRequested' | 'aiModelResolved' | 'aiStatus' | 'aiReason'>,
        error?: unknown
    ): InquiryResult {
        const message = error instanceof Error ? error.message : error ? String(error) : '';
        const summary = this.buildStubSummary(aiMeta.aiStatus, aiMeta.aiReason, message);
        const bullets = message ? [`Runner note: ${message}`] : ['Deterministic placeholder result.'];
        const fallbackRefId = this.resolveFindingFallbackRefId(input);

        return {
            runId: `run-${Date.now()}`,
            scope: input.scope,
            scopeLabel: input.scopeLabel,
            mode: input.mode,
            questionId: input.questionId,
            questionZone: input.questionZone,
            summary,
            summaryFlow: summary,
            summaryDepth: summary,
            verdict: {
                flow: 0.6,
                depth: 0.55,
                impact: 'low',
                assessmentConfidence: 'low'
            },
            findings: [{
                refId: fallbackRefId,
                kind: 'unclear',
                status: 'unclear',
                impact: 'low',
                assessmentConfidence: 'low',
                headline: 'Inquiry stub result.',
                bullets,
                related: [],
                evidenceType: 'mixed',
                lens: 'both'
            }],
            corpusFingerprint: input.corpus.fingerprint,
            ...aiMeta
        };
    }

    private getAiMetaFromResponse(response: ProviderResult): Pick<InquiryResult, 'aiProvider' | 'aiModelRequested' | 'aiModelResolved' | 'aiStatus' | 'aiReason'> {
        const aiStatus = response.aiStatus === 'success' && response.aiReason === 'recovered_invalid_response'
            ? 'degraded'
            : response.aiStatus;
        return {
            aiProvider: response.aiProvider,
            aiModelRequested: response.aiModelRequested,
            aiModelResolved: response.aiModelResolved,
            aiStatus,
            aiReason: response.aiReason
        };
    }

    private buildFallbackAiMeta(
        input: Pick<InquiryRunnerInput, 'ai'>
    ): Pick<InquiryResult, 'aiProvider' | 'aiModelRequested' | 'aiModelResolved' | 'aiStatus' | 'aiReason'> {
        return {
            aiProvider: input.ai.provider,
            aiModelRequested: input.ai.modelId,
            aiModelResolved: input.ai.modelId,
            aiStatus: 'unavailable',
            aiReason: 'exception'
        };
    }

    private withParseFailureMeta(
        meta: Pick<InquiryResult, 'aiProvider' | 'aiModelRequested' | 'aiModelResolved' | 'aiStatus' | 'aiReason'>,
        aiStatus: InquiryAiStatus
    ): Pick<InquiryResult, 'aiProvider' | 'aiModelRequested' | 'aiModelResolved' | 'aiStatus' | 'aiReason'> {
        if (aiStatus === 'success') {
            return { ...meta, aiStatus: 'rejected', aiReason: 'invalid_response' };
        }
        return meta;
    }

    private withRecoveredInvalidResponseMeta(
        meta: Pick<InquiryResult, 'aiProvider' | 'aiModelRequested' | 'aiModelResolved' | 'aiStatus' | 'aiReason'>
    ): Pick<InquiryResult, 'aiProvider' | 'aiModelRequested' | 'aiModelResolved' | 'aiStatus' | 'aiReason'> {
        return {
            ...meta,
            aiStatus: 'degraded',
            aiReason: 'recovered_invalid_response'
        };
    }

    private recoverInvalidResponsePayload<T>(params: {
        aiReason?: string;
        content: string | null;
        parse: (content: string) => T;
        onRecovered?: () => void;
        onFailure?: (message: string) => void;
    }): T | null {
        if (!params.content || params.aiReason !== 'invalid_response') return null;
        try {
            const recovered = params.parse(params.content);
            params.onRecovered?.();
            return recovered;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            params.onFailure?.(message);
            return null;
        }
    }

    private tryRecoverSingleInvalidResponse(
        input: InquiryRunnerInput,
        response: ProviderResult,
        trace: InquiryRunTrace,
        context: string,
        evidenceDocumentMeta?: EvidenceDocumentMeta[]
    ): InquiryResult | null {
        const recovered = this.recoverInvalidResponsePayload({
            aiReason: response.aiReason,
            content: response.content,
            parse: content => this.parseResponse(content),
            onRecovered: () => {
                trace.notes.push(`${context}: recovered from invalid_response via local JSON extraction.`);
            },
            onFailure: message => {
                trace.notes.push(`${context}: invalid_response recovery failed (${message}).`);
            }
        });
        if (!recovered) return null;
        const recoveredMeta = this.withRecoveredInvalidResponseMeta(this.getAiMetaFromResponse(response));
        try {
            return this.buildResult(input, recovered, recoveredMeta, response.citations, evidenceDocumentMeta);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            trace.notes.push(`${context}: recovered payload still failed validation (${message}).`);
            return null;
        }
    }

    private tryRecoverOmnibusInvalidResponse(
        input: InquiryOmnibusInput,
        response: ProviderResult,
        trace: InquiryRunTrace,
        context: string,
        evidenceDocumentMeta?: EvidenceDocumentMeta[]
    ): { results: InquiryResult[]; trace: InquiryRunTrace; rawResponse: RawOmnibusResponse } | null {
        const recovered = this.recoverInvalidResponsePayload({
            aiReason: response.aiReason,
            content: response.content,
            parse: content => this.parseOmnibusResponse(content),
            onRecovered: () => {
                trace.notes.push(`${context}: recovered omnibus response from invalid_response via local JSON extraction.`);
            },
            onFailure: message => {
                trace.notes.push(`${context}: omnibus invalid_response recovery failed (${message}).`);
            }
        });
        if (!recovered) return null;
        const recoveredMeta = this.withRecoveredInvalidResponseMeta(this.getAiMetaFromResponse(response));
        try {
            return {
                results: this.buildOmnibusResults(input, recovered, recoveredMeta, trace, response.citations, evidenceDocumentMeta),
                trace,
                rawResponse: recovered
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            trace.notes.push(`${context}: recovered omnibus payload still failed validation (${message}).`);
            return null;
        }
    }

    private buildStubSummary(aiStatus?: InquiryAiStatus, aiReason?: string, message?: string): string {
        if (aiStatus === 'degraded') {
            return 'AI response recovered from invalid structured output.';
        }
        if (aiStatus === 'rejected' && aiReason === 'unsupported_param') {
            return 'AI request rejected: unsupported parameter.';
        }
        if (aiStatus === 'rejected') {
            return 'AI request rejected.';
        }
        if (aiStatus === 'auth') {
            return 'AI request failed: authentication error.';
        }
        if (aiStatus === 'timeout') {
            return 'AI request timed out.';
        }
        if (aiStatus === 'rate_limit') {
            return 'AI request rate limited.';
        }
        if (aiStatus === 'unavailable') {
            return 'Stub result returned (AI unavailable).';
        }
        return message ? 'Stub result returned (AI unavailable).' : 'Preview result for inquiry.';
    }

    private normalizeScore(value: unknown): number {
        if (typeof value === 'number' && Number.isFinite(value)) {
            if (value > 1 && value <= 100) return value / 100;
            return Math.min(Math.max(value, 0), 1);
        }
        if (typeof value === 'string') {
            const parsed = Number(value);
            if (!Number.isFinite(parsed)) return 0;
            if (parsed > 1 && parsed <= 100) return parsed / 100;
            return Math.min(Math.max(parsed, 0), 1);
        }
        return 0;
    }

    private normalizeImpact(value: unknown): InquirySeverity {
        const normalized = typeof value === 'string' ? value.toLowerCase().trim() : '';
        if (normalized === 'high' || normalized === 'medium' || normalized === 'low') {
            return normalized as InquirySeverity;
        }
        return 'low';
    }

    private normalizeAssessmentConfidence(value: unknown): InquiryConfidence {
        const normalized = typeof value === 'string' ? value.toLowerCase().trim() : '';
        if (normalized === 'high' || normalized === 'medium' || normalized === 'low') {
            return normalized as InquiryConfidence;
        }
        return 'low';
    }

    private normalizeFindingKind(value?: string): InquiryFinding['kind'] {
        const normalized = value ? value.toLowerCase().trim() : '';
        const allowed: InquiryFinding['kind'][] = [
            'none',
            'loose_end',
            'continuity',
            'escalation',
            'conflict',
            'unclear',
            'error',
            'strength'
        ];
        if (allowed.includes(normalized as InquiryFinding['kind'])) {
            return normalized as InquiryFinding['kind'];
        }
        return 'unclear';
    }

    private normalizeFindingLens(value?: string): InquiryFinding['lens'] | undefined {
        const normalized = value ? value.toLowerCase().trim() : '';
        if (normalized === 'flow' || normalized === 'depth' || normalized === 'both') {
            return normalized as InquiryFinding['lens'];
        }
        return undefined;
    }

    private normalizeFindingRole(value?: string): InquiryFinding['role'] | undefined {
        const normalized = value ? value.toLowerCase().trim() : '';
        if (normalized === 'target' || normalized === 'context') {
            return normalized as InquiryFinding['role'];
        }
        return undefined;
    }

    private getFrontmatter(file: TFile): Record<string, unknown> {
        const cache = this.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter as Record<string, unknown> | undefined;
        if (!frontmatter) return {};
        return normalizeFrontmatterKeys(frontmatter, this.frontmatterMappings);
    }

    /**
     * Extract extended Summary from frontmatter for Inquiry context.
     * Reads exclusively from frontmatter["Summary"]. Synopsis is never used.
     */
    private extractSummary(frontmatter: Record<string, unknown>): string {
        const raw = frontmatter['Summary'];
        if (Array.isArray(raw)) {
            return raw.map(value => String(value)).join('\n').trim();
        }
        if (typeof raw === 'string') return raw.trim();
        if (raw === null || raw === undefined) return '';
        return String(raw).trim();
    }

    private extractSceneNumber(frontmatter: Record<string, unknown>): number | undefined {
        const value = frontmatter['Scene Number'];
        if (value === undefined || value === null) return undefined;
        const parsed = Number(typeof value === 'string' ? value.trim() : value);
        if (!Number.isFinite(parsed)) return undefined;
        return Math.max(1, Math.floor(parsed));
    }

    private extractSceneNumberFromText(value: string | undefined): number | undefined {
        if (!value) return undefined;
        const text = value.trim();
        if (!text) return undefined;

        const match = text.match(/^(\d{1,4})(?:\D|$)/)
            || text.match(/\bscene[\s._-]*(\d{1,4})\b/i)
            || text.match(/\bs(\d{1,4})\b/i);
        if (!match) return undefined;

        const parsed = Number(match[1]);
        if (!Number.isFinite(parsed)) return undefined;
        return Math.max(1, Math.floor(parsed));
    }

    private getReferenceTitle(file: TFile): string {
        const frontmatter = this.getFrontmatter(file);
        const rawTitle = frontmatter['Title'] ?? frontmatter['title'];
        if (typeof rawTitle === 'string' && rawTitle.trim()) {
            return rawTitle.trim();
        }
        return file.basename;
    }

    private clampLabelNumber(value: number): number {
        if (!Number.isFinite(value)) return 1;
        return Math.min(Math.max(Math.floor(value), 1), 999);
    }

    private isTFile(file: { path: string } | TFile): file is TFile {
        return file instanceof TFile;
    }

    private async buildInitialTrace(
        input: InquiryRunnerInput
    ): Promise<{ trace: InquiryRunTrace; evidenceBlocks: EvidenceBlock[] }> {
        const notes: string[] = [];
        const sanitizationNotes: string[] = [];
        let evidenceBlocks: EvidenceBlock[] = [];

        try {
            evidenceBlocks = await this.buildEvidenceBlocks(input);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            notes.push(`Evidence build error: ${message}`);
            evidenceBlocks = [{ label: 'Evidence', content: 'Unable to build evidence blocks.' }];
        }

        const { systemPrompt, userPrompt, evidenceText } = this.buildPrompt(input, evidenceBlocks);
        const outputTokenCap = this.getOutputTokenCap(input.ai.provider);
        const tokenEstimate = await this.buildTokenEstimate(
            systemPrompt,
            userPrompt,
            outputTokenCap,
            input.ai,
            evidenceBlocks,
            this.getJsonSchema(),
            input.questionText
        );
        const trace: InquiryRunTrace = {
            systemPrompt,
            userPrompt,
            evidenceText,
            tokenEstimate,
            outputTokenCap,
            response: null,
            sanitizationNotes,
            notes
        };

        return { trace, evidenceBlocks };
    }

    private async buildOmnibusTrace(
        input: InquiryOmnibusInput
    ): Promise<{ trace: InquiryRunTrace; evidenceBlocks: EvidenceBlock[] }> {
        const notes: string[] = [];
        const sanitizationNotes: string[] = [];
        let evidenceBlocks: EvidenceBlock[] = [];

        try {
            evidenceBlocks = await this.buildEvidenceBlocks({
                scope: input.scope,
                scopeLabel: input.scopeLabel,
                targetSceneIds: input.targetSceneIds,
                selectionMode: input.selectionMode,
                activeBookId: input.activeBookId,
                mode: input.mode,
                questionId: 'omnibus',
                questionText: '',
                questionZone: 'setup',
                corpus: input.corpus,
                rules: input.rules,
                ai: input.ai
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            notes.push(`Evidence build error: ${message}`);
            evidenceBlocks = [{ label: 'Evidence', content: 'Unable to build evidence blocks.' }];
        }

        notes.push(`Omnibus run: ${input.questions.length} questions.`);
        const { systemPrompt, userPrompt, evidenceText } = this.buildOmnibusPrompt(input, evidenceBlocks);
        const outputTokenCap = this.getOutputTokenCap(input.ai.provider);
        const tokenEstimate = await this.buildTokenEstimate(
            systemPrompt,
            userPrompt,
            outputTokenCap,
            input.ai,
            evidenceBlocks,
            this.getOmnibusJsonSchema(),
            input.questions.map(question => question.question).join('\n')
        );
        const trace: InquiryRunTrace = {
            systemPrompt,
            userPrompt,
            evidenceText,
            tokenEstimate,
            outputTokenCap,
            response: null,
            sanitizationNotes,
            notes
        };

        return { trace, evidenceBlocks };
    }

    private async buildTokenEstimate(
        systemPrompt: string,
        userPrompt: string,
        outputTokens: number,
        ai: InquiryRunnerInput['ai'],
        evidenceBlocks: EvidenceBlock[],
        jsonSchema: Record<string, unknown>,
        userQuestion?: string
    ): Promise<InquiryRunTrace['tokenEstimate']> {
        const inputChars = (systemPrompt?.length ?? 0) + (userPrompt?.length ?? 0);
        const cacheKey = this.hashText(`${ai.provider}|${ai.modelId}|${inputChars}|${outputTokens}|${systemPrompt}|${userPrompt}|${userQuestion ?? ''}`);
        const cached = this.tokenEstimateCache.get(cacheKey);
        if (cached) return cached;

        const aiClient = getAIClient(this.plugin);
        const prepared = await this.prepareInquiryRunEstimate(aiClient, {
            task: 'InquiryTraceEstimate',
            systemPrompt,
            userPrompt,
            userQuestion,
            ai,
            jsonSchema,
            temperature: 0.2,
            maxTokens: outputTokens,
            evidenceBlocks
        });
        const inputTokens = prepared?.tokenEstimateInput
            ?? estimateTokensFromChars(inputChars);
        const tokenEstimate: InquiryRunTrace['tokenEstimate'] = {
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
            inputChars,
            estimationMethod: prepared?.tokenEstimateMethod ?? 'heuristic_chars',
            uncertaintyTokens: prepared?.tokenEstimateUncertainty ?? 0,
            effectiveInputCeiling: prepared?.effectiveInputCeiling,
            expectedPassCount: prepared?.expectedPassCount
        };
        const filesIncluded = Array.from(new Set(
            evidenceBlocks
                .map(block => block.meta?.path || block.label)
                .filter(Boolean)
        )).sort((a, b) => a.localeCompare(b));
        let sceneCount = 0;
        let outlineCount = 0;
        let referenceCount = 0;
        evidenceBlocks.forEach(block => {
            if (block.meta?.evidenceClass === 'scene') {
                sceneCount += 1;
                return;
            }
            if (block.meta?.evidenceClass === 'outline') {
                outlineCount += 1;
                return;
            }
            referenceCount += 1;
        });
        const totalEvidenceChars = evidenceBlocks.reduce((sum, block) => (
            sum + block.label.length + block.content.length + 6
        ), 0);
        const promptEnvelopeCharsAdded = prepared
            ? ((prepared.systemPrompt?.length ?? 0) + (prepared.userPrompt?.length ?? 0))
            : inputChars;
        logCountingForensics({
            path: 'inquiry',
            phase: 'run_trace',
            filesIncluded,
            sceneCount,
            outlineCount,
            referenceCount,
            totalEvidenceChars,
            promptEnvelopeCharsAdded,
            tokenMethodUsed: tokenEstimate.estimationMethod ?? 'heuristic_chars',
            finalTokenEstimate: tokenEstimate.inputTokens
        });
        this.tokenEstimateCache.set(cacheKey, tokenEstimate);
        return tokenEstimate;
    }

    private getOutputTokenCap(provider: InquiryAiProvider): number {
        const providerCap = PROVIDER_MAX_OUTPUT_TOKENS[provider] ?? INQUIRY_MAX_OUTPUT_TOKENS;
        return Math.max(512, Math.min(providerCap, INQUIRY_MAX_OUTPUT_TOKENS));
    }

    private applyResponseExecutionReporting(trace: InquiryRunTrace, response: ProviderResult): void {
        const usage = response.usage ?? this.extractUsage(response.aiProvider ?? response.provider, response.responseData);
        if (usage) {
            trace.usage = usage;
        }
        trace.tokenUsageKnown = response.tokenUsageKnown ?? !!usage;
        trace.tokenUsageScope = response.tokenUsageScope;

        const executionState = response.executionState ?? this.inferExecutionState(response);
        trace.executionState = executionState;
        trace.executionPath = response.executionPath
            ?? ((typeof response.executionPassCount === 'number' && response.executionPassCount > 1)
                ? 'multi_pass'
                : 'one_pass');
        trace.cacheReuseState = response.cacheReuseState;
        trace.cacheStatus = response.cacheStatus;
        trace.cachedStableRatio = response.cachedStableRatio;
        trace.cachedStableTokens = response.cachedStableTokens;

        if (response.failureStage) {
            trace.failureStage = response.failureStage;
            return;
        }
        if (response.aiStatus === 'success' && response.success) {
            trace.failureStage = undefined;
            return;
        }
        trace.failureStage = executionState === 'blocked_before_send'
            ? 'preflight'
            : 'provider_response_parsing';
    }

    private applyOpenAiTransportLaneTraceNote(trace: InquiryRunTrace, response: ProviderResult): void {
        if (response.aiProvider !== 'openai' || !response.aiTransportLane) return;
        trace.openAiTransportLane = response.aiTransportLane;
        const note = `OpenAI transport lane: ${response.aiTransportLane}.`;
        if (!trace.notes.includes(note)) {
            trace.notes.push(note);
        }
    }

    private inferExecutionState(response: ProviderResult): InquiryExecutionState {
        if (response.aiReason === 'packaging_failed') return 'packaging_failed';
        if (response.aiStatus === 'rejected'
            && typeof response.error === 'string'
            && isSinglePassPlanningBudgetError(response.error)) {
            return 'blocked_before_send';
        }
        return 'dispatched_to_provider';
    }

    private extractUsage(provider: string | undefined, responseData: unknown): InquiryRunTrace['usage'] | undefined {
        return extractTokenUsage(provider, responseData) ?? undefined;
    }
}
