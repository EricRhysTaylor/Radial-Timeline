import type { ModelInfo } from '../types';

export interface RemoteRegistryCache {
    fetchedAt: string;
    models: ModelInfo[];
}

export interface RemoteRegistryOptions {
    enabled: boolean;
    url: string;
    ttlMs?: number;
    fetchImpl?: (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
    readCache: () => Promise<string | null>;
    writeCache: (content: string) => Promise<void>;
}

export interface RemoteRegistryLoadResult {
    source: 'remote' | 'cache' | 'builtin';
    models: ModelInfo[];
    fetchedAt?: string;
    warning?: string;
}

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function isModelInfo(value: unknown): value is ModelInfo {
    if (!value || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    return typeof v.provider === 'string'
        && typeof v.id === 'string'
        && typeof v.alias === 'string'
        && typeof v.label === 'string'
        && Array.isArray(v.capabilities)
        && typeof v.tier === 'string';
}

function parseCache(raw: string | null): RemoteRegistryCache | null {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw) as RemoteRegistryCache;
        if (!parsed || typeof parsed !== 'object') return null;
        if (typeof parsed.fetchedAt !== 'string') return null;
        if (!Array.isArray(parsed.models)) return null;
        const models = parsed.models.filter(isModelInfo);
        return {
            fetchedAt: parsed.fetchedAt,
            models
        };
    } catch {
        return null;
    }
}

function isCacheFresh(cache: RemoteRegistryCache, ttlMs: number): boolean {
    const ts = Date.parse(cache.fetchedAt);
    if (!Number.isFinite(ts)) return false;
    return (Date.now() - ts) <= ttlMs;
}

async function defaultFetch(url: string): Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }> {
    const response = await fetch(url);
    return {
        ok: response.ok,
        status: response.status,
        json: async () => response.json()
    };
}

function parseRemotePayload(payload: unknown): ModelInfo[] {
    if (!payload || typeof payload !== 'object') return [];
    const record = payload as Record<string, unknown>;
    const rawModels = Array.isArray(record.models) ? record.models : [];
    return rawModels.filter(isModelInfo);
}

export async function loadRemoteRegistry(
    options: RemoteRegistryOptions,
    builtinModels: ModelInfo[]
): Promise<RemoteRegistryLoadResult> {
    if (!options.enabled) {
        return { source: 'builtin', models: builtinModels };
    }

    const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    const fetchImpl = options.fetchImpl ?? defaultFetch;
    const cached = parseCache(await options.readCache());

    if (cached && isCacheFresh(cached, ttlMs) && cached.models.length > 0) {
        return { source: 'cache', models: cached.models, fetchedAt: cached.fetchedAt };
    }

    try {
        const response = await fetchImpl(options.url);
        if (!response.ok) {
            if (cached && cached.models.length > 0) {
                return {
                    source: 'cache',
                    models: cached.models,
                    fetchedAt: cached.fetchedAt,
                    warning: `Remote registry fetch failed (${response.status}); using cached models.`
                };
            }
            return {
                source: 'builtin',
                models: builtinModels,
                warning: `Remote registry fetch failed (${response.status}); using built-in models.`
            };
        }

        const payload = await response.json();
        const models = parseRemotePayload(payload);
        if (!models.length) {
            if (cached && cached.models.length > 0) {
                return {
                    source: 'cache',
                    models: cached.models,
                    fetchedAt: cached.fetchedAt,
                    warning: 'Remote registry returned no usable models; using cached models.'
                };
            }
            return {
                source: 'builtin',
                models: builtinModels,
                warning: 'Remote registry returned no usable models; using built-in models.'
            };
        }

        const nextCache: RemoteRegistryCache = {
            fetchedAt: new Date().toISOString(),
            models
        };
        await options.writeCache(JSON.stringify(nextCache));
        return { source: 'remote', models, fetchedAt: nextCache.fetchedAt };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (cached && cached.models.length > 0) {
            return {
                source: 'cache',
                models: cached.models,
                fetchedAt: cached.fetchedAt,
                warning: `Remote registry unavailable (${message}); using cached models.`
            };
        }
        return {
            source: 'builtin',
            models: builtinModels,
            warning: `Remote registry unavailable (${message}); using built-in models.`
        };
    }
}
