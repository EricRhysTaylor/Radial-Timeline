import { describe, it, expect } from 'vitest';
import { extractBodyText } from './manuscript';

describe('extractBodyText strips frontmatter and comments from evidence', () => {
    it('strips YAML frontmatter', () => {
        const input = '---\ntitle: My Scene\nstatus: draft\n---\nThe story begins here.';
        expect(extractBodyText(input)).toBe('The story begins here.');
    });

    it('strips HTML comments', () => {
        const input = 'Before <!-- hidden note --> after';
        expect(extractBodyText(input)).toBe('Before  after');
    });

    it('strips multiline HTML comments', () => {
        const input = 'Before\n<!-- \ntodo: fix this\n-->\nafter';
        expect(extractBodyText(input)).toBe('Before\n\nafter');
    });

    it('strips Obsidian comments (%%)', () => {
        const input = 'Visible text %%hidden comment%% more text';
        expect(extractBodyText(input)).toBe('Visible text  more text');
    });

    it('strips frontmatter and all comment types together', () => {
        const input = '---\ntitle: Test\n---\nParagraph one.\n<!-- editor note -->\nParagraph two.\n%%draft note%%\nParagraph three.';
        const result = extractBodyText(input);
        expect(result).not.toContain('---');
        expect(result).not.toContain('title: Test');
        expect(result).not.toContain('<!-- editor note -->');
        expect(result).not.toContain('%%draft note%%');
        expect(result).toContain('Paragraph one.');
        expect(result).toContain('Paragraph two.');
        expect(result).toContain('Paragraph three.');
    });

    it('returns body unchanged when no frontmatter or comments present', () => {
        const input = 'Just a plain paragraph.\nWith a second line.';
        expect(extractBodyText(input)).toBe('Just a plain paragraph.\nWith a second line.');
    });

    it('handles empty content', () => {
        expect(extractBodyText('')).toBe('');
    });
});
