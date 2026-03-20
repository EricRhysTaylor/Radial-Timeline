import type { InquiryCanonicalQuestionTier, InquiryPromptZone } from '../../types/settings';

export interface InquiryCanonicalQuestionDefinition {
    id: string;
    version: number;
    tier: InquiryCanonicalQuestionTier;
    zone: InquiryPromptZone;
    label: string;
    text: string;
    defaultOrder: number;
    enabledByDefault?: boolean;
}

const CANONICAL_QUESTION_ORDER: Record<InquiryPromptZone, number> = {
    setup: 0,
    pressure: 1,
    payoff: 2
};

const sortCanonicalQuestions = (
    left: InquiryCanonicalQuestionDefinition,
    right: InquiryCanonicalQuestionDefinition
): number => {
    const zoneDelta = CANONICAL_QUESTION_ORDER[left.zone] - CANONICAL_QUESTION_ORDER[right.zone];
    if (zoneDelta !== 0) return zoneDelta;
    return left.defaultOrder - right.defaultOrder;
};

const buildQuestion = (
    question: InquiryCanonicalQuestionDefinition
): InquiryCanonicalQuestionDefinition => Object.freeze({ ...question });

export const CORE_CANONICAL_QUESTIONS: readonly InquiryCanonicalQuestionDefinition[] = Object.freeze([
    buildQuestion({
        id: 'setup-core',
        version: 1,
        tier: 'core',
        zone: 'setup',
        label: 'Setup',
        text: 'What must already be true in the material for the story to move smoothly?',
        defaultOrder: 10,
        enabledByDefault: true
    }),
    buildQuestion({
        id: 'setup-missing-foundations',
        version: 1,
        tier: 'core',
        zone: 'setup',
        label: 'Missing Foundations',
        text: 'What information, relationships, or context does the material assume but never establishes?',
        defaultOrder: 20,
        enabledByDefault: true
    }),
    buildQuestion({
        id: 'setup-foreshadowing-gaps',
        version: 1,
        tier: 'core',
        zone: 'setup',
        label: 'Foreshadowing Gaps',
        text: 'Where does later material rely on setups that are weak, absent, or too subtle?',
        defaultOrder: 30,
        enabledByDefault: true
    }),
    buildQuestion({
        id: 'setup-character-readiness',
        version: 1,
        tier: 'core',
        zone: 'setup',
        label: 'Character Readiness',
        text: 'Which characters need to be more developed earlier for the story to function?',
        defaultOrder: 40,
        enabledByDefault: true
    }),
    buildQuestion({
        id: 'pressure-core',
        version: 1,
        tier: 'core',
        zone: 'pressure',
        label: 'Pressure',
        text: 'Where does the material shift momentum most right now?',
        defaultOrder: 10,
        enabledByDefault: true
    }),
    buildQuestion({
        id: 'pressure-underwritten-beats',
        version: 1,
        tier: 'core',
        zone: 'pressure',
        label: 'Underwritten Beats',
        text: 'Where does the material move too quickly, skipping emotional or causal weight?',
        defaultOrder: 20,
        enabledByDefault: true
    }),
    buildQuestion({
        id: 'pressure-over-explanation',
        version: 1,
        tier: 'core',
        zone: 'pressure',
        label: 'Over-Explanation',
        text: 'Which parts of the material explain or repeat more than necessary, reducing momentum?',
        defaultOrder: 30,
        enabledByDefault: true
    }),
    buildQuestion({
        id: 'pressure-false-plateaus',
        version: 1,
        tier: 'core',
        zone: 'pressure',
        label: 'False Plateaus',
        text: 'Where does the story appear to pause without adding tension or consequence?',
        defaultOrder: 40,
        enabledByDefault: true
    }),
    buildQuestion({
        id: 'payoff-core',
        version: 1,
        tier: 'core',
        zone: 'payoff',
        label: 'Payoff',
        text: 'Across the material, where are promises paid off, deferred, dangling, or abandoned?',
        defaultOrder: 10,
        enabledByDefault: true
    }),
    buildQuestion({
        id: 'payoff-abandoned-threads',
        version: 1,
        tier: 'core',
        zone: 'payoff',
        label: 'Abandoned Threads',
        text: 'Which narrative threads appear introduced but never meaningfully resolved or transformed?',
        defaultOrder: 20,
        enabledByDefault: true
    }),
    buildQuestion({
        id: 'payoff-consequences-audit',
        version: 1,
        tier: 'core',
        zone: 'payoff',
        label: 'Consequences Audit',
        text: 'Which major actions lack lasting consequences within the material?',
        defaultOrder: 30,
        enabledByDefault: true
    }),
    buildQuestion({
        id: 'payoff-premature-resolution',
        version: 1,
        tier: 'core',
        zone: 'payoff',
        label: 'Premature Resolution',
        text: 'Where are problems resolved too cleanly, reducing long-term impact?',
        defaultOrder: 40,
        enabledByDefault: true
    })
]);

