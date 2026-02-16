export type SynopsisLimitSettings = {
    synopsisGenerationMaxWords?: number;
    synopsisGenerationMaxLines?: number; // @deprecated legacy fallback
};

export const DEFAULT_SYNOPSIS_MAX_WORDS = 30;

export function getSynopsisGenerationWordLimit(settings: SynopsisLimitSettings): number {
    const raw = settings.synopsisGenerationMaxWords
        ?? ((settings.synopsisGenerationMaxLines ?? 3) * 10);
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return DEFAULT_SYNOPSIS_MAX_WORDS;
    return Math.max(10, Math.min(300, Math.round(parsed)));
}

export function getSynopsisHoverLineLimit(settings: SynopsisLimitSettings): number {
    // Keep hover compact while scaling with configured synopsis cap.
    const words = getSynopsisGenerationWordLimit(settings);
    return Math.max(3, Math.min(12, Math.ceil(words / 8) + 1));
}

export function truncateToWordLimit(text: string, maxWords: number): string {
    const normalized = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    const safeLimit = Math.max(1, Math.floor(maxWords));
    const words = normalized.split(' ');
    if (words.length <= safeLimit) return normalized;
    return `${words.slice(0, safeLimit).join(' ')}...`;
}
