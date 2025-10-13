/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */
import RadialTimelinePlugin from './main'; 
import { App, TFile, Vault, Notice, parseYaml, getFrontMatterInfo, stringifyYaml } from "obsidian";
import { sanitizeSourcePath, buildInitialSceneFilename } from './utils/sceneCreation';
import { callAnthropicApi, AnthropicApiResponse } from './api/anthropicApi';
import { callOpenAiApi, OpenAiApiResponse } from './api/openaiApi';
import { callGeminiApi, GeminiApiResponse } from './api/geminiApi';
import { buildBeatsPrompt } from './ai/prompts/beats';
import { BeatsProcessingModal, type ProcessingMode } from './view/BeatsProcessingModal';
import { stripObsidianComments } from './utils/text';

// --- Interfaces --- 
interface SceneData {
    file: TFile;
    frontmatter: Record<string, unknown>; // Use Record<string, unknown> for flexible objects
    sceneNumber: number | null;
    body: string;
}

// Define the structure for the return value of callAiProvider
interface AiProviderResponse {
    result: string | null;       // The text content from the AI
    modelIdUsed: string | null;  // The specific model ID used for the successful call
}

// <<< ADDED: Interface for the expected message structure >>>
interface ApiMessage {
    role: 'user' | 'system' | 'assistant';
    content: string;
}

// <<< ADDED: Interface for the expected request data structure (simplified) >>>
interface ApiRequestData {
    messages?: ApiMessage[];
    system?: string;
    // Add other potential fields if needed, e.g., model, max_tokens
}

// --- Helper Functions --- 

// Minimal typing for Obsidian's getFrontMatterInfo result
type FMInfo = {
    exists: boolean;
    frontmatter?: string;
    position?: { start?: { offset: number }, end?: { offset: number } };
};

function extractSceneNumber(filename: string): number | null {
    const match = filename.match(/^(\d+(\.\d+)?)/);
    return match ? parseFloat(match[1]) : null;
}

// Robust comparator for scene ordering, handling dotted numbers like 16.9 vs 16.10
function compareScenesByOrder(a: SceneData, b: SceneData): number {
    const parse = (name: string) => {
        const m = name.match(/^(\d+)(?:\.(\d+))?/);
        if (!m) return { major: Number.POSITIVE_INFINITY, minor: Number.POSITIVE_INFINITY };
        const major = parseInt(m[1], 10);
        const minor = typeof m[2] !== 'undefined' ? parseInt(m[2], 10) : -1; // -1 means whole scene before fractional
        return { major, minor };
    };
    const A = parse(a.file.name);
    const B = parse(b.file.name);
    if (A.major !== B.major) return A.major - B.major;
    return A.minor - B.minor;
}

// Extract subplot names from frontmatter (strict: Subplot or subplot)
function getSubplotNamesFromFM(fm: Record<string, unknown>): string[] {
    const value = (fm?.Subplot ?? fm?.subplot) as unknown;
    if (typeof value === 'string' && value.trim()) {
        return [value.trim()];
    }
    if (Array.isArray(value)) {
        return (value as unknown[]).map(v => String(v).trim()).filter(Boolean);
    }
    return [];
}

function hasWordsContent(fm: Record<string, unknown>): boolean {
    const w1 = fm?.words as unknown;
    const w2 = (fm as Record<string, unknown>)['Words'] as unknown;
    
    // Handle both number and string values (strings might have commas)
    const parseWords = (val: unknown): number | undefined => {
        if (typeof val === 'number') return val;
        if (typeof val === 'string') {
            const cleaned = val.replace(/,/g, ''); // Remove commas like '2,500'
            const parsed = parseFloat(cleaned);
            return isNaN(parsed) ? undefined : parsed;
        }
        return undefined;
    };
    
    const n1 = parseWords(w1);
    const n2 = parseWords(w2);
    const n = typeof n1 === 'number' ? n1 : (typeof n2 === 'number' ? n2 : undefined);
    return typeof n === 'number' && n > 0;
}

/**
 * Check if a scene has processable content based on Status field
 * Returns true if Status is "Complete" or "Working" (or contains these values)
 */
function hasProcessableContent(fm: Record<string, unknown> | undefined): boolean {
    if (!fm) return false;
    
    const status = fm.Status || fm.status;
    
    // Status can be a string or an array of strings
    if (typeof status === 'string') {
        const lower = status.toLowerCase();
        return lower === 'complete' || lower === 'working';
    }
    
    if (Array.isArray(status)) {
        return status.some(s => {
            if (typeof s === 'string') {
                const lower = s.toLowerCase();
                return lower === 'complete' || lower === 'working';
            }
            return false;
        });
    }
    
    return false;
}

async function getAllSceneData(plugin: RadialTimelinePlugin, vault: Vault): Promise<SceneData[]> {
    const sourcePath = plugin.settings.sourcePath.trim();


    const allFiles = vault.getMarkdownFiles();
    const filesInPath = allFiles.filter(file => {
        if (sourcePath === '') return true;
        return file.path.startsWith(sourcePath + '/') || file.path === sourcePath;
    });

    const sceneDataPromises = filesInPath.map(async (file): Promise<SceneData | null> => {
        const filePath = file.path;
        try {
            const content = await vault.read(file);
            const fmInfo = getFrontMatterInfo(content) as unknown as FMInfo;
            if (!fmInfo || !fmInfo.exists) {
                return null;
            }
            let frontmatter: Record<string, unknown> = {};
            try {
                const fmText = fmInfo.frontmatter ?? '';
                frontmatter = fmText ? (parseYaml(fmText) || {}) : {};
            } catch {
                return null; // Skip files with invalid YAML
            }

            const fileClass = frontmatter?.Class || frontmatter?.class;
            if (typeof fileClass !== 'string' || fileClass.toLowerCase() !== 'scene') {
                const foundClass = fileClass ? `'${fileClass}'` : 'Not found';

                return null; // Skip if not Class: Scene
            }



            const sceneNumber = extractSceneNumber(file.name);
            // Extract body after frontmatter block using offsets
            let body = content;
            try {
                const endOffset = fmInfo.position?.end?.offset as number | undefined;
                if (typeof endOffset === 'number' && endOffset >= 0 && endOffset <= content.length) {
                    body = content.slice(endOffset).trim();
                } else {
                    // Fallback: regex removal if offsets unavailable
                    body = content.replace(/^---[\s\S]*?\n---/, "").trim();
                }
            } catch {
                body = content.replace(/^---[\s\S]*?\n---/, "").trim();
            }

            // Strip Obsidian comment blocks (%%...%%) from the scene body
            body = stripObsidianComments(body);

            return { file, frontmatter, sceneNumber, body };

        } catch (e) {

            return null; // Skip file on read error
        }
    });

    const results = await Promise.all(sceneDataPromises);
    const validScenes = results.filter((item): item is SceneData => item !== null);



    return validScenes;
}

// Helper function to get the active AI context template prompt
function getActiveContextPrompt(plugin: RadialTimelinePlugin): string | undefined {
    const templates = plugin.settings.aiContextTemplates || [];
    const activeId = plugin.settings.activeAiContextTemplateId;
    const active = templates.find(t => t.id === activeId);
    return active?.prompt;
}

/**
 * Helper function to determine if a scene has already been processed for beats
 * A scene is considered processed if:
 * 1. It has a BeatsLastUpdated timestamp, OR
 * 2. It has any beats fields (1beats, 2beats, or 3beats)
 */
function hasBeenProcessedForBeats(frontmatter: Record<string, unknown> | undefined): boolean {
    if (!frontmatter) return false;
    
    // Check for BeatsLastUpdated timestamp
    const hasBeatsLastUpdated = !!frontmatter['BeatsLastUpdated'];
    if (hasBeatsLastUpdated) return true;
    
    // Check for any beats fields
    const has1beats = !!frontmatter['1beats'];
    const has2beats = !!frontmatter['2beats'];
    const has3beats = !!frontmatter['3beats'];
    const hasAnyBeats = has1beats || has2beats || has3beats;
    
    return hasAnyBeats;
}

