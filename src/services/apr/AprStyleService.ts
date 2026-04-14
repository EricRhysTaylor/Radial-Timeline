import type RadialTimelinePlugin from '../../main';
import {
    buildDefaultAuthorProgressDefaults,
    buildDefaultAuthorProgressSettings,
} from '../../authorProgress/authorProgressConfig';
import type {
    AuthorProgressCampaign,
    AuthorProgressDefaults,
    AprStyleProfile,
    AprStyleSettings,
} from '../../types/settings';
import type { AprRenderOptions } from '../../renderer/apr/AprRenderer';

type AprRenderStyleOptions = Pick<
    AprRenderOptions,
    | 'backgroundColor'
    | 'transparentCenter'
    | 'bookAuthorColor'
    | 'authorColor'
    | 'engineColor'
    | 'percentNumberColor'
    | 'percentSymbolColor'
    | 'theme'
    | 'spokeColor'
    | 'showRtAttribution'
    | 'bookTitleFontFamily'
    | 'bookTitleFontWeight'
    | 'bookTitleFontItalic'
    | 'bookTitleFontSize'
    | 'authorNameFontFamily'
    | 'authorNameFontWeight'
    | 'authorNameFontItalic'
    | 'authorNameFontSize'
    | 'percentNumberFontSize1Digit'
    | 'percentNumberFontSize2Digit'
    | 'percentNumberFontSize3Digit'
    | 'rtBadgeFontFamily'
    | 'rtBadgeFontWeight'
    | 'rtBadgeFontItalic'
    | 'rtBadgeFontSize'
>;

function sanitizeName(name: string): string {
    return name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'style';
}

export class AprStyleService {
    constructor(private plugin: RadialTimelinePlugin) {}

    public getDefaults(): AuthorProgressDefaults {
        return this.plugin.settings.authorProgress?.defaults ?? buildDefaultAuthorProgressDefaults();
    }

    public getProfiles(): AprStyleProfile[] {
        return this.plugin.settings.authorProgress?.styleProfiles ?? [];
    }

    public findProfileByName(name: string): AprStyleProfile | undefined {
        const normalized = name.trim().toLowerCase();
        if (!normalized) return undefined;
        return this.getProfiles().find(profile => profile.name.trim().toLowerCase() === normalized);
    }

    public captureCurrentStyle(defaults: AuthorProgressDefaults = this.getDefaults()): AprStyleSettings {
        return {
            aprBackgroundColor: defaults.aprBackgroundColor,
            aprCenterTransparent: defaults.aprCenterTransparent,
            aprBookAuthorColor: defaults.aprBookAuthorColor,
            aprAuthorColor: defaults.aprAuthorColor,
            aprEngineColor: defaults.aprEngineColor,
            aprPercentNumberColor: defaults.aprPercentNumberColor,
            aprPercentSymbolColor: defaults.aprPercentSymbolColor,
            aprTheme: defaults.aprTheme,
            aprSpokeColorMode: defaults.aprSpokeColorMode,
            aprSpokeColor: defaults.aprSpokeColor,
            aprBookTitleFontFamily: defaults.aprBookTitleFontFamily,
            aprBookTitleFontWeight: defaults.aprBookTitleFontWeight,
            aprBookTitleFontItalic: defaults.aprBookTitleFontItalic,
            aprBookTitleFontSize: defaults.aprBookTitleFontSize,
            aprAuthorNameFontFamily: defaults.aprAuthorNameFontFamily,
            aprAuthorNameFontWeight: defaults.aprAuthorNameFontWeight,
            aprAuthorNameFontItalic: defaults.aprAuthorNameFontItalic,
            aprAuthorNameFontSize: defaults.aprAuthorNameFontSize,
            aprPercentNumberFontSize1Digit: defaults.aprPercentNumberFontSize1Digit,
            aprPercentNumberFontSize2Digit: defaults.aprPercentNumberFontSize2Digit,
            aprPercentNumberFontSize3Digit: defaults.aprPercentNumberFontSize3Digit,
            aprRtBadgeFontFamily: defaults.aprRtBadgeFontFamily,
            aprRtBadgeFontWeight: defaults.aprRtBadgeFontWeight,
            aprRtBadgeFontItalic: defaults.aprRtBadgeFontItalic,
            aprRtBadgeFontSize: defaults.aprRtBadgeFontSize,
            aprShowRtAttribution: defaults.aprShowRtAttribution,
        };
    }

    public resolveStyle(campaign?: AuthorProgressCampaign): AprStyleSettings {
        const defaults = this.getDefaults();
        if (campaign?.styleSource === 'profile' && campaign.styleProfileId) {
            const profile = this.getProfiles().find(entry => entry.id === campaign.styleProfileId);
            if (profile) return { ...profile.style };
        }
        return this.captureCurrentStyle(defaults);
    }

