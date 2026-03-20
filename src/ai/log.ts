/*
 * Unified AI exchange logging
 */
import type RadialTimelinePlugin from '../main';
import { normalizePath, Notice, type Vault, TFile, TFolder } from 'obsidian';
import { resolveInquiryLogFolder } from '../inquiry/utils/logs';
import { redactSensitiveObject, redactSensitiveValue } from './credentials/redactSensitive';
import { getModelDisplayName } from '../utils/modelResolver';
import {
    type CorpusCostEstimate,
    estimateCorpusCost,
    estimateUsageCost
} from './cost/estimateCorpusCost';
import { extractTokenUsage, type TokenUsage } from './usage/providerUsage';

export { extractTokenUsage, type TokenUsage } from './usage/providerUsage';

export type AiLogFeature = 'Inquiry' | 'Pulse' | 'Synopsis' | 'Gossamer';
export type AiLogStatus = 'success' | 'error' | 'simulated';

export type AiLogRequest = {
    systemPrompt?: string | null;
    userPrompt?: string | null;
    evidenceText?: string | null;
    requestPayload?: unknown;
};

export type AiLogResponse = {
    rawResponse?: unknown;
    assistantContent?: string | null;
    parsedOutput?: unknown;
};

export type AiLogNotes = {
    sanitizationSteps?: string[];
    retryAttempts?: number;
    schemaWarnings?: string[];
};

export type AiLogEnvelope = {
    title: string;
    metadata: {
        feature: AiLogFeature;
        scopeTarget?: string | null;
        provider?: string | null;
        modelRequested?: string | null;
        modelResolved?: string | null;
        modelNextRunOnly?: boolean | null;
        estimatedInputTokens?: number | null;
        tokenTier?: string | null;
        submittedAt?: Date | null;
        returnedAt?: Date | null;
        durationMs?: number | null;
        status: AiLogStatus;
        tokenUsage?: TokenUsage | null;
    };
    request: AiLogRequest;
    response: AiLogResponse;
    notes: AiLogNotes;
    derivedSummary?: string | null;
};

export type SummaryLogEnvelope = {
    title: string;
    feature: AiLogFeature;
    scopeTarget?: string | null;
    provider?: string | null;
    modelRequested?: string | null;
    modelResolved?: string | null;
    submittedAt?: Date | null;
    returnedAt?: Date | null;
    durationMs?: number | null;
    status: AiLogStatus;
    tokenUsage?: TokenUsage | null;
    resultSummary?: string | null;
    errorReason?: string | null;
    suggestedFixes?: string[];
    contentLogWritten: boolean;
    retryAttempts?: number;
};

export type UsageCostBreakdown = {
    inputTokens?: number;
    outputTokens?: number;
    rawInputTokens?: number;
    cacheReadInputTokens?: number;
    cacheCreationInputTokens?: number;
    cacheCreation5mInputTokens?: number;
    cacheCreation1hInputTokens?: number;
    rawInputCostUSD?: number;
    cacheReadCostUSD?: number;
    cacheCreationCostUSD?: number;
    inputCostUSD?: number;
    outputCostUSD?: number;
    totalCostUSD?: number;
};

function normalizePricingProvider(provider?: string | null): 'anthropic' | 'openai' | 'google' | null {
    const normalized = (provider || '').trim().toLowerCase();
    if (normalized === 'anthropic') return 'anthropic';
    if (normalized === 'openai') return 'openai';
    if (normalized === 'google' || normalized === 'gemini') return 'google';
    return null;
}

export function buildUsageCostBreakdown(
    provider: string | null | undefined,
    modelId: string | null | undefined,
    usage?: TokenUsage | null
): UsageCostBreakdown | null {
    if (!usage) return null;
    const pricingProvider = normalizePricingProvider(provider);
    if (!pricingProvider || !modelId) return null;

    try {
        return estimateUsageCost(pricingProvider, modelId, usage);
    } catch {
        return null;
    }
}

export interface LogCostEstimateInput {
    executionInputTokens: number;
    expectedOutputTokens: number;
    expectedPasses: number;
    cacheReuseRatio?: number;
}

