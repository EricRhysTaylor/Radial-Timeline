/*
 * Beats Triplet Prompt Builder
 */

// JSON schema for beats response
const BEATS_JSON_SCHEMA = {
  type: "object",
  properties: {
    "1beats": {
      type: "array",
      items: {
        type: "object",
        properties: {
          scene: { type: "string", description: "Scene number" },
          title: { type: "string", description: "Short beat title" },
          grade: { type: "string", enum: ["+", "-", "?"], description: "Connection strength" },
          comment: { type: "string", description: "Editorial comment (max 10 words)" }
        },
        required: ["scene", "title", "grade", "comment"]
      }
    },
    "2beats": {
      type: "array",
      items: {
        type: "object",
        properties: {
          scene: { type: "string", description: "Scene number" },
          title: { type: "string", description: "Short beat title or grade (A/B/C for first item)" },
          grade: { type: "string", enum: ["+", "-", "?", "A", "B", "C"], description: "Grade or connection strength" },
          comment: { type: "string", description: "Editorial comment (max 15 words for first item, 10 for others)" }
        },
        required: ["scene", "title", "grade", "comment"]
      }
    },
    "3beats": {
      type: "array",
      items: {
        type: "object",
        properties: {
          scene: { type: "string", description: "Scene number" },
          title: { type: "string", description: "Short beat title" },
          grade: { type: "string", enum: ["+", "-", "?"], description: "Connection strength" },
          comment: { type: "string", description: "Editorial comment (max 10 words)" }
        },
        required: ["scene", "title", "grade", "comment"]
      }
    }
  },
  required: ["2beats"]
};

export function getBeatsJsonSchema() {
  return BEATS_JSON_SCHEMA;
}

