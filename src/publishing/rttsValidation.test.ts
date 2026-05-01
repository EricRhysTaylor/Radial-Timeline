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

    it('marks $body$-only templates as legacy without surfacing warnings', () => {
        const result = validateRttsTemplateContent('\\begin{document}\n$body$\n\\end{document}');

        expect(result.level).toBe('legacy');
        expect(result.variables.hasBody).toBe(true);
        expect(result.detectedCapabilities).toEqual([]);
        // Template-side absences (no $title$, no $author$, no hooks) are not
        // user-facing problems — they describe template design, not export
        // blockers. The issues array should contain no warnings.
        expect(result.issues.filter(issue => issue.level === 'warning')).toEqual([]);
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

    it('does not warn when $title$ or $author$ are absent — those describe template design, not export blockers', () => {
        const result = validateRttsTemplateContent('$body$');

        expect(result.level).toBe('legacy');
        expect(result.variables.hasTitle).toBe(false);
        expect(result.variables.hasAuthor).toBe(false);
        expect(result.issues.filter(issue => issue.level === 'warning')).toEqual([]);
    });

    it('does not warn when a declared capability lacks its hook — those describe template design, not export blockers', () => {
        const result = validateRttsTemplateContent('$title$\n$author$\n$body$', {
            declaredCapabilities: ['frontmatter_dedication'],
        });

        expect(result.level).toBe('legacy');
        expect(result.issues.filter(issue => issue.level === 'warning')).toEqual([]);
    });
});
