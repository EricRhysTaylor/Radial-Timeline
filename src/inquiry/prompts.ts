import type { InquiryMode, InquiryZone } from './state';
import type { InquiryPromptConfig, InquiryPromptSlot } from '../types/settings';

type BuiltInPromptSeed = {
    id: string;
    label: string;
    question: string;
};

const BUILT_IN_PROMPTS: Record<InquiryMode, Record<InquiryZone, BuiltInPromptSeed>> = {
    flow: {
        setup: {
            id: 'setup-flow',
            label: 'Setup',
            question: 'What must already be true for this scene to move smoothly?'
        },
        pressure: {
            id: 'pressure-flow',
            label: 'Pressure',
            question: "How does this scene change the story's momentum right now?"
        },
        payoff: {
            id: 'payoff-flow',
            label: 'Payoff',
            question: 'Are promises paid off or clearly handed forward at the right time?'
        }
    },
    depth: {
        setup: {
            id: 'setup-depth',
            label: 'Setup',
            question: 'What assumptions does this scene rely on, and are they structurally sound?'
        },
        pressure: {
            id: 'pressure-depth',
            label: 'Pressure',
            question: 'Does the change introduced here meaningfully deepen the story?'
        },
        payoff: {
            id: 'payoff-depth',
            label: 'Payoff',
            question: 'What narrative threads are resolved, deferred, dangling, or stillborn here?'
        }
    }
};

const buildBuiltInSlot = (seed: BuiltInPromptSeed): InquiryPromptSlot => ({
    id: seed.id,
    label: seed.label,
    question: seed.question,
    enabled: true,
    builtIn: true
});

const buildCustomSlot = (mode: InquiryMode, zone: InquiryZone, index: number): InquiryPromptSlot => ({
    id: `custom-${mode}-${zone}-${index + 1}`,
    label: '',
    question: '',
    enabled: false,
    builtIn: false
});

export const buildDefaultInquiryPromptConfig = (): InquiryPromptConfig => {
    const buildForZone = (mode: InquiryMode, zone: InquiryZone): InquiryPromptSlot[] => {
        const builtIn = buildBuiltInSlot(BUILT_IN_PROMPTS[mode][zone]);
        const customs = Array.from({ length: 4 }, (_, idx) => buildCustomSlot(mode, zone, idx));
        return [builtIn, ...customs];
    };

    return {
        flow: {
            setup: buildForZone('flow', 'setup'),
            pressure: buildForZone('flow', 'pressure'),
            payoff: buildForZone('flow', 'payoff')
        },
        depth: {
            setup: buildForZone('depth', 'setup'),
            pressure: buildForZone('depth', 'pressure'),
            payoff: buildForZone('depth', 'payoff')
        }
    };
};

export const normalizeInquiryPromptConfig = (raw?: InquiryPromptConfig): InquiryPromptConfig => {
    const defaults = buildDefaultInquiryPromptConfig();
    const normalizeZone = (mode: InquiryMode, zone: InquiryZone): InquiryPromptSlot[] => {
        const base = defaults[mode][zone];
        const incoming = raw?.[mode]?.[zone] ?? [];
        const normalized = base.map((slot, idx) => {
            if (idx === 0) {
                const builtInOverride = incoming[0];
                return {
                    ...slot,
                    enabled: builtInOverride?.enabled ?? slot.enabled
                };
            }
            const existing = incoming[idx];
            return {
                ...slot,
                id: existing?.id ?? slot.id,
                label: existing?.label ?? slot.label,
                question: existing?.question ?? slot.question,
                enabled: existing?.enabled ?? slot.enabled
            };
        });
        return normalized;
    };

    return {
        flow: {
            setup: normalizeZone('flow', 'setup'),
            pressure: normalizeZone('flow', 'pressure'),
            payoff: normalizeZone('flow', 'payoff')
        },
        depth: {
            setup: normalizeZone('depth', 'setup'),
            pressure: normalizeZone('depth', 'pressure'),
            payoff: normalizeZone('depth', 'payoff')
        }
    };
};

export const getBuiltInPromptSeed = (mode: InquiryMode, zone: InquiryZone): BuiltInPromptSeed =>
    BUILT_IN_PROMPTS[mode][zone];
