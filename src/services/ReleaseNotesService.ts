/*
 * Release Notes Service
 * Handles embedded/remote release notes management, caching, and state.
 */

import { requestUrl, App } from 'obsidian';
import { compareReleaseVersionsDesc, parseReleaseVersion } from '../utils/releases';
import type { EmbeddedReleaseNotesBundle, EmbeddedReleaseNotesEntry, RadialTimelineSettings } from '../types';
import { ReleaseNotesModal } from '../modals/ReleaseNotesModal';
import type RadialTimelinePlugin from '../main';

declare const EMBEDDED_RELEASE_NOTES: string;

export class ReleaseNotesService {
    private releaseNotesBundle: EmbeddedReleaseNotesBundle | null = null;
    private releaseModalShownThisSession = false;
    private releaseNotesFetchPromise: Promise<boolean> | null = null;

    constructor(
        private settings: RadialTimelineSettings,
        private saveSettings: () => Promise<void>
    ) {}

    /**
     * Initialize service state by merging embedded release notes with cached settings.
     */
    initializeFromEmbedded(): void {
        const embedded = this.loadEmbeddedReleaseNotes();
        const cached = this.settings.cachedReleaseNotes ?? null;

        const embeddedLatest = this.extractLatestVersion(embedded);
        const cachedLatest = this.extractLatestVersion(cached);
        const useEmbedded =
            embedded &&
            (!cachedLatest || (embeddedLatest && compareReleaseVersionsDesc(embeddedLatest, cachedLatest) <= 0));

        if (useEmbedded) {
            this.settings.cachedReleaseNotes = embedded;
            void this.saveSettings();
            this.releaseNotesBundle = embedded;
        } else {
            this.releaseNotesBundle = cached ?? embedded ?? null;
        }
        this.releaseModalShownThisSession = false;
    }

    getBundle(): EmbeddedReleaseNotesBundle | null {
        return this.releaseNotesBundle;
    }

    hasShownModalThisSession(): boolean {
        return this.releaseModalShownThisSession;
    }

    markModalShown(): void {
        this.releaseModalShownThisSession = true;
    }

    getLatestVersion(): string | null {
        const entries = this.getEntries();
        return entries.length > 0 ? entries[0]!.version : null;
    }

    async maybeShowReleaseNotesModal(app: App, plugin: RadialTimelinePlugin): Promise<void> {
        const entries = this.getEntries();
        if (entries.length === 0) {
            throw new Error('Release bundle missing entries');
        }

        const latestEntry = entries[0]!;
        const latestVersion = latestEntry.version;
        if (!latestVersion) {
            throw new Error('Release bundle missing latest version');
        }

        const latestKey = this.computeEntryKey(latestEntry);

        const seenVersion = this.settings.lastSeenReleaseNotesVersion ?? '';
        const hasSeen = seenVersion === latestKey || seenVersion === latestVersion;
        if (hasSeen || this.releaseModalShownThisSession) return;

        this.releaseModalShownThisSession = true;
        await this.markReleaseNotesSeen(latestKey);
        this.openReleaseNotesModal(app, plugin);
    }

    openReleaseNotesModal(app: App, plugin: RadialTimelinePlugin): void {
        const entries = this.getEntries();
        if (entries.length === 0) {
            throw new Error('Release bundle missing entries');
        }
        const featuredEntry = entries[0]!;
        const modal = new ReleaseNotesModal(app, plugin, entries, featuredEntry);
        modal.open();
    }

    async markReleaseNotesSeen(versionKey: string): Promise<void> {
        if (this.settings.lastSeenReleaseNotesVersion === versionKey) return;
        this.settings.lastSeenReleaseNotesVersion = versionKey;
        await this.saveSettings();
    }

    async ensureReleaseNotesFresh(force: boolean): Promise<boolean> {
        if (!force && this.releaseNotesFetchPromise) {
            return this.releaseNotesFetchPromise;
        }
        const task = this.performReleaseNotesFetch(force).finally(() => {
            this.releaseNotesFetchPromise = null;
        });
        this.releaseNotesFetchPromise = task;
        return task;
    }

    getEntries(): EmbeddedReleaseNotesEntry[] {
        const bundle = this.releaseNotesBundle;
        if (!bundle) return [];
        return this.extractEntries(bundle);
    }

    getMajorVersion(): string | null {
        if (!this.releaseNotesBundle) return null;
        if (this.releaseNotesBundle.majorVersion) return this.releaseNotesBundle.majorVersion;
        if (this.releaseNotesBundle.major?.version) return this.releaseNotesBundle.major.version;
        const entries = this.extractEntries(this.releaseNotesBundle);
        const majorEntry = this.resolveMajorEntry(this.releaseNotesBundle, entries);
        return majorEntry?.version ?? null;
    }

    private loadEmbeddedReleaseNotes(): EmbeddedReleaseNotesBundle | null {
        const parsed = JSON.parse(EMBEDDED_RELEASE_NOTES);
        return this.normalizeBundleFromValue(parsed);
    }

    private requireBundle(): EmbeddedReleaseNotesBundle {
        if (!this.releaseNotesBundle) {
            throw new Error('Release notes bundle is unavailable');
        }
        return this.releaseNotesBundle;
    }

