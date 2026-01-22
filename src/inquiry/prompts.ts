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
    enabled: true,
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
        const base = defaults[zone];
        const canonicalSlot = base[0];
        const incoming = hasLegacy
            ? (legacy?.flow?.[zone] ?? legacy?.depth?.[zone] ?? [])
            : (raw?.[zone] ?? []);
        const usedIds = new Set<string>([canonicalSlot?.id ?? '']);
        const customSlots: InquiryPromptSlot[] = [];

        incoming.forEach((slot, index) => {
            if (!slot) return;
            if (slot.id === canonicalSlot?.id) return;
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
            customSlots.push({
                id,
                label,
                question,
                enabled: rawEnabled || question.trim().length > 0,
                builtIn: false
            });
        });

        if (canonicalSlot) {
            return [canonicalSlot, ...customSlots];
        }

        return customSlots;
    };

    return {
        setup: normalizeZone('setup'),
        pressure: normalizeZone('pressure'),
        payoff: normalizeZone('payoff')
    };
};

export const getBuiltInPromptSeed = (zone: InquiryZone, index = 0): BuiltInPromptSeed | undefined =>
    BUILT_IN_PROMPTS[zone][index];