export function buildBeatsPrompt(
  prevBody: string | null,
  currentBody: string,
  nextBody: string | null,
  prevNum: string,
  currentNum: string,
  nextNum: string,
  contextPrompt?: string
): string {
  // Build context prefix if provided
  const contextPrefix = contextPrompt?.trim() 
    ? `${contextPrompt.trim()}\n\n`
    : 'You are a developmental editor for a novel.\n\n';

  const isPrevAvailable = !!prevBody;
  const isNextAvailable = !!nextBody;

  // Boundary-specific prompts to reduce confusion for first/last scenes
  if (!isPrevAvailable && !isNextAvailable) {
    // Only one scene in manuscript (or both neighbors missing): evaluate current only
    return `${contextPrefix}Evaluate the single scene below. Return ONLY valid JSON matching this structure:

{
  "2beats": [
    {
      "scene": "${currentNum}",
      "title": "Overall Scene Grade",
      "grade": "A" or "B" or "C",
      "comment": "Instructions on how to improve it (max 15 words)"
    },
    {
      "scene": "${currentNum}",
      "title": "Beat title",
      "grade": "+" or "-" or "?",
      "comment": "Concise editorial comment (max 10 words)"
    }
    // ... 3-5 more beats
  ]
}

Rules:
- Output ONLY valid JSON. No markdown code blocks, no preamble, no commentary.
- First item in 2beats must have grade A/B/C (overall scene quality).
- Subsequent items use +/-/? for connection strength.
- Keep comments concise (first item max 15 words, others max 10 words).

Scene ${currentNum}:
${currentBody || 'N/A'}
`;
  }

  if (!isPrevAvailable && isNextAvailable) {
    // First scene: no previous, only 2beats and 3beats
    return `${contextPrefix}Evaluate the first scene in context of the following scene. Return ONLY valid JSON matching this structure:

{
  "2beats": [
    {
      "scene": "${currentNum}",
      "title": "Overall Scene Grade",
      "grade": "A" or "B" or "C",
      "comment": "Instructions on how to improve it (max 15 words)"
    },
    {
      "scene": "${currentNum}",
      "title": "Beat title",
      "grade": "+" or "-" or "?",
      "comment": "Editorial comment (max 10 words)"
    }
    // ... 3-5 more beats
  ],
  "3beats": [
    {
      "scene": "${nextNum}",
      "title": "Beat title",
      "grade": "+" or "-" or "?",
      "comment": "Editorial comment (max 10 words)"
    }
    // ... 3-5 more beats analyzing next scene
  ]
}

Rules:
- Output ONLY valid JSON. No markdown code blocks, no preamble.
- First 2beats item: grade A/B/C (overall quality). Others: +/-/? (connection strength).
- 3beats items: +/-/? showing how next scene builds on current.

Scene ${currentNum}:
${currentBody || 'N/A'}

Scene ${nextNum}:
${nextBody ?? 'N/A'}
`;
  }

  if (isPrevAvailable && !isNextAvailable) {
    // Last scene: no next, only 1beats and 2beats
    return `${contextPrefix}Evaluate the last scene in context of the previous scene. Return ONLY valid JSON matching this structure:

{
  "1beats": [
    {
      "scene": "${prevNum}",
      "title": "Beat title",
      "grade": "+" or "-" or "?",
      "comment": "Editorial comment (max 10 words)"
    }
    // ... 3-5 more beats analyzing previous scene
  ],
  "2beats": [
    {
      "scene": "${currentNum}",
      "title": "Overall Scene Grade",
      "grade": "A" or "B" or "C",
      "comment": "Instructions on how to improve it (max 15 words)"
    },
    {
      "scene": "${currentNum}",
      "title": "Beat title",
      "grade": "+" or "-" or "?",
      "comment": "Editorial comment (max 10 words)"
    }
    // ... 3-5 more beats
  ]
}

Rules:
- Output ONLY valid JSON. No markdown code blocks, no preamble.
- 1beats items: +/-/? showing how previous scene sets up current.
- First 2beats item: grade A/B/C (overall quality). Others: +/-/? (connection strength).

Scene ${prevNum}:
${prevBody ?? 'N/A'}

Scene ${currentNum}:
${currentBody || 'N/A'}
`;
  }

  return `${contextPrefix}For each of the three scenes below, generate concise narrative beats from the perspective of the middle scene (${currentNum}), showing connections between previous (${prevNum}) and next (${nextNum}) scenes. Return ONLY valid JSON matching this structure:

{
  "1beats": [
    {
      "scene": "${prevNum}",
      "title": "Beat title",
      "grade": "+" or "-" or "?",
      "comment": "Editorial comment (max 10 words)"
    }
    // ... 3-5 more beats analyzing how previous scene sets up current
  ],
  "2beats": [
    {
      "scene": "${currentNum}",
      "title": "Overall Scene Grade",
      "grade": "A" or "B" or "C",
      "comment": "Instructions on how to improve it (max 15 words)"
    },
    {
      "scene": "${currentNum}",
      "title": "Beat title",
      "grade": "+" or "-" or "?",
      "comment": "Editorial comment (max 10 words)"
    }
    // ... 3-5 more beats analyzing current scene
  ],
  "3beats": [
    {
      "scene": "${nextNum}",
      "title": "Beat title",
      "grade": "+" or "-" or "?",
      "comment": "Editorial comment (max 10 words)"
    }
    // ... 3-5 more beats analyzing how next scene builds on current
  ]
}

Rules:
- Output ONLY valid JSON. No markdown code blocks (no \`\`\`json), no preamble, no commentary.
- First 2beats item must have grade A/B/C (A=nearly perfect, C=needs improvement).
- All other items use +/-/?: "+" for strong connections, "-" for weak, "?" for neutral.
- Keep comments concise (first 2beats max 15 words, all others max 10 words).

Scene ${prevNum}:
${prevBody ?? 'N/A'}

Scene ${currentNum}:
${currentBody || 'N/A'}

Scene ${nextNum}:
${nextBody ?? 'N/A'}
`;
}


