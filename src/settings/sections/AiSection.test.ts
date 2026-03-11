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

    it('keeps AI Strategy to provider, model, and access controls', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        expect(source.includes(".setName('Provider')")).toBe(true);
        expect(source.includes(".setName('Model')")).toBe(true);
        expect(source.includes(".setName('Access')")).toBe(true);
        expect(source.includes(".setName('Thinking Style')")).toBe(false);
    });

    it('does not render duplicate AI Features container beneath AI Strategy', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        expect(source.includes('AI Features in Radial Timeline')).toBe(false);
        expect(source.includes('ert-ai-features-section')).toBe(false);
    });

    it('keeps gossamer evidence defaulting to auto body-first behavior', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        expect(source.includes("dropdown.addOption('auto', 'Auto')")).toBe(true);
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

    it('renders a factual reasoning-depth comparator for known same-provider pairs', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        expect(source.includes('resolveReasoningDepthComparator')).toBe(true);
        expect(source.includes('Reasoning depth')).toBe(true);
        expect(source.includes('GPT-5.4 < GPT-5.4 Pro')).toBe(true);
    });

    it('shows GPT-5.4 Pro on Responses lane without legacy gap warning copy', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        expect(source.includes('API lane · Responses API')).toBe(true);
        expect(source.includes('Responses API gap for GPT-5.4 Pro')).toBe(false);
    });

    it('marks OpenAI grounded attribution as available and Gemini as provider-supported-not-integrated', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        expect(source.includes("if (provider === 'openai') return 'available_in_rt';")).toBe(true);
        expect(source.includes("if (provider === 'google') return 'provider_supported_not_integrated';")).toBe(true);
    });

    it('keeps inquiry advisory hidden when no handoff context exists', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        expect(source.includes('renderInquiryAdvisoryBanner(plugin.consumeInquiryAdvisoryHandoffContext());')).toBe(true);
        expect(source.includes('params.addAiRelatedElement(inquiryAdvisoryFrame);')).toBe(false);
    });

    it('uses medium dropdown sizing for all AI Strategy controls', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        expect(source.includes('providerDropdown = dropdown;')).toBe(true);
        expect(source.includes('modelOverrideDropdown = dropdown;')).toBe(true);
        expect(source.includes('accessTierDropdown = dropdown;')).toBe(true);
        expect(source.includes("dropdown.selectEl.addClass('ert-input', 'ert-input--md', 'ert-ai-strategy-select');")).toBe(true);
    });

    it('curates OpenAI model picker to canonical public aliases', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        expect(source.includes('getPickerModelsForProvider')).toBe(true);
        expect(source.includes("selectLatestModelByReleaseChannel(BUILTIN_MODELS, 'openai', 'stable')")).toBe(true);
        expect(source.includes('formatOpenAiInternalPinnedLabel')).toBe(true);
        expect(source.includes("addOption('gpt-5.4-2026-03-05'")).toBe(false);
        expect(source.includes("addOption('gpt-5.4-pro-2026-03-05'")).toBe(false);
    });

    it('renders Large Manuscript Handling section with execution preference controls', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        expect(source.includes('Large Manuscript Handling')).toBe(true);
        expect(source.includes('Execution Preference')).toBe(true);
        expect(source.includes('singlePassOnly')).toBe(true);
        expect(source.includes('ert-ai-status-grid')).toBe(true);
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
