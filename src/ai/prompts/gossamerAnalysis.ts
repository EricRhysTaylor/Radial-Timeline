/*
 * AI Gossamer Momentum Analysis Prompt Builder
 * Analyzes narrative momentum across story beats in full manuscript
 */

/**
 * JSON schema for Gemini Gossamer analysis response
 * Note: idealRange and isWithinRange are computed in code after AI response,
 * not requested from AI to avoid anchoring bias
 */
const GOSSAMER_ANALYSIS_JSON_SCHEMA = {
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
            description: "Name of the beat (matches beat note title without number prefix)" 
          },
          momentumScore: { 
            type: "number", 
            description: "Narrative momentum score 0-100",
            minimum: 0,
            maximum: 100
          },
          justification: {
            type: "string",
            description: "Brief justification for the momentum score (max 30 words)"
          }
        },
        required: ["beatName", "momentumScore", "justification"]
      }
    },
    overallAssessment: {
      type: "object",
      description: "Overall manuscript momentum assessment",
      properties: {
        summary: {
          type: "string",
          description: "Brief summary of overall momentum arc (max 50 words)"
        },
        strengths: {
          type: "array",
          items: { type: "string" },
          description: "List of 2-3 momentum strengths"
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

export function getGossamerAnalysisJsonSchema() {
  return GOSSAMER_ANALYSIS_JSON_SCHEMA;
}

export interface BeatWithRange {
  beatName: string;
  beatNumber: number;
  idealRange: string;
  previousScore?: number;           // Previous Gossamer1 score (if exists)
  previousJustification?: string;   // Previous Gossamer1 Justification (if exists)
}

/**
 * Build Gossamer analysis prompt for Gemini
 * @param manuscriptText - Full manuscript text with scene headings
 * @param beats - Array of story beats with their ideal momentum ranges (and previous scores if re-analyzing)
 * @param beatSystem - Name of the beat system (e.g., "Save The Cat")
 * @returns Prompt string for Gemini API
 */
export function buildGossamerAnalysisPrompt(
  manuscriptText: string,
  beats: BeatWithRange[],
  beatSystem: string
): string {
  // Check if we have any previous analysis
  const hasPreviousAnalysis = beats.some(b => b.previousScore !== undefined);
  
  // Build beat list - ranges intentionally omitted to avoid anchoring bias
  // AI should assess momentum based purely on manuscript content
  const beatList = beats
    .map((b, i) => {
      let line = `${i + 1}. ${b.beatName}`;
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
PREVIOUS ANALYSIS:
You previously analyzed this manuscript and assigned momentum scores to each beat (shown above as "Previous Score" and "Previous Justification"). 

Re-evaluate the manuscript with fresh eyes. You may:
- Confirm your previous scores if they still seem accurate
- Adjust scores up or down based on deeper understanding
- Refine your justifications for greater clarity

Your new analysis should reflect your best current judgment of the manuscript's momentum.

` : '';

  const prompt = `You are analyzing narrative momentum across a full manuscript using the ${beatSystem} beat system.

BEAT STRUCTURE:
${beatList}

MOMENTUM SCALE (0-100):
- 0-20: Quiet, establishing, low tension
- 21-40: Building, complications emerging
- 41-60: Rising stakes, conflict developing
- 61-80: High tension, major conflicts
- 81-100: Peak tension, climactic moments

${previousAnalysisSection}TASK:
Read the full manuscript below and evaluate the narrative momentum at each story beat. For each beat, assign a momentum score (0-100) that reflects the tension, stakes, and emotional intensity at that point in the story.

Consider:
- Tension and conflict level
- Stakes for protagonist
- Emotional intensity
- Pacing and urgency
- Reader engagement

Return ONLY valid JSON matching this structure (no markdown, no preamble):

{
  "beats": [
    {
      "beatName": "Opening Image",
      "momentumScore": 15,
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
