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

    peekSession(key: string): InquirySession | undefined {
        return this.cache.sessions.find(s => s.key === key);
    }

    getLatestByBaseKey(baseKey: string): InquirySession | undefined {
        const matches = this.cache.sessions.filter(s => s.baseKey === baseKey);
        if (!matches.length) return undefined;
        matches.sort((a, b) => b.lastAccessed - a.lastAccessed);
        return matches[0];
    }

    getRecentSessions(limit = 10): InquirySession[] {
        const sessions = [...this.cache.sessions];
        sessions.sort((a, b) => (b.createdAt || b.lastAccessed) - (a.createdAt || a.lastAccessed));
        return sessions.slice(0, Math.max(0, limit));
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

    updateSession(key: string, patch: Partial<InquirySession>): void {
        const session = this.cache.sessions.find(s => s.key === key);
        if (!session) return;
        Object.assign(session, patch);
        session.lastAccessed = Date.now();
        this.persist();
    }

    clearSessions(): void {
        this.cache.sessions = [];
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
