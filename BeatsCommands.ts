import ManuscriptTimelinePlugin from './main'; 
import { App, TFile, Vault, Notice, parseYaml, stringifyYaml } from "obsidian";
import { callAnthropicApi, AnthropicApiResponse } from './anthropicApi';
import { callOpenAiApi, OpenAiApiResponse } from './openaiApi';

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

async function getAllSceneData(plugin: ManuscriptTimelinePlugin, vault: Vault): Promise<SceneData[]> {
    const sourcePath = plugin.settings.sourcePath.trim();
    if (plugin.settings.debug) {
        console.log(`[BeatsCommands][getAllSceneData] DEBUG: Using sourcePath: "${sourcePath}"`);
    }

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
                if (plugin.settings.debug) {
                    console.log(`[BeatsCommands][getAllSceneData] DEBUG: Skipping "${filePath}": No frontmatter found.`);
                }
                return null;
            }

            let frontmatter: Record<string, unknown> = {};
            try {
                frontmatter = parseYaml(frontmatterMatch[1]) || {};
            } catch (e) {
                if (plugin.settings.debug) {
                    console.warn(`[BeatsCommands][getAllSceneData] DEBUG: Skipping "${filePath}": YAML parse error`, e);
                }
                return null; // Skip files with invalid YAML
            }

            const fileClass = frontmatter?.Class || frontmatter?.class;
            if (typeof fileClass !== 'string' || fileClass.toLowerCase() !== 'scene') {
                const foundClass = fileClass ? `'${fileClass}'` : 'Not found';
                if (plugin.settings.debug) {
                    console.log(`[BeatsCommands][getAllSceneData] DEBUG: Skipping "${filePath}": Missing or invalid 'Class: Scene'. Found Class: ${foundClass}`);
                }
                return null; // Skip if not Class: Scene
            }

            if (plugin.settings.debug) {
                console.log(`[BeatsCommands][getAllSceneData] Debug Check - Identified as valid scene: "${filePath}"`);
            }

            const sceneNumber = extractSceneNumber(file.name);
            const body = content.replace(/^---[\s\S]*?\n---/, "").trim();

            return { file, frontmatter, sceneNumber, body };

        } catch (e) {
            if (plugin.settings.debug) {
                console.error(`[BeatsCommands][getAllSceneData] DEBUG: Skipping "${filePath}" due to read error:`, e);
            }
            return null; // Skip file on read error
        }
    });

    const results = await Promise.all(sceneDataPromises);
    const validScenes = results.filter((item): item is SceneData => item !== null);

    if (plugin.settings.debug) {
        console.log(`[BeatsCommands][getAllSceneData] DEBUG: Finished scan. Found ${validScenes.length} valid scenes for beats processing.`);
    }

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
 - ${currentNum} A, B or C and include concise summary editorial note no more than 10 words.
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
    plugin: ManuscriptTimelinePlugin,
    vault: Vault,
    provider: 'openai' | 'anthropic',
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

    let costString = "**Estimated Cost:** N/A";
    try {
        if (responseData && typeof responseData === 'object') {
            const usage = (responseData as Record<string, any>)?.usage;

            if (usage) {
                if (provider === 'openai' && typeof usage.prompt_tokens === 'number' && typeof usage.completion_tokens === 'number') {
                const promptTokens = usage.prompt_tokens;
                const completionTokens = usage.completion_tokens;
                    const INPUT_PRICE_PER_MILLION = modelId.includes('gpt-4o') ? 5.00 : (modelId.includes('gpt-4-turbo') ? 10.00 : 0.50);
                    const OUTPUT_PRICE_PER_MILLION = modelId.includes('gpt-4o') ? 15.00 : (modelId.includes('gpt-4-turbo') ? 30.00 : 1.50);
                const inputCost = (promptTokens / 1000000) * INPUT_PRICE_PER_MILLION;
                const outputCost = (completionTokens / 1000000) * OUTPUT_PRICE_PER_MILLION;
                const totalCost = inputCost + outputCost;
                    costString = `**Estimated Cost (OpenAI ${modelId}):** $${totalCost.toFixed(6)} (Input: ${promptTokens} tokens, Output: ${completionTokens} tokens)`;

                } else if (provider === 'anthropic' && typeof usage.input_tokens === 'number' && typeof usage.output_tokens === 'number') {
                    const inputTokens = usage.input_tokens;
                    const outputTokens = usage.output_tokens;
                    const INPUT_PRICE_PER_MILLION = modelId.includes('opus') ? 15.00 : (modelId.includes('sonnet-3.5') ? 3.00 : (modelId.includes('haiku') ? 0.25 : 3.00));
                    const OUTPUT_PRICE_PER_MILLION = modelId.includes('opus') ? 75.00 : (modelId.includes('sonnet-3.5') ? 15.00 : (modelId.includes('haiku') ? 1.25 : 15.00));
                    const inputCost = (inputTokens / 1000000) * INPUT_PRICE_PER_MILLION;
                    const outputCost = (outputTokens / 1000000) * OUTPUT_PRICE_PER_MILLION;
                    const totalCost = inputCost + outputCost;
                    costString = `**Estimated Cost (Anthropic ${modelId}):** $${totalCost.toFixed(6)} (Input: ${inputTokens} tokens, Output: ${outputTokens} tokens)`;

                } else if (!(responseData as Record<string, any>)?.error) {
                    costString = `**Estimated Cost:** N/A (Usage data found but provider/format not recognized or incomplete)`;
                }
            } else if (!(responseData as Record<string, any>)?.error) {
                costString = `**Estimated Cost:** N/A (Usage data not found in response)`;
            }
        } else {
             costString = "**Estimated Cost:** N/A (Response is not an object)";
        }
    } catch (e) {
        console.error("Error calculating API cost:", e);
        costString = "**Estimated Cost:** Error calculating cost";
    }

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

    let fileContent = `# ${provider.charAt(0).toUpperCase() + provider.slice(1)} API Interaction Log\n\n`;
    fileContent += `**Command:** ${commandContext}\n`;
    fileContent += `**Provider:** ${provider}\n`;
    fileContent += `**Model ID:** ${modelId}\n`;
    fileContent += `**Timestamp:** ${new Date().toISOString()}\n`;
    fileContent += `${contextHeader}\n`;
    fileContent += `${costString} <!-- Prices are estimates. Check Anthropic or OpenAI for current pricing. -->\n\n`;
    fileContent += `${outcomeSection}`;

    fileContent += `## Request Sent\n\n`;
    fileContent += `\\\`\\\`\\\`json\n${requestJson}\n\\\`\\\`\\\`\n\n`;

    // <<< FIXED: Use safeRequestData and type guard for messages array >>>
    let userPromptContent = 'User prompt not logged correctly';
    if (safeRequestData?.messages && Array.isArray(safeRequestData.messages)) {
        const userMessage = safeRequestData.messages.find((m: ApiMessage) => m.role === 'user');
        if (userMessage) {
            userPromptContent = userMessage.content;
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
            if(plugin.settings.debug) console.log(`[BeatsCommands] Ensured folder exists: ${logFolder}`);
        } catch (e: unknown) {
            if (e instanceof Error && e.message && !e.message.includes('already exists')) {
                throw e;
            } else if (!(e instanceof Error)) {
                 console.warn(`[BeatsCommands] Caught non-Error object while checking/creating folder:`, e);
            }
        }

        await vault.create(filePath, fileContent.trim());
        if(plugin.settings.debug) console.log(`[BeatsCommands] Logged API interaction to: ${filePath}`);

    } catch (error) {
        console.error(`[BeatsCommands] Error logging API interaction to file ${filePath}:`, error);
        new Notice(`Failed to write AI log to ${filePath}. Check console.`);
    }
}

