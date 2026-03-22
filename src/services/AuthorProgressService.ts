import { App } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import type { AuthorProgressCampaign } from '../types/settings';
import type { TimelineItem } from '../types/timeline';
import { AuthorProgressRenderService } from './authorProgress/AuthorProgressRenderService';
import { AuthorProgressPublishService } from './authorProgress/AuthorProgressPublishService';
import { AuthorProgressCampaignService } from './authorProgress/AuthorProgressCampaignService';

export class AuthorProgressService {
    private readonly renderService: AuthorProgressRenderService;
    private readonly publishService: AuthorProgressPublishService;
    private readonly campaignService: AuthorProgressCampaignService;

    constructor(plugin: RadialTimelinePlugin, app: App) {
        this.renderService = new AuthorProgressRenderService(plugin, app);
        this.publishService = new AuthorProgressPublishService(plugin, app, this.renderService);
        this.campaignService = new AuthorProgressCampaignService(plugin, app, this.renderService, this.publishService);
    }

    public isStale(): boolean {
        return this.campaignService.isStale();
    }

    public anyCampaignNeedsRefresh(): boolean {
        return this.campaignService.anyCampaignNeedsRefresh();
    }

    public campaignNeedsRefresh(campaign: AuthorProgressCampaign): boolean {
        return this.campaignService.campaignNeedsRefresh(campaign);
    }

    public getCampaignsNeedingRefresh(): AuthorProgressCampaign[] {
        return this.campaignService.getCampaignsNeedingRefresh();
    }

    public needsAnyRefresh(): boolean {
        return this.campaignService.needsAnyRefresh();
    }

    public calculateProgress(scenes: TimelineItem[]): number {
        return this.renderService.calculateProgress(scenes);
    }

    public generateReport(mode?: 'static' | 'dynamic'): Promise<string | null> {
        return this.publishService.generateReport(mode);
    }

    public checkAutoUpdate(): Promise<void> {
        return this.campaignService.checkAutoUpdate();
    }

    public generateCampaignReport(campaignId: string, options?: { silent?: boolean }): Promise<string | null> {
        return this.campaignService.generateCampaignReport(campaignId, options);
    }

    public generateCampaignSnapshot(campaignId: string): Promise<string | null> {
        return this.campaignService.generateCampaignSnapshot(campaignId);
    }

    public publishAllStale(): Promise<number> {
        return this.campaignService.publishAllStale();
    }
}
