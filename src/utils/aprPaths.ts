export type AprSize = 'thumb' | 'small' | 'medium' | 'large';
export type AprFrequency = 'manual' | 'daily' | 'weekly' | 'monthly';

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

export function buildDefaultEmbedPath(options: {
    bookTitle?: string;
    updateFrequency?: AprFrequency;
    aprSize?: AprSize;
}): string {
    const bookSlug = slugify(options.bookTitle, 'book');
    const mode = formatAprMode(options.updateFrequency);
    const size = resolveAprSize(options.aprSize);
    return `Radial Timeline/Social/${bookSlug}/apr-${bookSlug}-default-${mode}-${size}.svg`;
}

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
    return `Radial Timeline/Social/${bookSlug}/campaigns/apr-${bookSlug}-${campaignSlug}-${mode}-${size}${teaserSuffix}.svg`;
}