    public resolveStyleProfile(campaign?: AuthorProgressCampaign): AprStyleProfile | undefined {
        if (campaign?.styleSource !== 'profile' || !campaign.styleProfileId) return undefined;
        return this.getProfiles().find(entry => entry.id === campaign.styleProfileId);
    }

    public createStyleProfile(name: string, defaults: AuthorProgressDefaults = this.getDefaults()): AprStyleProfile {
        const timestamp = Date.now();
        return {
            id: `apr-style-${sanitizeName(name)}-${timestamp}`,
            name: name.trim(),
            createdAt: new Date(timestamp).toISOString(),
            style: this.captureCurrentStyle(defaults)
        };
    }

    public ensureAuthorProgressSettings(): NonNullable<RadialTimelinePlugin['settings']['authorProgress']> {
        if (!this.plugin.settings.authorProgress) {
            this.plugin.settings.authorProgress = buildDefaultAuthorProgressSettings();
        }
        if (!this.plugin.settings.authorProgress.styleProfiles) {
            this.plugin.settings.authorProgress.styleProfiles = [];
        }
        return this.plugin.settings.authorProgress;
    }

    public saveCurrentStyleAsProfile(
        name: string,
        options?: { overwrite?: boolean }
    ): { profile: AprStyleProfile; overwritten: boolean } {
        const authorProgress = this.ensureAuthorProgressSettings();
        const nextName = name.trim();
        const existingProfile = this.findProfileByName(nextName);
        if (existingProfile) {
            if (!options?.overwrite) {
                return { profile: existingProfile, overwritten: false };
            }
            existingProfile.name = nextName;
            existingProfile.style = this.captureCurrentStyle(authorProgress.defaults);
            return { profile: existingProfile, overwritten: true };
        }

        const profile = this.createStyleProfile(nextName, authorProgress.defaults);
        authorProgress.styleProfiles?.push(profile);
        return { profile, overwritten: false };
    }

    public deleteProfile(profileId: string): AprStyleProfile | undefined {
        const authorProgress = this.ensureAuthorProgressSettings();
        const profiles = authorProgress.styleProfiles ?? [];
        const index = profiles.findIndex(profile => profile.id === profileId);
        if (index === -1) return undefined;

        const [deletedProfile] = profiles.splice(index, 1);
        for (const campaign of authorProgress.campaigns ?? []) {
            if (campaign.styleProfileId === profileId) {
                campaign.styleSource = 'global';
                campaign.styleProfileId = undefined;
            }
        }
        return deletedProfile;
    }

    public buildRenderStyle(style: AprStyleSettings): AprRenderStyleOptions {
        const fallbackColor = this.plugin.settings.publishStageColors?.Press;
        const backgroundColor = style.aprBackgroundColor;
        return {
            backgroundColor,
            transparentCenter: style.aprCenterTransparent,
            bookAuthorColor: style.aprBookAuthorColor ?? fallbackColor,
            authorColor: style.aprAuthorColor ?? style.aprBookAuthorColor ?? fallbackColor,
            engineColor: style.aprEngineColor,
            percentNumberColor: style.aprPercentNumberColor ?? style.aprBookAuthorColor ?? fallbackColor,
            percentSymbolColor: style.aprPercentSymbolColor ?? style.aprBookAuthorColor ?? fallbackColor,
            theme: style.aprTheme ?? 'dark',
            spokeColor: style.aprSpokeColorMode === 'custom'
                ? style.aprSpokeColor
                : style.aprSpokeColorMode === 'sync'
                    ? backgroundColor
                    : undefined,
            showRtAttribution: style.aprShowRtAttribution,
            bookTitleFontFamily: style.aprBookTitleFontFamily,
            bookTitleFontWeight: style.aprBookTitleFontWeight,
            bookTitleFontItalic: style.aprBookTitleFontItalic,
            bookTitleFontSize: style.aprBookTitleFontSize,
            authorNameFontFamily: style.aprAuthorNameFontFamily,
            authorNameFontWeight: style.aprAuthorNameFontWeight,
            authorNameFontItalic: style.aprAuthorNameFontItalic,
            authorNameFontSize: style.aprAuthorNameFontSize,
            percentNumberFontSize1Digit: style.aprPercentNumberFontSize1Digit,
            percentNumberFontSize2Digit: style.aprPercentNumberFontSize2Digit,
            percentNumberFontSize3Digit: style.aprPercentNumberFontSize3Digit,
            rtBadgeFontFamily: style.aprRtBadgeFontFamily,
            rtBadgeFontWeight: style.aprRtBadgeFontWeight,
            rtBadgeFontItalic: style.aprRtBadgeFontItalic,
            rtBadgeFontSize: style.aprRtBadgeFontSize,
        };
    }
}
