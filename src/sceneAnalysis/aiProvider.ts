/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import { Notice, type Vault } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { DEFAULT_GEMINI_MODEL_ID, DEFAULT_OPENAI_MODEL_ID, DEFAULT_ANTHROPIC_MODEL_ID } from '../constants/aiDefaults';
import { getSceneAnalysisTokenLimit } from '../constants/tokenLimits';
import { callAnthropicApi } from '../api/anthropicApi';
import { callOpenAiApi } from '../api/openaiApi';
import { callGeminiApi } from '../api/geminiApi';
import { getSceneAnalysisJsonSchema, getSceneAnalysisSystemPrompt } from '../ai/prompts/sceneAnalysis';
import type { AiProviderResponse, ParsedSceneAnalysis } from './types';
import { parsePulseAnalysisResponse } from './responseParsing';
import { cacheResolvedModel, isLatestAlias } from '../utils/modelResolver';
import { buildProviderRequestPayload } from '../api/requestPayload';
import {
    extractTokenUsage,
    formatAiLogContent,
    formatSummaryLogContent,
    formatLogTimestamp,
    resolveAiLogFolder,
    resolveAvailableLogPath,
    sanitizeLogPayload,
    type AiLogStatus
} from '../ai/log';
import { ensurePulseContentLogFolder, resolvePulseContentLogFolder } from '../inquiry/utils/logs';
import { normalizePath, TFolder } from 'obsidian';

type PulseLogPayload = {
    provider: 'openai' | 'anthropic' | 'gemini' | 'local';
    modelRequested?: string;
    modelResolved?: string;
    requestPayload?: unknown;
    responseData?: unknown;
    parsed?: ParsedSceneAnalysis | null;
    status: AiLogStatus;
    systemPrompt?: string | null;
    userPrompt?: string | null;
    rawTextResult?: string | null;
    sceneName?: string;
    subplotName?: string | null;
    commandContext: string;
    tripletInfo?: { prev: string; current: string; next: string };
    submittedAt?: Date | null;
    returnedAt?: Date | null;
    retryCount?: number;
    normalizationWarnings?: string[];
};

