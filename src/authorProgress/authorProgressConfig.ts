import {
    buildCampaignEmbedPath,
    buildDefaultEmbedPath,
    normalizeAprExportFormat
} from '../utils/aprPaths';
import type {
    AuthorProgressCampaign,
    AuthorProgressDefaults,
    AuthorProgressFrequency,
    AuthorProgressPublishTarget,
    AuthorProgressSettings,
    TeaserRevealSettings
} from '../types/settings';

const AUTHOR_PROGRESS_FREQUENCIES = new Set<AuthorProgressFrequency>(['manual', 'daily', 'weekly', 'monthly']);
const AUTHOR_PROGRESS_PUBLISH_TARGETS = new Set<AuthorProgressPublishTarget>(['folder', 'github_pages', 'note']);

type LegacyAuthorProgressSettings = Record<string, unknown>;

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeFrequency(value: unknown, fallback: AuthorProgressFrequency): AuthorProgressFrequency {
    return typeof value === 'string' && AUTHOR_PROGRESS_FREQUENCIES.has(value as AuthorProgressFrequency)
        ? value as AuthorProgressFrequency
        : fallback;
}

function normalizePublishTarget(value: unknown, fallback: AuthorProgressPublishTarget): AuthorProgressPublishTarget {
    return typeof value === 'string' && AUTHOR_PROGRESS_PUBLISH_TARGETS.has(value as AuthorProgressPublishTarget)
        ? value as AuthorProgressPublishTarget
        : fallback;
}

function normalizeAprSize(value: unknown, fallback: AuthorProgressDefaults['aprSize']): AuthorProgressDefaults['aprSize'] {
    return value === 'thumb' || value === 'small' || value === 'medium' || value === 'large' ? value : fallback;
}

function normalizeTeaserReveal(value: unknown): TeaserRevealSettings | undefined {
    const record = asRecord(value);
    if (!record) return undefined;
    const customThresholds = asRecord(record.customThresholds);
    const disabledStages = asRecord(record.disabledStages);
    return {
        enabled: asBoolean(record.enabled, false),
        preset: record.preset === 'slow' || record.preset === 'fast' || record.preset === 'custom' ? record.preset : 'standard',
        customThresholds: customThresholds ? {
            scenes: asNumber(customThresholds.scenes, 10),
            colors: asNumber(customThresholds.colors, 30),
            full: asNumber(customThresholds.full, 60)
        } : undefined,
        disabledStages: disabledStages ? {
            scenes: asBoolean(disabledStages.scenes, false) || undefined,
            colors: asBoolean(disabledStages.colors, false) || undefined
        } : undefined
    };
}

export function buildDefaultAuthorProgressDefaults(): AuthorProgressDefaults {
    return {
        noteBehavior: 'preset',
        publishTarget: 'folder',
        showSubplots: true,
        showActs: true,
        showStatus: true,
        showProgressPercent: true,
        aprProgressMode: 'zero',
        aprProgressDateStart: undefined,
        aprProgressDateTarget: undefined,
        aprSize: 'medium',
        exportFormat: 'png',
        aprBackgroundColor: '#0d0d0f',
        aprCenterTransparent: true,
        aprBookAuthorColor: '#6FB971',
        aprAuthorColor: '#6FB971',
        aprEngineColor: '#e5e5e5',
        aprPercentNumberColor: '#6FB971',
        aprPercentSymbolColor: '#6FB971',
        aprTheme: 'dark',
        aprSpokeColorMode: 'dark',
        aprSpokeColor: '#ffffff',
        aprBookTitleFontFamily: 'Inter',
        aprBookTitleFontWeight: 400,
        aprBookTitleFontItalic: false,
        aprBookTitleFontSize: undefined,
        aprAuthorNameFontFamily: 'Inter',
        aprAuthorNameFontWeight: 400,
        aprAuthorNameFontItalic: false,
        aprAuthorNameFontSize: undefined,
        aprPercentNumberFontSize1Digit: undefined,
        aprPercentNumberFontSize2Digit: undefined,
        aprPercentNumberFontSize3Digit: undefined,
        aprRtBadgeFontFamily: 'Inter',
        aprRtBadgeFontWeight: 700,
        aprRtBadgeFontItalic: false,
        aprRtBadgeFontSize: undefined,
        aprShowRtAttribution: true,
        authorUrl: '',
        lastPublishedDate: undefined,
        updateFrequency: 'manual',
        stalenessThresholdDays: 30,
        enableReminders: true,
        exportPath: '',
        autoUpdateExportPath: true
    };
}

export function buildDefaultAuthorProgressSettings(): AuthorProgressSettings {
    return {
        enabled: false,
        defaults: buildDefaultAuthorProgressDefaults(),
        campaigns: []
    };
}

