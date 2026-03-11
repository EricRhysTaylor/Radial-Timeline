import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Gossamer AI evidence mode wiring', () => {
    it('routes analysis through bodies-only evidence assembly with no summary fallback', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/GossamerCommands.ts'), 'utf8');
        expect(source).toContain('resolveGossamerEvidence({');
        expect(source).toContain('Scene bodies');
        // No summary mode or fallback path
        expect(source).not.toContain('Summaries');
        expect(source).not.toContain('auto fallback');
        expect(source).not.toContain('GossamerEvidencePreference');
        expect(source).not.toContain('resolveSafeGossamerInputLimit');
    });
});
