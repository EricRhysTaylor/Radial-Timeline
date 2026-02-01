/*
 * Unified AI exchange logging
 */
import type RadialTimelinePlugin from '../main';
import { normalizePath, Notice, type Vault, TFile, TFolder } from 'obsidian';
import { resolveInquiryLogFolder } from '../inquiry/utils/logs';

export type AiLogFeature = 'Inquiry' | 'Pulse' | 'Synopsis' | 'Gossamer';
export type AiLogStatus = 'success' | 'error' | 'simulated';

export type TokenUsage = {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
};

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

const REDACT_KEYS = new Set([
    'apikey',
    'api_key',
    'api-key',
    'authorization',
    'x-api-key',
    'x_api_key',
    'access_token',
    'refresh_token',
    'token',
    'secret'
]);

export function sanitizeLogPayload(value: unknown): { sanitized: unknown; redactedKeys: string[] } {
    const redactedKeys = new Set<string>();
    const sanitize = (input: unknown): unknown => {
        if (Array.isArray(input)) {
            return input.map(item => sanitize(item));
        }
        if (input && typeof input === 'object') {
            const output: Record<string, unknown> = {};
            Object.entries(input as Record<string, unknown>).forEach(([key, val]) => {
                const keyLower = key.toLowerCase();
                if (REDACT_KEYS.has(keyLower)) {
                    redactedKeys.add(key);
                    output[key] = '[REDACTED]';
                } else {
                    output[key] = sanitize(val);
                }
            });
            return output;
        }
        return input;
    };
    return { sanitized: sanitize(value), redactedKeys: Array.from(redactedKeys) };
}

export function extractTokenUsage(provider: string, responseData: unknown): TokenUsage | null {
    if (!responseData || typeof responseData !== 'object') return null;
    const data = responseData as Record<string, unknown>;

    if ((provider === 'openai' || provider === 'local') && data.usage && typeof data.usage === 'object') {
        const usage = data.usage as Record<string, unknown>;
        const input = typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : undefined;
        const output = typeof usage.completion_tokens === 'number' ? usage.completion_tokens : undefined;
        const total = typeof usage.total_tokens === 'number' ? usage.total_tokens : undefined;
        return { inputTokens: input, outputTokens: output, totalTokens: total };
    }

    if (provider === 'anthropic' && data.usage && typeof data.usage === 'object') {
        const usage = data.usage as Record<string, unknown>;
        const input = typeof usage.input_tokens === 'number' ? usage.input_tokens : undefined;
        const output = typeof usage.output_tokens === 'number' ? usage.output_tokens : undefined;
        return { inputTokens: input, outputTokens: output };
    }

    if (provider === 'gemini' && data.usageMetadata && typeof data.usageMetadata === 'object') {
        const usage = data.usageMetadata as Record<string, unknown>;
        const total = typeof usage.totalTokenCount === 'number' ? usage.totalTokenCount : undefined;
        const input = typeof usage.promptTokenCount === 'number' ? usage.promptTokenCount : undefined;
        const output = typeof usage.candidatesTokenCount === 'number' ? usage.candidatesTokenCount : undefined;
        return { inputTokens: input, outputTokens: output, totalTokens: total };
    }

    return null;
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
    options?: { jsonSpacing?: number }
): string {
    const lines: string[] = [];
    const normalizeText = (value?: string | null) => value && value.trim() ? value : 'N/A';
    const formatList = (items?: string[]) => items && items.length ? items.join('; ') : 'None.';
    const formatRetries = (count?: number) => typeof count === 'number' ? String(count) : 'None.';
    const formatUsage = (usage?: TokenUsage | null) => {
        if (!usage || (usage.inputTokens === undefined && usage.outputTokens === undefined && usage.totalTokens === undefined)) {
            return 'not available';
        }
        const input = usage.inputTokens ?? 'n/a';
        const output = usage.outputTokens ?? 'n/a';
        const total = usage.totalTokens ?? 'n/a';
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
        try {
            return JSON.stringify(value, null, jsonSpacing);
        } catch {
            return JSON.stringify(String(value));
        }
    };

    lines.push(`# ${envelope.title}`, '');

    lines.push('## Run Metadata');
    lines.push(`- Feature: ${envelope.metadata.feature}`);
    lines.push(`- Scope / Target: ${envelope.metadata.scopeTarget ?? 'unknown'}`);
    lines.push(`- Provider: ${envelope.metadata.provider ?? 'unknown'}`);
    lines.push(`- Model requested / resolved: ${envelope.metadata.modelRequested ?? 'unknown'} / ${envelope.metadata.modelResolved ?? 'unknown'}`);
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
    lines.push('');

    lines.push('## Request');
    lines.push('### System/developer prompt text');
    lines.push('```text');
    lines.push(normalizeText(envelope.request.systemPrompt));
    lines.push('```', '');
    lines.push('### User prompt text');
    lines.push('```text');
    lines.push(normalizeText(envelope.request.userPrompt));
    lines.push('```', '');
    lines.push('### Materials/Evidence text');
    lines.push('```text');
    lines.push(normalizeText(envelope.request.evidenceText));
    lines.push('```', '');
    lines.push('### API request payload JSON');
    lines.push('```json');
    lines.push(safeStringify(envelope.request.requestPayload));
    lines.push('```', '');

    lines.push('## Response');
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

    lines.push('## Notes');
    lines.push(`- Sanitization steps: ${formatList(envelope.notes.sanitizationSteps)}`);
    lines.push(`- Retry attempts: ${formatRetries(envelope.notes.retryAttempts)}`);
    lines.push(`- Schema normalization warnings: ${formatList(envelope.notes.schemaWarnings)}`);

    if (envelope.derivedSummary && envelope.derivedSummary.trim()) {
        lines.push('', '## DERIVED SUMMARY', envelope.derivedSummary.trim());
    }

    return lines.join('\n');
}

export function formatSummaryLogContent(envelope: SummaryLogEnvelope): string {
    const lines: string[] = [];

    const formatUsage = (usage?: TokenUsage | null) => {
        if (!usage || (usage.inputTokens === undefined && usage.outputTokens === undefined && usage.totalTokens === undefined)) {
            return 'not available';
        }
        const input = usage.inputTokens ?? 'n/a';
        const output = usage.outputTokens ?? 'n/a';
        const total = usage.totalTokens ?? 'n/a';
        return `input=${input}, output=${output}, total=${total}`;
    };

    const formatRetries = (count?: number) => typeof count === 'number' ? String(count) : '0';

    lines.push(`# ${envelope.title}`, '');

    lines.push('## Run Summary');
    lines.push(`- Feature: ${envelope.feature}`);
    lines.push(`- Scope / Target: ${envelope.scopeTarget ?? 'unknown'}`);
    lines.push(`- Provider: ${envelope.provider ?? 'unknown'}`);
    lines.push(`- Model requested / resolved: ${envelope.modelRequested ?? 'unknown'} / ${envelope.modelResolved ?? 'unknown'}`);
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
        console.error('[AI][log] Failed to write log:', e);
        new Notice('Failed to write AI log.');
    }
}
