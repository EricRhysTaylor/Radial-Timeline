/*
 * Gossamer Prompt Builder - Full Manuscript Analysis
 */
import { extractBeatOrder } from '../../utils/gossamer';

export function buildGossamerPrompt(
  manuscriptText: string,
  beatSystem: string,
  beatOrder: string[],
  contextPrompt?: string
): string {
  if (!beatOrder.length) {
    throw new Error('No story beats found. Cannot build Gossamer prompt. Create notes with frontmatter "Class: Beat" (or "Class: Plot" for backward compatibility).');
  }

  const firstBeatName = beatOrder[0];
  
  // Build context prefix if provided
  const contextPrefix = contextPrompt?.trim()
    ? `${contextPrompt.trim()}\n\n`
    : 'You are a developmental editor analyzing a complete manuscript for plot momentum and beat placement.\n\n';
  
  // Build the comprehensive analysis prompt
  const prompt = `${contextPrefix}

You are analyzing a complete manuscript against the ${beatSystem} story structure model.

MANUSCRIPT:
${manuscriptText}

STORY BEATS (${beatSystem}):
The manuscript should align with these beats in order:
${beatOrder.map((beat, idx) => `${idx + 1}. ${beat}`).join('\n')}

YOUR TASK:
1. Read the entire manuscript carefully, noting the scene titles and their numeric order (e.g., "=== 44 Michi Updates Rel Newlan ===")
2. Evaluate how well the manuscript aligns with each ${beatSystem} beat
3. Rate each beat's momentum/suspense on a 0-100 scale (0 = lowest tension, 100 = highest)
4. Provide concrete guidance for each beat

REQUIRED JSON OUTPUT FORMAT:
{
  "beats": [
    {
      "beat": "${firstBeatName}",
      "score": 0,
      "note": "Opening establishes world effectively"
    },
    {
      "beat": "Midpoint",
      "score": 72,
      "note": "Strong reversal creates new stakes"
    }
  ],
  "overall": {
    "summary": "2-3 sentences summarizing the manuscript's overall pacing and momentum."
  }
}

RULES:
- First beat ("${firstBeatName}") must have score of 0 (baseline)
- "score": 0-100 number representing tension/momentum at that beat
- "note": one concise sentence of guidance for this beat
- Only output the JSON object, no markdown fences, no commentary
- Base your analysis on the actual manuscript content and scene order you see
`;

  return prompt;
}
