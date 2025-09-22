import RadialTimelinePlugin from './main'; 
import { App, TFile, Vault, Notice, parseYaml, getFrontMatterInfo, stringifyYaml } from "obsidian";
import { callAnthropicApi, AnthropicApiResponse } from './api/anthropicApi';
import { callOpenAiApi, OpenAiApiResponse } from './api/openaiApi';
import { callGeminiApi, GeminiApiResponse } from './api/geminiApi';

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

            return { file, frontmatter, sceneNumber, body };

        } catch (e) {

            return null; // Skip file on read error
        }
    });

    const results = await Promise.all(sceneDataPromises);
    const validScenes = results.filter((item): item is SceneData => item !== null);



    return validScenes;
}

function buildPrompt(prevBody: string | null, currentBody: string, nextBody: string | null, prevNum: string, currentNum: string, nextNum: string): string {
    return `You are a developmental editor for a novel.

For each of the three scenes below, generate concise 5 ordered narrative beats from the perspective of the 2beats (middle scene) showing the connections between the 1beats (previous scene) and the 3beats (next scene) and if 2beats is maintaining the momentum of the story. For the first line of the 2beats, give an overall editorial score of A, B or C where A nearly perfect and C needs improvement with instructions on how to improve it.

Use the following exact format (to be processed by a script for YAML formatting):

1beats: 
 - ${prevNum} Use a short beat title + or - or ? / Short comment under 10 words
 - Follow-up beat title + or - or ? / Short comment under 10 words 
 - ...
2beats:
 - ${currentNum} A, B or C / Instructions on how to improve it no more than 15 words.
 - Follow-up beat title + or - or ? / Concise editorial comment under 10 words
 - ...
3beats:
 - ${nextNum} Use a Short beat title + or - or ? / Concise editorial comment under 10 words
 - Follow-up beat title + or - or ? / Concise editorial comment under 10 words
 - ...

Instructions:
- Use "+" for beats that connect strongly to surrounding scenes.
- Use "-" for beats that need improvement.
- Use "?" if the beat is neutral.
- Include the scene number (example: 34.5) only for the first item in each beats section.
- For 2beats (scene under evaluation), apply a rating of A, B or C / Concise editorial comment under 10 words with instructions on how to fix scene.
- Boundary conditions:
  - If previous scene is "N/A", leave 1beats empty (no lines).
  - If next scene is "N/A", leave 3beats empty (no lines).
  - Do not invent beats for missing scenes.
- Follow the exact indentation shown (single space before each dash).
- No other formatting so the YAML formatting is not broken.

Scene ${prevNum}:
${prevBody ?? 'N/A'}

Scene ${currentNum}:
${currentBody || 'N/A'}

Scene ${nextNum}:
${nextBody ?? 'N/A'}
`;
}

async function logApiInteractionToFile(
    plugin: RadialTimelinePlugin,
    vault: Vault,
    provider: 'openai' | 'anthropic' | 'gemini',
    modelId: string,
    requestData: unknown, // Keep as unknown initially
    responseData: unknown,
    subplotName: string | null,
    commandContext: string
): Promise<void> {
    if (!plugin.settings.logApiInteractions) {
        return;
    }

    const logFolder = "AI";
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${provider}-log-${timestamp}.md`;
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
            if (mid.includes('claude-opus-4-1')) return 'Opus 4.1';
            if (mid.includes('claude-sonnet-4-')) return 'Sonnet 4';
        } else if (provider === 'gemini') {
            if (mid === 'gemini-2.5-pro') return 'Gemini 2.5 Pro';
        } else if (provider === 'openai') {
            if (mid === 'gpt-4.1') return 'GPT‑4.1';
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

    const providerTitle = provider.charAt(0).toUpperCase() + provider.slice(1);
    let fileContent = `# ${providerTitle} — ${friendlyModel} API Interaction Log\n\n`;
    fileContent += `**Command:** ${commandContext}\n`;
    fileContent += `**Provider:** ${provider}\n`;
    fileContent += `**Model:** ${friendlyModel}\n`;
    fileContent += `**Model ID:** ${modelId}\n`;
    fileContent += `**Timestamp:** ${new Date().toISOString()}\n`;
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
    // Build scenes summary and redacted prompt
    const scenesSummary = extractScenesSummary(fullUserPrompt);
    const scenesLine = `**Scenes:** prev=${scenesSummary.prev ?? 'N/A'}, current=${scenesSummary.current ?? 'N/A'}, next=${scenesSummary.next ?? 'N/A'}`;
    fileContent += `${scenesLine}\n`;

    const redactPrompt = (text: string | undefined): string => {
        if (!text) return 'Unavailable';
        // Keep full instructions; strip bodies — keep only Scene headers and blank lines
        const lines = text.split(/\r?\n/);
        const headerRe = /^\s*Scene\s+[^:]+:\s*$/i;
        const out: string[] = [];
        let inScenes = false;
        for (const line of lines) {
            if (!inScenes) {
                out.push(line);
                if (headerRe.test(line)) inScenes = true;
            } else {
                if (headerRe.test(line) || line.trim() === '') out.push(line.trim() === '' ? '' : line);
            }
        }
        return out.join('\n');
    };
    userPromptContent = redactPrompt(fullUserPrompt);
    fileContent += `## Prompt Template\n\n\\\`\\\`\\\`\n${userPromptContent}\n\\\`\\\`\\\`\n\n`;

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
        fileContent += `## System Prompt Used\n\n\\\`\\\`\\\`\n${systemPromptContent}\n\\\`\\\`\\\`\n\n`;
    }

    // Full request with instructions + scene text
    fileContent += `## Request Sent\n\n`;
    fileContent += `\\\`\\\`\\\`json\n${requestJson}\n\\\`\\\`\\\`\n\n`;

    // Response (raw JSON)
    fileContent += `## Response Received (Full JSON)\n\n`;
    fileContent += `\\\`\\\`\\\`json\n${responseJson}\n\\\`\\\`\\\`\n`;

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

