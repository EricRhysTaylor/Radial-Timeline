import { TFile } from 'obsidian';
import type { MetadataCache, Vault } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { normalizeFrontmatterKeys } from '../../utils/frontmatter';
import { callAnthropicApi } from '../../api/anthropicApi';
import { callGeminiApi } from '../../api/geminiApi';
import { callOpenAiApi } from '../../api/openaiApi';
import { resolveKey } from '../../api/providerRouter';
import { DEFAULT_ANTHROPIC_MODEL_ID, DEFAULT_GEMINI_MODEL_ID, DEFAULT_OPENAI_MODEL_ID } from '../../constants/aiDefaults';
import { INQUIRY_SCHEMA_VERSION } from '../constants';
import type { InquiryConfidence, InquiryFinding, InquiryResult, InquirySeverity } from '../state';
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
    severity?: string;
    confidence?: string;
};

type RawInquiryResponse = {
    schema_version?: number;
    summary?: string;
    verdict?: {
        flow?: number;
        depth?: number;
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

        try {
            const response = await this.callProvider(systemPrompt, userPrompt, input.ai);
            const parsed = this.parseResponse(response.content);
            return this.buildResult(input, parsed);
        } catch (error) {
            return this.buildStubResult(input, error);
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
        const schema = [
            '{',
            `  "schema_version": ${INQUIRY_SCHEMA_VERSION},`,
            '  "summary": "1-2 sentence editorial summary",',
            '  "verdict": {',
            '    "flow": 0.0,',
            '    "depth": 0.0,',
            '    "severity": "low|medium|high",',
            '    "confidence": "low|medium|high"',
            '  },',
            '  "findings": [',
            '    {',
            '      "ref_id": "S12",',
            '      "kind": "string",',
            '      "headline": "short line",',
            '      "bullets": ["optional", "points"],',
            '      "severity": "low|medium|high",',
            '      "confidence": "low|medium|high"',
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
                        severity: { type: 'string' },
                        confidence: { type: 'string' }
                    },
                    required: ['flow', 'depth', 'severity', 'confidence']
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
                            severity: { type: 'string' },
                            confidence: { type: 'string' }
                        },
                        required: ['ref_id', 'kind', 'headline', 'severity', 'confidence']
                    }
                }
            },
            required: ['schema_version', 'summary', 'verdict', 'findings']
        };
    }

    private async callProvider(
        systemPrompt: string,
        userPrompt: string,
        ai: InquiryRunnerInput['ai']
    ): Promise<{ content: string }> {
        const provider = ai.provider || (this.plugin.settings.defaultAiProvider || 'openai');
        const jsonSchema = this.getJsonSchema();
        const temperature = 0.2;
        const maxTokens = 1200;

        if (provider === 'anthropic') {
            const rawKey = this.plugin.settings.anthropicApiKey || '';
            const apiKey = await resolveKey(this.plugin.app, rawKey);
            const modelId = ai.modelId || DEFAULT_ANTHROPIC_MODEL_ID;
            if (!apiKey || !modelId) {
                throw new Error('Anthropic API key or Model ID not configured in settings.');
            }
            const response = await callAnthropicApi(apiKey, modelId, systemPrompt, userPrompt, maxTokens);
            if (!response.success || !response.content) {
                throw new Error(response.error || 'Anthropic API returned no content.');
            }
            return { content: response.content };
        }

        if (provider === 'gemini') {
            const rawKey = this.plugin.settings.geminiApiKey || '';
            const apiKey = await resolveKey(this.plugin.app, rawKey);
            const modelId = ai.modelId || DEFAULT_GEMINI_MODEL_ID;
            if (!apiKey || !modelId) {
                throw new Error('Gemini API key or Model ID not configured in settings.');
            }
            const response = await callGeminiApi(apiKey, modelId, systemPrompt, userPrompt, maxTokens, temperature, jsonSchema, true);
            if (!response.success || !response.content) {
                throw new Error(response.error || 'Gemini API returned no content.');
            }
            return { content: response.content };
        }

        const rawKey = provider === 'local' ? (this.plugin.settings.localApiKey || '') : (this.plugin.settings.openaiApiKey || '');
        const apiKey = await resolveKey(this.plugin.app, rawKey);
        const modelId = ai.modelId || DEFAULT_OPENAI_MODEL_ID;
        const baseUrl = provider === 'local' ? (this.plugin.settings.localBaseUrl || 'http://localhost:11434/v1') : undefined;
        if (!modelId) {
            throw new Error('OpenAI/Local Model ID not configured in settings.');
        }
        const response = await callOpenAiApi(
            apiKey,
            modelId,
            systemPrompt,
            userPrompt,
            maxTokens,
            baseUrl,
            { type: 'json_schema', json_schema: { name: 'inquiry_result', schema: jsonSchema } },
            temperature
        );
        if (!response.success || !response.content) {
            throw new Error(response.error || 'OpenAI API returned no content.');
        }
        return { content: response.content };
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

    private buildResult(input: InquiryRunnerInput, parsed: RawInquiryResponse): InquiryResult {
        const verdict = parsed.verdict || {};
        const flow = this.normalizeScore(verdict.flow);
        const depth = this.normalizeScore(verdict.depth);
        const severity = this.normalizeSeverity(verdict.severity);
        const confidence = this.normalizeConfidence(verdict.confidence);

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
                severity,
                confidence
            },
            findings: mappedFindings,
            corpusFingerprint: input.corpus.fingerprint
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
            severity: this.normalizeSeverity(raw.severity),
            confidence: this.normalizeConfidence(raw.confidence),
            headline: raw.headline ? String(raw.headline) : 'Finding',
            bullets,
            related: [],
            evidenceType: 'mixed'
        };
    }

    private buildStubResult(input: InquiryRunnerInput, error?: unknown): InquiryResult {
        const message = error instanceof Error ? error.message : error ? String(error) : '';
        const summary = message
            ? 'Stub result returned (AI unavailable).'
            : 'Preview result for inquiry.';
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
                severity: 'low',
                confidence: 'low'
            },
            findings: [{
                refId: input.focusLabel,
                kind: 'unclear',
                status: 'unclear',
                severity: 'low',
                confidence: 'low',
                headline: 'Inquiry stub result.',
                bullets,
                related: [],
                evidenceType: 'mixed'
            }],
            corpusFingerprint: input.corpus.fingerprint
        };
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

    private normalizeSeverity(value: unknown): InquirySeverity {
        const normalized = typeof value === 'string' ? value.toLowerCase().trim() : '';
        if (normalized === 'high' || normalized === 'medium' || normalized === 'low') {
            return normalized as InquirySeverity;
        }
        return 'low';
    }

    private normalizeConfidence(value: unknown): InquiryConfidence {
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
