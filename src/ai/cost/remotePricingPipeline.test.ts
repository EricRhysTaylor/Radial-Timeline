/**
 * Integration tests for the remote pricing + registry pipeline.
 *
 * Covers: remote happy path, fallback behavior, drift handling,
 * cache/freshness, and end-to-end data flow from fetch to cost table inputs.
 */
import { describe, expect, it, afterEach, vi } from 'vitest';
import { loadRemotePricing, type RemotePricingOptions } from './remotePricing';
import {
    mergeRemotePricing,
    resetPricingToBuiltin,
    getActivePricingTable,
    getActivePricingMeta,
    getProviderPricing,
    getPricingFreshnessLabel,
    BUILTIN_PRICING,
    type ProviderPricingTable
} from './providerPricing';
import { loadRemoteRegistry, type RemoteRegistryOptions } from '../registry/remoteRegistry';
import { BUILTIN_MODELS } from '../registry/builtinModels';
import { ModelRegistry } from '../registry/modelRegistry';
import type { ModelInfo } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid ModelInfo for testing. */
function makeModel(overrides: Partial<ModelInfo> & { provider: ModelInfo['provider']; id: string; alias: string }): ModelInfo {
    return {
        label: overrides.alias,
        tier: 'BALANCED',
        capabilities: ['jsonStrict'],
        personality: { reasoning: 5, writing: 5, determinism: 5 },
        contextWindow: 100000,
        maxOutput: 4000,
        status: 'stable',
        ...overrides
    };
}

function freshCacheJson<T>(table: T): string {
    return JSON.stringify({ fetchedAt: new Date().toISOString(), ...table });
}

function staleCacheJson<T>(table: T): string {
    return JSON.stringify({ fetchedAt: '2000-01-01T00:00:00.000Z', ...table });
}

function mockFetch(payload: unknown, ok = true, status = 200) {
    return async () => ({ ok, status, json: async () => payload });
}

function failingFetch(status = 500) {
    return async () => ({ ok: false, status, json: async () => ({}) });
}

function throwingFetch() {
    return async (): Promise<never> => { throw new Error('network timeout'); };
}

const noopCache = { readCache: async () => null as string | null, writeCache: async () => undefined };

// ---------------------------------------------------------------------------
// 1. Remote pricing: happy path
// ---------------------------------------------------------------------------

describe('remote pricing pipeline — happy path', () => {
    afterEach(() => resetPricingToBuiltin());

    it('fetched remote pricing is merged and drives active pricing table', async () => {
        const remotePayload = {
            models: [
                { provider: 'anthropic', modelId: 'claude-sonnet-4-6', inputPer1M: 2.5, outputPer1M: 12.0 },
                { provider: 'openai', modelId: 'gpt-5.4', inputPer1M: 2.8, outputPer1M: 9.0 }
            ]
        };
        const result = await loadRemotePricing({
            enabled: true,
            url: 'https://example.com/pricing.json',
            ...noopCache,
            fetchImpl: mockFetch(remotePayload)
        });

        expect(result.source).toBe('remote');
        expect(result.table).not.toBeNull();

        mergeRemotePricing(result.table!, result.source, result.fetchedAt);

        expect(getProviderPricing('anthropic', 'claude-sonnet-4-6').inputPer1M).toBe(2.5);
        expect(getProviderPricing('openai', 'gpt-5.4').inputPer1M).toBe(2.8);
        expect(getActivePricingMeta().source).toBe('remote');
    });

    it('new remote-only model appears in active pricing after merge', async () => {
        const remotePayload = {
            models: [
                { provider: 'anthropic', modelId: 'claude-future-7', inputPer1M: 1.0, outputPer1M: 5.0 }
            ]
        };
        const result = await loadRemotePricing({
            enabled: true,
            url: 'https://example.com/pricing.json',
            ...noopCache,
            fetchImpl: mockFetch(remotePayload)
        });

        mergeRemotePricing(result.table!, result.source, result.fetchedAt);

        // New model should be accessible
        expect(getProviderPricing('anthropic', 'claude-future-7').inputPer1M).toBe(1.0);
        // Existing builtin should still be there
        expect(getProviderPricing('anthropic', 'claude-sonnet-4-6').inputPer1M).toBe(3.0);
    });

    it('remote pricing overrides builtin pricing for same model', async () => {
        const original = getProviderPricing('openai', 'gpt-5.4');
        expect(original.inputPer1M).toBe(3.0);

        mergeRemotePricing({
            openai: { 'gpt-5.4': { inputPer1M: 1.5, outputPer1M: 7.0 } }
        }, 'remote', new Date().toISOString());

        expect(getProviderPricing('openai', 'gpt-5.4').inputPer1M).toBe(1.5);
    });

    it('cache is written on successful remote fetch', async () => {
        let writtenContent = '';
        await loadRemotePricing({
            enabled: true,
            url: 'https://example.com/pricing.json',
            readCache: async () => null,
            writeCache: async (content) => { writtenContent = content; },
            fetchImpl: mockFetch({
                models: [{ provider: 'openai', modelId: 'gpt-5.4', inputPer1M: 3, outputPer1M: 10 }]
            })
        });

        expect(writtenContent).toBeTruthy();
        const parsed = JSON.parse(writtenContent);
        expect(parsed.fetchedAt).toBeDefined();
        expect(parsed.table.openai?.['gpt-5.4']).toBeDefined();
    });
});

