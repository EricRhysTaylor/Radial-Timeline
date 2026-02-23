import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('AI settings models table', () => {
    it('renders unknown availability helper when snapshot is missing', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        expect(source.includes('Availability is unavailable from the latest snapshot update.')).toBe(true);
        expect(source.includes("else if (snapshot.warning)")).toBe(true);
        expect(source.includes('formatAvailabilityLabel(model.availabilityStatus)')).toBe(true);
    });

    it('renders a single AI model update control in advanced diagnostics', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        expect(source.includes("setName('AI Model Updates')")).toBe(true);
        expect(source.includes("setButtonText('Update AI models')")).toBe(true);
        expect(source.includes('Refresh availability')).toBe(false);
        expect(source.includes('Remote model registry')).toBe(false);
    });

    it('renders recommendations block above models area', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        expect(source.includes('Recommended picks')).toBe(true);
        expect(source.includes('ert-ai-recommendations')).toBe(true);
        expect(source.includes('computeRecommendedPicks')).toBe(true);
    });

    it('keeps AI Strategy to provider, model, and tier controls', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        expect(source.includes(".setName('Provider')")).toBe(true);
        expect(source.includes(".setName('Model')")).toBe(true);
        expect(source.includes(".setName('Access Tier')")).toBe(true);
        expect(source.includes(".setName('Thinking Style')")).toBe(false);
    });

    it('renders factual AI feature descriptions under AI Strategy', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        expect(source.includes('AI Features in Radial Timeline')).toBe(true);
        expect(source.includes('Inquiry — Cross-scene structural analysis across selected corpus.')).toBe(true);
        expect(source.includes('Pulse (Triplet Analysis) — Evaluates a scene in context of previous and next scenes.')).toBe(true);
        expect(source.includes('Gossamer Momentum — Measures beat-level structural drive and tension.')).toBe(true);
    });

    it('does not render the dense models table rows in refresh flow', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        expect(source.includes('renderModelsTable(merged, selection)')).toBe(false);
    });

    it('renders active model preview container with wrapped config pill copy', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        expect(source.includes('PREVIEW (ACTIVE MODEL)')).toBe(true);
        expect(source.includes('Automatic Packaging')).toBe(true);
        expect(source.includes('Input ·')).toBe(true);
        expect(source.includes('Response ·')).toBe(true);
        expect(source.includes('Best for')).toBe(false);
    });

    it('renders Large Manuscript Handling section with execution preference controls', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        expect(source.includes('Large Manuscript Handling')).toBe(true);
        expect(source.includes('Execution Preference')).toBe(true);
        expect(source.includes('singlePassOnly')).toBe(true);
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
