/*
 * AI Scene Analysis Prompt Builder
 * This analyzes scene performance, not story beats (timeline slices)
 */

// JSON schema for AI scene analysis response
const SCENE_ANALYSIS_JSON_SCHEMA = {
  type: "object",
  properties: {
    "previousSceneAnalysis": {
      type: "array",
      items: {
        type: "object",
        properties: {
          scene: { type: "string", description: "Scene number" },
          title: { type: "string", description: "Short analysis title" },
          grade: { type: "string", enum: ["+", "-", "?"], description: "Connection strength" },
          comment: { type: "string", description: "Editorial comment (max 10 words)" }
        },
        required: ["scene", "title", "grade", "comment"]
      }
    },
    "currentSceneAnalysis": {
      type: "array",
      items: {
        type: "object",
        properties: {
          scene: { type: "string", description: "Scene number" },
          title: { type: "string", description: "Short analysis title or grade (A/B/C for first item)" },
          grade: { type: "string", enum: ["+", "-", "?", "A", "B", "C"], description: "Grade or connection strength" },
          comment: { type: "string", description: "Editorial comment (max 15 words for first item, 10 for others)" }
        },
        required: ["scene", "title", "grade", "comment"]
      }
    },
    "nextSceneAnalysis": {
      type: "array",
      items: {
        type: "object",
        properties: {
          scene: { type: "string", description: "Scene number" },
          title: { type: "string", description: "Short analysis title" },
          grade: { type: "string", enum: ["+", "-", "?"], description: "Connection strength" },
          comment: { type: "string", description: "Editorial comment (max 10 words)" }
        },
        required: ["scene", "title", "grade", "comment"]
      }
    }
  },
  required: ["currentSceneAnalysis"]
};

export function getSceneAnalysisJsonSchema() {
  return SCENE_ANALYSIS_JSON_SCHEMA;
}