// Helper function to calculate scene count for each processing mode
async function calculateSceneCount(
    plugin: RadialTimelinePlugin,
    vault: Vault,
    mode: ProcessingMode
): Promise<number> {
    const allScenes = await getAllSceneData(plugin, vault);
    allScenes.sort(compareScenesByOrder);
    
    // Filter scenes based on mode
    const processableScenes = allScenes.filter(scene => {
        // Smart and force-flagged modes: must have BeatsUpdate=Yes (no other validation needed)
        if (mode === 'smart' || mode === 'force-flagged') {
            const beatsUpdateFlag = scene.frontmatter?.beatsupdate ?? scene.frontmatter?.BeatsUpdate;
            return (typeof beatsUpdateFlag === 'string' && beatsUpdateFlag.toLowerCase() === 'yes');
        }
        
        // Force-all and unprocessed modes: must have Status=Complete or Working
        return hasProcessableContent(scene.frontmatter);
    });
    
    if (mode === 'force-all') {
        return processableScenes.length;
    }
    
    // Unprocessed mode: count scenes without beats or BeatsLastUpdated
    if (mode === 'unprocessed') {
        return processableScenes.filter(scene => {
            // Scene is unprocessed only if it has never been processed
            return !hasBeenProcessedForBeats(scene.frontmatter);
        }).length;
    }
    
    // For smart and force-flagged modes, count based on cache
    const flaggedScenes = processableScenes;
    
    if (mode === 'force-flagged') {
        return flaggedScenes.length;
    }
    
    // Smart mode: count only scenes not in cache
    let count = 0;
    for (let i = 0; i < processableScenes.length; i++) {
        const scene = processableScenes[i];
        const prev = i > 0 ? processableScenes[i - 1] : null;
        const next = i < processableScenes.length - 1 ? processableScenes[i + 1] : null;
        const tripletId = `${prev?.sceneNumber ?? 'Start'}-${scene.sceneNumber}-${next?.sceneNumber ?? 'End'}`;
        
        if (!plugin.settings.processedBeatContexts.includes(tripletId)) {
            count++;
        }
    }
    
    return count;
}

