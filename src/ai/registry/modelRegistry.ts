import { BUILTIN_MODELS } from './builtinModels';
import { loadRemoteRegistry, type RemoteRegistryLoadResult } from './remoteRegistry';
import type { AIProviderId, ModelInfo, RegistryRefreshResult } from '../types';

export interface ModelRegistryOptions {
    remoteRegistryUrl: string;
    allowRemoteRegistry: boolean;
    readCache: () => Promise<string | null>;
    writeCache: (content: string) => Promise<void>;
}

export class ModelRegistry {
    private options: ModelRegistryOptions;
    private models: ModelInfo[];
    private lastRefresh?: RegistryRefreshResult;

    constructor(options: ModelRegistryOptions) {
        this.options = options;
        this.models = [...BUILTIN_MODELS];
    }

    async refresh(): Promise<RegistryRefreshResult> {
        const remote = await loadRemoteRegistry({
            enabled: this.options.allowRemoteRegistry,
            url: this.options.remoteRegistryUrl,
            readCache: this.options.readCache,
            writeCache: this.options.writeCache
        }, BUILTIN_MODELS);
        this.models = this.mergeModels(remote);
        const result: RegistryRefreshResult = {
            source: remote.source === 'remote' ? 'remote' : remote.source,
            fetchedAt: remote.fetchedAt,
            warning: remote.warning
        };
        this.lastRefresh = result;
        return result;
    }

    getLastRefresh(): RegistryRefreshResult | undefined {
        return this.lastRefresh;
    }

    getAll(): ModelInfo[] {
        return [...this.models];
    }

    getByProvider(provider: AIProviderId): ModelInfo[] {
        return this.models.filter(model => model.provider === provider);
    }

    findByAlias(alias: string): ModelInfo | undefined {
        return this.models.find(model => model.alias === alias);
    }

    findByProviderModel(provider: AIProviderId, id: string): ModelInfo | undefined {
        return this.models.find(model => model.provider === provider && model.id === id);
    }

    resolveAlias(provider: AIProviderId, id: string): string | undefined {
        return this.findByProviderModel(provider, id)?.alias;
    }

    private mergeModels(remote: RemoteRegistryLoadResult): ModelInfo[] {
        if (!remote.models.length) return [...BUILTIN_MODELS];

        const merged = new Map<string, ModelInfo>();
        BUILTIN_MODELS.forEach(model => merged.set(model.alias, model));
        remote.models.forEach(model => merged.set(model.alias, model));
        return Array.from(merged.values());
    }
}
