import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('writing session timer font loading', () => {
    const readTimelineCss = () => readFileSync(resolve(process.cwd(), 'src/styles/timeline.css'), 'utf8');
    const readIndicatorsCss = () => readFileSync(resolve(process.cwd(), 'src/styles/indicators.css'), 'utf8');
    const readTimelineViewSource = () => readFileSync(resolve(process.cwd(), 'src/view/TimeLineView.ts'), 'utf8');
    const readRuleBlock = (css: string, selector: string): string => {
        const start = css.indexOf(selector);
        if (start === -1) return '';
        const open = css.indexOf('{', start);
        const close = css.indexOf('}', open);
        return open === -1 || close === -1 ? '' : css.slice(open + 1, close);
    };

    it('uses the plugin-private JetBrains Mono face for timer UI', () => {
        const fontCss = readFileSync(resolve(process.cwd(), 'src/styles/font.css'), 'utf8');
        const timelineCss = readTimelineCss();

        expect(fontCss).toContain("font-family: 'Radial Timeline JetBrains Mono'");
        expect(timelineCss).toContain("'Radial Timeline JetBrains Mono', var(--font-monospace)");
        expect(fontCss).not.toContain('JetBrains Mono RT');
        expect(timelineCss).not.toContain('JetBrains Mono RT');
        expect(timelineCss).not.toContain("'JetBrains Mono', var(--font-monospace)");
    });

    it('embeds the bundled WOFF2 during CSS bundling', () => {
        const bundlerSource = readFileSync(resolve(process.cwd(), 'scripts/bundle-css.mjs'), 'utf8');

        expect(bundlerSource).toContain('assets/fonts/jetbrains-mono/JetBrainsMono-Thin.woff2');
        expect(bundlerSource).toContain('data:font/woff2;base64');
        expect(bundlerSource).toContain('embedBundledFontUrls');
    });

    it('keeps timer ratio links and timer buttons free of movement animation', () => {
        const timelineCss = readTimelineCss();
        const countPulseBlock = timelineCss.match(/@keyframes ert-timeline-session-count-pulse \{[\s\S]*?\n\}/)?.[0] ?? '';
        const clockBlock = readRuleBlock(timelineCss, '.ert-timeline-session-panel__clock {');
        const ratioBlock = readRuleBlock(timelineCss, 'button.ert-timeline-session-panel__ratio');
        const sectionBlock = readRuleBlock(timelineCss, '.ert-timeline-session-panel__section');
        const buttonBlocks = [
            '.ert-timeline-session-panel__primary',
            '.ert-timeline-session-panel__secondary',
            '.ert-timeline-session-panel__ghost',
            '.ert-timeline-session-panel__chip',
        ].map(selector => readRuleBlock(timelineCss, selector));
        const hoverBlocks = [
            '.ert-timeline-session-panel__primary:hover',
            '.ert-timeline-session-panel__secondary:hover',
            '.ert-timeline-session-panel__ghost:hover',
            '.ert-timeline-session-panel__chip:hover',
        ].map(selector => readRuleBlock(timelineCss, selector));

        expect(ratioBlock).not.toContain('transition:');
        buttonBlocks.forEach(block => expect(block).not.toMatch(/transition:[^;]*transform/));
        hoverBlocks.forEach(block => expect(block).not.toContain('translateY'));
        expect(countPulseBlock).not.toContain('transform:');
        expect(countPulseBlock).toContain('--ert-session-pulse-color');
        expect(clockBlock).toContain('background: transparent');
        expect(clockBlock).toContain('border: 0');
        expect(sectionBlock).not.toContain('transition:');
        expect(timelineCss).not.toContain('.ert-timeline-session-panel__section:hover');
    });

    it('keeps idle timer configuration stable and exposes the diagnostic red ring', () => {
        const timelineViewSource = readTimelineViewSource();
        const indicatorsCss = readIndicatorsCss();

        expect(timelineViewSource).not.toContain("applyTooltip(sessionBtn, 'Start writing session'");
        expect(timelineViewSource).not.toContain("sessionPanel.setAttribute('aria-label', 'Writing session')");
        expect(timelineViewSource).not.toContain('applyTooltip(presetButton');
        expect(timelineViewSource).toContain("previousPanelState === 'active'");
        expect(indicatorsCss).toContain('stroke: var(--color-red, red)');
    });

    it('keeps active popover copy lean and labels action buttons directly', () => {
        const timelineViewSource = readTimelineViewSource();

        expect(timelineViewSource).not.toContain("'square', 'Stop and save session'");
        expect(timelineViewSource).toContain("'save', 'Save'");
        expect(timelineViewSource).toContain("'pause', 'Pause'");
        expect(timelineViewSource).toContain("'trash-2', 'Cancel'");
        expect(timelineViewSource).not.toContain("active.pausedAt ? 'Paused' : 'Running'");
    });
});
