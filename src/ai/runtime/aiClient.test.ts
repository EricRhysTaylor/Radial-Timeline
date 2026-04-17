import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('AI client resolved-model caching', () => {
    it('records live provider resolved models back into the alias cache', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/ai/runtime/aiClient.ts'), 'utf8');
        expect(source.includes('cacheResolvedModel')).toBe(true);
        expect(source.includes('recordResolvedAlias(execution.aiModelRequested, execution.aiModelResolved)')).toBe(true);
        expect(source.includes('recordResolvedAlias(retry.aiModelRequested, retry.aiModelResolved)')).toBe(true);
        expect(source.includes('recordResolvedAlias(cached.modelRequested, cached.modelResolved)')).toBe(true);
    });

    it('treats Anthropic Inquiry cache state as eligible until the provider confirms a hit', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/ai/runtime/aiClient.ts'), 'utf8');
        expect(source.includes("userQuestion: request.userQuestion")).toBe(true);
        expect(source.includes("placeUserQuestionLast: isInquiry && typeof request.userQuestion === 'string' && request.userQuestion.trim().length > 0")).toBe(true);
        expect(source.includes('const cacheDelimiterUsed = userPrompt.includes(CACHE_BREAK_DELIMITER);')).toBe(true);
        expect(source.includes("reuseState = cacheAttempted ? 'eligible' : 'idle';")).toBe(true);
        expect(source.includes("(provider === 'openai' && advancedContext.reuseState !== 'idle')")).toBe(true);
        expect(source.includes("if (provider === 'google' && typeof cachedStableRatio === 'number') {")).toBe(true);
        expect(source.includes("if (provider === 'google' && typeof cachedStableTokens === 'number') {")).toBe(true);
        expect(source.includes("if (!bypassProviderReuse && provider === 'openai') {")).toBe(true);
    });

    it('builds the shared result cache key from the full prepared request contract', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/ai/runtime/aiClient.ts'), 'utf8');
        expect(source.includes('modelId: initialSelection.model.id')).toBe(true);
        expect(source.includes('responseSchema: request.responseSchema')).toBe(true);
        expect(source.includes('citationsEnabled: caps.citationsEnabled')).toBe(true);
        expect(source.includes('useDocumentBlocks')).toBe(true);
        expect(source.includes('evidenceDocuments')).toBe(true);
    });

    it('stamps shared timing fields on live provider runs and marks in-memory cache hits explicitly', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/ai/runtime/aiClient.ts'), 'utf8');
        expect(source.includes('function withRunTiming')).toBe(true);
        expect(source.includes('function withRunValidation')).toBe(true);
        expect(source.includes('servedFromCache: true')).toBe(true);
        expect(source.includes("warnings: [...cached.warnings, 'Served from in-memory cache.']")).toBe(true);
        expect(source.includes('submittedAt: submittedAt.toISOString()')).toBe(true);
        expect(source.includes('returnedAt: returnedAt.toISOString()')).toBe(true);
        expect(source.includes('durationMs: Math.max(0, returnedAt.getTime() - submittedAt.getTime())')).toBe(true);
    });

    it('lets callers bypass both shared result caching and provider reuse explicitly', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/ai/runtime/aiClient.ts'), 'utf8');
        expect(source.includes('const bypassProviderReuse = request.bypassProviderReuse === true;')).toBe(true);
        expect(source.includes('const bypassInMemoryCache = request.bypassInMemoryCache === true || bypassProviderReuse;')).toBe(true);
        expect(source.includes('if (!bypassInMemoryCache) {')).toBe(true);
        expect(source.includes('bypassProviderReuse,')).toBe(true);
        expect(source.includes("(provider === 'openai' && advancedContext.reuseState !== 'idle')")).toBe(true);
    });
});
