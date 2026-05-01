import type { PandocLayoutTemplate } from '../types';
import type { ManuscriptSceneHeadingMode, SceneHeadingRenderMode } from './manuscript';

export interface ManuscriptLayoutExportBehavior {
    sceneHeadingRenderMode: SceneHeadingRenderMode;
    defaultSceneHeadingMode?: ManuscriptSceneHeadingMode;
    suppressChapterMarkers: boolean;
}

export const STANDARD_MANUSCRIPT_LAYOUT_ID = 'bundled-fiction-classic-manuscript';

function layoutIdentity(layout: Pick<PandocLayoutTemplate, 'id' | 'name' | 'path'>): string {
    return `${layout.id || ''} ${layout.name || ''} ${layout.path || ''}`.toLowerCase();
}

export function getManuscriptLayoutExportBehavior(
    layout: Pick<PandocLayoutTemplate, 'id' | 'name' | 'path'>
): ManuscriptLayoutExportBehavior {
    const identity = layoutIdentity(layout);
    const isStandardManuscript = layout.id === STANDARD_MANUSCRIPT_LAYOUT_ID
        || /\bstandard manuscript\b/.test(identity)
        || /rt_classic_manuscript\.tex/.test(identity);
    const isSignatureLiterary = /signature literary|signature[-_ ]literary/.test(identity);

    if (isStandardManuscript) {
        return {
            sceneHeadingRenderMode: 'latex-section-starred',
            defaultSceneHeadingMode: 'scene-number',
            suppressChapterMarkers: true,
        };
    }

    if (isSignatureLiterary) {
        return {
            sceneHeadingRenderMode: 'latex-section-starred',
            suppressChapterMarkers: false,
        };
    }

    return {
        sceneHeadingRenderMode: 'markdown-h2',
        suppressChapterMarkers: false,
    };
}