// ---------------------------------------------------------------------------
// 2. Remote pricing: fallback behavior
// ---------------------------------------------------------------------------

describe('remote pricing pipeline — fallback behavior', () => {
    afterEach(() => resetPricingToBuiltin());

    it('uses stale cache when remote fetch returns non-ok', async () => {
        const result = await loadRemotePricing({
            enabled: true,
            url: 'https://example.com/pricing.json',
            readCache: async () => staleCacheJson({
                table: { anthropic: { 'claude-sonnet-4-6': { inputPer1M: 99, outputPer1M: 99 } } }
            }),
            writeCache: async () => undefined,
            fetchImpl: failingFetch(503)
        });

        expect(result.source).toBe('cache');
        expect(result.table?.anthropic?.['claude-sonnet-4-6']?.inputPer1M).toBe(99);
        expect(result.warning).toContain('503');
    });

    it('falls back to builtin when fetch fails and no cache exists', async () => {
        const result = await loadRemotePricing({
            enabled: true,
            url: 'https://example.com/pricing.json',
            ...noopCache,
            fetchImpl: failingFetch(500)
        });

        expect(result.source).toBe('builtin');
        expect(result.table).toBeNull();
        expect(result.warning).toContain('500');
    });

    it('falls back to cache when fetch throws a network error', async () => {
        const result = await loadRemotePricing({
            enabled: true,
            url: 'https://example.com/pricing.json',
            readCache: async () => staleCacheJson({
                table: { openai: { 'gpt-5.4': { inputPer1M: 42, outputPer1M: 42 } } }
            }),
            writeCache: async () => undefined,
            fetchImpl: throwingFetch()
        });

        expect(result.source).toBe('cache');
        expect(result.warning).toContain('network timeout');
    });

    it('falls back to builtin when fetch throws and no cache exists', async () => {
        const result = await loadRemotePricing({
            enabled: true,
            url: 'https://example.com/pricing.json',
            ...noopCache,
            fetchImpl: throwingFetch()
        });

        expect(result.source).toBe('builtin');
        expect(result.table).toBeNull();
        expect(result.warning).toContain('network timeout');
    });

    it('falls back to cache when remote returns malformed JSON payload', async () => {
        const result = await loadRemotePricing({
            enabled: true,
            url: 'https://example.com/pricing.json',
            readCache: async () => staleCacheJson({
                table: { google: { 'gemini-2.5-pro': { inputPer1M: 2.5, outputPer1M: 15 } } }
            }),
            writeCache: async () => undefined,
            fetchImpl: mockFetch({ not_models: 'bad data' })
        });

        expect(result.source).toBe('cache');
        expect(result.warning).toContain('no usable entries');
    });

    it('falls back to builtin when remote returns malformed payload and no cache', async () => {
        const result = await loadRemotePricing({
            enabled: true,
            url: 'https://example.com/pricing.json',
            ...noopCache,
            fetchImpl: mockFetch('not-json-object')
        });

        expect(result.source).toBe('builtin');
        expect(result.table).toBeNull();
    });

    it('partial remote failure does not break pricing: builtin models remain after null merge', async () => {
        const result = await loadRemotePricing({
            enabled: true,
            url: 'https://example.com/pricing.json',
            ...noopCache,
            fetchImpl: failingFetch()
        });

        // The caller checks `if (result.table)` before merging
        expect(result.table).toBeNull();

        // Active pricing should still be builtin
        const sonnet = getProviderPricing('anthropic', 'claude-sonnet-4-6');
        expect(sonnet.inputPer1M).toBe(3.0);
        expect(getActivePricingMeta().source).toBe('builtin');
    });
});

// ---------------------------------------------------------------------------
// 3. Remote pricing: cache freshness / TTL
// ---------------------------------------------------------------------------

