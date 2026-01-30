import { TFile } from 'obsidian';
import type { MetadataCache, Vault } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { normalizeFrontmatterKeys } from '../../utils/frontmatter';
import { callProvider, type ProviderResult } from '../../api/providerRouter';
import { INQUIRY_MAX_OUTPUT_TOKENS, INQUIRY_SCHEMA_VERSION } from '../constants';
import type { InquiryAiStatus, InquiryConfidence, InquiryFinding, InquiryResult, InquirySeverity } from '../state';
import type {
    CorpusManifestEntry,
    InquiryOmnibusInput,
    InquiryOmnibusQuestion,
    InquiryRunTrace,
    InquiryRunner,
    InquiryRunnerInput
} from './types';

const BOOK_FOLDER_REGEX = /^Book\s+(\d+)/i;
type EvidenceBlock = {
    label: string;
    content: string;
};

type SceneSnapshot = {
    path: string;
    label: string;
    synopsis: string;
    sceneNumber?: number;
};

type RawInquiryFinding = {
    ref_id?: string;
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
        const maxTokens = INQUIRY_MAX_OUTPUT_TOKENS;
        let response: ProviderResult | null = null;

        try {
            response = await this.callProvider(systemPrompt, userPrompt, input.ai, jsonSchema, temperature, maxTokens);
            if (response.sanitizationNotes?.length) {
                trace.sanitizationNotes.push(...response.sanitizationNotes);
            }
            if (response.requestPayload) {
                trace.requestPayload = response.requestPayload;
            }
            if (typeof response.retryCount === 'number') {
                trace.retryCount = response.retryCount;
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
                return {
                    result: this.buildStubResult(input, this.getAiMetaFromResponse(response), response.error),
                    trace
                };
            }

            const parsed = this.parseResponse(response.content);
            return { result: this.buildResult(input, parsed, this.getAiMetaFromResponse(response)), trace };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (response) {
                trace.notes.push(`Parse error: ${message}`);
                const fallbackMeta = this.withParseFailureMeta(this.getAiMetaFromResponse(response), response.aiStatus);
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
        const maxTokens = INQUIRY_MAX_OUTPUT_TOKENS;
        let response: ProviderResult | null = null;

        try {
            response = await this.callProvider(systemPrompt, userPrompt, input.ai, jsonSchema, temperature, maxTokens);
            if (response.sanitizationNotes?.length) {
                trace.sanitizationNotes.push(...response.sanitizationNotes);
            }
            if (response.requestPayload) {
                trace.requestPayload = response.requestPayload;
            }
            if (typeof response.retryCount === 'number') {
                trace.retryCount = response.retryCount;
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
                const aiMeta = this.getAiMetaFromResponse(response);
                return {
                    results: this.buildOmnibusStubResults(input, aiMeta, response.error),
                    trace,
                    rawResponse: null
                };
            }

            const parsed = this.parseOmnibusResponse(response.content);
            const aiMeta = this.getAiMetaFromResponse(response);
            return {
                results: this.buildOmnibusResults(input, parsed, aiMeta, trace),
                trace,
                rawResponse: parsed
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (response) {
                trace.notes.push(`Parse error: ${message}`);
                const fallbackMeta = this.withParseFailureMeta(this.getAiMetaFromResponse(response), response.aiStatus);
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
                if (mode === 'summary') {
                    if (!scene.synopsis) continue;
                    blocks.push({ label: `Scene ${scene.label} synopsis`, content: scene.synopsis });
                    continue;
                }
                if (mode === 'full') {
                    const content = await this.readFileContent(scene.path);
                    if (!content) continue;
                    blocks.push({ label: `Scene ${scene.label}`, content });
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
                if (mode === 'summary') {
                    if (!scene.synopsis) continue;
                    blocks.push({ label: `Scene ${scene.label} synopsis`, content: scene.synopsis });
                    continue;
                }
                if (mode === 'full') {
                    const content = await this.readFileContent(scene.path);
                    if (!content) continue;
                    blocks.push({ label: `Scene ${scene.label}`, content });
                }
            }
        }

        const references = await this.collectReferenceDocs(referenceEntries);
        blocks.push(...references);

        if (!blocks.length) {
            blocks.push({ label: 'Evidence', content: 'No evidence available for the selected scope.' });
        }

        return blocks;
    }

    private async buildSceneSnapshots(entries: CorpusManifestEntry[]): Promise<SceneSnapshot[]> {
        const scenes: SceneSnapshot[] = [];

        entries.forEach(entry => {
            const file = this.vault.getAbstractFileByPath(entry.path);
            if (!file || !('path' in file)) return;
            if (!this.isTFile(file)) return;
            const frontmatter = this.getFrontmatter(file);
            const synopsis = this.extractSynopsis(frontmatter);
            const sceneNumber = this.extractSceneNumber(frontmatter);
            scenes.push({
                path: file.path,
                label: '',
                synopsis,
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

    private async collectOutlines(entries: CorpusManifestEntry[], fallbackLabel: string): Promise<EvidenceBlock[]> {
        const blocks: EvidenceBlock[] = [];
        for (const entry of entries) {
            const mode = this.normalizeEntryMode(entry.mode);
            if (mode === 'none') continue;
            const baseLabel = entry.scope === 'book'
                ? this.buildBookOutlineLabel(entry.path, fallbackLabel)
                : fallbackLabel;
            if (mode === 'summary') {
                const synopsis = this.getSynopsisForPath(entry.path);
                if (!synopsis) continue;
                blocks.push({ label: `${baseLabel} summary`, content: synopsis });
                continue;
            }
            const content = await this.readFileContent(entry.path);
            if (!content) continue;
            blocks.push({ label: baseLabel, content });
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
                const synopsis = this.getSynopsisForPath(entry.path);
                if (!synopsis) continue;
                blocks.push({ label: `${baseLabel} summary`, content: synopsis });
                continue;
            }
            const content = await this.readFileContent(entry.path);
            if (!content) continue;
            blocks.push({ label: baseLabel, content });
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
            return await this.vault.read(file);
        } catch {
            return null;
        }
    }

    private getSynopsisForPath(path: string): string | null {
        const file = this.vault.getAbstractFileByPath(path);
        if (!file || !this.isTFile(file)) return null;
        const frontmatter = this.getFrontmatter(file);
        const synopsis = this.extractSynopsis(frontmatter);
        return synopsis ? synopsis : null;
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
            'Book: material = scenes in this book (synopsis-based unless configured otherwise).',
            'Saga: material = books in saga (outlines + scene synopses unless configured otherwise).',
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
            '      "ref_id": "S12",',
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
            'Book: material = scenes in this book (synopsis-based unless configured otherwise).',
            'Saga: material = books in saga (outlines + scene synopses unless configured otherwise).',
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
            '          "ref_id": "S12",',
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
        maxTokens: number
    ): Promise<ProviderResult> {
        return callProvider(this.plugin, {
            provider: ai.provider,
            modelId: ai.modelId,
            systemPrompt,
            userPrompt,
            maxTokens,
            temperature,
            jsonSchema,
            responseFormat: { type: 'json_schema', json_schema: { name: 'inquiry_result', schema: jsonSchema } }
        });
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
        const mappedFindings = findings.map(finding => this.mapFinding(finding, input.focusLabel));

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

    private mapFinding(raw: RawInquiryFinding, fallbackRef: string): InquiryFinding {
        const kind = this.normalizeFindingKind(raw.kind);
        const refId = raw.ref_id ? String(raw.ref_id) : fallbackRef;
        const lens = this.normalizeFindingLens(raw.lens);
        const bullets = Array.isArray(raw.bullets)
            ? raw.bullets.map(value => String(value)).filter(Boolean)
            : [];
        return {
            refId,
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

    private buildStubResult(
        input: InquiryRunnerInput,
        aiMeta: Pick<InquiryResult, 'aiProvider' | 'aiModelRequested' | 'aiModelResolved' | 'aiStatus' | 'aiReason'>,
        error?: unknown
    ): InquiryResult {
        const message = error instanceof Error ? error.message : error ? String(error) : '';
        const summary = this.buildStubSummary(aiMeta.aiStatus, aiMeta.aiReason, message);
        const bullets = message ? [`Runner note: ${message}`] : ['Deterministic placeholder result.'];

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
                refId: input.focusLabel,
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

    private extractSynopsis(frontmatter: Record<string, unknown>): string {
        const raw = frontmatter['Synopsis'];
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
        const tokenEstimate = this.buildTokenEstimate(systemPrompt, userPrompt);
        const trace: InquiryRunTrace = {
            systemPrompt,
            userPrompt,
            evidenceText,
            tokenEstimate,
            outputTokenCap: INQUIRY_MAX_OUTPUT_TOKENS,
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
        const tokenEstimate = this.buildTokenEstimate(systemPrompt, userPrompt);
        const trace: InquiryRunTrace = {
            systemPrompt,
            userPrompt,
            evidenceText,
            tokenEstimate,
            outputTokenCap: INQUIRY_MAX_OUTPUT_TOKENS,
            response: null,
            sanitizationNotes,
            notes
        };

        return { trace };
    }

    private buildTokenEstimate(systemPrompt: string, userPrompt: string): InquiryRunTrace['tokenEstimate'] {
        const inputChars = (systemPrompt?.length ?? 0) + (userPrompt?.length ?? 0);
        const inputTokens = this.estimateTokensFromChars(inputChars);
        const outputTokens = INQUIRY_MAX_OUTPUT_TOKENS;
        return {
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
            inputChars
        };
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
