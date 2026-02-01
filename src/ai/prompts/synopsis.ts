/*
 * AI Synopsis Prompt Builder
 * Generates factual, non-stylized scene synopses
 */

const SYNOPSIS_JSON_SCHEMA = {
  type: "object",
  properties: {
    "synopsis": {
      type: "string",
      description: "Factual summary of scene events (max 50-75 words)"
    }
  },
  required: ["synopsis"]
};

export function getSynopsisJsonSchema() {
  return SYNOPSIS_JSON_SCHEMA;
}

export function getSynopsisSystemPrompt(): string {
  return `You are a precise, neutral summarizer for fiction manuscripts. Your goal is to generate short, purely factual summaries of scene events for an outline database. Do not critique, do not improve the prose, and do not use flowery language.`;
}

export function buildSynopsisPrompt(
  sceneBody: string,
  sceneNumber: string,
  targetWords: number = 300,
  extraInstructions?: string
): string {
  let instructions = extraInstructions ? extraInstructions.trim() + '\n\n' : '';

  // Calculate paragraph guidance based on target
  let paragraphGuidance = '2-3 paragraphs';
  if (targetWords < 150) {
    paragraphGuidance = '1-2 paragraphs';
  } else if (targetWords > 400) {
    paragraphGuidance = '3-4 paragraphs';
  }

  return `${instructions}Read the scene below and write a factual synopsis (summary of events).
Return ONLY valid JSON matching this structure:

{
  "synopsis": "Character A does X, then Y happens..."
}

Rules:
1. FOCUS: Purely factual summary of what happens in the scene.
2. LENGTH: Approximately ${targetWords} words (${paragraphGuidance}).
3. STRUCTURE: First paragraph covers main events. Second covers character actions/reactions. Optional third paragraph for setup or consequences.
4. TONE: Neutral, objective, unadorned. No flowery prose.
5. CONTENT: Do NOT include analysis, critique, or "The scene is about...". Just the events.
6. FORMAT: Output ONLY valid JSON. No markdown fencing around the JSON.

Scene ${sceneNumber}:
${sceneBody || 'N/A'}
`;
}