function migrateDefaults(raw: LegacyAuthorProgressSettings | null): AuthorProgressDefaults {
    const defaults = buildDefaultAuthorProgressDefaults();
    if (!raw) return defaults;

    const noteBehavior = raw.noteBehavior === 'custom' || raw.defaultNoteBehavior === 'custom' ? 'custom' : 'preset';
    const updateFrequency = normalizeFrequency(raw.updateFrequency, defaults.updateFrequency);
    const aprSize = normalizeAprSize(raw.aprSize, defaults.aprSize);
    const exportFormat = normalizeAprExportFormat(raw.exportFormat);

    return {
        ...defaults,
        noteBehavior,
        publishTarget: normalizePublishTarget(raw.publishTarget ?? raw.defaultPublishTarget, defaults.publishTarget),
        customNoteTemplatePath: asString(raw.customNoteTemplatePath),
        showSubplots: asBoolean(raw.showSubplots, defaults.showSubplots),
        showActs: asBoolean(raw.showActs, defaults.showActs),
        showStatus: asBoolean(raw.showStatus, defaults.showStatus),
        showProgressPercent: asBoolean(raw.showProgressPercent, defaults.showProgressPercent ?? true),
        aprProgressMode: raw.aprProgressMode === 'date' || raw.aprProgressMode === 'stage' ? raw.aprProgressMode : defaults.aprProgressMode,
        aprProgressDateStart: asString(raw.aprProgressDateStart),
        aprProgressDateTarget: asString(raw.aprProgressDateTarget),
        aprSize,
        exportFormat,
        aprBackgroundColor: asString(raw.aprBackgroundColor) ?? defaults.aprBackgroundColor,
        aprCenterTransparent: asBoolean(raw.aprCenterTransparent, defaults.aprCenterTransparent ?? true),
        aprBookAuthorColor: asString(raw.aprBookAuthorColor) ?? defaults.aprBookAuthorColor,
        aprAuthorColor: asString(raw.aprAuthorColor) ?? defaults.aprAuthorColor,
        aprEngineColor: asString(raw.aprEngineColor) ?? defaults.aprEngineColor,
        aprPercentNumberColor: asString(raw.aprPercentNumberColor) ?? defaults.aprPercentNumberColor,
        aprPercentSymbolColor: asString(raw.aprPercentSymbolColor) ?? defaults.aprPercentSymbolColor,
        aprTheme: raw.aprTheme === 'light' || raw.aprTheme === 'none' ? raw.aprTheme : defaults.aprTheme,
        aprSpokeColorMode: raw.aprSpokeColorMode === 'light' || raw.aprSpokeColorMode === 'none' || raw.aprSpokeColorMode === 'custom'
            ? raw.aprSpokeColorMode
            : defaults.aprSpokeColorMode,
        aprSpokeColor: asString(raw.aprSpokeColor) ?? defaults.aprSpokeColor,
        aprBookTitleFontFamily: asString(raw.aprBookTitleFontFamily) ?? defaults.aprBookTitleFontFamily,
        aprBookTitleFontWeight: asNumber(raw.aprBookTitleFontWeight, defaults.aprBookTitleFontWeight ?? 400),
        aprBookTitleFontItalic: asBoolean(raw.aprBookTitleFontItalic, defaults.aprBookTitleFontItalic ?? false),
        aprBookTitleFontSize: typeof raw.aprBookTitleFontSize === 'number' ? raw.aprBookTitleFontSize : undefined,
        aprAuthorNameFontFamily: asString(raw.aprAuthorNameFontFamily) ?? defaults.aprAuthorNameFontFamily,
        aprAuthorNameFontWeight: asNumber(raw.aprAuthorNameFontWeight, defaults.aprAuthorNameFontWeight ?? 400),
        aprAuthorNameFontItalic: asBoolean(raw.aprAuthorNameFontItalic, defaults.aprAuthorNameFontItalic ?? false),
        aprAuthorNameFontSize: typeof raw.aprAuthorNameFontSize === 'number' ? raw.aprAuthorNameFontSize : undefined,
        aprPercentNumberFontSize1Digit: typeof raw.aprPercentNumberFontSize1Digit === 'number' ? raw.aprPercentNumberFontSize1Digit : undefined,
        aprPercentNumberFontSize2Digit: typeof raw.aprPercentNumberFontSize2Digit === 'number' ? raw.aprPercentNumberFontSize2Digit : undefined,
        aprPercentNumberFontSize3Digit: typeof raw.aprPercentNumberFontSize3Digit === 'number' ? raw.aprPercentNumberFontSize3Digit : undefined,
        aprRtBadgeFontFamily: asString(raw.aprRtBadgeFontFamily) ?? defaults.aprRtBadgeFontFamily,
        aprRtBadgeFontWeight: asNumber(raw.aprRtBadgeFontWeight, defaults.aprRtBadgeFontWeight ?? 700),
        aprRtBadgeFontItalic: asBoolean(raw.aprRtBadgeFontItalic, defaults.aprRtBadgeFontItalic ?? false),
        aprRtBadgeFontSize: typeof raw.aprRtBadgeFontSize === 'number' ? raw.aprRtBadgeFontSize : undefined,
        aprShowRtAttribution: asBoolean(raw.aprShowRtAttribution, defaults.aprShowRtAttribution ?? true),
        bookTitleOverride: asString(raw.bookTitleOverride ?? raw.bookTitle),
        authorName: asString(raw.authorName),
        authorUrl: asString(raw.authorUrl) ?? defaults.authorUrl,
        projectPathOverride: asString(raw.projectPathOverride ?? raw.socialProjectPath),
        lastPublishedDate: asString(raw.lastPublishedDate),
        updateFrequency,
        stalenessThresholdDays: asNumber(raw.stalenessThresholdDays, defaults.stalenessThresholdDays),
        enableReminders: asBoolean(raw.enableReminders, defaults.enableReminders),
        exportPath: asString(raw.exportPath ?? raw.dynamicEmbedPath) ?? buildDefaultEmbedPath({
            bookTitle: asString(raw.bookTitleOverride ?? raw.bookTitle),
            updateFrequency,
            aprExportQuality: asString(raw.aprExportQuality) as any,
            exportFormat
        }),
        autoUpdateExportPath: asBoolean(raw.autoUpdateExportPath ?? raw.autoUpdateEmbedPaths, defaults.autoUpdateExportPath ?? true)
    };
}