async function logApiInteractionToFile(
    plugin: RadialTimelinePlugin,
    vault: Vault,
    provider: 'openai' | 'anthropic' | 'gemini',
    modelId: string,
    requestData: unknown, // Keep as unknown initially
    responseData: unknown,
    subplotName: string | null,
    commandContext: string,
    sceneName?: string
): Promise<void> {
    if (!plugin.settings.logApiInteractions) {
        return;
    }

    const logFolder = "AI";
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // Get friendly model name for filename
    const friendlyModelForFilename = (() => {
        const mid = (modelId || '').toLowerCase();
        if (provider === 'anthropic') {
            if (mid.includes('sonnet-4-5') || mid.includes('sonnet-4.5')) return 'Claude Sonnet 4.5';
            if (mid.includes('opus-4-1') || mid.includes('opus-4.1')) return 'Claude Opus 4.1';
            if (mid.includes('sonnet-4')) return 'Claude Sonnet 4';
            if (mid.includes('opus-4')) return 'Claude Opus 4';
        } else if (provider === 'gemini') {
            if (mid.includes('2.5-pro') || mid.includes('2-5-pro')) return 'Gemini 2.5 Pro';
        } else if (provider === 'openai') {
            if (mid.includes('gpt-4.1') || mid.includes('gpt-4-1')) return 'GPT-4.1';
        }
        return modelId;
    })();
    
    // Format: "Scene Name — Model — Timestamp" or fallback to provider-log-timestamp
    let fileName: string;
    if (sceneName) {
        // Clean scene name for filename (remove invalid characters)
        const cleanSceneName = sceneName.replace(/[<>:"/\\|?*]/g, '').trim();
        fileName = `${cleanSceneName} — ${friendlyModelForFilename} — ${timestamp}.md`;
    } else {
        fileName = `${provider}-log-${timestamp}.md`;
    }
    
    const filePath = `${logFolder}/${fileName}`;

    // Type guard to check if requestData is an object
    const isObject = (data: unknown): data is Record<string, unknown> => {
        return typeof data === 'object' && data !== null;
    };

    // Attempt to cast requestData safely
    const safeRequestData = isObject(requestData) ? requestData as ApiRequestData : null;

    const requestJson = JSON.stringify(requestData, null, 2);
    const responseJson = JSON.stringify(responseData, null, 2);

    // Replace cost estimation with simple usage tokens (less error-prone)
    let usageString = '**Usage:** N/A';
    try {
        if (responseData && typeof responseData === 'object') {
            const rd = responseData as unknown;
            if (provider === 'openai' && rd && typeof rd === 'object' && 'usage' in (rd as Record<string, unknown>)) {
                const u = (rd as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage;
                if (u && (typeof u.prompt_tokens === 'number' || typeof u.completion_tokens === 'number')) {
                    usageString = `**Usage (OpenAI):** prompt=${u.prompt_tokens ?? 'n/a'}, output=${u.completion_tokens ?? 'n/a'}`;
                }
            } else if (provider === 'anthropic' && rd && typeof rd === 'object' && 'usage' in (rd as Record<string, unknown>)) {
                const u = (rd as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
                if (u && (typeof u.input_tokens === 'number' || typeof u.output_tokens === 'number')) {
                    usageString = `**Usage (Anthropic):** input=${u.input_tokens ?? 'n/a'}, output=${u.output_tokens ?? 'n/a'}`;
                }
            } else if (provider === 'gemini' && rd && typeof rd === 'object' && 'usageMetadata' in (rd as Record<string, unknown>)) {
                const u = (rd as { usageMetadata?: { totalTokenCount?: number; promptTokenCount?: number; candidatesTokenCount?: number } }).usageMetadata;
                usageString = `**Usage (Gemini):** total=${u?.totalTokenCount ?? 'n/a'}, prompt=${u?.promptTokenCount ?? 'n/a'}, output=${u?.candidatesTokenCount ?? 'n/a'}`;
            }
        }
    } catch {}

    let outcomeSection = "## Outcome\n\n";
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
            outcomeSection += "\n";
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
            } else if (provider === 'anthropic') {
                 const contentArr = responseAsRecord.content as unknown;
                 if (Array.isArray(contentArr) && contentArr[0] && typeof contentArr[0] === 'object') {
                     const text = (contentArr[0] as Record<string, unknown>).text as string | undefined;
                     contentForCheck = text ?? (responseData as unknown as { content?: string }).content;
                 }
                 success = !!contentForCheck;
            } else if (provider === 'gemini') {
                  type GeminiPart = { text?: string };
                  const candidates = responseAsRecord.candidates as unknown;
                  let parts: unknown = undefined;
                  if (Array.isArray(candidates) && candidates[0] && typeof candidates[0] === 'object') {
                      const contentObj = (candidates[0] as Record<string, unknown>).content as Record<string, unknown> | undefined;
                      parts = contentObj?.parts as unknown;
                  }
                  if (Array.isArray(parts)) {
                      const arr = parts as GeminiPart[];
                      contentForCheck = arr.map(p => p?.text ?? '').join('').trim();
                      success = !!contentForCheck;
                  }
            }

            if (success) {
                outcomeSection += `**Status:** Success (Content Received)\n`;
                outcomeSection += "\n";
            } else {
                outcomeSection += `**Status:** Response Structure Error\n`;
                outcomeSection += `**Details:** Could not find expected content structure for ${provider} in the response.\n`;
                outcomeSection += `**Actual Response Structure (relevant part):**\n\`\`\`json\n`;
                if (provider === 'openai') {
                     outcomeSection += JSON.stringify((responseAsRecord.choices as unknown), null, 2);
                } else if (provider === 'anthropic') {
                     outcomeSection += JSON.stringify((responseAsRecord.content as unknown), null, 2);
                } else if (provider === 'gemini') {
                      outcomeSection += JSON.stringify((responseAsRecord.candidates as unknown), null, 2);
                } else {
                    outcomeSection += JSON.stringify(responseData, null, 2);
                }
                outcomeSection += `\n\`\`\`\n`;
            }
        }
    } else {
        outcomeSection += `**Status:** Unexpected Response Format\n`;
        outcomeSection += `**Response Received:** ${JSON.stringify(responseData)}\n`;
    }
    
    const contextHeader = subplotName ? `**Subplot Context:** ${subplotName}` : `**Context:** Manuscript Order`;

    // Friendly model name for logs
    const friendlyModel = (() => {
        const mid = (modelId || '').toLowerCase();
        if (provider === 'anthropic') {
            // Check more specific versions first
            if (mid.includes('sonnet-4-5') || mid.includes('sonnet-4.5')) return 'Claude Sonnet 4.5';
            if (mid.includes('opus-4-1') || mid.includes('opus-4.1')) return 'Claude Opus 4.1';
            if (mid.includes('sonnet-4')) return 'Claude Sonnet 4';
            if (mid.includes('opus-4')) return 'Claude Opus 4';
        } else if (provider === 'gemini') {
            if (mid.includes('2.5-pro') || mid.includes('2-5-pro')) return 'Gemini 2.5 Pro';
        } else if (provider === 'openai') {
            if (mid.includes('gpt-4.1') || mid.includes('gpt-4-1')) return 'GPT-4.1';
        }
        return modelId;
    })();

    // Attempt to extract scene numbers from the user prompt for summary
    const extractScenesSummary = (text: string | undefined): { prev?: string; current?: string; next?: string } => {
        const result: { prev?: string; current?: string; next?: string } = {};
        if (!text) return result;
        const re = /^\s*Scene\s+([^:]+)\s*:/gmi;
        const matches: string[] = [];
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) !== null) {
            matches.push(m[1].trim());
        }
        if (matches.length >= 1) result.prev = matches[0];
        if (matches.length >= 2) result.current = matches[1];
        if (matches.length >= 3) result.next = matches[2];
        return result;
    };
    
    // Extract scene info early for use in title
    const scenesSummaryForTitle = (() => {
        if (provider === 'openai' && safeRequestData?.messages && Array.isArray(safeRequestData.messages)) {
            const userMessage = safeRequestData.messages.find((m: ApiMessage) => m.role === 'user');
            return extractScenesSummary(userMessage?.content);
        } else if (provider === 'anthropic' && safeRequestData) {
            const anthropicMsg = (safeRequestData as any).messages?.[0]?.content;
            if (typeof anthropicMsg === 'string') return extractScenesSummary(anthropicMsg);
        } else if (provider === 'gemini') {
            type GeminiPart = { text?: string };
            const rd = requestData as unknown;
            if (rd && typeof rd === 'object' && (rd as Record<string, unknown>).contents) {
                const contents = (rd as Record<string, unknown>).contents as unknown;
                if (Array.isArray(contents) && contents[0] && typeof contents[0] === 'object') {
                    const first = contents[0] as Record<string, unknown>;
                    const parts = first.parts as unknown;
                    if (Array.isArray(parts)) {
                        const arr = parts as GeminiPart[];
                        const fullPrompt = arr.map(p => p?.text ?? '').join('').trim();
                        return extractScenesSummary(fullPrompt);
                    }
                }
            }
        }
        return { prev: undefined, current: undefined, next: undefined };
    })();

    const providerTitle = provider.charAt(0).toUpperCase() + provider.slice(1);
    
    // Format timestamp as readable date-time (e.g., "2025-10-12 14:30:45")
    const readableTimestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    
    // New title format: "Scene Processed — Model — Timestamp"
    const sceneTitle = scenesSummaryForTitle.current ? `Scene ${scenesSummaryForTitle.current}` : 'Scene Processed';
    let fileContent = `# ${sceneTitle} — ${friendlyModel} — ${readableTimestamp}\n\n`;
    fileContent += `**Command:** ${commandContext}\n`;
    fileContent += `**Provider:** ${provider}\n`;
    fileContent += `**Model:** ${friendlyModel}\n`;
    fileContent += `**Model ID:** ${modelId}\n`;
    fileContent += `**Timestamp:** ${new Date().toISOString()}\n`;
    
    // Add active template info for debugging
    const activeTemplate = plugin.settings.aiContextTemplates?.find(t => t.id === plugin.settings.activeAiContextTemplateId);
    if (activeTemplate) {
        fileContent += `**Active Template:** ${activeTemplate.name}\n`;
    } else {
        fileContent += `**Active Template:** None (using default)\n`;
    }
    fileContent += `${contextHeader}\n`;
    
    // We will fill scenes summary and template next

    // <<< FIXED: Use safeRequestData and type guard for messages array >>>
    let userPromptContent = 'User prompt not logged correctly';
    let fullUserPrompt: string | undefined;
    if (provider === 'openai' && safeRequestData?.messages && Array.isArray(safeRequestData.messages)) {
        const userMessage = safeRequestData.messages.find((m: ApiMessage) => m.role === 'user');
        if (userMessage) fullUserPrompt = userMessage.content;
    } else if (provider === 'anthropic' && safeRequestData) {
        // For anthropic we logged system separately; user is in the single messages array we sent
        const anthropicMsg = (safeRequestData as any).messages?.[0]?.content;
        if (typeof anthropicMsg === 'string') fullUserPrompt = anthropicMsg;
    } else if (provider === 'gemini') {
        type GeminiPart = { text?: string };
        const rd = requestData as unknown;
        if (rd && typeof rd === 'object' && (rd as Record<string, unknown>).contents) {
            const contents = (rd as Record<string, unknown>).contents as unknown;
            if (Array.isArray(contents) && contents[0] && typeof contents[0] === 'object') {
                const first = contents[0] as Record<string, unknown>;
                const parts = first.parts as unknown;
                if (Array.isArray(parts)) {
                    const arr = parts as GeminiPart[];
                    fullUserPrompt = arr.map(p => p?.text ?? '').join('').trim();
                }
            }
        }
    }
    // Build scenes summary and redacted prompt (instructions only)
    const scenesSummary = extractScenesSummary(fullUserPrompt);
    const scenesLine = `**Scenes:** prev=${scenesSummary.prev ?? 'N/A'}, current=${scenesSummary.current ?? 'N/A'}, next=${scenesSummary.next ?? 'N/A'}`;
    fileContent += `${scenesLine}\n`;

    const redactPrompt = (text: string | undefined): string => {
        if (!text) return 'Unavailable';
        // Keep only the instructions/template lines BEFORE the first scene header
        const lines = text.split(/\r?\n/);
        const headerRe = /^\s*Scene\s+[^:]+:\s*$/i;
        const idx = lines.findIndex(l => headerRe.test(l));
        const kept = idx >= 0 ? lines.slice(0, idx) : lines;
        return kept.join('\n');
    };
    userPromptContent = redactPrompt(fullUserPrompt);
    fileContent += `## Prompt Template\n\n\`\`\`\n${userPromptContent}\n\`\`\`\n\n`;

    // <<< FIXED: Use safeRequestData and check different properties based on provider >>>
    let systemPromptContent: string | undefined | null = null;
    if (safeRequestData) {
        if (provider === 'openai' && safeRequestData.messages && Array.isArray(safeRequestData.messages)) {
            systemPromptContent = safeRequestData.messages.find((m: ApiMessage) => m.role === 'system')?.content;
        } else if (provider === 'anthropic') {
            systemPromptContent = safeRequestData.system;
        } else if (provider === 'gemini') {
            type GeminiPart = { text?: string };
            const rd = requestData as unknown;
            if (rd && typeof rd === 'object') {
                const sys = (rd as Record<string, unknown>).systemInstruction as unknown;
                if (sys && typeof sys === 'object') {
                    const parts = (sys as Record<string, unknown>).parts as unknown;
                    if (Array.isArray(parts)) {
                        const arr = parts as GeminiPart[];
                        systemPromptContent = arr.map(p => p?.text ?? '').join('').trim();
                    }
                }
            }
        }
    }

    if (systemPromptContent) {
        fileContent += `## System Prompt Used\n\n\`\`\`\n${systemPromptContent}\n\`\`\`\n\n`;
    }

    // Full request with instructions + scene text
    fileContent += `## Request Sent\n\n`;
    fileContent += `\`\`\`json\n${requestJson}\n\`\`\`\n\n`;

    // Response (raw JSON)
    fileContent += `## Response Received (Full JSON)\n\n`;
    fileContent += `\`\`\`json\n${responseJson}\n\`\`\``;

    // Usage and outcome details
    fileContent += `\n${usageString}\n\n`;
    fileContent += `${outcomeSection}`;

    try {
        try {
            await vault.createFolder(logFolder);
    
        } catch (e: unknown) {
            if (e instanceof Error && e.message && !e.message.includes('already exists')) {
                throw e;
            } else if (!(e instanceof Error)) {
                // Non-critical; log only when debug is enabled
                plugin.log(`[BeatsCommands] Non-Error while ensuring folder exists:`, e);
            }
        }

        await vault.create(filePath, fileContent.trim());


    } catch (error) {
        console.error(`[BeatsCommands] Error logging API interaction to file ${filePath}:`, error);
        new Notice(`Failed to write AI log to ${filePath}. Check console.`);
    }
}

