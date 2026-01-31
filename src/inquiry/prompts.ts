import type { InquiryZone } from './state';
import type { InquiryPromptConfig, InquiryPromptSlot } from '../types/settings';

type BuiltInPromptSeed = {
    id: string;
    label: string;
    question: string;
    enabled?: boolean;
    requiresContext?: boolean;
};

const CANONICAL_PROMPTS: Record<InquiryZone, string> = {
    setup: 'What must already be true in the material for the story to move smoothly?',
    pressure: 'Where does the material shift momentum most right now?',
    payoff: 'Across the material, where are promises paid off, deferred, dangling, or abandoned?'
};

const ZONE_DESCRIPTIONS: Record<InquiryZone, string> = {
    setup: [
        'Foundations the story depends on.',
        'Questions here examine what must already exist or be understood for the material to work:',
        'context, relationships, rules, and narrative assumptions.',
        'Use this zone to find missing groundwork, unrealized threads, or weak setup that later material relies on.'
    ].join(' '),
    pressure: [
        'Where momentum and tension are changing.',
        'Questions here focus on movement: escalation, pacing, conflict, and cause-and-effect across the material.',
        'Use this zone to identify where the story accelerates, stalls, repeats itself, or dissipates tension.'
    ].join(' '),
    payoff: [
        'What resolves - and what does not.',
        'Questions here evaluate promises made by the material and how they are handled.',
        'Use this zone to locate payoffs, deferrals, dangling threads, abandoned ideas,',
        'and whether consequences feel earned or incomplete.'
    ].join(' ')
};

const BUILT_IN_PROMPTS: Record<InquiryZone, BuiltInPromptSeed[]> = {
    setup: [{
        id: 'setup-core',
        label: 'Setup',
        question: CANONICAL_PROMPTS.setup,
        enabled: true
    }],
    pressure: [
        {
            id: 'pressure-core',
            label: 'Pressure',
            question: CANONICAL_PROMPTS.pressure,
            enabled: true
        },
        {
            id: 'pressure-subtext',
            label: 'Subtext',
            question: 'Where does dialogue or description state meaning explicitly instead of letting subtext carry it?',
            enabled: false
        }
    ],
    payoff: [
        {
            id: 'payoff-core',
            label: 'Payoff',
            question: CANONICAL_PROMPTS.payoff,
            enabled: true
        },
        {
            id: 'payoff-loose-ends',
            label: 'Loose Ends Audit',
            question: 'What narrative threads are resolved, deferred, dangling, or abandoned?',
            enabled: false
        }
    ]
};

const BUILT_IN_SEEDS_BY_ID: Record<InquiryZone, Map<string, BuiltInPromptSeed>> = {
    setup: new Map(BUILT_IN_PROMPTS.setup.map(seed => [seed.id, seed])),
    pressure: new Map(BUILT_IN_PROMPTS.pressure.map(seed => [seed.id, seed])),
    payoff: new Map(BUILT_IN_PROMPTS.payoff.map(seed => [seed.id, seed]))
};

const buildBuiltInSlot = (seed: BuiltInPromptSeed): InquiryPromptSlot => ({
    id: seed.id,
    label: seed.label,
    question: seed.question,
    enabled: seed.enabled ?? true,
    builtIn: true,
    requiresContext: seed.requiresContext
});

export const buildDefaultInquiryPromptConfig = (): InquiryPromptConfig => {
    const buildForZone = (zone: InquiryZone): InquiryPromptSlot[] => {
        const builtIns = BUILT_IN_PROMPTS[zone].map(seed => buildBuiltInSlot(seed));
        return [...builtIns];
    };

    return {
        setup: buildForZone('setup'),
        pressure: buildForZone('pressure'),
        payoff: buildForZone('payoff')
    };
};

