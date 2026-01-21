import type RadialTimelinePlugin from '../main';
import type { InquirySession, InquirySessionCache } from './sessionTypes';
import { DEFAULT_INQUIRY_CACHE_MAX } from './constants';

export class InquirySessionStore {
    private cache: InquirySessionCache;
    private saveTimeout: number | null = null;

    constructor(private plugin: RadialTimelinePlugin) {
        const max = plugin.settings.inquiryCacheMaxSessions ?? DEFAULT_INQUIRY_CACHE_MAX;
        const stored = plugin.settings.inquirySessionCache as InquirySessionCache | undefined;
        this.cache = stored && Array.isArray(stored.sessions)
            ? { sessions: stored.sessions, max: stored.max || max }
            : { sessions: [], max };
        this.cache.max = max;
    }

    getSession(key: string): InquirySession | undefined {
        const session = this.cache.sessions.find(s => s.key === key);
        if (session) {
            session.lastAccessed = Date.now();
            this.scheduleSave();
        }
        return session;
    }

    getLatestByBaseKey(baseKey: string): InquirySession | undefined {
        const matches = this.cache.sessions.filter(s => s.baseKey === baseKey);
        if (!matches.length) return undefined;
        matches.sort((a, b) => b.lastAccessed - a.lastAccessed);
        return matches[0];
    }

    setSession(session: InquirySession): void {
        const index = this.cache.sessions.findIndex(s => s.key === session.key);
        if (index >= 0) {
            this.cache.sessions[index] = session;
        } else {
            this.cache.sessions.push(session);
        }
        this.prune();
        this.persist();
    }

    markStaleByBaseKey(baseKey: string): void {
        let updated = false;
        this.cache.sessions.forEach(session => {
            if (session.baseKey === baseKey && !session.stale) {
                session.stale = true;
                updated = true;
            }
        });
        if (updated) {
            this.scheduleSave();
        }
    }

    buildBaseKey(parts: { questionId: string; scope: string; focusId: string }): string {
        return `${parts.questionId}::${parts.scope}::${parts.focusId}`;
    }

    buildKey(baseKey: string, fingerprint: string): string {
        return `${baseKey}::${fingerprint}`;
    }

    private prune(): void {
        const max = this.plugin.settings.inquiryCacheMaxSessions ?? this.cache.max;
        this.cache.max = max;
        if (this.cache.sessions.length <= max) return;
        this.cache.sessions.sort((a, b) => b.lastAccessed - a.lastAccessed);
        this.cache.sessions = this.cache.sessions.slice(0, max);
    }

    private persist(): void {
        this.scheduleSave();
    }

    private scheduleSave(): void {
        if (this.saveTimeout) {
            window.clearTimeout(this.saveTimeout);
        }
        this.saveTimeout = window.setTimeout(() => {
            this.saveTimeout = null;
            this.plugin.settings.inquirySessionCache = this.cache;
            void this.plugin.saveSettings();
        }, 600);
    }
}
