import { describe, expect, it } from 'vitest';
import {
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
