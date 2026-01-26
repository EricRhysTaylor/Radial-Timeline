import { App, Notice, TFolder } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { TimelineItem } from '../types/timeline';
import { createAprSVG } from '../renderer/apr/AprRenderer';
import { getAllScenes } from '../utils/manuscript';
import type { AprCampaign, AuthorProgressSettings } from '../types/settings';
import { getTeaserThresholds, getTeaserRevealLevel, teaserLevelToRevealOptions } from '../renderer/apr/AprConstants';
import { isProfessionalActive } from '../settings/sections/ProfessionalSection';

export class AuthorProgressService {
    constructor(private plugin: RadialTimelinePlugin, private app: App) { }

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
        // Use TimelineMetricsService for consistency with Settings "Completion Estimate" (e.g. 8/49 -> 16%)
        // This replaces the weighted stage calculation (AprConstants) which was causing discrepancies (0%)
        const estimate = this.plugin.calculateCompletionEstimate(scenes);
        if (!estimate || estimate.total === 0) return 0;

        const completed = estimate.total - estimate.remaining;
        // Clamp to 0-100 just in case
        const percent = (completed / estimate.total) * 100;
        return Math.min(100, Math.max(0, Math.round(percent)));
    }

    private resolvePublishStageLabel(scenes: TimelineItem[]): string {
        return this.plugin.calculateCompletionEstimate(scenes)?.stage ?? 'Zero';
    }

    private resolveRevealCountdown(campaign?: AprCampaign): { enabled: boolean; nextRevealAt?: number | string | Date } {
        const settings = this.plugin.settings.authorProgress as any;
        const campaignReveal = (campaign as any)?.revealCampaign;
        const revealCampaign = campaignReveal ?? settings?.revealCampaign;
        if (!revealCampaign) {
            return { enabled: false };
        }
        return {
            enabled: !!revealCampaign.enabled,
            nextRevealAt: revealCampaign.nextRevealAt ?? revealCampaign.nextRevealDate ?? revealCampaign.nextReveal
        };
    }

    /**
     * Generates and saves the APR report using the dedicated APR renderer.
     */
    public async generateReport(mode?: 'static' | 'dynamic'): Promise<string | null> {
        const settings = this.plugin.settings.authorProgress;
        if (!settings) return null;

        const scenes = await getAllScenes(this.app, this.plugin);
        const progressPercent = this.calculateProgress(scenes);
        const publishStageLabel = this.resolvePublishStageLabel(scenes);
        const { enabled: revealCampaignEnabled, nextRevealAt } = this.resolveRevealCountdown();
        const showRtAttribution = isProfessionalActive(this.plugin)
            ? settings.aprShowRtAttribution !== false
            : true;

        const size = settings.aprSize || 'medium';
        const isThumb = size === 'thumb';
        const { svgString } = createAprSVG(scenes, {
            size,
            progressPercent,
            bookTitle: settings.bookTitle || 'Working Title',
            authorName: settings.authorName || '',
            authorUrl: settings.authorUrl || '',
            showScenes: !isThumb,
            showSubplots: settings.showSubplots ?? true,
            showActs: settings.showActs ?? true,
            showStatusColors: settings.showStatus ?? true,
            showProgressPercent: isThumb ? false : (settings.showProgressPercent ?? true),
            showBranding: !isThumb,
            centerMark: 'none',
            stageColors: (this.plugin.settings as any).publishStageColors,
            actCount: this.plugin.settings.actCount || undefined,
            backgroundColor: settings.aprBackgroundColor,
            transparentCenter: settings.aprCenterTransparent,
            bookAuthorColor: settings.aprBookAuthorColor ?? (this.plugin.settings.publishStageColors?.Press),
            authorColor: settings.aprAuthorColor ?? settings.aprBookAuthorColor ?? (this.plugin.settings.publishStageColors?.Press),
            engineColor: settings.aprEngineColor,
            percentNumberColor: settings.aprPercentNumberColor ?? settings.aprBookAuthorColor ?? (this.plugin.settings.publishStageColors?.Press),
            percentSymbolColor: settings.aprPercentSymbolColor ?? settings.aprBookAuthorColor ?? (this.plugin.settings.publishStageColors?.Press),
            theme: settings.aprTheme || 'dark',
            spokeColor: settings.aprSpokeColorMode === 'custom' ? settings.aprSpokeColor : undefined,
            publishStageLabel,
            showRtAttribution,
            revealCampaignEnabled,
            nextRevealAt,
            // Typography settings
            bookTitleFontFamily: settings.aprBookTitleFontFamily,
            bookTitleFontWeight: settings.aprBookTitleFontWeight,
            bookTitleFontItalic: settings.aprBookTitleFontItalic,
            bookTitleFontSize: settings.aprBookTitleFontSize,
            authorNameFontFamily: settings.aprAuthorNameFontFamily,
            authorNameFontWeight: settings.aprAuthorNameFontWeight,
            authorNameFontItalic: settings.aprAuthorNameFontItalic,
            authorNameFontSize: settings.aprAuthorNameFontSize,
            percentNumberFontFamily: settings.aprPercentNumberFontFamily,
            percentNumberFontWeight: settings.aprPercentNumberFontWeight,
            percentNumberFontItalic: settings.aprPercentNumberFontItalic,
            percentNumberFontSize1Digit: settings.aprPercentNumberFontSize1Digit,
            percentNumberFontSize2Digit: settings.aprPercentNumberFontSize2Digit,
            percentNumberFontSize3Digit: settings.aprPercentNumberFontSize3Digit,
            percentSymbolFontFamily: settings.aprPercentSymbolFontFamily,
            percentSymbolFontWeight: settings.aprPercentSymbolFontWeight,
            percentSymbolFontItalic: settings.aprPercentSymbolFontItalic,
            rtBadgeFontFamily: settings.aprRtBadgeFontFamily,
            rtBadgeFontWeight: settings.aprRtBadgeFontWeight,
            rtBadgeFontItalic: settings.aprRtBadgeFontItalic,
            rtBadgeFontSize: settings.aprRtBadgeFontSize
        });

        let finalSvg = svgString;

        // Save logic
        if (mode === 'dynamic') {
            // Check if target is 'note' (Pro feature)
            if (settings.defaultPublishTarget === 'note') {
                if (!isProfessionalActive(this.plugin)) {
                    new Notice('Note publishing is a Pro feature. Upgrade to Pro to use this feature.');
                    return null;
                }
                return await this.createNoteWithApr(finalSvg, settings);
            }

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
            const folder = this.plugin.settings.aiOutputFolder || 'Radial Timeline/Logs';
            const path = `${folder}/${fileName}`;
            await this.ensureFolder(path);
            await this.app.vault.create(path, finalSvg);
            return path;
        }
    }

    /**
     * Create a note with embedded APR SVG (Pro feature).
     * Supports preset layout or custom template based on defaultNoteBehavior.
     */
    private async createNoteWithApr(svgString: string, settings: AuthorProgressSettings): Promise<string | null> {
        // First, save the SVG file
        const svgPath = settings.dynamicEmbedPath || 'Radial Timeline/Social/progress.svg';
        await this.ensureFolder(svgPath);
        const existingSvgFile = this.app.vault.getAbstractFileByPath(svgPath);
        if (existingSvgFile) {
            await this.app.vault.modify(existingSvgFile as any, svgString);
        } else {
            await this.app.vault.create(svgPath, svgString);
        }

        // Determine note path (same folder as SVG, different filename)
        const svgFolder = svgPath.substring(0, svgPath.lastIndexOf('/')) || 'Radial Timeline/Social';
        const svgFileName = svgPath.substring(svgPath.lastIndexOf('/') + 1);
        const noteFileName = svgFileName.replace(/\.svg$/, '.md');
        const notePath = `${svgFolder}/${noteFileName}`;

        let noteContent: string;

        if (settings.defaultNoteBehavior === 'custom' && settings.customNoteTemplatePath) {
            // Use custom template
            try {
                const templateFile = this.app.vault.getAbstractFileByPath(settings.customNoteTemplatePath);
                if (templateFile && 'path' in templateFile) {
                    const templateContent = await this.app.vault.read(templateFile as any);
                    // Replace placeholders: {{SVG_PATH}}, {{AUTHOR_COMMENT}}
                    noteContent = templateContent
                        .replace(/{{SVG_PATH}}/g, svgPath)
                        .replace(/{{AUTHOR_COMMENT}}/g, '');
                } else {
                    // Template not found, fall back to preset
                    noteContent = this.createPresetNoteContent(svgPath);
                }
            } catch (error) {
                console.warn('Failed to load custom template, using preset:', error);
                noteContent = this.createPresetNoteContent(svgPath);
            }
        } else {
            // Use preset layout
            noteContent = this.createPresetNoteContent(svgPath);
        }

        // Create or update the note
        const existingNote = this.app.vault.getAbstractFileByPath(notePath);
        if (existingNote) {
            await this.app.vault.modify(existingNote as any, noteContent);
        } else {
            await this.app.vault.create(notePath, noteContent);
        }

        // Update last published
        settings.lastPublishedDate = new Date().toISOString();
        await this.plugin.saveSettings();

        return notePath;
    }

    /**
     * Create preset note content with SVG embed and author comment placeholder.
     */
    private createPresetNoteContent(svgPath: string): string {
        const bookTitle = this.plugin.settings.authorProgress?.bookTitle || 'Working Title';
        const authorName = this.plugin.settings.authorProgress?.authorName || '';

        let content = `# ${bookTitle}${authorName ? ` by ${authorName}` : ''}\n\n`;
        content += `![Author Progress Report](${svgPath})\n\n`;
        content += `<!-- Add your author comment here -->\n`;

        return content;
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
        const result = await this.buildCampaignSvg(campaignId);
        if (!result) return null;
        const { svgString, campaign } = result;

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
        const campaignIndex = settings.campaigns?.findIndex((c: AprCampaign) => c.id === campaignId);
        if (campaignIndex !== undefined && campaignIndex >= 0 && settings.campaigns) {
            settings.campaigns[campaignIndex].lastPublishedDate = new Date().toISOString();
            await this.plugin.saveSettings();
        }

        new Notice(`Campaign "${campaign.name}" published!\nSize: ${result.meta.size} | Stage: ${result.meta.stage} | Progress: ${result.meta.percent.toFixed(1)}%`);
        return path;
    }

    /**
     * Generate a one-time snapshot for a specific campaign.
     * Saves to the Output folder using campaign-specific reveal settings.
     */
    public async generateCampaignSnapshot(campaignId: string): Promise<string | null> {
        const result = await this.buildCampaignSvg(campaignId);
        if (!result) return null;
        const { svgString, campaign } = result;
        const fileName = `apr-snapshot-${campaign.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.svg`;
        const folder = this.plugin.settings.aiOutputFolder || 'Radial Timeline/Logs';
        const path = `${folder}/${fileName}`;
        await this.ensureFolder(path);
        await this.app.vault.create(path, svgString);
        return path;
    }

    private async buildCampaignSvg(campaignId: string): Promise<{ svgString: string; campaign: AprCampaign; meta: { size: string; stage: string; percent: number } } | null> {
        const settings = this.plugin.settings.authorProgress;
        if (!settings) return null;

        const campaign = settings.campaigns?.find(c => c.id === campaignId);
        if (!campaign) {
            new Notice('Campaign not found');
            return null;
        }

        const scenes = await getAllScenes(this.app, this.plugin);
        const progressPercent = this.calculateProgress(scenes);
        const publishStageLabel = this.resolvePublishStageLabel(scenes);
        const { enabled: revealCampaignEnabled, nextRevealAt } = this.resolveRevealCountdown(campaign);
        const showRtAttribution = isProfessionalActive(this.plugin)
            ? settings.aprShowRtAttribution !== false
            : true;

        let showScenes = true;
        let showSubplots = campaign.showSubplots;
        let showActs = campaign.showActs;
        let showStatusColors = campaign.showStatus;
        let showStageColors = true;
        let grayCompletedScenes = false;
        let showProgressPercent = campaign.showProgressPercent;
        let isTeaserBar = false;
        let debugStage = 'Standard';

        if (campaign.teaserReveal?.enabled) {
            const preset = campaign.teaserReveal.preset ?? 'standard';
            const thresholds = getTeaserThresholds(preset, campaign.teaserReveal.customThresholds);
            const revealLevel = getTeaserRevealLevel(
                progressPercent,
                thresholds,
                campaign.teaserReveal.disabledStages
            );
            debugStage = revealLevel;
            const revealOptions = teaserLevelToRevealOptions(revealLevel);
            isTeaserBar = revealLevel === 'bar';

            showScenes = revealOptions.showScenes;
            showSubplots = revealOptions.showSubplots;
            showActs = revealOptions.showActs;
            showStatusColors = revealOptions.showStatusColors;
            showStageColors = revealOptions.showStageColors;
            grayCompletedScenes = revealOptions.grayCompletedScenes;
        }

        const size = campaign.aprSize || settings.aprSize || 'medium';
        const ringOnly = size === 'thumb' || isTeaserBar;
        const { svgString } = createAprSVG(scenes, {
            size,
            progressPercent,
            bookTitle: settings.bookTitle || 'Working Title',
            authorName: settings.authorName || '',
            authorUrl: settings.authorUrl || '',
            showScenes: ringOnly ? false : showScenes,
            showSubplots,
            showActs,
            showStatusColors,
            showStageColors,
            grayCompletedScenes,
            showProgressPercent: ringOnly ? false : showProgressPercent,
            showBranding: !ringOnly,
            centerMark: 'none',
            stageColors: this.plugin.settings.publishStageColors,
            actCount: this.plugin.settings.actCount || undefined,
            backgroundColor: campaign.customBackgroundColor ?? settings.aprBackgroundColor,
            transparentCenter: campaign.customTransparent ?? settings.aprCenterTransparent,
            bookAuthorColor: settings.aprBookAuthorColor ?? (this.plugin.settings.publishStageColors?.Press),
            authorColor: settings.aprAuthorColor ?? settings.aprBookAuthorColor ?? (this.plugin.settings.publishStageColors?.Press),
            engineColor: settings.aprEngineColor,
            percentNumberColor: settings.aprPercentNumberColor ?? settings.aprBookAuthorColor ?? (this.plugin.settings.publishStageColors?.Press),
            percentSymbolColor: settings.aprPercentSymbolColor ?? settings.aprBookAuthorColor ?? (this.plugin.settings.publishStageColors?.Press),
            theme: campaign.customTheme ?? settings.aprTheme ?? 'dark',
            spokeColor: settings.aprSpokeColorMode === 'custom' ? settings.aprSpokeColor : undefined,
            publishStageLabel,
            showRtAttribution,
            revealCampaignEnabled,
            nextRevealAt,
            // Typography settings
            bookTitleFontFamily: settings.aprBookTitleFontFamily,
            bookTitleFontWeight: settings.aprBookTitleFontWeight,
            bookTitleFontItalic: settings.aprBookTitleFontItalic,
            bookTitleFontSize: settings.aprBookTitleFontSize,
            authorNameFontFamily: settings.aprAuthorNameFontFamily,
            authorNameFontWeight: settings.aprAuthorNameFontWeight,
            authorNameFontItalic: settings.aprAuthorNameFontItalic,
            authorNameFontSize: settings.aprAuthorNameFontSize,
            percentNumberFontFamily: settings.aprPercentNumberFontFamily,
            percentNumberFontWeight: settings.aprPercentNumberFontWeight,
            percentNumberFontItalic: settings.aprPercentNumberFontItalic,
            percentNumberFontSize1Digit: settings.aprPercentNumberFontSize1Digit,
            percentNumberFontSize2Digit: settings.aprPercentNumberFontSize2Digit,
            percentNumberFontSize3Digit: settings.aprPercentNumberFontSize3Digit,
            percentSymbolFontFamily: settings.aprPercentSymbolFontFamily,
            percentSymbolFontWeight: settings.aprPercentSymbolFontWeight,
            percentSymbolFontItalic: settings.aprPercentSymbolFontItalic,
            rtBadgeFontFamily: settings.aprRtBadgeFontFamily,
            rtBadgeFontWeight: settings.aprRtBadgeFontWeight,
            rtBadgeFontItalic: settings.aprRtBadgeFontItalic,
            rtBadgeFontSize: settings.aprRtBadgeFontSize,
            debugLabel: `Size: ${size} | Stage: ${debugStage} | ${progressPercent.toFixed(1)}%`
        });

        return {
            svgString,
            campaign,
            meta: {
                size,
                stage: debugStage,
                percent: progressPercent
            }
        };
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