function formatDeltaPercent(estimated: number, actual: number): string {
    if (!Number.isFinite(estimated) || !Number.isFinite(actual) || actual === 0) return 'unavailable';
    const deltaPct = ((estimated - actual) / actual) * 100;
    return `${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}%`;
}

export function formatUsageCostBreakdownLines(
    provider: string | null | undefined,
    modelId: string | null | undefined,
    usage?: TokenUsage | null,
    estimateInput?: LogCostEstimateInput | null
): string[] {
    const breakdown = buildUsageCostBreakdown(provider, modelId, usage);
    const pricingProvider = normalizePricingProvider(provider);
    let estimate: CorpusCostEstimate | null = null;
    if (pricingProvider && modelId && estimateInput) {
        try {
            estimate = estimateCorpusCost(
                pricingProvider,
                modelId,
                estimateInput.executionInputTokens,
                estimateInput.expectedOutputTokens,
                estimateInput.expectedPasses,
                { cacheReuseRatio: estimateInput.cacheReuseRatio }
            );
        } catch {
            estimate = null;
        }
    }
    if (!breakdown && !estimate) return [];

    const formatTokenCount = (value?: number): string => {
        if (typeof value !== 'number' || !Number.isFinite(value)) return 'unavailable';
        return `~${Math.round(value).toLocaleString()} tokens`;
    };
    const formatCost = (value?: number): string => {
        if (typeof value !== 'number' || !Number.isFinite(value)) return 'unavailable';
        return `$${value.toFixed(2)}`;
    };
    const lines = [
        '## Cost Breakdown',
        `- Billed input total: ${formatTokenCount(breakdown?.inputTokens)}`,
        `- Raw input: ${formatTokenCount(breakdown?.rawInputTokens)}`,
        `- Cache read: ${formatTokenCount(breakdown?.cacheReadInputTokens)}`,
        `- Cache write: ${formatTokenCount(breakdown?.cacheCreationInputTokens)}`,
        `- Output: ${formatTokenCount(breakdown?.outputTokens)}`,
        '',
        `- Estimated fresh: ${formatCost(estimate?.freshCostUSD)}`,
        `- Estimated cached: ${formatCost(estimate?.cachedCostUSD)}`,
        `- Effective cost: ${formatCost(breakdown?.totalCostUSD)}`
    ];
    if (
        estimate
        && typeof breakdown?.totalCostUSD === 'number'
        && Number.isFinite(breakdown.totalCostUSD)
    ) {
        lines.push('');
        lines.push('## Cost Accuracy');
        lines.push(`- Estimated: ${formatCost(estimate.effectiveCostUSD)}`);
        lines.push(`- Actual: ${formatCost(breakdown.totalCostUSD)}`);
        lines.push(`- Delta: ${formatDeltaPercent(estimate.effectiveCostUSD, breakdown.totalCostUSD)}`);
    }
    lines.push('');
    return lines;
}

export function sanitizeLogPayload(value: unknown): { sanitized: unknown; hadRedactions: boolean } {
    const sanitized = redactSensitiveObject(value);
    let hadRedactions = false;
    try {
        hadRedactions = JSON.stringify(value) !== JSON.stringify(sanitized);
    } catch {
        hadRedactions = true;
    }
    return { sanitized, hadRedactions };
}

export function formatLogTimestamp(date: Date, options?: { includeSeconds?: boolean }): string {
    if (!Number.isFinite(date.getTime())) return 'Unknown date';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[date.getMonth()];
    const day = date.getDate();
    const year = date.getFullYear();
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();
    const am = hours < 12;
    hours = hours % 12;
    if (hours === 0) hours = 12;
    const minuteText = String(minutes).padStart(2, '0');
    const includeSeconds = options?.includeSeconds ?? false;
    const secondText = includeSeconds ? `.${String(seconds).padStart(2, '0')}` : '';
    return `${month} ${day} ${year} @ ${hours}.${minuteText}${secondText}${am ? 'am' : 'pm'}`;
}

