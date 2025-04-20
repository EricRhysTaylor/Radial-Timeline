import ManuscriptTimelinePlugin from './main'; 
import { App, TFile, Vault, Notice, parseYaml, stringifyYaml } from "obsidian";

// --- Interfaces --- 
interface SceneData {
    file: TFile;
    frontmatter: Record<string, unknown>; // Use Record<string, unknown> for flexible objects
    sceneNumber: number | null;
    body: string;
}

// --- Helper Functions --- 

function getApiKey(plugin: ManuscriptTimelinePlugin): string | null {
    const apiKey = plugin.settings.openaiApiKey;
    if (!apiKey || apiKey.trim() === '') {
        new Notice('OpenAI API key is not set in Manuscript Timeline settings.');
        return null;
    }
    return apiKey;
}

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
    return `You are a developmental editor for a sci-fi BioPunk novel. You are evaluating narrative scene inter-connections and key plot momentum providing constructive criticism and suggestions for improvement.

For each of the three scenes below, generate concise 5 ordered narrative beats from the perspective of the 2beats (middle scene) showing the connections between the 1beats (previous scene) and the 3beats (next scene) and if 2beats is maintaining the momentum of the story. For the first line of the 2beats, give an overall editorial score of A, B or C where A nearly perfect and C needs improvement with instructions on how to improve it.

Use this exact format:

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
- Do not summarize at the end.

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
    requestData: unknown,
    responseData: unknown,
    promptUsed: string,
    subplotName: string | null
): Promise<void> {
    if (!plugin.settings.logApiInteractions) {
        return; // Do nothing if setting is disabled
    }

    const logFolder = "AI";
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-'); // File-safe timestamp
    const fileName = `api-log-${timestamp}.md`;
    const filePath = `${logFolder}/${fileName}`;

    const requestJson = JSON.stringify(requestData, null, 2);
    // Type assertion needed for responseData properties
    const responseJson = JSON.stringify(responseData, null, 2);

    // --- Cost Calculation --- 
    let costString = "**Estimated Cost:** N/A";
    try {
        // Check if responseData is an object before accessing properties
        if (responseData && typeof responseData === 'object') {
            const usage = (responseData as Record<string, any>)?.usage; // Use type assertion for usage
            if (usage && typeof usage.prompt_tokens === 'number' && typeof usage.completion_tokens === 'number') {
                const promptTokens = usage.prompt_tokens;
                const completionTokens = usage.completion_tokens;
                const INPUT_PRICE_PER_MILLION = 5.00; 
                const OUTPUT_PRICE_PER_MILLION = 15.00;
                const inputCost = (promptTokens / 1000000) * INPUT_PRICE_PER_MILLION;
                const outputCost = (completionTokens / 1000000) * OUTPUT_PRICE_PER_MILLION;
                const totalCost = inputCost + outputCost;
                costString = `**Estimated Cost:** $${totalCost.toFixed(6)} (Input: ${promptTokens} tokens, Output: ${completionTokens} tokens)`;
            } else if (!(responseData as Record<string, any>)?.error) { // Use type assertion for error check
                costString = "**Estimated Cost:** N/A (Usage data not found in response)";
            }
        } else {
             costString = "**Estimated Cost:** N/A (Response is not an object)"; // Handle non-object response
        }
    } catch (e) {
        console.error("Error calculating API cost:", e);
        costString = "**Estimated Cost:** Error calculating cost";
    }

    // --- Determine Outcome --- 
    let outcomeSection = "## Outcome\n\n";
    // Check if responseData is an object before accessing properties
    if (responseData && typeof responseData === 'object') {
        const responseAsRecord = responseData as Record<string, any>; // Assert as record
        if (responseAsRecord.error) {
            outcomeSection += `**Status:** Failed\n`;
            outcomeSection += `**Error Type:** ${responseAsRecord.error.type || 'Unknown'}\n`;
            outcomeSection += `**Message:** ${responseAsRecord.error.message || 'No message provided'}\n`;
            if (responseAsRecord.error.status) {
                 outcomeSection += `**Status Code:** ${responseAsRecord.error.status}\n`;
            }
        } else if (!responseAsRecord.choices || !Array.isArray(responseAsRecord.choices) || responseAsRecord.choices.length === 0 || !responseAsRecord.choices[0]?.message?.content) {
            outcomeSection += `**Status:** Response Structure Error\n`;
            outcomeSection += `**Details:** Could not find expected 'choices[0].message.content' in the response.\n`;
            if (responseAsRecord.choices) {
                outcomeSection += `**Actual Choices Structure:**\n\`\`\`json\n${JSON.stringify(responseAsRecord.choices, null, 2)}\n\`\`\`\n`;
            } else {
                 outcomeSection += `**(No 'choices' array found in response)**\n`;
            }
        } else {
             outcomeSection += `**Status:** Success (Content Received)\n`;
        }
    } else {
        // Handle cases where responseData is not a structured object (e.g., null, string error)
        outcomeSection += `**Status:** Unexpected Response Format\n`;
        outcomeSection += `**Response Received:** ${JSON.stringify(responseData)}\n`; // Log the actual received data
    }
    
    const contextHeader = subplotName ? `**Subplot Context:** ${subplotName}` : `**Context:** Manuscript Order`;

    const fileContent = `
# OpenAI API Interaction Log

**Timestamp:** ${new Date().toISOString()}
${contextHeader}
${costString} <!-- Check OpenAI for current pricing -->

${outcomeSection}

## Request Sent

\`\`\`json
${requestJson}
\`\`\`

## Full Prompt Used

\`\`\`
${promptUsed}
\`\`\`

## Response Received (Full JSON)

\`\`\`json
${responseJson}
\`\`\`
    `;

    try {
        // Ensure the AI folder exists
        try {
            await vault.createFolder(logFolder);
            console.log(`[BeatsCommands] Ensured folder exists: ${logFolder}`);
        } catch (e: unknown) {
            // Check if e is an Error object before accessing message
            if (e instanceof Error && e.message && !e.message.includes('already exists')) {
                throw e; // Rethrow if it's not an "already exists" error
            } else if (!(e instanceof Error)) {
                // If it's not an Error object but still an error, log it differently or rethrow
                console.warn(`[BeatsCommands] Caught non-Error object while checking folder existence:`, e);
                // Decide whether to throw e or handle differently
            }
            // Ignore "already exists" error or non-Error objects where message check isn't applicable
        }

        // Create the log file
        await vault.create(filePath, fileContent.trim());
        console.log(`[BeatsCommands] Logged API interaction to: ${filePath}`);

    } catch (error) {
        console.error(`[BeatsCommands] Error logging API interaction to file ${filePath}:`, error);
        new Notice(`Failed to write AI log to ${filePath}. Check console.`);
    }
}

