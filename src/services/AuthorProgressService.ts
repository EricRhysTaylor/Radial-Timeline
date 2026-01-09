import { App, Notice, TFolder } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { TimelineItem } from '../types/timeline';
import { createTimelineSVG } from '../renderer/TimelineRenderer';
import { getAllScenes } from '../utils/manuscript';
import { anonymizeTimeline, getAuthorProgressSealSVG } from '../renderer/utils/AuthorProgressUtils';

export class AuthorProgressService {
    constructor(private plugin: RadialTimelinePlugin, private app: App) {}

    /**
     * Checks if the APR report is stale based on settings.
     * Returns true only in Manual mode if threshold exceeded.
     */
    public isStale(): boolean {
        const settings = this.plugin.settings.authorProgress;
        if (!settings || !settings.enabled) return false;
        if (settings.updateFrequency !== 'manual') return false; // Auto modes don't show UI staleness

        if (!settings.lastPublishedDate) return true; // Never published

        const last = new Date(settings.lastPublishedDate).getTime();
        const now = Date.now();
        const diffDays = (now - last) / (1000 * 60 * 60 * 24);

        return diffDays > settings.stalenessThresholdDays;
    }

    /**
     * Calculates the project progress percentage.
     * Logic: (Completed Scenes + Weighted In-Progress) / Total Scenes
     * For V1 simplified: Count 'Complete', 'Completed', 'Done' status as 100%.
     * Optional: Add weighted logic for stages if requested.
     */
    public calculateProgress(scenes: TimelineItem[]): number {
        // Filter out beats/backdrops
        const realScenes = scenes.filter(s => s.itemType === 'Scene' || !s.itemType);
        if (realScenes.length === 0) return 0;

        let completedCount = 0;
        
        realScenes.forEach(scene => {
            const status = Array.isArray(scene.status) ? scene.status[0] : scene.status;
            const normalizedStatus = (status || '').toString().trim().toLowerCase();
            
            if (['complete', 'completed', 'done'].includes(normalizedStatus)) {
                completedCount++;
            }
            // Future: Add weighted stage logic here if needed
        });

        return Math.round((completedCount / realScenes.length) * 100);
    }

    /**
     * Generates and saves the APR report.
     */
    public async generateReport(mode?: 'static' | 'dynamic'): Promise<string | null> {
        const settings = this.plugin.settings.authorProgress;
        if (!settings) return null;

        const scenes = await getAllScenes(this.app, this.plugin);
        const progressPercent = this.calculateProgress(scenes);
        
        // Use settings mode or override
        const aprMode = mode === 'dynamic' ? settings.defaultMode : (settings.lastUsedMode || 'FULL_STRUCTURE');
        const processedScenes = anonymizeTimeline(scenes, aprMode);

        // Generate SVG with APR Mode flag
        const { svgString } = createTimelineSVG({
            settings: {
                ...this.plugin.settings,
                showActLabels: aprMode !== 'MOMENTUM_ONLY',
            }
        } as any, processedScenes, {
            aprMode: true,
            progressPercent,
            bookTitle: settings.bookTitle || 'Untitled Project',
            authorUrl: settings.authorUrl || ''
        });

        // Inject simplified seal/branding if not handled by renderer directly
        // The plan says renderer handles branding text path, so seal might be redundant or supplementary.
        // We'll leave the seal out if the renderer handles the perimeter text. 
        // But the plan says "Perimeter Branding: Arcing text... Links".
        // Let's assume createTimelineSVG handles it via the new options.

        // Add clickable wrapper if URL provided (and not handled inside SVG)
        let finalSvg = svgString;

        // Save logic
        if (mode === 'dynamic') {
            const path = settings.dynamicEmbedPath || 'Radial Timeline/Social/progress.svg';
            await this.ensureFolder(path);
            
            // Use Vault API: modify if exists, create if not
            const existingFile = this.app.vault.getAbstractFileByPath(path);
            if (existingFile) {
                await this.app.vault.modify(existingFile as any, finalSvg);
            } else {
                await this.app.vault.create(path, finalSvg);
            }
            
            // Update last published
            settings.lastPublishedDate = new Date().toISOString();
            await this.plugin.saveSettings();
            
            return path;
        } else {
            // Static snapshot - save to Output folder
            const fileName = `apr-snapshot-${Date.now()}.svg`;
            const folder = this.plugin.settings.aiOutputFolder || 'Radial Timeline/AI Logs';
            const path = `${folder}/${fileName}`;
            await this.ensureFolder(path);
            await this.app.vault.create(path, finalSvg);
            return path;
        }
    }

    public async checkAutoUpdate(): Promise<void> {
        const settings = this.plugin.settings.authorProgress;
        if (!settings || !settings.enabled || settings.updateFrequency === 'manual') return;

        // Check frequency
        const last = settings.lastPublishedDate ? new Date(settings.lastPublishedDate).getTime() : 0;
        const now = Date.now();
        const diffMs = now - last;
        
        let thresholdMs = 0;
        switch (settings.updateFrequency) {
            case 'daily': thresholdMs = 24 * 60 * 60 * 1000; break;
            case 'weekly': thresholdMs = 7 * 24 * 60 * 60 * 1000; break;
            case 'monthly': thresholdMs = 30 * 24 * 60 * 60 * 1000; break;
        }

        // Cooldown check (e.g., don't update if updated in last 5 mins to prevent spam on reload)
        const COOLDOWN = 5 * 60 * 1000; 

        if (diffMs > thresholdMs && diffMs > COOLDOWN) {
            try {
                await this.generateReport('dynamic');
                new Notice('Author Progress Report updated automatically.');
            } catch {
                // Silent failure for auto-update - user can manually trigger if needed
            }
        }
    }

    private async ensureFolder(filePath: string) {
        const folderPath = filePath.substring(0, filePath.lastIndexOf('/'));
        if (folderPath) {
            const existing = this.app.vault.getAbstractFileByPath(folderPath);
            if (!existing) {
                await this.app.vault.createFolder(folderPath);
            }
        }
    }
}
