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
        expect(source.includes("} else if (provider === 'openai') {")).toBe(true);
        expect(source.includes("reuseState = cacheDelimiterUsed ? 'eligible' : 'idle';")).toBe(true);
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
        expect(source.includes("promptCacheKey: !bypassProviderReuse ? estimate.providerReuseKey : undefined,")).toBe(true);
        expect(source.includes("(provider === 'openai' && advancedContext.reuseState !== 'idle')")).toBe(true);
    });
});

/**
 * Privacy-flag wiring (regression guard added 2026-05-23).
 *
 * The aiSettings.privacy block is the user's authoritative consent for outbound
 * model-data calls. AIClient previously hard-coded allowRemoteRegistry: true
 * and provider-snapshot enabled: true in every loader constructor, making the
 * settings UI toggles decorative. These source-grep tests pin the rule that
 * every loader must read its consent flag from settings — not from a literal.
 */
describe('AI client privacy-flag wiring', () => {
    const rawSource = readFileSync(resolve(process.cwd(), 'src/ai/runtime/aiClient.ts'), 'utf8');
    // Strip comments before grepping so docstring mentions of the forbidden
    // patterns (e.g. explaining what was previously hard-coded) don't fire.
    const code = rawSource
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');

    it('reads allowRemoteRegistry from privacy settings on every registry build', () => {
        expect(code).toContain('isRemoteRegistryAllowed()');
        expect(code).toContain('allowRemoteRegistry: this.isRemoteRegistryAllowed()');
        expect(code).toContain('getAiSettings(this.plugin.settings).privacy.allowRemoteRegistry');
    });

    it('reads allowProviderSnapshot from privacy settings on every snapshot fetch', () => {
        expect(code).toContain('isProviderSnapshotAllowed()');
        expect(code).toContain('enabled: this.isProviderSnapshotAllowed()');
        expect(code).toContain('getAiSettings(this.plugin.settings).privacy.allowProviderSnapshot');
    });

    it('never hard-codes allowRemoteRegistry: true in executable code', () => {
        expect(code).not.toMatch(/allowRemoteRegistry:\s*true\b/);
    });

    it('never hard-codes enabled: true on the provider-snapshot loader', () => {
        // Constrain the search to the loadProviderSnapshot call so legitimate
        // enabled:true elsewhere (e.g. unrelated boolean fields) doesn't trip.
        const loaderBlockMatch = code.match(/loadProviderSnapshot\(\{[\s\S]*?\}\)/);
        expect(loaderBlockMatch).not.toBeNull();
        if (loaderBlockMatch) {
            expect(loaderBlockMatch[0]).not.toMatch(/enabled:\s*true\b/);
        }
    });
});

/**
 * Pre-dispatch availability gate (regression guard added 2026-05-23).
 *
 * The provider snapshot reports whether a model is exposed to the user's
 * account at their access tier. Previously, availabilityStatus was recorded
 * on advancedContext but the run dispatched anyway — burning the user's
 * API quota on a guaranteed 404/400. This guard pins that the not_visible
 * status hard-fails before this.execute() is called.
 */
describe('AI client model-availability gate', () => {
    const rawSource = readFileSync(resolve(process.cwd(), 'src/ai/runtime/aiClient.ts'), 'utf8');
    const code = rawSource
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');

    it('throws before dispatch when availabilityStatus is not_visible', () => {
        expect(code).toMatch(/if\s*\(\s*availabilityStatus\s*===\s*['"]not_visible['"]\s*\)\s*\{[\s\S]*?throw new Error/);
    });

    it('only throws after advancedContext is set so the UI/logs see the not_visible status', () => {
        const setLastIndex = code.indexOf('setLastRunAdvanced(this.plugin, request.feature, advancedContext)');
        const gateIndex = code.search(/if\s*\(\s*availabilityStatus\s*===\s*['"]not_visible['"]\s*\)/);
        const executeIndex = code.indexOf('this.execute(providerClient');
        expect(setLastIndex).toBeGreaterThan(-1);
        expect(gateIndex).toBeGreaterThan(-1);
        expect(executeIndex).toBeGreaterThan(-1);
        expect(gateIndex).toBeGreaterThan(setLastIndex);
        expect(gateIndex).toBeLessThan(executeIndex);
    });
});
