import { TFile } from 'obsidian';
import type { MetadataCache, Vault } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { normalizeFrontmatterKeys } from '../../utils/frontmatter';
import { callProvider, type ProviderResult } from '../../api/providerRouter';
import { INQUIRY_SCHEMA_VERSION } from '../constants';
import type { InquiryAiStatus, InquiryConfidence, InquiryFinding, InquiryResult, InquirySeverity } from '../state';
import type { CorpusManifestEntry, InquiryRunner, InquiryRunnerInput } from './types';

const BOOK_FOLDER_REGEX = /^Book\s+(\d+)/i;
const SCENE_NEIGHBOR_RANGE = 2;

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

export class InquiryRunnerService implements InquiryRunner {
    constructor(
        private plugin: RadialTimelinePlugin,
        private vault: Vault,
        private metadataCache: MetadataCache,
        private frontmatterMappings?: Record<string, string>
    ) {}

    async run(input: InquiryRunnerInput): Promise<InquiryResult> {
        const evidenceBlocks = await this.buildEvidenceBlocks(input);
        const { systemPrompt, userPrompt } = this.buildPrompt(input, evidenceBlocks);
        const jsonSchema = this.getJsonSchema();
        const temperature = 0.2;
        const maxTokens = 1200;
        let response: ProviderResult | null = null;

        try {
            response = await this.callProvider(systemPrompt, userPrompt, input.ai, jsonSchema, temperature, maxTokens);
            if (!response.success || !response.content || response.aiStatus !== 'success') {
                return this.buildStubResult(input, this.getAiMetaFromResponse(response), response.error);
            }
            const parsed = this.parseResponse(response.content);
            return this.buildResult(input, parsed, this.getAiMetaFromResponse(response));
        } catch (error) {
            const fallbackMeta = response
                ? this.withParseFailureMeta(this.getAiMetaFromResponse(response), response.aiStatus)
                : this.buildFallbackAiMeta(input);
            return this.buildStubResult(input, fallbackMeta, error);
        }
    }

