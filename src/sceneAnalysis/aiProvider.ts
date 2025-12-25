/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import { Notice, type Vault } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { DEFAULT_GEMINI_MODEL_ID } from '../constants/aiDefaults';
import { callAnthropicApi } from '../api/anthropicApi';
import { callOpenAiApi } from '../api/openaiApi';
import { callGeminiApi } from '../api/geminiApi';
import { getSceneAnalysisJsonSchema, getSceneAnalysisSystemPrompt } from '../ai/prompts/sceneAnalysis';
import type { AiProviderResponse, ApiRequestData, ParsedSceneAnalysis } from './types';
import { parseGptResult } from './responseParsing';


async function logApiInteractionToFile(
    plugin: RadialTimelinePlugin,
    vault: Vault,
    provider: 'openai' | 'anthropic' | 'gemini' | 'local',
    modelId: string,
    requestData: unknown,
    responseData: unknown,
    subplotName: string | null,
    commandContext: string,
    sceneName?: string,
    tripletInfo?: { prev: string; current: string; next: string },
    analysis?: ParsedSceneAnalysis | null,
    options?: {
        force?: boolean;
        supplementalLocalInstructions?: string | null;
        rawTextResult?: string | null;
        systemPrompt?: string | null;
    }
): Promise<void> {
    const forceLog = options?.force === true;
    if (!plugin.settings.logApiInteractions && !forceLog) {
        return;
    }

    const logFolder = 'AI';
    const timestamp = new Date().toLocaleString(undefined, {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: true, timeZoneName: 'short'
    } as Intl.DateTimeFormatOptions)
        .replace(/\//g, '-')
        .replace(/(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)\s*([A-Z]{3,})/g, 'at $1.$2.$3 $4 $5')
        .replace(/[\s,]+/g, ' ')
        .trim();

    const friendlyModelForFilename = (() => {
        const mid = (modelId || '').toLowerCase();
        if (provider === 'anthropic') {
            if (mid.includes('sonnet-4-5') || mid.includes('sonnet-4.5')) return 'Claude Sonnet 4.5';
            if (mid.includes('opus-4-1') || mid.includes('opus-4.1')) return 'Claude Opus 4.1';
            if (mid.includes('sonnet-4')) return 'Claude Sonnet 4';
            if (mid.includes('opus-4')) return 'Claude Opus 4';
        } else if (provider === 'gemini') {
            if (mid.includes('3-pro')) return 'Gemini 3 Pro';
            if (mid.includes('2.5-pro') || mid.includes('2-5-pro')) return 'Gemini Legacy';
        } else if (provider === 'openai') {
            if (mid.includes('gpt-4.1') || mid.includes('gpt-4-1')) return 'GPT-4.1';
        }
        return modelId;
    })();

    const sanitizeSegment = (value: string | null | undefined) => {
        if (!value) return '';
        return value
            .replace(/[<>:"/\\|?*]+/g, '-')
            .replace(/\s+/g, ' ')
            .replace(/-+/g, '-')
            .trim()
            .replace(/^-+|-+$/g, '');
    };

    const safeModelSegment = sanitizeSegment(friendlyModelForFilename) || 'local-model';
    const safeTimestamp = sanitizeSegment(timestamp) || new Date().getTime().toString();
    let fileName: string;
    if (sceneName) {
        const cleanSceneName = sanitizeSegment(sceneName) || 'Scene';
        fileName = `${cleanSceneName} — ${safeModelSegment} — ${safeTimestamp}.md`;
    } else {
        fileName = `${provider}-log-${safeTimestamp}.md`;
    }

    const filePath = `${logFolder}/${fileName}`;
    const isObject = (data: unknown): data is Record<string, unknown> => {
        return typeof data === 'object' && data !== null;
    };

    const safeRequestData = isObject(requestData) ? requestData as ApiRequestData : null;
    const requestJson = JSON.stringify(requestData, null, 2);
    const responseJson = JSON.stringify(responseData, null, 2);

    let usageString = '**Usage:** N/A';
    try {
        if (responseData && typeof responseData === 'object') {
            const rd = responseData as Record<string, unknown>;
            if (provider === 'openai' && 'usage' in rd) {
                const u = (rd as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage;
                if (u && (typeof u.prompt_tokens === 'number' || typeof u.completion_tokens === 'number')) {
                    usageString = `**Usage (OpenAI):** prompt=${u.prompt_tokens ?? 'n/a'}, output=${u.completion_tokens ?? 'n/a'}`;
                }
            } else if (provider === 'anthropic' && 'usage' in rd) {
                const u = (rd as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
                if (u && (typeof u.input_tokens === 'number' || typeof u.output_tokens === 'number')) {
                    usageString = `**Usage (Anthropic):** input=${u.input_tokens ?? 'n/a'}, output=${u.output_tokens ?? 'n/a'}`;
                }
            } else if (provider === 'gemini' && 'usageMetadata' in rd) {
                const u = (rd as { usageMetadata?: { totalTokenCount?: number; promptTokenCount?: number; candidatesTokenCount?: number } }).usageMetadata;
                usageString = `**Usage (Gemini):** total=${u?.totalTokenCount ?? 'n/a'}, prompt=${u?.promptTokenCount ?? 'n/a'}, output=${u?.candidatesTokenCount ?? 'n/a'}`;
            } else if (provider === 'local' && 'usage' in rd) {
                const u = (rd as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage;
                if (u && (typeof u.prompt_tokens === 'number' || typeof u.completion_tokens === 'number')) {
                    usageString = `**Usage (Local):** prompt=${u.prompt_tokens ?? 'n/a'}, output=${u.completion_tokens ?? 'n/a'}`;
                }
            }
        }
    } catch { }

    let outcomeSection = '### Outcome\n\n';
    if (responseData && typeof responseData === 'object') {
        const responseAsRecord = responseData as Record<string, unknown>;
        if (responseAsRecord.error) {
            outcomeSection += `**Status:** Failed\n`;
            const errObj = responseAsRecord.error as Record<string, unknown>;
            outcomeSection += `**Error Type:** ${String(errObj?.type ?? 'Unknown')}\n`;
            outcomeSection += `**Message:** ${String(errObj?.message ?? 'No message provided')}\n`;
            if (typeof errObj?.status !== 'undefined') {
                outcomeSection += `**Status Code:** ${String(errObj.status)}\n`;
            }
            outcomeSection += '\n';
        } else {
            let success = false;
            let contentForCheck: string | undefined | null = null;
            if (provider === 'openai') {
                const choices = responseAsRecord.choices as unknown;
                if (Array.isArray(choices) && choices[0] && typeof choices[0] === 'object') {
                    const msg = (choices[0] as Record<string, unknown>).message as Record<string, unknown> | undefined;
                    const content = msg?.content as string | undefined;
                    contentForCheck = content;
                }
                success = !!contentForCheck;
            } else if (provider === 'local') {
                const choices = responseAsRecord.choices as unknown;
                if (Array.isArray(choices) && choices[0] && typeof choices[0] === 'object') {
                    const msg = (choices[0] as Record<string, unknown>).message as Record<string, unknown> | undefined;
                    const content = msg?.content as string | undefined;
                    contentForCheck = content;
                }
                success = !!contentForCheck;
            } else if (provider === 'anthropic') {
                const contentArr = responseAsRecord.content as unknown;
                if (Array.isArray(contentArr) && contentArr[0] && typeof contentArr[0] === 'object') {
                    const text = (contentArr[0] as Record<string, unknown>).text as string | undefined;
                    contentForCheck = text ?? (responseData as { content?: string }).content;
                }
                success = !!contentForCheck;
            } else if (provider === 'gemini') {
                const candidates = responseAsRecord.candidates as unknown;
                if (Array.isArray(candidates) && candidates[0] && typeof candidates[0] === 'object') {
                    const content = (candidates[0] as Record<string, unknown>).content as Record<string, unknown> | undefined;
                    const parts = content?.parts as Array<{ text?: string }>;
                    contentForCheck = parts?.map(p => p.text).filter(Boolean).join('\n');
                }
                success = !!contentForCheck;
            }

            outcomeSection += `**Status:** ${success ? 'Success' : 'Failure'}\n`;
            if (success) {
                outcomeSection += `**Tokens returned:** ${contentForCheck?.length ?? 0}\n\n`;
            } else {
                outcomeSection += `**Details:** Model returned no content.\n\n`;
            }
        }
    }

    let subplotSection = '';
    if (subplotName) {
        subplotSection = `\n**Subplot:** ${subplotName}\n`;
    }

    const tripletSection = tripletInfo
        ? `\n**Context Triplet:**\n- Prev: ${tripletInfo.prev}\n- Current: ${tripletInfo.current}\n- Next: ${tripletInfo.next}\n`
        : '';

    let promptContent = '';
    if (safeRequestData) {
        if (typeof (safeRequestData as any).userPrompt === 'string') {
            promptContent = (safeRequestData as any).userPrompt;
        } else if (Array.isArray(safeRequestData.messages) && safeRequestData.messages[0] && typeof safeRequestData.messages[safeRequestData.messages.length - 1].content === 'string') {
            // Get the last message (usually user)
            promptContent = safeRequestData.messages[safeRequestData.messages.length - 1].content;
        }
    }

    const formatAnalysisSection = (header: string, content: string | undefined): string => {
        if (!content || !content.trim()) return `${header}:\n  - Not available`;
        const lines = content
            .split('\n')
            .map(line => line.trim())
            .filter(Boolean)
            .map(line => (line.startsWith('-') ? line : `- ${line}`));
        return `${header}:\n${lines.map(line => `  ${line}`).join('\n')}`;
    };

    const systemPromptForLog = options?.systemPrompt?.trim();
    const supplementalLocalPrompt = options?.supplementalLocalInstructions?.trim();

    const tocLines: string[] = [
        '- [Prompt (with supplemental local instructions)](#prompt-with-supplemental-local-instructions)',
        '- [Sent package](#sent-package)',
        '- [Returned package](#returned-package)',
        '- [Return json](#return-json)'
    ];
    if (analysis) {
        tocLines.push('- [Scene analysis](#scene-analysis)');
    }
    tocLines.push('- [Metadata](#metadata)');

    const promptSectionParts: string[] = [];
    promptSectionParts.push('## Prompt (with supplemental local instructions)\n\n');
    if (systemPromptForLog) {
        promptSectionParts.push(`**System prompt:**\n\`\`\`\n${systemPromptForLog}\n\`\`\`\n\n`);
    }
    promptSectionParts.push(`**User prompt:**\n\`\`\`\n${promptContent || 'N/A'}\n\`\`\`\n`);
    if (supplementalLocalPrompt) {
        promptSectionParts.push(`\n**Supplemental local instructions:**\n\`\`\`\n${supplementalLocalPrompt}\n\`\`\`\n`);
    }
    const promptSection = promptSectionParts.join('');

    const sentPackageSection = `## Sent package\n\`\`\`json\n${requestJson}\n\`\`\`\n`;
    const returnedPackageSection = `## Returned package\n\`\`\`\n${options?.rawTextResult ?? '[no text content returned]'}\n\`\`\`\n`;
    const returnJsonSection = `## Return json\n\`\`\`json\n${responseJson}\n\`\`\`\n`;

    const structuredAnalysisSection = analysis
        ? `## Scene analysis\n\n` +
        `${formatAnalysisSection('previousSceneAnalysis', analysis.previousSceneAnalysis)}\n\n` +
        `${formatAnalysisSection('currentSceneAnalysis', analysis.currentSceneAnalysis)}\n\n` +
        `${formatAnalysisSection('nextSceneAnalysis', analysis.nextSceneAnalysis)}\n\n`
        : '';

    const metadataSection = `## Metadata\n\n` +
        `**Provider:** ${provider}\n` +
        `**Model:** ${modelId}\n` +
        `**Scene:** ${sceneName ?? 'N/A'}\n` +
        `**Command:** ${commandContext}\n` +
        `${subplotSection}` +
        `${tripletSection}` +
        `\n${usageString}\n` +
        `\n${outcomeSection}`;

    const fileContent = `# AI Report — ${new Date().toLocaleString()}\n\n` +
        `## Table of contents\n${tocLines.join('\n')}\n\n` +
        promptSection +
        sentPackageSection +
        returnedPackageSection +
        returnJsonSection +
        structuredAnalysisSection +
        metadataSection;

    try {
        const folderExists = vault.getAbstractFileByPath(logFolder);
        if (!folderExists) {
            await vault.createFolder(logFolder);
        }
        const existing = vault.getAbstractFileByPath(filePath);
        if (existing) {
            await vault.modify(existing as any, fileContent.trim());
        } else {
            await vault.create(filePath, fileContent.trim());
        }
    } catch (error) {
        console.error(`[BeatsCommands] Error logging API interaction to file ${filePath}:`, error);
        new Notice(`Failed to write AI log to ${filePath}. Check console.`);
    }
}

async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelayMs: number = 5000
): Promise<T> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const isRateLimitError = errorMessage.toLowerCase().includes('rate limit') ||
                errorMessage.toLowerCase().includes('overloaded') ||
                errorMessage.toLowerCase().includes('too many requests');

            if (isRateLimitError && attempt < maxRetries) {
                const delayMs = baseDelayMs * Math.pow(2, attempt);
                new Notice(`Rate limit reached. Waiting ${delayMs / 1000}s before retry (${attempt + 1}/${maxRetries})...`, 3000);
                await new Promise(resolve => window.setTimeout(resolve, delayMs));
                continue;
            }

            throw error;
        }
    }
    throw new Error('Retry logic exhausted without success');
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
    const forceLocalReport = provider === 'local' && (plugin.settings.localSendPulseToAiReport ?? true);
    const supplementalLocalInstructions = provider === 'local' ? plugin.settings.localLlmInstructions : undefined;
    let apiKey: string | undefined;
    let modelId: string | undefined;
    let requestBodyForLog: object | null = null;
    let responseDataForLog: unknown;
    let result: string | null = null;
    let apiErrorMsg: string | undefined;
    let systemPrompt: string | null = null;

    try {
        const normalizeModelId = (prov: string, id: string | undefined): string | undefined => {
            if (!id) return id;
            switch (prov) {
                case 'anthropic':
                    if (id === 'claude-opus-4-1' || id === 'claude-4.1-opus' || id === 'claude-opus-4-1@20250805') return 'claude-opus-4-1-20250805';
                    if (id === 'claude-sonnet-4-1' || id === 'claude-4-sonnet' || id === 'claude-sonnet-4-1@20250805') return 'claude-sonnet-4-5-20250929';
                    if (id === 'claude-opus-4-0' || id === 'claude-3-opus-20240229') return 'claude-opus-4-1-20250805';
                    if (id === 'claude-sonnet-4-0' || id === 'claude-3-7-sonnet-20250219' || id === 'claude-sonnet-4-20250514') return 'claude-sonnet-4-5-20250929';
                    return id;
                case 'openai':
                    if (id === 'gpt-5' || id === 'o3' || id === 'gpt-4o') return 'gpt-4.1';
                    if (id === 'gpt-4.1') return 'gpt-4.1';
                    return id;
                case 'gemini': {
                    const cleaned = id.trim().replace(/^models\//, '');
                    const legacyIds = new Set([
                        'gemini-2.5-pro',
                        'gemini-2.0-flash-exp',
                        'gemini-ultra',
                        'gemini-creative',
                        'gemini-1.0-pro',
                        'gemini-1.5-pro'
                    ]);
                    if (legacyIds.has(cleaned)) return DEFAULT_GEMINI_MODEL_ID;
                    return cleaned;
                }
                default:
                    return id;
            }
        };

        const jsonSchema = getSceneAnalysisJsonSchema();
        systemPrompt = getSceneAnalysisSystemPrompt();

        if (provider === 'anthropic') {
            apiKey = plugin.settings.anthropicApiKey;
            modelId = normalizeModelId('anthropic', plugin.settings.anthropicModelId) || 'claude-sonnet-4-5-20250929';

            if (!apiKey || !modelId) {
                apiErrorMsg = 'Anthropic API key or Model ID not configured in settings.';
                responseDataForLog = { error: { message: apiErrorMsg, type: 'plugin_config_error' } };
                throw new Error(apiErrorMsg);
            }

            requestBodyForLog = {
                model: modelId,
                system: systemPrompt || undefined,
                userPrompt,
                max_tokens: 4000
            };

            const apiResponse = await retryWithBackoff(() =>
                callAnthropicApi(apiKey!, modelId!, systemPrompt, userPrompt, 4000)
            );

            responseDataForLog = apiResponse.responseData;
            if (!apiResponse.success || !apiResponse.content) {
                apiErrorMsg = apiResponse.error ?? 'Anthropic API returned no content.';
                throw new Error(apiErrorMsg);
            }
            result = apiResponse.content;
        } else if (provider === 'openai') {
            apiKey = plugin.settings.openaiApiKey;
            modelId = normalizeModelId('openai', plugin.settings.openaiModelId) || 'gpt-4o';

            if (!apiKey || !modelId) {
                apiErrorMsg = 'OpenAI API key or Model ID not configured in settings.';
                responseDataForLog = { error: { message: apiErrorMsg, type: 'plugin_config_error' } };
                throw new Error(apiErrorMsg);
            }

            requestBodyForLog = {
                model: modelId,
                messages: [{ role: 'user', content: systemPrompt ? `${systemPrompt}\n\n${userPrompt}` : userPrompt }],
                max_completion_tokens: 2000,
                response_format: {
                    type: 'json_schema' as const,
                    json_schema: {
                        name: 'scene_analysis',
                        schema: jsonSchema
                    }
                }
            };

            const apiResponse = await retryWithBackoff(() =>
                callOpenAiApi(
                    apiKey!,
                    modelId!,
                    systemPrompt,
                    userPrompt,
                    2000,
                    undefined,
                    { type: 'json_schema', json_schema: { name: 'scene_analysis', schema: jsonSchema } }
                )
            );

            responseDataForLog = apiResponse.responseData;
            if (!apiResponse.success || !apiResponse.content) {
                apiErrorMsg = apiResponse.error ?? 'OpenAI API returned no content.';
                throw new Error(apiErrorMsg);
            }
            result = apiResponse.content;
        } else if (provider === 'gemini') {
            apiKey = plugin.settings.geminiApiKey;
            modelId = normalizeModelId('gemini', plugin.settings.geminiModelId) || DEFAULT_GEMINI_MODEL_ID;

            if (!apiKey || !modelId) {
                apiErrorMsg = 'Gemini API key or Model ID not configured in settings.';
                responseDataForLog = { error: { message: apiErrorMsg, type: 'plugin_config_error' } };
                throw new Error(apiErrorMsg);
            }

            requestBodyForLog = {
                system_instruction: systemPrompt || undefined,
                userPrompt,
                temperature: 0.2,
                maxOutputTokens: 4000,
                response_schema: jsonSchema
            };

            const apiResponse = await retryWithBackoff(() =>
                callGeminiApi(apiKey!, modelId!, systemPrompt, userPrompt, 4000, 0.2, jsonSchema, true)
            );

            responseDataForLog = apiResponse.responseData;
            if (!apiResponse.success || !apiResponse.content) {
                apiErrorMsg = apiResponse.error ?? 'Gemini API returned no content.';
                throw new Error(apiErrorMsg);
            }
            result = apiResponse.content;
        } else if (provider === 'local') {
            const localBaseUrl = plugin.settings.localBaseUrl || 'http://localhost:11434/v1';
            modelId = plugin.settings.localModelId || 'llama3';
            apiKey = plugin.settings.localApiKey || ''; // Optional for local

            if (!localBaseUrl || !modelId) {
                apiErrorMsg = 'Local Base URL or Model ID not configured in settings.';
                responseDataForLog = { error: { message: apiErrorMsg, type: 'plugin_config_error' } };
                throw new Error(apiErrorMsg);
            }

            requestBodyForLog = {
                model: modelId,
                temperature: 0.1,
                messages: [{ role: 'user', content: systemPrompt ? `${systemPrompt}\n\n${userPrompt}` : userPrompt }],
                max_completion_tokens: 2000,
                response_format: {
                    type: 'json_schema' as const,
                    json_schema: {
                        name: 'scene_analysis',
                        schema: jsonSchema
                    }
                }
            };

            const apiResponse = await retryWithBackoff(() =>
                callOpenAiApi(
                    apiKey!,
                    modelId!,
                    systemPrompt,
                    userPrompt,
                    2000,
                    localBaseUrl,
                    { type: 'json_schema', json_schema: { name: 'scene_analysis', schema: jsonSchema } },
                    0.1
                )
            );

            responseDataForLog = apiResponse.responseData;
            if (!apiResponse.success || !apiResponse.content) {
                apiErrorMsg = apiResponse.error ?? 'Local API returned no content.';
                throw new Error(apiErrorMsg);
            }
            result = apiResponse.content;
        } else {
            throw new Error(`Unsupported AI provider: ${provider}`);
        }

        const parsedForLog = result ? parseGptResult(result, plugin) : null;

        await logApiInteractionToFile(
            plugin,
            vault,
            provider,
            modelId,
            requestBodyForLog,
            responseDataForLog,
            subplotName,
            commandContext,
            sceneName,
            tripletInfo,
            parsedForLog,
            {
                force: forceLocalReport,
                supplementalLocalInstructions,
                rawTextResult: result,
                systemPrompt
            }
        );

        return { result, modelIdUsed: modelId };
    } catch (error) {
        const detailedMessage = error instanceof Error ? error.message : String(error);
        if (apiErrorMsg) {
            new Notice(`${apiErrorMsg}\n\n${detailedMessage}`, 8000);
        } else {
            console.error(`[API][BeatsCommands][callAiProvider] Error during ${provider} API call:`, error);
            new Notice(`Error calling ${provider} API:\n${detailedMessage}`, 8000);
        }

        await logApiInteractionToFile(
            plugin,
            vault,
            provider,
            modelId || 'unknown',
            requestBodyForLog,
            responseDataForLog,
            subplotName,
            commandContext,
            sceneName,
            tripletInfo,
            null,
            {
                force: forceLocalReport,
                supplementalLocalInstructions,
                rawTextResult: result,
                systemPrompt
            }
        );

        throw error instanceof Error ? error : new Error(String(error));
    }
}