async function callAiProvider(
    plugin: RadialTimelinePlugin,
    vault: Vault,
    userPrompt: string,
    subplotName: string | null,
    commandContext: string
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
    

            const apiResponse: AnthropicApiResponse = await callAnthropicApi(apiKey, modelId, null, userPrompt, 4000);

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

            const apiResponse: GeminiApiResponse = await callGeminiApi(apiKey, modelId, null, userPrompt, 4000, 0.7);

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
    

            const apiResponse: OpenAiApiResponse = await callOpenAiApi(apiKey, modelId, null, userPrompt, 4000, 0.7);

            responseDataForLog = apiResponse.responseData;

            if (!apiResponse.success) {
                apiErrorMsg = apiResponse.error;
                throw new Error(apiErrorMsg || `OpenAI API call failed.`);
            }
            result = apiResponse.content;
        }

    
        await logApiInteractionToFile(plugin, vault, provider, modelId || 'unknown', requestBodyForLog, responseDataForLog, subplotName, commandContext);
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

        await logApiInteractionToFile(plugin, vault, currentProvider, modelId || 'unknown', requestBodyForLog, responseDataForLog, subplotName, commandContext);

        new Notice(`❌ ${errorMessage}`);

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
            new Notice('❌ Failed to parse expected 1beats/2beats/3beats structure.');
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
             new Notice('❌ GPT response parsed but contained no usable beat content.');
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
            // Do NOT overwrite BeatsUpdate (used as a Yes/No flag for processing).
            const timestamp = new Date().toISOString();
            const updatedValue = `${timestamp}${modelIdUsed ? ` by ${modelIdUsed}` : ' by Unknown Model'}`;
            fmObj['BeatsLastUpdated'] = updatedValue;

            // After a successful update, turn the processing flag off
            if (Object.prototype.hasOwnProperty.call(fmObj, 'BeatsUpdate')) {
                fmObj['BeatsUpdate'] = 'No';
            } else if (Object.prototype.hasOwnProperty.call(fmObj, 'beatsupdate')) {
                fmObj['beatsupdate'] = 'no';
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
        new Notice(`❌ Error saving updates to ${scene.file.basename}`);
        return false;
    }
}

