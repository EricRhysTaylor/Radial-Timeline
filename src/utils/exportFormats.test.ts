import { describe, expect, it } from 'vitest';
import { buildExportFilename } from './exportFormats';

describe('buildExportFilename — manuscript PDF', () => {
    it('appends the layout abbreviation in square brackets before the extension', () => {
        const filename = buildExportFilename({
            exportType: 'manuscript',
            order: 'narrative',
            extension: 'pdf',
            fileStem: 'shail-and-trisan',
            layoutAbbreviation: 'CL',
        });
        // shape: "shail and trisan PDF <timestamp> [CL].pdf"
        // (stemToReadable preserves stem casing — title-casing is intentional book-stem behavior elsewhere.)
        expect(filename).toMatch(/^shail and trisan PDF .+ \[CL\]\.pdf$/);
    });

    it('omits the abbreviation when none is provided', () => {
        const filename = buildExportFilename({
            exportType: 'manuscript',
            order: 'narrative',
            extension: 'pdf',
            fileStem: 'Manuscript',
        });
        expect(filename).toMatch(/^Manuscript PDF .+\.pdf$/);
        expect(filename).not.toMatch(/\[/);
    });

    it('rejects malformed abbreviations rather than embedding garbage in the filename', () => {
        const filename = buildExportFilename({
            exportType: 'manuscript',
            order: 'narrative',
            extension: 'pdf',
            fileStem: 'manuscript',
            // Lowercase or non-2-letter codes are ignored — the helper guards
            // against future callers passing through malformed values that
            // would corrupt the on-disk filename.
            layoutAbbreviation: 'sm',
        });
        expect(filename).not.toMatch(/\[/);
    });

    it('does not apply abbreviation to non-PDF manuscript exports', () => {
        const filename = buildExportFilename({
            exportType: 'manuscript',
            order: 'narrative',
            manuscriptPreset: 'novel',
            extension: 'md',
            layoutAbbreviation: 'CL',
        });
        // markdown branch never reads layoutAbbreviation.
        expect(filename).not.toMatch(/\[CL\]/);
        expect(filename).toMatch(/\.md$/);
    });
});
