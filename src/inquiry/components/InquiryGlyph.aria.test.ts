import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * SVG accessibility guard (added 2026-06-05).
 *
 * InquiryGlyph renders only SVG (createElementNS). Setting `aria-label` on an
 * SVG element triggers Obsidian's global tooltip handler, which on its
 * hover-delay timer calls `HTMLElement.isShown()` — a method Obsidian adds to
 * `HTMLElement.prototype` (its `enhance.js`) that `SVGElement` does not inherit.
 * The result is the recurring `e.isShown is not a function` crash on the
 * Inquiry question markers ("buttons of inquiry").
 *
 * Accessible names on SVG must go through `setSvgAccessibleName` (a `<title>`
 * child), never `aria-label`. This guard pins that so the crash cannot
 * silently return when new states/labels are added to the glyph.
 */
describe('InquiryGlyph SVG accessibility discipline', () => {
    const raw = readFileSync(resolve(process.cwd(), 'src/inquiry/components/InquiryGlyph.ts'), 'utf8');
    const code = raw
        .replace(/\/\*[\s\S]*?\*\//g, '')          // block comments
        .replace(/(^|[^:])\/\/.*$/gm, '$1');       // line comments (preserves http://)

    it('never references aria-label (SVG must use setSvgAccessibleName/<title>)', () => {
        expect(code).not.toMatch(/aria-label/);
    });

    it('labels its SVG markers via setSvgAccessibleName', () => {
        expect(code).toContain('setSvgAccessibleName');
    });
});
