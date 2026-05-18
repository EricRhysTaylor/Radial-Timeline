import { afterEach, describe, expect, it, vi } from 'vitest';
import { InquirySessionStore } from './InquirySessionStore';
import { DEFAULT_INQUIRY_HISTORY_LIMIT } from './constants';
import type RadialTimelinePlugin from '../main';
import type { InquirySession } from './sessionTypes';

const sess = (key: string, lastAccessed = Date.now()): InquirySession =>
    ({ key, baseKey: key, lastAccessed, createdAt: lastAccessed, targetSceneIds: [], result: {} } as unknown as InquirySession);

const makePlugin = (sessions: InquirySession[] = []) =>
    ({ settings: { inquirySessionCache: { sessions, max: DEFAULT_INQUIRY_HISTORY_LIMIT } } } as unknown as RadialTimelinePlugin);

describe('InquirySessionStore.reloadFromSettings', () => {
    it('stale snapshot cannot see a session added to settings after construction', () => {
        const plugin = makePlugin([]);
        const store = new InquirySessionStore(plugin);
        // Another instance persists a session into the shared settings cache.
        plugin.settings.inquirySessionCache = { sessions: [sess('X')], max: DEFAULT_INQUIRY_HISTORY_LIMIT };
        expect(store.peekSession('X')).toBeUndefined();
    });

    it('after reloadFromSettings() the externally-added session is visible', () => {
        const plugin = makePlugin([]);
        const store = new InquirySessionStore(plugin);
        plugin.settings.inquirySessionCache = { sessions: [sess('X')], max: DEFAULT_INQUIRY_HISTORY_LIMIT };
        store.reloadFromSettings();
        expect(store.peekSession('X')?.key).toBe('X');
    });

    it('clones (does not alias) the settings sessions array', () => {
        const plugin = makePlugin([sess('A')]);
        const store = new InquirySessionStore(plugin);
        // Mutating settings array after a reload must not retroactively change the store.
        store.reloadFromSettings();
        (plugin.settings.inquirySessionCache as { sessions: InquirySession[] }).sessions.push(sess('B'));
        expect(store.peekSession('B')).toBeUndefined();
    });

    it('still bounds to the history limit (prune) after reload', () => {
        const plugin = makePlugin([]);
        const store = new InquirySessionStore(plugin);
        const overflow = Array.from({ length: DEFAULT_INQUIRY_HISTORY_LIMIT + 5 }, (_, i) => sess(`s${i}`, i));
        plugin.settings.inquirySessionCache = { sessions: overflow, max: DEFAULT_INQUIRY_HISTORY_LIMIT };
        store.reloadFromSettings();
        expect(store.getSessionCount()).toBe(DEFAULT_INQUIRY_HISTORY_LIMIT);
    });

    describe('set/prune behavior unchanged', () => {
        afterEach(() => vi.unstubAllGlobals());
        it('setSession still inserts and reload re-reads the persisted result', () => {
            vi.stubGlobal('window', { setTimeout: () => 1, clearTimeout: () => undefined });
            const plugin = makePlugin([]);
            const store = new InquirySessionStore(plugin);
            store.setSession(sess('K1'));
            expect(store.peekSession('K1')?.key).toBe('K1');
            // setSession writes through to settings; a fresh reload still sees it.
            store.reloadFromSettings();
            expect(store.peekSession('K1')?.key).toBe('K1');
        });
    });
});
