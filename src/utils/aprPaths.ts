export type AprSize = 'thumb' | 'small' | 'medium' | 'large';
export type AprFrequency = 'manual' | 'daily' | 'weekly' | 'monthly';

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
 *   apr-{campaignSlug}-{mode}-{size}{-teaser}.svg
 *
 * Where:
 *   {campaignSlug} = slugified campaign name (use "default" for core report)
 *   {mode}         = manual | auto-daily | auto-weekly | auto-monthly
 *   {size}         = thumb | small | medium | large
 *   {-teaser}      = suffix only if teaser enabled
 *
 * Examples:
 *   Core:     Radial Timeline/Social/my-novel/apr-default-manual-large.svg
 *   Campaign: Radial Timeline/Social/my-novel/campaigns/apr-kickstarter-auto-weekly-large-teaser.svg
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

const DEFAULT_SIZES: AprSize[] = ['thumb', 'small', 'medium', 'large'];

/**
 * Returns true if the path is a default/core APR path for the given book and mode (any size).
 * Matches current format (apr-default-{mode}-{size}.svg) and legacy format (apr-{bookSlug}-default-{mode}-{size}.svg).
 */
export function isDefaultEmbedPath(path: string | undefined, options: { bookTitle?: string; updateFrequency?: AprFrequency }): boolean {
    if (!path?.trim() || !path.toLowerCase().endsWith('.svg')) return false;
    const bookSlug = slugify(options.bookTitle, 'book');
    const mode = formatAprMode(options.updateFrequency);
    const prefix = `Radial Timeline/Social/${bookSlug}/`;
    if (!path.startsWith(prefix)) return false;
    const filename = path.slice(prefix.length);
    for (const size of DEFAULT_SIZES) {
        if (filename === `apr-default-${mode}-${size}.svg`) return true;
        if (filename === `apr-${bookSlug}-default-${mode}-${size}.svg`) return true;
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
}): string {
    const bookSlug = slugify(options.bookTitle, 'book');
    const mode = formatAprMode(options.updateFrequency);
    const size = resolveAprSize(options.aprSize);
    // Filename: apr-default-{mode}-{size}.svg (no bookSlug in filename)
    return `Radial Timeline/Social/${bookSlug}/apr-default-${mode}-${size}.svg`;
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
}): string {
    const bookSlug = slugify(options.bookTitle, 'book');
    const campaignSlug = slugify(options.campaignName, 'campaign');
    const mode = formatAprMode(options.updateFrequency);
    const size = resolveAprSize(options.aprSize, options.fallbackSize);
    const teaserSuffix = options.teaserEnabled ? '-teaser' : '';
    // Filename: apr-{campaignSlug}-{mode}-{size}{-teaser}.svg (no bookSlug in filename)
    return `Radial Timeline/Social/${bookSlug}/campaigns/apr-${campaignSlug}-${mode}-${size}${teaserSuffix}.svg`;
}
