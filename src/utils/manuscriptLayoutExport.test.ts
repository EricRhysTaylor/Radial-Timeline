import { describe, expect, it } from 'vitest';
import { getManuscriptLayoutExportBehavior } from './manuscriptLayoutExport';

describe('getManuscriptLayoutExportBehavior', () => {
    it('uses number-only raw LaTeX scene openers and suppresses chapter markers for Standard Manuscript', () => {
        const behavior = getManuscriptLayoutExportBehavior({
            id: 'bundled-fiction-classic-manuscript',
            name: 'Standard Manuscript',
            path: 'rt_classic_manuscript.tex',
        });

        expect(behavior).toEqual({
            sceneHeadingRenderMode: 'latex-section-starred',
            defaultSceneHeadingMode: 'scene-number',
            suppressChapterMarkers: true,
        });
    });

    it('keeps Signature Literary raw LaTeX scene openers without suppressing chapter markers', () => {
        const behavior = getManuscriptLayoutExportBehavior({
            id: 'bundled-fiction-signature-literary',
            name: 'Signature Literary',
            path: 'rt_signature_literary.tex',
        });

        expect(behavior).toEqual({
            sceneHeadingRenderMode: 'latex-section-starred',
            suppressChapterMarkers: false,
        });
    });

    it('keeps ordinary layouts on Markdown h2 scene headings', () => {
        const behavior = getManuscriptLayoutExportBehavior({
            id: 'custom-layout',
            name: 'Imported Layout',
            path: 'Pandoc/imported.tex',
        });

        expect(behavior).toEqual({
            sceneHeadingRenderMode: 'markdown-h2',
            suppressChapterMarkers: false,
        });
    });
});