export function formatLocalAndIso(date?: Date | null): string {
    if (!date || !Number.isFinite(date.getTime())) return 'unknown';
    const local = formatLogTimestamp(date, { includeSeconds: true });
    return `${local} (${date.toISOString()})`;
}

export function formatDuration(ms?: number | null): string {
    if (typeof ms !== 'number' || !Number.isFinite(ms)) return 'unknown';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    const seconds = ms / 1000;
    const rounded = seconds >= 10 ? seconds.toFixed(1) : seconds.toFixed(2);
    return `${rounded.replace(/\.0+$/, '')}s (${Math.round(ms)}ms)`;
}

export function formatAiLogContent(
    envelope: AiLogEnvelope,
    options?: { jsonSpacing?: number; metadataExtras?: string[] }
): string {
    const lines: string[] = [];
    const normalizeText = (value?: string | null) => value && value.trim() ? value : 'N/A';
    const formatList = (items?: string[]) => items && items.length ? items.join('; ') : 'None.';
    const formatRetries = (count?: number) => typeof count === 'number' ? String(count) : 'None.';
    const formatUsage = (usage?: TokenUsage | null) => {
        if (!usage || (usage.inputTokens === undefined && usage.outputTokens === undefined && usage.totalTokens === undefined)) {
            return 'not available';
        }
        const input = usage.inputTokens ?? 'unavailable';
        const output = usage.outputTokens ?? 'unavailable';
        const total = usage.totalTokens ?? 'unavailable';
        return `input=${input}, output=${output}, total=${total}`;
    };
    const formatNextRunOnly = (value?: boolean | null) => {
        if (value === true) return 'true';
        if (value === false) return 'false';
        return 'unknown';
    };
    const formatTokenEstimate = (value?: number | null) => {
        if (typeof value !== 'number' || !Number.isFinite(value)) return 'unknown';
        return Math.round(value).toString();
    };
    const formatTokenTier = (value?: string | null) => {
        if (!value) return 'unknown';
        return value;
    };
    const jsonSpacing = typeof options?.jsonSpacing === 'number' ? options.jsonSpacing : 2;
    const safeStringify = (value: unknown) => {
        if (value === undefined) return 'undefined';
        const redactedValue = redactSensitiveObject(value);
        try {
            return JSON.stringify(redactedValue, null, jsonSpacing);
        } catch {
            return JSON.stringify(redactSensitiveValue(String(redactedValue)));
        }
    };
    const resolveExpectedSchema = (payload: unknown): { source: string; schema: unknown } | null => {
        if (!payload || typeof payload !== 'object') return null;
        const data = payload as Record<string, unknown>;
        const responseFormat = data.response_format ?? data.responseFormat;
        if (responseFormat && typeof responseFormat === 'object') {
            const format = responseFormat as Record<string, unknown>;
            if (format.type === 'json_schema' && format.json_schema) {
                return { source: 'response_format.json_schema', schema: format.json_schema };
            }
            return { source: 'response_format', schema: format };
        }
        const generationConfig = data.generationConfig;
        if (generationConfig && typeof generationConfig === 'object') {
            const config = generationConfig as Record<string, unknown>;
            if (config.responseSchema) {
                return { source: 'generationConfig.responseSchema', schema: config.responseSchema };
            }
            if (config.response_schema) {
                return { source: 'generationConfig.response_schema', schema: config.response_schema };
            }
        }
        return null;
    };
    const metadataExtras = options?.metadataExtras ?? [];
    const formatModel = (modelId?: string | null): string => {
        if (!modelId) return 'unknown';
        return getModelDisplayName(modelId, { debug: true });
    };
    const modelRequestedDisplay = formatModel(envelope.metadata.modelRequested);
    const modelResolvedDisplay = formatModel(envelope.metadata.modelResolved);

    lines.push('## Run Metadata');
    lines.push(`- Feature: ${envelope.metadata.feature}`);
    lines.push(`- Scope / Target: ${envelope.metadata.scopeTarget ?? 'unknown'}`);
    lines.push(`- Provider: ${envelope.metadata.provider ?? 'unknown'}`);
    lines.push(`- Model requested / resolved: ${modelRequestedDisplay} / ${modelResolvedDisplay}`);
    if (envelope.metadata.feature === 'Inquiry') {
        lines.push(`- Next-run override: ${formatNextRunOnly(envelope.metadata.modelNextRunOnly)}`);
        lines.push(`- Estimated input tokens: ${formatTokenEstimate(envelope.metadata.estimatedInputTokens)}`);
        lines.push(`- Input token tier: ${formatTokenTier(envelope.metadata.tokenTier)}`);
    }
    lines.push(`- Submitted: ${formatLocalAndIso(envelope.metadata.submittedAt)}`);
    lines.push(`- Returned: ${formatLocalAndIso(envelope.metadata.returnedAt)}`);
    lines.push(`- Duration: ${formatDuration(envelope.metadata.durationMs)}`);
    lines.push(`- Status: ${envelope.metadata.status}`);
    lines.push(`- Token usage: ${formatUsage(envelope.metadata.tokenUsage)}`);
    if (metadataExtras.length) {
        lines.push(...metadataExtras);
    }
    lines.push('');

    lines.push('## Prompts');
    lines.push('### System prompt');
    lines.push('```text');
    lines.push(normalizeText(envelope.request.systemPrompt));
    lines.push('```', '');
    lines.push('### User prompt');
    lines.push('```text');
    lines.push(normalizeText(envelope.request.userPrompt));
    lines.push('```', '');

    lines.push('## Expected response schema');
    const expectedSchema = resolveExpectedSchema(envelope.request.requestPayload);
    if (expectedSchema) {
        lines.push('```json');
        lines.push(safeStringify(expectedSchema.schema));
        lines.push('```', '');
    } else {
        lines.push('None.', '');
    }

    lines.push('## AI Response');
    lines.push('### Raw provider response JSON');
    lines.push('```json');
    lines.push(safeStringify(envelope.response.rawResponse));
    lines.push('```', '');
    lines.push('### Extracted assistant content');
    lines.push('```text');
    lines.push(normalizeText(envelope.response.assistantContent));
    lines.push('```', '');
    lines.push('### Parsed output JSON');
    lines.push('```json');
    lines.push(safeStringify(envelope.response.parsedOutput));
    lines.push('```', '');

    if (envelope.derivedSummary && envelope.derivedSummary.trim()) {
        lines.push('### Derived summary');
        lines.push(envelope.derivedSummary.trim(), '');
    }

    lines.push('## Notes / normalization');
    lines.push(`- Sanitization steps: ${formatList(envelope.notes.sanitizationSteps)}`);
    lines.push(`- Retry attempts: ${formatRetries(envelope.notes.retryAttempts)}`);
    lines.push(`- Schema normalization warnings: ${formatList(envelope.notes.schemaWarnings)}`);
    lines.push('');

    lines.push('## Materials / Evidence sent to AI');
    lines.push('### API request payload JSON');
    lines.push('```json');
    lines.push(safeStringify(envelope.request.requestPayload));
    lines.push('```', '');
    lines.push('### Materials/Evidence text');
    lines.push('```text');
    lines.push(normalizeText(envelope.request.evidenceText));
    lines.push('```');

    return lines.join('\n');
}

