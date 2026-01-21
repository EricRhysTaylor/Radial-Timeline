import type { InquiryZone } from './state';
import type { InquiryPromptConfig, InquiryPromptSlot } from '../types/settings';

type BuiltInPromptSeed = {
    id: string;
    label: string;
    question: string;
    enabled?: boolean;
};

const BUILT_IN_PROMPTS: Record<InquiryZone, BuiltInPromptSeed[]> = {
    setup: [{
        id: 'setup-core',
        label: 'Setup',
        question: 'What must already be true for this scene to move smoothly?',
        enabled: true
    }],
    pressure: [{
        id: 'pressure-core',
        label: 'Pressure',
        question: "How does this scene change the story's momentum right now?",
        enabled: true
    }, {
        id: 'pressure-alt-clarity',
        label: 'Pressure',
        question: 'Where does dialogue or description state meaning explicitly instead of allowing subtext to carry it?',
        enabled: false
    }],
    payoff: [{
        id: 'payoff-core',
        label: 'Payoff',
        question: 'Are promises paid off or clearly handed forward at the right time?',
        enabled: true
    }]
};

const buildBuiltInSlot = (seed: BuiltInPromptSeed): InquiryPromptSlot => ({
    id: seed.id,
    label: seed.label,
    question: seed.question,
    enabled: seed.enabled ?? true,
    builtIn: true
});

const buildCustomSlot = (zone: InquiryZone, index: number): InquiryPromptSlot => ({
    id: `custom-${zone}-${index + 1}`,
    label: '',
    question: '',
    enabled: false,
    builtIn: false
});

export const buildDefaultInquiryPromptConfig = (): InquiryPromptConfig => {
    const buildForZone = (zone: InquiryZone): InquiryPromptSlot[] => {
        const builtIns = BUILT_IN_PROMPTS[zone].map(seed => buildBuiltInSlot(seed));
        const customs = Array.from({ length: 4 }, (_, idx) => buildCustomSlot(zone, idx));
        return [...builtIns, ...customs];
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
        const base = defaults[zone];
        const incoming = hasLegacy
            ? (legacy?.flow?.[zone] ?? legacy?.depth?.[zone] ?? [])
            : (raw?.[zone] ?? []);
        return base.map((slot, idx) => {
            const existing = incoming[idx];
            if (slot.builtIn) {
                return {
                    ...slot,
                    enabled: existing?.enabled ?? slot.enabled
                };
            }
            return {
                ...slot,
                id: existing?.id ?? slot.id,
                label: existing?.label ?? slot.label,
                question: existing?.question ?? slot.question,
                enabled: existing?.enabled ?? slot.enabled
            };
        });
    };

    return {
        setup: normalizeZone('setup'),
        pressure: normalizeZone('pressure'),
        payoff: normalizeZone('payoff')
    };
};

export const getBuiltInPromptSeed = (zone: InquiryZone, index = 0): BuiltInPromptSeed | undefined =>
    BUILT_IN_PROMPTS[zone][index];
