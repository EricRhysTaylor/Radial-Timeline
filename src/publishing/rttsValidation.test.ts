import { describe, expect, it } from 'vitest';
import { validateRttsTemplateContent } from './rttsValidation';

describe('RTTS validation', () => {
    it('marks templates without $body$ as invalid', () => {
        const result = validateRttsTemplateContent('\\documentclass{book}\\begin{document}\\end{document}');

        expect(result.level).toBe('invalid');
        expect(result.variables.hasBody).toBe(false);
        expect(result.issues).toEqual(expect.arrayContaining([
            expect.objectContaining({
                level: 'error',
                code: 'rtts_missing_body',
            }),
        ]));
    });

    it('marks $body$-only templates as legacy', () => {
        const result = validateRttsTemplateContent('\\begin{document}\n$body$\n\\end{document}');

        expect(result.level).toBe('legacy');
        expect(result.variables.hasBody).toBe(true);
        expect(result.detectedCapabilities).toEqual([]);
        expect(result.issues).toEqual(expect.arrayContaining([
            expect.objectContaining({
                level: 'info',
                code: 'rtts_legacy_body_fallback',
            }),
        ]));
    });

    it('marks templates with body, metadata, and declared hooks as compatible', () => {
        const result = validateRttsTemplateContent([
            '\\begin{document}',
            '$title$',
            '$author$',
            '$frontmatter_title$',
            '$body$',
            '\\end{document}',
        ].join('\n'), {
            declaredCapabilities: ['frontmatter_title'],
        });

        expect(result.level).toBe('compatible');
        expect(result.variables.hasTitle).toBe(true);
        expect(result.variables.hasAuthor).toBe(true);
        expect(result.variables.hooks.frontmatter_title).toBe(true);
        expect(result.detectedCapabilities).toContain('frontmatter_title');
        expect(result.detectedCapabilities).toContain('structuredBlocks');
    });

    it('warns when $author$ is missing', () => {
        const result = validateRttsTemplateContent('$title$\n$body$');

        expect(result.level).toBe('legacy');
        expect(result.issues).toEqual(expect.arrayContaining([
            expect.objectContaining({
                level: 'warning',
                code: 'rtts_missing_author',
            }),
        ]));
    });

    it('warns when a declared capability is missing its hook', () => {
        const result = validateRttsTemplateContent('$title$\n$author$\n$body$', {
            declaredCapabilities: ['frontmatter_dedication'],
        });

        expect(result.level).toBe('legacy');
        expect(result.issues).toEqual(expect.arrayContaining([
            expect.objectContaining({
                level: 'warning',
                code: 'rtts_capability_missing_hook',
            }),
        ]));
    });
});
