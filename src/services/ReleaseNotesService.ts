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
        this.releaseNotesBundle = cached ?? embedded ?? null;
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
        const bundle = this.releaseNotesBundle;
        if (!bundle) return null;
        return bundle.latest?.version ?? bundle.major?.version ?? null;
    }

    async maybeShowReleaseNotesModal(app: App, plugin: RadialTimelinePlugin): Promise<void> {
        const bundle = this.requireBundle();
        const latestVersion = this.getLatestVersion();
        if (!latestVersion) {
            throw new Error('Release bundle missing latest version');
        }

        const seenVersion = this.settings.lastSeenReleaseNotesVersion ?? '';
        if (seenVersion === latestVersion || this.releaseModalShownThisSession) return;

        this.releaseModalShownThisSession = true;
        await this.markReleaseNotesSeen(latestVersion);
        this.openReleaseNotesModal(app, plugin);
    }

    openReleaseNotesModal(app: App, plugin: RadialTimelinePlugin, force = false): void {
        const bundle = this.requireBundle();
        const major = bundle.major ?? bundle.latest;
        if (!major) {
            throw new Error('Release bundle missing major entry');
        }

        const patches = this.collectReleasePatches(bundle, major);
        const modal = new ReleaseNotesModal(app, plugin, major, patches);
        modal.open();
    }

    async markReleaseNotesSeen(version: string): Promise<void> {
        if (this.settings.lastSeenReleaseNotesVersion === version) return;
        this.settings.lastSeenReleaseNotesVersion = version;
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

    collectReleasePatches(bundle: EmbeddedReleaseNotesBundle, major: EmbeddedReleaseNotesEntry): EmbeddedReleaseNotesEntry[] {
        const patches: EmbeddedReleaseNotesEntry[] = [];
        const add = (entry: EmbeddedReleaseNotesEntry | null | undefined) => {
            if (!entry) return;
            patches.push(entry);
        };

        const patchSource: EmbeddedReleaseNotesEntry[] = Array.isArray(bundle.patches) ? bundle.patches : [];
        for (const entry of patchSource) {
            add(entry);
        }

        // Add latest if it's different from major
        if (bundle.latest && bundle.latest.version !== major.version) {
            add(bundle.latest);
        }

        patches.sort((a, b) => compareReleaseVersionsDesc(a.version, b.version));
        return patches;
    }

    private loadEmbeddedReleaseNotes(): EmbeddedReleaseNotesBundle | null {
        const parsed = JSON.parse(EMBEDDED_RELEASE_NOTES);
        if (!parsed || typeof parsed !== 'object') {
            throw new Error('Embedded release notes are missing or malformed');
        }

        const normalizeEntry = (value: unknown): EmbeddedReleaseNotesEntry => {
            if (!value || typeof value !== 'object') {
                throw new Error('Release entry is invalid');
            }
            const obj = value as Record<string, unknown>;
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

        const major = parsed.major ? normalizeEntry(parsed.major) : null;
        const latest = parsed.latest ? normalizeEntry(parsed.latest) : null;
        const patches = Array.isArray(parsed.patches)
            ? parsed.patches.map(normalizeEntry)
            : undefined;

        return {
            major,
            latest,
            patches
        };
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
        const latest = await this.fetchGitHubRelease('latest');
        if (!latest) {
            return null;
        }

        const semver = parseReleaseVersion(latest.version);
        let major: EmbeddedReleaseNotesEntry | null = latest;
        let patches: EmbeddedReleaseNotesEntry[] | undefined;

        if (semver) {
            if (semver.minor !== 0 || semver.patch !== 0) {
                const majorTag = `${semver.major}.0.0`;
                const majorRelease = await this.fetchGitHubRelease(majorTag);
                if (majorRelease) {
                    major = majorRelease;
                }
            }
            const fetchedPatches = await this.fetchGitHubPatchReleases(semver.major);
            if (fetchedPatches.length > 0) {
                const seen = new Set<string>([major?.version ?? '']);
                patches = [];
                for (const entry of fetchedPatches) {
                    if (!entry) continue;
                    if (seen.has(entry.version)) continue;
                    seen.add(entry.version);
                    patches.push(entry);
                }
            }
        }

        return {
            major,
            latest,
            patches
        };
    }

    private async fetchGitHubRelease(tagOrLatest: 'latest' | string): Promise<EmbeddedReleaseNotesEntry | null> {
        try {
            const url = tagOrLatest === 'latest'
                ? 'https://raw.githubusercontent.com/ericrhystaylor/radial-timeline/master/release-notes/latest.json'
                : `https://raw.githubusercontent.com/ericrhystaylor/radial-timeline/master/release-notes/${encodeURIComponent(tagOrLatest)}.json`;

            const response = await requestUrl({ url, method: 'GET' });
            if (response.status !== 200) {
                console.warn(`[ReleaseNotes] Unexpected response (${response.status}) fetching ${tagOrLatest}`);
                return null;
            }

            return this.normalizeReleaseEntry(response.json);
        } catch (error) {
            console.warn(`Unable to fetch release notes (${tagOrLatest}):`, error);
            return null;
        }
    }

    private async fetchGitHubPatchReleases(major: number): Promise<EmbeddedReleaseNotesEntry[]> {
        try {
            const url = `https://raw.githubusercontent.com/ericrhystaylor/radial-timeline/master/release-notes/patches/${major}.json`;
            const response = await requestUrl({ url, method: 'GET' });
            if (response.status !== 200) {
                console.warn(`[ReleaseNotes] Unexpected response (${response.status}) fetching patches for ${major}`);
                return [];
            }

            const payload = JSON.parse(response.text ?? '[]');
            if (!Array.isArray(payload)) return [];

            const patches: EmbeddedReleaseNotesEntry[] = [];
            const seen = new Set<string>();

            for (const raw of payload) {
                const entry = this.normalizeReleaseEntry(raw);
                if (!entry) continue;
                if (seen.has(entry.version)) continue;
                seen.add(entry.version);
                const info = parseReleaseVersion(entry.version);
                if (!info) continue;
                if (info.major !== major) continue;
                if (info.minor === 0 && info.patch === 0) continue;
                patches.push(entry);
            }

            patches.sort((a, b) => compareReleaseVersionsDesc(a.version, b.version));
            return patches;
        } catch (error) {
            console.warn(`Unable to fetch release list for major ${major}:`, error);
            return [];
        }
    }

    private normalizeReleaseEntry(value: unknown): EmbeddedReleaseNotesEntry | null {
        if (!value || typeof value !== 'object') return null;
        const obj = value as Record<string, unknown>;
        const version = typeof obj.version === 'string' ? obj.version : undefined;
        const title = typeof obj.title === 'string' ? obj.title : undefined;
        const body = typeof obj.body === 'string' ? obj.body : undefined;

        if (!version || !title || !body) return null;

        const entry: EmbeddedReleaseNotesEntry = {
            version,
            title,
            body,
            url: typeof obj.url === 'string' ? obj.url : undefined,
            publishedAt: typeof obj.publishedAt === 'string' ? obj.publishedAt : undefined
        };
        return entry;
    }
}
