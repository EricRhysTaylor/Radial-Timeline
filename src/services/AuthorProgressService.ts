import { App, Notice, TFolder } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { TimelineItem } from '../types/timeline';
import { createAprSVG } from '../renderer/apr/AprRenderer';
import { getAllScenes } from '../utils/manuscript';
import type { AprCampaign } from '../types/settings';
import { getTeaserThresholds, getTeaserRevealLevel, teaserLevelToRevealOptions, calculateAprProgress } from '../renderer/apr/AprConstants';

export class AuthorProgressService {
    constructor(private plugin: RadialTimelinePlugin, private app: App) {}

    /**
     * Checks if the main APR report needs refresh based on settings.
     * Returns true only in Manual mode if threshold exceeded.
     */
    public isStale(): boolean {
        const settings = this.plugin.settings.authorProgress;
        if (!settings || !settings.enabled) return false;
        if (settings.updateFrequency !== 'manual') return false; // Auto modes don't need refresh reminders

        if (!settings.lastPublishedDate) return true; // Never published

        const last = new Date(settings.lastPublishedDate).getTime();
        const now = Date.now();
        const diffDays = (now - last) / (1000 * 60 * 60 * 24);

        return diffDays > settings.stalenessThresholdDays;
    }

    /**
     * Checks if any campaign needs refresh.
     * Pro Feature: Campaigns are independent of the main report.
     */
    public anyCampaignNeedsRefresh(): boolean {
        const campaigns = this.plugin.settings.authorProgress?.campaigns || [];
        return campaigns.some(c => this.campaignNeedsRefresh(c));
    }

    /**
     * Check if a specific campaign needs refresh.
     */
    public campaignNeedsRefresh(campaign: AprCampaign): boolean {
        if (!campaign.isActive) return false;
        if (!campaign.lastPublishedDate) return true; // Never published

        const last = new Date(campaign.lastPublishedDate).getTime();
        const now = Date.now();
        const diffDays = (now - last) / (1000 * 60 * 60 * 24);

        return diffDays > campaign.refreshThresholdDays;
    }

    /**
     * Get list of campaigns needing refresh.
     */
    public getCampaignsNeedingRefresh(): AprCampaign[] {
        const campaigns = this.plugin.settings.authorProgress?.campaigns || [];
        return campaigns.filter(c => this.campaignNeedsRefresh(c));
    }

    /**
     * Combined check: main report OR any campaign needs refresh.
     */
    public needsAnyRefresh(): boolean {
        return this.isStale() || this.anyCampaignNeedsRefresh();
    }

    /**
     * Calculate progress percentage using weighted publish stage approach.
     * Delegates to the APR-specific calculation in AprConstants.
     * 
     * Each scene contributes based on its Publish Stage:
     * - Zero = 25%, Author = 50%, House = 75%, Press = 100%
     * 
     * This is intentionally separate from TimelineMetricsService
     * (estimated completion tick) and settings progression preview.
     */
    public calculateProgress(scenes: TimelineItem[]): number {
        return calculateAprProgress(scenes);
    }

