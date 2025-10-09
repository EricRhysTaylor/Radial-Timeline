/*
 * Gossamer Prompt Builder
 */
import type { Scene } from '../../main';

const STC_BEATS_ORDER: string[] = [
    'Opening Image',
    'Theme Stated',
    'Set-Up',
    'Catalyst',
    'Debate',
    'Break into Two',
    'B Story',
    'Fun and Games',
    'Midpoint',
    'Bad Guys Close In',
    'All Is Lost',
    'Dark Night of the Soul',
    'Break into Three',
    'Finale',
    'Final Image'
];

function normalizeBeatName(name: string): string {
    return (name || '').trim().toLowerCase();
}

export function buildGossamerPrompt(scenes: Scene[]): string {
    const plotNotes = scenes.filter(s => s.itemType === 'Plot' && (s.subplot === 'Main Plot' || !s.subplot));

    // Build per-beat snippets if any notes exist; otherwise mark as N/A in prompt
    const beatSnippets: Record<string, string> = {};
    STC_BEATS_ORDER.forEach(b => beatSnippets[normalizeBeatName(b)] = 'N/A');

    plotNotes.forEach(p => {
        const key = normalizeBeatName(p.title || '');
        if (key && key in beatSnippets) {
            const desc = p.Description || '';
            const synopsis = p.synopsis || '';
            const body = [desc, synopsis].filter(Boolean).join('\n');
            beatSnippets[key] = body && body.trim().length > 0 ? body.trim() : 'N/A';
        }
    });

    const beatsBlock = STC_BEATS_ORDER.map(name => {
        const key = normalizeBeatName(name);
        const content = beatSnippets[key] || 'N/A';
        return `- ${name}: ${content}`;
    }).join('\n');

    // Incomplete-aware JSON schema output request
    const prompt = `You are a developmental editor analyzing plot momentum across Save-the-Cat beats.

Provide concise tension scoring for each beat with Opening fixed at 0. Use 0–100 for scores.
Do not invent content for beats with no scenes; instead mark them as missing.

Input contains available material per beat (or N/A if not yet drafted).

Required JSON output format:
{
  "beats": [
    { "beat": "Opening Image", "score": 0, "notes": "...", "status": "present" },
    { "beat": "Catalyst", "score": 20, "notes": "...", "status": "present" },
    { "beat": "Finale", "notes": "Unwritten", "status": "missing" }
  ],
  "overall": {
    "summary": "2–4 sentences on momentum shape and pacing.",
    "refinements": ["Concrete improvement A", "Concrete improvement B"],
    "incompleteBeats": ["Break into Three", "Finale", "Final Image"]
  }
}

Rules:
- Opening score must be 0 and included.
- Only output the JSON object; no markdown fences, no commentary.
- For missing beats, omit score and set status = "missing".
- For outline-only material, set status = "outlineOnly".
- Notes per beat should be one short sentence.

Material by beat (Main Plot preferred; N/A means not yet drafted):
${beatsBlock}
`;

    return prompt;
}

export { STC_BEATS_ORDER };


