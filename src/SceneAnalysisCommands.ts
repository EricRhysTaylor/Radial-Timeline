/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */
import RadialTimelinePlugin from './main'; 
import { App, TFile, Vault, Notice, parseYaml, getFrontMatterInfo, stringifyYaml, Modal, ButtonComponent } from "obsidian";
import { sanitizeSourcePath, buildInitialSceneFilename } from './utils/sceneCreation';
import { callAnthropicApi, AnthropicApiResponse } from './api/anthropicApi';
import { callOpenAiApi, OpenAiApiResponse } from './api/openaiApi';
import { SceneAnalysisProcessingModal } from './modals/SceneAnalysisProcessingModal';

// Helper function to normalize boolean values from various formats
function normalizeBooleanValue(value: unknown): boolean {
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'string') {
        const lower = value.toLowerCase().trim();
        // Handle empty string or just whitespace as false
        if (lower === '' || lower === ' ') {
            return false;
        }
        return lower === 'yes' || lower === 'true' || lower === '1';
    }
    if (typeof value === 'number') {
        return value === 1;
    }
    // Handle null, undefined, or any other falsy value as false
    return false;
}
import { callGeminiApi, GeminiApiResponse } from './api/geminiApi';
import { buildSceneAnalysisPrompt, getSceneAnalysisJsonSchema } from './ai/prompts/sceneAnalysis';
import { type ProcessingMode } from './modals/SceneAnalysisProcessingModal';
import { stripObsidianComments } from './utils/text';
import { normalizeFrontmatterKeys } from './utils/frontmatter';
import { openOrRevealFileByPath } from './utils/fileUtils';
import { buildTripletsByIndex } from './sceneAnalysis/TripletBuilder';
import { updateSceneAnalysis } from './sceneAnalysis/FileUpdater';
import { createAiRunner } from './sceneAnalysis/RequestRunner';

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

// JSON structure for beats response from LLM
interface BeatItem {
    scene: string;      // e.g., "82" or "90"
    title?: string;     // Optional beat title
    grade: '+' | '-' | '?' | 'A' | 'B' | 'C';  // Grade indicator (A/B/C for overall scene quality, +/-/? for beat connections)
    comment: string;    // Editorial comment
}

interface SceneAnalysisJsonResponse {
    'previousSceneAnalysis'?: BeatItem[];  // Optional for first scene
    'currentSceneAnalysis': BeatItem[];   // Required for current scene
    'nextSceneAnalysis'?: BeatItem[];  // Optional for last scene
}

// Internal format after parsing (for compatibility with existing code)
interface ParsedSceneAnalysis {
    'previousSceneAnalysis': string;
    'currentSceneAnalysis': string;
    'nextSceneAnalysis': string;
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

// Extract scene number from filename (e.g., "52 Escaping Earth.md" → 52)
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
                const rawFrontmatter = fmText ? (parseYaml(fmText) || {}) : {};
                frontmatter = normalizeFrontmatterKeys(rawFrontmatter);
            } catch {
                return null; // Skip files with invalid YAML
            }

            const fileClass = frontmatter?.Class;
            if (typeof fileClass !== 'string' || fileClass.toLowerCase() !== 'scene') {
                const foundClass = fileClass ? `'${fileClass}'` : 'Not found';

                return null; // Skip if not Class: Scene
            }



            // Extract scene number from filename (e.g., "52 Escaping Earth.md" → 52)
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
 * Helper function to check if a scene was processed today
 * Parses the "Beats Last Updated" timestamp and compares date (ignoring time)
 */
function wasProcessedToday(frontmatter: Record<string, unknown> | undefined): boolean {
    if (!frontmatter) return false;
    
    const beatsLastUpdated = frontmatter['Beats Last Updated'];
    if (!beatsLastUpdated || typeof beatsLastUpdated !== 'string') return false;
    
    // Parse: "Jan 21, 2025, 2:30 PM by model-name"
    // Extract the date/time portion before " by "
    const match = beatsLastUpdated.match(/^(.+?)\s+by\s+/);
    if (!match) return false;
    
    try {
        const timestampDate = new Date(match[1]);
        if (isNaN(timestampDate.getTime())) return false;
        
        const today = new Date();
        
        // Compare just the date parts (ignore time)
        return timestampDate.toDateString() === today.toDateString();
    } catch (e) {
        return false;
    }
}

/**
 * Options for checking if a scene has been processed
 */
interface ProcessedCheckOptions {
    todayOnly?: boolean;  // If true, only consider "processed" if done today (for resume)
}

/**
 * Helper function to determine if a scene has already been processed for AI scene analysis
 * A scene is considered processed if:
 * 1. It has a Beats Last Updated timestamp, OR
 * 2. It has any analysis fields (previousSceneAnalysis, currentSceneAnalysis, or nextSceneAnalysis)
 * 
 * When todayOnly is true (for resume logic):
 * - Only considers a scene "processed" if it has a timestamp from today
 * - Used to skip recently processed scenes when resuming after interruption
 */
function hasBeenProcessedForBeats(
    frontmatter: Record<string, unknown> | undefined,
    options: ProcessedCheckOptions = {}
): boolean {
    if (!frontmatter) return false;
    
    const hasTimestamp = !!frontmatter['Beats Last Updated'];
    const hasAnalysis = !!frontmatter['previousSceneAnalysis'] || !!frontmatter['currentSceneAnalysis'] || !!frontmatter['nextSceneAnalysis'];
    
    // No timestamp or analysis = definitely unprocessed
    if (!hasTimestamp && !hasAnalysis) return false;
    
    // If todayOnly mode (for resume), only consider processed if done today
    if (options.todayOnly) {
        return hasTimestamp && wasProcessedToday(frontmatter);
    }
    
    // Default: has timestamp or analysis = processed
    return hasTimestamp || hasAnalysis;
}

// Helper function to calculate scene count for each processing mode
export async function calculateSceneCount(
    plugin: RadialTimelinePlugin,
    vault: Vault,
    mode: ProcessingMode
): Promise<number> {
    // Check if this is a resume operation
    const isResuming = plugin.settings._isResuming || false;
    
    const allScenes = await getAllSceneData(plugin, vault);
    allScenes.sort(compareScenesByOrder);
    
    // Filter scenes based on mode
    const processableScenes = allScenes.filter(scene => {
        // Flagged mode: must be flagged AND have processable content (Working/Complete)
        if (mode === 'flagged') {
            const beatsUpdateFlag = scene.frontmatter?.beatsupdate ?? scene.frontmatter?.BeatsUpdate ?? scene.frontmatter?.['Beats Update'];
            return normalizeBooleanValue(beatsUpdateFlag) && hasProcessableContent(scene.frontmatter);
        }
        
        // Force-all and unprocessed modes: must have Status=Complete or Working
        return hasProcessableContent(scene.frontmatter);
    });
    
    // Flagged mode: count flagged scenes (resume doesn't change this)
    if (mode === 'flagged') {
        return processableScenes.length;
    }
    
    // Force-all mode
    if (mode === 'force-all') {
        if (isResuming) {
            // Resume: count scenes NOT processed today
            return processableScenes.filter(scene => 
                !hasBeenProcessedForBeats(scene.frontmatter, { todayOnly: true })
            ).length;
        }
        // Initial: count all scenes
        return processableScenes.length;
    }
    
    // Unprocessed mode
    if (mode === 'unprocessed') {
        if (isResuming) {
            // Resume: count scenes NOT processed today
            return processableScenes.filter(scene => 
                !hasBeenProcessedForBeats(scene.frontmatter, { todayOnly: true })
            ).length;
        }
        // Initial: count scenes with no timestamp/beats
        return processableScenes.filter(scene => 
            !hasBeenProcessedForBeats(scene.frontmatter)
        ).length;
    }
    
    // Fallback (should not be reached)
    return 0;
}

