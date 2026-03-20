import type { InquiryScope } from '../state';
import type { CorpusManifestEntry } from '../runner/types';

const isInFocusedBook = (path: string, focusBookId: string): boolean =>
    path === focusBookId || path.startsWith(`${focusBookId}/`);

const dedupeEntries = (entries: CorpusManifestEntry[]): CorpusManifestEntry[] => {
    const seen = new Set<string>();
    const deduped: CorpusManifestEntry[] = [];
    entries.forEach(entry => {
        const key = [
            entry.class,
            entry.scope ?? '',
            entry.path,
            entry.sceneId ?? '',
            entry.mode
        ].join('\u0000');
        if (seen.has(key)) return;
        seen.add(key);
        deduped.push(entry);
    });
    return deduped;
};

export function scopeEntriesToActiveInquiryTarget(params: {
    entries: CorpusManifestEntry[];
    scope: InquiryScope;
    focusBookId?: string;
}): CorpusManifestEntry[] {
    const deduped = dedupeEntries(params.entries);
    if (params.scope !== 'book') return deduped;
    if (!params.focusBookId) return [];

    return deduped.filter(entry => {
        if (entry.class === 'scene') {
            return isInFocusedBook(entry.path, params.focusBookId || '');
        }
        if (entry.class === 'outline') {
            return entry.scope !== 'saga' && isInFocusedBook(entry.path, params.focusBookId || '');
        }
        return true;
    });
}

export function summarizeScopedInquiryEntries(entries: CorpusManifestEntry[]): {
    scenes: string[];
    outlines: string[];
    references: string[];
} {
    const scenes: string[] = [];
    const outlines: string[] = [];
    const references: string[] = [];

    entries.forEach(entry => {
        if (entry.class === 'scene') {
            scenes.push(entry.path);
            return;
        }
        if (entry.class === 'outline') {
            outlines.push(entry.path);
            return;
        }
        references.push(entry.path);
    });

    return { scenes, outlines, references };
}
