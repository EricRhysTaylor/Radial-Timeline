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
                        evidenceQuote: 'Bingley walked in without ceremony, scarcely glancing at the crowd.',
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
        expect(content).toContain('- Source results: 1 item · scene=1');
        expect(content).toContain('- Cache: warm · status=hit · prefix=100% · tokens=164k · read=164k');
        expect(content).toContain('- Actual usage cost: $');
        expect(content.indexOf('## Cost Breakdown')).toBeGreaterThan(content.indexOf('## Run Summary'));
        expect(content.indexOf('## Cost Breakdown')).toBeLessThan(content.indexOf('## Corpus Summary'));
        expect(content.indexOf('- Citation support: Sources · Limited implementation')).toBeGreaterThan(content.indexOf('## Run Summary'));
        expect(content.indexOf('- Source results: 1 item · scene=1')).toBeLessThan(content.indexOf('## Corpus Summary'));
        expect(content.indexOf('- Cache: warm')).toBeGreaterThan(content.indexOf('## Run Summary'));
        expect(content.indexOf('- Cache: warm')).toBeLessThan(content.indexOf('## Corpus Summary'));
        expect(content.indexOf('## Corpus TOC')).toBeGreaterThan(content.indexOf('## Suggested Fixes'));
        expect(content.indexOf('## Corpus TOC')).toBeLessThan(content.indexOf('Content Log: written'));
    });

    it('reports Gemini cache transport without OpenAI prompt-cache fallback claims', () => {
        const content = buildInquiryLogContent({
            result: {
                scope: 'saga',
                scopeLabel: 'Σ',
                aiProvider: 'google',
                aiModelResolved: 'gemini-2.5-pro',
                aiModelRequested: 'gemini-2.5-pro',
                findings: [],
                verdict: {
                    flow: 85,
                    depth: 80
                },
                cacheReuseFingerprint: 'h540625845'
            } as never,
            trace: {
                userPrompt: 'stable prefix\n\nscene text',
                evidenceText: 'scene text',
                tokenUsageKnown: true,
                tokenUsageScope: 'known',
                cacheReuseState: 'warm',
                cacheStatus: 'hit',
                cachedStableRatio: 1,
                cachedStableTokens: 281000,
                requestPayload: {
                    cachedContent: 'cachedContents/abc123'
                },
                response: null,
                usage: {
                    inputTokens: 264606,
                    outputTokens: 531,
                    totalTokens: 270000,
                    cacheReadInputTokens: 264584
                }
            } as never,
            manifest: {
                entries: [],
                classCounts: {
                    scene: 56,
                    outline: 0
                }
            } as never,
            deps,
            contentLogWritten: true
        });

        expect(content).toContain('- Gemini cachedContent: cachedContents/abc123');
        expect(content).toContain('- Actual usage cost: $0.147');
        expect(content).toContain('- Raw provider usage JSON: not captured; normalized token usage available');
        expect(content).not.toContain('prompt_cache_key sent');
        expect(content).not.toContain('unsupported');
    });

    it('reports OpenAI prompt cache keys only for OpenAI payloads', () => {
        const content = buildInquiryLogContent({
            result: {
                scope: 'book',
                scopeLabel: 'B1',
                aiProvider: 'openai',
                aiModelResolved: 'gpt-5.4',
                aiModelRequested: 'gpt-5.4',
                findings: [],
                verdict: {
                    flow: 68,
                    depth: 74
                },
                cacheReuseFingerprint: 'h578972009'
            } as never,
            trace: {
                userPrompt: 'stable prefix\n\nscene text',
                evidenceText: 'scene text',
                tokenUsageKnown: true,
                tokenUsageScope: 'known',
                requestPayload: {
                    prompt_cache_key: 'h578972009'
                },
                response: null,
                usage: {
                    inputTokens: 258554,
                    outputTokens: 2190,
                    totalTokens: 260744,
                    cacheReadInputTokens: 258432
                }
            } as never,
            manifest: null,
            deps,
            contentLogWritten: true
        });

        expect(content).toContain('- OpenAI prompt_cache_key: h578972009');
        expect(content).not.toContain('bypassProviderReuse or unsupported');
    });
});