async function callAiProvider(
    plugin: ManuscriptTimelinePlugin,
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
        if (provider === 'anthropic') {
            apiKey = plugin.settings.anthropicApiKey;
            modelId = plugin.settings.anthropicModelId || 'claude-3-7-sonnet-20250219';

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
            console.log(`[API][BeatsCommands][callAiProvider] Calling Anthropic (${modelId})...`);

            const apiResponse: AnthropicApiResponse = await callAnthropicApi(apiKey, modelId, null, userPrompt, 4000);

            responseDataForLog = apiResponse.responseData;

            if (!apiResponse.success) {
                apiErrorMsg = apiResponse.error;
                throw new Error(apiErrorMsg || `Anthropic API call failed with unknown error.`);
            }
            result = apiResponse.content;

        } else {
            apiKey = plugin.settings.openaiApiKey;
            modelId = plugin.settings.openaiModelId || "gpt-4o";

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
            console.log(`[API][BeatsCommands][callAiProvider] Calling OpenAI (${modelId})...`);

            const apiResponse: OpenAiApiResponse = await callOpenAiApi(apiKey, modelId, null, userPrompt, 4000, 0.7);

            responseDataForLog = apiResponse.responseData;

            if (!apiResponse.success) {
                apiErrorMsg = apiResponse.error;
                throw new Error(apiErrorMsg || `OpenAI API call failed.`);
            }
            result = apiResponse.content;
        }

        console.log(`[API][BeatsCommands][callAiProvider] ${provider} response received successfully.`);
        await logApiInteractionToFile(plugin, vault, provider, modelId || 'unknown', requestBodyForLog, responseDataForLog, subplotName, commandContext);
        return { result: result, modelIdUsed: modelId || 'unknown' };

    } catch (error: unknown) {
        const errorMessage = apiErrorMsg || (error instanceof Error ? error.message : String(error));
        console.error(`[API][BeatsCommands][callAiProvider] Error during ${provider} API call:`, errorMessage, error);

         const currentProvider = provider || plugin.settings.defaultAiProvider || 'unknown';
         if (!modelId) {
            if (currentProvider === 'anthropic') modelId = plugin.settings.anthropicModelId || 'claude-3-7-sonnet-20250219';
            else if (currentProvider === 'openai') modelId = 'gpt-4o';
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

function parseGptResult(gptResult: string, plugin: ManuscriptTimelinePlugin): { '1beats': string, '2beats': string, '3beats': string } | null {
    if (plugin.settings.debug) {
        console.log("[API Beats][parseGptResult] Received Raw GPT Result:\n---" + gptResult + "---");
    }
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
            const trimmedContent = content.trim();
            if (plugin.settings.debug) {
                 console.log("[API Beats][parseGptResult] Raw section content after outer trim: " + JSON.stringify(trimmedContent));
            }
            if (!trimmedContent) return '';
            return trimmedContent
                .split('\n')
                .map(line => line.trim())
                .map(line => line.replace(/,/g, ''))
                .map(line => {
                    if (line.includes('-')) {
                        return line.replace(/(\w+):/g, '$1 -');
                    }
                    return line;
                })
                .filter(line => line.length > 0)
                .map(line => ` ${line}`)
                .join('\n');
        };
        
        const beats = {
            '1beats': processSection(section1Match[1]),
            '2beats': processSection(section2Match[1]),
            '3beats': processSection(section3Match[1])
        };
        
        if (plugin.settings.debug) {
            console.log("[API Beats][parseGptResult] Processed beats object: " + JSON.stringify(beats, null, 2));
        }
        
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
    plugin: ManuscriptTimelinePlugin,
    modelIdUsed: string | null
): Promise<boolean> {
    console.log("[updateSceneFile] Updating frontmatter for:", scene.file.path);
    if (plugin.settings.debug) {
        console.log("[API Beats][updateSceneFile] Parsed Beats Received:", JSON.stringify(parsedBeats, null, 2));
        console.log("[API Beats][updateSceneFile] Model ID Used:", modelIdUsed);
    }
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
            console.warn(`[API Beats][updateSceneFile] Flag 'BeatsUpdate' not found for ${scene.file.path} during update. Adding 'BeatsLastUpdated'.`);
            // Add a fallback key if the original wasn't present 
            frontmatterCopy['BeatsLastUpdated'] = updatedValue;
        }
        
        if (plugin.settings.debug) {
            console.log("[API Beats][updateSceneFile] Frontmatter object before adding new beats:", JSON.stringify(frontmatterCopy, null, 2));
        }
        
        // Stringify the base frontmatter (without any beats yet)
        let frontmatterYaml = stringifyYaml(frontmatterCopy).trim();
        
        if (plugin.settings.debug) {
            console.log("[API Beats][updateSceneFile] Initial stringifyYaml output (before adding beats):\n---\n" + frontmatterYaml + "---\n");
        }
        
        // Append the new beats content directly to the YAML string
        let beatsAdded = false;
        for (const beatKey of ['1beats', '2beats', '3beats'] as const) {
            const beatContentFromParser = parsedBeats[beatKey];
            
            if (plugin.settings.debug) {
                console.log(`[API Beats][updateSceneFile] --- Checking beatKey: ${beatKey} ---`);
                console.log(`[API Beats][updateSceneFile] Content from parser: ${JSON.stringify(beatContentFromParser)}`); 
                const trimmedForCheck = beatContentFromParser?.trim();
                console.log(`[API Beats][updateSceneFile] Content after trim() for check: ${JSON.stringify(trimmedForCheck)}`);
            }

            if (beatContentFromParser && beatContentFromParser.trim()) { 
                if (frontmatterYaml) frontmatterYaml += '\n';
                frontmatterYaml += `${beatKey}:\n${beatContentFromParser}`;
                 if (plugin.settings.debug) {
                    console.log(`[API Beats][updateSceneFile] Appended ${beatKey}. Current YAML:\n---\n${frontmatterYaml}\n---`);
                 }
                beatsAdded = true;
            } else {
                 if (plugin.settings.debug) {
                     console.log(`[API Beats][updateSceneFile] Skipping append for ${beatKey} because check failed.`);
                 }
            }
        }
        
        if (plugin.settings.debug) {
             console.log("[API Beats][updateSceneFile] Final Frontmatter YAML after appending beats:\n---\n" + frontmatterYaml + "---\n");
        }
        
        const newFileContent = `---\n${frontmatterYaml}\n---\n${scene.body}`;
        
        if (plugin.settings.debug) {
            console.log("[API Beats][updateSceneFile] Final generated file content before writing:\n" + newFileContent);
        }
          
        await vault.modify(scene.file, newFileContent);
        return true;
    } catch (error) {
        console.error(`[updateSceneFile] Error updating file:`, error);
        new Notice(`❌ Error saving updates to ${scene.file.basename}`);
        return false;
    }
}

