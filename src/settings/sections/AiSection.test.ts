import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BUILTIN_MODELS } from '../../ai/registry/builtinModels';

describe('AI settings models table', () => {
    it('does not render a manual AI model update control in advanced diagnostics', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        expect(source.includes("setName('AI model updates')")).toBe(false);
        expect(source.includes("setButtonText('Update AI models')")).toBe(false);
        expect(source.includes('Last updated:')).toBe(false);
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

    it('keeps AI configuration focused on display and summary defaults without an empty advanced fold', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        expect(source.includes("text: 'Advanced & Diagnostics'")).toBe(false);
        expect(source.includes("text: 'Timeline Display'")).toBe(true);
        expect(source.includes("text: 'Summary Refresh Defaults'")).toBe(true);
        expect(source.includes("title: 'Pulse context'")).toBe(true);
        expect(source.includes("title: 'Synopsis max words'")).toBe(true);
        expect(source.includes("title: 'Target summary length'")).toBe(true);
        expect(source.includes("title: 'Treat summary as weak if under'")).toBe(true);
        expect(source.includes("title: 'Also update Synopsis'")).toBe(true);
    });

    it('locks gossamer to bodies-only with no evidence mode dropdown', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        // No gossamer evidence mode dropdown exists
        expect(source.includes('gossamerEvidenceDropdown')).toBe(false);
        expect(source.includes('GossamerEvidencePreference')).toBe(false);
        expect(source.includes('getGossamerEvidencePreference')).toBe(false);
        // Composition copy confirms bodies-only
        expect(source.includes('Scenes (${formatInquiryCount(sceneCount)}) — full text')).toBe(true);
        expect(source.includes('Outline — not included')).toBe(true);
        expect(source.includes('References — not included')).toBe(true);
    });

    it('renders active model preview with author-facing pill signals only', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        expect(source.includes('PREVIEW (ACTIVE MODEL)')).toBe(true);
        expect(source.includes('resolvePreviewSignals')).toBe(true);
        expect(source.includes('resolveDisplayModelForLatestAlias')).toBe(true);
        expect(source.includes('displayModel: selected')).toBe(true);
        expect(source.includes('getResolvedModelId')).toBe(true);
        expect(source.includes('ID pending')).toBe(true);
        expect(source.includes('Citation or Cache (exclusive)')).toBe(true);
        expect(source.includes('Context · Single-pass at this corpus')).toBe(true);
        expect(source.includes('Automatic Packaging')).toBe(false);
        expect(source.includes('Manual Selection')).toBe(false);
        expect(source.includes('Availability ·')).toBe(false);
        expect(source.includes('API lane ·')).toBe(false);
        expect(source.includes('provider-supported, not integrated')).toBe(false);
        expect(source.includes('not available')).toBe(false);
        expect(source.includes('Grounded/tool attribution')).toBe(false);
        expect(source.includes('Best for')).toBe(false);
    });

    it('keeps all latest-alias preview labels aligned with the selected alias until a concrete ID is resolved', () => {
        const latestAliases = BUILTIN_MODELS
            .filter(model => model.id.includes('latest') || model.alias.includes('latest'))
            .map(model => model.alias)
            .sort();
        expect(latestAliases).toEqual([
            'gemini-pro-latest',
            'gpt-5.1-latest',
            'gpt-5.2-latest'
        ]);
    });

    it('does not carry forward legacy reasoning-depth comparator copy', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        expect(source.includes('resolveReasoningDepthComparator')).toBe(false);
        expect(source.includes('Reasoning depth')).toBe(false);
        expect(source.includes('GPT-5.4 < GPT-5.4 Pro')).toBe(false);
    });

    it('does not carry forward legacy context-window comparison copy', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        expect(source.includes('OPENAI_CONTEXT_WINDOW = 1_050_000')).toBe(false);
        expect(source.includes('GOOGLE_CONTEXT_WINDOW = 1_048_576')).toBe(false);
        expect(source.includes('Context compare · OpenAI')).toBe(false);
    });

    it('does not render inquiry advisory UI in AI Strategy settings', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        expect(source.includes('presentInquiryAdvisory')).toBe(false);
        expect(source.includes('renderInquiryAdvisoryReasonLine')).toBe(false);
        expect(source.includes('renderInquiryAdvisoryExampleLines')).toBe(false);
        expect(source.includes('Inquiry Advisor')).toBe(false);
        expect(source.includes('Suggested engine ·')).toBe(false);
        expect(source.includes('Current engine:')).toBe(false);
        expect(source.includes('Corpus estimate:')).toBe(false);
        expect(source.includes('Snapshot captured:')).toBe(false);
    });

    it('removes inquiry advisory handoff plumbing from settings rendering', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        expect(source.includes('renderInquiryAdvisoryBanner(')).toBe(false);
        expect(source.includes('consumeInquiryAdvisoryHandoffContext')).toBe(false);
        expect(source.includes('clearInquiryAdvisoryHandoffContext')).toBe(false);
        expect(source.includes('params.addAiRelatedElement(inquiryAdvisoryFrame);')).toBe(false);
    });

    it('keeps local quick-config provider-gated instead of globally forced visible', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        expect(source.includes('params.addAiRelatedElement(localQuickConfigSection);')).toBe(false);
        expect(source.includes("localQuickConfigSection.toggleClass('ert-settings-hidden', !isLocal);")).toBe(true);
        expect(source.includes("localQuickConfigSection.toggleClass('ert-settings-visible', isLocal);")).toBe(true);
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

    it('renders always-visible AI transparency section with execution preference controls', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        expect(source.includes(".setName('What gets sent to the AI')")).toBe(true);
        expect(source.includes('Fresh Run*')).toBe(true);
        expect(source.includes('* Estimates use published provider pricing. Actual charges may differ due to provider-side billing rules and account-level adjustments such as caching, credits, promos, or contract pricing.')).toBe(true);
        expect(source.includes('https://openai.com/api/pricing/')).toBe(true);
        expect(source.includes('https://platform.claude.com/docs/en/about-claude/pricing')).toBe(true);
        expect(source.includes('https://ai.google.dev/gemini-api/docs/pricing')).toBe(true);
        expect(source.includes("rowEl.addClass('ert-ai-models-row--active')")).toBe(true);
        expect(source.includes('setActiveCostComparisonRow(provider, displayModel.id)')).toBe(true);
        expect(source.includes('Request composition')).toBe(false);
        expect(source.includes("createEl('details', { cls: 'ert-ai-fold ert-ai-large-handling' }")).toBe(false);
        expect(source.includes('attachAiCollapseButton(largeHandling')).toBe(false);
        expect(source.includes('Execution preference')).toBe(true);
        expect(source.includes('singlePassOnly')).toBe(true);
        expect(source.includes('ert-ai-capacity-grid')).toBe(true);
        expect(source.includes('Expected Structured Passes')).toBe(true);
        expect(source.includes('Estimated provider input')).toBe(true);
    });

    it('clarifies that Pulse context only affects hover reveal', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        expect(source.includes('Include previous and next scenes in triplet analysis hover reveal. (Does not affect the underlying scene properties.)')).toBe(true);
    });

    it('renders structured Inquiry and Gossamer request composition strings', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        expect(source.includes("title: 'Corpus'")).toBe(true);
        expect(source.includes("title: 'Transform'")).toBe(true);
        expect(source.includes("title: 'Prompt'")).toBe(true);
        expect(source.includes("title: 'Output'")).toBe(true);
        expect(source.includes("title: 'Processing'")).toBe(true);
        expect(source.includes('AI role template (author-defined)')).toBe(true);
        expect(source.includes('Editorial analysis instructions')).toBe(true);
        expect(source.includes('outputContractTokens')).toBe(true);
        expect(source.includes('localTotalTokens')).toBe(true);
        expect(source.includes('providerExecutionTokens')).toBe(true);
        expect(source.includes('resolveActiveRoleTemplate')).toBe(true);
        expect(source.includes('buildOutputRulesText')).toBe(true);
        expect(source.includes('Scene-linked findings')).toBe(true);
        expect(source.includes('Strict JSON structure')).toBe(true);
        expect(source.includes('Multi-pass (if required)')).toBe(true);
        expect(source.includes('Beat overlay (ordered sequence)')).toBe(true);
        expect(source.includes('Beat scoring instructions')).toBe(true);
        expect(source.includes('Per-beat scores')).toBe(true);
        expect(source.includes('Provider wrappers')).toBe(true);
        expect(source.includes('Fixed result fields')).toBe(false);
        expect(source.includes('Strict JSON shape')).toBe(false);
        expect(source.includes('Full manuscript (Scene bodies)')).toBe(false);
        expect(source.includes('Book ·')).toBe(false);
        expect(source.includes('response_format')).toBe(false);
        expect(source.includes('tool_choice')).toBe(false);
        expect(source.includes('providerRouter')).toBe(false);
        expect(source.includes('document blocks')).toBe(false);
        expect(source.includes('buildDisplayCorpusEstimateFromManifestEntries(currentCorpus.manifestEntries)')).toBe(false);
        expect(source.includes('sceneCount: currentCorpus?.corpus.sceneCount ?? 0')).toBe(true);
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