export const normalizeInquiryPromptConfig = (raw?: InquiryPromptConfig): InquiryPromptConfig => {
    const defaults = buildDefaultInquiryPromptConfig();
    const legacy = raw as Record<string, Record<InquiryZone, InquiryPromptSlot[]>> | undefined;
    const hasLegacy = !!legacy && ('flow' in legacy || 'depth' in legacy);

    const normalizeZone = (zone: InquiryZone): InquiryPromptSlot[] => {
        const canonicalSeed = defaults[zone]?.[0];
        const canonicalId = canonicalSeed?.id;
        const builtInSeeds = BUILT_IN_SEEDS_BY_ID[zone];
        const incoming = hasLegacy
            ? (legacy?.flow?.[zone] ?? legacy?.depth?.[zone] ?? [])
            : (raw?.[zone] ?? []);
        const usedIds = new Set<string>(canonicalId ? [canonicalId] : []);
        const slots: InquiryPromptSlot[] = [];
        let canonicalIncluded = false;

        incoming.forEach((slot, index) => {
            if (!slot) return;
            const builtInSeed = slot.id ? builtInSeeds.get(slot.id) : undefined;

            if (canonicalId && slot.id === canonicalId && canonicalSeed) {
                canonicalIncluded = true;
                const questionValue = slot.question?.trim().length
                    ? slot.question
                    : canonicalSeed.question;
                slots.push({
                    ...canonicalSeed,
                    ...slot,
                    id: canonicalId,
                    label: slot.label ?? canonicalSeed.label ?? '',
                    question: questionValue,
                    enabled: true,
                    builtIn: true
                });
                return;
            }

            if (builtInSeed) {
                if (slot.enabled === false) return;
                if (usedIds.has(builtInSeed.id)) return;
                const questionValue = slot.question?.trim().length
                    ? slot.question
                    : builtInSeed.question;
                usedIds.add(builtInSeed.id);
                slots.push({
                    ...buildBuiltInSlot(builtInSeed),
                    ...slot,
                    id: builtInSeed.id,
                    label: slot.label ?? builtInSeed.label ?? '',
                    question: questionValue,
                    enabled: slot.enabled ?? builtInSeed.enabled ?? true,
                    builtIn: true
                });
                return;
            }

            if (slot.builtIn && !slot.enabled) return;

            const label = slot.label ?? '';
            const question = slot.question ?? '';
            const hasContent = label.trim().length > 0 || question.trim().length > 0;
            const rawEnabled = slot.enabled ?? false;
            if (!hasContent && !rawEnabled) return;

            let id = slot.id;
            if (!id || usedIds.has(id)) {
                const baseId = `custom-${zone}-${index + 1}`;
                let candidate = baseId;
                let suffix = 1;
                while (usedIds.has(candidate)) {
                    candidate = `${baseId}-${suffix++}`;
                }
                id = candidate;
            }

            usedIds.add(id);
            slots.push({
                id,
                label,
                question,
                enabled: rawEnabled || question.trim().length > 0,
                builtIn: false,
                requiresContext: slot.requiresContext
            });
        });

        if (!canonicalIncluded && canonicalSeed) {
            slots.unshift({
                ...canonicalSeed,
                enabled: true
            });
        }

        return slots;
    };

    return {
        setup: normalizeZone('setup'),
        pressure: normalizeZone('pressure'),
        payoff: normalizeZone('payoff')
    };
};

export const getBuiltInPromptSeed = (zone: InquiryZone, index = 0): BuiltInPromptSeed | undefined =>
    BUILT_IN_PROMPTS[zone][index];

export const getBuiltInPromptSeedById = (zone: InquiryZone, id?: string): BuiltInPromptSeed | undefined =>
    id ? BUILT_IN_SEEDS_BY_ID[zone].get(id) : undefined;

export const getCanonicalPromptText = (zone: InquiryZone): string => CANONICAL_PROMPTS[zone];

export const getInquiryZoneDescription = (zone: InquiryZone): string => ZONE_DESCRIPTIONS[zone];
