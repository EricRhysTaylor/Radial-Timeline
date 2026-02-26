import { describe, expect, it } from 'vitest';
import { sanitizeCompiledManuscript } from './manuscriptSanitize';

describe('sanitizeCompiledManuscript', () => {
    it('always removes YAML frontmatter blocks from compiled manuscript text', () => {
        const input = `## 1 Opening

---
Class: Scene
Words: 1200
---
Paragraph one.

## 2 Arrival

---
Class: Scene
Role: other
---
Paragraph two.`;

        const sanitized = sanitizeCompiledManuscript(input, {
            stripComments: false,
            stripLinks: false,
            stripCallouts: false,
            stripBlockIds: false
        });

        expect(sanitized).toContain('## 1 Opening');
        expect(sanitized).toContain('## 2 Arrival');
        expect(sanitized).toContain('Paragraph one.');
        expect(sanitized).toContain('Paragraph two.');
        expect(sanitized).not.toContain('Class: Scene');
        expect(sanitized).not.toContain('Words: 1200');
        expect(sanitized).not.toContain('Role: other');
    });

    it('preserves comments, links, and callouts when optional cleanup is disabled', () => {
        const input = `---
Class: Scene
---
Visible %%editor note%% and <!-- html note -->.
[Doc link](https://example.com) with [[My Note|Alias]].
> [!note] Tip
> Keep this callout.`;

        const sanitized = sanitizeCompiledManuscript(input, {
            stripComments: false,
            stripLinks: false,
            stripCallouts: false,
            stripBlockIds: false
        });

        expect(sanitized).toContain('%%editor note%%');
        expect(sanitized).toContain('<!-- html note -->');
        expect(sanitized).toContain('[Doc link](https://example.com)');
        expect(sanitized).toContain('[[My Note|Alias]]');
        expect(sanitized).toContain('> [!note] Tip');
        expect(sanitized).not.toContain('Class: Scene');
    });

    it('strips comments, links, callouts, and block ids when enabled', () => {
        const input = `Visible %%hidden%% and <!-- html hidden -->.
[Doc link](https://example.com) with [[Folder/My Note|Alias]].
> [!warning] Remove me
> This line should also go.
Ends here ^scene-end`;

        const sanitized = sanitizeCompiledManuscript(input, {
            stripComments: true,
            stripLinks: true,
            stripCallouts: true,
            stripBlockIds: true
        });

        expect(sanitized).not.toContain('%%hidden%%');
        expect(sanitized).not.toContain('<!-- html hidden -->');
        expect(sanitized).not.toContain('[Doc link]');
        expect(sanitized).not.toContain('[[Folder/My Note|Alias]]');
        expect(sanitized).toContain('Doc link');
        expect(sanitized).toContain('Alias');
        expect(sanitized).not.toContain('[!warning]');
        expect(sanitized).not.toContain('This line should also go.');
        expect(sanitized).not.toContain('^scene-end');
    });
});

