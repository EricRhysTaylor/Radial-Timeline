import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('RadialTimelineView layer ordering', () => {
    it('keeps the writing-session ring behind Gossamer score text in Gossamer mode', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/view/TimeLineView.ts'), 'utf8');
        const fn = source.match(/private updateWritingSessionRing\([\s\S]+?\n    public focusTimelineSearchInput/)?.[0] ?? '';
        expect(fn).toContain("this.currentMode === 'gossamer'");
        expect(fn).toContain("timelineRoot.querySelector('.rt-gossamer-layer')");
        expect(fn).toContain('timelineRoot.insertBefore(imported, gossamerLayer);');
        expect(fn.indexOf("timelineRoot.querySelector('.rt-gossamer-layer')")).toBeLessThan(
            fn.indexOf('timelineRoot.insertBefore(imported, gossamerLayer);')
        );
        expect(fn.indexOf('timelineRoot.insertBefore(imported, gossamerLayer);')).toBeLessThan(
            fn.indexOf('timelineRoot.appendChild(imported);')
        );
    });
});