export async function processByManuscriptOrder(
    plugin: ManuscriptTimelinePlugin,
    vault: Vault
): Promise<void> {
    console.log("[API Beats][processByManuscriptOrder] Starting processing...");
    const notice = new Notice("Processing Manuscript Order: Getting scene data...", 0);

    try {
    const allScenes = await getAllSceneData(plugin, vault);
        allScenes.sort((a, b) => (a.sceneNumber ?? Infinity) - (b.sceneNumber ?? Infinity));

        if (allScenes.length < 1) {
            new Notice("No valid scenes found in the specified source path.");
            notice.hide();
        return;
    }

        const triplets: { prev: SceneData | null, current: SceneData, next: SceneData | null }[] = [];
        for (let i = 0; i < allScenes.length; i++) {
            triplets.push({
                prev: i > 0 ? allScenes[i - 1] : null,
                current: allScenes[i],
                next: i < allScenes.length - 1 ? allScenes[i + 1] : null
            });
        }

        let processedCount = 0;
        const totalTriplets = triplets.length;
        notice.setMessage(`Processing Manuscript Order: 0/${totalTriplets} triplets processed.`);

        for (const triplet of triplets) {
            const currentScenePath = triplet.current.file.path;
            const tripletIdentifier = `${triplet.prev?.sceneNumber ?? 'Start'}-${triplet.current.sceneNumber}-${triplet.next?.sceneNumber ?? 'End'}`;

            // <<< ADDED: Check for BeatsUpdate flag before cache check >>>
            const beatsUpdateFlag = triplet.current.frontmatter?.beatsupdate ?? triplet.current.frontmatter?.BeatsUpdate;
            if (typeof beatsUpdateFlag !== 'string' || beatsUpdateFlag.toLowerCase() !== 'yes') {
                if (plugin.settings.debug) console.log(`[API Beats][processByManuscriptOrder] Skipping triplet for ${currentScenePath}: No 'BeatsUpdate: Yes' flag.`);
                // We don't increment processedCount here, as we only count actual attempts/cache hits
                continue; // Skip to the next triplet if not flagged
            }

            // Check cache *after* confirming the scene is flagged for update
            if (plugin.settings.processedBeatContexts.includes(tripletIdentifier)) {
                 if (plugin.settings.debug) console.log(`[API Beats][processByManuscriptOrder] Skipping cached triplet: ${tripletIdentifier}`);
                 processedCount++;
                 notice.setMessage(`Processing Manuscript Order: ${processedCount}/${totalTriplets} triplets processed (Skipped Cache).`);
            continue;
        }

            notice.setMessage(`Processing Manuscript Order: ${processedCount}/${totalTriplets} - Processing ${triplet.current.sceneNumber}...`);
            if (plugin.settings.debug) {
                 console.log(`[API Beats][processByManuscriptOrder] Processing triplet: ${tripletIdentifier}`);
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
                        console.log(`[API Beats][processByManuscriptOrder] Successfully processed and updated: ${currentScenePath}`);
                    } else {
                         console.warn(`[API Beats][processByManuscriptOrder] Failed to update file after getting beats for: ${currentScenePath}`);
        }
                } else {
                     console.warn(`[API Beats][processByManuscriptOrder] Failed to parse AI result for: ${currentScenePath}`);
                }
            } else {
                 console.warn(`[API Beats][processByManuscriptOrder] No result from AI for: ${currentScenePath}`);
            }

            processedCount++;
            notice.setMessage(`Processing Manuscript Order: ${processedCount}/${totalTriplets} triplets processed.`);
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
    plugin: ManuscriptTimelinePlugin,
    vault: Vault
): Promise<void> {
     console.log("[API Beats][processBySubplotOrder] Starting subplot processing...");
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

        subplotNames.forEach(subplotName => {
            const scenes = scenesBySubplot[subplotName];
            scenes.sort((a, b) => (a.sceneNumber ?? Infinity) - (b.sceneNumber ?? Infinity));
            totalTripletsAcrossSubplots += scenes.length;
        });

        notice.setMessage(`Processing Subplots: 0/${totalTripletsAcrossSubplots} total triplets.`);

        for (const subplotName of subplotNames) {
             const scenes = scenesBySubplot[subplotName];
             scenes.sort((a, b) => (a.sceneNumber ?? Infinity) - (b.sceneNumber ?? Infinity));

            console.log(`[API Beats][processBySubplotOrder] Processing subplot: ${subplotName} (${scenes.length} scenes)`);

            const triplets: { prev: SceneData | null, current: SceneData, next: SceneData | null }[] = [];
             for (let i = 0; i < scenes.length; i++) {
                 triplets.push({
                     prev: i > 0 ? scenes[i - 1] : null,
                     current: scenes[i],
                     next: i < scenes.length - 1 ? scenes[i + 1] : null
                 });
        }
        
            for (const triplet of triplets) {
                const currentScenePath = triplet.current.file.path;
                 const tripletIdentifier = `subplot-${subplotName}-${triplet.prev?.sceneNumber ?? 'Start'}-${triplet.current.sceneNumber}-${triplet.next?.sceneNumber ?? 'End'}`;

                 // <<< ADDED: Check for BeatsUpdate flag before cache check >>>
                 const beatsUpdateFlag = triplet.current.frontmatter?.beatsupdate ?? triplet.current.frontmatter?.BeatsUpdate;
                 if (typeof beatsUpdateFlag !== 'string' || beatsUpdateFlag.toLowerCase() !== 'yes') {
                     if (plugin.settings.debug) console.log(`[API Beats][processBySubplotOrder] Skipping triplet for ${currentScenePath}: No 'BeatsUpdate: Yes' flag.`);
                     // We don't increment totalProcessedCount here, as we only count actual attempts/cache hits
                     continue; // Skip to the next triplet if not flagged
                 }

                 // Check cache *after* confirming the scene is flagged for update
                 if (plugin.settings.processedBeatContexts.includes(tripletIdentifier)) {
                     if (plugin.settings.debug) console.log(`[API Beats][processBySubplotOrder] Skipping cached triplet: ${tripletIdentifier}`);
                     totalProcessedCount++;
                     notice.setMessage(`Processing Subplots: ${totalProcessedCount}/${totalTripletsAcrossSubplots} total triplets (Skipped Cache).`);
                continue;
            }

                notice.setMessage(`Processing Subplots: ${totalProcessedCount}/${totalTripletsAcrossSubplots} - Subplot '${subplotName}', Scene ${triplet.current.sceneNumber}...`);
                 if (plugin.settings.debug) {
                     console.log(`[API Beats][processBySubplotOrder] Processing triplet for subplot ${subplotName}: ${tripletIdentifier}`);
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
                             console.log(`[API Beats][processBySubplotOrder] Successfully processed subplot ${subplotName}, updated: ${currentScenePath}`);
                         } else {
                              console.warn(`[API Beats][processBySubplotOrder] Failed to update file for subplot ${subplotName} after getting beats for: ${currentScenePath}`);
                         }
                     } else {
                          console.warn(`[API Beats][processBySubplotOrder] Failed to parse AI result for subplot ${subplotName}, scene: ${currentScenePath}`);
                     }
                 } else {
                      console.warn(`[API Beats][processBySubplotOrder] No result from AI for subplot ${subplotName}, scene: ${currentScenePath}`);
                 }
                 totalProcessedCount++;
                 notice.setMessage(`Processing Subplots: ${totalProcessedCount}/${totalTripletsAcrossSubplots} total triplets.`);
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
 - 33.5 B Scene will be stronger by making Entiat motivations clearer. Clarify: imminent threat
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
    plugin: ManuscriptTimelinePlugin,
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