const sanitizeSegment = (value: string | null | undefined) => {
    if (!value) return '';
    return value
        .replace(/[<>:"/\\|?*]+/g, '-')
        .replace(/\s+/g, ' ')
        .replace(/-+/g, '-')
        .trim()
        .replace(/^-+|-+$/g, '');
};

const extractEvidenceText = (prompt: string): string => {
    const match = prompt.match(/(^|\n)Scene [^\n]+:\n/);
    if (!match || match.index === undefined) return '';
    const offset = match[1] ? match[1].length : 0;
    return prompt.slice(match.index + offset);
};

const resolveModelIdFromResponse = (
    provider: PulseLogPayload['provider'],
    responseData: unknown
): string | undefined => {
    if (!responseData || typeof responseData !== 'object') return undefined;
    const data = responseData as Record<string, unknown>;
    if ((provider === 'openai' || provider === 'local') && typeof data.model === 'string') {
        return data.model;
    }
    if (provider === 'gemini') {
        if (typeof data.modelVersion === 'string') return data.modelVersion;
        if (typeof data.model === 'string') return data.model;
    }
    if (provider === 'anthropic' && typeof data.model === 'string') {
        return data.model;
    }
    return undefined;
};

async function writePulseLog(
    plugin: RadialTimelinePlugin,
    vault: Vault,
    payload: PulseLogPayload
): Promise<void> {
    const timestampSource = payload.returnedAt ?? payload.submittedAt ?? new Date();
    const readableTimestamp = formatLogTimestamp(timestampSource);
    const sceneLabel = payload.sceneName?.trim() || 'Scene';
    const safeSceneLabel = sanitizeSegment(sceneLabel) || 'Scene';
    const logType = payload.commandContext === 'synopsis' ? 'Synopsis' : 'Pulse';

    const scopeBits = [`Scene ${sceneLabel}`];
    if (payload.subplotName) scopeBits.push(`Subplot ${payload.subplotName}`);
    if (payload.tripletInfo) {
        scopeBits.push(`Triplet ${payload.tripletInfo.prev}/${payload.tripletInfo.current}/${payload.tripletInfo.next}`);
    }
    if (payload.commandContext) scopeBits.push(`Command ${payload.commandContext}`);
    const scopeTarget = scopeBits.join(' · ');

    const { sanitized: sanitizedPayload, redactedKeys } = sanitizeLogPayload(payload.requestPayload ?? null);
    const tokenUsage = extractTokenUsage(payload.provider, payload.responseData);
    const sanitizedNotes = redactedKeys.length
        ? [`Redacted request keys: ${redactedKeys.join(', ')}.`]
        : [];
    const durationMs = payload.submittedAt && payload.returnedAt
        ? payload.returnedAt.getTime() - payload.submittedAt.getTime()
        : null;

    const isError = payload.status === 'error';
    const shouldWriteContent = plugin.settings.logApiInteractions || isError;

    // Write Content Log first (if enabled) so we know whether to mark it as written
    let contentLogWritten = false;
    if (shouldWriteContent) {
        try {
            const contentFolder = await ensurePulseContentLogFolder(plugin.app);
            if (contentFolder) {
                const contentTitle = `${logType} Content Log — ${sceneLabel} ${readableTimestamp}`;
                const contentBaseName = `${logType} Content Log — ${safeSceneLabel} ${readableTimestamp}`;
                const evidenceText = payload.userPrompt ? extractEvidenceText(payload.userPrompt) : '';

                const contentLogContent = formatAiLogContent({
                    title: contentTitle,
                    metadata: {
                        feature: payload.commandContext === 'synopsis' ? 'Synopsis' : 'Pulse',
                        scopeTarget,
                        provider: payload.provider,
                        modelRequested: payload.modelRequested ?? 'unknown',
                        modelResolved: payload.modelResolved ?? 'unknown',
                        submittedAt: payload.submittedAt ?? null,
                        returnedAt: payload.returnedAt ?? null,
                        durationMs,
                        status: payload.status,
                        tokenUsage
                    },
                    request: {
                        systemPrompt: payload.systemPrompt ?? '',
                        userPrompt: payload.userPrompt ?? '',
                        evidenceText,
                        requestPayload: sanitizedPayload
                    },
                    response: {
                        rawResponse: payload.responseData ?? null,
                        assistantContent: payload.rawTextResult ?? '',
                        parsedOutput: payload.parsed ?? null
                    },
                    notes: {
                        sanitizationSteps: sanitizedNotes,
                        retryAttempts: payload.retryCount,
                        schemaWarnings: payload.normalizationWarnings
                    }
                });

                const contentFolderPath = resolvePulseContentLogFolder();
                const contentFilePath = resolveAvailableLogPath(vault, contentFolderPath, contentBaseName);
                await vault.create(contentFilePath, contentLogContent.trim());
                contentLogWritten = true;
            }
        } catch (e) {
            console.error('[Pulse][log] Failed to write content log:', e);
            // Non-blocking: continue with summary log
        }
    }

    // Write Summary Log (always written for AI runs)
    try {
        const summaryFolderPath = normalizePath(resolveAiLogFolder());
        const existing = vault.getAbstractFileByPath(summaryFolderPath);
        if (existing && !(existing instanceof TFolder)) {
            console.error('[Pulse][log] Log folder path is not a folder.');
            return;
        }
        try {
            await vault.createFolder(summaryFolderPath);
        } catch {
            // Folder may already exist.
        }

        const summaryTitle = `${logType} Log — ${sceneLabel} ${readableTimestamp}`;
        const summaryBaseName = `${logType} Log — ${safeSceneLabel} ${readableTimestamp}`;

        const resultSummary = payload.status === 'success' && payload.parsed
            ? `Analysis complete.`
            : undefined;

        const summaryContent = formatSummaryLogContent({
            title: summaryTitle,
            feature: payload.commandContext === 'synopsis' ? 'Synopsis' : 'Pulse',
            scopeTarget,
            provider: payload.provider,
            modelRequested: payload.modelRequested ?? 'unknown',
            modelResolved: payload.modelResolved ?? 'unknown',
            submittedAt: payload.submittedAt ?? null,
            returnedAt: payload.returnedAt ?? null,
            durationMs,
            status: payload.status,
            tokenUsage,
            resultSummary,
            errorReason: isError ? (payload.rawTextResult || 'Unknown error.') : null,
            suggestedFixes: isError ? ['Retry or check API configuration.'] : undefined,
            contentLogWritten,
            retryAttempts: payload.retryCount
        });

        const summaryFilePath = resolveAvailableLogPath(vault, summaryFolderPath, summaryBaseName);
        await vault.create(summaryFilePath, summaryContent.trim());
    } catch (e) {
        console.error('[Pulse][log] Failed to write summary log:', e);
        // Non-blocking: logging failures should not break the AI run
    }
}

async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelayMs: number = 5000
): Promise<{ result: T; retryCount: number }> {
    let retryCount = 0;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const result = await fn();
            return { result, retryCount };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const isRateLimitError = errorMessage.toLowerCase().includes('rate limit') ||
                errorMessage.toLowerCase().includes('overloaded') ||
                errorMessage.toLowerCase().includes('too many requests');

            if (isRateLimitError && attempt < maxRetries) {
                retryCount += 1;
                const delayMs = baseDelayMs * Math.pow(2, attempt);
                new Notice(`Rate limit reached. Waiting ${delayMs / 1000}s before retry (${attempt + 1}/${maxRetries})...`, 3000);
                await new Promise(resolve => window.setTimeout(resolve, delayMs));
                continue;
            }

            throw error;
        }
    }
    const exhaustedError = new Error('Retry logic exhausted without success');
    (exhaustedError as Error & { retryCount?: number }).retryCount = retryCount;
    throw exhaustedError;
}

