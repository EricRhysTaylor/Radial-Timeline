/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import { Notice, type Vault } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { getSceneAnalysisJsonSchema, getSceneAnalysisSystemPrompt } from '../ai/prompts/sceneAnalysis';
import type { AiProviderResponse, ParsedSceneAnalysis } from './types';
import { parsePulseAnalysisResponse } from './responseParsing';
import { getAIClient } from '../ai/runtime/aiClient';
import { mapAiProviderToLegacyProvider, mapLegacyProviderToAiProvider } from '../ai/settings/aiSettings';
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

    // `sanitizeLogPayload` must run before any disk write so logs never persist plaintext credentials.
    const { sanitized: sanitizedPayload, hadRedactions } = sanitizeLogPayload(payload.requestPayload ?? null);
    const tokenUsage = extractTokenUsage(payload.provider, payload.responseData);
    const sanitizedNotes = hadRedactions
        ? ['Redacted sensitive credential values from request payload.']
        : [];
    const durationMs = payload.submittedAt && payload.returnedAt
        ? payload.returnedAt.getTime() - payload.submittedAt.getTime()
        : null;

    const isError = payload.status === 'error';
    const shouldWriteContent = plugin.settings.logApiInteractions || isError;

    // Content log is optional and must stay non-blocking for generation flow.
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
            console.error('[Pulse][log] Failed to write content log:', sanitizeLogPayload(e).sanitized);
            // Non-blocking: continue with summary log.
        }
    }

    // Summary log is always attempted for AI runs.
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
        console.error('[Pulse][log] Failed to write summary log:', sanitizeLogPayload(e).sanitized);
        // Non-blocking: logging failures should not break the AI run.
    }
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
    const provider = (plugin.settings.defaultAiProvider || 'openai') as 'openai' | 'anthropic' | 'gemini' | 'local';
    const aiClient = getAIClient(plugin);
    let responseDataForLog: unknown;
    let result: string | null = null;
    let submittedAt: Date | null = null;
    let returnedAt: Date | null = null;
    let runResult: Awaited<ReturnType<typeof aiClient.run>> | null = null;
    let systemPrompt = '';
    let modelRequested: string | undefined;
    let modelResolved: string | undefined;
    const providerOverride = mapLegacyProviderToAiProvider(provider);

    try {
        let jsonSchema: Record<string, unknown>;
        // Legacy `synopsis` commandContext maps to Summary refresh prompts for backward compatibility.
        if (commandContext === 'synopsis') {
            const { getSummaryJsonSchema, getSummarySystemPrompt } = await import('../ai/prompts/synopsis');
            jsonSchema = getSummaryJsonSchema();
            systemPrompt = getSummarySystemPrompt();
        } else {
            jsonSchema = getSceneAnalysisJsonSchema();
            systemPrompt = getSceneAnalysisSystemPrompt();
        }

        submittedAt = new Date();
        runResult = await aiClient.run({
            feature: commandContext === 'synopsis' ? 'SummaryRefresh' : 'PulseAnalysis',
            task: commandContext === 'synopsis' ? 'SceneSummary' : 'ScenePulseTriplet',
            requiredCapabilities: ['jsonStrict', 'reasoningStrong'],
            featureModeInstructions: systemPrompt,
            userInput: userPrompt,
            returnType: 'json',
            responseSchema: jsonSchema,
            providerOverride,
            legacySelectionHint: {
                provider,
                modelId: provider === 'anthropic'
                    ? plugin.settings.anthropicModelId
                    : provider === 'gemini'
                        ? plugin.settings.geminiModelId
                        : provider === 'local'
                            ? plugin.settings.localModelId
                            : plugin.settings.openaiModelId
            },
            overrides: {
                temperature: commandContext === 'synopsis' ? 0.2 : 0.1,
                maxOutputMode: 'high',
                reasoningDepth: 'deep',
                jsonStrict: true
            }
        });
        returnedAt = new Date();

        responseDataForLog = runResult.responseData;
        result = runResult.content;
        modelRequested = runResult.modelRequested;
        modelResolved = runResult.modelResolved;
        const resolvedLegacyProvider = mapAiProviderToLegacyProvider(runResult.provider) as PulseLogPayload['provider'];

        if (runResult.aiStatus !== 'success' || !runResult.content) {
            if (commandContext !== 'synopsis') {
                await writePulseLog(plugin, vault, {
                    provider: resolvedLegacyProvider,
                    modelRequested,
                    modelResolved,
                    requestPayload: runResult.requestPayload,
                    responseData: responseDataForLog,
                    parsed: null,
                    status: 'error',
                    systemPrompt,
                    userPrompt,
                    rawTextResult: runResult.content,
                    sceneName,
                    subplotName,
                    commandContext,
                    tripletInfo,
                    submittedAt,
                    returnedAt,
                    retryCount: runResult.retryCount
                });
            }
            throw new Error(runResult.error || `Error calling ${resolvedLegacyProvider} AI provider.`);
        }

        const parsedForLog = commandContext !== 'synopsis'
            ? parsePulseAnalysisResponse(runResult.content, plugin)
            : null;
        if (commandContext !== 'synopsis') {
            await writePulseLog(plugin, vault, {
                provider: resolvedLegacyProvider,
                modelRequested,
                modelResolved,
                requestPayload: runResult.requestPayload,
                responseData: responseDataForLog,
                parsed: parsedForLog,
                status: 'success',
                systemPrompt,
                userPrompt,
                rawTextResult: runResult.content,
                sceneName,
                subplotName,
                commandContext,
                tripletInfo,
                submittedAt,
                returnedAt,
                retryCount: runResult.retryCount
            });
        }

        return {
            result: runResult.content,
            modelIdUsed: runResult.modelResolved || runResult.modelRequested,
            advancedContext: runResult.advancedContext
        };
    } catch (error) {
        const detailedMessage = error instanceof Error ? error.message : String(error);
        console.error(
            `[API][BeatsCommands][callAiProvider] Error during ${provider} API call:`,
            sanitizeLogPayload(error).sanitized
        );
        new Notice(`Error calling ${provider} API:\n${detailedMessage}`, 8000);

        if (!submittedAt) submittedAt = new Date();
        if (!returnedAt) returnedAt = new Date();
        const logProvider = runResult
            ? (mapAiProviderToLegacyProvider(runResult.provider) as PulseLogPayload['provider'])
            : provider;

        if (commandContext !== 'synopsis') {
            await writePulseLog(plugin, vault, {
                provider: logProvider,
                modelRequested,
                modelResolved,
                requestPayload: runResult?.requestPayload,
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
                retryCount: runResult?.retryCount
            });
        }

        throw error instanceof Error ? error : new Error(String(error));
    }
}