// Return flagged scene count (used for UI hints)
export async function calculateFlaggedCount(
    plugin: RadialTimelinePlugin,
    vault: Vault,
    mode: ProcessingMode
): Promise<number> {
    const allScenes = await getAllSceneData(plugin, vault);
    allScenes.sort(compareScenesByOrder);
    const isFlagged = (scene: SceneData) => normalizeBooleanValue(scene.frontmatter?.beatsupdate ?? scene.frontmatter?.BeatsUpdate ?? scene.frontmatter?.['Beats Update']);
    if (mode === 'flagged') {
        return allScenes.filter(isFlagged).length;
    }
    if (mode === 'force-all') return allScenes.length;
    if (mode === 'unprocessed') return allScenes.filter(s => hasProcessableContent(s.frontmatter) && !hasBeenProcessedForBeats(s.frontmatter)).length;
    return 0;
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
    sceneName?: string,
    tripletInfo?: { prev: string; current: string; next: string }
): Promise<void> {
    if (!plugin.settings.logApiInteractions) {
        return;
    }

    const logFolder = "AI";
    // Local-time, file-safe timestamp for filenames
    // toLocaleString produces format like "10/21/2025, 3:28:51 PM PDT"
    // We need to replace invalid filename characters (slashes, colons) to produce: "10-21-2025 at 3.28.51 PM PDT"
    const timestamp = new Date().toLocaleString(undefined, {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: true, timeZoneName: 'short'
    } as Intl.DateTimeFormatOptions)
    .replace(/\//g, '-') // Replace date slashes with dashes (10/21/2025 -> 10-21-2025)
    .replace(/(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)\s*([A-Z]{3,})/g, 'at $1.$2.$3 $4 $5') // Replace time colons with periods (3:28:51 PM -> at 3.28.51 PM)
    .replace(/[\s,]+/g, ' ') // Replace multiple spaces/commas with single space
    .trim();
    
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

    // Use the triplet info passed directly from the caller (no regex parsing needed!)
    const scenesSummaryForTitle = tripletInfo || { prev: undefined, current: undefined, next: undefined };

    const providerTitle = provider.charAt(0).toUpperCase() + provider.slice(1);
    
    // Human-friendly local timestamp (e.g., "01-18-2025 8:38:45 AM PDT")
    const readableTimestamp = new Date().toLocaleString(undefined, {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: 'numeric', minute: '2-digit', second: '2-digit',
        hour12: true, timeZoneName: 'short'
    } as Intl.DateTimeFormatOptions);
    
    // New title format: "Scene Processed — Model — Timestamp" (for filename only)
    const sceneTitle = scenesSummaryForTitle.current ? `Scene ${scenesSummaryForTitle.current}` : 'Scene Processed';
    
    // Start file content without duplicating the title
    let fileContent = `**Command:** ${commandContext}\n`;
    fileContent += `**Provider:** ${provider}\n`;
    fileContent += `**Model:** ${friendlyModel}\n`;
    fileContent += `**Model ID:** ${modelId}\n`;
    fileContent += `**Timestamp:** ${readableTimestamp}\n`;
    
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
    // Build scenes summary using the triplet info passed directly (no parsing needed!)
    const scenesLine = `**Scenes:** prev=${tripletInfo?.prev ?? 'N/A'}, current=${tripletInfo?.current ?? 'N/A'}, next=${tripletInfo?.next ?? 'N/A'}`;
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
    sceneName?: string,
    tripletInfo?: { prev: string; current: string; next: string }
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
                    if (id === 'claude-sonnet-4-1' || id === 'claude-4-sonnet' || id === 'claude-sonnet-4-1@20250805') return 'claude-sonnet-4-5-20250929';
                    // Legacy fallbacks map to latest
                    if (id === 'claude-opus-4-0' || id === 'claude-3-opus-20240229') return 'claude-opus-4-1-20250805';
                    if (id === 'claude-sonnet-4-0' || id === 'claude-3-7-sonnet-20250219' || id === 'claude-sonnet-4-20250514') return 'claude-sonnet-4-5-20250929';
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
            modelId = normalizeModelId('anthropic', plugin.settings.anthropicModelId) || 'claude-sonnet-4-5-20250929';

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

            // Get JSON schema for scene analysis
            const jsonSchema = getSceneAnalysisJsonSchema();

            const safetySystem = 'Follow policy: respond with purely editorial, non-explicit analysis. Avoid sexual detail, graphic violence, or instructions for harm. Output must be valid JSON only.';

            requestBodyForLog = {
                model: modelId,
                contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
                generationConfig: { 
                    temperature: 0.7, 
                    maxOutputTokens: 4000,
                    responseMimeType: 'application/json',
                    responseSchema: jsonSchema
                },
                systemInstruction: { parts: [{ text: safetySystem }] }
            };

            let apiResponse: GeminiApiResponse = await retryWithBackoff(() =>
                callGeminiApi(apiKey!, modelId!, safetySystem, userPrompt, 4000, 0.7, jsonSchema)
            );

            // If Gemini was safety-blocked, try OpenAI fallback if configured
            if (!apiResponse.success && typeof apiResponse.error === 'string' && apiResponse.error.toLowerCase().includes('safety')) {
                const oaiKey = plugin.settings.openaiApiKey;
                const oaiModel = plugin.settings.openaiModelId || 'gpt-4.1';
                if (oaiKey) {
                    // Build OpenAI request for accurate logging and scene extraction
                    const openAiRequestForLog = {
                        model: oaiModel,
                        messages: [
                            { role: "user", content: userPrompt }
                        ],
                        temperature: 0.7,
                        max_tokens: 4000,
                        response_format: { type: 'json_object' }
                    };
                    const oaiResp: OpenAiApiResponse = await retryWithBackoff(() =>
                        callOpenAiApi(oaiKey, oaiModel, null, userPrompt, 4000, 0.7, true)
                    );
                    responseDataForLog = oaiResp.responseData;
                    if (!oaiResp.success) {
                        apiErrorMsg = oaiResp.error || 'Fallback (OpenAI) failed after Gemini safety block.';
                        throw new Error(apiErrorMsg);
                    }
                    result = oaiResp.content;
                    modelId = oaiModel;
                    // Log and return (use OpenAI request body for correct scene extraction in logs)
                    requestBodyForLog = openAiRequestForLog;
                    await logApiInteractionToFile(plugin, vault, 'openai', modelId, requestBodyForLog, responseDataForLog, subplotName, commandContext, sceneName, tripletInfo);
                    return { result, modelIdUsed: modelId };
                }
            }

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
                max_tokens: 4000,
                response_format: { type: 'json_object' }
            };
    

            const apiResponse: OpenAiApiResponse = await retryWithBackoff(() =>
                callOpenAiApi(apiKey!, modelId!, null, userPrompt, 4000, 0.7, true)
            );

            responseDataForLog = apiResponse.responseData;

            if (!apiResponse.success) {
                apiErrorMsg = apiResponse.error;
                throw new Error(apiErrorMsg || `OpenAI API call failed.`);
            }
            result = apiResponse.content;
        }

    
        await logApiInteractionToFile(plugin, vault, provider, modelId || 'unknown', requestBodyForLog, responseDataForLog, subplotName, commandContext, sceneName, tripletInfo);
        return { result: result, modelIdUsed: modelId || 'unknown' };

    } catch (error: unknown) {
        const errorMessage = apiErrorMsg || (error instanceof Error ? error.message : String(error));
        console.error(`[API][BeatsCommands][callAiProvider] Error during ${provider} API call:`, errorMessage, error);

         const currentProvider = provider || plugin.settings.defaultAiProvider || 'unknown';
         if (!modelId) {
            if (currentProvider === 'anthropic') modelId = plugin.settings.anthropicModelId || 'claude-sonnet-4-5-20250929';
            else if (currentProvider === 'openai') modelId = 'gpt-4o';
            else if (currentProvider === 'gemini') modelId = plugin.settings.geminiModelId || 'gemini-1.5-pro';
            else modelId = 'unknown';
         }

        if (!requestBodyForLog) requestBodyForLog = { note: "Request body not constructed due to early error." };
        if (!responseDataForLog) {
             responseDataForLog = { error: { message: errorMessage, type: (errorMessage.includes('configured')) ? 'plugin_config_error' : 'plugin_execution_error' } };
        }

        await logApiInteractionToFile(plugin, vault, currentProvider, modelId || 'unknown', requestBodyForLog, responseDataForLog, subplotName, commandContext, sceneName, tripletInfo);

        new Notice(`Error: ${errorMessage}`);

      return { result: null, modelIdUsed: null };
    }
}

