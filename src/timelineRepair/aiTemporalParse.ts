/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 *
 * Timeline Repair Wizard - Level 3: AI Temporal Parse
 * Optional AI-powered inference for complex temporal language.
 */

import type RadialTimelinePlugin from '../main';
import type { RepairSceneEntry, AiTemporalResponse, WhenConfidence } from './types';
import { getAIClient } from '../ai/runtime/aiClient';
import { parseWhenField } from '../utils/date';

// ============================================================================
// AI Prompt Template
// ============================================================================

const SYSTEM_PROMPT = `You are a temporal analysis assistant for fiction manuscripts. Your task is to infer the date and time when a scene takes place based on textual evidence.

You will receive:
1. The scene's current proposed date/time (from pattern-based or keyword analysis)
2. The previous scene's date/time (for reference)
3. An excerpt from the scene text

Your job is to:
1. Look for temporal cues in the text (dates, times, time-of-day indicators, relative time references)
2. Determine if the current proposed date/time is accurate
3. Suggest a correction if needed, with supporting evidence

IMPORTANT RULES:
- Only suggest changes if you find clear textual evidence
- Prefer relative adjustments ("next morning", "two days later") over inventing specific dates
- If no temporal cues are found, confirm the current proposal with low confidence
- Always quote the specific text that supports your analysis

Respond in valid JSON matching this schema:
{
  "whenSuggestion": "YYYY-MM-DD HH:MM or relative description",
  "confidence": "high" | "med" | "low",
  "evidenceQuotes": ["quote1", "quote2"],
  "durationSuggestion": null | number (milliseconds),
  "durationOngoing": false | true,
  "rationale": "Brief explanation of your reasoning"
}`;

/**
 * Build the user prompt for AI temporal analysis.
 */
function buildUserPrompt(
    entry: RepairSceneEntry,
    previousWhen: Date | null,
    sceneText: string,
    maxChars: number = 3000
): string {
    // Truncate text if needed
    const excerpt = sceneText.length > maxChars 
        ? sceneText.substring(0, maxChars) + '\n[...truncated...]'
        : sceneText;
    
    const prevWhenStr = previousWhen 
        ? formatDateForPrompt(previousWhen)
        : 'N/A (this is the first scene)';
    
    const currentWhenStr = formatDateForPrompt(entry.proposedWhen);
    
    return `## Scene Analysis Request

**Scene Title:** ${entry.scene.title || 'Untitled'}
**Manuscript Position:** Scene ${entry.manuscriptIndex + 1}

**Previous Scene When:** ${prevWhenStr}
**Current Proposed When:** ${currentWhenStr}
**Current Source:** ${entry.source} (confidence: ${entry.confidence})

## Scene Excerpt

${excerpt}

---

Analyze the temporal context and provide your assessment in JSON format.`;
}

/**
 * Format a date for the AI prompt.
 */