    /**
     * Generates and saves the APR report using the dedicated APR renderer.
     */
    public async generateReport(mode?: 'static' | 'dynamic'): Promise<string | null> {
        const settings = this.plugin.settings.authorProgress;
        if (!settings) return null;

        const scenes = await getAllScenes(this.app, this.plugin);
        const progressPercent = this.calculateProgress(scenes);

        const { svgString } = createAprSVG(scenes, {
            size: settings.aprSize || 'medium',
            progressPercent,
            bookTitle: settings.bookTitle || 'Working Title',
            authorName: settings.authorName || '',
            authorUrl: settings.authorUrl || '',
            showSubplots: settings.showSubplots ?? true,
            showActs: settings.showActs ?? true,
            showStatusColors: settings.showStatus ?? true,
            showProgressPercent: settings.showProgressPercent ?? true,
            stageColors: (this.plugin.settings as any).publishStageColors,
            actCount: this.plugin.settings.actCount || undefined,
            backgroundColor: settings.aprBackgroundColor,
            transparentCenter: settings.aprCenterTransparent,
            bookAuthorColor: settings.aprBookAuthorColor ?? (this.plugin.settings.publishStageColors?.Press),
            engineColor: settings.aprEngineColor,
            theme: settings.aprTheme || 'dark'
        });

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

    /**
     * Generate and save a report for a specific campaign.
     * Pro Feature: Each campaign has its own settings and output path.
     */
    public async generateCampaignReport(campaignId: string): Promise<string | null> {
        const settings = this.plugin.settings.authorProgress;
        if (!settings) return null;

        const campaign = settings.campaigns?.find(c => c.id === campaignId);
        if (!campaign) {
            new Notice('Campaign not found');
            return null;
        }

        const scenes = await getAllScenes(this.app, this.plugin);
        const progressPercent = this.calculateProgress(scenes);

        // Determine reveal options based on Momentum Builder or static settings
        let showScenes = true;
        let showSubplots = campaign.showSubplots;
        let showActs = campaign.showActs;
        let showStatusColors = campaign.showStatus;
        
        // Apply Teaser Reveal if enabled
        if (campaign.teaserReveal?.enabled) {
            const thresholds = getTeaserThresholds(
                campaign.teaserReveal.preset,
                campaign.teaserReveal.customThresholds
            );
            const revealLevel = getTeaserRevealLevel(progressPercent, thresholds);
            const revealOptions = teaserLevelToRevealOptions(revealLevel);
            
            showScenes = revealOptions.showScenes;
            showSubplots = revealOptions.showSubplots;
            showActs = revealOptions.showActs;
            showStatusColors = revealOptions.showStatusColors;
        }

        // Use campaign-specific settings with fallbacks to main settings
        const { svgString } = createAprSVG(scenes, {
            size: campaign.aprSize || settings.aprSize || 'medium',
            progressPercent,
            bookTitle: settings.bookTitle || 'Working Title',
            authorName: settings.authorName || '',
            authorUrl: settings.authorUrl || '',
            showScenes,
            showSubplots,
            showActs,
            showStatusColors,
            showProgressPercent: campaign.showProgressPercent,
            stageColors: this.plugin.settings.publishStageColors,
            actCount: this.plugin.settings.actCount || undefined,
            backgroundColor: campaign.customBackgroundColor ?? settings.aprBackgroundColor,
            transparentCenter: campaign.customTransparent ?? settings.aprCenterTransparent,
            bookAuthorColor: settings.aprBookAuthorColor ?? (this.plugin.settings.publishStageColors?.Press),
            engineColor: settings.aprEngineColor,
            theme: campaign.customTheme ?? settings.aprTheme ?? 'dark'
        });

        // Save to campaign's embed path
        const path = campaign.embedPath;
        await this.ensureFolder(path);
        
        const existingFile = this.app.vault.getAbstractFileByPath(path);
        if (existingFile && 'path' in existingFile) {
            // SAFE: Cast required for Obsidian API compatibility
            await this.app.vault.modify(existingFile as Parameters<typeof this.app.vault.modify>[0], svgString);
        } else {
            await this.app.vault.create(path, svgString);
        }
        
        // Update campaign's last published date
        const campaignIndex = settings.campaigns?.findIndex(c => c.id === campaignId);
        if (campaignIndex !== undefined && campaignIndex >= 0 && settings.campaigns) {
            settings.campaigns[campaignIndex].lastPublishedDate = new Date().toISOString();
            await this.plugin.saveSettings();
        }
        
        new Notice(`Campaign "${campaign.name}" published!`);
        return path;
    }

    /**
     * Publish all active campaigns that need refresh.
     * Pro Feature: Batch update for convenience.
     */
    public async publishAllStale(): Promise<number> {
        const needsRefresh = this.getCampaignsNeedingRefresh();
        let count = 0;
        
        for (const campaign of needsRefresh) {
            try {
                await this.generateCampaignReport(campaign.id);
                count++;
            } catch (e) {
                console.error(`Failed to publish campaign ${campaign.name}:`, e);
            }
        }
        
        if (count > 0) {
            new Notice(`Published ${count} campaign${count > 1 ? 's' : ''}`);
        }
        
        return count;
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