/**
 * Helper: retry with exponential backoff for rate limit errors
 * Anthropic rate limits reset every minute, so we use longer delays
 */
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
            
            // Only retry on rate limit errors, and only if we have retries left
            if (isRateLimitError && attempt < maxRetries) {
                // Exponential backoff: 5s, 10s, 20s (allows rate limit window to reset)
                const delayMs = baseDelayMs * Math.pow(2, attempt);
                new Notice(`Rate limit reached. Waiting ${delayMs / 1000}s before retry (${attempt + 1}/${maxRetries})...`, 3000);
                await new Promise(resolve => window.setTimeout(resolve, delayMs));
                continue;
            }
            
            // If not rate limit, or out of retries, throw
            throw error;
        }
    }
    throw new Error('Retry logic exhausted without success');
}

async function callAiProvider(
    plugin: RadialTimelinePlugin,
    vault: Vault,
    userPrompt: string,
    subplotName: string | null,
    commandContext: string,
    sceneName?: string
): Promise<AiProviderResponse> {
    const provider = plugin.settings.defaultAiProvider || 'openai';
    let apiKey: string | undefined;
    let modelId: string | undefined;
    let requestBodyForLog: object | null = null;
    let responseDataForLog: unknown;
    let result: string | null = null;
    let apiErrorMsg: string | undefined;

    try {
        const normalizeModelId = (prov: string, id: string | undefined): string | undefined => {
            if (!id) return id;
            switch (prov) {
                case 'anthropic':
                    // Canonical Anthropic IDs (2025)
                    if (id === 'claude-opus-4-1' || id === 'claude-4.1-opus' || id === 'claude-opus-4-1@20250805') return 'claude-opus-4-1-20250805';
                    if (id === 'claude-sonnet-4-1' || id === 'claude-4-sonnet' || id === 'claude-sonnet-4-1@20250805') return 'claude-sonnet-4-20250514';
                    // Legacy fallbacks map to latest
                    if (id === 'claude-opus-4-0' || id === 'claude-3-opus-20240229') return 'claude-opus-4-1-20250805';
                    if (id === 'claude-sonnet-4-0' || id === 'claude-3-7-sonnet-20250219') return 'claude-sonnet-4-20250514';
                    return id;
                case 'openai':
                    // Use GPT‑4.1 as canonical; map older/placeholder ids
                    if (id === 'gpt-5' || id === 'o3' || id === 'gpt-4o') return 'gpt-4.1';
                    if (id === 'gpt-4.1') return 'gpt-4.1';
                    return id;
                case 'gemini':
                    // Canonical Gemini: 2.5 Pro
                    if (id === 'gemini-2.5-pro') return 'gemini-2.5-pro';
                    if (id === 'gemini-ultra' || id === 'gemini-creative' || id === 'gemini-1.0-pro' || id === 'gemini-1.5-pro') return 'gemini-2.5-pro';
                    return id;
                default:
                    return id;
            }
        };

        if (provider === 'anthropic') {
            apiKey = plugin.settings.anthropicApiKey;
            modelId = normalizeModelId('anthropic', plugin.settings.anthropicModelId) || 'claude-sonnet-4-20250514';

            if (!apiKey || !modelId) {
                apiErrorMsg = 'Anthropic API key or Model ID not configured in settings.';
                responseDataForLog = { error: { message: apiErrorMsg, type: 'plugin_config_error' } };
                throw new Error(apiErrorMsg);
            }

            requestBodyForLog = {
                model: modelId,
                messages: [{ role: 'user', content: userPrompt }],
                max_tokens: 4000
            };
    

            const apiResponse: AnthropicApiResponse = await retryWithBackoff(() => 
                callAnthropicApi(apiKey!, modelId!, null, userPrompt, 4000)
            );

            responseDataForLog = apiResponse.responseData;

            if (!apiResponse.success) {
                apiErrorMsg = apiResponse.error;
                throw new Error(apiErrorMsg || `Anthropic API call failed with unknown error.`);
            }
            result = apiResponse.content;

        } else if (provider === 'gemini') {
            apiKey = plugin.settings.geminiApiKey;
            modelId = normalizeModelId('gemini', plugin.settings.geminiModelId) || 'gemini-1.5-pro';

            if (!apiKey || !modelId) {
                apiErrorMsg = 'Gemini API key or Model ID not configured.';
                responseDataForLog = { error: { message: apiErrorMsg, type: 'plugin_config_error' } };
                throw new Error(apiErrorMsg);
            }

            requestBodyForLog = {
                model: modelId,
                contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
                generationConfig: { temperature: 0.7, maxOutputTokens: 4000 }
            };

            const apiResponse: GeminiApiResponse = await retryWithBackoff(() =>
                callGeminiApi(apiKey!, modelId!, null, userPrompt, 4000, 0.7)
            );

            responseDataForLog = apiResponse.responseData;

            if (!apiResponse.success) {
                apiErrorMsg = apiResponse.error;
                throw new Error(apiErrorMsg || `Gemini API call failed.`);
            }
            result = apiResponse.content;

        } else {
            apiKey = plugin.settings.openaiApiKey;
            modelId = normalizeModelId('openai', plugin.settings.openaiModelId) || "gpt-4o";

            if (!apiKey || !modelId) {
                apiErrorMsg = 'OpenAI API key or Model ID not configured.';
                 responseDataForLog = { error: { message: apiErrorMsg, type: 'plugin_config_error' } };
                 throw new Error(apiErrorMsg);
            }

            requestBodyForLog = {
                model: modelId,
                messages: [
                    { role: "user", content: userPrompt }
                ],
                temperature: 0.7,
                max_tokens: 4000
            };
    

            const apiResponse: OpenAiApiResponse = await retryWithBackoff(() =>
                callOpenAiApi(apiKey!, modelId!, null, userPrompt, 4000, 0.7)
            );

            responseDataForLog = apiResponse.responseData;

            if (!apiResponse.success) {
                apiErrorMsg = apiResponse.error;
                throw new Error(apiErrorMsg || `OpenAI API call failed.`);
            }
            result = apiResponse.content;
        }

    
        await logApiInteractionToFile(plugin, vault, provider, modelId || 'unknown', requestBodyForLog, responseDataForLog, subplotName, commandContext, sceneName);
        return { result: result, modelIdUsed: modelId || 'unknown' };

    } catch (error: unknown) {
        const errorMessage = apiErrorMsg || (error instanceof Error ? error.message : String(error));
        console.error(`[API][BeatsCommands][callAiProvider] Error during ${provider} API call:`, errorMessage, error);

         const currentProvider = provider || plugin.settings.defaultAiProvider || 'unknown';
         if (!modelId) {
            if (currentProvider === 'anthropic') modelId = plugin.settings.anthropicModelId || 'claude-sonnet-4-20250514';
            else if (currentProvider === 'openai') modelId = 'gpt-4o';
            else if (currentProvider === 'gemini') modelId = plugin.settings.geminiModelId || 'gemini-1.5-pro';
            else modelId = 'unknown';
         }

        if (!requestBodyForLog) requestBodyForLog = { note: "Request body not constructed due to early error." };
        if (!responseDataForLog) {
             responseDataForLog = { error: { message: errorMessage, type: (errorMessage.includes('configured')) ? 'plugin_config_error' : 'plugin_execution_error' } };
        }

        await logApiInteractionToFile(plugin, vault, currentProvider, modelId || 'unknown', requestBodyForLog, responseDataForLog, subplotName, commandContext, sceneName);

        new Notice(`Error: ${errorMessage}`);

      return { result: null, modelIdUsed: null };
    }
}

