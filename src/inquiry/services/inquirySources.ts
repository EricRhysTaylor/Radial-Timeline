/**
 * Sources ViewModel builder for Inquiry results.
 *
 * Transforms raw InquiryCitation[] + EvidenceDocumentMeta[] into a UI-ready
 * data structure for rendering the author-facing "Sources" block.
 *
 * Product rule: the output is author-centric. No document_index, char offsets,
 * or provider API terminology — just scene titles, short excerpts, and paths.
 */
import type { EvidenceDocumentMeta, InquiryCitation } from '../state';

// ── Types ──────────────────────────────────────────────────────────────────

export interface InquirySourceItem {
    /** Display title (e.g. "The Departure"). */
    title: string;
    /** Short excerpt from cited text (1–2 lines, truncated). */
    excerpt: string;
    /** Vault-relative file path for "Open scene" navigation. */
    path?: string;
    /** Scene ID, if a scene document. */
    sceneId?: string;
    /** Display label for evidence class (e.g. "Scene", "Outline"). */
    classLabel: string;
    /** Number of citations referencing this document. */
    citationCount: number;
}

export interface InquirySourcesViewModel {
    /** Source items, deduplicated by document and ordered by citation count descending. */
    items: InquirySourceItem[];
    /** Total number of source documents referenced. */
    totalCount: number;
    /** Number to show initially (max 2). */
    initialCount: number;
    /** Whether the Sources block should render at all. */
    hasContent: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────

const MAX_EXCERPT_LENGTH = 120;
const INITIAL_SHOW_COUNT = 2;

// ── Builder ────────────────────────────────────────────────────────────────

/**
 * Build a Sources ViewModel from Inquiry citations and evidence metadata.
 *
 * Returns `{ hasContent: false }` when there is nothing to render (no citations,
 * no metadata, or no resolvable documents).
 */
export function buildInquirySourcesViewModel(
    citations: InquiryCitation[] | undefined,
    evidenceDocumentMeta: EvidenceDocumentMeta[] | undefined
): InquirySourcesViewModel {
    const empty: InquirySourcesViewModel = {
        items: [],
        totalCount: 0,
        initialCount: 0,
        hasContent: false
    };

    if (!citations?.length || !evidenceDocumentMeta?.length) return empty;

    // Group citations by documentIndex.
    const byIndex = new Map<number, InquiryCitation[]>();
    for (const c of citations) {
        if (c.documentIndex < 0 || c.documentIndex >= evidenceDocumentMeta.length) continue;
        const existing = byIndex.get(c.documentIndex) ?? [];
        existing.push(c);
        byIndex.set(c.documentIndex, existing);
    }

    // Build source items from grouped citations.
    const items: InquirySourceItem[] = [];
    for (const [docIndex, docCitations] of byIndex) {
        const meta = evidenceDocumentMeta[docIndex];
        if (!meta) continue;

        // Pick the best excerpt: longest cited text from this document.
        const bestCitation = docCitations
            .filter(c => c.citedText?.trim())
            .sort((a, b) => (b.citedText?.length ?? 0) - (a.citedText?.length ?? 0))[0];
        const rawExcerpt = bestCitation?.citedText ?? '';
        const excerpt = truncateExcerpt(rawExcerpt, MAX_EXCERPT_LENGTH);

        items.push({
            title: meta.title,
            excerpt,
            path: meta.path,
            sceneId: meta.sceneId,
            classLabel: formatEvidenceClassLabel(meta.evidenceClass),
            citationCount: docCitations.length
        });
    }

    // Sort: most-cited first, then alphabetically by title.
    items.sort((a, b) => b.citationCount - a.citationCount || a.title.localeCompare(b.title));

    return {
        items,
        totalCount: items.length,
        initialCount: Math.min(INITIAL_SHOW_COUNT, items.length),
        hasContent: items.length > 0
    };
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Truncate excerpt to maxLength, breaking at a word boundary, and append ellipsis. */
function truncateExcerpt(text: string, maxLength: number): string {
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= maxLength) return cleaned;
    const truncated = cleaned.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    return (lastSpace > maxLength * 0.6 ? truncated.substring(0, lastSpace) : truncated) + '\u2026';
}

/** Capitalize evidence class for display (e.g. "scene" → "Scene"). */
function formatEvidenceClassLabel(evidenceClass: string): string {
    if (!evidenceClass) return 'Reference';
    // Already formatted classes (from formatClassLabel in runner) pass through cleanly.
    if (evidenceClass.charAt(0) === evidenceClass.charAt(0).toUpperCase()) return evidenceClass;
    return evidenceClass
        .replace(/[_-]+/g, ' ')
        .trim()
        .split(/\s+/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}
