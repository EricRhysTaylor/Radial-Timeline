import { INQUIRY_SCHEMA_VERSION } from './constants';
import type { InquiryLens, InquirySelectionMode } from './state';

export const INQUIRY_ROLE_TEMPLATE_GUARDRAIL =
    "Do not reinterpret or expand the user's question. Answer it directly. The role template provides tonal and contextual framing only.";

export type InquiryPromptScaffoldInput = {
    task: string;
    lens: InquiryLens;
    selectionMode: InquirySelectionMode;
    targetSceneIds: string[];
    corpusManifestLines: string[];
    evidenceText: string;
};

function normalizePromptInput(input: string | InquiryPromptScaffoldInput): InquiryPromptScaffoldInput {
    if (typeof input === 'string') {
        return {
            task: '',
            lens: 'flow',
            selectionMode: 'discover',
            targetSceneIds: [],
            corpusManifestLines: [],
            evidenceText: input
        };
    }
    return {
        task: input.task,
        lens: input.lens,
        selectionMode: input.selectionMode,
        targetSceneIds: Array.isArray(input.targetSceneIds) ? input.targetSceneIds : [],
        corpusManifestLines: Array.isArray(input.corpusManifestLines) ? input.corpusManifestLines : [],
        evidenceText: input.evidenceText
    };
}

export function buildInquiryPromptParts(input: string | InquiryPromptScaffoldInput): {
    systemPrompt: string;
    instructionText: string;
    schemaText: string;
    userPrompt: string;
} {
    const normalized = normalizePromptInput(input);

    const systemPrompt = [
        'You are an editorial analysis engine.',
        'Scores are corpus-level diagnostics, not answer quality.',
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
        '      "kind": "loose_end|continuity|escalation|conflict|unclear|strength",',
        '      "lens": "flow|depth|both|",',
        '      "headline": "short line",',
        '      "bullets": ["specific", "supporting points"],',
        '      "role": "target|context|",',
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
        'All findings must be anchored to specific scenes.',
        'Prefer using the format: scn_<id> when referencing scenes.',
        'Use scene ref_id values from evidence labels in parentheses (e.g., scn_a1b2c3d4).',
        'Canonical scene ids are YAML IDs in the form scn_<hash>.',
        'Every finding.ref_id must match ^scn_[a-f0-9]{8,10}$ and be copied exactly from evidence labels.',
        'If the exact ID is not known, reference the scene in a way that can be matched — scene number (e.g. S12, Scene 12), chapter number (e.g. Chapter 3), or scene/chapter title.',
        'When identifying absences (e.g. missing setup, weak foreshadowing, underdeveloped elements): reference the scene where the absence is most visible to the reader, or the scene where the missing element should have been established.',
        'Avoid abstract identifiers such as gap_001 or similar constructs.',
        'Every finding must map to a concrete scene or scene-equivalent reference.',
        'Never invent scene refs like scn_s38_jump, scn_s44_long_road_up, or title/slug variants.',
        'Evidence headings include "(Summary)" or "(Full)".',
        'Treat "(Summary)" entries as compressed evidence, not full scene prose; avoid claims requiring missing fine-grain details.',
        'Return findings ONLY for scenes/moments that need revision, clarification, or stronger setup/payoff support.',
        'If a scene is working well, do NOT include it in findings. An empty findings array is valid and preferred over praise.',
        'Do not return praise or strength observations as findings. Findings must identify a deficit, gap, or revision opportunity.',
        'Use kind: "strength" ONLY if a scene is explicitly noteworthy as a structural anchor — never for general praise. Strength findings are informational and will not generate action items.',
        'Return at most ONE finding per scene reference. If multiple issues exist for the same scene, combine them into a single headline and bullet list.',
        'Use role: "target" for author-selected target scenes and role: "context" for supporting context when helpful. Use an empty string when role is not needed.',
        'Set lens to flow, depth, or both when helpful. Use an empty string when no lens tag is needed.',
        'Always return bullets as an array. Use [] when one short headline is sufficient.',
        ...(normalized.selectionMode === 'focused'
            ? [
                'Focused selection mode: treat target scenes as the primary subject of analysis.',
                'Use the full manuscript as context, not as the main object of critique.',
                'Include outside scenes only when they are necessary to support a target-scene finding.',
                'Avoid drifting into broad global critique when the target scenes already answer the task.'
            ]
            : []),
        'Return JSON only with summaryFlow, summaryDepth, verdict.flow, verdict.depth, impact, assessmentConfidence, and findings.',
        'Return JSON only using the exact schema below.'
    ].join('\n');

    const targetSceneBlock = normalized.selectionMode === 'focused' && normalized.targetSceneIds.length
        ? [
            '',
            'TARGET SCENES:',
            ...normalized.targetSceneIds.map(sceneId => `- ${sceneId}`)
        ]
        : [];

    const userPrompt = [
        instructionText,
        '',
        schemaText,
        '',
        'TASK:',
        normalized.task || '(not provided)',
        ...targetSceneBlock,
        '',
        'EVIDENCE:',
        normalized.evidenceText
    ].join('\n');

    return { systemPrompt, instructionText, schemaText, userPrompt };
}

export function buildInquiryPromptScaffold(input: string | InquiryPromptScaffoldInput): {
    systemPrompt: string;
    userPrompt: string;
} {
    const { systemPrompt, userPrompt } = buildInquiryPromptParts(input);
    return { systemPrompt, userPrompt };
}
