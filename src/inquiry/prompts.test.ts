import { describe, expect, it } from 'vitest';
import type { InquiryPromptConfig, InquiryPromptSlot } from '../types/settings';
import {
    buildDefaultInquiryPromptConfig,
    buildInquiryPromptConfigFromLoadout,
    replaceCanonicalPromptSlots,
    syncCanonicalPromptSlot
} from './prompts';

describe('Inquiry prompt helpers', () => {
    it('builds the default config from the core canonical library', () => {
        const config = buildDefaultInquiryPromptConfig();
        expect(config.setup.map(slot => slot.id)).toEqual(['setup-core']);
        expect(config.pressure.map(slot => slot.id)).toEqual(['pressure-core']);
        expect(config.payoff.map(slot => slot.id)).toEqual(['payoff-core']);
    });

    it('builds the full signature loadout with three canonical questions per zone', () => {
        const config = buildInquiryPromptConfigFromLoadout('full-signature');
        expect(config.setup).toHaveLength(3);
        expect(config.pressure).toHaveLength(3);
        expect(config.payoff).toHaveLength(3);
        expect(config.payoff[2]?.canonical?.state).toBe('loaded');
    });

    it('replaces canonical slots while preserving custom questions', () => {
        const starting: InquiryPromptConfig = {
            setup: [
                ...buildDefaultInquiryPromptConfig().setup,
                {
                    id: 'custom-setup-1',
                    label: 'My setup',
                    question: 'What setup thread needs more emphasis?',
                    enabled: true,
                    builtIn: false
                }
            ],
            pressure: [
                ...buildDefaultInquiryPromptConfig().pressure,
                {
                    id: 'custom-pressure-1',
                    label: 'My pressure',
                    question: 'Where does urgency flatten out?',
                    enabled: true,
                    builtIn: false
                }
            ],
            payoff: buildDefaultInquiryPromptConfig().payoff
        };

        const next = replaceCanonicalPromptSlots(starting, 'full-signature');

        expect(next.setup.map(slot => slot.id)).toEqual([
            'setup-core',
            'setup-dependencies',
            'setup-promises',
            'custom-setup-1'
        ]);
        expect(next.pressure.map(slot => slot.id)).toEqual([
            'pressure-core',
            'pressure-escalation',
            'pressure-subtext',
            'custom-pressure-1'
        ]);
    });

    it('marks edited canonical slots as customized', () => {
        const original = buildInquiryPromptConfigFromLoadout('core').setup[0] as InquiryPromptSlot;
        const edited = syncCanonicalPromptSlot({
            ...original,
            question: `${original.question} Revised.`
        });

        expect(edited.canonical?.id).toBe('setup-core');
        expect(edited.canonical?.state).toBe('customized');
    });
});