export function buildSceneAnalysisPrompt(
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
    : 'You are a developmental editor for fiction. Keep analysis suitable for general audiences; avoid explicit detail.\n\n';

  const isPrevAvailable = !!prevBody;
  const isNextAvailable = !!nextBody;

  // Boundary-specific prompts to reduce confusion for first/last scenes
  if (!isPrevAvailable && !isNextAvailable) {
    // Only one scene in manuscript (or both neighbors missing): evaluate current only
    return `${contextPrefix}Evaluate the single scene below. Return ONLY valid JSON matching this structure:

{
  "currentSceneAnalysis": [
    {
      "scene": "${currentNum}",
      "title": "Overall Scene Grade",
      "grade": "A" or "B" or "C",
      "comment": "Instructions on how to improve it (max 15 words)"
    },
    {
      "scene": "${currentNum}",
      "title": "Pulse point title",
      "grade": "+" or "-" or "?",
      "comment": "Concise editorial comment (max 10 words)"
    }
    // ... 3-5 more pulse points
  ]
}

Rules:
- Output ONLY valid JSON. No markdown code blocks, no preamble, no commentary.
- First item in currentSceneAnalysis must have grade A/B/C (overall scene quality).
- Subsequent items use +/-/? for connection strength.
- Keep comments concise (first item max 15 words, others max 10 words).

Scene ${currentNum}:
${currentBody || 'N/A'}
`;
  }

  if (!isPrevAvailable && isNextAvailable) {
    // First scene: no previous, only currentSceneAnalysis and nextSceneAnalysis
    return `${contextPrefix}Evaluate the first scene in context of the following scene. Return ONLY valid JSON matching this structure:

{
  "currentSceneAnalysis": [
    {
      "scene": "${currentNum}",
      "title": "Overall Scene Grade",
      "grade": "A" or "B" or "C",
      "comment": "Instructions on how to improve it (max 15 words)"
    },
    {
      "scene": "${currentNum}",
      "title": "Pulse point title",
      "grade": "+" or "-" or "?",
      "comment": "Editorial comment (max 10 words)"
    }
    // ... 3-5 more pulse points
  ],
  "nextSceneAnalysis": [
    {
      "scene": "${nextNum}",
      "title": "Pulse point title",
      "grade": "+" or "-" or "?",
      "comment": "Editorial comment (max 10 words)"
    }
    // ... 3-5 more pulse points analyzing next scene
  ]
}

Rules:
- Output ONLY valid JSON. No markdown code blocks, no preamble.
- First currentSceneAnalysis item: grade A/B/C (overall quality). Others: +/-/? (connection strength).
- nextSceneAnalysis items: +/-/? showing how next scene builds on current.

Scene ${currentNum}:
${currentBody || 'N/A'}

Scene ${nextNum}:
${nextBody ?? 'N/A'}
`;
  }

  if (isPrevAvailable && !isNextAvailable) {
    // Last scene: no next, only previousSceneAnalysis and currentSceneAnalysis
    return `${contextPrefix}Evaluate the last scene in context of the previous scene. Return ONLY valid JSON matching this structure:

{
  "previousSceneAnalysis": [
    {
      "scene": "${prevNum}",
      "title": "Pulse point title",
      "grade": "+" or "-" or "?",
      "comment": "Editorial comment (max 10 words)"
    }
    // ... 3-5 more pulse points analyzing previous scene
  ],
  "currentSceneAnalysis": [
    {
      "scene": "${currentNum}",
      "title": "Overall Scene Grade",
      "grade": "A" or "B" or "C",
      "comment": "Instructions on how to improve it (max 15 words)"
    },
    {
      "scene": "${currentNum}",
      "title": "Pulse point title",
      "grade": "+" or "-" or "?",
      "comment": "Editorial comment (max 10 words)"
    }
    // ... 3-5 more pulse points
  ]
}

Rules:
- Output ONLY valid JSON. No markdown code blocks, no preamble.
- previousSceneAnalysis items: +/-/? showing how previous scene sets up current.
- First currentSceneAnalysis item: grade A/B/C (overall quality). Others: +/-/? (connection strength).

Scene ${prevNum}:
${prevBody ?? 'N/A'}

Scene ${currentNum}:
${currentBody || 'N/A'}
`;
  }

  return `${contextPrefix}For each of the three scenes below, generate concise narrative pulse points from the perspective of the middle scene (${currentNum}), showing connections between previous (${prevNum}) and next (${nextNum}) scenes. Return ONLY valid JSON matching this structure:

{
  "previousSceneAnalysis": [
    {
      "scene": "${prevNum}",
      "title": "Pulse point title",
      "grade": "+" or "-" or "?",
      "comment": "Editorial comment (max 10 words)"
    }
    // ... 3-5 more pulse points analyzing how previous scene sets up current
  ],
  "currentSceneAnalysis": [
    {
      "scene": "${currentNum}",
      "title": "Overall Scene Grade",
      "grade": "A" or "B" or "C",
      "comment": "Instructions on how to improve it (max 15 words)"
    },
    {
      "scene": "${currentNum}",
      "title": "Pulse point title",
      "grade": "+" or "-" or "?",
      "comment": "Editorial comment (max 10 words)"
    }
    // ... 3-5 more pulse points analyzing current scene
  ],
  "nextSceneAnalysis": [
    {
      "scene": "${nextNum}",
      "title": "Pulse point title",
      "grade": "+" or "-" or "?",
      "comment": "Editorial comment (max 10 words)"
    }
    // ... 3-5 more pulse points analyzing how next scene builds on current
  ]
}

Rules:
- Output ONLY valid JSON. No markdown code blocks (no \`\`\`json), no preamble, no commentary.
- First currentSceneAnalysis item must have grade A/B/C (A=nearly perfect, C=needs improvement).
- All other items use +/-/?: "+" for strong connections, "-" for weak, "?" for neutral.
- Keep comments concise (first currentSceneAnalysis max 15 words, all others max 10 words).

Scene ${prevNum}:
${prevBody ?? 'N/A'}

Scene ${currentNum}:
${currentBody || 'N/A'}

Scene ${nextNum}:
${nextBody ?? 'N/A'}
`;
}


