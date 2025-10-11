/*
 * Beats Triplet Prompt Builder
 */

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
    ? `${contextPrompt.trim()}\n\nBefore taking action, prepare an action plan.\n\n`
    : 'You are a developmental editor for a novel.\n\n';

  return `${contextPrefix}For each of the three scenes below, generate concise 5 ordered narrative beats from the perspective of the 2beats (middle scene) showing the connections between the 1beats (previous scene) and the 3beats (next scene) and if 2beats is maintaining the momentum of the story. For the first line of the 2beats, give an overall editorial score of A, B or C where A nearly perfect and C needs improvement with instructions on how to improve it.

Use the following exact format (to be processed by a script for YAML formatting):

1beats: 
 - ${prevNum} Use a short beat title + or - or ? / Short comment under 10 words
 - Follow-up beat title + or - or ? / Short comment under 10 words 
 - ...
2beats:
 - ${currentNum} A, B or C / Instructions on how to improve it no more than 15 words.
 - Follow-up beat title + or - or ? / Concise editorial comment under 10 words
 - ...
3beats:
 - ${nextNum} Use a Short beat title + or - or ? / Concise editorial comment under 10 words
 - Follow-up beat title + or - or ? / Concise editorial comment under 10 words
 - ...

Instructions:
- Use "+" for beats that connect strongly to surrounding scenes.
- Use "-" for beats that need improvement.
- Use "?" if the beat is neutral.
- Include the scene number (example: 34.5) only for the first item in each beats section.
- For 2beats (scene under evaluation), apply a rating of A, B or C / Concise editorial comment under 10 words with instructions on how to fix scene.
- Boundary conditions:
  - If previous scene is "N/A", leave 1beats empty (no lines).
  - If next scene is "N/A", leave 3beats empty (no lines).
  - Do not invent beats for missing scenes.
- Follow the exact indentation shown (single space before each dash).
- No other formatting so the YAML formatting is not broken.

Scene ${prevNum}:
${prevBody ?? 'N/A'}

Scene ${currentNum}:
${currentBody || 'N/A'}

Scene ${nextNum}:
${nextBody ?? 'N/A'}
`;
}


