/*
 * Gossamer Prompt Builder
 */
import type { Scene } from '../../main';
import { extractBeatOrder, normalizeBeatName } from '../../utils/gossamer';

export function buildGossamerPrompt(scenes: Scene[], contextPrompt?: string): string {
    const plotNotes = scenes.filter(s => s.itemType === 'Plot' && (s.subplot === 'Main Plot' || !s.subplot));
    
    // Extract dynamic beat order from Plot notes
    const beatOrder = extractBeatOrder(scenes);
    if (!beatOrder.length) {
        throw new Error('No Plot beats found. Cannot build Gossamer prompt.');
    }

    // Build per-beat snippets if any notes exist; otherwise mark as N/A in prompt
    const beatSnippets: Record<string, string> = {};
    beatOrder.forEach(b => beatSnippets[normalizeBeatName(b)] = 'N/A');

    plotNotes.forEach(p => {
        const key = normalizeBeatName(p.title || '');
        if (key && key in beatSnippets) {
            const desc = p.Description || '';
            const synopsis = p.synopsis || '';
            const body = [desc, synopsis].filter(Boolean).join('\n');
            beatSnippets[key] = body && body.trim().length > 0 ? body.trim() : 'N/A';
        }
    });

    const beatsBlock = beatOrder.map(name => {
        const key = normalizeBeatName(name);
        const content = beatSnippets[key] || 'N/A';
        return `- ${name}: ${content}`;
    }).join('\n');

    // Use first beat name dynamically (instead of hardcoding "Opening Image")
    const firstBeatName = beatOrder[0];
    
    // Build context prefix if provided
    const contextPrefix = contextPrompt?.trim()
        ? `${contextPrompt.trim()}\n\nBefore taking action, prepare an action plan.\n\n`
        : 'You are a developmental editor analyzing plot momentum across Save-the-Cat beats.\n\n';
    
    // Incomplete-aware JSON schema output request
    const prompt = `${contextPrefix}

Provide concise tension scoring for each beat with the first beat ("${firstBeatName}") fixed at 0. Use 0–100 for scores.
Do not invent content for beats with no scenes; instead mark them as missing.

Input contains available material per beat (or N/A if not yet drafted).

Required JSON output format:
{
  "beats": [
    { "beat": "${firstBeatName}", "score": 0, "notes": "...", "status": "present" },
    { "beat": "${beatOrder[1] || 'Next Beat'}", "score": 20, "notes": "...", "status": "present" },
    { "beat": "${beatOrder[beatOrder.length - 1] || 'Last Beat'}", "notes": "Unwritten", "status": "missing" }
  ],
  "overall": {
    "summary": "2–4 sentences on momentum shape and pacing.",
    "refinements": ["Concrete improvement A", "Concrete improvement B"],
    "incompleteBeats": ["${beatOrder[beatOrder.length - 3] || 'Beat X'}", "${beatOrder[beatOrder.length - 2] || 'Beat Y'}", "${beatOrder[beatOrder.length - 1] || 'Beat Z'}"]
  }
}

Rules:
- The first beat ("${firstBeatName}") score must be 0 and included.
- Only output the JSON object; no markdown fences, no commentary.
- For missing beats, omit score and set status = "missing".
- For outline-only material, set status = "outlineOnly".
- Notes per beat should be one short sentence.

Material by beat (Main Plot preferred; N/A means not yet drafted):
${beatsBlock}
`;

    return prompt;
}


