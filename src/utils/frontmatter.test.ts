import { describe, expect, it } from 'vitest';
import { normalizeBeatFrontmatterKeys } from './frontmatter';

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
