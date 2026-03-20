import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Inquiry sources presets', () => {
    it('shows an inferred material preset as active when preset metadata is missing', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/InquirySection.ts'), 'utf8');
        expect(source.includes('const getEffectivePresetSelection = (): InquirySourcesPreset | null => {')).toBe(true);
        expect(source.includes('if (inquirySources.preset) return inquirySources.preset;')).toBe(true);
        expect(source.includes('return inferPresetFromClasses(inquirySources.classes);')).toBe(true);
        expect(source.includes('const effectivePreset = inquirySources.preset ?? inferPresetFromClasses(merged) ?? undefined;')).toBe(true);
    });

    it('marks scan folder preset buttons active when covered by wildcard/root patterns', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/InquirySection.ts'), 'utf8');
        expect(source.includes('const isScanPresetCovered = (presetRoots: string[], selectedRoots: string[]): boolean => {')).toBe(true);
        expect(source.includes('const isActive = explicitlyActive || (hasRoots && isScanPresetCovered(roots, selectedRoots));')).toBe(true);
    });

    it('includes inquiry canonical loader and destructive replacement copy', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/InquirySection.ts'), 'utf8');
        expect(source.includes('Load Core Questions')).toBe(true);
        expect(source.includes('Load Full Pro Signature Set')).toBe(true);
        expect(source.includes('This custom question will be replaced and cannot be recovered.')).toBe(true);
        expect(source.includes('Replace from library')).toBe(true);
        expect(source.includes('Already added — moved to existing question')).toBe(true);
        expect(source.includes('Already added')).toBe(true);
    });
});