export const SIGNATURE_CANONICAL_QUESTIONS: readonly InquiryCanonicalQuestionDefinition[] = Object.freeze([
    buildQuestion({
        id: 'setup-unrealized-thread',
        version: 1,
        tier: 'signature',
        zone: 'setup',
        label: 'Unrealized Thread',
        text: 'Is there a potential plot thread implied by the material that has not been developed or activated?',
        defaultOrder: 50,
        enabledByDefault: true
    }),
    buildQuestion({
        id: 'setup-world-logic-preconditions',
        version: 1,
        tier: 'signature',
        zone: 'setup',
        label: 'World Logic Preconditions',
        text: 'What rules or constraints of the world must be true for later events to make sense?',
        defaultOrder: 60,
        enabledByDefault: true
    }),
    buildQuestion({
        id: 'setup-reader-orientation-risk',
        version: 1,
        tier: 'signature',
        zone: 'setup',
        label: 'Reader Orientation Risk',
        text: 'Where might first-time readers feel disoriented because the material assumes too much shared context or familiarity?',
        defaultOrder: 70,
        enabledByDefault: true
    }),
    buildQuestion({
        id: 'setup-load-bearing',
        version: 1,
        tier: 'signature',
        zone: 'setup',
        label: 'Setup Load-Bearing',
        text: 'Which early material must carry more weight for later events to feel inevitable?',
        defaultOrder: 80,
        enabledByDefault: true
    }),
    buildQuestion({
        id: 'setup-structural-assumptions',
        version: 1,
        tier: 'signature',
        zone: 'setup',
        label: 'Structural Assumptions',
        text: 'What narrative assumptions does the material make that may not hold for a first-time reader?',
        defaultOrder: 90,
        enabledByDefault: true
    }),
    buildQuestion({
        id: 'pressure-escalation-consistency',
        version: 1,
        tier: 'signature',
        zone: 'pressure',
        label: 'Escalation Consistency',
        text: 'Does pressure escalate logically across the material, or reset in places?',
        defaultOrder: 50,
        enabledByDefault: true
    }),
    buildQuestion({
        id: 'pressure-conflict-density',
        version: 1,
        tier: 'signature',
        zone: 'pressure',
        label: 'Conflict Density',
        text: 'Which sections carry too many competing tensions, and which carry too few?',
        defaultOrder: 60,
        enabledByDefault: true
    }),
    buildQuestion({
        id: 'pressure-scene-function-drift',
        version: 1,
        tier: 'signature',
        zone: 'pressure',
        label: 'Scene Function Drift',
        text: 'Where do scenes lose clarity about what pressure they are meant to apply?',
        defaultOrder: 70,
        enabledByDefault: true
    }),
    buildQuestion({
        id: 'pressure-tension-leakage',
        version: 1,
        tier: 'signature',
        zone: 'pressure',
        label: 'Tension Leakage',
        text: 'Where does tension dissipate unintentionally through explanation, reassurance, or delay instead of being sustained or redirected?',
        defaultOrder: 80,
        enabledByDefault: true
    }),
    buildQuestion({
        id: 'pressure-irreversible-moves',
        version: 1,
        tier: 'signature',
        zone: 'pressure',
        label: 'Irreversible Moves',
        text: 'Where does the material fail to force characters into choices they cannot undo?',
        defaultOrder: 90,
        enabledByDefault: true
    }),
    buildQuestion({
        id: 'payoff-emotional-payoff-balance',
        version: 1,
        tier: 'signature',
        zone: 'payoff',
        label: 'Emotional Payoff Balance',
        text: 'Which emotional arcs receive strong payoff, and which feel incomplete or muted?',
        defaultOrder: 50,
        enabledByDefault: true
    }),
    buildQuestion({
        id: 'payoff-thematic-closure',
        version: 1,
        tier: 'signature',
        zone: 'payoff',
        label: 'Thematic Closure',
        text: 'Do the story’s themes reach meaningful resolution, or simply stop being discussed?',
        defaultOrder: 60,
        enabledByDefault: true
    }),
    buildQuestion({
        id: 'payoff-ending-load-bearing',
        version: 1,
        tier: 'signature',
        zone: 'payoff',
        label: 'Ending Load-Bearing',
        text: 'Does the ending carry too much unresolved weight that earlier material should support?',
        defaultOrder: 80,
        enabledByDefault: true
    }),
    buildQuestion({
        id: 'payoff-narrative-debt',
        version: 1,
        tier: 'signature',
        zone: 'payoff',
        label: 'Narrative Debt',
        text: 'Which promises accumulate across the material without proportional payoff, creating unresolved narrative debt?',
        defaultOrder: 90,
        enabledByDefault: true
    }),
    buildQuestion({
        id: 'payoff-inevitable-payoff-test',
        version: 1,
        tier: 'signature',
        zone: 'payoff',
        label: 'Inevitable Payoff Test',
        text: 'Do major outcomes feel inevitable from prior material, or do they feel introduced?',
        defaultOrder: 100,
        enabledByDefault: true
    })
]);

