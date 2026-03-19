import { INQUIRY_SCHEMA_VERSION } from './constants';

export const INQUIRY_ROLE_TEMPLATE_GUARDRAIL =
    "Do not reinterpret or expand the user's question. Answer it directly. The role template provides tonal and contextual framing only.";

export function buildInquiryPromptParts(evidenceText: string): {
    systemPrompt: string;
    instructionText: string;
    schemaText: string;
    userPrompt: string;
} {
    const systemPrompt = [
        'You are an editorial analysis engine.',
        'Scores are corpus-level diagnostics, not answer quality.',
        'Scope clarification:',
        'Book: material = scenes in this book (summary-based unless configured otherwise).',
        'Saga: material = books in saga (outlines + scene summaries unless configured otherwise).',
        'Return JSON only. No prose outside JSON.'
    ].join('\n');

    const schemaText = [
        '{',
        `  "schema_version": ${INQUIRY_SCHEMA_VERSION},`,
        '  "summaryFlow": "1-2 sentence flow summary (pacing, momentum, compression, timing, pressure phrasing).",',
        '  "summaryDepth": "1-2 sentence depth summary (coherence, subtext, logic, alignment, implication phrasing).",',
        '  "verdict": {',
        '    "flow": 0,',
        '    "depth": 0,',
        '    "impact": "low|medium|high",',
        '    "assessmentConfidence": "low|medium|high"',
        '  },',
        '  "findings": [',
        '    {',
        '      "ref_id": "scn_a1b2c3d4",',
        '      "ref_label": "S12 · Scene title (optional)",',
        '      "ref_path": "Book 1/12 Scene.md (optional debug path)",',
        '      "kind": "loose_end|continuity|escalation|conflict|unclear|strength",',
        '      "lens": "flow|depth|both (optional)",',
        '      "headline": "short line",',
        '      "bullets": ["optional", "points"],',
        '      "impact": "low|medium|high",',
        '      "assessmentConfidence": "low|medium|high"',
        '    }',
        '  ]',
        '}'
    ].join('\n');

    const instructionText = [
        'Answer the editorial question using the evidence.',
        'Independently assign corpus-level diagnostics (0-100):',
        '- Flow: momentum/causality/pressure progression across the evaluated corpus.',
        '- Depth: coherence/implication/structural integrity across the evaluated corpus.',
        'Scores reflect the corpus, not the quality of your answer.',
        'Use the same evidence for both lenses; interpretation changes, not evidence.',
        'Use flow summary phrasing that emphasizes compression, timing, and pressure.',
        'Use depth summary phrasing that emphasizes alignment, implication, and consistency.',
        'If conclusions align, still phrase summaries to match the active lens emphasis.',
        'Use scene ref_id values from evidence labels in parentheses (e.g., scn_a1b2c3d4).',
        'Canonical scene ids are YAML IDs in the form scn_<hash>.',
        'Every finding.ref_id must match ^scn_[a-f0-9]{8,10}$ and be copied exactly from evidence labels.',
        'Never invent scene refs like scn_s38_jump, scn_s44_long_road_up, or title/slug variants.',
        'Evidence headings include "(Summary)" or "(Body)".',
        'Treat "(Summary)" entries as compressed evidence, not full scene prose; avoid claims requiring missing fine-grain details.',
        'Return findings ONLY for scenes/moments that need revision, clarification, or stronger setup/payoff support.',
        'If a scene is working well, do NOT include it in findings. An empty findings array is valid and preferred over praise.',
        'Do not return praise or strength observations as findings. Findings must identify a deficit, gap, or revision opportunity.',
        'Use kind: "strength" ONLY if a scene is explicitly noteworthy as a structural anchor — never for general praise. Strength findings are informational and will not generate action items.',
        'Return at most ONE finding per scene reference. If multiple issues exist for the same scene, combine them into a single headline and bullet list.',
        'Optionally tag findings with lens: flow|depth|both to indicate relevance.',
        'Return JSON only with summaryFlow, summaryDepth, verdict.flow, verdict.depth, impact, assessmentConfidence, and findings.',
        'Return JSON only using the exact schema below.'
    ].join('\n');

    const userPrompt = [
        instructionText,
        '',
        schemaText,
        '',
        'Evidence:',
        evidenceText
    ].join('\n');

    return { systemPrompt, instructionText, schemaText, userPrompt };
}

export function buildInquiryPromptScaffold(evidenceText: string): {
    systemPrompt: string;
    userPrompt: string;
} {
    const { systemPrompt, userPrompt } = buildInquiryPromptParts(evidenceText);
    return { systemPrompt, userPrompt };
}
