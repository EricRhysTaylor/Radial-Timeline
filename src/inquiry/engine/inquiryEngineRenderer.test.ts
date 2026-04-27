import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { computeCachePillState, computeCitationPillState } from './inquiryEngineRenderer';

describe('inquiryEngineRenderer wording', () => {
    it('uses eligible/validation wording for blocked Local LLM Inquiry state', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/inquiry/engine/inquiryEngineRenderer.ts'), 'utf8');
        expect(source.includes('No eligible model for Inquiry')).toBe(true);
        expect(source.includes('Local LLM is connected')).toBe(true);
        expect(source.includes('Selected model passes basic validation')).toBe(true);
        expect(source.includes('This model does not meet Inquiry requirements for the current corpus')).toBe(true);
        expect(source.includes('No working model')).toBe(false);
    });
});

describe('computeCachePillState', () => {
    it('returns null when no usage is available (no run yet)', () => {
        expect(computeCachePillState(undefined)).toBeNull();
    });

    it('returns null when usage exists but every input field is zero/missing', () => {
        expect(computeCachePillState({})).toBeNull();
    });

    it('reports confirmed reuse with percentage when cache_read > 0', () => {
        const pill = computeCachePillState({
            inputTokens: 2_000,
            cacheReadInputTokens: 8_000
        });
        expect(pill?.state).toBe('confirmed');
        // 8_000 / (2_000 + 8_000) = 80%
        expect(pill?.label).toBe('Cache reused · 80%');
        expect(pill?.tooltip).toContain('8,000');
    });

    it('reports primed when cache_creation > 0 but cache_read == 0', () => {
        const pill = computeCachePillState({
            inputTokens: 5_000,
            cacheCreationInputTokens: 95_000
        });
        expect(pill?.state).toBe('primed');
        expect(pill?.label).toBe('Cache primed');
        expect(pill?.tooltip).toContain('95,000');
    });

    it('reports miss when input is non-zero but neither cache field is populated', () => {
        const pill = computeCachePillState({
            inputTokens: 50_000
        });
        expect(pill?.state).toBe('miss');
        expect(pill?.label).toBe('Cache miss');
    });

    it('treats cache_read of 0 with positive cache_creation as primed (pass-1 priming behavior)', () => {
        const pill = computeCachePillState({
            inputTokens: 1_000,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 100_000
        });
        expect(pill?.state).toBe('primed');
    });
});

describe('computeCitationPillState', () => {
    it('reports off when the toggle is disabled', () => {
        const pill = computeCitationPillState(false, undefined);
        expect(pill.state).toBe('off');
        expect(pill.label).toBe('Citations off');
    });

    it('reports off even when a recent run is present', () => {
        const pill = computeCitationPillState(false, {
            citationsRequested: false,
            citationCount: 5,
            tokenUsage: { inputTokens: 100 }
        });
        expect(pill.state).toBe('off');
    });

    it('reports pending when citations are on but no run has happened yet', () => {
        const pill = computeCitationPillState(true, undefined);
        expect(pill.state).toBe('on-pending');
        expect(pill.label).toBe('Citations on');
    });

    it('reports confirmed with the citation count after a successful run', () => {
        const pill = computeCitationPillState(true, {
            citationsRequested: true,
            citationCount: 7,
            tokenUsage: { inputTokens: 100 }
        });
        expect(pill.state).toBe('on-confirmed');
        expect(pill.label).toBe('Citations · 7');
    });

    it('uses singular wording in the tooltip when only one citation came back', () => {
        const pill = computeCitationPillState(true, {
            citationsRequested: true,
            citationCount: 1,
            tokenUsage: { inputTokens: 100 }
        });
        expect(pill.tooltip).toContain('1 citation anchor.');
    });

    it('reports missing-warning when citations were requested but none came back', () => {
        const pill = computeCitationPillState(true, {
            citationsRequested: true,
            citationCount: 0,
            tokenUsage: { inputTokens: 100 }
        });
        expect(pill.state).toBe('on-missing');
        expect(pill.label).toBe('Citations missing');
        expect(pill.tooltip).toContain('zero citation anchors');
    });
});
