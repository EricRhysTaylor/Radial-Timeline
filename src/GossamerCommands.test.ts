import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Gossamer AI evidence mode wiring', () => {
    it('routes analysis through mode-aware evidence assembly', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/GossamerCommands.ts'), 'utf8');
        expect(source).toContain('getGossamerEvidenceMode(plugin)');
        expect(source).toContain('buildGossamerEvidenceDocument({');
        expect(source).toContain('evidenceMode');
    });
});