async function callGPT(
    apiKey: string, 
    prompt: string,
    plugin: ManuscriptTimelinePlugin,
    vault: Vault,
    subplotName: string | null
): Promise<string | null> {
    const requestBody = {
        model: "gpt-4.1-2025-04-14",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7
    };
    // Log the actual model being called
    console.log(`[API][BeatsCommands][callGPT] Calling ${requestBody.model} API...`);

    if (!plugin.settings.logApiInteractions && plugin.settings.debug) {
        console.log("[API][BeatsCommands][callGPT] Sending Request Body:", JSON.stringify(requestBody, null, 2)); 
    }

    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
      });
      
      // Attempt to get response data even if fetch wasn't fully 'ok' (e.g., 4xx/5xx error)
      let responseData: unknown;
      try {
          responseData = await res.json();
      } catch (jsonError) {
          // Handle cases where response is not JSON (e.g., network error page, unexpected format)
          console.error("[API][BeatsCommands][callGPT] Failed to parse API response as JSON:", jsonError);
          // Create a placeholder error object for logging
          responseData = { 
              error: { 
                  message: `Failed to parse response as JSON: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`, 
                  type: 'json_parsing_error', 
                  status: res.status // Include status if available 
              }
          }; 
          // Log this specific failure
          await logApiInteractionToFile(plugin, vault, requestBody, responseData, prompt, subplotName);
          new Notice(`❌ GPT API Error: Invalid response format (Status: ${res.status})`);
          return null; // Exit after logging the parse failure
      }

      // Log successful fetch/parse, regardless of ok status, includes request, response, prompt
      await logApiInteractionToFile(plugin, vault, requestBody, responseData, prompt, subplotName);

      if (!plugin.settings.logApiInteractions && plugin.settings.debug) {
          console.log("[API][BeatsCommands][callGPT] Received Response Body:", JSON.stringify(responseData, null, 2));
      }

      // Now check if the response status was actually OK
      if (!res.ok) {
        // Check if responseData is an object before accessing error properties
        const errorMessage = (responseData && typeof responseData === 'object' && (responseData as Record<string, any>).error?.message) 
                            ? (responseData as Record<string, any>).error.message 
                            : 'Unknown API error';
        console.error("[API][BeatsCommands][callGPT] GPT API Error Status:", res.status, responseData);
        new Notice(`❌ GPT API Error (${res.status}): ${errorMessage}`);
        return null; // Return null because the API call failed
      }
      
      // Check responseData structure before accessing nested properties
      const content = (responseData && typeof responseData === 'object' && Array.isArray((responseData as Record<string, any>).choices) && (responseData as Record<string, any>).choices.length > 0)
                      ? (responseData as Record<string, any>).choices[0]?.message?.content?.trim()
                      : null;

      if (!content) {
          console.error("[API][BeatsCommands][callGPT] Invalid GPT response structure (No content):", responseData);
          new Notice("❌ Invalid response structure from GPT (missing content).");
          return null;
      }
      console.log("[API][BeatsCommands][callGPT] GPT response received successfully.");
      return content;
    } catch (networkError: unknown) {
      // Handle network errors (fetch itself failed)
      console.error("[API][BeatsCommands][callGPT] Network or other error calling GPT API:", networkError);
      // Create a placeholder error object for logging
      const errorResponseData = { 
          error: { 
               // Check if networkError is an Error object before accessing message
              message: networkError instanceof Error ? networkError.message : String(networkError), 
              type: 'network_error' 
          } 
      };
      // Log the network failure attempt
      await logApiInteractionToFile(plugin, vault, requestBody, errorResponseData, prompt, subplotName); 
      new Notice("❌ Failed to connect to OpenAI API. Check network or API key.");
      return null;
    }
}

