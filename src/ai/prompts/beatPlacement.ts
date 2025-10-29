/*
 * Beat Placement Optimization Prompt Builder
 * Separate from Gossamer momentum analysis - focuses on optimal structural placement
 */

export interface BeatPlacementInfo {
  beatName: string;
  beatNumber: number;
  currentActNumber: number;
  currentScenePosition?: string; // Where beat note currently appears (e.g., "33.5")
  idealPercentage?: number; // Expected percentage for this beat in the beat system
}

/**
 * JSON schema for Beat Placement analysis response
 */
const BEAT_PLACEMENT_JSON_SCHEMA = {
  type: "object",
  properties: {
    beats: {
      type: "array",
      description: "Placement suggestions for each story beat",
      items: {
        type: "object",
        properties: {
          beatName: { 
            type: "string", 
            description: "Name of the beat (matches beat note title without number prefix)" 
          },
          currentLocation: {
            type: "string",
            description: "Current scene number where beat appears"
          },
          suggestedLocation: {
            type: "string",
            description: "Suggested scene number for optimal placement, or empty string if current placement is optimal"
          },
          actConstraint: {
            type: "number",
            description: "Act number that this beat must remain in (1, 2, or 3)"
          },
          reasoning: {
            type: "string",
            description: "Brief explanation (max 15 words) - ONLY if suggesting a move"
          }
        },
        required: ["beatName", "currentLocation", "suggestedLocation", "actConstraint", "reasoning"]
      }
    },
    overallSummary: {
      type: "string",
      description: "One sentence summary of beat placement quality"
    }
  },
  required: ["beats", "overallSummary"]
};

export function getBeatPlacementJsonSchema() {
  return BEAT_PLACEMENT_JSON_SCHEMA;
}

/**
 * Build Beat Placement optimization prompt for AI
 * @param manuscriptText - Full manuscript text with scene headings
 * @param beats - Array of story beats with their current positions and constraints
 * @param beatSystem - Name of the beat system (e.g., "Save The Cat")
 * @returns Prompt string for AI
 */
export function buildBeatPlacementPrompt(
  manuscriptText: string,
  beats: BeatPlacementInfo[],
  beatSystem: string
): string {
  
  // Build beat list with current positions and act constraints
  const beatList = beats
    .map((b, i) => {
      let line = `${i + 1}. ${b.beatName}`;
      if (b.currentScenePosition) {
        line += ` (currently at scene ${b.currentScenePosition})`;
      }
      line += ` - MUST REMAIN IN ACT ${b.currentActNumber}`;
      if (b.idealPercentage !== undefined) {
        line += ` - ideal at ${b.idealPercentage}% through story`;
      }
      return line;
    })
    .join('\n');

  const prompt = `You are a story structure expert analyzing beat placement in a manuscript using the ${beatSystem} beat system.

BEAT STRUCTURE:
${beatList}

TASK:
Read the manuscript below and determine if each story beat is optimally placed. For each beat:
- If placement is good: leave suggestedLocation empty ("")
- If beat should move: specify the target scene number (e.g., "33.5")
- Each beat MUST stay within its assigned act
- Keep reasoning under 15 words and ONLY provide if suggesting a move

Return ONLY valid JSON (no markdown):

{
  "beats": [
    {
      "beatName": "Opening Image",
      "currentLocation": "1",
      "suggestedLocation": "",
      "actConstraint": 1,
      "reasoning": "Optimal at opening"
    },
    {
      "beatName": "Midpoint",
      "currentLocation": "28",
      "suggestedLocation": "33.5",
      "actConstraint": 2,
      "reasoning": "Should hit at 50% mark"
    }
  ],
  "overallSummary": "One sentence about overall beat placement quality"
}

MANUSCRIPT:

${manuscriptText}`;

  return prompt;
}
