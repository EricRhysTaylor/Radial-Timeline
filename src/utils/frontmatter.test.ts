import { describe, expect, it } from 'vitest';
import {
    extractSummary,
    getActiveFrontmatterMappings,
    getSupportedFrontmatterRemapTargets,
    normalizeBeatFrontmatterKeys,
    normalizeFrontmatterKeys,
} from './frontmatter';

describe('normalizeBeatFrontmatterKeys', () => {
    it('maps legacy beat description directly to canonical Purpose', () => {
        const normalized = normalizeBeatFrontmatterKeys({
            Class: 'Beat',
            Description: 'Legacy purpose'
        });

        expect(normalized.Purpose).toBe('Legacy purpose');
        expect('Description' in normalized).toBe(false);
    });
});

describe('scene core frontmatter remaps', () => {
    it('derives supported remap targets from the canonical scene base schema', () => {
        const targets = getSupportedFrontmatterRemapTargets();

        expect(targets).toContain('Class');
        expect(targets).toContain('When');
        expect(targets).toContain('Summary');
        expect(targets).not.toContain('Iteration');
        expect(targets).not.toContain('Place');
    });

    it('ignores unsupported advanced-field remaps while preserving supported scene-core remaps', () => {
        const normalized = normalizeFrontmatterKeys(
            {
                StoryType: 'Scene',
                StoryWhen: '2026-01-01',
                DraftPass: '2'
            },
            {
                StoryType: 'Class',
                StoryWhen: 'When',
                DraftPass: 'Iteration'
            }
        );

        expect(normalized.Class).toBe('Scene');
        expect(normalized.When).toBe('2026-01-01');
        expect(normalized.DraftPass).toBe('2');
        expect('Iteration' in normalized).toBe(false);
    });

    it('returns only supported mappings when the remap feature is enabled', () => {
        const mappings = getActiveFrontmatterMappings({
            enableCustomMetadataMapping: true,
            frontmatterMappings: {
                StoryType: 'Class',
                DraftPass: 'Iteration'
            }
        });

        expect(mappings).toEqual({ StoryType: 'Class' });
    });
});

describe('extractSummary', () => {
    it('trims a string Summary', () => {
        expect(extractSummary({ Summary: '  hello world  ' })).toBe('hello world');
    });

    it('joins array elements with newlines, String-coercing non-strings, then trims', () => {
        expect(extractSummary({ Summary: ['line one', 'line two'] })).toBe('line one\nline two');
        expect(extractSummary({ Summary: ['a', 2, true] })).toBe('a\n2\ntrue');
        expect(extractSummary({ Summary: ['  pad  ', 'x'] })).toBe('pad  \nx');
    });

    it('returns empty string for an empty array', () => {
        expect(extractSummary({ Summary: [] })).toBe('');
    });

    it('returns empty string for null, undefined, or a missing key', () => {
        expect(extractSummary({ Summary: null })).toBe('');
        expect(extractSummary({ Summary: undefined })).toBe('');
        expect(extractSummary({})).toBe('');
    });

    it('String-coerces and trims any other type', () => {
        expect(extractSummary({ Summary: 42 })).toBe('42');
        expect(extractSummary({ Summary: 0 })).toBe('0');
        expect(extractSummary({ Summary: false })).toBe('false');
        expect(extractSummary({ Summary: { a: 1 } })).toBe('[object Object]');
    });
});