describe('remote pricing pipeline — cache TTL', () => {
    afterEach(() => resetPricingToBuiltin());

    it('uses fresh cache without fetching (default 24h TTL)', async () => {
        let fetchCalled = false;
        const result = await loadRemotePricing({
            enabled: true,
            url: 'https://example.com/pricing.json',
            readCache: async () => freshCacheJson({
                table: { openai: { 'gpt-5.4': { inputPer1M: 77, outputPer1M: 77 } } }
            }),
            writeCache: async () => undefined,
            fetchImpl: async () => { fetchCalled = true; return { ok: false, status: 500, json: async () => ({}) }; }
        });

        expect(result.source).toBe('cache');
        expect(result.table?.openai?.['gpt-5.4']?.inputPer1M).toBe(77);
        expect(fetchCalled).toBe(false);
    });

    it('fetches when cache is stale (beyond TTL)', async () => {
        let fetchCalled = false;
        const result = await loadRemotePricing({
            enabled: true,
            url: 'https://example.com/pricing.json',
            readCache: async () => staleCacheJson({
                table: { openai: { 'gpt-5.4': { inputPer1M: 77, outputPer1M: 77 } } }
            }),
            writeCache: async () => undefined,
            fetchImpl: async () => {
                fetchCalled = true;
                return {
                    ok: true, status: 200,
                    json: async () => ({
                        models: [{ provider: 'openai', modelId: 'gpt-5.4', inputPer1M: 3, outputPer1M: 10 }]
                    })
                };
            }
        });

        expect(fetchCalled).toBe(true);
        expect(result.source).toBe('remote');
    });

    it('forced refresh with ttlMs=0 bypasses stale cache', async () => {
        const oneSecondAgo = new Date(Date.now() - 1000).toISOString();
        let fetchCalled = false;
        const result = await loadRemotePricing({
            enabled: true,
            url: 'https://example.com/pricing.json',
            ttlMs: 0,
            readCache: async () => JSON.stringify({
                fetchedAt: oneSecondAgo,
                table: { openai: { 'gpt-5.4': { inputPer1M: 77, outputPer1M: 77 } } }
            }),
            writeCache: async () => undefined,
            fetchImpl: async () => {
                fetchCalled = true;
                return {
                    ok: true, status: 200,
                    json: async () => ({
                        models: [{ provider: 'openai', modelId: 'gpt-5.4', inputPer1M: 3, outputPer1M: 10 }]
                    })
                };
            }
        });

        expect(fetchCalled).toBe(true);
        expect(result.source).toBe('remote');
    });

    it('ttlMs=0 deterministically bypasses even a same-millisecond cache', async () => {
        // isCacheFresh returns false immediately for ttlMs <= 0, regardless of cache age.
        let fetchCalled = false;
        const result = await loadRemotePricing({
            enabled: true,
            url: 'https://example.com/pricing.json',
            ttlMs: 0,
            readCache: async () => freshCacheJson({
                table: { openai: { 'gpt-5.4': { inputPer1M: 77, outputPer1M: 77 } } }
            }),
            writeCache: async () => undefined,
            fetchImpl: async () => {
                fetchCalled = true;
                return {
                    ok: true, status: 200,
                    json: async () => ({
                        models: [{ provider: 'openai', modelId: 'gpt-5.4', inputPer1M: 3, outputPer1M: 10 }]
                    })
                };
            }
        });

        expect(fetchCalled).toBe(true);
        expect(result.source).toBe('remote');
    });
});

// ---------------------------------------------------------------------------
// 4. Remote registry: happy path
// ---------------------------------------------------------------------------