    private async buildEvidenceBlocks(input: InquiryRunnerInput): Promise<EvidenceBlock[]> {
        const blocks: EvidenceBlock[] = [];
        const sceneEntries = input.corpus.entries.filter(entry => entry.class === 'scene');
        const outlineEntries = input.corpus.entries.filter(entry => entry.class === 'outline');

        if (input.scope === 'book') {
            const scenes = await this.buildSceneSnapshots(sceneEntries);
            const focusPath = input.focusSceneId || scenes[0]?.path;
            if (focusPath) {
                const focusIndex = scenes.findIndex(scene => scene.path === focusPath);
                const indices = this.buildNeighborIndices(focusIndex, scenes.length, SCENE_NEIGHBOR_RANGE);
                indices.forEach(index => {
                    const scene = scenes[index];
                    if (!scene) return;
                    const content = scene.synopsis || 'Synopsis unavailable.';
                    blocks.push({ label: `Scene ${scene.label} synopsis`, content });
                });
            }

            const bookOutline = await this.pickBookOutline(outlineEntries, input.focusBookId);
            if (bookOutline) {
                blocks.push(bookOutline);
            }
        } else {
            const sagaOutlines = await this.collectOutlines(outlineEntries.filter(entry => entry.scope === 'saga'), 'Saga outline');
            blocks.push(...sagaOutlines);

            const bookOutlines = await this.collectOutlines(outlineEntries.filter(entry => entry.scope === 'book'), 'Book outline');
            blocks.push(...bookOutlines);

            const scenes = await this.buildSceneSnapshots(sceneEntries);
            scenes.forEach(scene => {
                if (!scene.synopsis) return;
                blocks.push({ label: `Scene ${scene.label} synopsis`, content: scene.synopsis });
            });
        }

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

    private buildNeighborIndices(center: number, total: number, range: number): number[] {
        if (center < 0) return [];
        const indices = new Set<number>();
        for (let offset = -range; offset <= range; offset += 1) {
            const idx = center + offset;
            if (idx >= 0 && idx < total) indices.add(idx);
        }
        return Array.from(indices).sort((a, b) => a - b);
    }

    private async pickBookOutline(entries: CorpusManifestEntry[], focusBookId?: string): Promise<EvidenceBlock | null> {
        if (!entries.length) return null;
        const candidates = focusBookId
            ? entries.filter(entry => entry.path === focusBookId || entry.path.startsWith(`${focusBookId}/`))
            : entries;
        const entry = candidates[0] ?? entries[0];
        if (!entry) return null;
        const content = await this.readFileContent(entry.path);
        if (!content) return null;
        const label = this.buildBookOutlineLabel(entry.path, 'Book outline');
        return { label, content };
    }

    private async collectOutlines(entries: CorpusManifestEntry[], fallbackLabel: string): Promise<EvidenceBlock[]> {
        const blocks: EvidenceBlock[] = [];
        for (const entry of entries) {
            const content = await this.readFileContent(entry.path);
            if (!content) continue;
            const label = entry.scope === 'book'
                ? this.buildBookOutlineLabel(entry.path, fallbackLabel)
                : fallbackLabel;
            blocks.push({ label, content });
        }
        return blocks;
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

    private buildPrompt(input: InquiryRunnerInput, evidence: EvidenceBlock[]): { systemPrompt: string; userPrompt: string } {
        const systemPrompt = 'You are an editorial analysis engine. Return JSON only. No prose outside JSON.';
        // Lens choice is UI-only; always request both flow + depth in the same response.
        const schema = [
            '{',
            `  "schema_version": ${INQUIRY_SCHEMA_VERSION},`,
            '  "summary": "1-2 sentence editorial summary",',
            '  "verdict": {',
            '    "flow": 0.0,',
            '    "depth": 0.0,',
            '    "impact": "low|medium|high",',
            '    "assessmentConfidence": "low|medium|high"',
            '  },',
            '  "findings": [',
            '    {',
            '      "ref_id": "S12",',
            '      "kind": "string",',
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
            'Answer both flow (momentum) and depth (structure/integrity).',
            'Return JSON only using the exact schema below.',
            '',
            schema,
            '',
            'Evidence:',
            evidenceText
        ].join('\n');

        return { systemPrompt, userPrompt };
    }

    private getJsonSchema(): Record<string, unknown> {
        return {
            type: 'object',
            properties: {
                schema_version: { type: 'number', const: INQUIRY_SCHEMA_VERSION },
                summary: { type: 'string' },
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
            required: ['schema_version', 'summary', 'verdict', 'findings']
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

        return {
            runId: `run-${Date.now()}`,
            scope: input.scope,
            focusId: input.focusLabel,
            mode: input.mode,
            questionId: input.questionId,
            summary: parsed.summary ? String(parsed.summary) : 'No summary provided.',
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

    private mapFinding(raw: RawInquiryFinding, fallbackRef: string): InquiryFinding {
        const kind = this.normalizeFindingKind(raw.kind);
        const refId = raw.ref_id ? String(raw.ref_id) : fallbackRef;
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
            evidenceType: 'mixed'
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
            summary,
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
                evidenceType: 'mixed'
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

    private buildFallbackAiMeta(input: InquiryRunnerInput): Pick<InquiryResult, 'aiProvider' | 'aiModelRequested' | 'aiModelResolved' | 'aiStatus' | 'aiReason'> {
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

    private getFrontmatter(file: TFile): Record<string, unknown> {
        const cache = this.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter as Record<string, unknown> | undefined;
        if (!frontmatter) return {};
        return normalizeFrontmatterKeys(frontmatter, this.frontmatterMappings);
    }

    private extractSynopsis(frontmatter: Record<string, unknown>): string {
        const raw = frontmatter['Synopsis'] ?? frontmatter['Summary'];
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

    private clampLabelNumber(value: number): number {
        if (!Number.isFinite(value)) return 1;
        return Math.min(Math.max(Math.floor(value), 1), 999);
    }

    private isTFile(file: { path: string } | TFile): file is TFile {
        return file instanceof TFile;
    }
}
