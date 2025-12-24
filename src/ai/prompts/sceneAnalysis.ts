/*
 * AI Scene Analysis Prompt Builder
 * This analyzes scene performance, not story beats (timeline slices)
 */

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

export function getSceneAnalysisSystemPrompt(): string {
  return `You are Radial Timeline's scene-analysis assistant.`;
}

const SCENE_ANALYSIS_JSON_EXAMPLE = `{
  "previousSceneAnalysis": [
    { "scene": "23", "title": "First-rescue echo", "grade": "+", "comment": "Chae’s compassion parallels Shail’s later desperation" },
    { "scene": "23", "title": "Implant mystery", "grade": "?", "comment": "Tech anomalies foreshadow later biological puzzles" }
  ],
  "currentSceneAnalysis": [
    { "scene": "24", "title": "Overall Scene Grade", "grade": "B", "comment": "Tighten pacing and reduce repetition in survival beats" },
    { "scene": "24", "title": "Harsh environment pressure", "grade": "+", "comment": "Strongly escalates physical and emotional stakes" }
  ],
  "nextSceneAnalysis": [
    { "scene": "25", "title": "Tech–bio tension", "grade": "+", "comment": "Survival biology echoes Diga genetic stakes" },
    { "scene": "25", "title": "Trust and secrecy", "grade": "+", "comment": "Shail’s reliance reflects Chae–Trisan disclosure themes" }
  ]
}`;

export function getSceneAnalysisJsonExample(): string {
  return SCENE_ANALYSIS_JSON_EXAMPLE;
}

const SCENE_ANALYSIS_EXAMPLE_SECTION = `Example of valid JSON (do not copy verbatim; adapt to the scenes below):
${SCENE_ANALYSIS_JSON_EXAMPLE}
`;

export function buildSceneAnalysisPrompt(
  prevBody: string | null,
  currentBody: string,
  nextBody: string | null,
  prevNum: string,
  currentNum: string,
  nextNum: string,
  contextPrompt?: string,
  extraInstructions?: string
): string {
  // Build context prefix if provided
  let contextPrefix = contextPrompt?.trim() 
    ? `${contextPrompt.trim()}\n\n`
    : 'You are a developmental editor for fiction.\n\n';

  if (extraInstructions?.trim()) {
    contextPrefix = `${extraInstructions.trim()}\n\n${contextPrefix}`;
  }

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
- Never use letter grades (A/B/C) outside that first item; use only "+", "-", or "?" afterwards.

${SCENE_ANALYSIS_EXAMPLE_SECTION}

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
- Never use letter grades (A/B/C) outside that first item; use only "+", "-", or "?" afterwards.
- For nextSceneAnalysis entries, grades must be "+", "-", or "?" only.

${SCENE_ANALYSIS_EXAMPLE_SECTION}

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
- Never use letter grades (A/B/C) outside that first item; use only "+", "-", or "?" afterwards.
- For previousSceneAnalysis entries, grades must be "+", "-", or "?" only.

${SCENE_ANALYSIS_EXAMPLE_SECTION}

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
- Never use letter grades (A/B/C) outside that first item; use only "+", "-", or "?" afterwards.
- previousSceneAnalysis and nextSceneAnalysis entries must use "+", "-", or "?".

${SCENE_ANALYSIS_EXAMPLE_SECTION}

Scene ${prevNum}:
${prevBody ?? 'N/A'}

Scene ${currentNum}:
${currentBody || 'N/A'}

Scene ${nextNum}:
${nextBody ?? 'N/A'}
`;
}
