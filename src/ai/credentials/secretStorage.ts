import type { App } from 'obsidian';

type AnySecretStorage = {
    get?: (key: string) => Promise<string | null | undefined>;
    has?: (key: string) => Promise<boolean>;
    set?: (key: string, value: string) => Promise<void> | void;
    store?: (key: string, value: string) => Promise<void> | void;
    delete?: (key: string) => Promise<void> | void;
    remove?: (key: string) => Promise<void> | void;
};

function getStorage(app: App): AnySecretStorage | null {
    const storage = (app as unknown as { secretStorage?: AnySecretStorage }).secretStorage;
    if (!storage || typeof storage.get !== 'function') return null;
    return storage;
}

export function isSecretStorageAvailable(app: App): boolean {
    const storage = getStorage(app);
    if (!storage) return false;
    return typeof storage.set === 'function'
        || typeof storage.store === 'function'
        || typeof storage.delete === 'function'
        || typeof storage.remove === 'function';
}

export async function getSecret(app: App, secretId: string): Promise<string | null> {
    const storage = getStorage(app);
    const id = (secretId || '').trim();
    if (!storage || !id) return null;
    try {
        const value = await storage.get?.(id);
        if (!value || typeof value !== 'string') return null;
        const trimmed = value.trim();
        return trimmed.length ? trimmed : null;
    } catch {
        return null;
    }
}

export async function hasSecret(app: App, secretId: string): Promise<boolean> {
    const storage = getStorage(app);
    const id = (secretId || '').trim();
    if (!storage || !id) return false;
    try {
        if (typeof storage.has === 'function') {
            return !!(await storage.has(id));
        }
        const existing = await storage.get?.(id);
        return !!(existing && String(existing).trim().length);
    } catch {
        return false;
    }
}

export async function setSecret(app: App, secretId: string, secretValue: string): Promise<boolean> {
    const storage = getStorage(app);
    const id = (secretId || '').trim();
    if (!storage || !id) return false;
    const value = (secretValue || '').trim();
    if (!value.length) return false;
    try {
        if (typeof storage.set === 'function') {
            await storage.set(id, value);
            return true;
        }
        if (typeof storage.store === 'function') {
            await storage.store(id, value);
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

export async function deleteSecret(app: App, secretId: string): Promise<boolean> {
    const storage = getStorage(app);
    const id = (secretId || '').trim();
    if (!storage || !id) return false;
    try {
        if (typeof storage.delete === 'function') {
            await storage.delete(id);
            return true;
        }
        if (typeof storage.remove === 'function') {
            await storage.remove(id);
            return true;
        }
        return false;
    } catch {
        return false;
    }
}