export const ALL_CANONICAL_QUESTIONS: readonly InquiryCanonicalQuestionDefinition[] = Object.freeze(
    [...CORE_CANONICAL_QUESTIONS, ...SIGNATURE_CANONICAL_QUESTIONS].sort(sortCanonicalQuestions)
);

export const getCanonicalQuestionsByTier = (
    tier: InquiryCanonicalQuestionTier
): InquiryCanonicalQuestionDefinition[] =>
    ALL_CANONICAL_QUESTIONS.filter(question => question.tier === tier);

export const groupCanonicalQuestionsByZone = (
    questions: readonly InquiryCanonicalQuestionDefinition[] = ALL_CANONICAL_QUESTIONS
): Record<InquiryPromptZone, InquiryCanonicalQuestionDefinition[]> => {
    const grouped: Record<InquiryPromptZone, InquiryCanonicalQuestionDefinition[]> = {
        setup: [],
        pressure: [],
        payoff: []
    };

    questions
        .slice()
        .sort(sortCanonicalQuestions)
        .forEach(question => {
            grouped[question.zone].push(question);
        });

    return grouped;
};

export const getCanonicalQuestionsByTierAndZone = (
    tier: InquiryCanonicalQuestionTier,
    zone: InquiryPromptZone
): InquiryCanonicalQuestionDefinition[] =>
    getCanonicalQuestionsByTier(tier).filter(question => question.zone === zone);

const CANONICAL_QUESTION_MAP = new Map(
    ALL_CANONICAL_QUESTIONS.map(question => [question.id, question] as const)
);

export const getCanonicalQuestionById = (
    id?: string
): InquiryCanonicalQuestionDefinition | undefined => (id ? CANONICAL_QUESTION_MAP.get(id) : undefined);