export async function processByManuscriptOrder(
    plugin: RadialTimelinePlugin,
    vault: Vault
): Promise<void> {

    const notice = new Notice("Processing Manuscript Order: Getting scene data...", 0);

    try {
    const allScenes = await getAllSceneData(plugin, vault);
        allScenes.sort((a, b) => (a.sceneNumber ?? Infinity) - (b.sceneNumber ?? Infinity));

        if (allScenes.length < 1) {
            new Notice("No valid scenes found in the specified source path.");
            notice.hide();
        return;
    }

        // Filter scenes with content (Words > 0)
        const writtenScenes = allScenes.filter(scene => {
            const words = scene.frontmatter?.words || scene.frontmatter?.Words;
            const beatsFlag = scene.frontmatter?.beatsupdate || scene.frontmatter?.BeatsUpdate;

            // Warn if user requested update but scene has no word count
            if ((typeof beatsFlag === 'string' && beatsFlag.toLowerCase() === 'yes') &&
                (!(typeof words === 'number') || words <= 0)) {
                const msg = `⚠️ Scene ${scene.sceneNumber ?? scene.file.basename} has BeatsUpdate: Yes but 0 words. Skipping.`;
                // Surface to user via Notice; suppress console noise
                new Notice(msg, 6000);
            }

            return (typeof words === 'number' && words > 0);
        });



        const triplets: { prev: SceneData | null, current: SceneData, next: SceneData | null }[] = [];
        for (let i = 0; i < writtenScenes.length; i++) {
            triplets.push({
                prev: i > 0 ? writtenScenes[i - 1] : null,
                current: writtenScenes[i],
                next: i < writtenScenes.length - 1 ? writtenScenes[i + 1] : null
            });
        }

        let processedCount = 0;
        const totalTriplets = triplets.length;
        notice.setMessage(`Analyzing ${totalTriplets} scenes in manuscript order...`);

        for (const triplet of triplets) {
            const currentScenePath = triplet.current.file.path;
            const tripletIdentifier = `${triplet.prev?.sceneNumber ?? 'Start'}-${triplet.current.sceneNumber}-${triplet.next?.sceneNumber ?? 'End'}`;

            // <<< ADDED: Check for BeatsUpdate flag before cache check >>>
            const beatsUpdateFlag = triplet.current.frontmatter?.beatsupdate ?? triplet.current.frontmatter?.BeatsUpdate;
            if (typeof beatsUpdateFlag !== 'string' || beatsUpdateFlag.toLowerCase() !== 'yes') {

                // We don't increment processedCount here, as we only count actual attempts/cache hits
                continue; // Skip to the next triplet if not flagged
            }
            
            // We've already filtered scenes by Words > 0 when building triplets,
            // so no need to check again here.

            // Check cache *after* confirming the scene is flagged for update
            if (plugin.settings.processedBeatContexts.includes(tripletIdentifier)) {
 
                 processedCount++;
                 notice.setMessage(`Progress: ${processedCount}/${totalTriplets} scenes (Skipped - Already processed)`);
            continue;
        }

            notice.setMessage(`Processing scene ${triplet.current.sceneNumber} (${processedCount+1}/${totalTriplets})...`);
            if (plugin.settings.debug) {
            }

            const prevBody = triplet.prev ? triplet.prev.body : null;
            const currentBody = triplet.current.body;
            const nextBody = triplet.next ? triplet.next.body : null;
            const prevNum = triplet.prev ? String(triplet.prev.sceneNumber ?? 'N/A') : 'N/A';
            const currentNum = String(triplet.current.sceneNumber ?? 'N/A');
            const nextNum = triplet.next ? String(triplet.next.sceneNumber ?? 'N/A') : 'N/A';

            const userPrompt = buildPrompt(prevBody, currentBody, nextBody, prevNum, currentNum, nextNum);

            const aiResult = await callAiProvider(plugin, vault, userPrompt, null, 'processByManuscriptOrder');

            if (aiResult.result) {
                const parsedBeats = parseGptResult(aiResult.result, plugin);
                if (parsedBeats) {
                    const updated = await updateSceneFile(vault, triplet.current, parsedBeats, plugin, aiResult.modelIdUsed);
                    if (updated) {
                         plugin.settings.processedBeatContexts.push(tripletIdentifier);
                         await plugin.saveSettings();
                    } else {
                        plugin.log(`[API Beats][processByManuscriptOrder] Failed to update file after getting beats for: ${currentScenePath}`);
                    }
                } else {
                    plugin.log(`[API Beats][processByManuscriptOrder] Failed to parse AI result for: ${currentScenePath}`);
                }
            } else {
                plugin.log(`[API Beats][processByManuscriptOrder] No result from AI for: ${currentScenePath}`);
            }

            processedCount++;
            notice.setMessage(`Progress: ${processedCount}/${totalTriplets} scenes processed...`);
            await new Promise(resolve => setTimeout(resolve, 200));
        }

            await plugin.saveSettings();

        notice.hide();
        new Notice(`✅ Manuscript Order Processing Complete: ${processedCount}/${totalTriplets} triplets processed.`);
        plugin.refreshTimelineIfNeeded(null);

    } catch (error) {
        console.error("[API Beats][processByManuscriptOrder] Error during processing:", error);
        notice.hide();
        new Notice("❌ Error processing manuscript order. Check console for details.");
    }
}

