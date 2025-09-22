import RadialTimelinePlugin from './main'; 
import { App, TFile, Vault, Notice, parseYaml, stringifyYaml } from "obsidian";
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
            const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
            if (!frontmatterMatch) {

                return null;
            }

            let frontmatter: Record<string, unknown> = {};
            try {
                frontmatter = parseYaml(frontmatterMatch[1]) || {};
            } catch (e) {

                return null; // Skip files with invalid YAML
            }

            const fileClass = frontmatter?.Class || frontmatter?.class;
            if (typeof fileClass !== 'string' || fileClass.toLowerCase() !== 'scene') {
                const foundClass = fileClass ? `'${fileClass}'` : 'Not found';

                return null; // Skip if not Class: Scene
            }



            const sceneNumber = extractSceneNumber(file.name);
            const body = content.replace(/^---[\s\S]*?\n---/, "").trim();

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
    return `You are a developmental editor for a sci-fi BioPunk novel.

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
- Follow the exact indentation shown (single space before each dash).
- No other formatting so the YAML formatting is not broken.

Scene ${prevNum}:
${prevBody || 'N/A'}

Scene ${currentNum}:
${currentBody || 'N/A'}

Scene ${nextNum}:
${nextBody || 'N/A'}
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
            if (provider === 'openai' && (responseData as any).usage) {
                const u = (responseData as any).usage;
                if (typeof u.prompt_tokens === 'number' || typeof u.completion_tokens === 'number') {
                    usageString = `**Usage (OpenAI):** prompt=${u.prompt_tokens ?? 'n/a'}, output=${u.completion_tokens ?? 'n/a'}`;
                }
            } else if (provider === 'anthropic' && (responseData as any).usage) {
                const u = (responseData as any).usage;
                if (typeof u.input_tokens === 'number' || typeof u.output_tokens === 'number') {
                    usageString = `**Usage (Anthropic):** input=${u.input_tokens ?? 'n/a'}, output=${u.output_tokens ?? 'n/a'}`;
                }
            } else if (provider === 'gemini' && (responseData as any).usageMetadata) {
                const u = (responseData as any).usageMetadata;
                usageString = `**Usage (Gemini):** total=${u.totalTokenCount ?? 'n/a'}, prompt=${u.promptTokenCount ?? 'n/a'}, output=${u.candidatesTokenCount ?? 'n/a'}`;
            }
        }
    } catch {}

    let outcomeSection = "## Outcome\n\n";
    if (responseData && typeof responseData === 'object') {
        const responseAsRecord = responseData as Record<string, any>;
        if (responseAsRecord.error) {
            outcomeSection += `**Status:** Failed\n`;
            outcomeSection += `**Error Type:** ${responseAsRecord.error.type || 'Unknown'}\n`;
            outcomeSection += `**Message:** ${responseAsRecord.error.message || 'No message provided'}\n`;
            if (responseAsRecord.error.status) {
                 outcomeSection += `**Status Code:** ${responseAsRecord.error.status}\n`;
            }
            outcomeSection += "\n";
        } else {
            let success = false;
            let contentForCheck: string | undefined | null = null;
            if (provider === 'openai') {
                contentForCheck = responseAsRecord.choices?.[0]?.message?.content;
                success = !!contentForCheck;
            } else if (provider === 'anthropic') {
                 contentForCheck = responseAsRecord.content?.[0]?.text ?? responseAsRecord.content;
                 success = !!contentForCheck;
            } else if (provider === 'gemini') {
                  type GeminiPart = { text?: string };
                  const parts = responseAsRecord.candidates?.[0]?.content?.parts as unknown;
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
                     outcomeSection += JSON.stringify(responseAsRecord.choices, null, 2);
                } else if (provider === 'anthropic') {
                     outcomeSection += JSON.stringify(responseAsRecord.content, null, 2);
                } else if (provider === 'gemini') {
                      outcomeSection += JSON.stringify(responseAsRecord.candidates, null, 2);
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
            if (mid.startsWith('claude-opus-4-1')) return 'Claude Opus 4.1';
            if (mid.startsWith('claude-sonnet-4-1')) return 'Claude Sonnet 4.1';
        } else if (provider === 'gemini') {
            if (mid === 'gemini-2.5-pro') return 'Gemini 2.5 Pro';
        } else if (provider === 'openai') {
            if (mid === 'gpt-4.1') return 'GPT‑4.1';
        }
        return modelId;
    })();

    const providerTitle = provider.charAt(0).toUpperCase() + provider.slice(1);
    let fileContent = `# ${providerTitle} — ${friendlyModel} API Interaction Log\n\n`;
    fileContent += `**Command:** ${commandContext}\n`;
    fileContent += `**Provider:** ${provider}\n`;
    fileContent += `**Model:** ${friendlyModel}\n`;
    fileContent += `**Model ID:** ${modelId}\n`;
    fileContent += `**Timestamp:** ${new Date().toISOString()}\n`;
    fileContent += `${contextHeader}\n`;
    fileContent += `${usageString}\n\n`;
    fileContent += `${outcomeSection}`;

    fileContent += `## Request Sent\n\n`;
    fileContent += `\\\`\\\`\\\`json\n${requestJson}\n\\\`\\\`\\\`\n\n`;

    // <<< FIXED: Use safeRequestData and type guard for messages array >>>
    let userPromptContent = 'User prompt not logged correctly';
    if (provider === 'openai' && safeRequestData?.messages && Array.isArray(safeRequestData.messages)) {
        const userMessage = safeRequestData.messages.find((m: ApiMessage) => m.role === 'user');
        if (userMessage) userPromptContent = userMessage.content;
    } else if (provider === 'anthropic' && safeRequestData) {
        // For anthropic we logged system separately; user is in the single messages array we sent
        const anthropicMsg = (safeRequestData as any).messages?.[0]?.content;
        if (typeof anthropicMsg === 'string') userPromptContent = anthropicMsg;
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
                    userPromptContent = arr.map(p => p?.text ?? '').join('').trim();
                }
            }
        }
    }
    fileContent += `## User Prompt Used\n\n\\\`\\\`\\\`\n${userPromptContent}\n\\\`\\\`\\\`\n\n`;

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

    fileContent += `## Response Received (Full JSON)\n\n`;
    fileContent += `\\\`\\\`\\\`json\n${responseJson}\n\\\`\\\`\\\`\n`;

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
                    // New canonical Anthropic IDs
                    if (id === 'claude-opus-4-1' || id === 'claude-4.1-opus') return 'claude-opus-4-1@20250805';
                    if (id === 'claude-sonnet-4-1' || id === 'claude-4-sonnet') return 'claude-sonnet-4-1@20250805';
                    // Legacy fallbacks map to latest
                    if (id === 'claude-opus-4-0' || id === 'claude-3-opus-20240229') return 'claude-opus-4-1@20250805';
                    if (id === 'claude-sonnet-4-0' || id === 'claude-3-7-sonnet-20250219') return 'claude-sonnet-4-1@20250805';
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
            modelId = normalizeModelId('anthropic', plugin.settings.anthropicModelId) || 'claude-3-7-sonnet-20250219';

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
            if (currentProvider === 'anthropic') modelId = plugin.settings.anthropicModelId || 'claude-3-7-sonnet-20250219';
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
        // Clone frontmatter and remove existing beats
        const frontmatterCopy = { ...scene.frontmatter };
        delete frontmatterCopy['1beats'];
        delete frontmatterCopy['2beats'];
        delete frontmatterCopy['3beats'];
        
        // Update BeatsUpdate flag with timestamp and model ID
        const timestamp = new Date().toISOString();
        // <<< Construct the new value including model ID >>>
        const updatedValue = `${timestamp}${modelIdUsed ? ` by ${modelIdUsed}` : ' by Unknown Model'}`;

        if (frontmatterCopy.hasOwnProperty('BeatsUpdate')) {
            frontmatterCopy['BeatsUpdate'] = updatedValue; 
        } else {
            plugin.log(`[API Beats][updateSceneFile] Flag 'BeatsUpdate' not found for ${scene.file.path} during update. Adding 'BeatsLastUpdated'.`);
            // Add a fallback key if the original wasn't present 
            frontmatterCopy['BeatsLastUpdated'] = updatedValue;
        }
        

        
        // Stringify the base frontmatter (without any beats yet)
        let frontmatterYaml = stringifyYaml(frontmatterCopy).trim();
        

        
        // Append the new beats content directly to the YAML string
        let beatsAdded = false;
        for (const beatKey of ['1beats', '2beats', '3beats'] as const) {
            const beatContentFromParser = parsedBeats[beatKey];
            


            if (beatContentFromParser && beatContentFromParser.trim()) { 
                if (frontmatterYaml) frontmatterYaml += '\n';
                frontmatterYaml += `${beatKey}:\n${beatContentFromParser}`;

                beatsAdded = true;
            } else {

            }
        }
        

        
        const newFileContent = `---\n${frontmatterYaml}\n---\n${scene.body}`;
        

          
        await vault.modify(scene.file, newFileContent);
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

        notice.setMessage(`Analyzing ${totalTripletsAcrossSubplots} scenes across ${subplotNames.length} subplots...`);

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
         new Notice(`✅ Subplot Processing Complete: ${totalProcessedCount}/${totalTripletsAcrossSubplots} total triplets processed across ${subplotNames.length} subplots.`);
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
