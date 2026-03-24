import { describe, expect, it } from 'vitest';
import { categorizeExportError } from './exportErrors';

describe('export error categorization', () => {
    it('categorizes missing dependencies ahead of generic pandoc failures', () => {
        const failure = categorizeExportError('xelatex not found on PATH');
        expect(failure.category).toBe('missing_dependency');
        expect(failure.message).toMatch(/Missing export dependency/i);
    });

    it('categorizes template validation failures', () => {
        const failure = categorizeExportError('Layout "Signature Literary" is invalid: Template file must use a .tex extension.');
        expect(failure.category).toBe('invalid_template');
    });

    it('preserves raw detail for disclosure', () => {
        const failure = categorizeExportError('! LaTeX Error: File `foo.sty` not found.');
        expect(failure.category).toBe('pandoc_compile_failure');
        expect(failure.detail).toContain('foo.sty');
    });
});