export async function processBySubplotOrder(
    plugin: RadialTimelinePlugin,
    vault: Vault
): Promise<void> {
     
     const notice = new Notice("Processing Subplots: Getting scene data...", 0);

    try {
    const allScenes = await getAllSceneData(plugin, vault);
         if (allScenes.length < 1) {
             new Notice("No valid scenes found in the specified source path.");
              notice.hide();
        return;
    }

        const scenesBySubplot: Record<string, SceneData[]> = {};
    allScenes.forEach(scene => {
            const subplots = scene.frontmatter?.subplot || scene.frontmatter?.Subplot;
            let subplotList: string[] = [];
            if (typeof subplots === 'string') {
                subplotList = [subplots.trim()];
            } else if (Array.isArray(subplots)) {
                subplotList = subplots.map(s => String(s).trim()).filter(s => s);
        }
        
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
            scenes.sort((a, b) => (a.sceneNumber ?? Infinity) - (b.sceneNumber ?? Infinity));
            
            // Count only scenes with words > 0 and BeatsUpdate: Yes
            const validScenes = scenes.filter(scene => {
                const words = scene.frontmatter?.words || scene.frontmatter?.Words;
                const beatsUpdate = scene.frontmatter?.beatsupdate || scene.frontmatter?.BeatsUpdate;

                if ((typeof beatsUpdate === 'string' && beatsUpdate.toLowerCase() === 'yes') &&
                    (!(typeof words === 'number') || words <= 0)) {
                    const msg = `⚠️ Scene ${scene.sceneNumber ?? scene.file.basename} (subplot ${subplotName}) has BeatsUpdate: Yes but 0 words. Skipping.`;
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
             scenes.sort((a, b) => (a.sceneNumber ?? Infinity) - (b.sceneNumber ?? Infinity));



            // Build triplets but ensure we handle unwritten scenes properly
            const triplets: { prev: SceneData | null, current: SceneData, next: SceneData | null }[] = [];
            
            // Filter scenes that actually have content worth analyzing
            const writtenScenes = scenes.filter(scene => {
                const words = scene.frontmatter?.words || scene.frontmatter?.Words;
                return (typeof words === 'number' && words > 0);
            });
            
            if (plugin.settings.debug) {
            }
            
            // For each written scene, find its appropriate prev and next
            for (let i = 0; i < writtenScenes.length; i++) {
                const currentScene = writtenScenes[i];
                
                // Find previous written scene (if any)
                let prevScene: SceneData | null = null;
                if (i > 0) {
                    prevScene = writtenScenes[i - 1];
                }
                
                // Find next written scene (if any)
                let nextScene: SceneData | null = null;
                if (i < writtenScenes.length - 1) {
                    nextScene = writtenScenes[i + 1];
                }
                
                triplets.push({
                    prev: prevScene,
                    current: currentScene,
                    next: nextScene
                });
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

                 const prevBody = triplet.prev ? triplet.prev.body : null;
                 const currentBody = triplet.current.body;
                 const nextBody = triplet.next ? triplet.next.body : null;
                 const prevNum = triplet.prev ? String(triplet.prev.sceneNumber ?? 'N/A') : 'N/A';
                 const currentNum = String(triplet.current.sceneNumber ?? 'N/A');
                 const nextNum = triplet.next ? String(triplet.next.sceneNumber ?? 'N/A') : 'N/A';

                 const userPrompt = buildPrompt(prevBody, currentBody, nextBody, prevNum, currentNum, nextNum);

                 const aiResult = await callAiProvider(plugin, vault, userPrompt, subplotName, 'processBySubplotOrder');

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
                 await new Promise(resolve => setTimeout(resolve, 200));
             }
         }

                 await plugin.saveSettings();

        notice.hide();
         new Notice(`✅ Subplot Order Processing Complete: ${totalProcessedCount}/${totalTripletsAcrossSubplots} triplets processed.`);
         plugin.refreshTimelineIfNeeded(null);

     } catch (error) {
         console.error("[API Beats][processBySubplotOrder] Error during processing:", error);
         notice.hide();
         new Notice("❌ Error processing subplots. Check console for details.");
     }
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
        let fileExists = await vault.adapter.exists(dummyFilePath);
        if (!fileExists) {
            new Notice(`Creating dummy file: ${dummyFilePath}`);
            const initialContent = `---\n${stringifyYaml(dummyInitialFrontmatter)}---\n${dummyBody}`;
            await vault.create(dummyFilePath, initialContent);
        }

        const file = vault.getAbstractFileByPath(dummyFilePath);
        if (!(file instanceof TFile)) {
            new Notice(`Error: Could not get TFile for ${dummyFilePath}`);
            return;
        }
        const currentContent = await vault.read(file);
        const currentFrontmatterMatch = currentContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (!currentFrontmatterMatch) {
            new Notice(`Error: Dummy file ${dummyFilePath} is missing frontmatter.`);
            return;
        }
        const currentFrontmatter = parseYaml(currentFrontmatterMatch[1]) || {};
        const currentBody = currentContent.replace(/^---[\s\S]*?\n---/, "").trim();

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