function parseGptResult(gptResult: string, plugin: ManuscriptTimelinePlugin): { '1beats': string, '2beats': string, '3beats': string } | null {
    if (plugin.settings.debug) {
        console.log("[API Beats][parseGptResult] Received Raw GPT Result:\n---" + gptResult + "---");
    }
    try {
        // Use LAZY quantifier (*?) with refined lookaheads for section boundaries for 1 & 2
        // Use GREEDY quantifier (*) for section 3 to capture everything to the end
        const section1Pattern = /^1beats:\s*([\s\S]*?)(?=^\s*(?:2beats:|3beats:|$))/m;
        const section2Pattern = /^2beats:\s*([\s\S]*?)(?=^\s*(?:3beats:|$))/m;
        const section3Pattern = /^3beats:\s*([\s\S]*)$/m; // Greedy for the last section
        
        // Match against the raw gptResult
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
        
        // Restore the original processSection logic
        const processSection = (content: string | undefined): string => {
            if (!content) return '';
            const trimmedContent = content.trim();
            if (plugin.settings.debug) {
                 console.log("[API Beats][parseGptResult] Raw section content after outer trim: " + JSON.stringify(trimmedContent));
            }
            if (!trimmedContent) return '';
            // Split, trim lines, remove commas, filter, add indent, join
            return trimmedContent
                .split('\n')
                .map(line => line.trim())
                .map(line => line.replace(/,/g, ''))
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

async function updateSceneFile(vault: Vault, scene: SceneData, parsedBeats: { '1beats': string, '2beats': string, '3beats': string }, plugin: ManuscriptTimelinePlugin): Promise<boolean> {
    console.log("[updateSceneFile] Updating frontmatter for:", scene.file.path);
    if (plugin.settings.debug) {
        // Log 1: Received parsed beats
        console.log("[API Beats][updateSceneFile] Parsed Beats Received:", JSON.stringify(parsedBeats, null, 2));
    }
    try {
        const { '1beats': _, '2beats': __, '3beats': ___, ...frontmatterWithoutBeats } = { ...scene.frontmatter };
        
        // --- Update the BeatsUpdate field --- 
        // Use an ISO timestamp for clarity and sortability
        frontmatterWithoutBeats['BeatsUpdate'] = new Date().toISOString();
        // --- End Update ---
        
        if (plugin.settings.debug) {
            // Log 2: Frontmatter object before stringify (excluding beats)
            console.log("[API Beats][updateSceneFile] Frontmatter object before stringify (excluding beats):", JSON.stringify(frontmatterWithoutBeats, null, 2));
        }
        
        let frontmatterYaml = stringifyYaml(frontmatterWithoutBeats).trim();
        
        if (plugin.settings.debug) {
            // Log 3: Initial stringifyYaml output (excluding beats)
            console.log("[API Beats][updateSceneFile] Initial stringifyYaml output (excluding beats):\n---\n" + frontmatterYaml + "---\n");
        }
        
        let beatsAdded = false;
        for (const beatKey of ['1beats', '2beats', '3beats'] as const) {
            const beatContentFromParser = parsedBeats[beatKey]; // Get content processed by parseGptResult
            
            // --- DEBUG LOGS START ---
            if (plugin.settings.debug) {
                console.log(`[API Beats][updateSceneFile] --- Checking beatKey: ${beatKey} ---`);
                // Use JSON.stringify to clearly show whitespace/newlines
                console.log(`[API Beats][updateSceneFile] Content from parser: ${JSON.stringify(beatContentFromParser)}`); 
                const trimmedForCheck = beatContentFromParser?.trim();
                console.log(`[API Beats][updateSceneFile] Content after trim() for check: ${JSON.stringify(trimmedForCheck)}`);
            }
            // --- DEBUG LOGS END ---

            // Check if the content (after trimming for the check) is non-empty
            if (beatContentFromParser && beatContentFromParser.trim()) { 
                if (frontmatterYaml) frontmatterYaml += '\n';
                // Append the key and the original content from the parser (which already has formatting)
                frontmatterYaml += `${beatKey}:\n${beatContentFromParser}`;
                 if (plugin.settings.debug) {
                    console.log(`[API Beats][updateSceneFile] Appended ${beatKey}. Current YAML:\n---\n${frontmatterYaml}\n---`);
                 }
                beatsAdded = true;
            } else {
                 // --- DEBUG LOG --- 
                 if (plugin.settings.debug) {
                     console.log(`[API Beats][updateSceneFile] Skipping append for ${beatKey} because check failed.`);
                 }
                 // --- DEBUG LOG END ---
            }
        }
        
        if (plugin.settings.debug) {
             // Log 5: Final frontmatter string after appending beats
             console.log("[API Beats][updateSceneFile] Final Frontmatter YAML after appending beats:\n---\n" + frontmatterYaml + "---\n");
        }
        
        const newFileContent = `---\n${frontmatterYaml}\n---\n${scene.body}`;
        
        if (plugin.settings.debug) {
            // Log 6: Final full file content before writing
            console.log("[API Beats][updateSceneFile] Final generated file content before writing:\n" + newFileContent);
        }
          
        await vault.modify(scene.file, newFileContent);
        return true;
    } catch (error) {
        console.error(`[updateSceneFile] Error updating file:`, error);
        new Notice(`❌ Error saving updates to ${scene.file.basename}`); // Add Notice on error
        return false;
    }
}

// --- Exported Processing Functions ---

export async function processByManuscriptOrder(
    plugin: ManuscriptTimelinePlugin,
    vault: Vault,
    apiKey: string
): Promise<void> {
    new Notice('Gathering scene data...');
    const allScenes = await getAllSceneData(plugin, vault);
    if (allScenes.length === 0) {
        new Notice('No valid Scene files found in source path.');
        return;
    }

    // Sort by scene number (handle nulls? maybe filter them out earlier)
    const sortedScenes = allScenes.filter(s => s.sceneNumber !== null)
                                .sort((a, b) => (a.sceneNumber as number) - (b.sceneNumber as number));
    
    let updatesMade = 0;
    let scenesProcessed = 0;
    const totalToProcess = sortedScenes.filter(scene => {
        const flagValue = String(scene.frontmatter?.BeatsUpdate || '').trim().toLowerCase();
        return ['yes', 'true', '1'].includes(flagValue);
    }).length;
    new Notice(`Starting Manuscript Order Beat Update. Scenes to check: ${sortedScenes.length}, Flagged: ${totalToProcess}`);

    const processedSet = new Set(plugin.settings.processedBeatContexts);

    for (let i = 0; i < sortedScenes.length; i++) {
        const currentScene = sortedScenes[i];

        // Check BeatsUpdate flag first
        const updateFlagValue = String(currentScene.frontmatter?.BeatsUpdate || '').trim().toLowerCase();
        if (!['yes', 'true', '1'].includes(updateFlagValue)) {
            continue;
        }

        // Determine context and check cache
        const prevSceneData = sortedScenes[i - 1];
        const nextSceneData = sortedScenes[i + 1];
        const currentPath = currentScene.file.path;
        const prevPath = prevSceneData?.file.path;
        const nextPath = nextSceneData?.file.path;
        const contextKey = `${prevPath || '_START_'} | ${currentPath} | ${nextPath || '_END_'}`;

        if (processedSet.has(contextKey)) {
            if (plugin.settings.debug) {
                console.log(`[BeatsCommands][ManuscriptOrder] Skipping ${currentPath}: Context already processed (${contextKey})`);
            }
            continue; // Skip if context already processed
        }

        scenesProcessed++;
        new Notice(`Processing ${currentScene.file.basename} (${scenesProcessed}/${totalToProcess})...`);

        const prevBody = prevSceneData?.body || null;
        const nextBody = nextSceneData?.body || null;
        const prevNum = prevSceneData?.sceneNumber?.toString() || "None";
        const currentNum = currentScene.sceneNumber?.toString() || "?.?";
        const nextNum = nextSceneData?.sceneNumber?.toString() || "None";

        // Build prompt & call API (pass null for subplotName)
        const prompt = buildPrompt(prevBody, currentScene.body, nextBody, prevNum, currentNum, nextNum);
        const gptResult = await callGPT(apiKey, prompt, plugin, vault, null);
        if (!gptResult) {
            new Notice(`❌ GPT failed for: ${currentScene.file.basename}`);
            continue;
        }

        // Parse & Update (pass plugin for its debug logs)
        const parsedBeats = parseGptResult(gptResult, plugin);
        if (!parsedBeats) {
            new Notice(`❌ Failed to parse GPT result for: ${currentScene.file.basename}`);
            continue;
        }

        // Perform replacements on the parsed content
        parsedBeats['1beats'] = parsedBeats['1beats'].replace(/1beats/gi, prevNum); // Case-insensitive global replace
        parsedBeats['2beats'] = parsedBeats['2beats'].replace(/2beats/gi, currentNum);
        parsedBeats['3beats'] = parsedBeats['3beats'].replace(/3beats/gi, nextNum);
        
        // Log the beats after replacement if debugging
        if (plugin.settings.debug) {
            console.log("[API Beats][ManuscriptOrder] Beats content after string replacement:", JSON.stringify(parsedBeats, null, 2));
        }

        if (await updateSceneFile(vault, currentScene, parsedBeats, plugin)) {
            updatesMade++;
            // Add context to cache and save settings
            processedSet.add(contextKey);
            plugin.settings.processedBeatContexts = Array.from(processedSet);
            // Intentionally await save here to ensure cache is updated before next iteration might check it
            await plugin.saveSettings();
        }
    }
    new Notice(`Manuscript Order Beat Update Complete. Processed: ${scenesProcessed}, Updated: ${updatesMade}.`);
}

export async function processBySubplotOrder(
    plugin: ManuscriptTimelinePlugin,
    vault: Vault,
    apiKey: string
): Promise<void> {
    new Notice('Gathering scene data...');
    const allScenes = await getAllSceneData(plugin, vault);
    if (allScenes.length === 0) {
        new Notice('No valid Scene files found in source path.');
        return;
    }

    // Group scenes by subplot
    const scenesBySubplot = new Map<string, SceneData[]>();
    allScenes.forEach(scene => {
        // Ensure we handle cases where frontmatter might be missing or Subplot/subplot isn't present
        const subplotValue = scene.frontmatter?.Subplot ?? scene.frontmatter?.subplot ?? 'Main Plot';
        let subplots: unknown[]; // Use unknown[] to allow for type check
        
        if (Array.isArray(subplotValue)) {
            subplots = subplotValue;
        } else {
            subplots = [subplotValue]; // Ensure it's an array
        }
        
        subplots.forEach((subplotNameUntyped: unknown) => {
            // Check if subplotName is a string and trim it
            let subplotName = 'Main Plot';
            if (typeof subplotNameUntyped === 'string' && subplotNameUntyped.trim() !== '') {
                subplotName = subplotNameUntyped.trim();
            }
            
            if (!scenesBySubplot.has(subplotName)) {
                scenesBySubplot.set(subplotName, []);
            }
            scenesBySubplot.get(subplotName)?.push(scene);
        });
    });

    let updatesMade = 0;
    let scenesProcessed = 0;
    const totalToProcess = allScenes.filter(scene => {
        const flagValue = String(scene.frontmatter?.BeatsUpdate || '').trim().toLowerCase();
        return ['yes', 'true', '1'].includes(flagValue);
    }).length;
    new Notice(`Starting Subplot Order Beat Update. Subplots: ${scenesBySubplot.size}, Total Flagged Scenes: ${totalToProcess}`);

    const processedSet = new Set(plugin.settings.processedBeatContexts);

    // Process each subplot group
    for (const [subplotName, scenesInSubplot] of scenesBySubplot.entries()) {
        new Notice(`Processing subplot: ${subplotName} (${scenesInSubplot.length} scenes)`);
        
        // Sort scenes within this subplot by scene number
        const sortedScenes = scenesInSubplot.filter(s => s.sceneNumber !== null)
                                        .sort((a, b) => (a.sceneNumber as number) - (b.sceneNumber as number));

        for (let i = 0; i < sortedScenes.length; i++) {
            const currentScene = sortedScenes[i];

            // Check BeatsUpdate flag first
            const updateFlagValue = String(currentScene.frontmatter?.BeatsUpdate || '').trim().toLowerCase();
            if (!['yes', 'true', '1'].includes(updateFlagValue)) {
                continue;
            }

            // Determine context and check cache (using subplot neighbors)
            const prevSceneData = sortedScenes[i - 1];
            const nextSceneData = sortedScenes[i + 1];
            const currentPath = currentScene.file.path;
            const prevPath = prevSceneData?.file.path;
            const nextPath = nextSceneData?.file.path;
            const contextKey = `${prevPath || '_START_'} | ${currentPath} | ${nextPath || '_END_'}`;

            if (processedSet.has(contextKey)) {
                 if (plugin.settings.debug) {
                    console.log(`[BeatsCommands][SubplotOrder] Skipping ${currentPath} (Subplot: ${subplotName}): Context already processed (${contextKey})`);
                }
                continue; // Skip if context already processed
            }

            scenesProcessed++; // Count processed scenes across all subplots
             new Notice(`Processing ${currentScene.file.basename} (Subplot: ${subplotName}, ${scenesProcessed}/${totalToProcess} total flagged)...`);

            const prevBody = prevSceneData?.body || null;
            const nextBody = nextSceneData?.body || null;
            const prevNum = prevSceneData?.sceneNumber?.toString() || "None";
            const currentNum = currentScene.sceneNumber?.toString() || "?.?";
            const nextNum = nextSceneData?.sceneNumber?.toString() || "None";

            // Build prompt & call API (pass current subplotName)
            const prompt = buildPrompt(prevBody, currentScene.body, nextBody, prevNum, currentNum, nextNum);
            const gptResult = await callGPT(apiKey, prompt, plugin, vault, subplotName);
             if (!gptResult) {
                new Notice(`❌ GPT failed for: ${currentScene.file.basename} (Subplot: ${subplotName})`);
                continue;
            }

            // Parse & Update (pass plugin for its debug logs)
            const parsedBeats = parseGptResult(gptResult, plugin);
            if (!parsedBeats) {
                new Notice(`❌ Failed to parse GPT result for: ${currentScene.file.basename} (Subplot: ${subplotName})`);
                continue;
            }

            // <<< ADDED: Perform replacements on the parsed content >>>
            parsedBeats['1beats'] = parsedBeats['1beats'].replace(/1beats/gi, prevNum); // Case-insensitive global replace
            parsedBeats['2beats'] = parsedBeats['2beats'].replace(/2beats/gi, currentNum);
            parsedBeats['3beats'] = parsedBeats['3beats'].replace(/3beats/gi, nextNum);
            
            // <<< ADDED: Log the beats after replacement if debugging >>>
            if (plugin.settings.debug) {
                console.log(`[API Beats][SubplotOrder] Beats content for ${subplotName} after string replacement:`, JSON.stringify(parsedBeats, null, 2));
            }
            // <<< END ADDED >>>

             if (await updateSceneFile(vault, currentScene, parsedBeats, plugin)) {
                 updatesMade++;
                 // Add context to cache and save settings
                 processedSet.add(contextKey);
                 plugin.settings.processedBeatContexts = Array.from(processedSet);
                 await plugin.saveSettings();
            }
        }
    }
    new Notice(`Subplot Order Beat Update Complete. Processed: ${scenesProcessed}, Updated: ${updatesMade}.`);
}

// <<< ADDED: Dummy data for testing >>>
const DUMMY_API_RESPONSE = `1beats:
 - 33.2 Trisan Inner Turmoil - / Lacks clarity
 - Chae Ban Hesitation ? / Uncertain decision
 - Entiat Reflection ? / Needs clearer link
 - Chae Ban Plan + / Strengthens connection
 - Meeting Entiat + / Sets up tension
2beats:
 - 33.5 B Scene will be stronger by making Entiat motivations clearer
 - Entiat Adoption Reflections ? / Lacks tension link
 - Chae Ban Escape News + / Advances plot
 - Entiat Internal Conflict + / Highlights dilemma, how to handle the situation
3beats:
 - 34 Teco Routine Disruption - / Needs purpose
 - Entiat Unexpected Visit ? / Confusing motivation
 - Sasha Defense and Defeat + / Builds tension
 - Teco Escape Decision + / Strong transition`;

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
        BeatsUpdate: "Yes" // Important for potentially triggering other logic if not careful
    };

    new Notice(`Starting YAML update test on ${dummyFilePath}...`);
    try {
        // 1. Ensure dummy file exists
        let fileExists = await vault.adapter.exists(dummyFilePath);
        if (!fileExists) {
            new Notice(`Creating dummy file: ${dummyFilePath}`);
            const initialContent = `---\n${stringifyYaml(dummyInitialFrontmatter)}---\n${dummyBody}`;
            await vault.create(dummyFilePath, initialContent);
        }

        // 2. Get TFile reference and read content
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

        // 3. Create dummy SceneData
        const dummySceneData: SceneData = {
            file: file,
            frontmatter: currentFrontmatter,
            sceneNumber: 999, // Dummy number
            body: currentBody
        };

        // 4. Parse the dummy API response
        const parsedBeats = parseGptResult(DUMMY_API_RESPONSE, plugin);
        if (!parsedBeats) {
            new Notice('Error: Failed to parse dummy API response data.');
            return;
        }

        // 5. Call updateSceneFile
        const success = await updateSceneFile(vault, dummySceneData, parsedBeats, plugin);

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