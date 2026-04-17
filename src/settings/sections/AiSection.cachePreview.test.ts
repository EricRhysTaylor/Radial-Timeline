import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('AI settings cache preview signals', () => {
    it('renders provider-cache preview pills and cache-ready certificate copy as active signals', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        expect(source.includes("/^Reuse\\s*·\\s*Provider cache$/i.test(label)")).toBe(true);
        expect(source.includes("extraCls: 'ert-ai-pill--active'")).toBe(true);
        expect(source.includes("extraPills.push({ text: 'Cache · Ready', extraCls: 'ert-ai-pill--active' });")).toBe(true);
        expect(source.includes("extraPills.push({ text: 'Cache · Warm hit', extraCls: 'ert-ai-pill--active' });")).toBe(true);
        expect(source.includes('Warm cache confirmed for current corpus')).toBe(true);
        expect(source.includes('Cache ready for current corpus')).toBe(true);
        expect(source.includes('Observed cache hit ·')).toBe(true);
    });
});
