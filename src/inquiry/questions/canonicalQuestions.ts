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
        id: 'pressure-core',
        version: 1,
        tier: 'core',
        zone: 'pressure',
        label: 'Pressure',
        text: 'Where does the material shift momentum most right now?',
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
        defaultOrder: 70,
        enabledByDefault: true
    })
]);

export const SIGNATURE_CANONICAL_QUESTIONS: readonly InquiryCanonicalQuestionDefinition[] = Object.freeze([
    buildQuestion({
        id: 'setup-dependencies',
        version: 1,
        tier: 'signature',
        zone: 'setup',
        label: 'Dependencies',
        text: 'What context, rules, relationships, or motivations does the material rely on before it has fully earned them?',
        defaultOrder: 20,
        enabledByDefault: true
    }),
    buildQuestion({
        id: 'setup-promises',
        version: 1,
        tier: 'signature',
        zone: 'setup',
        label: 'Promises',
        text: 'What promises, expectations, or story questions are being planted, and how clearly are they aimed?',
        defaultOrder: 30,
        enabledByDefault: true
    }),
    buildQuestion({
        id: 'pressure-escalation',
        version: 1,
        tier: 'signature',
        zone: 'pressure',
        label: 'Escalation',
        text: 'Where does conflict compound into stronger pressure, and where does it plateau, repeat, or dissipate?',
        defaultOrder: 50,
        enabledByDefault: true
    }),
    buildQuestion({
        id: 'pressure-subtext',
        version: 1,
        tier: 'signature',
        zone: 'pressure',
        label: 'Subtext',
        text: 'Where does dialogue or description state meaning explicitly instead of letting subtext carry it?',
        defaultOrder: 60,
        enabledByDefault: true
    }),
    buildQuestion({
        id: 'payoff-consequences',
        version: 1,
        tier: 'signature',
        zone: 'payoff',
        label: 'Consequences',
        text: 'Which turning points meaningfully change relationships, strategy, or stakes, and which land without lasting consequence?',
        defaultOrder: 80,
        enabledByDefault: true
    }),
    buildQuestion({
        id: 'payoff-loose-ends',
        version: 1,
        tier: 'signature',
        zone: 'payoff',
        label: 'Loose Ends Audit',
        text: 'What narrative threads are resolved, deferred, dangling, or abandoned?',
        defaultOrder: 90,
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
