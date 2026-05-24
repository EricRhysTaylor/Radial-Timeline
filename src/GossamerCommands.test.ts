import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseScoresAndJustifications, scrubAiCitationArtifacts } from './GossamerCommands';

describe('scrubAiCitationArtifacts', () => {
    it('strips ChatGPT markdown-link citations pointing to sediment attachments', () => {
        const input = 'Establishes strained normalcy with Trisan’s physical limits  [oai_citation:0‡Manuscript Novl Narr Apr 22 @ 3.23PM.md](sediment://file_00000000068471f5b89939124045a7fe)';
        expect(scrubAiCitationArtifacts(input)).toBe('Establishes strained normalcy with Trisan’s physical limits');
    });

    it('strips bare oai_citation tags without a URL', () => {
        expect(scrubAiCitationArtifacts('Something happens [oai_citation:2‡file.md] and more'))
            .toBe('Something happens and more');
    });

    it('strips legacy 【N†source】 bracket form', () => {
        expect(scrubAiCitationArtifacts('Pressure rises 【3†manuscript】 toward the end'))
            .toBe('Pressure rises toward the end');
    });

    it('returns undefined for empty or citation-only input', () => {
        expect(scrubAiCitationArtifacts('')).toBeUndefined();
        expect(scrubAiCitationArtifacts('  [oai_citation:0‡x.md](sediment://f) ')).toBeUndefined();
    });

    it('parseScoresAndJustifications removes citations end-to-end', () => {
        const clipboard = '1.01 Ordinary World | 40 | Establishes strained normalcy with Trisan’s physical limits  [oai_citation:0‡Manuscript Novl Narr Apr 22 @ 3.23PM.md](sediment://file_00000000068471f5b89939124045a7fe)';
        const parsed = parseScoresAndJustifications(clipboard);
        const entry = parsed.get('1.01 Ordinary World');
        expect(entry?.score).toBe(40);
        expect(entry?.justification).toBe('Establishes strained normalcy with Trisan’s physical limits');
    });
});

describe('Gossamer AI evidence mode wiring', () => {
    it('routes analysis through bodies-only evidence assembly with no summary fallback', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/GossamerCommands.ts'), 'utf8');
        expect(source).toContain('resolveGossamerEvidence({');
        expect(source).toContain('Scene bodies');
        // No summary mode or fallback path
        expect(source).not.toContain('Summaries');
        expect(source).not.toContain('auto fallback');
        expect(source).not.toContain('GossamerEvidencePreference');
        expect(source).not.toContain('resolveSafeGossamerInputLimit');
    });
});

/**
 * Canonical YAML key discipline (regression guard added 2026-05-23).
 *
 * The multi-signal refactor on 2026-04-21 wired `fm.Synopsis` — a key that
 * never existed on beat notes — as the source of the beat description. Every
 * Gossamer run for a month shipped bare beat labels. This source-grep test
 * pins the rule: GossamerCommands must populate beat purpose via the canonical
 * helper (readBeatPurpose), never via a raw fm.{Synopsis,Purpose,...} literal.
 *
 * If you find yourself wanting to silence this test, the actual answer is
 * almost certainly to extend src/utils/frontmatter.ts BEAT_PURPOSE_KEYS or
 * add a new helper there, not to inline a key access here.
 */
describe('Gossamer canonical YAML key discipline', () => {
    const rawSource = readFileSync(resolve(process.cwd(), 'src/GossamerCommands.ts'), 'utf8');
    // Strip comments before grepping so docstring mentions of forbidden patterns
    // don't trip these tests. Order matters: block comments first, then line.
    const source = rawSource
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');

    it('reads beat purpose through the canonical readBeatPurpose helper', () => {
        expect(rawSource).toContain('readBeatPurpose');
        expect(rawSource).toContain("from './utils/frontmatter'");
    });

    it('never references fm.Synopsis or frontmatter.Synopsis on beats in executable code', () => {
        expect(source).not.toMatch(/\bfm\??\.Synopsis\b/);
        expect(source).not.toMatch(/\bfrontmatter\??\.Synopsis\b/);
    });

    it('never inlines the Purpose→Description→description fallback ladder (use the helper)', () => {
        const purposeReadsInline = source.match(/\bfm\??\.Purpose\b/g)?.length ?? 0;
        const descriptionReadsInline = source.match(/\bfm\??\.Description\b/g)?.length ?? 0;
        expect(purposeReadsInline).toBe(0);
        expect(descriptionReadsInline).toBe(0);
    });
});
