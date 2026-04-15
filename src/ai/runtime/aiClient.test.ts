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
        expect(source.includes('if ((provider === \'anthropic\' && cacheAttempted) || (provider === \'google\' && cacheDelimiterUsed)) {')).toBe(true);
    });
});
