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
  const beatList = beats
    .map((b, i) => {
      const parts = [
        `${i + 1}. ${b.beatName}`,
        `ideal range: ${b.idealRange}`
      ];
      if (typeof b.previousScore === 'number') {
        parts.push(`previous score: ${b.previousScore}`);
      }
      if (b.previousJustification) {
        parts.push(`previous note: ${b.previousJustification}`);
      }
      return parts.join(' | ');
    })
    .join('\n');

  const prompt = `Beat system: ${beatSystem}

Story beats (oldest history first):
${beatList}

Score momentum (0-100) for each listed beat, include a short justification, and set isWithinRange by comparing to the ideal range. Respond strictly in the JSON schema that accompanies this prompt.

Manuscript text (table of contents followed by scenes):
${manuscriptText}`;

  return prompt;
}
