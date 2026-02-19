import { describe, expect, it } from 'vitest';
import { loadRemoteRegistry } from './remoteRegistry';
import { BUILTIN_MODELS } from './builtinModels';

describe('loadRemoteRegistry', () => {
    it('uses fresh cache when available', async () => {
        const cache = JSON.stringify({
            fetchedAt: new Date().toISOString(),
            models: [BUILTIN_MODELS[0]]
        });

        const result = await loadRemoteRegistry({
            enabled: true,
            url: 'https://example.com/registry.json',
            readCache: async () => cache,
            writeCache: async () => undefined,
            fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) })
        }, BUILTIN_MODELS);

        expect(result.source).toBe('cache');
        expect(result.models.length).toBe(1);
    });

    it('falls back to cache when remote fetch fails', async () => {
        const stale = JSON.stringify({
            fetchedAt: '2000-01-01T00:00:00.000Z',
            models: [BUILTIN_MODELS[1]]
        });

        const result = await loadRemoteRegistry({
            enabled: true,
            url: 'https://example.com/registry.json',
            readCache: async () => stale,
            writeCache: async () => undefined,
            fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) })
        }, BUILTIN_MODELS);

        expect(result.source).toBe('cache');
        expect(result.warning).toContain('using cached models');
    });

    it('stores and returns remote models when fetch succeeds', async () => {
        let written = '';
        const result = await loadRemoteRegistry({
            enabled: true,
            url: 'https://example.com/registry.json',
            readCache: async () => null,
            writeCache: async (content) => {
                written = content;
            },
            fetchImpl: async () => ({
                ok: true,
                status: 200,
                json: async () => ({ models: [BUILTIN_MODELS[2]] })
            })
        }, BUILTIN_MODELS);

        expect(result.source).toBe('remote');
        expect(result.models[0].alias).toBe(BUILTIN_MODELS[2].alias);
        expect(written.length).toBeGreaterThan(0);
    });
});
