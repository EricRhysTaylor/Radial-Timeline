import { TFile } from 'obsidian';
import type { MetadataCache, Vault } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { normalizeFrontmatterKeys } from '../../utils/frontmatter';
import { INQUIRY_MAX_OUTPUT_TOKENS, INQUIRY_SCHEMA_VERSION } from '../constants';
import { PROVIDER_MAX_OUTPUT_TOKENS } from '../../constants/tokenLimits';
import type { InquiryAiStatus, InquiryConfidence, InquiryFinding, InquiryResult, InquirySeverity } from '../state';
import type {
    CorpusManifestEntry,
    InquiryAiProvider,
    InquiryOmnibusInput,
    InquiryOmnibusQuestion,
    InquiryRunTrace,
    InquiryRunner,
    InquiryRunnerInput
} from './types';
import { getAIClient } from '../../ai/runtime/aiClient';
import { buildDefaultAiSettings, mapAiProviderToLegacyProvider, mapLegacyProviderToAiProvider } from '../../ai/settings/aiSettings';
import { validateAiSettings } from '../../ai/settings/validateAiSettings';
import { BUILTIN_MODELS } from '../../ai/registry/builtinModels';
import { selectModel } from '../../ai/router/selectModel';
import { computeCaps } from '../../ai/caps/computeCaps';
import type { AIRunResult, AnalysisPackaging, AIProviderId, AccessTier, SceneRef } from '../../ai/types';
import { readSceneId, resolveSceneReferenceId } from '../../utils/sceneIds';
import { buildSceneRefIndex, isStableSceneId, normalizeSceneRef } from '../../ai/references/sceneRefNormalizer';
import { cleanEvidenceBody } from '../utils/evidenceCleaning';

export { cleanEvidenceBody } from '../utils/evidenceCleaning';

const BOOK_FOLDER_REGEX = /^Book\s+(\d+)/i;

type EvidenceBlock = {
    label: string;
    content: string;
};

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
};