export function formatSummaryLogContent(envelope: SummaryLogEnvelope): string {
    const lines: string[] = [];
    const formatModel = (modelId?: string | null): string => {
        if (!modelId) return 'unknown';
        return getModelDisplayName(modelId, { debug: true });
    };
    const modelRequestedDisplay = formatModel(envelope.modelRequested);
    const modelResolvedDisplay = formatModel(envelope.modelResolved);

    const formatUsage = (usage?: TokenUsage | null) => {
        if (!usage || (usage.inputTokens === undefined && usage.outputTokens === undefined && usage.totalTokens === undefined)) {
            return 'not available';
        }
        const input = usage.inputTokens ?? 'unavailable';
        const output = usage.outputTokens ?? 'unavailable';
        const total = usage.totalTokens ?? 'unavailable';
        return `input=${input}, output=${output}, total=${total}`;
    };

    const formatRetries = (count?: number) => typeof count === 'number' ? String(count) : '0';

    lines.push('## Run Summary');
    lines.push(`- Feature: ${envelope.feature}`);
    lines.push(`- Scope / Target: ${envelope.scopeTarget ?? 'unknown'}`);
    lines.push(`- Provider: ${envelope.provider ?? 'unknown'}`);
    lines.push(`- Model requested / resolved: ${modelRequestedDisplay} / ${modelResolvedDisplay}`);
    lines.push(`- Submitted: ${formatLocalAndIso(envelope.submittedAt)}`);
    lines.push(`- Returned: ${formatLocalAndIso(envelope.returnedAt)}`);
    lines.push(`- Duration: ${formatDuration(envelope.durationMs)}`);
    lines.push(`- Status: ${envelope.status}`);
    lines.push(`- Token usage: ${formatUsage(envelope.tokenUsage)}`);
    lines.push(`- Retry attempts: ${formatRetries(envelope.retryAttempts)}`);
    lines.push('');

    if (envelope.status === 'error') {
        lines.push('## Failure Reason');
        lines.push(envelope.errorReason ?? 'Unknown failure.');
        lines.push('');
        if (envelope.suggestedFixes && envelope.suggestedFixes.length) {
            lines.push('## Suggested Fixes');
            envelope.suggestedFixes.forEach(fix => {
                lines.push(`- ${fix}`);
            });
            lines.push('');
        }
    } else {
        lines.push('## Result');
        if (envelope.status === 'success') {
            lines.push(`- ${envelope.resultSummary ?? 'Completed successfully.'}`);
        } else if (envelope.status === 'simulated') {
            lines.push('- Simulated run (no provider call).');
        }
        lines.push('');
    }

    lines.push(`Content Log: ${envelope.contentLogWritten ? 'written' : 'skipped'}`);
    lines.push('');

    return lines.join('\n');
}