function parseGptResult(gptResult: string, plugin: RadialTimelinePlugin): { '1beats': string, '2beats': string, '3beats': string } | null {

    try {
        const section1Pattern = /^1beats:\s*([\s\S]*?)(?=^\s*(?:2beats:|3beats:|$))/m;
        const section2Pattern = /^2beats:\s*([\s\S]*?)(?=^\s*(?:3beats:|$))/m;
        const section3Pattern = /^3beats:\s*([\s\S]*)$/m;
        
        const section1Match = gptResult.match(section1Pattern);
        const section2Match = gptResult.match(section2Pattern);
        const section3Match = gptResult.match(section3Pattern);
        
        if (!section1Match || !section2Match || !section3Match) {
            console.error("[parseGptResult] Failed to extract sections from content:", gptResult);
            if (!section1Match) console.error("[parseGptResult] Couldn't find section starting with '1beats:'");
            if (!section2Match) console.error("[parseGptResult] Couldn't find section starting with '2beats:' after 1beats");
            if (!section3Match) console.error("[parseGptResult] Couldn't find section starting with '3beats:' after 2beats");
            new Notice('Failed to parse expected 1beats/2beats/3beats structure.');
            return null;
        }
        
        const processSection = (content: string | undefined): string => {
            if (!content) return '';
            // Convert any literal "\n" sequences to real newlines and remove trailing ones
            const normalized = content.replace(/\\n/g, '\n').replace(/(\\n)+\s*$/, '');
            const trimmedContent = normalized.trim();

            if (!trimmedContent) return '';
            return trimmedContent
                .split('\n')
                .map(l => l.trim())
                .filter(l => l.startsWith('-'))
                .map(l => l.replace(/(\w+):/g, '$1 -'))
                .map(l => ` ${l}`)
                .join('\n');
        };
        
        const beats = {
            '1beats': processSection(section1Match[1]),
            '2beats': processSection(section2Match[1]),
            '3beats': processSection(section3Match[1])
        };
        

        
        if (!beats['1beats'].trim() && !beats['2beats'].trim() && !beats['3beats'].trim()) {
             console.error("[parseGptResult] Parsed beats object is effectively empty after trimming check.");
             new Notice('GPT response parsed but contained no usable beat content.');
             return null;
        }
        
        return beats;
    } catch (error) {
        console.error("[parseGptResult] Error parsing GPT response:", error);
        return null;
    }
}

async function updateSceneFile(
    vault: Vault, 
    scene: SceneData, 
    parsedBeats: { '1beats': string, '2beats': string, '3beats': string }, 
    plugin: RadialTimelinePlugin,
    modelIdUsed: string | null
): Promise<boolean> {

    try {
        // Helper to convert a multi-line "- item" string into array of strings
        const toArray = (block: string): string[] => {
            return block
                .split('\n')
                .map(s => s.replace(/^\s*-\s*/, '').trim())
                .filter(Boolean);
        };

        // Atomically update frontmatter
        await plugin.app.fileManager.processFrontMatter(scene.file, (fm) => {
            // Use a typed record view for safe index operations
            const fmObj = fm as Record<string, unknown>;
            delete fmObj['1beats'];
            delete fmObj['2beats'];
            delete fmObj['3beats'];

            // Always record last update timestamp/model in BeatsLastUpdated.
            const timestamp = new Date().toISOString();
            const updatedValue = `${timestamp}${modelIdUsed ? ` by ${modelIdUsed}` : ' by Unknown Model'}`;
            fmObj['BeatsLastUpdated'] = updatedValue;

            // After a successful update, always set the processing flag to No
            // If lowercase beatsupdate exists, update it; otherwise use BeatsUpdate
            if (Object.prototype.hasOwnProperty.call(fmObj, 'beatsupdate')) {
                fmObj['beatsupdate'] = 'no';
            } else {
                // Always set BeatsUpdate=No (canonical form) after processing
                fmObj['BeatsUpdate'] = 'No';
            }

            const b1 = parsedBeats['1beats']?.trim();
            const b2 = parsedBeats['2beats']?.trim();
            const b3 = parsedBeats['3beats']?.trim();
            if (b1) fmObj['1beats'] = toArray(b1);
            if (b2) fmObj['2beats'] = toArray(b2);
            if (b3) fmObj['3beats'] = toArray(b3);
        });
        return true;
    } catch (error) {
        console.error(`[updateSceneFile] Error updating file:`, error);
        new Notice(`Error saving updates to ${scene.file.basename}`);
        return false;
    }
}

export async function processByManuscriptOrder(
    plugin: RadialTimelinePlugin,
    vault: Vault
): Promise<void> {
    // Create modal with scene count calculator
    const modal = new BeatsProcessingModal(
        plugin.app,
        plugin,
        (mode: ProcessingMode) => calculateSceneCount(plugin, vault, mode),
        async (mode: ProcessingMode) => {
            // This is the actual processing logic
            await processWithModal(plugin, vault, mode, modal);
        }
    );
    
    modal.open();
}

