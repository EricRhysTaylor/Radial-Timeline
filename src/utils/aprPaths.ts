export type AprSize = 'thumb' | 'small' | 'medium' | 'large';
export type AprFrequency = 'manual' | 'daily' | 'weekly' | 'monthly';
export type AprExportFormat = 'png' | 'svg';

/**
 * APR Path Schema (LOCKED - do not modify without migration plan)
 * ═══════════════════════════════════════════════════════════════
 * Book scoping is handled ONLY in the folder path, never in the filename.
 *
 * Folder structure:
 *   Default/Core:  Radial Timeline/Social/{bookSlug}/
 *   Campaigns:     Radial Timeline/Social/{bookSlug}/campaigns/
 *
 * Filename schema (frozen token order):
 *   apr-{campaignSlug}-{mode}-{size}{-teaser}.{format}
 *
 * Where:
 *   {campaignSlug} = slugified campaign name (use "default" for core report)
 *   {mode}         = manual | auto-daily | auto-weekly | auto-monthly
 *   {size}         = thumb | small | medium | large
 *   {-teaser}      = suffix only if teaser enabled
 *   {format}       = png | svg
 *
 * Examples:
 *   Core:     Radial Timeline/Social/my-novel/apr-default-manual-large.png
 *   Campaign: Radial Timeline/Social/my-novel/campaigns/apr-kickstarter-auto-weekly-large-teaser.png
 */

export function slugify(value: string | undefined, fallback: string): string {
    const cleaned = (value ?? '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return cleaned || fallback;
}

function formatAprMode(updateFrequency?: AprFrequency): string {
    if (!updateFrequency || updateFrequency === 'manual') return 'manual';
    return `auto-${updateFrequency}`;
}

function resolveAprSize(primary?: AprSize, fallback?: AprSize): AprSize {
    return primary ?? fallback ?? 'medium';
}

const EXPORT_FORMATS: AprExportFormat[] = ['png', 'svg'];

export function normalizeAprExportFormat(value: unknown): AprExportFormat {
    if (typeof value !== 'string') return 'png';
    const normalized = value.toLowerCase();
    return EXPORT_FORMATS.includes(normalized as AprExportFormat) ? normalized as AprExportFormat : 'png';
}

const DEFAULT_SIZES: AprSize[] = ['thumb', 'small', 'medium', 'large'];

/**
 * Returns true if the path is a default/core APR path for the given book and mode (any size).
 * Matches current format (apr-default-{mode}-{size}.svg) and legacy format (apr-{bookSlug}-default-{mode}-{size}.svg).
 */
export function isDefaultEmbedPath(path: string | undefined, options: { bookTitle?: string; updateFrequency?: AprFrequency }): boolean {
    if (!path?.trim()) return false;
    const bookSlug = slugify(options.bookTitle, 'book');
    const mode = formatAprMode(options.updateFrequency);
    const prefix = `Radial Timeline/Social/${bookSlug}/`;
    if (!path.startsWith(prefix)) return false;
    const filename = path.slice(prefix.length);
    for (const size of DEFAULT_SIZES) {
        for (const format of EXPORT_FORMATS) {
            if (filename === `apr-default-${mode}-${size}.${format}`) return true;
            if (filename === `apr-${bookSlug}-default-${mode}-${size}.${format}`) return true;
        }
    }
    return false;
}

/**
 * Builds the embed path for the default/core APR report.
 * Book title scopes the folder; filename uses "default" as campaignSlug.
 */
export function buildDefaultEmbedPath(options: {
    bookTitle?: string;
    updateFrequency?: AprFrequency;
    aprSize?: AprSize;
    exportFormat?: AprExportFormat;
}): string {
    const bookSlug = slugify(options.bookTitle, 'book');
    const mode = formatAprMode(options.updateFrequency);
    const size = resolveAprSize(options.aprSize);
    const format = normalizeAprExportFormat(options.exportFormat);
    // Filename: apr-default-{mode}-{size}.{format} (no bookSlug in filename)
    return `Radial Timeline/Social/${bookSlug}/apr-default-${mode}-${size}.${format}`;
}

/**
 * Builds the embed path for a campaign APR report.
 * Book title scopes the folder; campaignSlug identifies the campaign in filename.
 */
export function buildCampaignEmbedPath(options: {
    bookTitle?: string;
    campaignName: string;
    updateFrequency?: AprFrequency;
    aprSize?: AprSize;
    fallbackSize?: AprSize;
    teaserEnabled?: boolean;
    exportFormat?: AprExportFormat;
}): string {
    const bookSlug = slugify(options.bookTitle, 'book');
    const campaignSlug = slugify(options.campaignName, 'campaign');
    const mode = formatAprMode(options.updateFrequency);
    const size = resolveAprSize(options.aprSize, options.fallbackSize);
    const teaserSuffix = options.teaserEnabled ? '-teaser' : '';
    const format = normalizeAprExportFormat(options.exportFormat);
    // Filename: apr-{campaignSlug}-{mode}-{size}{-teaser}.{format} (no bookSlug in filename)
    return `Radial Timeline/Social/${bookSlug}/campaigns/apr-${campaignSlug}-${mode}-${size}${teaserSuffix}.${format}`;
}
