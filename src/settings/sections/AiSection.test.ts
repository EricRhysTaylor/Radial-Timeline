import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildDefaultAiSettings } from '../../ai/settings/aiSettings';
import { BUILTIN_MODELS } from '../../ai/registry/builtinModels';
import { mergeCuratedWithSnapshot } from '../../ai/registry/mergeModels';
import { computeRecommendedPicks, getRecommendationComparisonTag } from '../../ai/registry/recommendations';

describe('AI settings models table', () => {
    it('renders unknown availability helper when snapshot is missing', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        expect(source.includes('Enable Provider Snapshot to show key-based availability.')).toBe(true);
        expect(source.includes('formatAvailabilityLabel(model.availabilityStatus)')).toBe(true);
    });

    it('renders recommended picks header and computes three primary recommendation labels', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        expect(source.includes('Recommended picks')).toBe(true);
        expect(source.includes('computeRecommendedPicks')).toBe(true);

        const aiSettings = buildDefaultAiSettings();
        aiSettings.provider = 'anthropic';
        const merged = mergeCuratedWithSnapshot(BUILTIN_MODELS, null);
        const picks = computeRecommendedPicks({
            models: merged,
            aiSettings,
            includeLocalPrivate: false
        });

        expect(picks.map(pick => pick.title)).toEqual([
            'Recommended for Inquiry',
            'Recommended for Gossamer',
            'Recommended for Quick tasks'
        ]);
    });

    it('shows Using this now when recommendation matches current effective selection', () => {
        const aiSettings = buildDefaultAiSettings();
        aiSettings.provider = 'anthropic';
        const merged = mergeCuratedWithSnapshot(BUILTIN_MODELS, null);
        const picks = computeRecommendedPicks({
            models: merged,
            aiSettings,
            includeLocalPrivate: false
        });
        const inquiry = picks.find(pick => pick.id === 'inquiry');
        expect(inquiry).toBeDefined();

        const tag = inquiry ? getRecommendationComparisonTag(inquiry, {
            provider: inquiry.model?.provider || 'anthropic',
            alias: inquiry.model?.alias,
            modelId: inquiry.model?.providerModelId,
            availabilityStatus: 'visible'
        }) : null;
        expect(tag).toBe('Using this now');
    });

    it('shows Different from current when recommendation differs from current selection', () => {
        const aiSettings = buildDefaultAiSettings();
        aiSettings.provider = 'anthropic';
        const merged = mergeCuratedWithSnapshot(BUILTIN_MODELS, null);
        const picks = computeRecommendedPicks({
            models: merged,
            aiSettings,
            includeLocalPrivate: false
        });
        const inquiry = picks.find(pick => pick.id === 'inquiry');
        expect(inquiry).toBeDefined();

        const tag = inquiry ? getRecommendationComparisonTag(inquiry, {
            provider: 'anthropic',
            alias: 'different-alias',
            modelId: 'different-id',
            availabilityStatus: 'visible'
        }) : null;
        expect(tag).toBe('Different from current');
    });

    it('renders unknown availability snapshot hint copy in recommendations block', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        expect(source.includes('Enable Provider Snapshot for key-based visibility.')).toBe(true);
        expect(source.includes('This only fetches model details and availability.')).toBe(true);
    });

    it('renders active model preview container with wrapped config pill copy', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        expect(source.includes('PREVIEW (ACTIVE MODEL)')).toBe(true);
        expect(source.includes('Automatic Packaging')).toBe(true);
        expect(source.includes('Input ·')).toBe(true);
        expect(source.includes('Response ·')).toBe(true);
    });

    it('renders Large Manuscript Handling section with execution preference controls', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');
        expect(source.includes('Large Manuscript Handling')).toBe(true);
        expect(source.includes('Execution Preference')).toBe(true);
        expect(source.includes('singlePassOnly')).toBe(true);
    });
});