// Internal processing function that works with the modal
async function processWithModal(
    plugin: RadialTimelinePlugin,
    vault: Vault,
    mode: ProcessingMode,
    modal: BeatsProcessingModal
): Promise<void> {
    const allScenes = await getAllSceneData(plugin, vault);
    allScenes.sort(compareScenesByOrder);

    if (allScenes.length < 1) {
        throw new Error("No valid scenes found in the specified source path.");
    }

    // Filter scenes based on mode
    const processableScenes = allScenes.filter(scene => {
        // Smart and force-flagged modes: must have BeatsUpdate=Yes (no other validation)
        if (mode === 'smart' || mode === 'force-flagged') {
            const beatsUpdateFlag = scene.frontmatter?.beatsupdate ?? scene.frontmatter?.BeatsUpdate;
            return (typeof beatsUpdateFlag === 'string' && beatsUpdateFlag.toLowerCase() === 'yes');
        }
        
        // Force-all and unprocessed modes: must have Status=Complete or Working
        return hasProcessableContent(scene.frontmatter);
    });

    // Build triplets
    const triplets: { prev: SceneData | null, current: SceneData, next: SceneData | null }[] = [];
    for (let i = 0; i < processableScenes.length; i++) {
        triplets.push({
            prev: i > 0 ? processableScenes[i - 1] : null,
            current: processableScenes[i],
            next: i < processableScenes.length - 1 ? processableScenes[i + 1] : null
        });
    }

    let processedCount = 0;
    let totalToProcess = 0;
    
    // Calculate total based on mode - MUST match the processing logic below
    for (const triplet of triplets) {
        const beatsUpdateFlag = triplet.current.frontmatter?.beatsupdate ?? triplet.current.frontmatter?.BeatsUpdate;
        const isFlagged = (typeof beatsUpdateFlag === 'string' && beatsUpdateFlag.toLowerCase() === 'yes');
        
        if (mode === 'force-all') {
            totalToProcess++;
        } else if (mode === 'force-flagged' && isFlagged) {
            totalToProcess++;
        } else if (mode === 'unprocessed' && !hasBeenProcessedForBeats(triplet.current.frontmatter)) {
            totalToProcess++;
        } else if (mode === 'smart' && isFlagged) {
            const prev = triplet.prev;
            const next = triplet.next;
            const tripletId = `${prev?.sceneNumber ?? 'Start'}-${triplet.current.sceneNumber}-${next?.sceneNumber ?? 'End'}`;
            if (!plugin.settings.processedBeatContexts.includes(tripletId)) {
                totalToProcess++;
            }
        }
    }

    // Process triplets
    for (const triplet of triplets) {
        // Check for abort signal
        if (modal.isAborted()) {
            await plugin.saveSettings();
            throw new Error('Processing aborted by user');
        }

        const currentScenePath = triplet.current.file.path;
        const tripletIdentifier = `${triplet.prev?.sceneNumber ?? 'Start'}-${triplet.current.sceneNumber}-${triplet.next?.sceneNumber ?? 'End'}`;
        const beatsUpdateFlag = triplet.current.frontmatter?.beatsupdate ?? triplet.current.frontmatter?.BeatsUpdate;
        const isFlagged = (typeof beatsUpdateFlag === 'string' && beatsUpdateFlag.toLowerCase() === 'yes');
        // Determine if we should process this scene based on mode
        let shouldProcess = false;
        if (mode === 'force-all') {
            shouldProcess = true;
        } else if (mode === 'force-flagged') {
            shouldProcess = isFlagged;
        } else if (mode === 'unprocessed') {
            // Skip scenes that have been processed (have BeatsLastUpdated or any beats)
            shouldProcess = !hasBeenProcessedForBeats(triplet.current.frontmatter);
        } else { // smart mode
            shouldProcess = isFlagged && !plugin.settings.processedBeatContexts.includes(tripletIdentifier);
        }

        if (!shouldProcess) {
            continue;
        }

        // Update progress - use basename directly (already includes scene number)
        const sceneName = triplet.current.file.basename;
        modal.updateProgress(processedCount + 1, totalToProcess, sceneName);
        
        // For log filename, use the same basename
        const sceneNameForLog = sceneName;

        try {
            const prevBody = triplet.prev ? triplet.prev.body : null;
            const currentBody = triplet.current.body;
            const nextBody = triplet.next ? triplet.next.body : null;
            const prevNum = triplet.prev ? String(triplet.prev.sceneNumber ?? 'N/A') : 'N/A';
            const currentNum = String(triplet.current.sceneNumber ?? 'N/A');
            const nextNum = triplet.next ? String(triplet.next.sceneNumber ?? 'N/A') : 'N/A';

            const contextPrompt = getActiveContextPrompt(plugin);
            const userPrompt = buildBeatsPrompt(prevBody, currentBody, nextBody, prevNum, currentNum, nextNum, contextPrompt);

            const aiResult = await callAiProvider(plugin, vault, userPrompt, null, 'processByManuscriptOrder', sceneNameForLog);

            if (aiResult.result) {
                const parsedBeats = parseGptResult(aiResult.result, plugin);
                if (parsedBeats) {
                    const updated = await updateSceneFile(vault, triplet.current, parsedBeats, plugin, aiResult.modelIdUsed);
                    if (updated) {
                        plugin.settings.processedBeatContexts.push(tripletIdentifier);
                        await plugin.saveSettings();
                    } else {
                        modal.addError(`Failed to update file: ${currentScenePath}`);
                    }
                } else {
                    modal.addError(`Failed to parse AI result for: ${sceneName}`);
                }
            } else {
                modal.addError(`No result from AI for: ${sceneName}`);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            // Check for rate limit or overload errors
            const isRateLimitError = errorMessage.toLowerCase().includes('rate limit') || 
                                    errorMessage.toLowerCase().includes('overloaded') ||
                                    errorMessage.toLowerCase().includes('too many requests');
            
            if (isRateLimitError) {
                modal.addError(`API RATE LIMIT EXCEEDED - Processing stopped`);
                modal.addError(`Details: ${errorMessage}`);
                modal.addError(`System retried 3 times with delays (5s, 10s, 20s) but rate limit persists. Anthropic limits: 50 requests/min for Sonnet 4.x. The plugin now waits 1.5s between scenes (40 req/min). Use Resume to continue after the rate limit window resets (~1 minute).`);
                modal.abort(); // Trigger abort flag
                await plugin.saveSettings();
                throw new Error(`Processing aborted due to rate limit: ${errorMessage}`);
            }
            
            modal.addError(`Error processing ${sceneName}: ${errorMessage}`);
        }

        processedCount++;
        
        // Delay to stay under rate limits
        // Anthropic Sonnet 4.x: 50 requests/minute = 1.2s minimum
        // Using 1.5s (40 req/min) to stay safely under the limit
        await new Promise(resolve => window.setTimeout(resolve, 1500));
    }

    await plugin.saveSettings();
    plugin.refreshTimelineIfNeeded(null);
    
    // Modal will show summary, no need for notice here
}

export async function processBySubplotOrder(
    plugin: RadialTimelinePlugin,
    vault: Vault
): Promise<void> {
     
     const notice = new Notice("Processing Subplot: Getting scene data...", 0);

    try {
    const allScenes = await getAllSceneData(plugin, vault);
         if (allScenes.length < 1) {
             new Notice("No valid scenes found in the specified source path.");
              notice.hide();
        return;
    }

        const scenesBySubplot: Record<string, SceneData[]> = {};
    allScenes.forEach(scene => {
            const subplotList = getSubplotNamesFromFM(scene.frontmatter);
            subplotList.forEach(subplotKey => {
                 if (subplotKey) {
                     if (!scenesBySubplot[subplotKey]) {
                         scenesBySubplot[subplotKey] = [];
            }
                     if (!scenesBySubplot[subplotKey].some(s => s.file.path === scene.file.path)) {
                           scenesBySubplot[subplotKey].push(scene);
                     }
                 }
        });
    });

        const subplotNames = Object.keys(scenesBySubplot);
         if (subplotNames.length === 0) {
             new Notice("No scenes with subplots found.");
              notice.hide();
             return;
         }

        let totalProcessedCount = 0;
         let totalTripletsAcrossSubplots = 0;

        // Count only valid scenes with Words > 0 for the total
        subplotNames.forEach(subplotName => {
            const scenes = scenesBySubplot[subplotName];
            scenes.sort(compareScenesByOrder);
            
            // Count only scenes with words > 0 and BeatsUpdate: Yes
            const validScenes = scenes.filter(scene => {
                const words = scene.frontmatter?.words || scene.frontmatter?.Words;
                const beatsUpdate = scene.frontmatter?.beatsupdate || scene.frontmatter?.BeatsUpdate;

                if ((typeof beatsUpdate === 'string' && beatsUpdate.toLowerCase() === 'yes') &&
                    (!(typeof words === 'number') || words <= 0)) {
                    const msg = `Scene ${scene.sceneNumber ?? scene.file.basename} (subplot ${subplotName}) has BeatsUpdate: Yes but 0 words. Skipping.`;
                    // Surface to user via Notice; suppress console noise
                    new Notice(msg, 6000);
                }

                return (typeof words === 'number' && words > 0) && 
                       (typeof beatsUpdate === 'string' && beatsUpdate.toLowerCase() === 'yes');
            });
            
            totalTripletsAcrossSubplots += validScenes.length;
        });

        notice.setMessage(`Analyzing ${totalTripletsAcrossSubplots} scenes for subplot order...`);

        for (const subplotName of subplotNames) {
             const scenes = scenesBySubplot[subplotName];
            scenes.sort(compareScenesByOrder);



        // Build contiguous triplets within this subplot by number (ignore Words),
        // but only process currents that have Words>0 and BeatsUpdate: Yes
        const orderedScenes = scenes.slice().sort(compareScenesByOrder);
        const triplets: { prev: SceneData | null, current: SceneData, next: SceneData | null }[] = [];
        for (const currentScene of orderedScenes) {
            const words = currentScene.frontmatter?.words || currentScene.frontmatter?.Words;
            const beatsUpdate = currentScene.frontmatter?.beatsupdate || currentScene.frontmatter?.BeatsUpdate;
            const isProcessable = (typeof words === 'number' && words > 0) && (typeof beatsUpdate === 'string' && beatsUpdate.toLowerCase() === 'yes');
            if (!isProcessable) continue;

            const idx = orderedScenes.findIndex(s => s.file.path === currentScene.file.path);
            const prevScene = idx > 0 ? orderedScenes[idx - 1] : null;
            const nextScene = idx >= 0 && idx < orderedScenes.length - 1 ? orderedScenes[idx + 1] : null;
            triplets.push({ prev: prevScene, current: currentScene, next: nextScene });
        }
            
            if (plugin.settings.debug) {
            }
        
            for (const triplet of triplets) {
                const currentScenePath = triplet.current.file.path;
                 const tripletIdentifier = `subplot-${subplotName}-${triplet.prev?.sceneNumber ?? 'Start'}-${triplet.current.sceneNumber}-${triplet.next?.sceneNumber ?? 'End'}`;

                 // <<< ADDED: Check for BeatsUpdate flag before cache check >>>
                 const beatsUpdateFlag = triplet.current.frontmatter?.beatsupdate ?? triplet.current.frontmatter?.BeatsUpdate;
                 if (typeof beatsUpdateFlag !== 'string' || beatsUpdateFlag.toLowerCase() !== 'yes') {
 
                     // We don't increment totalProcessedCount here, as we only count actual attempts/cache hits
                     continue; // Skip to the next triplet if not flagged
                 }
                 
                 // We've already filtered scenes by Words > 0 when building triplets,
                 // so no need to check again here.

                 // Check cache *after* confirming the scene is flagged for update
                 if (plugin.settings.processedBeatContexts.includes(tripletIdentifier)) {
 
                     totalProcessedCount++;
                     notice.setMessage(`Progress: ${totalProcessedCount}/${totalTripletsAcrossSubplots} scenes (Skipped - Already processed)`);
                continue;
            }

                notice.setMessage(`Processing scene ${triplet.current.sceneNumber} (${totalProcessedCount+1}/${totalTripletsAcrossSubplots}) - Subplot: '${subplotName}'...`);
                 if (plugin.settings.debug) {
                }

                 // Only use neighbor if it has content (Words>0); else mark as N/A to avoid invented beats
                 const prevHasContent = triplet.prev ? hasWordsContent(triplet.prev.frontmatter) : false;
                 const nextHasContent = triplet.next ? hasWordsContent(triplet.next.frontmatter) : false;
                 const prevBody = prevHasContent && triplet.prev ? triplet.prev.body : null;
                 const nextBody = nextHasContent && triplet.next ? triplet.next.body : null;
                 const currentBody = triplet.current.body;
                 const prevNum = prevHasContent && triplet.prev ? String(triplet.prev.sceneNumber ?? 'N/A') : 'N/A';
                 const currentNum = String(triplet.current.sceneNumber ?? 'N/A');
                 const nextNum = nextHasContent && triplet.next ? String(triplet.next.sceneNumber ?? 'N/A') : 'N/A';

                 const contextPrompt = getActiveContextPrompt(plugin);
                 const userPrompt = buildBeatsPrompt(prevBody, currentBody, nextBody, prevNum, currentNum, nextNum, contextPrompt);

                 // Use basename directly (already includes scene number)
                 const sceneNameForLog = triplet.current.file.basename;
                 const aiResult = await callAiProvider(plugin, vault, userPrompt, subplotName, 'processBySubplotOrder', sceneNameForLog);

                 if (aiResult.result) {
                     const parsedBeats = parseGptResult(aiResult.result, plugin);
                     if (parsedBeats) {
                         const updated = await updateSceneFile(vault, triplet.current, parsedBeats, plugin, aiResult.modelIdUsed);
                         if (updated) {
                              plugin.settings.processedBeatContexts.push(tripletIdentifier);
                              await plugin.saveSettings();
                         } else {
                             plugin.log(`[API Beats][processBySubplotOrder] Failed to update file for subplot ${subplotName} after getting beats for: ${currentScenePath}`);
                         }
                     } else {
                         plugin.log(`[API Beats][processBySubplotOrder] Failed to parse AI result for subplot ${subplotName}, scene: ${currentScenePath}`);
                     }
                 } else {
                     plugin.log(`[API Beats][processBySubplotOrder] No result from AI for subplot ${subplotName}, scene: ${currentScenePath}`);
                 }
                 totalProcessedCount++;
                 notice.setMessage(`Progress: ${totalProcessedCount}/${totalTripletsAcrossSubplots} scenes processed...`);
                 await new Promise(resolve => window.setTimeout(resolve, 200));
             }
         }

                 await plugin.saveSettings();

        notice.hide();
         new Notice(`Subplot order processing complete: ${totalProcessedCount}/${totalTripletsAcrossSubplots} triplets processed.`);
         plugin.refreshTimelineIfNeeded(null);

     } catch (error) {
         console.error("[API Beats][processBySubplotOrder] Error during processing:", error);
         notice.hide();
         new Notice("Error processing subplots. Check console for details.");
     }
}

// Process flagged beats for a single chosen subplot name
export async function processBySubplotName(
    plugin: RadialTimelinePlugin,
    vault: Vault,
    subplotName: string
): Promise<void> {
    const notice = new Notice(`Processing Subplot “${subplotName}”: getting scene data...`, 0);
    try {
        const allScenes = await getAllSceneData(plugin, vault);
        if (allScenes.length < 1) {
            new Notice("No valid scenes found in the specified source path.");
            notice.hide();
            return;
        }

        // Filter scenes to only those containing the chosen subplot
        const filtered = allScenes.filter(scene => getSubplotNamesFromFM(scene.frontmatter).includes(subplotName));
        

        if (filtered.length === 0) {
            new Notice(`No scenes found for subplot “${subplotName}”.`);
            notice.hide();
            return;
        }

        // Sort by sceneNumber (if present)
        filtered.sort(compareScenesByOrder);

        // Consider only scenes with Words > 0 and BeatsUpdate: Yes
        const validScenes = filtered.filter(scene => {
            const words = (scene.frontmatter?.words || scene.frontmatter?.Words) as unknown;
            const beatsUpdate = (scene.frontmatter?.beatsupdate || scene.frontmatter?.BeatsUpdate) as unknown;
            return (typeof words === 'number' && words > 0)
                && (typeof beatsUpdate === 'string' && beatsUpdate.toLowerCase() === 'yes');
        });

        if (validScenes.length === 0) {
            new Notice(`No flagged scenes (BeatsUpdate: Yes) with content found for “${subplotName}”.`);
            notice.hide();
            return;
        }

        notice.setMessage(`Analyzing ${validScenes.length} scenes in "${subplotName}"...`);


        // Build triplets for flagged scenes using ALL filtered scenes for context
        const triplets: { prev: SceneData | null, current: SceneData, next: SceneData | null }[] = [];
        
        // Only build triplets for scenes that are flagged for processing
        const flaggedScenes = validScenes; // Already filtered for Words > 0 and BeatsUpdate: Yes
        
        for (const flaggedScene of flaggedScenes) {
            // Find this scene's position in the complete filtered list (for contiguous context)
            const idx = filtered.findIndex(s => s.file.path === flaggedScene.file.path);
            
            // Get prev/next from complete list to maintain contiguity
            const prev = idx > 0 ? filtered[idx - 1] : null;
            const next = idx >= 0 && idx < filtered.length - 1 ? filtered[idx + 1] : null;
            
            
            triplets.push({ prev, current: flaggedScene, next });
        }

        let processedCount = 0;
        const total = triplets.length;

        for (const triplet of triplets) {
            // Only process if the current scene is flagged
            const flag = (triplet.current.frontmatter?.beatsupdate || triplet.current.frontmatter?.BeatsUpdate) as unknown;
            if (!(typeof flag === 'string' && flag.toLowerCase() === 'yes')) continue;

            const currentPath = triplet.current.file.path;
            const key = `subplot-${subplotName}-${triplet.prev?.sceneNumber ?? 'Start'}-${triplet.current.sceneNumber}-${triplet.next?.sceneNumber ?? 'End'}`;

            if (plugin.settings.processedBeatContexts.includes(key)) {
                processedCount++;
                notice.setMessage(`Progress: ${processedCount}/${total} scenes (Skipped - Already processed)`);
                continue;
            }

            notice.setMessage(`Processing scene ${triplet.current.sceneNumber} (${processedCount + 1}/${total}) — "${subplotName}"...`);

            // Only use neighbor if it has content (Words>0); else mark as N/A to avoid invented beats
            const prevHasContent = triplet.prev ? hasWordsContent(triplet.prev.frontmatter) : false;
            const nextHasContent = triplet.next ? hasWordsContent(triplet.next.frontmatter) : false;
            
            
            const prevBody = prevHasContent && triplet.prev ? triplet.prev.body : null;
            const currentBody = triplet.current.body;
            const nextBody = nextHasContent && triplet.next ? triplet.next.body : null;
            const prevNum = prevHasContent && triplet.prev ? String(triplet.prev.sceneNumber ?? 'N/A') : 'N/A';
            const currentNum = String(triplet.current.sceneNumber ?? 'N/A');
            const nextNum = nextHasContent && triplet.next ? String(triplet.next.sceneNumber ?? 'N/A') : 'N/A';

            const contextPrompt = getActiveContextPrompt(plugin);
            const userPrompt = buildBeatsPrompt(prevBody, currentBody, nextBody, prevNum, currentNum, nextNum, contextPrompt);
            // Use basename directly (already includes scene number)
            const sceneNameForLog = triplet.current.file.basename;
            const aiResult = await callAiProvider(plugin, vault, userPrompt, subplotName, 'processBySubplotOrder', sceneNameForLog);

            if (aiResult.result) {
                const parsedBeats = parseGptResult(aiResult.result, plugin);
                if (parsedBeats) {
                    const ok = await updateSceneFile(vault, triplet.current, parsedBeats, plugin, aiResult.modelIdUsed);
                    if (ok) {
                        plugin.settings.processedBeatContexts.push(key);
                        await plugin.saveSettings();
                    } else {
                        plugin.log(`[API Beats][processBySubplotName] Failed to update file for subplot ${subplotName} after getting beats for: ${currentPath}`);
                    }
                } else {
                    plugin.log(`[API Beats][processBySubplotName] Failed to parse AI result for subplot ${subplotName}, scene: ${currentPath}`);
                }
            } else {
                plugin.log(`[API Beats][processBySubplotName] No result from AI for subplot ${subplotName}, scene: ${currentPath}`);
            }

            processedCount++;
            notice.setMessage(`Progress: ${processedCount}/${total} scenes processed...`);
            await new Promise(resolve => window.setTimeout(resolve, 200));
        }

        await plugin.saveSettings();
        notice.hide();
        new Notice(`Subplot "${subplotName}" complete: ${processedCount}/${total} triplets processed.`);
        plugin.refreshTimelineIfNeeded(null);
    } catch (error) {
        console.error("[API Beats][processBySubplotName] Error during processing:", error);
        notice.hide();
        new Notice(`Error processing subplot "${subplotName}". Check console for details.`);
    }
}

// Return distinct subplot names found in scene frontmatter, ordered same as timeline
export async function getDistinctSubplotNames(
    plugin: RadialTimelinePlugin,
    vault: Vault
): Promise<string[]> {
    const scenes = await getAllSceneData(plugin, vault);
    const subplotCounts = new Map<string, number>();
    
    // Count scenes per subplot
    scenes.forEach(scene => {
        const subplotList = getSubplotNamesFromFM(scene.frontmatter);
        subplotList.forEach(subplot => {
            if (subplot) {
                subplotCounts.set(subplot, (subplotCounts.get(subplot) || 0) + 1);
            }
        });
    });
    
    // Convert to array and sort (same logic as timeline renderer)
    const subplotArray = Array.from(subplotCounts.entries()).map(([subplot, count]) => ({
        subplot,
        count
    }));
    
    // Sort: "Main Plot" first, then by count descending, then alphabetical
    subplotArray.sort((a, b) => {
        if (a.subplot === "Main Plot" || !a.subplot) return -1;
        if (b.subplot === "Main Plot" || !b.subplot) return 1;
        if (a.count !== b.count) return b.count - a.count; // Higher count first
        return a.subplot.localeCompare(b.subplot); // Alphabetical fallback
    });
    
    return subplotArray.map(item => item.subplot);
}

// <<< ADDED: Dummy data for testing >>>
const DUMMY_API_RESPONSE = `1beats:
 - 33.2 Trisan Inner Turmoil - / Lacks clarity
 - Chae Ban Hesitation ? / Uncertain decision
 - Entiat Reflection ? / Needs clearer link: should explore motive
 - Chae Ban Plan + / Strengthens connection to 2beats choices
 - Meeting Entiat + / Sets up tension
2beats:
 - 33.5 B / Scene will be stronger by making Entiat motivations clearer. Clarify: imminent threat
 - Entiat Adoption Reflections ? / Lacks tension link to events in 1beats
 - Chae Ban Escape News + / Advances plot
 - Entiat Internal Conflict + / Highlights dilemma: how to handle the situation from 1beats
 - Connection to 3beats + / Sets up the coming conflict
3beats:
 - 34 Teco Routine Disruption - / Needs purpose
 - Entiat Unexpected Visit ? / Confusing motivation: clarify intention here
 - Sasha Defense and Defeat + / Builds on tension from 2beats
 - Teco Escape Decision + / Strong transition
 - Final Choice + / Resolves arc started in 1beats`;

// <<< ADDED: Exported Test Function >>>
export async function testYamlUpdateFormatting(
    plugin: RadialTimelinePlugin,
    vault: Vault
): Promise<void> {
    const dummyFilePath = "AITestDummyScene.md";
    const dummyBody = "This is the body text of the dummy scene.\nIt has multiple lines.";
    const dummyInitialFrontmatter = {
        Class: "Scene",
        Synopsis: "Dummy synopsis for testing YAML update.",
        Subplot: ["Test Arc"],
        When: "2024-01-01",
        Words: 10,
        BeatsUpdate: "Yes"
    };

    new Notice(`Starting YAML update test on ${dummyFilePath}...`);
    try {
        let file = vault.getAbstractFileByPath(dummyFilePath);
        if (!(file instanceof TFile)) {
            new Notice(`Creating dummy file: ${dummyFilePath}`);
            const initialContent = `---\n${stringifyYaml(dummyInitialFrontmatter)}---\n${dummyBody}`;
            await vault.create(dummyFilePath, initialContent);
            file = vault.getAbstractFileByPath(dummyFilePath);
        }

        
        if (!(file instanceof TFile)) {
            new Notice(`Error: Could not get TFile for ${dummyFilePath}`);
            return;
        }
        const currentContent = await vault.read(file);
        const fmInfo = getFrontMatterInfo(currentContent) as unknown as FMInfo;
        if (!fmInfo || !fmInfo.exists) {
            new Notice(`Error: Dummy file ${dummyFilePath} is missing frontmatter.`);
            return;
        }
        const fmText = fmInfo.frontmatter ?? '';
        const currentFrontmatter = fmText ? (parseYaml(fmText) || {}) : {};
        let currentBody = currentContent;
        const endOffset = fmInfo.position?.end?.offset as number | undefined;
        if (typeof endOffset === 'number' && endOffset >= 0 && endOffset <= currentContent.length) {
            currentBody = currentContent.slice(endOffset).trim();
        } else {
            // Fallback: regex removal if offsets unavailable
            currentBody = currentContent.replace(/^---[\s\S]*?\n---/, "").trim();
        }

        const dummySceneData: SceneData = {
            file: file,
            frontmatter: currentFrontmatter,
            sceneNumber: 999,
            body: currentBody
        };

        const parsedBeats = parseGptResult(DUMMY_API_RESPONSE, plugin);
        if (!parsedBeats) {
            new Notice('Error: Failed to parse dummy API response data.');
            return;
        }

        const success = await updateSceneFile(vault, dummySceneData, parsedBeats, plugin, null);

        if (success) {
            new Notice(`Successfully updated YAML in ${dummyFilePath}. Please check the file formatting.`);
        } else {
            new Notice(`Failed to update YAML in ${dummyFilePath}. Check console for errors.`);
        }

    } catch (error) {
        console.error("Error during YAML update test:", error);
        new Notice('Error during YAML update test. Check console.');
    }
}

// Create a ready-to-edit template Scene in the source path (or vault root)
export async function createTemplateScene(
    plugin: RadialTimelinePlugin,
    vault: Vault
): Promise<void> {
    try {
        const today = new Date();
        const isoDate = today.toISOString().slice(0, 10);

        // Determine target folder: settings.sourcePath if set, else root
        const folderPath = sanitizeSourcePath(plugin.settings.sourcePath);
        // Ensure folder exists when specified
        if (folderPath) {
            const f = vault.getAbstractFileByPath(folderPath);
            if (!f) {
                await vault.createFolder(folderPath);
            }
        }
        // Harmonized initial filename with demo/new-vault behavior
        const targetPath = buildInitialSceneFilename(folderPath, '1 Test Scene.md');

        const frontmatter = {
            Class: 'Scene',
            Act: 1,
            When: isoDate,
            Synopsis: 'Write a one-sentence summary of this scene.',
            Subplot: ['Main Plot'],
            Character: [],
            Place: [],
            Status: 'Todo',
            'Publish Stage': 'Zero',
            Revision: '',
            Due: '',
            'Pending Edits': '',
            Words: 0,
            BeatsUpdate: 'No'
        } as Record<string, unknown>;

        const body = '\nWrite your scene here. Replace Subplot/Character/Place in the frontmatter as needed.';
        const content = `---\n${stringifyYaml(frontmatter)}---\n${body}\n`;

        await vault.create(targetPath, content);
        new Notice(`Created template scene: ${targetPath}`);
        // Open the new file
        const created = vault.getAbstractFileByPath(targetPath);
        if (created instanceof TFile) {
            await plugin.app.workspace.getLeaf('tab').openFile(created);
        }
    } catch (e) {
        console.error('[createTemplateScene] Failed:', e);
        new Notice('Failed to create template scene. Check console for details.');
    }
}
