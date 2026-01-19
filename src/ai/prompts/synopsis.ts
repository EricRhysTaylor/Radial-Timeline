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
  extraInstructions?: string
): string {
  let instructions = extraInstructions ? extraInstructions.trim() + '\n\n' : '';

  return `${instructions}Read the scene below and write a factual synopsis (summary of events).
Return ONLY valid JSON matching this structure:

{
  "synopsis": "Character A does X, then Y happens..."
}

Rules:
1. FOCUS: Purely factual summary of what happens in the scene.
2. LENGTH: Concise (approx 50-75 words).
3. TONE: Neutral, objective, unadorned. No flowery prose.
4. CONTENT: Do NOT include analysis, critique, or "The scene is about...". Just the events.
5. FORMAT: Output ONLY valid JSON. No markdown fencing around the JSON.

Scene ${sceneNumber}:
${sceneBody || 'N/A'}
`;
}
