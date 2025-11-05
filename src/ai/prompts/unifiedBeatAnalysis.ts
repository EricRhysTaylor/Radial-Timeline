/*
 * Unified Beat Analysis Prompt Builder
 * Combines Gossamer momentum scoring and beat placement optimization into a single AI submission
 */

export interface UnifiedBeatInfo {
  beatName: string;
  beatNumber: number;
  idealRange: string; // e.g., "0-20"
  previousScore?: number; // For Gossamer2-30 iterations
  previousJustification?: string; // For Gossamer2-30 iterations
}

/**
 * JSON schema for unified beat analysis response
 */
const UNIFIED_BEAT_ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    beats: {
      type: "array",
      description: "Momentum analysis for each story beat",
      items: {
        type: "object",
        properties: {
          beatName: { 
            type: "string", 
            description: "Name of the beat" 
          },
          momentumScore: { 
            type: "number", 
            description: "Narrative momentum score 0-100",
            minimum: 0,
            maximum: 100
          },
          idealRange: {
            type: "string",
            description: "Ideal momentum range for this beat"
          },
          isWithinRange: {
            type: "boolean",
            description: "True if momentum score is within ideal range"
          },
          justification: {
            type: "string",
            description: "Brief justification for the score (one sentence)"
          }
        },
        required: ["beatName", "momentumScore", "idealRange", "isWithinRange", "justification"]
      }
    },
    overallAssessment: {
      type: "object",
      description: "Overall manuscript assessment",
      properties: {
        summary: {
          type: "string",
          description: "Brief summary of overall momentum (max 30 words)"
        },
        strengths: {
          type: "array",
          items: { type: "string" },
          description: "List of 2-3 strengths"
        },
        improvements: {
          type: "array",
          items: { type: "string" },
          description: "List of 2-3 suggested improvements"
        }
      },
      required: ["summary", "strengths", "improvements"]
    }
  },
  required: ["beats", "overallAssessment"]
};

export function getUnifiedBeatAnalysisJsonSchema() {
  return UNIFIED_BEAT_ANALYSIS_SCHEMA;
}

/**
 * Build unified beat analysis prompt
 * @param manuscriptText - Full manuscript text with table of contents and scene headings
 * @param beats - Array of story beats with ranges and previous scores
 * @param beatSystem - Name of the beat system (e.g., "Save The Cat")
 * @returns Prompt string for Gemini API
 */
export function buildUnifiedBeatAnalysisPrompt(
  manuscriptText: string,
  beats: UnifiedBeatInfo[],
  beatSystem: string
): string {
  
  const hasPreviousAnalysis = beats.some(b => b.previousScore !== undefined);
  
  // Build beat list
  const beatList = beats
    .map((b, i) => {
      let line = `${i + 1}. ${b.beatName} (ideal momentum: ${b.idealRange})`;
      
      // Add previous score info for comparison
      if (b.previousScore !== undefined) {
        line += `\n   Previous Score: ${b.previousScore}/100`;
        if (b.previousJustification) {
          line += `\n   Previous Justification: "${b.previousJustification}"`;
        }
      }
      
      return line;
    })
    .join('\n');

  const previousAnalysisSection = hasPreviousAnalysis ? `
ITERATIVE REFINEMENT:
Previous scores are shown above. Compare and adjust based on deeper understanding.

` : '';

  const prompt = `You are analyzing narrative momentum in a manuscript using the ${beatSystem} beat system.

BEAT STRUCTURE:
${beatList}

MOMENTUM SCALE (0-100):
- 0-20: Quiet, establishing, low tension
- 21-40: Building, complications emerging
- 41-60: Rising stakes, conflict developing
- 61-80: High tension, major conflicts
- 81-100: Peak tension, climactic moments

${previousAnalysisSection}YOUR TASK:
Use the table of contents to locate each beat. Read the manuscript and score the narrative momentum at each story beat.

- Assign momentum score (0-100) for tension/stakes at each beat
- Provide brief justification (one sentence)
- Consider: tension level, stakes, emotional intensity

Return ONLY valid JSON (no markdown, no preamble):

{
  "beats": [
    {
      "beatName": "Opening Image",
      "momentumScore": 15,
      "idealRange": "0-20",
      "isWithinRange": true,
      "justification": "Establishes quiet status quo before inciting incident"
    }
    // ... for each beat
  ],
  "overallAssessment": {
    "summary": "Brief assessment of overall momentum arc",
    "strengths": ["Strength 1", "Strength 2"],
    "improvements": ["Improvement 1", "Improvement 2"]
  }
}

MANUSCRIPT:

${manuscriptText}`;

  return prompt;
}