/**
 * Parse JSON response from LLM into the format expected by updateSceneFile
 */
function parseJsonBeatsResponse(jsonResult: string, plugin: RadialTimelinePlugin): ParsedSceneAnalysis | null {
    try {
        // Remove markdown code blocks if present
        let cleanedJson = jsonResult.trim();
        if (cleanedJson.startsWith('```json')) {
            cleanedJson = cleanedJson.replace(/^```json\s*\n?/, '').replace(/\n?```\s*$/, '');
        } else if (cleanedJson.startsWith('```')) {
            cleanedJson = cleanedJson.replace(/^```\s*\n?/, '').replace(/\n?```\s*$/, '');
        }
        
        const parsed = JSON.parse(cleanedJson) as SceneAnalysisJsonResponse;
        
        // Convert JSON structure to string format for compatibility with existing code
        const formatAnalysisArray = (analysis: BeatItem[] | undefined, isCurrentAnalysis: boolean = false): string => {
            if (!analysis || analysis.length === 0) return '';
            
            return analysis.map((beat, index) => {
                // First line always includes scene number
                if (index === 0) {
                    // Special handling for first currentSceneAnalysis item (overall scene grade A/B/C)
                    // Format: " - {scene} {grade} / {comment}" (no title)
                    const isOverallGrade = isCurrentAnalysis && ['A', 'B', 'C'].includes(beat.grade);
                    if (isOverallGrade) {
                        return ` - ${beat.scene} ${beat.grade} / ${beat.comment}`;
                    }
                    
                    // Standard format with scene number: " - {scene} {title} {grade} / {comment}"
                    const parts = [beat.scene];
                    if (beat.title) parts.push(beat.title);
                    parts.push(beat.grade);
                    return ` - ${parts.join(' ')} / ${beat.comment}`;
                }
                
                // Subsequent lines: omit scene number, just " - {title} {grade} / {comment}"
                const parts: string[] = [];
                if (beat.title) parts.push(beat.title);
                parts.push(beat.grade);
                return ` - ${parts.join(' ')} / ${beat.comment}`;
            }).join('\n');
        };
        
        const result: ParsedSceneAnalysis = {
            'previousSceneAnalysis': formatAnalysisArray(parsed['previousSceneAnalysis'], false),
            'currentSceneAnalysis': formatAnalysisArray(parsed['currentSceneAnalysis'], true),  // Special handling for overall grade
            'nextSceneAnalysis': formatAnalysisArray(parsed['nextSceneAnalysis'], false)
        };
        
        // Require at least currentSceneAnalysis content
        if (!result['currentSceneAnalysis'].trim()) {
            new Notice('LLM response is missing required currentSceneAnalysis.');
            return null;
        }
        
        return result;
    } catch (error) {
        console.error("[parseJsonBeatsResponse] Error parsing JSON beats response:", error);
        new Notice('Failed to parse LLM JSON response. Check console for details.');
        return null;
    }
}

// Keep old regex parser as fallback for now
function parseGptResult(gptResult: string, plugin: RadialTimelinePlugin): ParsedSceneAnalysis | null {
    // Try JSON parsing first
    const jsonResult = parseJsonBeatsResponse(gptResult, plugin);
    if (jsonResult) {
        return jsonResult;
    }
    
    // Fallback to regex parser if JSON parsing fails
    try {
        // Fallback to old regex parser for backwards compatibility
        let text = (gptResult || '').replace(/\r\n?/g, '\n');
        text = text.replace(/^\s*[•–—]\s+/gm, '- ');

        const normalizeHeader = (key: 'previousSceneAnalysis'|'currentSceneAnalysis'|'nextSceneAnalysis') => {
            const headerRegex = new RegExp(
                `^\\s*(?:[#>*_` + "'" + `\-]{0,5}\\s*)*` + key + `\\s*:?\\s*(?:[#>*_` + "'" + `\-]{0,5})?\\s*$`,
                'gmi'
            );
            text = text.replace(headerRegex, `${key}:`);
        };
        normalizeHeader('previousSceneAnalysis');
        normalizeHeader('currentSceneAnalysis');
        normalizeHeader('nextSceneAnalysis');

        const section1Pattern = /^previousSceneAnalysis:\s*([\s\S]*?)(?=^\s*(?:currentSceneAnalysis:|nextSceneAnalysis:|$))/m;
        const section2Pattern = /^currentSceneAnalysis:\s*([\s\S]*?)(?=^\s*(?:nextSceneAnalysis:|$))/m;
        const section3Pattern = /^nextSceneAnalysis:\s*([\s\S]*)$/m;
        
        const section1Match = text.match(section1Pattern);
        const section2Match = text.match(section2Pattern);
        const section3Match = text.match(section3Pattern);
        
        const processSection = (content: string | undefined): string => {
            if (!content) return '';
            const normalized = content.replace(/\\n/g, '\n').replace(/(\\n)+\s*$/, '');
            const trimmedContent = normalized.trim();
            if (!trimmedContent) return '';
            
            const lines = trimmedContent.split('\n').map(l => l.trim());
            const normalizedBullets = lines.map(l => l.replace(/^([•–—])\s+/, '- '));
            const bulletLines = normalizedBullets.filter(l => /^-\s+/.test(l));
            
            if (bulletLines.length > 0) {
                return bulletLines.map(l => ` ${l}`).join('\n');
            }
            
            const nonEmpty = normalizedBullets.filter(l => l.length > 0);
            if (nonEmpty.length > 0) {
                return nonEmpty.map(l => ` - ${l}`).join('\n');
            }
            return '';
        };
        
        const analysis: ParsedSceneAnalysis = {
            'previousSceneAnalysis': processSection(section1Match?.[1]),
            'currentSceneAnalysis': processSection(section2Match?.[1]),
            'nextSceneAnalysis': processSection(section3Match?.[1])
        };
        
        if (!analysis['previousSceneAnalysis'].trim() && !analysis['currentSceneAnalysis'].trim() && !analysis['nextSceneAnalysis'].trim()) {
             new Notice('Failed to parse scene analysis from LLM response.');
             return null;
        }
        
        return analysis;
    } catch (error) {
        console.error("[parseGptResult] Error parsing beats response:", error);
        return null;
    }
}

async function updateSceneFile(
    vault: Vault, 
    scene: SceneData, 
    parsedAnalysis: ParsedSceneAnalysis, 
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

            // Always record last update timestamp/model in Beats Last Updated.
            // Use friendly local time format instead of ISO
            const now = new Date();
            const timestamp = now.toLocaleString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });
            const updatedValue = `${timestamp}${modelIdUsed ? ` by ${modelIdUsed}` : ' by Unknown Model'}`;
            fmObj['Beats Last Updated'] = updatedValue;

            // After a successful update, always set the processing flag to No/False
            // If lowercase beatsupdate exists, update it; otherwise use Beats Update
            if (Object.prototype.hasOwnProperty.call(fmObj, 'beatsupdate')) {
                fmObj['beatsupdate'] = false; // Use boolean false for consistency
            } else {
                // Always set Beats Update=False (canonical form) after processing
                fmObj['Beats Update'] = false;
            }

            const b1 = parsedAnalysis['previousSceneAnalysis']?.trim();
            const b2 = parsedAnalysis['currentSceneAnalysis']?.trim();
            const b3 = parsedAnalysis['nextSceneAnalysis']?.trim();
            
            if (b1) fmObj['previousSceneAnalysis'] = toArray(b1);
            if (b2) fmObj['currentSceneAnalysis'] = toArray(b2);
            if (b3) fmObj['nextSceneAnalysis'] = toArray(b3);
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
    const modal = new SceneAnalysisProcessingModal(
        plugin.app,
        plugin,
        (mode: ProcessingMode) => calculateSceneCount(plugin, vault, mode),
        async (mode: ProcessingMode) => {
            // This is the actual processing logic
            await processWithModal(plugin, vault, mode, modal);
        },
        'radial-timeline:update-beats-manuscript-order' // pass command ID for resume functionality
    );
    
    modal.open();
}

