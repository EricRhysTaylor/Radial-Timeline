/*
 * Beat Placement Optimization Commands
 * Separate from Gossamer - focuses on optimal structural beat positioning
 */
import type RadialTimelinePlugin from './main';
import { DEFAULT_GEMINI_MODEL_ID } from './constants/aiDefaults';
import { Notice, TFile } from 'obsidian';
import { BeatPlacementModal, type ManuscriptInfo } from './modals/BeatPlacementModal';
import { assembleManuscript } from './utils/manuscript';
import { buildBeatPlacementPrompt, getBeatPlacementJsonSchema, type BeatPlacementInfo } from './ai/prompts/beatPlacement';
import { callGeminiApi, type GeminiApiResponse } from './api/geminiApi';
import { extractBeatOrder } from './utils/gossamer';

/**
 * Register Beat Placement Optimization command
 */
export function registerBeatPlacementCommands(plugin: RadialTimelinePlugin): void {
  plugin.addCommand({
    id: 'optimize-beat-placement',
    name: 'Optimize beat placement',
    checkCallback: (checking: boolean) => {
      if (!plugin.settings.enableAiSceneAnalysis) {
        return false;
      }

      if (checking) {
        return true;
      }

      runBeatPlacementOptimization(plugin);
      return true;
    }
  });
}

/**
 * Run Beat Placement optimization analysis
 */
