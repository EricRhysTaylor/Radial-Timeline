#!/usr/bin/env node
/**
 * One-time extraction script: captures the four hand-authored bundled fiction
 * template `.tex` blobs into `tests/fixtures/legacy-bundled-templates/` so they
 * can be diffed against the spec-driven generator output during the cutover.
 *
 * Reads the source via vitest (which already mocks `obsidian` for tests) by
 * generating a temporary throwaway test that writes the four blobs to disk
 * via Node's fs, then deletes the temp test.
 *
 * Run once:
 *   node scripts/capture-legacy-bundled-templates.mjs
 *
 * The fixture directory is reference-only; this script is not part of the
 * regular build pipeline.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const outDir = resolve(repoRoot, 'tests', 'fixtures', 'legacy-bundled-templates');
mkdirSync(outDir, { recursive: true });

const tempTestPath = resolve(repoRoot, 'src', 'utils', '__capture_legacy_fixtures__.test.ts');
const outDirJs = outDir.replace(/\\/g, '/');

const testSource = `import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getBundledPandocLayoutContent } from './pandocBundledLayouts';

const targets = [
    { id: 'bundled-fiction-classic-manuscript',    file: 'classic-manuscript.tex' },
    { id: 'bundled-fiction-contemporary-literary', file: 'contemporary-literary.tex' },
    { id: 'bundled-fiction-signature-literary',    file: 'signature-literary.tex' },
    { id: 'bundled-fiction-modern-classic',        file: 'modern-classic.tex' },
];

describe('capture legacy bundled templates', () => {
    it('writes fixtures', () => {
        for (const { id, file } of targets) {
            const content = getBundledPandocLayoutContent(id);
            if (content == null) throw new Error('missing ' + id);
            const out = resolve(${JSON.stringify(outDirJs)}, file);
            writeFileSync(out, content);
        }
    });
});
`;

writeFileSync(tempTestPath, testSource);
try {
    const r = spawnSync('npx', ['vitest', 'run', tempTestPath], {
        cwd: repoRoot,
        stdio: 'inherit',
    });
    if (r.status !== 0) process.exit(r.status || 1);
} finally {
    try { unlinkSync(tempTestPath); } catch {}
}