function migrateCampaign(raw: unknown, defaults: AuthorProgressDefaults): AuthorProgressCampaign | null {
    const record = asRecord(raw);
    if (!record) return null;
    const name = asString(record.name);
    const id = asString(record.id);
    if (!name || !id) return null;

    const updateFrequency = normalizeFrequency(record.updateFrequency, defaults.updateFrequency);
    const aprSize = normalizeAprSize(record.aprSize, defaults.aprSize);
    const exportFormat = normalizeAprExportFormat(record.exportFormat);
    const teaserReveal = normalizeTeaserReveal(record.teaserReveal);

    return {
        id,
        name,
        description: asString(record.description),
        isActive: asBoolean(record.isActive, true),
        updateFrequency,
        refreshThresholdDays: asNumber(record.refreshThresholdDays, defaults.stalenessThresholdDays),
        lastPublishedDate: asString(record.lastPublishedDate),
        exportPath: asString(record.exportPath ?? record.embedPath) ?? buildCampaignEmbedPath({
            bookTitle: asString(record.bookTitleOverride ?? record.bookTitle) ?? defaults.bookTitleOverride,
            campaignName: name,
            updateFrequency,
            aprExportQuality: asString(record.aprExportQuality) as any,
            teaserEnabled: teaserReveal?.enabled,
            exportFormat
        }),
        exportFormat,
        projectPathOverride: asString(record.projectPathOverride ?? record.projectPath),
        bookTitleOverride: asString(record.bookTitleOverride ?? record.bookTitle),
        aprSize,
        customBackgroundColor: asString(record.customBackgroundColor),
        customTransparent: typeof record.customTransparent === 'boolean' ? record.customTransparent : undefined,
        customTheme: record.customTheme === 'light' || record.customTheme === 'dark' ? record.customTheme : undefined,
        teaserReveal
    };
}

export function migrateAuthorProgressSettings(raw: unknown): AuthorProgressSettings {
    const record = asRecord(raw);
    if (!record) {
        return buildDefaultAuthorProgressSettings();
    }

    const defaults = migrateDefaults(asRecord(record.defaults) ?? record);
    const campaigns = Array.isArray(record.campaigns)
        ? record.campaigns
            .map((campaign) => migrateCampaign(campaign, defaults))
            .filter((campaign): campaign is AuthorProgressCampaign => campaign !== null)
        : [];

    return {
        enabled: asBoolean(record.enabled, false),
        defaults,
        campaigns
    };
}

export function getAuthorProgressDefaults(authorProgress?: AuthorProgressSettings): AuthorProgressDefaults | undefined {
    return authorProgress?.defaults;
}

export function getAuthorProgressCampaigns(authorProgress?: AuthorProgressSettings): AuthorProgressCampaign[] {
    return authorProgress?.campaigns ?? [];
}