async function runBeatPlacementOptimization(plugin: RadialTimelinePlugin): Promise<void> {
  
  // Processing callback function
  const processAnalysis = async (modal: BeatPlacementModal) => {
    let result: GeminiApiResponse | undefined;
    
    try {
      // Get beat system
      const beatSystem = plugin.settings.beatSystem || 'Save The Cat';
      modal.setStatus(`Using beat system: ${beatSystem}`);

      // Get all scenes
      const allScenes = await plugin.getSceneData();
      
      // Filter to just beat notes
      const plotBeats = allScenes.filter(s => s.itemType === 'Plot');
      
      if (plotBeats.length === 0) {
        modal.addError('No beat notes found. Create notes with "Class: Beat" in frontmatter.');
        modal.completeProcessing(false, 'No beats found');
        new Notice('No beat notes found for placement optimization.');
        return;
      }

      // Extract beat order and build beat info
      const beatOrder = extractBeatOrder(plotBeats);
      modal.setStatus(`Analyzing ${plotBeats.length} beats...`);

      // Build beat placement info array
      const beats: BeatPlacementInfo[] = plotBeats.map((beat, idx) => {
        // Extract scene number from beat title (e.g., "33 Midpoint" → "33")
        const sceneMatch = beat.title?.match(/^(\d+(?:\.\d+)?)/);
        const currentPosition = sceneMatch ? sceneMatch[1] : undefined;

        return {
          beatName: beat.title?.replace(/^\d+(?:\.\d+)?\s+/, '') || beatOrder[idx],
          beatNumber: idx + 1,
          currentActNumber: beat.actNumber || 1,
          currentScenePosition: currentPosition,
          idealPercentage: undefined // Could be extracted from Range field if available
        };
      });

      // Get sorted scene files (single source of truth)
      const { getSortedSceneFiles } = await import('./utils/manuscript');
      const { files: sceneFiles } = await getSortedSceneFiles(plugin);

      // Assemble manuscript
      modal.setStatus('Assembling manuscript text...');
      const manuscript = await assembleManuscript(sceneFiles, plugin.app.vault, (idx, title, total) => {
        modal.setStatus(`Reading scene ${idx}/${total}: ${title}`);
      });
      
      if (manuscript.totalWords === 0) {
        modal.addError('No manuscript content found. Check your source path settings.');
        modal.completeProcessing(false, 'No content found');
        new Notice('No manuscript content to analyze.');
        return;
      }

      modal.setStatus(`Manuscript: ${manuscript.totalScenes} scenes, ${manuscript.totalWords.toLocaleString()} words`);

      // Build prompt
      const prompt = buildBeatPlacementPrompt(manuscript.text, beats, beatSystem);
      const schema = getBeatPlacementJsonSchema();

      // Validate API key
      if (!plugin.settings.geminiApiKey) {
        throw new Error('Gemini API key not configured. Please set it in plugin settings.');
      }

      const geminiModelId = plugin.settings.geminiModelId || DEFAULT_GEMINI_MODEL_ID;

      // Call Gemini API
      modal.setStatus('Analyzing beat placement with Gemini...');
      result = await callGeminiApi(
        plugin.settings.geminiApiKey,
        geminiModelId,
        null, // systemPrompt
        prompt, // userPrompt
        8000, // maxTokens - match Gossamer (accounts for thinking tokens + output)
        0.7, // temperature
        schema // JSON schema for structured output
      );

      if (!result.success || !result.content) {
        throw new Error(result.error || 'Failed to get beat placement analysis from Gemini');
      }

      // Parse response
      interface BeatPlacementAnalysis {
        beatName: string;
        currentLocation: string;
        suggestedLocation: string;
        actConstraint: number;
        reasoning: string;
      }

      interface BeatPlacementResponse {
        beats: BeatPlacementAnalysis[];
        overallSummary: string;
      }

      let analysis: BeatPlacementResponse;
      try {
        if (!result.content) {
          throw new Error('No content in Gemini response');
        }
        analysis = JSON.parse(result.content);
      } catch (parseError) {
        throw new Error(`Failed to parse Gemini response as JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
      }

      // Validate response structure
      if (!analysis || typeof analysis !== 'object') {
        throw new Error('Invalid response structure from Gemini: Response is not an object');
      }

      if (!Array.isArray(analysis.beats)) {
        throw new Error('Invalid response structure from Gemini: Missing or invalid "beats" array');
      }

      if (typeof analysis.overallSummary !== 'string') {
        // Don't fail completely, just set a default
        analysis.overallSummary = 'No summary provided.';
      }

      // Validate each beat has required fields
      for (let i = 0; i < analysis.beats.length; i++) {
        const beat = analysis.beats[i];
        
        if (!beat || typeof beat !== 'object') {
          throw new Error(`Invalid response structure from Gemini: Beat at index ${i} is not an object`);
        }
        if (typeof beat.beatName !== 'string') {
          throw new Error(`Invalid response structure from Gemini: Beat at index ${i} missing "beatName"`);
        }
        if (typeof beat.currentLocation !== 'string') {
          throw new Error(`Invalid response structure from Gemini: Beat at index ${i} missing "currentLocation"`);
        }
        if (typeof beat.suggestedLocation !== 'string') {
          throw new Error(`Invalid response structure from Gemini: Beat at index ${i} missing "suggestedLocation"`);
        }
        if (typeof beat.reasoning !== 'string') {
          throw new Error(`Invalid response structure from Gemini: Beat at index ${i} missing "reasoning"`);
        }
        if (typeof beat.actConstraint !== 'number') {
          throw new Error(`Invalid response structure from Gemini: Beat at index ${i} missing or invalid "actConstraint"`);
        }
      }
      
      // Save placement suggestions to beat notes
      modal.setStatus('Saving placement suggestions to beat notes...');
      
      const files = plugin.app.vault.getMarkdownFiles();
      let updateCount = 0;
      const unmatchedBeats: string[] = [];

      // Match beats by index
      for (let i = 0; i < analysis.beats.length; i++) {
        const beat = analysis.beats[i];
        const matchingBeat = plotBeats[i];

        if (!matchingBeat) {
          unmatchedBeats.push(beat.beatName);
          continue;
        }

        const file = matchingBeat.path ? plugin.app.vault.getAbstractFileByPath(matchingBeat.path) : null;
        if (!file || !(file instanceof TFile)) {
          unmatchedBeats.push(beat.beatName);
          continue;
        }

        // Update beat note with placement suggestion
        await plugin.app.fileManager.processFrontMatter(file, (yaml) => {
          const fm = yaml as Record<string, any>;
          
          // Set suggested placement if AI provided a recommendation
          if (beat.suggestedLocation && beat.suggestedLocation.trim() !== '') {
            fm['Suggest Placement'] = beat.suggestedLocation.trim();
            fm['Placement Reasoning'] = beat.reasoning;
          } else {
            // Clear previous suggestions if placement is now optimal
            delete fm['Suggest Placement'];
            delete fm['Placement Reasoning'];
          }
          
          // Add timestamp and model info
          const now = new Date();
          const timestamp = now.toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          });
          fm['Placement Last Analyzed'] = `${timestamp} by ${geminiModelId}`;
        });
        
        updateCount++;
    }
    
    // Log unmatched beats
    if (unmatchedBeats.length > 0) {
      modal.addError(`Could not match ${unmatchedBeats.length} beat(s): ${unmatchedBeats.join(', ')}`);
    }

      // Create analysis report
      modal.setStatus('Generating placement report...');
      
      const reportTimestamp = new Date();
      const timestamp = reportTimestamp.toLocaleString();
      
      const reportLines: string[] = [
        `# Beat Placement Optimization Report`,
        ``,
        `**Date:** ${timestamp}`,
        `**Beat System:** ${beatSystem}`,
        `**Model:** ${geminiModelId}`,
        `**Manuscript:** ${manuscript.totalScenes} scenes, ${manuscript.totalWords.toLocaleString()} words`,
        `**Beats Analyzed:** ${updateCount} of ${analysis.beats.length}`,
        ``,
        `## Overall Assessment`,
        ``,
        analysis.overallSummary,
        ``,
        `## Beat Placement Suggestions`,
        ``,
        `| Beat | Current | Suggested | Act | Reasoning |`,
        `|------|---------|-----------|-----|-----------|`,
      ];
      
      // Sort beats by current location (scene number) for chronological order
      const sortedBeats = [...analysis.beats].sort((a, b) => {
        const aNum = parseFloat(a.currentLocation) || 0;
        const bNum = parseFloat(b.currentLocation) || 0;
        return aNum - bNum;
      });
      
      for (const beat of sortedBeats) {
        const suggestion = beat.suggestedLocation.trim() !== '' ? beat.suggestedLocation : '✓ Optimal';
        reportLines.push(`| ${beat.beatName} | ${beat.currentLocation} | ${suggestion} | ${beat.actConstraint} | ${beat.reasoning} |`);
      }
      reportLines.push(``);
      
      // Add technical details section
      reportLines.push(`---`);
      reportLines.push(``);
      reportLines.push(`## Debug Information`);
      reportLines.push(``);
      reportLines.push(`### Manuscript Scenes Sent`);
      reportLines.push(``);
      reportLines.push(`The following ${manuscript.totalScenes} scenes were assembled and sent to Gemini:`);
      reportLines.push(``);
      manuscript.scenes.forEach((scene, idx) => {
        const wordCount = scene.wordCount || 0;
        reportLines.push(`${idx + 1}. ${scene.title || 'Untitled Scene'} (${wordCount.toLocaleString()} words)`);
      });
      reportLines.push(``);
      reportLines.push(`**Total Words:** ${manuscript.totalWords.toLocaleString()}`);
      reportLines.push(``);
      reportLines.push(`### Prompt Sent to Gemini`);
      reportLines.push(``);
      reportLines.push(`\`\`\`markdown`);
      reportLines.push(prompt);
      reportLines.push(`\`\`\``);
      reportLines.push(``);
      reportLines.push(`### JSON Response Received from Gemini`);
      reportLines.push(``);
      reportLines.push(`\`\`\`json`);
      reportLines.push(result.content || '');
      reportLines.push(`\`\`\``);
      reportLines.push(``);

      // Save report to AI folder (only if logging is enabled)
      let reportFile: TFile | undefined;
      if (plugin.settings.logApiInteractions) {
        const reportDate = new Date();
        const dateStr = reportDate.toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
        const timeStr = reportDate.toLocaleTimeString(undefined, {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        }).replace(/:/g, '.');

        const reportPath = `AI/Beat Placement ${dateStr} ${timeStr}.md`;

        try {
          await plugin.app.vault.createFolder('AI');
        } catch (e) {
          // Folder might already exist
      }

      reportFile = await plugin.app.vault.create(reportPath, reportLines.join('\n'));
      
      // Open the report
        const leaf = plugin.app.workspace.getLeaf('tab');
        await leaf.openFile(reportFile);
      }

      const logMessage = plugin.settings.logApiInteractions
        ? `✓ Updated ${updateCount} beats with placement suggestions. Report saved to AI folder.`
        : `✓ Updated ${updateCount} beats with placement suggestions. (Logging disabled - no report saved)`;

      modal.completeProcessing(true, `✓ Successfully analyzed ${updateCount} beat placements`);
      new Notice(logMessage);

    } catch (e) {
      const errorMsg = (e as Error)?.message || 'Unknown error';
      const errorStack = (e as Error)?.stack || 'No stack trace';
      
      // Log detailed error to console
      console.error('[Beat Placement] Error occurred:', {
        message: errorMsg,
        stack: errorStack,
        hasResult: !!result,
        resultSuccess: result?.success,
        hasContent: !!result?.content,
        contentLength: result?.content?.length || 0,
        error: e
      });
      
      modal.addError(`Processing failed: ${errorMsg}`);
      modal.completeProcessing(false, 'Processing failed');
      new Notice(`Failed to run beat placement optimization: ${errorMsg}`);
      
      // Always save an error report for debugging if logging is enabled
      if (plugin.settings.logApiInteractions) {
        try {
          const errorReportLines: string[] = [
            `# Beat Placement Error Report`,
            ``,
            `**Date:** ${new Date().toLocaleString()}`,
            `**Error:** ${errorMsg}`,
            ``,
            `## Error Details`,
            ``,
            `\`\`\``,
            errorStack,
            `\`\`\``,
            ``,
          ];
          
          // Add response information if available
          if (result) {
            errorReportLines.push(`## API Response Information`);
            errorReportLines.push(``);
            errorReportLines.push(`- Success: ${result.success}`);
            errorReportLines.push(`- Has Content: ${!!result.content}`);
            errorReportLines.push(`- Content Length: ${result.content?.length || 0} characters`);
            errorReportLines.push(`- Error from API: ${result.error || 'None'}`);
            errorReportLines.push(``);
            
            if (result.content) {
              errorReportLines.push(`## Raw Response from Gemini`);
              errorReportLines.push(``);
              errorReportLines.push(`\`\`\``);
              errorReportLines.push(result.content);
              errorReportLines.push(`\`\`\``);
              errorReportLines.push(``);
            }
            
            // Include the full response data structure for debugging
            if (result.responseData) {
              errorReportLines.push(`## Full Response Data Structure`);
              errorReportLines.push(``);
              errorReportLines.push(`\`\`\`json`);
              try {
                errorReportLines.push(JSON.stringify(result.responseData, null, 2));
              } catch {
                errorReportLines.push('Unable to stringify response data');
              }
              errorReportLines.push(`\`\`\``);
              errorReportLines.push(``);
            }
          } else {
            errorReportLines.push(`## API Response Information`);
            errorReportLines.push(``);
            errorReportLines.push(`No API response available - error occurred before API call or during processing.`);
            errorReportLines.push(``);
          }
          
          const errorReportDate = new Date();
          const dateStr = errorReportDate.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          });
          const timeStr = errorReportDate.toLocaleTimeString(undefined, {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          }).replace(/:/g, '.');
          
          const errorReportPath = `AI/Beat Placement ERROR ${dateStr} ${timeStr}.md`;
          
          const folder = plugin.app.vault.getAbstractFileByPath('AI');
          if (!folder) {
            await plugin.app.vault.createFolder('AI');
          }
          
          await plugin.app.vault.create(errorReportPath, errorReportLines.join('\n'));
          new Notice(`Error report saved to: ${errorReportPath}`);
        } catch (reportError) {
          console.error('[Beat Placement] Failed to save error report:', reportError);
        }
      }
    }
  };

  // Pre-gather manuscript info for confirmation view
  try {
    const allScenes = await plugin.getSceneData();
    let plotBeats = allScenes.filter(s => (s.itemType === 'Beat' || s.itemType === 'Plot'));
    
    const beatSystem = plugin.settings.beatSystem || 'Save The Cat';
    
    // Use centralized filtering helper (single source of truth)
    const { filterBeatsBySystem } = await import('./utils/gossamer');
    if (beatSystem && beatSystem.trim() !== '' && plotBeats.some(p => p["Beat Model"])) {
      plotBeats = filterBeatsBySystem(plotBeats, beatSystem);
    }
    
    // Get sorted scene files (single source of truth)
    const { getSortedSceneFiles } = await import('./utils/manuscript');
    const { files: sceneFiles } = await getSortedSceneFiles(plugin);

    // Quick manuscript assembly to get actual stats
    const manuscript = await assembleManuscript(sceneFiles, plugin.app.vault);
    const estimatedTokens = Math.ceil(manuscript.totalWords / 0.75);
    
    const manuscriptInfo: ManuscriptInfo = {
      totalScenes: manuscript.totalScenes,
      totalWords: manuscript.totalWords,
      estimatedTokens: estimatedTokens,
      beatCount: plotBeats.length,
      beatSystem: beatSystem
    };

    // Create modal with the processing callback
    const modal = new BeatPlacementModal(plugin.app, plugin, async () => {
      await processAnalysis(modal);
    });
    
    // Set manuscript info in confirmation view before opening
    modal.open();
    modal.setManuscriptInfo(manuscriptInfo);
    
  } catch (e) {
    const errorMsg = (e as Error)?.message || 'Unknown error';
    new Notice(`Failed to prepare beat placement analysis: ${errorMsg}`);
    console.error('[Beat Placement Pre-check]', e);
  }
}
