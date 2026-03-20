import { describe, expect, it } from 'vitest';
import {
    ALL_CANONICAL_QUESTIONS,
    CORE_CANONICAL_QUESTIONS,
    SIGNATURE_CANONICAL_QUESTIONS,
    getCanonicalQuestionsByTierAndZone,
    groupCanonicalQuestionsByZone
} from './canonicalQuestions';

describe('canonical Inquiry questions', () => {
    it('exports the curated core, signature, and combined libraries', () => {
        expect(CORE_CANONICAL_QUESTIONS).toHaveLength(3);
        expect(SIGNATURE_CANONICAL_QUESTIONS).toHaveLength(6);
        expect(ALL_CANONICAL_QUESTIONS).toHaveLength(9);
    });

    it('groups the combined library into three questions per zone', () => {
        const grouped = groupCanonicalQuestionsByZone();
        expect(grouped.setup.map(question => question.id)).toEqual([
            'setup-core',
            'setup-dependencies',
            'setup-promises'
        ]);
        expect(grouped.pressure.map(question => question.id)).toEqual([
            'pressure-core',
            'pressure-escalation',
            'pressure-subtext'
        ]);
        expect(grouped.payoff.map(question => question.id)).toEqual([
            'payoff-core',
            'payoff-consequences',
            'payoff-loose-ends'
        ]);
    });

    it('filters by tier and zone without losing registry order', () => {
        expect(getCanonicalQuestionsByTierAndZone('signature', 'pressure').map(question => question.id)).toEqual([
            'pressure-escalation',
            'pressure-subtext'
        ]);
    });
});
