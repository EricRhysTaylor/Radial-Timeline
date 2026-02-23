import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Gossamer AI evidence mode wiring', () => {
    it('routes analysis through auto body-first evidence assembly with fallback support', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/GossamerCommands.ts'), 'utf8');
        expect(source).toContain('resolveGossamerEvidence({');
        expect(source).toContain('Scene bodies (auto)');
        expect(source).toContain('Summaries (auto fallback)');
    });
});
