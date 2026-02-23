import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('AI settings models table', () => {
    it('renders a single AI model update control in advanced diagnostics', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        expect(source.includes("setName('AI Model Updates')")).toBe(true);
        expect(source.includes("setButtonText('Update AI models')")).toBe(true);
        expect(source.includes('Refresh availability')).toBe(false);
        expect(source.includes('Remote model registry')).toBe(false);
        expect(source.includes("text: 'Models'")).toBe(false);
        expect(source.includes('computeRecommendedPicks')).toBe(false);
    });

    it('keeps AI Strategy to provider, model, and tier controls', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        expect(source.includes(".setName('Provider')")).toBe(true);
        expect(source.includes(".setName('Model')")).toBe(true);
        expect(source.includes(".setName('Access Tier')")).toBe(true);
        expect(source.includes(".setName('Thinking Style')")).toBe(false);
    });

    it('does not render duplicate AI Features container beneath AI Strategy', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        expect(source.includes('AI Features in Radial Timeline')).toBe(false);
        expect(source.includes('ert-ai-features-section')).toBe(false);
    });

    it('keeps gossamer evidence defaulting to auto body-first behavior', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        expect(source.includes("dropdown.addOption('auto', 'Auto (scene bodies first)')")).toBe(true);
        expect(source.includes('auto summary fallback')).toBe(true);
        expect(source.includes('Summaries scale better for large manuscripts.')).toBe(false);
    });

    it('renders active model preview container with wrapped config pill copy', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        expect(source.includes('PREVIEW (ACTIVE MODEL)')).toBe(true);
        expect(source.includes('Automatic Packaging')).toBe(true);
        expect(source.includes('Input ·')).toBe(true);
        expect(source.includes('Response ·')).toBe(true);
        expect(source.includes('Best for')).toBe(false);
    });

    it('uses small dropdown sizing for all AI Strategy controls', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        expect(source.includes("providerDropdown = dropdown;\n        dropdown.selectEl.addClass('ert-input', 'ert-input--sm');")).toBe(true);
        expect(source.includes("modelOverrideDropdown = dropdown;\n        dropdown.selectEl.addClass('ert-input', 'ert-input--sm');")).toBe(true);
        expect(source.includes("accessTierDropdown = dropdown;\n        dropdown.selectEl.addClass('ert-input', 'ert-input--sm');")).toBe(true);
    });

    it('renders Large Manuscript Handling section with execution preference controls', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        expect(source.includes('Large Manuscript Handling')).toBe(true);
        expect(source.includes('Execution Preference')).toBe(true);
        expect(source.includes('singlePassOnly')).toBe(true);
        expect(source.includes('ert-ai-analysis-mode-question-divider')).toBe(true);
    });

    it('renders provider key status states without saved-not-tested phrasing', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        expect(source.includes('Status: Ready ✓')).toBe(true);
        expect(source.includes('Status: Not configured')).toBe(true);
        expect(source.includes('Status: Key rejected')).toBe(true);
        expect(source.includes('Status: Provider validation failed')).toBe(true);
        expect(source.includes('Replace key...')).toBe(true);
        expect(source.includes('Copy key name')).toBe(true);
        expect(source.includes('Saved (not tested)')).toBe(false);
    });
});
