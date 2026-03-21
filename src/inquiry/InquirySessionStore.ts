import type RadialTimelinePlugin from '../main';
import type { InquirySession, InquirySessionCache } from './sessionTypes';
import { DEFAULT_INQUIRY_HISTORY_LIMIT, INQUIRY_HISTORY_LIMIT_OPTIONS, MAX_INQUIRY_HISTORY } from './constants';

type LegacyInquirySettings = {
    inquiryCacheMaxSessions?: number;
};

export class InquirySessionStore {
    private cache: InquirySessionCache;
    private saveTimeout: number | null = null;

    constructor(private plugin: RadialTimelinePlugin) {
        const max = this.resolveConfiguredLimit();
        const stored = plugin.settings.inquirySessionCache as InquirySessionCache | undefined;
        this.cache = stored && Array.isArray(stored.sessions)
            ? {
                sessions: stored.sessions.map(session => ({
                    ...session,
                    targetSceneIds: Array.isArray(session.targetSceneIds)
                        ? session.targetSceneIds.map(value => String(value).trim()).filter(Boolean)
                        : []
                })),
                max: stored.max || max
            }
            : { sessions: [], max };
        this.cache.max = max;
        this.prune();
    }

    getConfiguredLimit(): number {
        return this.resolveConfiguredLimit();
    }

    applyConfiguredLimit(): void {
        this.prune();
        this.persist();
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

    getSessionCount(): number {
        return this.cache.sessions.length;
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

    buildBaseKey(parts: {
        questionId: string;
        questionPromptForm?: 'standard' | 'focused';
        scope: string;
        scopeKey: string;
        targetSceneIds?: string[];
    }): string {
        const targetSceneKey = Array.isArray(parts.targetSceneIds) && parts.targetSceneIds.length
            ? parts.targetSceneIds.map(value => value.trim()).filter(Boolean).sort().join(',')
            : '';
        const questionPromptForm = parts.questionPromptForm === 'focused' ? 'focused' : 'standard';
        return `${parts.questionId}::${questionPromptForm}::${parts.scope}::${parts.scopeKey}::${targetSceneKey}`;
    }

    buildKey(baseKey: string, fingerprint: string): string {
        return `${baseKey}::${fingerprint}`;
    }

    private prune(): void {
        const max = this.resolveConfiguredLimit();
        this.cache.max = max;
        if (this.cache.sessions.length <= max) return;
        this.cache.sessions.sort((a, b) => b.lastAccessed - a.lastAccessed);
        this.cache.sessions = this.cache.sessions.slice(0, max);
    }

    private resolveConfiguredLimit(): number {
        const limit = this.plugin.settings.inquiryRecentSessionsLimit;
        if (typeof limit === 'number' && Number.isFinite(limit)) {
            return this.normalizeLimit(limit);
        }
        const legacyLimit = (this.plugin.settings as LegacyInquirySettings).inquiryCacheMaxSessions;
        if (typeof legacyLimit === 'number' && Number.isFinite(legacyLimit)) {
            const normalizedLegacy = this.normalizeLimit(legacyLimit);
            this.plugin.settings.inquiryRecentSessionsLimit = normalizedLegacy;
            return normalizedLegacy;
        }
        return DEFAULT_INQUIRY_HISTORY_LIMIT;
    }

    private normalizeLimit(value: number): number {
        const clamped = Math.max(INQUIRY_HISTORY_LIMIT_OPTIONS[0], Math.min(MAX_INQUIRY_HISTORY, Math.round(value)));
        return INQUIRY_HISTORY_LIMIT_OPTIONS.reduce((closest, option) => {
            return Math.abs(option - clamped) < Math.abs(closest - clamped) ? option : closest;
        }, INQUIRY_HISTORY_LIMIT_OPTIONS[0]);
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