export async function callAiProvider(
    plugin: RadialTimelinePlugin,
    vault: Vault,
    userPrompt: string,
    subplotName: string | null,
    commandContext: string,
    sceneName?: string,
    tripletInfo?: { prev: string; current: string; next: string }
): Promise<AiProviderResponse> {
    const provider = plugin.settings.defaultAiProvider || 'openai';
    let apiKey: string | undefined;
    let modelRequested: string | undefined;
    let modelId: string | undefined;
    let modelResolved: string | undefined;
    let requestPayload: unknown;
    let responseDataForLog: unknown;
    let result: string | null = null;
    let apiErrorMsg: string | undefined;
    let systemPrompt: string | null = null;
    let retryCount = 0;
    let submittedAt: Date | null = null;
    let returnedAt: Date | null = null;

    try {
        // Determine which schema and system prompt to use based on commandContext
        let jsonSchema: Record<string, unknown>;
        let systemPrompt: string;

        if (commandContext === 'synopsis') {
            // Use Synopsis-specific schema and system prompt
            const { getSynopsisJsonSchema, getSynopsisSystemPrompt } = await import('../ai/prompts/synopsis');
            jsonSchema = getSynopsisJsonSchema();
            systemPrompt = getSynopsisSystemPrompt();
        } else {
            // Default to Pulse Analysis schema for all other contexts
            jsonSchema = getSceneAnalysisJsonSchema();
            systemPrompt = getSceneAnalysisSystemPrompt();
        }

        const normalizeModelId = (prov: string, id: string | undefined): string | undefined => {
            if (!id) return id;
            switch (prov) {
                case 'anthropic': {
                    // Route legacy/old model IDs to current defaults
                    const legacyIds = new Set([
                        'claude-opus-4-1', 'claude-4.1-opus', 'claude-opus-4-1@20250805', 'claude-opus-4-1-20250805',
                        'claude-opus-4-0', 'claude-3-opus-20240229', 'claude-opus-4-20250514'
                    ]);
                    const sonnetLegacyIds = new Set([
                        'claude-sonnet-4-1', 'claude-4-sonnet', 'claude-sonnet-4-1@20250805',
                        'claude-sonnet-4-0', 'claude-3-7-sonnet-20250219', 'claude-sonnet-4-20250514'
                    ]);
                    if (legacyIds.has(id)) return 'claude-opus-4-5-20251101';
                    if (sonnetLegacyIds.has(id)) return DEFAULT_ANTHROPIC_MODEL_ID;
                    return id;
                }
                case 'openai': {
                    // Route legacy model IDs to latest
                    const legacyIds = new Set(['gpt-5', 'o3', 'gpt-4o', 'gpt-4.1', 'gpt-4-turbo']);
                    if (legacyIds.has(id)) return DEFAULT_OPENAI_MODEL_ID;
                    return id;
                }
                case 'gemini': {
                    const cleaned = id.trim().replace(/^models\//, '');
                    const legacyIds = new Set([
                        'gemini-2.5-pro',
                        'gemini-2.0-flash-exp',
                        'gemini-ultra',
                        'gemini-creative',
                        'gemini-1.0-pro',
                        'gemini-1.5-pro',
                        'gemini-3-pro-preview'
                    ]);
                    if (legacyIds.has(cleaned)) return DEFAULT_GEMINI_MODEL_ID;
                    return cleaned;
                }
                default:
                    return id;
            }
        };

        if (provider === 'anthropic') {
            const maxTokens = getSceneAnalysisTokenLimit('anthropic');
            apiKey = plugin.settings.anthropicApiKey;
            modelRequested = plugin.settings.anthropicModelId || DEFAULT_ANTHROPIC_MODEL_ID;
            modelId = normalizeModelId('anthropic', modelRequested) || DEFAULT_ANTHROPIC_MODEL_ID;
            const callArgs = { userPrompt, systemPrompt, maxTokens };
            requestPayload = buildProviderRequestPayload('anthropic', modelId, callArgs);

            if (!apiKey || !modelId) {
                apiErrorMsg = 'Anthropic API key or Model ID not configured in settings.';
                responseDataForLog = { error: { message: apiErrorMsg, type: 'plugin_config_error' } };
                throw new Error(apiErrorMsg);
            }

            submittedAt = new Date();
            const { result: apiResponse, retryCount: callRetryCount } = await retryWithBackoff(() =>
                callAnthropicApi(apiKey!, modelId!, systemPrompt, userPrompt, maxTokens)
            );
            returnedAt = new Date();
            retryCount = callRetryCount;

            responseDataForLog = apiResponse.responseData;
            modelResolved = resolveModelIdFromResponse(provider, responseDataForLog) ?? modelId;
            if (!apiResponse.success || !apiResponse.content) {
                apiErrorMsg = apiResponse.error ?? 'Anthropic API returned no content.';
                throw new Error(apiErrorMsg);
            }
            result = apiResponse.content;
        } else if (provider === 'openai') {
            const maxTokens = getSceneAnalysisTokenLimit('openai');
            apiKey = plugin.settings.openaiApiKey;
            modelRequested = plugin.settings.openaiModelId || DEFAULT_OPENAI_MODEL_ID;
            modelId = normalizeModelId('openai', modelRequested) || DEFAULT_OPENAI_MODEL_ID;
            const responseFormat = { type: 'json_schema' as const, json_schema: { name: 'scene_analysis', schema: jsonSchema } };
            const callArgs = { userPrompt, systemPrompt, maxTokens, responseFormat };
            requestPayload = buildProviderRequestPayload('openai', modelId, callArgs);

            if (!apiKey || !modelId) {
                apiErrorMsg = 'OpenAI API key or Model ID not configured in settings.';
                responseDataForLog = { error: { message: apiErrorMsg, type: 'plugin_config_error' } };
                throw new Error(apiErrorMsg);
            }

            submittedAt = new Date();
            const { result: apiResponse, retryCount: callRetryCount } = await retryWithBackoff(() =>
                callOpenAiApi(
                    apiKey!,
                    modelId!,
                    systemPrompt,
                    userPrompt,
                    maxTokens,
                    undefined,
                    responseFormat,
                    undefined,
                    undefined
                )
            );
            returnedAt = new Date();
            retryCount = callRetryCount;

            responseDataForLog = apiResponse.responseData;
            modelResolved = resolveModelIdFromResponse(provider, responseDataForLog) ?? modelId;
            if (!apiResponse.success || !apiResponse.content) {
                apiErrorMsg = apiResponse.error ?? 'OpenAI API returned no content.';
                throw new Error(apiErrorMsg);
            }
            result = apiResponse.content;
            
            // Cache the resolved model version if using a "latest" alias
            if (isLatestAlias(modelId)) {
                const responseObj = apiResponse.responseData as Record<string, unknown>;
                const resolvedVersion = responseObj?.model as string | undefined;
                if (resolvedVersion) {
                    cacheResolvedModel(modelId, resolvedVersion);
                }
            }
        } else if (provider === 'gemini') {
            const maxTokens = getSceneAnalysisTokenLimit('gemini');
            apiKey = plugin.settings.geminiApiKey;
            modelRequested = plugin.settings.geminiModelId || DEFAULT_GEMINI_MODEL_ID;
            modelId = normalizeModelId('gemini', modelRequested) || DEFAULT_GEMINI_MODEL_ID;
            const callArgs = { userPrompt, systemPrompt, maxTokens, temperature: 0.2, jsonSchema };
            requestPayload = buildProviderRequestPayload('gemini', modelId, callArgs);

            if (!apiKey || !modelId) {
                apiErrorMsg = 'Gemini API key or Model ID not configured in settings.';
                responseDataForLog = { error: { message: apiErrorMsg, type: 'plugin_config_error' } };
                throw new Error(apiErrorMsg);
            }

            submittedAt = new Date();
            const { result: apiResponse, retryCount: callRetryCount } = await retryWithBackoff(() =>
                callGeminiApi(apiKey!, modelId!, systemPrompt, userPrompt, maxTokens, 0.2, jsonSchema, true)
            );
            returnedAt = new Date();
            retryCount = callRetryCount;

            responseDataForLog = apiResponse.responseData;
            modelResolved = resolveModelIdFromResponse(provider, responseDataForLog) ?? modelId;
            if (!apiResponse.success || !apiResponse.content) {
                apiErrorMsg = apiResponse.error ?? 'Gemini API returned no content.';
                throw new Error(apiErrorMsg);
            }
            result = apiResponse.content;
            
            // Cache the resolved model version if using a "latest" alias
            if (isLatestAlias(modelId)) {
                const responseObj = apiResponse.responseData as Record<string, unknown>;
                const resolvedVersion = responseObj?.modelVersion as string | undefined;
                if (resolvedVersion) {
                    cacheResolvedModel(modelId, resolvedVersion);
                }
            }
        } else if (provider === 'local') {
            const maxTokens = getSceneAnalysisTokenLimit('local');
            const localBaseUrl = plugin.settings.localBaseUrl || 'http://localhost:11434/v1';
            modelRequested = plugin.settings.localModelId || 'llama3';
            modelId = modelRequested;
            apiKey = plugin.settings.localApiKey || ''; // Optional for local
            const responseFormat = { type: 'json_schema' as const, json_schema: { name: 'scene_analysis', schema: jsonSchema } };
            const callArgs = { userPrompt, systemPrompt, maxTokens, responseFormat, temperature: 0.1 };
            requestPayload = buildProviderRequestPayload('local', modelId, callArgs);

            if (!localBaseUrl || !modelId) {
                apiErrorMsg = 'Local Base URL or Model ID not configured in settings.';
                responseDataForLog = { error: { message: apiErrorMsg, type: 'plugin_config_error' } };
                throw new Error(apiErrorMsg);
            }

            submittedAt = new Date();
            const { result: apiResponse, retryCount: callRetryCount } = await retryWithBackoff(() =>
                callOpenAiApi(
                    apiKey!,
                    modelId!,
                    systemPrompt,
                    userPrompt,
                    maxTokens,
                    localBaseUrl,
                    responseFormat,
                    0.1,
                    undefined
                )
            );
            returnedAt = new Date();
            retryCount = callRetryCount;

            responseDataForLog = apiResponse.responseData;
            modelResolved = resolveModelIdFromResponse(provider, responseDataForLog) ?? modelId;
            if (!apiResponse.success || !apiResponse.content) {
                apiErrorMsg = apiResponse.error ?? 'Local API returned no content.';
                throw new Error(apiErrorMsg);
            }
            result = apiResponse.content;
        } else {
            throw new Error(`Unsupported AI provider: ${provider}`);
        }

        // Only parse for pulse analysis (not synopsis)
        const parsedForLog = (result && commandContext !== 'synopsis') ? parsePulseAnalysisResponse(result, plugin) : null;

        // Only write pulse logs for pulse analysis (not synopsis)
        if (commandContext !== 'synopsis') {
            await writePulseLog(plugin, vault, {
                provider,
                modelRequested,
                modelResolved: modelResolved ?? modelId,
                requestPayload,
                responseData: responseDataForLog,
                parsed: parsedForLog,
                status: 'success',
                systemPrompt,
                userPrompt,
                rawTextResult: result,
                sceneName,
                subplotName,
                commandContext,
                tripletInfo,
                submittedAt,
                returnedAt,
                retryCount
            });
        }

        return { result, modelIdUsed: modelId };
    } catch (error) {
        const detailedMessage = error instanceof Error ? error.message : String(error);
        if (apiErrorMsg) {
            new Notice(`${apiErrorMsg}\n\n${detailedMessage}`, 8000);
        } else {
            console.error(`[API][BeatsCommands][callAiProvider] Error during ${provider} API call:`, error);
            new Notice(`Error calling ${provider} API:\n${detailedMessage}`, 8000);
        }

        const retryHint = (error as Error & { retryCount?: number }).retryCount;
        if (typeof retryHint === 'number') {
            retryCount = retryHint;
        }
        if (!submittedAt) submittedAt = new Date();
        if (!returnedAt) returnedAt = new Date();
        if (!modelResolved) {
            modelResolved = resolveModelIdFromResponse(provider, responseDataForLog) ?? modelId;
        }

        // Only write pulse logs for pulse analysis (not synopsis)
        if (commandContext !== 'synopsis') {
            await writePulseLog(plugin, vault, {
                provider,
                modelRequested,
                modelResolved: modelResolved ?? modelId,
                requestPayload,
                responseData: responseDataForLog,
                parsed: null,
                status: 'error',
                systemPrompt,
                userPrompt,
                rawTextResult: result,
                sceneName,
                subplotName,
                commandContext,
                tripletInfo,
                submittedAt,
                returnedAt,
                retryCount
            });
        }

        throw error instanceof Error ? error : new Error(String(error));
    }
}
