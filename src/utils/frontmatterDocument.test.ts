import { describe, expect, it } from 'vitest';
import { buildFrontmatterDocument, extractBodyAfterFrontmatter } from './frontmatterDocument';

describe('frontmatterDocument', () => {
    it('extracts body from position.end when provided', () => {
        const content = '---\nClass: Scene\n---\nBody line';
        const body = extractBodyAfterFrontmatter(content, {
            position: { end: { offset: '---\nClass: Scene\n---'.length } }
        });
        expect(body).toBe('\nBody line');
    });

    it('falls back to stripping first frontmatter block when position metadata is missing', () => {
        const content = '---\nClass: Scene\nSummary: Hello\n---\n---\nBody line';
        const body = extractBodyAfterFrontmatter(content, {});
        expect(body).toBe('\n---\nBody line');
    });

    it('rebuilds with exactly one closing fence and a single separator when needed', () => {
        const yaml = 'id: scn_deadbeef\nClass: Scene\n';
        const rebuilt = buildFrontmatterDocument(yaml, 'Body line');
        expect(rebuilt).toBe('---\nid: scn_deadbeef\nClass: Scene\n---\nBody line');
        expect(rebuilt).not.toContain('------');
    });

    it('does not insert an extra separator when body already starts with newline', () => {
        const yaml = 'id: scn_deadbeef\nClass: Scene\n';
        const rebuilt = buildFrontmatterDocument(yaml, '\nBody line');
        expect(rebuilt).toBe('---\nid: scn_deadbeef\nClass: Scene\n---\nBody line');
    });
});