function formatDateForPrompt(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hour}:${minute}`;
}

// ============================================================================
// Response Parsing
// ============================================================================

/**
 * Parse the AI response JSON.
 */
function parseAiResponse(content: string): AiTemporalResponse | null {
    try {
        // Try to extract JSON from the response
        let jsonStr = content.trim();
        
        // Handle markdown code blocks
        const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            jsonStr = jsonMatch[1].trim();
        }
        
        const parsed = JSON.parse(jsonStr);
        
        // Validate required fields
        if (!parsed.whenSuggestion || !parsed.confidence) {
            return null;
        }
        
        // Normalize confidence
        const validConfidence = ['high', 'med', 'low'];
        const confidence = validConfidence.includes(parsed.confidence) 
            ? parsed.confidence as WhenConfidence
            : 'low';
        
        return {
            whenSuggestion: String(parsed.whenSuggestion),
            confidence,
            evidenceQuotes: Array.isArray(parsed.evidenceQuotes) 
                ? parsed.evidenceQuotes.map(String)
                : [],
            durationSuggestion: typeof parsed.durationSuggestion === 'number' 
                ? parsed.durationSuggestion 
                : undefined,
            durationOngoing: parsed.durationOngoing === true,
            rationale: typeof parsed.rationale === 'string' 
                ? parsed.rationale 
                : undefined
        };
    } catch {
        return null;
    }
}

/**
 * Interpret the AI's whenSuggestion into a concrete Date.
 */
function interpretWhenSuggestion(
    suggestion: string,
    currentWhen: Date,
    previousWhen: Date | null
): Date | null {
    // First, try direct date parsing
    const parsed = parseWhenField(suggestion);
    if (parsed) {
        return parsed;
    }
    
    // Handle relative suggestions
    const lower = suggestion.toLowerCase();
    const baseDate = previousWhen ?? currentWhen;
    
    // "next morning", "the following morning"
    if (/next\s+morning|following\s+morning/.test(lower)) {
        const result = new Date(baseDate);
        result.setDate(result.getDate() + 1);
        result.setHours(8, 0, 0, 0);
        return result;
    }
    
    // "same day, evening"
    if (/same\s+day.*evening|that\s+evening/.test(lower)) {
        const result = new Date(baseDate);
        result.setHours(19, 0, 0, 0);
        return result;
    }
    
    // "X days later"
    const daysMatch = lower.match(/(\d+)\s+days?\s+later/);
    if (daysMatch) {
        const days = parseInt(daysMatch[1], 10);
        const result = new Date(baseDate);
        result.setDate(result.getDate() + days);
        return result;
    }
    
    // "X weeks later"
    const weeksMatch = lower.match(/(\d+)\s+weeks?\s+later/);
    if (weeksMatch) {
        const weeks = parseInt(weeksMatch[1], 10);
        const result = new Date(baseDate);
        result.setDate(result.getDate() + weeks * 7);
        return result;
    }
    
    // "immediately after", "moments later"
    if (/immediately|moments?\s+later|right\s+after/.test(lower)) {
        const result = new Date(baseDate);
        result.setMinutes(result.getMinutes() + 5);
        return result;
    }
    
    // Couldn't interpret
    return null;
}

// ============================================================================
// Main AI Parse Function
// ============================================================================

export interface AiTemporalParseOptions {
    /** Maximum excerpt length to send to AI */
    maxExcerptChars?: number;
    
    /** Minimum confidence to auto-apply AI suggestion */
    autoApplyThreshold?: WhenConfidence;
    
    /** Include duration inference */
    inferDuration?: boolean;
    
    /** Progress callback */
    onProgress?: (current: number, total: number, sceneName: string) => void;
    
    /** Abort signal for cancellation */
    abortSignal?: AbortSignal;
}

const DEFAULT_OPTIONS: AiTemporalParseOptions = {
    maxExcerptChars: 3000,
    autoApplyThreshold: 'med',
    inferDuration: false
};

/**
 * Level 3: AI Temporal Parse
 * 
 * Uses AI to infer temporal information from complex or implicit
 * temporal language that keyword patterns can't capture.
 * 
 * Key behaviors:
 * - AI never writes directly to YAML
 * - Confidence thresholds gate auto-application
 * - Low-confidence results get needsReview flag
 * - Duration inference is optional
 * 
 * @param entries - RepairSceneEntry array from Level 1/2
 * @param plugin - Plugin instance for API access
 * @param getSceneText - Function to retrieve scene body text
 * @param options - AI parse configuration
 * @returns Modified entries with AI refinements
 */
export async function runAiTemporalParse(
    entries: RepairSceneEntry[],
    plugin: RadialTimelinePlugin,
    getSceneText: (entry: RepairSceneEntry) => Promise<string>,
    options: AiTemporalParseOptions = {}
): Promise<RepairSceneEntry[]> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    
    // Filter to entries that might benefit from AI analysis
    // Skip entries that are already high confidence from keywords
    const candidateIndices: number[] = [];
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        // Run AI on entries that:
        // 1. Are still pattern-only (no keyword refinement)
        // 2. Have needsReview flag
        // 3. Have backward time issues
        if (entry.source === 'pattern' || entry.needsReview || entry.hasBackwardTime) {
            candidateIndices.push(i);
        }
    }
    
    // Process candidates
    for (let ci = 0; ci < candidateIndices.length; ci++) {
        const i = candidateIndices[ci];
        const entry = entries[i];
        const previousEntry = i > 0 ? entries[i - 1] : null;
        
        // Check for abort
        if (opts.abortSignal?.aborted) {
            break;
        }
        
        // Progress callback
        if (opts.onProgress) {
            opts.onProgress(ci + 1, candidateIndices.length, entry.scene.title || 'Untitled');
        }
        
        try {
            // Get scene text
            const sceneText = await getSceneText(entry);
            
            // Build prompt
            const userPrompt = buildUserPrompt(
                entry,
                previousEntry?.proposedWhen ?? null,
                sceneText,
                opts.maxExcerptChars
            );
            
            // Call AI
            const aiClient = getAIClient(plugin);
            const run = await aiClient.run({
                feature: 'TimelineRepairAI',
                task: 'TemporalInference',
                requiredCapabilities: ['jsonStrict', 'reasoningStrong'],
                featureModeInstructions: SYSTEM_PROMPT,
                userInput: userPrompt,
                returnType: 'json',
                responseSchema: {
                    type: 'object',
                    properties: {
                        whenSuggestion: { type: 'string' },
                        confidence: { type: 'string' },
                        evidenceQuotes: { type: 'array', items: { type: 'string' } },
                        durationSuggestion: { type: 'number' },
                        durationOngoing: { type: 'boolean' },
                        rationale: { type: 'string' }
                    },
                    required: ['whenSuggestion', 'confidence']
                },
                overrides: {
                    temperature: 0.3,
                    maxOutputMode: 'auto',
                    reasoningDepth: 'standard',
                    jsonStrict: true
                }
            });
            
            if (run.aiStatus !== 'success' || !run.content) {
                continue;
            }
            
            // Parse response
            const aiResponse = parseAiResponse(run.content);
            if (!aiResponse) {
                continue;
            }
            
            // Interpret the suggestion
            const interpretedWhen = interpretWhenSuggestion(
                aiResponse.whenSuggestion,
                entry.proposedWhen,
                previousEntry?.proposedWhen ?? null
            );
            
            if (!interpretedWhen) {
                // Couldn't interpret, but store the rationale
                entry.aiRationale = aiResponse.rationale;
                entry.aiEvidence = aiResponse.evidenceQuotes;
                continue;
            }
            
            // Determine if we should auto-apply
            const shouldAutoApply = shouldApplyConfidence(
                aiResponse.confidence,
                opts.autoApplyThreshold ?? 'med'
            );
            
            if (shouldAutoApply) {
                // Apply the AI suggestion
                entry.proposedWhen = interpretedWhen;
                entry.source = 'ai';
                entry.confidence = aiResponse.confidence;
                entry.isChanged = entry.originalWhen === null ||
                    interpretedWhen.getTime() !== entry.originalWhen.getTime();
            } else {
                // Mark for review but store the suggestion
                entry.needsReview = true;
            }
            
            // Store AI evidence
            entry.aiEvidence = aiResponse.evidenceQuotes;
            entry.aiRationale = aiResponse.rationale;
            
            // Handle duration if enabled
            if (opts.inferDuration && aiResponse.durationSuggestion) {
                entry.proposedDuration = aiResponse.durationSuggestion;
                entry.durationSource = 'ai';
                entry.durationOngoing = aiResponse.durationOngoing;
            }
            
        } catch (error) {
            // Log but continue
            console.warn(`[AI Temporal Parse] Error processing scene ${i}:`, error);
        }
    }
    
    // Re-detect temporal issues after AI refinement
    detectTemporalIssuesAfterAi(entries);
    
    return entries;
}

/**
 * Check if AI confidence meets the auto-apply threshold.
 */
function shouldApplyConfidence(
    aiConfidence: WhenConfidence,
    threshold: WhenConfidence
): boolean {
    const order: Record<WhenConfidence, number> = { high: 2, med: 1, low: 0 };
    return order[aiConfidence] >= order[threshold];
}

/**
 * Re-detect temporal issues after AI pass.
 */
function detectTemporalIssuesAfterAi(entries: RepairSceneEntry[]): void {
    if (entries.length < 2) return;
    
    // Calculate median gap
    const gaps: number[] = [];
    for (let i = 1; i < entries.length; i++) {
        const prev = entries[i - 1].proposedWhen;
        const curr = entries[i].proposedWhen;
        gaps.push(curr.getTime() - prev.getTime());
    }
    
    if (gaps.length === 0) return;
    
    const sortedGaps = [...gaps].sort((a, b) => a - b);
    const medianGap = sortedGaps[Math.floor(sortedGaps.length / 2)];
    const largeGapThreshold = medianGap * 5;
    
    // Detect issues
    for (let i = 1; i < entries.length; i++) {
        const prevWhen = entries[i - 1].proposedWhen;
        const currWhen = entries[i].proposedWhen;
        const gap = currWhen.getTime() - prevWhen.getTime();
        
        // Only update backward time flag (preserve other flags)
        entries[i].hasBackwardTime = gap < 0;
        
        if (gap < 0) {
            entries[i].needsReview = true;
        }
        
        // Large gap
        if (largeGapThreshold > 0 && gap > largeGapThreshold) {
            entries[i].hasLargeGap = true;
        }
    }
}