export class InquiryRunnerService implements InquiryRunner {
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
        input: InquiryRunnerInput
    ): Promise<{ result: InquiryResult; trace: InquiryRunTrace }> {
        const { trace } = await this.buildInitialTrace(input);
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
                input.questionText
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
            const usage = this.extractUsage(response.responseData);
            if (usage) trace.usage = usage;

            if (!response.success || !response.content || response.aiStatus !== 'success') {
                const status = response.aiStatus || 'unknown';
                const reason = response.aiReason ? ` (${response.aiReason})` : '';
                trace.notes.push(`Provider status: ${status}${reason}.`);
                if (response.error) {
                    trace.notes.push(`Provider error: ${response.error}`);
                }
                const recovered = this.tryRecoverSingleInvalidResponse(input, response, trace, 'provider');
                if (recovered) {
                    return { result: recovered, trace };
                }
                return {
                    result: this.buildStubResult(input, this.getAiMetaFromResponse(response), response.error),
                    trace
                };
            }

            try {
                const parsed = this.parseResponse(response.content);
                return { result: this.buildResult(input, parsed, this.getAiMetaFromResponse(response)), trace };
            } catch (parseError) {
                const message = parseError instanceof Error ? parseError.message : String(parseError);
                trace.notes.push(`Parse error: ${message}`);

                const usage = trace.usage ?? this.extractUsage(response.responseData);
                if (usage) trace.usage = usage;
                const retryMaxTokens = this.getParseRetryOutputTokenCap(input.ai.provider, maxTokens);
                const shouldRetry = this.shouldRetryParseFailure(usage, maxTokens, retryMaxTokens);

                if (shouldRetry) {
                    trace.notes.push(`Parse retry: output reached cap (${usage?.outputTokens}/${maxTokens}); retrying with cap ${retryMaxTokens}.`);
                    try {
                        const retryResponse = await this.callProvider(
                            systemPrompt,
                            userPrompt,
                            input.ai,
                            jsonSchema,
                            temperature,
                            retryMaxTokens,
                            input.questionText
                        );
                        if (retryResponse.sanitizationNotes?.length) {
                            trace.sanitizationNotes.push(...retryResponse.sanitizationNotes);
                        }
                        if (retryResponse.requestPayload) {
                            trace.requestPayload = retryResponse.requestPayload;
                        }
                        const providerRetryCount = typeof retryResponse.retryCount === 'number' ? retryResponse.retryCount : 0;
                        const priorRetryCount = typeof trace.retryCount === 'number' ? trace.retryCount : 0;
                        trace.retryCount = priorRetryCount + 1 + providerRetryCount;
                        trace.outputTokenCap = retryMaxTokens;
                        trace.response = {
                            content: retryResponse.content,
                            responseData: retryResponse.responseData,
                            aiStatus: retryResponse.aiStatus,
                            aiReason: retryResponse.aiReason,
                            error: retryResponse.error
                        };
                        const retryUsage = this.extractUsage(retryResponse.responseData);
                        if (retryUsage) trace.usage = retryUsage;

                        if (!retryResponse.success || !retryResponse.content || retryResponse.aiStatus !== 'success') {
                            const status = retryResponse.aiStatus || 'unknown';
                            const reason = retryResponse.aiReason ? ` (${retryResponse.aiReason})` : '';
                            trace.notes.push(`Parse retry provider status: ${status}${reason}.`);
                            if (retryResponse.error) {
                                trace.notes.push(`Parse retry provider error: ${retryResponse.error}`);
                            }
                            const recovered = this.tryRecoverSingleInvalidResponse(input, retryResponse, trace, 'parse retry provider');
                            if (recovered) {
                                return { result: recovered, trace };
                            }
                            const fallbackMeta = this.withParseFailureMeta(this.getAiMetaFromResponse(retryResponse), retryResponse.aiStatus ?? 'rejected');
                            return {
                                result: this.buildStubResult(input, fallbackMeta, retryResponse.error),
                                trace
                            };
                        }

                        try {
                            const retryParsed = this.parseResponse(retryResponse.content);
                            trace.notes.push('Parse retry succeeded.');
                            return { result: this.buildResult(input, retryParsed, this.getAiMetaFromResponse(retryResponse)), trace };
                        } catch (retryParseError) {
                            const retryMessage = retryParseError instanceof Error ? retryParseError.message : String(retryParseError);
                            trace.notes.push(`Parse retry failed: ${retryMessage}`);
                            const fallbackMeta = this.withParseFailureMeta(this.getAiMetaFromResponse(retryResponse), retryResponse.aiStatus ?? 'rejected');
                            return {
                                result: this.buildStubResult(input, fallbackMeta, retryParseError),
                                trace
                            };
                        }
                    } catch (retryError) {
                        const retryMessage = retryError instanceof Error ? retryError.message : String(retryError);
                        trace.notes.push(`Parse retry error: ${retryMessage}`);
                    }
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
        const { trace } = await this.buildOmnibusTrace(input);
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
                input.questions.map(question => question.question).join('\n')
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
            const usage = this.extractUsage(response.responseData);
            if (usage) trace.usage = usage;

            if (!response.success || !response.content || response.aiStatus !== 'success') {
                const status = response.aiStatus || 'unknown';
                const reason = response.aiReason ? ` (${response.aiReason})` : '';
                trace.notes.push(`Provider status: ${status}${reason}.`);
                if (response.error) {
                    trace.notes.push(`Provider error: ${response.error}`);
                }
                const recovered = this.tryRecoverOmnibusInvalidResponse(input, response, trace, 'provider');
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
                    results: this.buildOmnibusResults(input, parsed, aiMeta, trace),
                    trace,
                    rawResponse: parsed
                };
            } catch (parseError) {
                const message = parseError instanceof Error ? parseError.message : String(parseError);
                trace.notes.push(`Parse error: ${message}`);

                const usage = trace.usage ?? this.extractUsage(response.responseData);
                if (usage) trace.usage = usage;
                const retryMaxTokens = this.getParseRetryOutputTokenCap(input.ai.provider, maxTokens);
                const shouldRetry = this.shouldRetryParseFailure(usage, maxTokens, retryMaxTokens);

                if (shouldRetry) {
                    trace.notes.push(`Parse retry: output reached cap (${usage?.outputTokens}/${maxTokens}); retrying with cap ${retryMaxTokens}.`);
                    try {
                        const retryResponse = await this.callProvider(
                            systemPrompt,
                            userPrompt,
                            input.ai,
                            jsonSchema,
                            temperature,
                            retryMaxTokens,
                            input.questions.map(question => question.question).join('\n')
                        );
                        if (retryResponse.sanitizationNotes?.length) {
                            trace.sanitizationNotes.push(...retryResponse.sanitizationNotes);
                        }
                        if (retryResponse.requestPayload) {
                            trace.requestPayload = retryResponse.requestPayload;
                        }
                        const providerRetryCount = typeof retryResponse.retryCount === 'number' ? retryResponse.retryCount : 0;
                        const priorRetryCount = typeof trace.retryCount === 'number' ? trace.retryCount : 0;
                        trace.retryCount = priorRetryCount + 1 + providerRetryCount;
                        trace.outputTokenCap = retryMaxTokens;
                        trace.response = {
                            content: retryResponse.content,
                            responseData: retryResponse.responseData,
                            aiStatus: retryResponse.aiStatus,
                            aiReason: retryResponse.aiReason,
                            error: retryResponse.error
                        };
                        const retryUsage = this.extractUsage(retryResponse.responseData);
                        if (retryUsage) trace.usage = retryUsage;

                        if (!retryResponse.success || !retryResponse.content || retryResponse.aiStatus !== 'success') {
                            const status = retryResponse.aiStatus || 'unknown';
                            const reason = retryResponse.aiReason ? ` (${retryResponse.aiReason})` : '';
                            trace.notes.push(`Parse retry provider status: ${status}${reason}.`);
                            if (retryResponse.error) {
                                trace.notes.push(`Parse retry provider error: ${retryResponse.error}`);
                            }
                            const recovered = this.tryRecoverOmnibusInvalidResponse(input, retryResponse, trace, 'parse retry provider');
                            if (recovered) {
                                return recovered;
                            }
                            const fallbackMeta = this.withParseFailureMeta(this.getAiMetaFromResponse(retryResponse), retryResponse.aiStatus ?? 'rejected');
                            return {
                                results: this.buildOmnibusStubResults(input, fallbackMeta, retryResponse.error),
                                trace,
                                rawResponse: null
                            };
                        }

                        try {
                            const retryParsed = this.parseOmnibusResponse(retryResponse.content);
                            trace.notes.push('Parse retry succeeded.');
                            const aiMeta = this.getAiMetaFromResponse(retryResponse);
                            return {
                                results: this.buildOmnibusResults(input, retryParsed, aiMeta, trace),
                                trace,
                                rawResponse: retryParsed
                            };
                        } catch (retryParseError) {
                            const retryMessage = retryParseError instanceof Error ? retryParseError.message : String(retryParseError);
                            trace.notes.push(`Parse retry failed: ${retryMessage}`);
                            const fallbackMeta = this.withParseFailureMeta(this.getAiMetaFromResponse(retryResponse), retryResponse.aiStatus ?? 'rejected');
                            return {
                                results: this.buildOmnibusStubResults(input, fallbackMeta, retryParseError),
                                trace,
                                rawResponse: null
                            };
                        }
                    } catch (retryError) {
                        const retryMessage = retryError instanceof Error ? retryError.message : String(retryError);
                        trace.notes.push(`Parse retry error: ${retryMessage}`);
                    }
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

        if (input.scope === 'book') {
            const scopedSceneEntries = input.focusBookId
                ? sceneEntries.filter(entry => entry.path === input.focusBookId || entry.path.startsWith(`${input.focusBookId}/`))
                : sceneEntries;
            const scenes = await this.buildSceneSnapshots(scopedSceneEntries);
            const sceneModeByPath = new Map(
                scopedSceneEntries.map(entry => [entry.path, this.normalizeEntryMode(entry.mode)])
            );
            for (const scene of scenes) {
                const mode = sceneModeByPath.get(scene.path) ?? 'none';
                const sceneLabel = scene.title ? `${scene.title} (${scene.label})` : scene.label;
                if (mode === 'summary') {
                    if (!scene.summary) continue;
                    blocks.push({ label: `Scene ${sceneLabel} (${scene.sceneId}) (Summary)`, content: scene.summary });
                    continue;
                }
                if (mode === 'full') {
                    const content = await this.readFileContent(scene.path);
                    if (!content) continue;
                    blocks.push({ label: `Scene ${sceneLabel} (${scene.sceneId}) (Body)`, content });
                }
            }

            const bookOutlines = outlineEntries
                .filter(entry => entry.scope !== 'saga')
                .filter(entry => !input.focusBookId || entry.path === input.focusBookId || entry.path.startsWith(`${input.focusBookId}/`));
            const outlineBlocks = await this.collectOutlines(bookOutlines, 'Book outline');
            blocks.push(...outlineBlocks);
        } else {
            const sagaOutlines = await this.collectOutlines(outlineEntries.filter(entry => entry.scope === 'saga'), 'Saga outline');
            blocks.push(...sagaOutlines);

            const bookOutlines = await this.collectOutlines(outlineEntries.filter(entry => entry.scope !== 'saga'), 'Book outline');
            blocks.push(...bookOutlines);

            const scenes = await this.buildSceneSnapshots(sceneEntries);
            const sceneModeByPath = new Map(
                sceneEntries.map(entry => [entry.path, this.normalizeEntryMode(entry.mode)])
            );
            for (const scene of scenes) {
                const mode = sceneModeByPath.get(scene.path) ?? 'none';
                const sceneLabel = scene.title ? `${scene.title} (${scene.label})` : scene.label;
                if (mode === 'summary') {
                    if (!scene.summary) continue;
                    blocks.push({ label: `Scene ${sceneLabel} (${scene.sceneId}) (Summary)`, content: scene.summary });
                    continue;
                }
                if (mode === 'full') {
                    const content = await this.readFileContent(scene.path);
                    if (!content) continue;
                    blocks.push({ label: `Scene ${sceneLabel} (${scene.sceneId}) (Body)`, content });
                }
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
            const sceneNumber = this.extractSceneNumber(frontmatter);
            const title = this.getSceneTitle(file, frontmatter);
            const sceneId = resolveSceneReferenceId(
                entry.sceneId ?? readSceneId(frontmatter) ?? undefined,
                file.path
            );
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
            if (mode === 'none') continue;
            const baseLabel = entry.scope === 'book'
                ? this.buildBookOutlineLabel(entry.path, fallbackLabel)
                : fallbackLabel;
            if (mode === 'summary') {
                const summary = this.getSummaryForPath(entry.path);
                if (!summary) continue;
                blocks.push({ label: `${baseLabel} (Summary)`, content: summary });
                continue;
            }
            const content = await this.readFileContent(entry.path);
            if (!content) continue;
            blocks.push({ label: `${baseLabel} (Body)`, content });
        }
        return blocks;
    }

    private async collectReferenceDocs(entries: CorpusManifestEntry[]): Promise<EvidenceBlock[]> {
        const blocks: EvidenceBlock[] = [];
        for (const entry of entries) {
            const mode = this.normalizeEntryMode(entry.mode);
            if (mode === 'none') continue;
            const baseLabel = this.buildReferenceLabel(entry);
            if (mode === 'summary') {
                const summary = this.getSummaryForPath(entry.path);
                if (!summary) continue;
                blocks.push({ label: `${baseLabel} (Summary)`, content: summary });
                continue;
            }
            const content = await this.readFileContent(entry.path);
            if (!content) continue;
            blocks.push({ label: `${baseLabel} (Body)`, content });
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

    private normalizeEntryMode(mode?: CorpusManifestEntry['mode']): 'none' | 'summary' | 'full' {
        if (mode === 'full') return 'full';
        if (mode === 'summary') return 'summary';
        return 'none';
    }

    private isModeActive(mode?: CorpusManifestEntry['mode']): boolean {
        return this.normalizeEntryMode(mode) !== 'none';
    }

    private buildPrompt(
        input: InquiryRunnerInput,
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
        // Lens choice is UI-only; always request both flow + depth in the same response.
        const schema = [
            '{',
            `  "schema_version": ${INQUIRY_SCHEMA_VERSION},`,
            '  "summaryFlow": "1-2 sentence flow summary (pacing, momentum, compression, timing, pressure phrasing).",',
            '  "summaryDepth": "1-2 sentence depth summary (coherence, subtext, logic, alignment, implication phrasing).",',
            '  "verdict": {',
            '    "flow": 0,',
            '    "depth": 0,',
            '    "impact": "low|medium|high",',
            '    "assessmentConfidence": "low|medium|high"',
            '  },',
            '  "findings": [',
            '    {',
            '      "ref_id": "scn_a1b2c3d4",',
            '      "ref_label": "S12 · Scene title (optional)",',
            '      "ref_path": "Book 1/12 Scene.md (optional debug path)",',
            '      "kind": "string",',
            '      "lens": "flow|depth|both (optional)",',
            '      "headline": "short line",',
            '      "bullets": ["optional", "points"],',
            '      "impact": "low|medium|high",',
            '      "assessmentConfidence": "low|medium|high"',
            '    }',
            '  ]',
            '}'
        ].join('\n');

        const evidenceText = evidence.map(block => {
            return `## ${block.label}\n${block.content}`;
        }).join('\n\n');

        const userPrompt = [
            `Question: ${input.questionText}`,
            '',
            'Answer the editorial question using the evidence.',
            'Independently assign corpus-level diagnostics (0-100):',
            '- Flow: momentum/causality/pressure progression across the evaluated corpus.',
            '- Depth: coherence/implication/structural integrity across the evaluated corpus.',
            'Scores reflect the corpus, not the quality of your answer.',
            'Use the same evidence for both lenses; interpretation changes, not evidence.',
            'Use flow summary phrasing that emphasizes compression, timing, and pressure.',
            'Use depth summary phrasing that emphasizes alignment, implication, and consistency.',
            'If conclusions align, still phrase summaries to match the active lens emphasis.',
            'Use scene ref_id values from evidence labels in parentheses (e.g., scn_a1b2c3d4).',
            'Evidence headings include "(Summary)" or "(Body)".',
            'Treat "(Summary)" entries as compressed evidence, not full scene prose; avoid claims requiring missing fine-grain details.',
            'Optionally tag findings with lens: flow|depth|both to indicate relevance.',
            'Return JSON only with summaryFlow, summaryDepth, verdict.flow, verdict.depth, impact, assessmentConfidence, and findings.',
            'Return JSON only using the exact schema below.',
            '',
            schema,
            '',
            'Evidence:',
            evidenceText
        ].join('\n');

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
            '          "kind": "string",',
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

        const userPrompt = [
            'Questions:',
            ...questionLines,
            '',
            'Answer every question using the same evidence.',
            'Independently assign corpus-level diagnostics (0-100) per question:',
            '- Flow: momentum/causality/pressure progression across the evaluated corpus.',
            '- Depth: coherence/implication/structural integrity across the evaluated corpus.',
            'Scores reflect the corpus, not the quality of your answer.',
            'Use the same evidence for both lenses; interpretation changes, not evidence.',
            'Use flow summary phrasing that emphasizes compression, timing, and pressure.',
            'Use depth summary phrasing that emphasizes alignment, implication, and consistency.',
            'If conclusions align, still phrase summaries to match the active lens emphasis.',
            'Use scene ref_id values from evidence labels in parentheses (e.g., scn_a1b2c3d4).',
            'Evidence headings include "(Summary)" or "(Body)".',
            'Treat "(Summary)" entries as compressed evidence, not full scene prose; avoid claims requiring missing fine-grain details.',
            'Optionally tag findings with lens: flow|depth|both to indicate relevance.',
            'Return JSON only with summaryFlow, summaryDepth, verdict.flow, verdict.depth, impact, assessmentConfidence, and findings for every question.',
            'Return JSON only using the exact schema below.',
            '',
            schema,
            '',
            'Evidence:',
            evidenceText
        ].join('\n');

        return { systemPrompt, userPrompt, evidenceText };
    }

    private getJsonSchema(): Record<string, unknown> {
        return {
            type: 'object',
            properties: {
                schema_version: { type: 'number', const: INQUIRY_SCHEMA_VERSION },
                summaryFlow: { type: 'string' },
                summaryDepth: { type: 'string' },
                verdict: {
                    type: 'object',
                    properties: {
                        flow: { type: 'number' },
                        depth: { type: 'number' },
                        impact: { type: 'string' },
                        assessmentConfidence: { type: 'string' },
                        severity: { type: 'string' },
                        confidence: { type: 'string' }
                    },
                    required: ['flow', 'depth', 'impact', 'assessmentConfidence']
                },
                findings: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            ref_id: { type: 'string' },
                            ref_label: { type: 'string' },
                            ref_path: { type: 'string' },
                            kind: { type: 'string' },
                            lens: { type: 'string' },
                            headline: { type: 'string' },
                            bullets: { type: 'array', items: { type: 'string' } },
                            impact: { type: 'string' },
                            assessmentConfidence: { type: 'string' },
                            severity: { type: 'string' },
                            confidence: { type: 'string' }
                        },
                        required: ['ref_id', 'kind', 'headline', 'impact', 'assessmentConfidence']
                    }
                }
            },
            required: ['schema_version', 'summaryFlow', 'summaryDepth', 'verdict', 'findings']
        };
    }

    private getOmnibusJsonSchema(): Record<string, unknown> {
        return {
            type: 'object',
            properties: {
                schema_version: { type: 'number', const: INQUIRY_SCHEMA_VERSION },
                results: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            question_id: { type: 'string' },
                            question_zone: { type: 'string' },
                            summaryFlow: { type: 'string' },
                            summaryDepth: { type: 'string' },
                            verdict: {
                                type: 'object',
                                properties: {
                                    flow: { type: 'number' },
                                    depth: { type: 'number' },
                                    impact: { type: 'string' },
                                    assessmentConfidence: { type: 'string' },
                                    severity: { type: 'string' },
                                    confidence: { type: 'string' }
                                },
                                required: ['flow', 'depth', 'impact', 'assessmentConfidence']
                            },
                            findings: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        ref_id: { type: 'string' },
                                        ref_label: { type: 'string' },
                                        ref_path: { type: 'string' },
                                        kind: { type: 'string' },
                                        lens: { type: 'string' },
                                        headline: { type: 'string' },
                                        bullets: { type: 'array', items: { type: 'string' } },
                                        impact: { type: 'string' },
                                        assessmentConfidence: { type: 'string' },
                                        severity: { type: 'string' },
                                        confidence: { type: 'string' }
                                    },
                                    required: ['ref_id', 'kind', 'headline', 'impact', 'assessmentConfidence']
                                }
                            }
                        },
                        required: ['question_id', 'summaryFlow', 'summaryDepth', 'verdict', 'findings']
                    }
                }
            },
            required: ['schema_version', 'results']
        };
    }

    private async callProvider(
        systemPrompt: string,
        userPrompt: string,
        ai: InquiryRunnerInput['ai'],
        jsonSchema: Record<string, unknown>,
        temperature: number,
        maxTokens: number,
        userQuestion?: string
    ): Promise<ProviderResult> {
        const aiClient = getAIClient(this.plugin);
        const analysisPackaging = this.getAnalysisPackaging();
        const packagingPrecheck = this.getPackagingPrecheck(systemPrompt, userPrompt, ai, maxTokens);

        if (analysisPackaging === 'singlePassOnly' && packagingPrecheck.exceedsSafeBudget) {
            const reason = `Estimated input ${Math.round(packagingPrecheck.inputTokens).toLocaleString()} exceeds safe input budget ${Math.round(packagingPrecheck.safeInputTokens).toLocaleString()} for this Inquiry request.`;
            return this.buildSinglePassOnlyOverflowResult(ai, reason);
        }

        if (analysisPackaging === 'automatic' && packagingPrecheck.exceedsSafeBudget) {
            const packaged = await this.runChunkedInquiry(aiClient, {
                systemPrompt,
                userPrompt,
                userQuestion,
                ai,
                jsonSchema,
                temperature,
                maxTokens
            });
            if (packaged) {
                return this.toProviderResult(this.withExecutionContext(packaged, {
                    analysisPackaging,
                    executionPassCount: packaged.advancedContext?.executionPassCount,
                    packagingTriggerReason: `Estimated input ${Math.round(packagingPrecheck.inputTokens).toLocaleString()} exceeded safe input budget ${Math.round(packagingPrecheck.safeInputTokens).toLocaleString()}.`
                }));
            }
        }

        let run = await this.runInquiryRequest(aiClient, {
            task: 'AnalyzeCorpus',
            systemPrompt,
            userPrompt,
            userQuestion,
            ai,
            jsonSchema,
            temperature,
            maxTokens
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
                    error: run.error || 'This request exceeds the safe limit for a single pass. Switch Execution Preference to Automatic, or reduce scope.',
                    warnings: [
                        ...(run.warnings || []),
                        'Single-pass only is enabled, so large-manuscript packaging was skipped.'
                    ]
                }, {
                    analysisPackaging,
                    executionPassCount: 1,
                    packagingTriggerReason: 'Single-pass response exceeded safe limits, but automatic packaging is disabled.'
                });
            } else {
                const chunked = await this.runChunkedInquiry(aiClient, {
                    systemPrompt,
                    userPrompt,
                    userQuestion,
                    ai,
                    jsonSchema,
                    temperature,
                    maxTokens
                });
                if (chunked) {
                    run = chunked;
                } else {
                    run = this.withExecutionContext(run, {
                        analysisPackaging,
                        executionPassCount: 1,
                        packagingTriggerReason: 'Single-pass response exceeded safe limits, and automatic packaging did not complete.'
                    });
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
        }
    ): Promise<AIRunResult> {
        const tokenEstimateInput = this.estimateTokensFromChars(
            (options.systemPrompt?.length ?? 0) + (options.userPrompt?.length ?? 0)
        );
        return aiClient.run({
            feature: 'InquiryMode',
            task: options.task,
            requiredCapabilities: ['longContext', 'jsonStrict', 'reasoningStrong', 'highOutputCap'],
            featureModeInstructions: [
                options.systemPrompt,
                'Do not reinterpret or expand the user’s question. Answer it directly. The role template provides tonal and contextual framing only.'
            ].filter(Boolean).join('\n'),
            userInput: options.userPrompt,
            userQuestion: options.userQuestion,
            promptText: options.userPrompt,
            systemPrompt: undefined,
            returnType: 'json',
            responseSchema: options.jsonSchema,
            providerOverride: mapLegacyProviderToAiProvider(options.ai.provider),
            legacySelectionHint: {
                provider: options.ai.provider,
                modelId: options.ai.modelId
            },
            overrides: {
                temperature: options.temperature,
                maxOutputMode: this.resolveMaxOutputMode(options.maxTokens),
                reasoningDepth: 'deep',
                jsonStrict: true
            },
            tokenEstimateInput
        });
    }

    private resolveMaxOutputMode(maxTokens: number): 'auto' | 'high' | 'max' {
        if (maxTokens >= 12000) return 'max';
        if (maxTokens >= 4000) return 'high';
        return 'auto';
    }

    private getAnalysisPackaging(): AnalysisPackaging {
        const aiSettings = validateAiSettings(this.plugin.settings.aiSettings ?? buildDefaultAiSettings()).value;
        return aiSettings.analysisPackaging === 'singlePassOnly' ? 'singlePassOnly' : 'automatic';
    }

    private getAccessTier(provider: AIProviderId): AccessTier {
        const aiSettings = validateAiSettings(this.plugin.settings.aiSettings ?? buildDefaultAiSettings()).value;
        if (provider === 'anthropic') return aiSettings.aiAccessProfile.anthropicTier ?? 1;
        if (provider === 'openai') return aiSettings.aiAccessProfile.openaiTier ?? 1;
        if (provider === 'google') return aiSettings.aiAccessProfile.googleTier ?? 1;
        return 1;
    }

    private getPackagingPrecheck(
        systemPrompt: string,
        userPrompt: string,
        ai: InquiryRunnerInput['ai'],
        maxTokens: number
    ): { inputTokens: number; safeInputTokens: number; exceedsSafeBudget: boolean } {
        const inputTokens = this.estimateTokensFromChars((systemPrompt?.length ?? 0) + (userPrompt?.length ?? 0));
        const provider = mapLegacyProviderToAiProvider(ai.provider);
        if (provider === 'none') {
            return { inputTokens, safeInputTokens: 0, exceedsSafeBudget: false };
        }

        try {
            const modelSelection = selectModel(BUILTIN_MODELS, {
                provider,
                policy: { type: 'latestStable' },
                requiredCapabilities: ['longContext', 'jsonStrict', 'reasoningStrong', 'highOutputCap'],
                accessTier: this.getAccessTier(provider),
                contextTokensNeeded: inputTokens,
                outputTokensNeeded: maxTokens
            });
            const caps = computeCaps({
                provider,
                model: modelSelection.model,
                accessTier: this.getAccessTier(provider),
                feature: 'InquiryMode',
                overrides: {
                    maxOutputMode: this.resolveMaxOutputMode(maxTokens),
                    reasoningDepth: 'deep',
                    jsonStrict: true
                }
            });
            return {
                inputTokens,
                safeInputTokens: caps.maxInputTokens,
                exceedsSafeBudget: inputTokens > caps.maxInputTokens
            };
        } catch {
            return {
                inputTokens,
                safeInputTokens: 0,
                exceedsSafeBudget: false
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
            error: 'This request exceeds the safe limit for a single pass. Switch Execution Preference to Automatic, or reduce scope.',
            analysisPackaging: 'singlePassOnly',
            executionPassCount: 1,
            packagingTriggerReason: reason
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

    private toProviderResult(run: AIRunResult): ProviderResult {
        const legacyProvider = mapAiProviderToLegacyProvider(run.provider);
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
            packagingTriggerReason: run.advancedContext?.packagingTriggerReason
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
        }
    ): Promise<AIRunResult | null> {
        const chunkPrompts = this.buildEvidenceChunkPrompts(options.userPrompt, 6000);
        if (!chunkPrompts || chunkPrompts.length <= 1) return null;

        const chunkOutputs: string[] = [];
        for (let i = 0; i < chunkPrompts.length; i += 1) {
            const chunkRun = await this.runInquiryRequest(aiClient, {
                task: `AnalyzeCorpusChunk${i + 1}`,
                systemPrompt: options.systemPrompt,
                userPrompt: chunkPrompts[i],
                userQuestion: options.userQuestion,
                ai: options.ai,
                jsonSchema: options.jsonSchema,
                temperature: options.temperature,
                maxTokens: options.maxTokens
            });
            if (chunkRun.aiStatus !== 'success' || !chunkRun.content) {
                return null;
            }
            chunkOutputs.push(chunkRun.content);
        }

        const marker = '\nEvidence:\n';
        const splitAt = options.userPrompt.indexOf(marker);
        if (splitAt < 0) return null;
        const prefix = options.userPrompt.slice(0, splitAt + marker.length);
        const synthesisEvidence = chunkOutputs
            .map((output, index) => `## Chunk ${index + 1} analysis\n${output}`)
            .join('\n\n');

        const synthesisRun = await this.runInquiryRequest(aiClient, {
            task: 'SynthesizeChunkAnalyses',
            systemPrompt: options.systemPrompt,
            userPrompt: `${prefix}${synthesisEvidence}`,
            userQuestion: options.userQuestion,
            ai: options.ai,
            jsonSchema: options.jsonSchema,
            temperature: options.temperature,
            maxTokens: options.maxTokens
        });

        if (synthesisRun.aiStatus !== 'success' || !synthesisRun.content) {
            return null;
        }

        const passCount = chunkPrompts.length + 1;
        return this.withExecutionContext({
            ...synthesisRun,
            warnings: [...(synthesisRun.warnings || []), `Inquiry chunked execution used ${chunkPrompts.length} chunks before synthesis.`]
        }, {
            analysisPackaging: 'automatic',
            executionPassCount: passCount,
            packagingTriggerReason: 'Single-pass request exceeded safe limits, so structured packaging and synthesis were used.'
        });
    }

    private buildEvidenceChunkPrompts(userPrompt: string, maxChunkTokens: number): string[] | null {
        const marker = '\nEvidence:\n';
        const splitAt = userPrompt.indexOf(marker);
        if (splitAt < 0) return null;
        const prefix = userPrompt.slice(0, splitAt + marker.length);
        const evidence = userPrompt.slice(splitAt + marker.length).trim();
        if (!evidence) return null;

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

        return chunks.map(chunk => `${prefix}${chunk}`);
    }

    private parseResponse(content: string): RawInquiryResponse {
        const jsonText = this.extractJson(content);
        if (!jsonText) {
            throw new Error('Unable to locate JSON in AI response.');
        }
        const parsed = JSON.parse(jsonText) as RawInquiryResponse;
        return parsed;
    }

    private parseOmnibusResponse(content: string): RawOmnibusResponse {
        const jsonText = this.extractJson(content);
        if (!jsonText) {
            throw new Error('Unable to locate JSON in AI response.');
        }
        const parsed = JSON.parse(jsonText) as RawOmnibusResponse;
        return parsed;
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

    private buildResult(
        input: InquiryRunnerInput,
        parsed: RawInquiryResponse,
        aiMeta: Pick<InquiryResult, 'aiProvider' | 'aiModelRequested' | 'aiModelResolved' | 'aiStatus' | 'aiReason'>
    ): InquiryResult {
        const verdict = parsed.verdict || {};
        const flow = this.normalizeScore(verdict.flow);
        const depth = this.normalizeScore(verdict.depth);
        const impact = this.normalizeImpact(verdict.impact ?? verdict.severity);
        const assessmentConfidence = this.normalizeAssessmentConfidence(verdict.assessmentConfidence ?? verdict.confidence);

        const findings = Array.isArray(parsed.findings) ? parsed.findings : [];
        const sceneEntries = input.corpus.entries.filter(entry => entry.class === 'scene' && !!entry.sceneId);
        const sceneRefIndex = buildSceneRefIndex(sceneEntries.map(entry => ({
            sceneId: entry.sceneId!,
            path: entry.path,
            label: entry.path.split('/').pop()
        })));
        const fallbackRefId = this.resolveFindingFallbackRefId(input);
        const mappedFindings = findings.map(finding => this.mapFinding(finding, fallbackRefId, sceneRefIndex));

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
            focusId: input.focusLabel,
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
            ...aiMeta
        };
    }

    private buildOmnibusResults(
        input: InquiryOmnibusInput,
        parsed: RawOmnibusResponse,
        aiMeta: Pick<InquiryResult, 'aiProvider' | 'aiModelRequested' | 'aiModelResolved' | 'aiStatus' | 'aiReason'>,
        trace: InquiryRunTrace
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
            built.push(this.buildResult(questionInput, raw, aiMeta));
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
            focusLabel: input.focusLabel,
            focusSceneId: input.focusSceneId,
            focusBookId: input.focusBookId,
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
        fallbackRef: string,
        sceneRefIndex: ReturnType<typeof buildSceneRefIndex>
    ): InquiryFinding {
        const kind = this.normalizeFindingKind(raw.kind);
        const normalizedRef = this.normalizeFindingRef(raw, fallbackRef, sceneRefIndex);
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
            lens
        };
    }

    private resolveFindingFallbackRefId(input: InquiryRunnerInput): string {
        if (isStableSceneId(input.focusSceneId)) {
            return String(input.focusSceneId).trim().toLowerCase();
        }
        const firstSceneId = input.corpus.entries.find(entry => entry.class === 'scene' && isStableSceneId(entry.sceneId))?.sceneId;
        if (firstSceneId) return firstSceneId.toLowerCase();
        if (isStableSceneId(input.focusLabel)) return input.focusLabel.trim().toLowerCase();
        return input.focusLabel;
    }

    private normalizeFindingRef(
        raw: RawInquiryFinding,
        fallbackRef: string,
        sceneRefIndex: ReturnType<typeof buildSceneRefIndex>
    ): SceneRef {
        const normalized = normalizeSceneRef({
            ref_id: raw.ref_id ? String(raw.ref_id) : undefined,
            ref_label: raw.ref_label ? String(raw.ref_label) : undefined,
            ref_path: raw.ref_path ? String(raw.ref_path) : undefined
        }, sceneRefIndex, { fallbackRefId: fallbackRef });

        if (normalized.warning) {
            console.warn(`[Inquiry] ${normalized.warning}`);
        }
        return normalized.ref;
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
            focusId: input.focusLabel,
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
        return {
            aiProvider: response.aiProvider,
            aiModelRequested: response.aiModelRequested,
            aiModelResolved: response.aiModelResolved,
            aiStatus: response.aiStatus,
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
            aiStatus: 'success',
            aiReason: 'recovered_invalid_response'
        };
    }

    private tryRecoverSingleInvalidResponse(
        input: InquiryRunnerInput,
        response: ProviderResult,
        trace: InquiryRunTrace,
        context: string
    ): InquiryResult | null {
        if (!response.content || response.aiReason !== 'invalid_response') return null;
        try {
            const recovered = this.parseResponse(response.content);
            trace.notes.push(`${context}: recovered from invalid_response via local JSON extraction.`);
            const recoveredMeta = this.withRecoveredInvalidResponseMeta(this.getAiMetaFromResponse(response));
            return this.buildResult(input, recovered, recoveredMeta);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            trace.notes.push(`${context}: invalid_response recovery failed (${message}).`);
            return null;
        }
    }

    private tryRecoverOmnibusInvalidResponse(
        input: InquiryOmnibusInput,
        response: ProviderResult,
        trace: InquiryRunTrace,
        context: string
    ): { results: InquiryResult[]; trace: InquiryRunTrace; rawResponse: RawOmnibusResponse } | null {
        if (!response.content || response.aiReason !== 'invalid_response') return null;
        try {
            const recovered = this.parseOmnibusResponse(response.content);
            trace.notes.push(`${context}: recovered omnibus response from invalid_response via local JSON extraction.`);
            const recoveredMeta = this.withRecoveredInvalidResponseMeta(this.getAiMetaFromResponse(response));
            return {
                results: this.buildOmnibusResults(input, recovered, recoveredMeta, trace),
                trace,
                rawResponse: recovered
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            trace.notes.push(`${context}: omnibus invalid_response recovery failed (${message}).`);
            return null;
        }
    }

    private buildStubSummary(aiStatus?: InquiryAiStatus, aiReason?: string, message?: string): string {
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
            'error'
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
    ): Promise<{ trace: InquiryRunTrace }> {
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
        const tokenEstimate = this.buildTokenEstimate(systemPrompt, userPrompt, outputTokenCap);
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

        return { trace };
    }

    private async buildOmnibusTrace(
        input: InquiryOmnibusInput
    ): Promise<{ trace: InquiryRunTrace }> {
        const notes: string[] = [];
        const sanitizationNotes: string[] = [];
        let evidenceBlocks: EvidenceBlock[] = [];

        try {
            evidenceBlocks = await this.buildEvidenceBlocks({
                scope: input.scope,
                focusLabel: input.focusLabel,
                focusSceneId: input.focusSceneId,
                focusBookId: input.focusBookId,
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
        const tokenEstimate = this.buildTokenEstimate(systemPrompt, userPrompt, outputTokenCap);
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

        return { trace };
    }

    private buildTokenEstimate(systemPrompt: string, userPrompt: string, outputTokens: number): InquiryRunTrace['tokenEstimate'] {
        const inputChars = (systemPrompt?.length ?? 0) + (userPrompt?.length ?? 0);
        const inputTokens = this.estimateTokensFromChars(inputChars);
        return {
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
            inputChars
        };
    }

    private getOutputTokenCap(provider: InquiryAiProvider): number {
        const providerCap = PROVIDER_MAX_OUTPUT_TOKENS[provider] ?? INQUIRY_MAX_OUTPUT_TOKENS;
        return Math.max(512, Math.min(providerCap, INQUIRY_MAX_OUTPUT_TOKENS));
    }

    private getParseRetryOutputTokenCap(provider: InquiryAiProvider, currentCap: number): number {
        const providerCap = PROVIDER_MAX_OUTPUT_TOKENS[provider] ?? currentCap;
        const inquiryRetryCap = Math.min(providerCap, INQUIRY_MAX_OUTPUT_TOKENS * 2);
        const retryTarget = Math.max(currentCap * 2, INQUIRY_MAX_OUTPUT_TOKENS);
        return Math.max(currentCap, Math.min(inquiryRetryCap, retryTarget));
    }

    private shouldRetryParseFailure(
        usage: InquiryRunTrace['usage'] | undefined,
        currentCap: number,
        retryCap: number
    ): boolean {
        if (retryCap <= currentCap) return false;
        const output = usage?.outputTokens;
        if (typeof output !== 'number') return false;
        return output >= currentCap;
    }

    private estimateTokensFromChars(chars: number): number {
        if (!Number.isFinite(chars) || chars <= 0) return 0;
        return Math.max(1, Math.ceil(chars / 4));
    }

    private extractUsage(responseData: unknown): InquiryRunTrace['usage'] | undefined {
        if (!responseData || typeof responseData !== 'object') return undefined;
        const data = responseData as Record<string, unknown>;
        const usage = data.usage;
        if (!usage || typeof usage !== 'object') return undefined;
        const usageData = usage as Record<string, unknown>;
        const promptTokens = usageData.prompt_tokens;
        const completionTokens = usageData.completion_tokens;
        const totalTokens = usageData.total_tokens;
        const inputTokens = usageData.input_tokens;
        const outputTokens = usageData.output_tokens;
        const input = typeof inputTokens === 'number' ? inputTokens
            : (typeof promptTokens === 'number' ? promptTokens : undefined);
        const output = typeof outputTokens === 'number' ? outputTokens
            : (typeof completionTokens === 'number' ? completionTokens : undefined);
        const total = typeof totalTokens === 'number' ? totalTokens : undefined;
        if (input === undefined && output === undefined && total === undefined) return undefined;
        return { inputTokens: input, outputTokens: output, totalTokens: total };
    }
}
