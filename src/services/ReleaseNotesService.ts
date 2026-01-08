/*
 * Release Notes Service
 * Handles embedded/remote release notes management, caching, and state.
 */

import { requestUrl, App } from 'obsidian';
import { compareReleaseVersionsDesc, parseReleaseVersion } from '../utils/releases';
import type { EmbeddedReleaseNotesBundle, EmbeddedReleaseNotesEntry, RadialTimelineSettings } from '../types';
import { ReleaseNotesModal } from '../modals/ReleaseNotesModal';
import type RadialTimelinePlugin from '../main';
import releaseNotesBundle from '../data/releaseNotesBundle.json';

export class ReleaseNotesService {
    private releaseNotesBundle: EmbeddedReleaseNotesBundle | null = null;
    private releaseModalShownThisSession = false;
    private releaseNotesFetchPromise: Promise<boolean> | null = null;

    constructor(
        private settings: RadialTimelineSettings,
        private saveSettings: () => Promise<void>
    ) { }

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

    // --- Internal Helpers ---

    private loadEmbeddedReleaseNotes(): EmbeddedReleaseNotesBundle | null {
        // Cast the JSON import to our interface
        // We handle legacy structure (major/latest/patches) vs new structure (entries array)
        const bundle = releaseNotesBundle as unknown as any;
        if (!bundle) return null;

        // If it's already in new format
        if (Array.isArray(bundle.entries)) {
            return bundle as EmbeddedReleaseNotesBundle;
        }

        // Convert legacy format to new format
        const entries: EmbeddedReleaseNotesEntry[] = [];
        
        // Helper to push if exists
        const addEntry = (e: any) => { // SAFE: any type used for processing external JSON with varying schema
            if (e && e.version && Array.isArray(e.sections)) {
                // Ensure required fields
                entries.push({
                    version: e.version,
                    title: e.title || `Release ${e.version}`,
                    sections: e.sections,
                    publishedAt: e.publishedAt,
                    body: e.body,
                    url: e.url
                });
            }
        };

        // Legacy: "latest" usually maps to the newest patch or major release
        if (bundle.latest) addEntry(bundle.latest);
        
        // Legacy: "patches" array
        if (Array.isArray(bundle.patches)) {
            bundle.patches.forEach(addEntry);
        }

        // Legacy: "major" release
        if (bundle.major) addEntry(bundle.major);

        // Sort desc
        entries.sort((a, b) => compareReleaseVersionsDesc(a.version, b.version));

        // Dedupe
        const uniqueEntries = entries.filter((e, index, self) => 
            index === self.findIndex((t) => t.version === e.version)
        );

        return {
            version: bundle.version || (uniqueEntries[0]?.version ?? '0.0.0'),
            entries: uniqueEntries
        };
    }

    private extractLatestVersion(bundle: EmbeddedReleaseNotesBundle | null): string | null {
        if (!bundle) return null;
        if (Array.isArray(bundle.entries) && bundle.entries.length > 0) {
            return bundle.entries[0]?.version ?? null;
        }
        // Fallback for legacy structure if strict typing failed (shouldn't happen with conversion above)
        return null;
    }

    public getEntries(): EmbeddedReleaseNotesEntry[] {
        const bundle = this.releaseNotesBundle;
        if (!bundle) return [];
        
        if (Array.isArray(bundle.entries)) {
            // Return a safe copy
            return bundle.entries.map(entry => ({ 
                ...entry,
                sections: entry.sections || [] // Ensure sections exists
            }));
        }
        
        return [];
    }

    private computeEntryKey(entry: EmbeddedReleaseNotesEntry): string {
        return entry.version;
    }

    public getMajorVersion(): string {
        const entries = this.getEntries();
        // Assuming the latest version is the major version for now, or parse it
        return entries.length > 0 ? entries[0]!.version.split('.')[0] : '0';
    }

    public async ensureReleaseNotesFresh(): Promise<void> {
        // Since we are using embedded notes primarily, this can be a no-op or a fetch check
        // For now, no-op to satisfy interface
        return Promise.resolve();
    }
}