    private async performReleaseNotesFetch(force: boolean): Promise<boolean> {
        const now = Date.now();
        if (!force && this.settings.releaseNotesLastFetched) {
            const last = Date.parse(this.settings.releaseNotesLastFetched);
            if (!Number.isNaN(last) && now - last < 24 * 60 * 60 * 1000) {
                return false; // Fresh enough
            }
        }

        try {
            const bundle = await this.downloadReleaseNotesBundle();
            if (!bundle) {
                return false;
            }
            const embedded = this.loadEmbeddedReleaseNotes();
            const merged = bundle ?? embedded;
            if (!merged) {
                throw new Error('Downloaded release bundle is empty');
            }
            this.settings.cachedReleaseNotes = merged;
            this.settings.releaseNotesLastFetched = new Date(now).toISOString();
            await this.saveSettings();
            this.releaseNotesBundle = merged;
            return true;
        } catch (error) {
            console.error('Failed to refresh release notes from GitHub:', error);
            return false;
        }
    }

    private async downloadReleaseNotesBundle(): Promise<EmbeddedReleaseNotesBundle | null> {
        const url = 'https://raw.githubusercontent.com/ericrhystaylor/radial-timeline/master/src/data/releaseNotesBundle.json';
        try {
            const response = await requestUrl({ url, method: 'GET' });
            if (response.status !== 200) {
                console.warn(`[ReleaseNotes] Unexpected response (${response.status}) fetching release bundle`);
                return null;
            }
            const payload = response.json ?? (response.text ? JSON.parse(response.text) : null);
            return this.normalizeBundleFromValue(payload);
        } catch (error) {
            console.warn('Unable to fetch release notes bundle:', error);
            return null;
        }
    }

    private normalizeBundleFromValue(value: unknown): EmbeddedReleaseNotesBundle | null {
        if (!value || typeof value !== 'object') {
            throw new Error('Release bundle payload is missing or malformed');
        }

        const normalizeEntry = (entryValue: unknown): EmbeddedReleaseNotesEntry => {
            if (!entryValue || typeof entryValue !== 'object') {
                throw new Error('Release entry is invalid');
            }
            const obj = entryValue as Record<string, unknown>;
            const version = obj.version;
            const title = obj.title;
            const body = obj.body;
            if (typeof version !== 'string' || typeof title !== 'string' || typeof body !== 'string') {
                throw new Error('Release entry missing required fields');
            }
            return {
                version,
                title,
                body,
                url: typeof obj.url === 'string' ? obj.url : undefined,
                publishedAt: typeof obj.publishedAt === 'string' ? obj.publishedAt : undefined
            };
        };

        const bundleObj = value as Record<string, unknown>;
        const major = bundleObj.major ? normalizeEntry(bundleObj.major) : null;
        const latest = bundleObj.latest ? normalizeEntry(bundleObj.latest) : null;
        const patches = Array.isArray(bundleObj.patches)
            ? bundleObj.patches.map(normalizeEntry)
            : undefined;
        const entries = Array.isArray(bundleObj.entries)
            ? bundleObj.entries.map(normalizeEntry)
            : undefined;
        const majorVersion = typeof bundleObj.majorVersion === 'string' ? bundleObj.majorVersion : undefined;

        return {
            entries,
            majorVersion,
            major,
            latest,
            patches
        };
    }

    private computeEntryKey(entry: EmbeddedReleaseNotesEntry): string {
        const signature = `${entry.version}|${entry.title}|${entry.body}|${entry.publishedAt ?? ''}`;
        let hash = 0;
        for (let i = 0; i < signature.length; i++) {
            hash = (hash * 31 + signature.charCodeAt(i)) | 0;
        }
        const hashHex = (hash >>> 0).toString(16);
        return `${entry.version}|${hashHex}`;
    }

    private extractLatestVersion(bundle: EmbeddedReleaseNotesBundle | null): string | null {
        if (!bundle) return null;
        if (Array.isArray(bundle.entries) && bundle.entries.length > 0) {
            return bundle.entries[0]?.version ?? null;
        }
        return bundle.latest?.version ?? bundle.major?.version ?? null;
    }

    private extractEntries(bundle: EmbeddedReleaseNotesBundle): EmbeddedReleaseNotesEntry[] {
        if (Array.isArray(bundle.entries) && bundle.entries.length > 0) {
            return bundle.entries.map(entry => ({ ...entry }));
        }
        const entries: EmbeddedReleaseNotesEntry[] = [];
        const seen = new Set<string>();
        const addEntry = (entry: EmbeddedReleaseNotesEntry | null | undefined) => {
            if (!entry) return;
            if (seen.has(entry.version)) return;
            seen.add(entry.version);
            entries.push(entry);
        };

        addEntry(bundle.latest);

        const bundlePatches: EmbeddedReleaseNotesEntry[] = Array.isArray(bundle.patches) ? [...bundle.patches] : [];
        bundlePatches.sort((a, b) => compareReleaseVersionsDesc(a.version, b.version));
        bundlePatches.forEach(addEntry);

        addEntry(bundle.major);

        if (entries.length === 0 && bundle.major) {
            entries.push(bundle.major);
        }
        if (entries.length === 0 && bundle.latest) {
            entries.push(bundle.latest);
        }
        return entries;
    }

    private resolveMajorEntry(bundle: EmbeddedReleaseNotesBundle, entries: EmbeddedReleaseNotesEntry[]): EmbeddedReleaseNotesEntry | null {
        if (entries.length === 0) return null;
        const desiredVersions: string[] = [];
        if (bundle.majorVersion) desiredVersions.push(bundle.majorVersion);
        if (bundle.major?.version) desiredVersions.push(bundle.major.version);

        for (const version of desiredVersions) {
            const match = entries.find(entry => entry.version === version);
            if (match) return match;
        }

        const majorCandidate = entries.find(entry => {
            const info = parseReleaseVersion(entry.version);
            return !!info && info.minor === 0 && info.patch === 0;
        });
        if (majorCandidate) return majorCandidate;

        return entries[entries.length - 1] ?? entries[0] ?? null;
    }
}
