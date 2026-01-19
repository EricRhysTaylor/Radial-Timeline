/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Synopsis Quality Classification
 */

export type SynopsisQuality = 'missing' | 'weak' | 'ok';

// Common placeholder patterns users might leave
const PLACEHOLDER_PATTERNS = [
    /^add a synopsis/i,
    /^todo/i,
    /^tbd/i,
    /^synopsis/i,
    /^scene synopsis/i,
    /^insert summary/i
];

/**
 * Classify the quality of a synopsis string.
 * @param synopsis The raw synopsis text from frontmatter
 * @returns 'missing' | 'weak' | 'ok'
 */
export function classifySynopsis(synopsis: unknown): SynopsisQuality {
    if (synopsis === null || synopsis === undefined) {
        return 'missing';
    }

    const text = String(synopsis).trim();
    if (text === '') {
        return 'missing';
    }

    // Check for placeholder text
    for (const pattern of PLACEHOLDER_PATTERNS) {
        if (pattern.test(text)) {
            return 'weak';
        }
    }

    // Check word count
    const wordCount = text.split(/\s+/).length;
    if (wordCount < 20) {
        return 'weak';
    }

    return 'ok';
}