// Internal processing function that works with the modal
async function processWithModal(
    plugin: RadialTimelinePlugin,
    vault: Vault,
    mode: ProcessingMode,
    modal: SceneAnalysisProcessingModal
): Promise<void> {
    // Check if this is a resume operation
    const isResuming = plugin.settings._isResuming || false;
    
    // Clear the flag immediately after reading
    if (isResuming) {
        plugin.settings._isResuming = false;
        await plugin.saveSettings();
    }
    
    const allScenes = await getAllSceneData(plugin, vault);
    allScenes.sort(compareScenesByOrder);

    if (allScenes.length < 1) {
        throw new Error("No valid scenes found in the specified source path.");
    }

    // Filter scenes based on mode
    const processableScenes = allScenes.filter(scene => {
        // Flagged mode: must have Beats Update=Yes/True/1
        if (mode === 'flagged') {
            const beatsUpdateFlag = scene.frontmatter?.beatsupdate ?? scene.frontmatter?.BeatsUpdate ?? scene.frontmatter?.['Beats Update'];
            return normalizeBooleanValue(beatsUpdateFlag);
        }
        
        // Force-all and unprocessed modes: must have Status=Complete or Working
        return hasProcessableContent(scene.frontmatter);
    });

    // Build list of scenes with processable content (Status=Working or Complete) for context
    const processableContentScenes = allScenes.filter(scene => hasProcessableContent(scene.frontmatter));
    
    // Build triplets using only processable scenes for context, but only process flagged scenes
    const triplets = buildTripletsByIndex(processableContentScenes, processableScenes, (s) => s.file.path);

    let processedCount = 0;
    let totalToProcess = 0;
    
    // Calculate total based on mode AND resume state - MUST match the processing logic below
    for (const triplet of triplets) {
        const beatsUpdateFlag = triplet.current.frontmatter?.beatsupdate ?? triplet.current.frontmatter?.BeatsUpdate ?? triplet.current.frontmatter?.['Beats Update'];
        const isFlagged = normalizeBooleanValue(beatsUpdateFlag);
        
        if (mode === 'flagged') {
            // Flagged mode: count flagged scenes (resume doesn't change this)
            if (isFlagged) totalToProcess++;
        } else if (mode === 'force-all') {
            if (isResuming) {
                // Resume: only count scenes NOT processed today
                if (!hasBeenProcessedForBeats(triplet.current.frontmatter, { todayOnly: true })) {
                    totalToProcess++;
                }
            } else {
                // Initial: count all scenes
                totalToProcess++;
            }
        } else if (mode === 'unprocessed') {
            if (isResuming) {
                // Resume: only count scenes NOT processed today
                if (!hasBeenProcessedForBeats(triplet.current.frontmatter, { todayOnly: true })) {
                    totalToProcess++;
                }
            } else {
                // Initial: count scenes with no timestamp/beats
                if (!hasBeenProcessedForBeats(triplet.current.frontmatter)) {
                    totalToProcess++;
                }
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
        const beatsUpdateFlag = triplet.current.frontmatter?.beatsupdate ?? triplet.current.frontmatter?.BeatsUpdate ?? triplet.current.frontmatter?.['Beats Update'];
        const isFlagged = normalizeBooleanValue(beatsUpdateFlag);
        
        // Determine if we should process this scene based on mode AND resume state
        let shouldProcess = false;
        
        if (mode === 'flagged') {
            // Flagged mode: just check the flag (resume doesn't change this)
            shouldProcess = isFlagged;
        } else if (mode === 'force-all') {
            if (isResuming) {
                // Resume: skip scenes processed today
                shouldProcess = !hasBeenProcessedForBeats(triplet.current.frontmatter, { todayOnly: true });
            } else {
                // Initial: process everything
                shouldProcess = true;
            }
        } else if (mode === 'unprocessed') {
            if (isResuming) {
                // Resume: skip scenes processed today
                shouldProcess = !hasBeenProcessedForBeats(triplet.current.frontmatter, { todayOnly: true });
            } else {
                // Initial: skip scenes with any timestamp/beats
                shouldProcess = !hasBeenProcessedForBeats(triplet.current.frontmatter);
            }
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
            // Boundary cases: include neighbors if they exist in sequence, regardless of content status
            // This ensures proper triplet context for the LLM (first scene: N/A,1,2; last scene: N-1,N,N/A)
            const prevBody = triplet.prev ? triplet.prev.body : null;
            const currentBody = triplet.current.body;
            const nextBody = triplet.next ? triplet.next.body : null;
            const prevNum = triplet.prev ? String(triplet.prev.sceneNumber ?? 'N/A') : 'N/A';
            const currentNum = String(triplet.current.sceneNumber ?? 'N/A');
            const nextNum = triplet.next ? String(triplet.next.sceneNumber ?? 'N/A') : 'N/A';

            // Show runtime triplet in modal
            if (plugin.activeBeatsModal && typeof plugin.activeBeatsModal.setTripletInfo === 'function') {
                plugin.activeBeatsModal.setTripletInfo(prevNum, currentNum, nextNum);
            }

            const contextPrompt = getActiveContextPrompt(plugin);
            const userPrompt = buildSceneAnalysisPrompt(prevBody, currentBody, nextBody, prevNum, currentNum, nextNum, contextPrompt);

            // Pass triplet info directly to avoid regex parsing
            const tripletForLog = { prev: prevNum, current: currentNum, next: nextNum };
            const runAi = createAiRunner(plugin, vault, callAiProvider);
            const aiResult = await runAi(userPrompt, null, 'processByManuscriptOrder', sceneNameForLog, tripletForLog);

            if (aiResult.result) {
                const parsedAnalysis = parseGptResult(aiResult.result, plugin);
                if (parsedAnalysis) {
                    // Post-processing: for boundary cases, ensure only the expected sections are saved
                    if (!triplet.prev) {
                        // First-scene case: no previous scene, drop any previousSceneAnalysis content
                        parsedAnalysis['previousSceneAnalysis'] = '';
                    }
                    if (!triplet.next) {
                        // Last-scene case: no next scene, drop any nextSceneAnalysis content
                        parsedAnalysis['nextSceneAnalysis'] = '';
                    }
                    const updated = await updateSceneAnalysis(vault, triplet.current.file, parsedAnalysis, plugin, aiResult.modelIdUsed);
                    if (updated) {
                        await plugin.saveSettings();
                        // Ensure progress UI is consistent when abort requested after finishing this scene
                        modal.updateProgress(processedCount + 1, totalToProcess, sceneName);
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
        
        // Delay to stay under rate limits (skip delay if aborted to let modal finish immediately)
        // Anthropic Sonnet 4.x: 50 requests/minute = 1.2s minimum
        // Using 1.5s (40 req/min) to stay safely under the limit
        if (!modal.isAborted()) {
            await new Promise(resolve => window.setTimeout(resolve, 1500));
        }
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

        // Count only valid scenes with Status: working/complete for the total
        subplotNames.forEach(subplotName => {
            const scenes = scenesBySubplot[subplotName];
            scenes.sort(compareScenesByOrder);
            
            // Count only scenes with Status: working/complete and Beats Update: Yes
            const validScenes = scenes.filter(scene => {
                const beatsUpdate = scene.frontmatter?.beatsupdate || scene.frontmatter?.BeatsUpdate || scene.frontmatter?.['Beats Update'];

                if (normalizeBooleanValue(beatsUpdate) &&
                    !hasProcessableContent(scene.frontmatter)) {
                    const msg = `Scene ${scene.sceneNumber ?? scene.file.basename} (subplot ${subplotName}) has Beats Update: Yes/True but Status is not working/complete. Skipping.`;
                    // Surface to user via Notice; suppress console noise
                    new Notice(msg, 6000);
                }

                return hasProcessableContent(scene.frontmatter) && 
                       normalizeBooleanValue(beatsUpdate);
            });
            
            totalTripletsAcrossSubplots += validScenes.length;
        });

        notice.setMessage(`Analyzing ${totalTripletsAcrossSubplots} scenes for subplot order...`);

        for (const subplotName of subplotNames) {
             const scenes = scenesBySubplot[subplotName];
            scenes.sort(compareScenesByOrder);



        // Build contiguous triplets within this subplot by number (ignore Words),
        // but only process currents that have Status: working/complete and Beats Update: Yes
        const orderedScenes = scenes.slice().sort(compareScenesByOrder);
        
        // Filter to only scenes with processable content for triplet context
        const processableContentScenes = orderedScenes.filter(scene => hasProcessableContent(scene.frontmatter));
        
        const flaggedInOrder = orderedScenes.filter(s => hasProcessableContent(s.frontmatter) && normalizeBooleanValue(s.frontmatter?.beatsupdate || s.frontmatter?.BeatsUpdate || s.frontmatter?.['Beats Update']));
        const triplets = buildTripletsByIndex(processableContentScenes, flaggedInOrder, (s) => s.file.path);
        
            for (const triplet of triplets) {
                const currentScenePath = triplet.current.file.path;
                 const tripletIdentifier = `subplot-${subplotName}-${triplet.prev?.sceneNumber ?? 'Start'}-${triplet.current.sceneNumber}-${triplet.next?.sceneNumber ?? 'End'}`;

                 const beatsUpdateFlag = triplet.current.frontmatter?.beatsupdate ?? triplet.current.frontmatter?.['Beats Update'];
                 if (!normalizeBooleanValue(beatsUpdateFlag)) {
                     continue; // Skip to the next triplet if not flagged
                 }
                 
                 // We've already filtered scenes by Status: working/complete when building triplets,
                 // so no need to check again here.

                notice.setMessage(`Processing scene ${triplet.current.sceneNumber} (${totalProcessedCount+1}/${totalTripletsAcrossSubplots}) - Subplot: '${subplotName}'...`);
                 // Include neighbors if they exist in the subplot sequence, regardless of content status
                 const prevBody = triplet.prev ? triplet.prev.body : null;
                 const currentBody = triplet.current.body;
                 const nextBody = triplet.next ? triplet.next.body : null;
                 const prevNum = triplet.prev ? String(triplet.prev.sceneNumber ?? 'N/A') : 'N/A';
                 const currentNum = String(triplet.current.sceneNumber ?? 'N/A');
                 const nextNum = triplet.next ? String(triplet.next.sceneNumber ?? 'N/A') : 'N/A';

                 const contextPrompt = getActiveContextPrompt(plugin);
                 const userPrompt = buildSceneAnalysisPrompt(prevBody, currentBody, nextBody, prevNum, currentNum, nextNum, contextPrompt);

                 // Use basename directly (already includes scene number)
                 const sceneNameForLog = triplet.current.file.basename;
                 const runAi = createAiRunner(plugin, vault, callAiProvider);
                 const aiResult = await runAi(userPrompt, subplotName, 'processBySubplotOrder', sceneNameForLog);

                 if (aiResult.result) {
                     const parsedAnalysis = parseGptResult(aiResult.result, plugin);
                     if (parsedAnalysis) {
                         // Post-processing: for boundary cases, ensure only the expected sections are saved
                         if (!triplet.prev) {
                             // First-scene case: no previous scene, drop any 1beats content
                             parsedAnalysis['previousSceneAnalysis'] = '';
                         }
                         if (!triplet.next) {
                             // Last-scene case: no next scene, drop any 3beats content
                             parsedAnalysis['nextSceneAnalysis'] = '';
                         }
                         
                         const updated = await updateSceneAnalysis(vault, triplet.current.file, parsedAnalysis, plugin, aiResult.modelIdUsed);
                         if (updated) {
                             await plugin.saveSettings();
                         } else {
                         }
                     } else {
                     }
                 } else {
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

// Internal processing function for subplot that works with the modal
async function processSubplotWithModal(
    plugin: RadialTimelinePlugin,
    vault: Vault,
    subplotName: string,
    modal: SceneAnalysisProcessingModal
): Promise<void> {
    try {
        const allScenes = await getAllSceneData(plugin, vault);
        if (allScenes.length < 1) {
            throw new Error("No valid scenes found in the specified source path.");
        }

        // Filter scenes to only those containing the chosen subplot
        const filtered = allScenes.filter(scene => getSubplotNamesFromFM(scene.frontmatter).includes(subplotName));
        
        if (filtered.length === 0) {
            throw new Error(`No scenes found for subplot "${subplotName}".`);
        }

        // Sort by sceneNumber (if present)
        filtered.sort(compareScenesByOrder);

        // Consider only scenes with Status: working/complete and Beats Update: Yes
        const validScenes = filtered.filter(scene => {
            const beatsUpdate = (scene.frontmatter?.beatsupdate || scene.frontmatter?.BeatsUpdate || scene.frontmatter?.['Beats Update']) as unknown;
            return hasProcessableContent(scene.frontmatter)
                && normalizeBooleanValue(beatsUpdate);
        });

        if (validScenes.length === 0) {
            throw new Error(`No flagged scenes (Beats Update: Yes/True/1) with content found for "${subplotName}".`);
        }

        // Build triplets for flagged scenes using only processable content scenes for context
        const triplets: { prev: SceneData | null, current: SceneData, next: SceneData | null }[] = [];
        
        // Filter to only scenes with processable content (Status=Working or Complete) for context
        const processableContentScenes = filtered.filter(scene => hasProcessableContent(scene.frontmatter));
        
        // Only build triplets for scenes that are flagged for processing
        const flaggedScenes = validScenes; // Already filtered for Status: working/complete and BeatsUpdate: Yes
        
        for (const flaggedScene of flaggedScenes) {
            // Find this scene's position in the processable content list
            const idx = processableContentScenes.findIndex(s => s.file.path === flaggedScene.file.path);
            
            // Get prev/next from processable content list only (Status=Working or Complete)
            const prev = idx > 0 ? processableContentScenes[idx - 1] : null;
            const next = idx >= 0 && idx < processableContentScenes.length - 1 ? processableContentScenes[idx + 1] : null;
            
            triplets.push({ prev, current: flaggedScene, next });
        }

        let processedCount = 0;
        const total = triplets.length;

        // Process triplets
        for (const triplet of triplets) {
            // Check for abort signal
            if (modal.isAborted()) {
                await plugin.saveSettings();
                throw new Error('Processing aborted by user');
            }

            // Only process if the current scene is flagged
            const flag = (triplet.current.frontmatter?.beatsupdate || triplet.current.frontmatter?.BeatsUpdate || triplet.current.frontmatter?.['Beats Update']) as unknown;
            if (!normalizeBooleanValue(flag)) continue;

            const currentPath = triplet.current.file.path;
            const tripletIdentifier = `subplot-${subplotName}-${triplet.prev?.sceneNumber ?? 'Start'}-${triplet.current.sceneNumber}-${triplet.next?.sceneNumber ?? 'End'}`;

            // Update progress - use basename directly (already includes scene number)
            const sceneName = triplet.current.file.basename;
            modal.updateProgress(processedCount + 1, total, sceneName);

            // Include neighbors if they exist in the subplot sequence, regardless of content status
            const prevBody = triplet.prev ? triplet.prev.body : null;
            const currentBody = triplet.current.body;
            const nextBody = triplet.next ? triplet.next.body : null;
            const prevNum = triplet.prev ? String(triplet.prev.sceneNumber ?? 'N/A') : 'N/A';
            const currentNum = String(triplet.current.sceneNumber ?? 'N/A');
            const nextNum = triplet.next ? String(triplet.next.sceneNumber ?? 'N/A') : 'N/A';

            // Update triplet information in the modal to show subplot context
            if (modal && typeof modal.setTripletInfo === 'function') {
                modal.setTripletInfo(prevNum, currentNum, nextNum);
            } else {
            }

            const contextPrompt = getActiveContextPrompt(plugin);
            const userPrompt = buildSceneAnalysisPrompt(prevBody, currentBody, nextBody, prevNum, currentNum, nextNum, contextPrompt);
            
            // Use basename directly (already includes scene number)
            const sceneNameForLog = triplet.current.file.basename;
            
            // Pass triplet info directly to avoid regex parsing
            const tripletForLog = { prev: prevNum, current: currentNum, next: nextNum };
            const runAi = createAiRunner(plugin, vault, callAiProvider);
            const aiResult = await runAi(userPrompt, subplotName, 'processBySubplotOrder', sceneNameForLog, tripletForLog);

            if (aiResult.result) {
                const parsedAnalysis = parseGptResult(aiResult.result, plugin);
                if (parsedAnalysis) {
                    // Post-processing: for boundary cases, ensure only the expected sections are saved
                    if (!triplet.prev) {
                        // First-scene case: no previous scene, drop any previousSceneAnalysis content
                        parsedAnalysis['previousSceneAnalysis'] = '';
                    }
                    if (!triplet.next) {
                        // Last-scene case: no next scene, drop any nextSceneAnalysis content
                        parsedAnalysis['nextSceneAnalysis'] = '';
                    }

                    const success = await updateSceneFile(vault, triplet.current, parsedAnalysis, plugin, aiResult.modelIdUsed);
                    if (success) {
                        processedCount++;
                    } else {
                        modal.addError(`Failed to update file for scene ${triplet.current.sceneNumber}: ${currentPath}`);
                    }
                } else {
                    modal.addError(`Failed to parse AI response for scene ${triplet.current.sceneNumber}: ${currentPath}`);
                }
            } else {
                modal.addError(`AI processing failed for scene ${triplet.current.sceneNumber}: ${currentPath}`);
            }
        }

        await plugin.saveSettings();
    } catch (error) {
        throw error;
    }
}

// Process entire subplot (all scenes) for a single chosen subplot name with modal support
export async function processEntireSubplotWithModal(
    plugin: RadialTimelinePlugin,
    vault: Vault,
    subplotName: string,
    isResuming: boolean = false
): Promise<void> {
    // If there's already an active processing modal, just reopen it
    if (plugin.activeBeatsModal && plugin.activeBeatsModal.isProcessing) {
        plugin.activeBeatsModal.open();
        new Notice('Reopening active processing session...');
        return;
    }

    // Create a function to get scene count for the entire subplot
    const getSceneCount = async (): Promise<number> => {
        try {
            const allScenes = await getAllSceneData(plugin, vault);
            const filtered = allScenes.filter(scene => getSubplotNamesFromFM(scene.frontmatter).includes(subplotName));
            // Count all scenes with processable content (not just flagged ones)
            const validScenes = filtered.filter(scene => hasProcessableContent(scene.frontmatter));
            
            if (isResuming) {
                // Resume: only count scenes NOT processed today
                const unprocessedToday = validScenes.filter(scene => 
                    !hasBeenProcessedForBeats(scene.frontmatter, { todayOnly: true })
                );
                return unprocessedToday.length;
            } else {
                // Initial: count all scenes (entire subplot processes everything)
                return validScenes.length;
            }
        } catch (error) {
            return 0;
        }
    };

    // Create the modal with subplot-specific context
    const modal = new SceneAnalysisProcessingModal(
        plugin.app,
        plugin,
        getSceneCount,
        async () => {
            await processEntireSubplotWithModalInternal(plugin, vault, subplotName, modal, isResuming);
        },
        undefined, // no resumeCommandId for subplot processing
        subplotName, // pass subplot name for resume functionality
        true // isEntireSubplot = true
    );
    
    // Override the modal's onOpen to skip confirmation and start processing immediately
    const originalOnOpen = modal.onOpen.bind(modal);
    modal.onOpen = function() {
        // Show the modal first
        const { contentEl, titleEl } = this;
        titleEl.setText(`Processing entire subplot: ${subplotName}`);
        
        // Show progress view immediately (skip confirmation)
        this.showProgressView();
        
        // Start processing automatically
        this.isProcessing = true;
        this.abortController = new AbortController();
        
        // Notify plugin that processing has started
        plugin.activeBeatsModal = this;
        plugin.showBeatsStatusBar(0, 0);
        
        // Start the actual processing
        (async () => {
            try {
                await processEntireSubplotWithModalInternal(plugin, vault, subplotName, modal, isResuming);
                
                // Show appropriate summary
                if (this.abortController && this.abortController.signal.aborted) {
                    this.showCompletionSummary('Processing aborted by user or rate limit');
                } else {
                    this.showCompletionSummary('Processing completed successfully!');
                }
            } catch (error) {
                if (!this.abortController.signal.aborted) {
                    this.addError(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
                    this.showCompletionSummary('Processing stopped due to error');
                } else {
                    this.showCompletionSummary('Processing aborted by user or rate limit');
                }
            } finally {
                this.isProcessing = false;
                this.abortController = null;
                plugin.activeBeatsModal = null;
                plugin.hideBeatsStatusBar();
            }
        })();
    };
    
    modal.open();
}

// Internal processing function for entire subplot that works with the modal
async function processEntireSubplotWithModalInternal(
    plugin: RadialTimelinePlugin,
    vault: Vault,
    subplotName: string,
    modal: SceneAnalysisProcessingModal,
    isResuming: boolean = false
): Promise<void> {
    try {
        const allScenes = await getAllSceneData(plugin, vault);
        if (allScenes.length < 1) {
            throw new Error("No valid scenes found in the specified source path.");
        }

        // Filter scenes to only those containing the chosen subplot
        const filtered = allScenes.filter(scene => getSubplotNamesFromFM(scene.frontmatter).includes(subplotName));
        
        if (filtered.length === 0) {
            throw new Error(`No scenes found for subplot "${subplotName}".`);
        }

        // Sort by sceneNumber (if present)
        filtered.sort(compareScenesByOrder);

        // Process ALL scenes with processable content (not just flagged ones)
        const validScenes = filtered.filter(scene => hasProcessableContent(scene.frontmatter));

        if (validScenes.length === 0) {
            throw new Error(`No scenes with processable content found for "${subplotName}".`);
        }

        // Build triplets for ALL processable scenes
        const triplets: { prev: SceneData | null, current: SceneData, next: SceneData | null }[] = [];
        
        for (const currentScene of validScenes) {
            const currentIndex = validScenes.indexOf(currentScene);
            const prevScene = currentIndex > 0 ? validScenes[currentIndex - 1] : null;
            const nextScene = currentIndex < validScenes.length - 1 ? validScenes[currentIndex + 1] : null;
            
            triplets.push({
                prev: prevScene,
                current: currentScene,
                next: nextScene
            });
        }

        // Count scenes based on resume state
        let total: number;
        if (isResuming) {
            // Resume: only count scenes NOT processed today
            total = triplets.filter(t => !hasBeenProcessedForBeats(t.current.frontmatter, { todayOnly: true })).length;
        } else {
            // Initial: count all scenes (entire subplot processes everything)
            total = triplets.length;
        }
        let processedCount = 0;

        // Process triplets
        for (const triplet of triplets) {
            // Check for abort signal
            if (modal.isAborted()) {
                await plugin.saveSettings();
                throw new Error('Processing aborted by user');
            }

            const currentPath = triplet.current.file.path;
            const tripletIdentifier = `entire-subplot-${subplotName}-${triplet.prev?.sceneNumber ?? 'Start'}-${triplet.current.sceneNumber}-${triplet.next?.sceneNumber ?? 'End'}`;

            // Skip logic based on resume state
            if (isResuming) {
                // Resume: skip scenes processed today
                if (hasBeenProcessedForBeats(triplet.current.frontmatter, { todayOnly: true })) {
                    continue;
                }
            }
            // Initial run: process all scenes (no skipping)

            // Update progress - use basename directly (already includes scene number)
            const sceneName = triplet.current.file.basename;
            modal.updateProgress(processedCount + 1, total, sceneName);

            // Include neighbors if they exist in the subplot sequence
            const prevBody = triplet.prev ? triplet.prev.body : null;
            const currentBody = triplet.current.body;
            const nextBody = triplet.next ? triplet.next.body : null;
            const prevNum = triplet.prev ? String(triplet.prev.sceneNumber ?? 'N/A') : 'N/A';
            const currentNum = String(triplet.current.sceneNumber ?? 'N/A');
            const nextNum = triplet.next ? String(triplet.next.sceneNumber ?? 'N/A') : 'N/A';

            // Update triplet information in the modal to show subplot context
            if (modal && typeof modal.setTripletInfo === 'function') {
                modal.setTripletInfo(prevNum, currentNum, nextNum);
            } else {
            }

            const contextPrompt = getActiveContextPrompt(plugin);
            const userPrompt = buildSceneAnalysisPrompt(prevBody, currentBody, nextBody, prevNum, currentNum, nextNum, contextPrompt);

            const sceneNameForLog = triplet.current.file.basename;
            const tripletForLog = { prev: prevNum, current: currentNum, next: nextNum };
            const runAi = createAiRunner(plugin, vault, callAiProvider);
            const aiResult = await runAi(userPrompt, subplotName, 'processEntireSubplot', sceneNameForLog, tripletForLog);

            if (aiResult.result) {
                const parsedAnalysis = parseGptResult(aiResult.result, plugin);
                if (parsedAnalysis) {
                    // Post-processing: for boundary cases, ensure only the expected sections are saved
                    if (!triplet.prev) {
                        // First-scene case: no previous scene, drop any previousSceneAnalysis content
                        parsedAnalysis['previousSceneAnalysis'] = '';
                    }
                    if (!triplet.next) {
                        // Last-scene case: no next scene, drop any nextSceneAnalysis content
                        parsedAnalysis['nextSceneAnalysis'] = '';
                    }

                    const success = await updateSceneFile(vault, triplet.current, parsedAnalysis, plugin, aiResult.modelIdUsed);
                    if (success) {
                        processedCount++;
                    } else {
                        modal.addError(`Failed to update file for scene ${triplet.current.sceneNumber}: ${currentPath}`);
                    }
                } else {
                    modal.addError(`Failed to parse AI response for scene ${triplet.current.sceneNumber}: ${currentPath}`);
                }
            } else {
                modal.addError(`AI processing failed for scene ${triplet.current.sceneNumber}: ${currentPath}`);
            }
        }

        await plugin.saveSettings();
    } catch (error) {
        throw error;
    }
}

// Process flagged beats for a single chosen subplot name with modal support
export async function processBySubplotNameWithModal(
    plugin: RadialTimelinePlugin,
    vault: Vault,
    subplotName: string
): Promise<void> {
    // If there's already an active processing modal, just reopen it
    if (plugin.activeBeatsModal && plugin.activeBeatsModal.isProcessing) {
        plugin.activeBeatsModal.open();
        new Notice('Reopening active processing session...');
        return;
    }

    // Create a function to get scene count for the subplot
    const getSceneCount = async (): Promise<number> => {
        try {
            const allScenes = await getAllSceneData(plugin, vault);
            const filtered = allScenes.filter(scene => getSubplotNamesFromFM(scene.frontmatter).includes(subplotName));
            const validScenes = filtered.filter(scene => {
                const beatsUpdate = (scene.frontmatter?.beatsupdate || scene.frontmatter?.BeatsUpdate || scene.frontmatter?.['Beats Update']) as unknown;
                return hasProcessableContent(scene.frontmatter) && normalizeBooleanValue(beatsUpdate);
            });
            return validScenes.length;
        } catch (error) {
            return 0;
        }
    };

    // Create the modal with subplot-specific context
    const modal = new SceneAnalysisProcessingModal(
        plugin.app,
        plugin,
        getSceneCount,
        async () => {
            await processSubplotWithModal(plugin, vault, subplotName, modal);
        },
        undefined, // no resumeCommandId for subplot processing
        subplotName, // pass subplot name for resume functionality
        false // isEntireSubplot = false (flagged scenes only)
    );
    
    // Override the modal's onOpen to skip confirmation and start processing immediately
    const originalOnOpen = modal.onOpen.bind(modal);
    modal.onOpen = function() {
        // Show the modal first
        const { contentEl, titleEl } = this;
        titleEl.setText(`Processing subplot: ${subplotName}`);
        
        // Show progress view immediately (skip confirmation)
        this.showProgressView();
        
        // Start processing automatically
        this.isProcessing = true;
        this.abortController = new AbortController();
        
        // Notify plugin that processing has started
        plugin.activeBeatsModal = this;
        plugin.showBeatsStatusBar(0, 0);
        
        // Start the actual processing
        (async () => {
            try {
                await processSubplotWithModal(plugin, vault, subplotName, modal);
                
                // Show appropriate summary
                if (this.abortController && this.abortController.signal.aborted) {
                    this.showCompletionSummary('Processing aborted by user or rate limit');
                } else {
                    this.showCompletionSummary('Processing completed successfully!');
                }
            } catch (error) {
                if (!this.abortController.signal.aborted) {
                    this.addError(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
                    this.showCompletionSummary('Processing stopped due to error');
                } else {
                    this.showCompletionSummary('Processing aborted by user or rate limit');
                }
            } finally {
                this.isProcessing = false;
                this.abortController = null;
                plugin.activeBeatsModal = null;
                plugin.hideBeatsStatusBar();
            }
        })();
    };
    
    modal.open();
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
const DUMMY_API_RESPONSE = `previousSceneAnalysis:
 - 33.2 Trisan Inner Turmoil - / Lacks clarity
 - Chae Ban Hesitation ? / Uncertain decision
 - Entiat Reflection ? / Needs clearer link: should explore motive
 - Chae Ban Plan + / Strengthens connection to currentSceneAnalysis choices
 - Meeting Entiat + / Sets up tension
currentSceneAnalysis:
 - 33.5 B / Scene will be stronger by making Entiat motivations clearer. Clarify: imminent threat
 - Entiat Adoption Reflections ? / Lacks tension link to events in previousSceneAnalysis
 - Chae Ban Escape News + / Advances plot
 - Entiat Internal Conflict + / Highlights dilemma: how to handle the situation from previousSceneAnalysis
 - Connection to nextSceneAnalysis + / Sets up the coming conflict
nextSceneAnalysis:
 - 34 Teco Routine Disruption - / Needs purpose
 - Entiat Unexpected Visit ? / Confusing motivation: clarify intention here
 - Sasha Defense and Defeat + / Builds on tension from currentSceneAnalysis
 - Teco Escape Decision + / Strong transition
 - Final Choice + / Resolves arc started in previousSceneAnalysis`;

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
        'Beats Update': "Yes"
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

        const parsedAnalysis = parseGptResult(DUMMY_API_RESPONSE, plugin);
        if (!parsedAnalysis) {
            new Notice('Error: Failed to parse dummy API response data.');
            return;
        }

        const success = await updateSceneFile(vault, dummySceneData, parsedAnalysis, plugin, null);

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
        
        // Find an available filename by incrementing the number
        let sceneNumber = 1;
        let targetPath = buildInitialSceneFilename(folderPath, `${sceneNumber} Template Scene.md`);
        
        // Keep incrementing until we find a filename that doesn't exist
        while (vault.getAbstractFileByPath(targetPath)) {
            sceneNumber++;
            targetPath = buildInitialSceneFilename(folderPath, `${sceneNumber} Template Scene.md`);
        }

        const frontmatter = {
            Class: 'Scene',
            Act: 1,
            When: isoDate,
            Duration: '2 hours',
            Synopsis: 'Write a one-sentence summary of this scene.',
            Status: 'Todo',
            Subplot: ['Main Plot', 'Romance Arc'],
            Character: ['Protagonist', 'Mentor'],
            Place: '',
            Due: isoDate,
            'Publish Stage': 'Zero',
            Revision: 0,
            'Pending Edits': '',
            Words: 0,
            Book: '',
            'Beats Update': ''
        } as Record<string, unknown>;

        const body = '\nWrite your scene here. Fill in Character and Subplot fields as needed. Use array format for multiple items.';
        const content = `---\n${stringifyYaml(frontmatter)}---\n${body}\n`;

        await vault.create(targetPath, content);
        new Notice(`Created template scene: ${targetPath}`);
        // Open the new file using openLinkText (prevents duplicate tabs)
        await openOrRevealFileByPath(plugin.app, targetPath, false);
    } catch (e) {
        console.error('[createTemplateScene] Failed:', e);
        new Notice('Failed to create template scene. Check console for details.');
    }
}

/**
 * Confirmation modal for purging beats
 */
class PurgeConfirmationModal extends Modal {
    private readonly message: string;
    private readonly details: string[];
    private readonly onConfirm: () => void;
    
    constructor(app: App, message: string, details: string[], onConfirm: () => void) {
        super(app);
        this.message = message;
        this.details = details;
        this.onConfirm = onConfirm;
    }
    
    onOpen(): void {
        const { contentEl, titleEl } = this;
        titleEl.setText('Confirm purge beats');
        
        // Warning message
        const messageEl = contentEl.createDiv({ cls: 'rt-purge-message' });
        messageEl.setText(this.message);
        
        // Details list
        const detailsEl = contentEl.createDiv({ cls: 'rt-purge-details' });
        detailsEl.createEl('strong', { text: 'This will permanently delete:' });
        const listEl = detailsEl.createEl('ul');
        this.details.forEach(detail => {
            listEl.createEl('li', { text: detail });
        });
        
        // Warning text
        const warningEl = contentEl.createDiv({ cls: 'rt-purge-warning' });
        warningEl.createEl('strong', { text: 'This cannot be undone. Continue?' });
        
        // Action buttons
        const buttonRow = contentEl.createDiv({ cls: 'rt-beats-actions' });
        
        new ButtonComponent(buttonRow)
            .setButtonText('Purge beats')
            .setWarning()
            .onClick(() => {
                this.close();
                this.onConfirm();
            });
        
        new ButtonComponent(buttonRow)
            .setButtonText('Cancel')
            .onClick(() => this.close());
    }
}

/**
 * Helper function to purge beats from a scene's frontmatter
 */
async function purgeScenesBeats(
    plugin: RadialTimelinePlugin,
    vault: Vault,
    scenes: SceneData[]
): Promise<number> {
    let purgedCount = 0;
    
    for (const scene of scenes) {
        try {
            await plugin.app.fileManager.processFrontMatter(scene.file, (fm) => {
                const fmObj = fm as Record<string, unknown>;
                
                // Remove beats fields
                const hadPreviousAnalysis = fmObj['previousSceneAnalysis'] !== undefined;
                const hadCurrentAnalysis = fmObj['currentSceneAnalysis'] !== undefined;
                const hadNextAnalysis = fmObj['nextSceneAnalysis'] !== undefined;
                const hadBeatsLastUpdated = fmObj['Beats Last Updated'] !== undefined;
                
                delete fmObj['previousSceneAnalysis'];
                delete fmObj['currentSceneAnalysis'];
                delete fmObj['nextSceneAnalysis'];
                delete fmObj['Beats Last Updated'];
                
                // Only count as purged if it actually had analysis
                if (hadPreviousAnalysis || hadCurrentAnalysis || hadNextAnalysis || hadBeatsLastUpdated) {
                    purgedCount++;
                }
            });
        } catch (error) {
            console.error(`[purgeScenesBeats] Error purging beats from ${scene.file.path}:`, error);
        }
    }
    
    return purgedCount;
}

/**
 * Purge all beats from all scenes in manuscript order
 */
export async function purgeBeatsByManuscriptOrder(
    plugin: RadialTimelinePlugin,
    vault: Vault
): Promise<void> {
    try {
        const allScenes = await getAllSceneData(plugin, vault);
        
        if (allScenes.length === 0) {
            new Notice('No scenes found in manuscript.');
            return;
        }
        
        // Show themed confirmation modal
        const modal = new PurgeConfirmationModal(
            plugin.app,
            `Purge ALL beats from ${allScenes.length} scene${allScenes.length !== 1 ? 's' : ''} in your manuscript?`,
            [
                'previousSceneAnalysis, currentSceneAnalysis, nextSceneAnalysis fields',
                'Beats Last Updated timestamps'
            ],
            async () => {
                const notice = new Notice('Purging beats from all scenes...', 0);
                const purgedCount = await purgeScenesBeats(plugin, vault, allScenes);
                
                notice.hide();
                await plugin.saveSettings();
                plugin.refreshTimelineIfNeeded(null);
                
                new Notice(`Purged beats from ${purgedCount} of ${allScenes.length} scene${allScenes.length !== 1 ? 's' : ''}.`);
            }
        );
        
        modal.open();
    } catch (error) {
        console.error('[purgeBeatsByManuscriptOrder] Error:', error);
        new Notice('Error purging beats. Check console for details.');
    }
}

/**
 * Purge beats from scenes in a specific subplot
 */
export async function purgeBeatsBySubplotName(
    plugin: RadialTimelinePlugin,
    vault: Vault,
    subplotName: string
): Promise<void> {
    try {
        const allScenes = await getAllSceneData(plugin, vault);
        
        // Filter scenes to only those containing the chosen subplot
        const filtered = allScenes.filter(scene => 
            getSubplotNamesFromFM(scene.frontmatter).includes(subplotName)
        );
        
        if (filtered.length === 0) {
            new Notice(`No scenes found for subplot "${subplotName}".`);
            return;
        }
        
        // Show themed confirmation modal
        const modal = new PurgeConfirmationModal(
            plugin.app,
            `Purge beats from ${filtered.length} scene${filtered.length !== 1 ? 's' : ''} in subplot "${subplotName}"?`,
            [
                'previousSceneAnalysis, currentSceneAnalysis, nextSceneAnalysis fields',
                'Beats Last Updated timestamps'
            ],
            async () => {
                const notice = new Notice(`Purging beats from "${subplotName}"...`, 0);
                const purgedCount = await purgeScenesBeats(plugin, vault, filtered);
                
                notice.hide();
                await plugin.saveSettings();
                plugin.refreshTimelineIfNeeded(null);
                
                new Notice(`Purged beats from ${purgedCount} of ${filtered.length} scene${filtered.length !== 1 ? 's' : ''} in subplot "${subplotName}".`);
            }
        );
        
        modal.open();
    } catch (error) {
        console.error(`[purgeBeatsBySubplotName] Error purging subplot "${subplotName}":`, error);
        new Notice(`Error purging beats from "${subplotName}". Check console for details.`);
    }
}
