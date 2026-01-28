import type { InquiryZone } from './state';
import type { InquiryPromptConfig, InquiryPromptSlot } from '../types/settings';

type BuiltInPromptSeed = {
    id: string;
    label: string;
    question: string;
    enabled?: boolean;
};

const CANONICAL_PROMPTS: Record<InquiryZone, string> = {
    setup: 'What must already be true in the material for the story to move smoothly?',
    pressure: 'Where does the material shift momentum most right now?',
    payoff: 'Across the material, where are promises paid off, deferred, dangling, or abandoned?'
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

const buildBuiltInSlot = (seed: BuiltInPromptSeed): InquiryPromptSlot => ({
    id: seed.id,
    label: seed.label,
    question: seed.question,
    enabled: seed.enabled ?? true,
    builtIn: true
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
        const incoming = hasLegacy
            ? (legacy?.flow?.[zone] ?? legacy?.depth?.[zone] ?? [])
            : (raw?.[zone] ?? []);
        const usedIds = new Set<string>(canonicalId ? [canonicalId] : []);
        const slots: InquiryPromptSlot[] = [];
        let canonicalIncluded = false;

        incoming.forEach((slot, index) => {
            if (!slot) return;

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
                builtIn: false
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

export const getCanonicalPromptText = (zone: InquiryZone): string => CANONICAL_PROMPTS[zone];