export function resolveAiLogFolder(): string {
    return resolveInquiryLogFolder();
}

export function resolveAvailableLogPath(vault: Vault, folderPath: string, baseName: string): string {
    const sanitizedFolder = normalizePath(folderPath);
    const cleanBase = baseName.replace(/\.md$/i, '');
    let attempt = 0;
    while (attempt < 50) {
        const suffix = attempt === 0 ? '' : `-${attempt}`;
        const filePath = `${sanitizedFolder}/${cleanBase}${suffix}.md`;
        if (!vault.getAbstractFileByPath(filePath)) {
            return filePath;
        }
        attempt += 1;
    }
    return `${sanitizedFolder}/${cleanBase}-${Date.now()}.md`;
}

export function countAiLogFiles(plugin: RadialTimelinePlugin): number {
    const folderPath = resolveAiLogFolder();
    const abstractFile = plugin.app.vault.getAbstractFileByPath(folderPath);
    if (!abstractFile || !(abstractFile instanceof TFolder)) {
        return 0;
    }

    let count = 0;
    const countRecursive = (folder: TFolder) => {
        for (const child of folder.children) {
            if (child instanceof TFile && child.extension === 'md') {
                count += 1;
            } else if (child instanceof TFolder) {
                countRecursive(child);
            }
        }
    };
    countRecursive(abstractFile);
    return count;
}

export async function writeAiLog(
    plugin: RadialTimelinePlugin,
    vault: Vault,
    options: { baseName: string; content: string }
): Promise<void> {
    if (!plugin.settings.logApiInteractions) return;
    const folderPath = normalizePath(resolveAiLogFolder());
    try {
        const existing = vault.getAbstractFileByPath(folderPath);
        if (existing && !(existing instanceof TFolder)) {
            throw new Error('Log folder path is not a folder.');
        }
        try {
            await vault.createFolder(folderPath);
        } catch {
            // Folder may already exist.
        }
        const filePath = resolveAvailableLogPath(vault, folderPath, options.baseName);
        await vault.create(filePath, options.content.trim());
    } catch (e) {
        console.error('[AI][log] Failed to write log:', redactSensitiveObject(e));
        new Notice('Failed to write AI log.');
    }
}
