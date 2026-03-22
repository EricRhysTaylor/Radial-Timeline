import { App, Notice } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import type { AuthorProgressCampaign, AuthorProgressSettings } from '../../types/settings';
import { hasProFeatureAccess } from '../../settings/featureGate';
import { AuthorProgressRenderService } from './AuthorProgressRenderService';
import { AuthorProgressPublishService } from './AuthorProgressPublishService';

export class AuthorProgressCampaignService {
    constructor(
        private plugin: RadialTimelinePlugin,
        private app: App,
        private renderService: AuthorProgressRenderService,
        private publishService: AuthorProgressPublishService
    ) {}

    public isStale(): boolean {
        const authorProgress = this.plugin.settings.authorProgress;
        const settings = authorProgress?.defaults;
        if (!authorProgress || !settings || !authorProgress.enabled) return false;
        if (settings.updateFrequency !== 'manual') return false;
        if (!settings.lastPublishedDate) return false;

        const last = new Date(settings.lastPublishedDate).getTime();
        const now = Date.now();
        const diffDays = (now - last) / (1000 * 60 * 60 * 24);
        return diffDays > settings.stalenessThresholdDays;
    }

    public anyCampaignNeedsRefresh(): boolean {
        const campaigns = this.plugin.settings.authorProgress?.campaigns ?? [];
        return campaigns.some(c => this.campaignNeedsRefresh(c));
    }

    public campaignNeedsRefresh(campaign: AuthorProgressCampaign): boolean {
        if (!campaign.isActive) return false;
        if (campaign.updateFrequency && campaign.updateFrequency !== 'manual') return false;
        if (!campaign.lastPublishedDate) return false;

        const last = new Date(campaign.lastPublishedDate).getTime();
        const now = Date.now();
        const diffDays = (now - last) / (1000 * 60 * 60 * 24);
        return diffDays > campaign.refreshThresholdDays;
    }

    public getCampaignsNeedingRefresh(): AuthorProgressCampaign[] {
        const campaigns = this.plugin.settings.authorProgress?.campaigns ?? [];
        return campaigns.filter(c => this.campaignNeedsRefresh(c));
    }

    public needsAnyRefresh(): boolean {
        return this.isStale() || this.anyCampaignNeedsRefresh();
    }

    public async checkAutoUpdate(): Promise<void> {
        const authorProgress = this.plugin.settings.authorProgress;
        const settings = authorProgress?.defaults;
        if (!authorProgress || !settings || !authorProgress.enabled) return;

        if (settings.updateFrequency !== 'manual') {
            const last = settings.lastPublishedDate ? new Date(settings.lastPublishedDate).getTime() : 0;
            const now = Date.now();
            const diffMs = now - last;

            let thresholdMs = 0;
            switch (settings.updateFrequency) {
                case 'daily': thresholdMs = 24 * 60 * 60 * 1000; break;
                case 'weekly': thresholdMs = 7 * 24 * 60 * 60 * 1000; break;
                case 'monthly': thresholdMs = 30 * 24 * 60 * 60 * 1000; break;
            }

            const cooldown = 5 * 60 * 1000;
            if (diffMs > thresholdMs && diffMs > cooldown) {
                try {
                    await this.publishService.generateReport('dynamic');
                    new Notice('Author Progress Report updated automatically.');
                } catch {
                    // Silent failure; user can refresh manually.
                }
            }
        }

        await this.checkCampaignAutoUpdates(authorProgress);
    }

    public async generateCampaignReport(campaignId: string, options?: { silent?: boolean }): Promise<string | null> {
        const authorProgress = this.plugin.settings.authorProgress;
        if (!authorProgress) return null;
        const result = await this.renderService.buildCampaignReport(campaignId);
        if (!result) return null;

        const { svgString, campaign, width, height } = result;
        const path = campaign.exportPath;
        const format = result.meta.format;
        await this.renderService.saveAprOutput(path, format, svgString, width, height);

        const campaignIndex = authorProgress.campaigns?.findIndex(c => c.id === campaignId);
        if (campaignIndex !== undefined && campaignIndex >= 0 && authorProgress.campaigns) {
            authorProgress.campaigns[campaignIndex].lastPublishedDate = new Date().toISOString();
            await this.plugin.saveSettings();
        }

        if (!options?.silent) {
            new Notice(`Campaign "${campaign.name}" published!\nFormat: ${format.toUpperCase()} | Size: ${result.meta.size} | Stage: ${result.meta.stage} | Progress: ${result.meta.percent.toFixed(1)}%`);
        }
        return path;
    }

    public async generateCampaignSnapshot(campaignId: string): Promise<string | null> {
        const result = await this.renderService.buildCampaignReport(campaignId);
        if (!result) return null;
        const { svgString, campaign, width, height } = result;
        const path = this.renderService.buildSnapshotPath(campaign.exportPath, campaign.name);
        await this.renderService.saveAprOutput(path, result.meta.format, svgString, width, height);
        return path;
    }

    public async publishAllStale(): Promise<number> {
        const needsRefresh = this.getCampaignsNeedingRefresh();
        let count = 0;
        for (const campaign of needsRefresh) {
            try {
                await this.generateCampaignReport(campaign.id);
                count++;
            } catch (error) {
                console.error(`Failed to publish campaign ${campaign.name}:`, error);
            }
        }

        if (count > 0) {
            new Notice(`Published ${count} campaign${count > 1 ? 's' : ''}`);
        }

        return count;
    }

    private async checkCampaignAutoUpdates(authorProgress: AuthorProgressSettings): Promise<void> {
        if (!hasProFeatureAccess(this.plugin)) return;
        const campaigns = authorProgress.campaigns ?? [];
        if (campaigns.length === 0) return;

        const cooldown = 5 * 60 * 1000;
        const now = Date.now();
        let updatedCount = 0;

        for (const campaign of campaigns) {
            if (!campaign.isActive) continue;
            const frequency = campaign.updateFrequency ?? 'manual';
            if (frequency === 'manual') continue;

            const last = campaign.lastPublishedDate ? new Date(campaign.lastPublishedDate).getTime() : 0;
            const diffMs = now - last;

            let thresholdMs = 0;
            switch (frequency) {
                case 'daily': thresholdMs = 24 * 60 * 60 * 1000; break;
                case 'weekly': thresholdMs = 7 * 24 * 60 * 60 * 1000; break;
                case 'monthly': thresholdMs = 30 * 24 * 60 * 60 * 1000; break;
            }

            if (diffMs > thresholdMs && diffMs > cooldown) {
                try {
                    await this.generateCampaignReport(campaign.id, { silent: true });
                    updatedCount++;
                } catch {
                    // Silent failure; user can publish manually.
                }
            }
        }

        if (updatedCount > 0) {
            new Notice(`Updated ${updatedCount} campaign${updatedCount > 1 ? 's' : ''} automatically.`);
        }
    }
}