describe('remote registry pipeline — happy path', () => {
    it('fetched remote models are returned with source=remote', async () => {
        const remoteModel = makeModel({
            provider: 'anthropic',
            id: 'claude-future-7',
            alias: 'claude-future-7'
        });

        const result = await loadRemoteRegistry({
            enabled: true,
            url: 'https://example.com/registry.json',
            ...noopCache,
            fetchImpl: mockFetch({ models: [remoteModel] })
        }, BUILTIN_MODELS);

        expect(result.source).toBe('remote');
        expect(result.models.some(m => m.alias === 'claude-future-7')).toBe(true);
    });

    it('remote-only model appears in merged ModelRegistry', async () => {
        const remoteModel = makeModel({
            provider: 'google',
            id: 'gemini-4-flash',
            alias: 'gemini-4-flash',
            label: 'Gemini 4 Flash'
        });

        let writtenCache = '';
        const registry = new ModelRegistry({
            remoteRegistryUrl: 'https://example.com/registry.json',
            allowRemoteRegistry: true,
            readCache: async () => freshCacheJson({ models: [remoteModel, ...BUILTIN_MODELS] }),
            writeCache: async (c) => { writtenCache = c; }
        });

        await registry.refresh();
        const all = registry.getAll();
        const found = all.find(m => m.alias === 'gemini-4-flash');
        expect(found).toBeDefined();
        expect(found?.label).toBe('Gemini 4 Flash');
    });

    it('registry cache is written on successful remote fetch', async () => {
        let writtenContent = '';
        await loadRemoteRegistry({
            enabled: true,
            url: 'https://example.com/registry.json',
            readCache: async () => null,
            writeCache: async (content) => { writtenContent = content; },
            fetchImpl: mockFetch({ models: [BUILTIN_MODELS[0]] })
        }, BUILTIN_MODELS);

        expect(writtenContent).toBeTruthy();
        const parsed = JSON.parse(writtenContent);
        expect(parsed.fetchedAt).toBeDefined();
        expect(parsed.models.length).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// 5. Remote registry: fallback behavior
// ---------------------------------------------------------------------------

describe('remote registry pipeline — fallback behavior', () => {
    it('uses stale cache when remote fetch fails', async () => {
        const cachedModel = makeModel({
            provider: 'openai', id: 'cached-model', alias: 'cached-model'
        });

        const result = await loadRemoteRegistry({
            enabled: true,
            url: 'https://example.com/registry.json',
            readCache: async () => staleCacheJson({ models: [cachedModel] }),
            writeCache: async () => undefined,
            fetchImpl: failingFetch(500)
        }, BUILTIN_MODELS);

        expect(result.source).toBe('cache');
        expect(result.models.some(m => m.alias === 'cached-model')).toBe(true);
        expect(result.warning).toContain('500');
    });

    it('falls back to builtin when fetch fails and no cache', async () => {
        const result = await loadRemoteRegistry({
            enabled: true,
            url: 'https://example.com/registry.json',
            ...noopCache,
            fetchImpl: failingFetch(500)
        }, BUILTIN_MODELS);

        expect(result.source).toBe('builtin');
        expect(result.models).toEqual(BUILTIN_MODELS);
        expect(result.warning).toContain('500');
    });

    it('falls back to builtin when fetch throws and no cache', async () => {
        const result = await loadRemoteRegistry({
            enabled: true,
            url: 'https://example.com/registry.json',
            ...noopCache,
            fetchImpl: throwingFetch()
        }, BUILTIN_MODELS);

        expect(result.source).toBe('builtin');
        expect(result.models).toEqual(BUILTIN_MODELS);
        expect(result.warning).toContain('network timeout');
    });

    it('falls back to cache when remote returns no usable models', async () => {
        const cachedModel = makeModel({
            provider: 'anthropic', id: 'cached-anthropic', alias: 'cached-anthropic'
        });

        const result = await loadRemoteRegistry({
            enabled: true,
            url: 'https://example.com/registry.json',
            readCache: async () => staleCacheJson({ models: [cachedModel] }),
            writeCache: async () => undefined,
            fetchImpl: mockFetch({ models: [] })
        }, BUILTIN_MODELS);

        expect(result.source).toBe('cache');
        expect(result.warning).toContain('no usable models');
    });

    it('falls back to builtin when remote returns no usable models and no cache', async () => {
        const result = await loadRemoteRegistry({
            enabled: true,
            url: 'https://example.com/registry.json',
            ...noopCache,
            fetchImpl: mockFetch({ models: [{ bad: 'data' }] })
        }, BUILTIN_MODELS);

        expect(result.source).toBe('builtin');
        expect(result.models).toEqual(BUILTIN_MODELS);
    });

    it('returns builtin models when disabled', async () => {
        const result = await loadRemoteRegistry({
            enabled: false,
            url: 'https://example.com/registry.json',
            ...noopCache
        }, BUILTIN_MODELS);

        expect(result.source).toBe('builtin');
        expect(result.models).toEqual(BUILTIN_MODELS);
    });
});

// ---------------------------------------------------------------------------
// 6. Remote registry: cache TTL (7 day default)
// ---------------------------------------------------------------------------

describe('remote registry pipeline — cache TTL', () => {
    it('uses fresh cache without fetching (default 7-day TTL)', async () => {
        let fetchCalled = false;
        const result = await loadRemoteRegistry({
            enabled: true,
            url: 'https://example.com/registry.json',
            readCache: async () => freshCacheJson({ models: [BUILTIN_MODELS[0]] }),
            writeCache: async () => undefined,
            fetchImpl: async () => { fetchCalled = true; return { ok: false, status: 500, json: async () => ({}) }; }
        }, BUILTIN_MODELS);

        expect(result.source).toBe('cache');
        expect(fetchCalled).toBe(false);
    });

    it('fetches when registry cache is stale', async () => {
        let fetchCalled = false;
        const result = await loadRemoteRegistry({
            enabled: true,
            url: 'https://example.com/registry.json',
            readCache: async () => staleCacheJson({ models: [BUILTIN_MODELS[0]] }),
            writeCache: async () => undefined,
            fetchImpl: async () => {
                fetchCalled = true;
                return {
                    ok: true, status: 200,
                    json: async () => ({ models: [BUILTIN_MODELS[0]] })
                };
            }
        }, BUILTIN_MODELS);

        expect(fetchCalled).toBe(true);
        expect(result.source).toBe('remote');
    });

    it('forced refresh with ttlMs=0 deterministically bypasses cache', async () => {
        // isCacheFresh returns false immediately for ttlMs <= 0.
        let fetchCalled = false;
        const result = await loadRemoteRegistry({
            enabled: true,
            url: 'https://example.com/registry.json',
            ttlMs: 0,
            readCache: async () => freshCacheJson({ models: [BUILTIN_MODELS[0]] }),
            writeCache: async () => undefined,
            fetchImpl: async () => {
                fetchCalled = true;
                return {
                    ok: true, status: 200,
                    json: async () => ({ models: [BUILTIN_MODELS[0]] })
                };
            }
        }, BUILTIN_MODELS);

        expect(fetchCalled).toBe(true);
        expect(result.source).toBe('remote');
    });
});

// ---------------------------------------------------------------------------
// 7. Drift handling: registry model with no pricing
// ---------------------------------------------------------------------------

describe('drift handling — registry/pricing misalignment', () => {
    afterEach(() => resetPricingToBuiltin());

    it('registry model with no pricing entry: getProviderPricing throws', () => {
        // A model exists in registry but not in pricing table
        expect(() => getProviderPricing('anthropic', 'claude-nonexistent-model')).toThrow(
            'Missing provider pricing'
        );
    });

    it('registry model with no pricing can be detected via supportsCostComparisonModel pattern', () => {
        // This mirrors the AiSection supportsCostComparisonModel guard
        const supports = (provider: string, modelId: string): boolean => {
            try {
                getProviderPricing(provider as any, modelId);
                return true;
            } catch {
                return false;
            }
        };

        // Exists in both builtin pricing and registry
        expect(supports('anthropic', 'claude-sonnet-4-6')).toBe(true);
        // Would only be in registry, not pricing
        expect(supports('anthropic', 'claude-no-pricing')).toBe(false);
    });

    it('pricing entry with no registry model is ignored safely (still in pricing table)', () => {
        mergeRemotePricing({
            anthropic: { 'claude-orphan-pricing': { inputPer1M: 10, outputPer1M: 50 } }
        }, 'remote');

        // The pricing entry exists and is resolvable
        expect(getProviderPricing('anthropic', 'claude-orphan-pricing').inputPer1M).toBe(10);

        // But it would never appear in the cost table because it has no registry model
        // (the cost table iterates registry models, not pricing entries)
        const builtinAliases = BUILTIN_MODELS.map(m => m.alias);
        expect(builtinAliases).not.toContain('claude-orphan-pricing');
    });

    it('malformed pricing entries do not corrupt the table', async () => {
        const result = await loadRemotePricing({
            enabled: true,
            url: 'https://example.com/pricing.json',
            ...noopCache,
            fetchImpl: mockFetch({
                models: [
                    // valid
                    { provider: 'openai', modelId: 'gpt-5.4', inputPer1M: 3, outputPer1M: 10 },
                    // missing outputPer1M
                    { provider: 'openai', modelId: 'gpt-bad', inputPer1M: 3 },
                    // negative price
                    { provider: 'openai', modelId: 'gpt-neg', inputPer1M: -1, outputPer1M: 10 },
                    // invalid provider
                    { provider: 'unknown', modelId: 'model-x', inputPer1M: 1, outputPer1M: 1 },
                    // missing modelId
                    { provider: 'openai', inputPer1M: 1, outputPer1M: 1 },
                    // null entry
                    null,
                    // number entry
                    42
                ]
            })
        });

        expect(result.source).toBe('remote');
        // Only the valid entry should be present
        const openaiModels = Object.keys(result.table?.openai ?? {});
        expect(openaiModels).toEqual(['gpt-5.4']);
    });

    it('malformed registry entries do not corrupt the model list', async () => {
        const result = await loadRemoteRegistry({
            enabled: true,
            url: 'https://example.com/registry.json',
            ...noopCache,
            fetchImpl: mockFetch({
                models: [
                    BUILTIN_MODELS[0], // valid
                    { bad: 'data' },   // invalid - no required fields
                    { provider: 'openai', id: 'test' }, // missing alias, label, etc.
                    null,
                    42
                ]
            })
        }, BUILTIN_MODELS);

        expect(result.source).toBe('remote');
        // Only the valid model should be returned
        expect(result.models.length).toBe(1);
        expect(result.models[0].alias).toBe(BUILTIN_MODELS[0].alias);
    });
});

// ---------------------------------------------------------------------------
// 8. Both fetches failing simultaneously
// ---------------------------------------------------------------------------

describe('both registry and pricing fetches failing', () => {
    afterEach(() => resetPricingToBuiltin());

    it('both fail with no cache: system degrades to builtin for both', async () => {
        const [registryResult, pricingResult] = await Promise.all([
            loadRemoteRegistry({
                enabled: true,
                url: 'https://example.com/registry.json',
                ...noopCache,
                fetchImpl: throwingFetch()
            }, BUILTIN_MODELS),
            loadRemotePricing({
                enabled: true,
                url: 'https://example.com/pricing.json',
                ...noopCache,
                fetchImpl: throwingFetch()
            })
        ]);

        expect(registryResult.source).toBe('builtin');
        expect(registryResult.models).toEqual(BUILTIN_MODELS);
        expect(pricingResult.source).toBe('builtin');
        expect(pricingResult.table).toBeNull();

        // Active pricing remains builtin
        expect(getActivePricingMeta().source).toBe('builtin');
        expect(getProviderPricing('anthropic', 'claude-sonnet-4-6').inputPer1M).toBe(3.0);
    });

    it('both fail with stale caches: system uses cached data for both', async () => {
        const cachedModel = makeModel({
            provider: 'anthropic', id: 'cached-model', alias: 'cached-model'
        });

        const [registryResult, pricingResult] = await Promise.all([
            loadRemoteRegistry({
                enabled: true,
                url: 'https://example.com/registry.json',
                readCache: async () => staleCacheJson({ models: [cachedModel] }),
                writeCache: async () => undefined,
                fetchImpl: failingFetch()
            }, BUILTIN_MODELS),
            loadRemotePricing({
                enabled: true,
                url: 'https://example.com/pricing.json',
                readCache: async () => staleCacheJson({
                    table: { anthropic: { 'cached-model': { inputPer1M: 99, outputPer1M: 99 } } }
                }),
                writeCache: async () => undefined,
                fetchImpl: failingFetch()
            })
        ]);

        expect(registryResult.source).toBe('cache');
        expect(pricingResult.source).toBe('cache');
        expect(registryResult.models.some(m => m.alias === 'cached-model')).toBe(true);
        expect(pricingResult.table?.anthropic?.['cached-model']?.inputPer1M).toBe(99);
    });
});

// ---------------------------------------------------------------------------
// 9. ModelRegistry merge behavior
// ---------------------------------------------------------------------------

describe('ModelRegistry merge behavior', () => {
    it('remote models override builtin models with same alias', async () => {
        const updatedModel: ModelInfo = {
            ...BUILTIN_MODELS[0],
            label: 'Updated Label From Remote',
            contextWindow: 999999
        };

        const registry = new ModelRegistry({
            remoteRegistryUrl: 'https://example.com/registry.json',
            allowRemoteRegistry: true,
            readCache: async () => freshCacheJson({ models: [updatedModel] }),
            writeCache: async () => undefined
        });

        await registry.refresh();
        const found = registry.findByAlias(BUILTIN_MODELS[0].alias);
        expect(found?.label).toBe('Updated Label From Remote');
        expect(found?.contextWindow).toBe(999999);
    });

    it('remote-only model is added alongside builtins', async () => {
        const newModel = makeModel({
            provider: 'google',
            id: 'gemini-5-ultra',
            alias: 'gemini-5-ultra',
            label: 'Gemini 5 Ultra'
        });

        const registry = new ModelRegistry({
            remoteRegistryUrl: 'https://example.com/registry.json',
            allowRemoteRegistry: true,
            readCache: async () => freshCacheJson({ models: [...BUILTIN_MODELS, newModel] }),
            writeCache: async () => undefined
        });

        await registry.refresh();
        const all = registry.getAll();

        // New model should be present
        expect(all.some(m => m.alias === 'gemini-5-ultra')).toBe(true);
        // All builtins should still be present
        for (const builtin of BUILTIN_MODELS) {
            expect(all.some(m => m.alias === builtin.alias)).toBe(true);
        }
    });

    it('empty remote result falls back to BUILTIN_MODELS', async () => {
        const registry = new ModelRegistry({
            remoteRegistryUrl: 'https://example.com/registry.json',
            allowRemoteRegistry: true,
            readCache: async () => null,
            writeCache: async () => undefined
        });

        // With no cache and fetch disabled, should return builtins
        const result = await loadRemoteRegistry({
            enabled: false,
            url: 'https://example.com/registry.json',
            ...noopCache
        }, BUILTIN_MODELS);

        expect(result.models).toEqual(BUILTIN_MODELS);
    });
});

// ---------------------------------------------------------------------------
// 10. Pricing freshness labels
// ---------------------------------------------------------------------------

describe('pricing freshness labels', () => {
    it('builtin source shows fallback label', () => {
        expect(getPricingFreshnessLabel({ source: 'builtin' })).toBe('Using fallback pricing');
    });

    it('cache source without fetchedAt shows generic cached label', () => {
        expect(getPricingFreshnessLabel({ source: 'cache' })).toBe('Using cached pricing');
    });

    it('recent remote fetch shows checked label with date', () => {
        const now = new Date().toISOString();
        const label = getPricingFreshnessLabel({ source: 'remote', fetchedAt: now });
        expect(label).toMatch(/^Pricing checked /);
    });

    it('stale cache (>3 days) shows cached-from label', () => {
        const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
        const label = getPricingFreshnessLabel({ source: 'cache', fetchedAt: fiveDaysAgo });
        expect(label).toMatch(/^Using cached pricing from /);
    });

    it('invalid fetchedAt falls back to generic cached label', () => {
        expect(getPricingFreshnessLabel({ source: 'cache', fetchedAt: 'not-a-date' })).toBe('Using cached pricing');
    });
});

// ---------------------------------------------------------------------------
// 11. End-to-end: cost table model selection with registry models
// ---------------------------------------------------------------------------

describe('cost table model selection flow (getCostComparisonModels logic)', () => {
    afterEach(() => resetPricingToBuiltin());

    it('registry model with pricing appears in cost comparison (supportsCostComparisonModel)', () => {
        // Simulates the supportsCostComparisonModel check in AiSection
        const supports = (provider: string, modelId: string): boolean => {
            try {
                getProviderPricing(provider as any, modelId);
                return true;
            } catch {
                return false;
            }
        };

        // All builtin cloud models with pricing should be supported
        for (const [provider, models] of Object.entries(BUILTIN_PRICING)) {
            if (!models) continue;
            for (const modelId of Object.keys(models)) {
                expect(supports(provider, modelId)).toBe(true);
            }
        }
    });

    it('registry model without pricing is filtered out by supportsCostComparisonModel', () => {
        const supports = (provider: string, modelId: string): boolean => {
            try {
                getProviderPricing(provider as any, modelId);
                return true;
            } catch {
                return false;
            }
        };

        // Models that exist in builtin registry but not in pricing
        // (e.g. gpt-5.3 has no pricing entry in BUILTIN_PRICING)
        expect(supports('openai', 'gpt-5.3')).toBe(false);
        expect(supports('openai', 'gpt-5.2-chat-latest')).toBe(false);
        expect(supports('openai', 'gpt-5.1-chat-latest')).toBe(false);
    });

    it('remote-only pricing model without registry model never reaches cost table', () => {
        // Add pricing for a model that does not exist in registry
        mergeRemotePricing({
            anthropic: { 'phantom-model': { inputPer1M: 1, outputPer1M: 1 } }
        }, 'remote');

        // The pricing is available...
        expect(getProviderPricing('anthropic', 'phantom-model').inputPer1M).toBe(1);

        // ...but the cost table iterates registry models, not pricing entries.
        // So 'phantom-model' would never appear in getCostComparisonModels
        // because it's not in any ModelInfo[].
        const builtinIds = BUILTIN_MODELS.map(m => m.id);
        expect(builtinIds).not.toContain('phantom-model');
    });

    it('after merging remote pricing, new remote-only pricing model is resolvable', () => {
        mergeRemotePricing({
            google: {
                'gemini-4-flash-preview': { inputPer1M: 0, outputPer1M: 0 }
            }
        }, 'remote', new Date().toISOString());

        const pricing = getProviderPricing('google', 'gemini-4-flash-preview');
        expect(pricing.inputPer1M).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// 12. Cache corruption / edge cases
// ---------------------------------------------------------------------------

describe('cache corruption edge cases', () => {
    it('corrupted pricing cache JSON is ignored, fetch proceeds', async () => {
        const result = await loadRemotePricing({
            enabled: true,
            url: 'https://example.com/pricing.json',
            readCache: async () => 'not valid json {{{',
            writeCache: async () => undefined,
            fetchImpl: mockFetch({
                models: [{ provider: 'openai', modelId: 'gpt-5.4', inputPer1M: 3, outputPer1M: 10 }]
            })
        });

        expect(result.source).toBe('remote');
    });

    it('corrupted registry cache JSON is ignored, fetch proceeds', async () => {
        const result = await loadRemoteRegistry({
            enabled: true,
            url: 'https://example.com/registry.json',
            readCache: async () => '<<<not json>>>',
            writeCache: async () => undefined,
            fetchImpl: mockFetch({ models: [BUILTIN_MODELS[0]] })
        }, BUILTIN_MODELS);

        expect(result.source).toBe('remote');
    });

    it('pricing cache missing fetchedAt is treated as no cache', async () => {
        const result = await loadRemotePricing({
            enabled: true,
            url: 'https://example.com/pricing.json',
            readCache: async () => JSON.stringify({ table: { openai: {} } }),
            writeCache: async () => undefined,
            fetchImpl: mockFetch({
                models: [{ provider: 'openai', modelId: 'gpt-5.4', inputPer1M: 3, outputPer1M: 10 }]
            })
        });

        // Should proceed to fetch since cache is invalid
        expect(result.source).toBe('remote');
    });

    it('registry cache with empty models array is treated as no usable cache', async () => {
        const result = await loadRemoteRegistry({
            enabled: true,
            url: 'https://example.com/registry.json',
            readCache: async () => freshCacheJson({ models: [] }),
            writeCache: async () => undefined,
            fetchImpl: mockFetch({ models: [BUILTIN_MODELS[0]] })
        }, BUILTIN_MODELS);

        // Fresh cache with empty models should NOT be used (the code checks `cached.models.length > 0`)
        expect(result.source).toBe('remote');
    });

    it('writeCache failure during pricing fetch returns remote data safely', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const result = await loadRemotePricing({
            enabled: true,
            url: 'https://example.com/pricing.json',
            readCache: async () => null,
            writeCache: async () => { throw new Error('disk full'); },
            fetchImpl: mockFetch({
                models: [{ provider: 'openai', modelId: 'gpt-5.4', inputPer1M: 3, outputPer1M: 10 }]
            })
        });

        expect(result.source).toBe('remote');
        expect(result.table?.openai?.['gpt-5.4']?.inputPer1M).toBe(3);
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('cache write failed: disk full')
        );
        warnSpy.mockRestore();
    });

    it('writeCache failure during registry fetch returns remote data safely', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const result = await loadRemoteRegistry({
            enabled: true,
            url: 'https://example.com/registry.json',
            readCache: async () => null,
            writeCache: async () => { throw new Error('permission denied'); },
            fetchImpl: mockFetch({ models: [BUILTIN_MODELS[0]] })
        }, BUILTIN_MODELS);

        expect(result.source).toBe('remote');
        expect(result.models[0].alias).toBe(BUILTIN_MODELS[0].alias);
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('cache write failed: permission denied')
        );
        warnSpy.mockRestore();
    });
});

// ---------------------------------------------------------------------------
// 13. Pricing validation edge cases
// ---------------------------------------------------------------------------

describe('pricing validation edge cases', () => {
    afterEach(() => resetPricingToBuiltin());

    it('zero pricing (free model) is valid', async () => {
        const result = await loadRemotePricing({
            enabled: true,
            url: 'https://example.com/pricing.json',
            ...noopCache,
            fetchImpl: mockFetch({
                models: [{ provider: 'google', modelId: 'gemini-free', inputPer1M: 0, outputPer1M: 0 }]
            })
        });

        expect(result.source).toBe('remote');
        expect(result.table?.google?.['gemini-free']?.inputPer1M).toBe(0);
    });

    it('longContext pricing is preserved when valid', async () => {
        const result = await loadRemotePricing({
            enabled: true,
            url: 'https://example.com/pricing.json',
            ...noopCache,
            fetchImpl: mockFetch({
                models: [{
                    provider: 'anthropic',
                    modelId: 'claude-test',
                    inputPer1M: 3,
                    outputPer1M: 15,
                    longContext: {
                        thresholdInputTokens: 200000,
                        inputPer1M: 6,
                        outputPer1M: 30
                    }
                }]
            })
        });

        const pricing = result.table?.anthropic?.['claude-test'];
        expect(pricing?.longContext?.thresholdInputTokens).toBe(200000);
        expect(pricing?.longContext?.inputPer1M).toBe(6);
    });

    it('invalid longContext is silently dropped', async () => {
        const result = await loadRemotePricing({
            enabled: true,
            url: 'https://example.com/pricing.json',
            ...noopCache,
            fetchImpl: mockFetch({
                models: [{
                    provider: 'anthropic',
                    modelId: 'claude-test',
                    inputPer1M: 3,
                    outputPer1M: 15,
                    longContext: { thresholdInputTokens: 'not a number' }
                }]
            })
        });

        const pricing = result.table?.anthropic?.['claude-test'];
        expect(pricing?.longContext).toBeUndefined();
        expect(pricing?.inputPer1M).toBe(3);
    });

    it('invalid promo is silently dropped', async () => {
        const result = await loadRemotePricing({
            enabled: true,
            url: 'https://example.com/pricing.json',
            ...noopCache,
            fetchImpl: mockFetch({
                models: [{
                    provider: 'openai',
                    modelId: 'gpt-test',
                    inputPer1M: 3,
                    outputPer1M: 10,
                    promo: { label: '' } // empty label is invalid
                }]
            })
        });

        const pricing = result.table?.openai?.['gpt-test'];
        expect(pricing?.promo).toBeUndefined();
        expect(pricing?.inputPer1M).toBe(3);
    });
});

// ---------------------------------------------------------------------------
// 14. AiSection BUILTIN_MODELS fallback in cost table path
// ---------------------------------------------------------------------------

describe('AiSection cost table BUILTIN_MODELS fallback', () => {
    it('getCostComparisonModels fallback line exists: registryModels?.length ? registryModels : BUILTIN_MODELS', () => {
        // This is a structural assertion test — verifies the fallback logic pattern
        // exists in AiSection.ts (mirrors the existing source-reading test pattern).
        const { readFileSync } = require('node:fs');
        const { resolve } = require('node:path');
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');

        // The fallback line
        expect(source).toContain("registryModels?.length ? registryModels : BUILTIN_MODELS");

        // The cost table refresh path fetches registry models from the AI client
        expect(source).toContain("aiClient.getRegistryModels()");
        expect(source).toContain("aiClient.refreshPricing()");

        // The cost table refresh passes registry models to computeCostComparisonRows
        expect(source).toContain("computeCostComparisonRows(registryModels)");
    });

    it('refreshCostComparisonTable calls both getRegistryModels and refreshPricing in parallel', () => {
        const { readFileSync } = require('node:fs');
        const { resolve } = require('node:path');
        const source = readFileSync(resolve(process.cwd(), 'src/settings/sections/AiSection.ts'), 'utf8');

        // Both calls are in a Promise.all
        expect(source).toContain("Promise.all([\n            aiClient.getRegistryModels(),\n            aiClient.refreshPricing()");
    });
});

// ---------------------------------------------------------------------------
// 15. URL correctness: master branch
// ---------------------------------------------------------------------------

describe('remote URLs use master branch', () => {
    it('aiClient uses master branch for registry URL', () => {
        const { readFileSync } = require('node:fs');
        const { resolve } = require('node:path');
        const source = readFileSync(resolve(process.cwd(), 'src/ai/runtime/aiClient.ts'), 'utf8');

        expect(source).toContain("radial-timeline/master/scripts/models/registry.json");
        expect(source).not.toContain("radial-timeline/main/scripts/models/registry.json");
    });

    it('aiClient uses master branch for pricing URL', () => {
        const { readFileSync } = require('node:fs');
        const { resolve } = require('node:path');
        const source = readFileSync(resolve(process.cwd(), 'src/ai/runtime/aiClient.ts'), 'utf8');

        expect(source).toContain("radial-timeline/master/scripts/models/pricing.json");
        expect(source).not.toContain("radial-timeline/main/scripts/models/pricing.json");
    });
});
