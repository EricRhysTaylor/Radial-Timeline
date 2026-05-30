import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs'; // SAFE: test-only source guard reads TimeLineView for layer-order regression coverage.
import { resolve } from 'path'; // SAFE: test-only source guard resolves a repo-local file path.

describe('RadialTimelineView layer ordering', () => {
    it('keeps the writing-session ring behind Gossamer score text and hover meta text', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/view/TimeLineView.ts'), 'utf8');
        const fn = source.match(/private updateWritingSessionRing\([\s\S]+?\n    public focusTimelineSearchInput/)?.[0] ?? '';
        expect(fn).toContain("this.currentMode === 'gossamer'");
        expect(fn).toContain("timelineRoot.querySelector('.rt-gossamer-layer, .rt-scene-info')");
        expect(fn).toContain("timelineRoot.querySelector('.rt-scene-info')");
        expect(fn).toContain('timelineRoot.insertBefore(imported, firstAnchor);');
        expect(fn).not.toContain('Node.DOCUMENT_POSITION');
        expect(fn.indexOf("timelineRoot.querySelector('.rt-gossamer-layer, .rt-scene-info')")).toBeLessThan(
            fn.indexOf('timelineRoot.insertBefore(imported, firstAnchor);')
        );
        expect(fn.indexOf('timelineRoot.insertBefore(imported, firstAnchor);')).toBeLessThan(
            fn.indexOf('timelineRoot.appendChild(imported);')
        );
    });
});
