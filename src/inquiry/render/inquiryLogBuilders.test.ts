import { describe, expect, it } from 'vitest';
import { buildInquiryLogContent, type InquiryLogBuilderDependencies } from './inquiryLogBuilders';

describe('buildInquiryLogContent', () => {
    const deps: InquiryLogBuilderDependencies = {
        getQuestionLabel: () => 'Pres2: Underwritten Beats',
        getBriefModelLabel: () => 'GPT-5.4',
        getFiniteTokenEstimateInput: () => 174000,
        getTokenTier: () => 'red',
        buildInquiryLogCostEstimateInput: () => null,
        formatTokenUsageVisibility: () => 'known',
        isErrorResult: () => false,
        isDegradedResult: () => false,
        formatMetricDisplay: (value: number) => String(Math.round(value)),
        resolveManifestEntryLabel: entry => entry.path,
        normalizeEvidenceMode: mode => mode === 'summary' ? 'summary' : mode === 'full' ? 'full' : 'excluded',
        normalizeLegacyResult: result => result,
        resolveInquiryBriefZoneLabel: () => 'Pressure',
        resolveInquiryBriefLensLabel: () => 'Flow',
        formatInquiryIdFromResult: () => 'inq_123',
        pluginVersion: 'test',
        estimateSnapshot: null
    };

    it('surfaces cache summary near the top and moves corpus toc to the bottom', () => {
        const content = buildInquiryLogContent({
            result: {
                scope: 'book',
                scopeLabel: 'B1',
                aiProvider: 'openai',
                aiModelResolved: 'gpt-5.4',
                aiModelRequested: 'gpt-5.4',
                evidenceDocumentMeta: [
                    {
                        title: '1 Bingley Arrives',
                        path: 'Pride & Prejudice/1 Bingley Arrives.md',
                        sceneId: 'scn_a1b2c3d4',
                        evidenceClass: 'scene'
                    }
                ],
                findings: [
                    {
                        headline: 'Underwritten setup beats',
                        bullets: ['Arrival beat lands softly before social tension locks in.'],
                        refId: 'scn_a1b2c3d4',
                        severity: 'medium'
                    }
                ],
                verdict: {
                    flow: 86,
                    depth: 88
                }
            } as never,
            trace: {
                tokenUsageKnown: true,
                tokenUsageScope: 'known',
                cacheReuseState: 'warm',
                cacheStatus: 'hit',
                cachedStableRatio: 1,
                cachedStableTokens: 164224,
                usage: {
                    inputTokens: 164434,
                    outputTokens: 988,
                    totalTokens: 165422,
                    cacheReadInputTokens: 164224
                }
            } as never,
            manifest: {
                entries: [
                    { class: 'scene', mode: 'full', path: 'Book 1/1 Scene.md' }
                ],
                classCounts: {
                    scene: 1,
                    outline: 0
                }
            } as never,
            deps,
            contentLogWritten: true
        });

        expect(content).toContain('- Citation support: Sources · Limited implementation');
        expect(content).toContain('- Source results: 1 item · scene anchor=1');
        expect(content).toContain('- Cache: warm · status=hit · prefix=100% · tokens=164k · read=164k');
        expect(content.indexOf('- Citation support: Sources · Limited implementation')).toBeGreaterThan(content.indexOf('## Run Summary'));
        expect(content.indexOf('- Source results: 1 item · scene anchor=1')).toBeLessThan(content.indexOf('## Corpus Summary'));
        expect(content.indexOf('- Cache: warm')).toBeGreaterThan(content.indexOf('## Run Summary'));
        expect(content.indexOf('- Cache: warm')).toBeLessThan(content.indexOf('## Corpus Summary'));
        expect(content.indexOf('## Corpus TOC')).toBeGreaterThan(content.indexOf('## Suggested Fixes'));
        expect(content.indexOf('## Corpus TOC')).toBeLessThan(content.indexOf('Content Log: written'));
    });
});
