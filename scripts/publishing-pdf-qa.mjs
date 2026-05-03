import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { BUNDLED_FICTION_SPECS } from '../src/publishing/bundledStyleSpecs.ts';
import { generateDesignedStyleTex } from '../src/publishing/designedStyle.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const args = new Set(process.argv.slice(2));
const updateBaselines = args.has('--update-baselines');
const visual = args.has('--visual') || updateBaselines;
const keepOutput = args.has('--keep-output');

const outputArgIndex = process.argv.indexOf('--output');
const outputRoot = outputArgIndex >= 0 && process.argv[outputArgIndex + 1]
    ? resolve(process.argv[outputArgIndex + 1])
    : join(repoRoot, 'tmp', 'publishing-pdf-qa');

const baselineRoot = join(repoRoot, 'tests', 'fixtures', 'publishing-pdf-baselines');
const fontRoot = join(repoRoot, 'src', 'assets', 'fonts');
const contemporaryLongScene = Array.from({ length: 20 }, () => (
    'The first scene continues across pages so the PDF text audit can verify the right-page running header. The prose itself avoids the scene title, which means an extracted title hit must come from the header or opener chrome.'
)).join('\n\n');

const layouts = [
    {
        id: 'bundled-fiction-classic-manuscript',
        slug: 'standard-manuscript',
        expectedPages: 2,
        body: String.raw`\rtSceneOpener{1}
\rtSetSceneRunningTitle{Arrival}

First paragraph of the first scene. More words occupy the page and exercise body text after the opener.

\rtSceneOpener{2}
\rtSetSceneRunningTitle{The Garden}

Second scene body text follows the opener.
`,
    },
    {
        id: 'bundled-fiction-contemporary-literary',
        slug: 'contemporary-literary',
        expectedPages: 7,
        expectedLatexText: ['\\rtSetSceneRunningTitle{Arrival}'],
        forbiddenLatexText: ['\\markboth{}{Arrival}'],
        expectedPageText: [
            { page: 3, text: 'Arrival' },
            { page: 4, text: 'Audit Book' },
        ],
        body: String.raw`\rtChapter{1}{Boy with a Skull}

\rtSceneOpener{1}
\rtSetSceneRunningTitle{Arrival}

${contemporaryLongScene}

\rtSceneOpener{2}
\rtSetSceneRunningTitle{The Garden}

Second scene body text follows the opener.

\rtChapter{2}{New Horizons}

\rtSceneOpener{3}
\rtSetSceneRunningTitle{Departure}

Third scene body text starts the second chapter.
`,
    },
    {
        id: 'bundled-fiction-signature-literary',
        slug: 'signature-literary',
        expectedPages: 2,
        body: String.raw`\rtSceneOpener{1\\{\normalsize (Arrival)}}
\rtSetSceneRunningTitle{Arrival}

First paragraph of the first scene. More words occupy the page and exercise body text after the opener.

\rtSceneOpener{2\\{\normalsize (The Garden)}}
\rtSetSceneRunningTitle{The Garden}

Second scene body text follows the opener.
`,
    },
    {
        id: 'bundled-fiction-modern-classic',
        slug: 'modern-classic',
        expectedPages: 6,
        expectedPageText: [
            { page: 1, text: 'I' },
            { page: 1, text: 'A precise line.' },
            { page: 1, text: 'AUTHOR A' },
        ],
        forbiddenPageText: [
            { page: 1, text: 'PART I' },
            { page: 2, text: 'A precise line.' },
        ],
        body: String.raw`\rtPart{I}{A precise line.}{Author A}

\rtChapter{1}{Boy with a Skull}

First paragraph of chapter one.

\rtSceneSep

Second scene body text follows an inline roman separator.

\rtPart{II}{}{}

\rtChapter{2}{New Horizons}

Third scene body text starts the second act.
`,
    },
];

function commandPath(name) {
    const result = spawnSync('which', [name], { encoding: 'utf8' });
    return result.status === 0 ? result.stdout.trim() : '';
}

function run(command, argv, options = {}) {
    const result = spawnSync(command, argv, {
        cwd: options.cwd ?? repoRoot,
        encoding: options.encoding ?? 'utf8',
        stdio: options.stdio ?? 'pipe',
    });
    if (result.status !== 0) {
        const stdout = result.stdout ? `\nstdout:\n${result.stdout}` : '';
        const stderr = result.stderr ? `\nstderr:\n${result.stderr}` : '';
        throw new Error(`${command} ${argv.join(' ')} failed with exit ${result.status}.${stdout}${stderr}`);
    }
    return result;
}

function requireCommand(name, installHint) {
    const found = commandPath(name);
    if (!found) {
        throw new Error(`Missing required command "${name}". ${installHint}`);
    }
    return found;
}

function latinModernPath() {
    const kpsewhich = commandPath('kpsewhich');
    if (!kpsewhich) return undefined;
    const result = spawnSync(kpsewhich, ['lmroman10-regular.otf'], { encoding: 'utf8' });
    if (result.status !== 0 || !result.stdout.trim()) return undefined;
    return dirname(result.stdout.trim());
}

function pdfInfo(pdfPath) {
    const result = run('pdfinfo', [pdfPath]);
    const pages = Number((result.stdout.match(/^Pages:\s+(\d+)/m) ?? [])[1]);
    const pageSize = (result.stdout.match(/^Page size:\s+(.+)$/m) ?? [])[1] ?? '';
    return { pages, pageSize };
}

function pdfText(pdfPath, page) {
    const pageArgs = page ? ['-f', String(page), '-l', String(page)] : [];
    return run('pdftotext', ['-layout', ...pageArgs, pdfPath, '-']).stdout;
}

function rasterize(pdfPath, outDir) {
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });
    const prefix = join(outDir, 'page');
    run('pdftoppm', ['-png', '-r', '72', pdfPath, prefix]);
    return readdirSync(outDir)
        .filter(name => /^page-\d+\.png$/.test(name))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .map(name => join(outDir, name));
}

function readPng(path) {
    return PNG.sync.read(readFileSync(path));
}

function comparePng(actualPath, expectedPath, diffPath) {
    const actual = readPng(actualPath);
    const expected = readPng(expectedPath);
    if (actual.width !== expected.width || actual.height !== expected.height) {
        throw new Error(`PNG dimensions differ for ${actualPath}: actual ${actual.width}x${actual.height}, expected ${expected.width}x${expected.height}`);
    }
    const diff = new PNG({ width: actual.width, height: actual.height });
    const diffPixels = pixelmatch(
        actual.data,
        expected.data,
        diff.data,
        actual.width,
        actual.height,
        { threshold: 0.1, includeAA: false }
    );
    if (diffPixels > 0) {
        writeFileSync(diffPath, PNG.sync.write(diff));
    }
    return diffPixels;
}

function updateBaseline(slug, actualPages) {
    const targetDir = join(baselineRoot, slug);
    rmSync(targetDir, { recursive: true, force: true });
    mkdirSync(targetDir, { recursive: true });
    actualPages.forEach((page, index) => {
        copyFileSync(page, join(targetDir, `page-${String(index + 1).padStart(2, '0')}.png`));
    });
}

function compareBaseline(slug, actualPages, diffDir) {
    const targetDir = join(baselineRoot, slug);
    if (!existsSync(targetDir)) {
        throw new Error(`Missing PDF visual baseline for ${slug}. Run npm run publish:pdf-baseline.`);
    }
    const expectedPages = readdirSync(targetDir)
        .filter(name => /^page-\d+\.png$/.test(name))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .map(name => join(targetDir, name));
    if (actualPages.length !== expectedPages.length) {
        throw new Error(`${slug} page-count baseline mismatch: actual ${actualPages.length}, expected ${expectedPages.length}`);
    }
    mkdirSync(diffDir, { recursive: true });
    let totalDiffPixels = 0;
    actualPages.forEach((actual, index) => {
        const diffPath = join(diffDir, `page-${String(index + 1).padStart(2, '0')}.diff.png`);
        totalDiffPixels += comparePng(actual, expectedPages[index], diffPath);
    });
    return totalDiffPixels;
}

function assertModernClassicNoBadLatinModernFallback(spec, fontRoot, layoutDir) {
    const tex = generateDesignedStyleTex(spec, {
        bundledLayoutId: 'bundled-fiction-modern-classic',
        bundledFontPath: fontRoot,
    });
    if (/Path\s*=.*assets\/fonts\/latin-modern/.test(tex) || tex.includes('/latin-modern/')) {
        throw new Error('Modern Classic generated a Latin Modern Path pointing at the plugin asset bundle.');
    }
    if (!tex.includes('\\errmessage{Radial Timeline Modern Classic requires a verified Latin Modern font path')) {
        throw new Error('Modern Classic without a verified Latin Modern path must hard-fail instead of falling back.');
    }

    const texPath = join(layoutDir, 'modern-classic-no-latin-path.tex');
    const mdPath = join(layoutDir, 'modern-classic-no-latin-path.md');
    const pdfPath = join(layoutDir, 'modern-classic-no-latin-path.pdf');
    writeFileSync(texPath, tex);
    writeFileSync(mdPath, [
        '---',
        'title: Audit Book',
        'author: E. R. Taylor',
        '---',
        '',
        '\\rtPart{I}{A quote}{J. Name}',
        '\\rtChapter{1}{Chapter One}',
        'Modern Classic font smoke.',
    ].join('\n'));
    try {
        run('pandoc', [
            mdPath,
            '--from', 'markdown+raw_tex',
            '--pdf-engine', 'xelatex',
            '--template', texPath,
            '-o', pdfPath,
        ]);
    } catch {
        return;
    }
    throw new Error('Modern Classic compiled without a verified Latin Modern path; expected hard failure.');
}

function writeReadme() {
    mkdirSync(baselineRoot, { recursive: true });
    const readme = `# Publishing PDF Visual Baselines

These PNGs are generated by \`npm run publish:pdf-baseline\` from deterministic Pandoc/XeLaTeX fixture PDFs.

Run \`npm run publish:pdf-smoke\` for compile/page-count checks.
Run \`npm run publish:pdf-assembly\` to verify the real manuscript assembler output survives Pandoc macro expansion and renders expected page headers.
Run \`npm run publish:pdf-visual\` to rasterize PDFs with Poppler and compare them to these baselines.

Required local tools:

- pandoc
- xelatex
- pdfinfo, pdftotext, and pdftoppm from Poppler

Do not edit baseline PNGs by hand.
`;
    writeFileSync(join(baselineRoot, 'README.md'), readme);
}

function main() {
    requireCommand('pandoc', 'Install Pandoc first.');
    requireCommand('xelatex', 'Install a TeX distribution with XeLaTeX first.');
    requireCommand('pdfinfo', 'Install Poppler first. On macOS: brew install poppler.');
    requireCommand('pdftotext', 'Install Poppler first. On macOS: brew install poppler.');
    if (visual) {
        requireCommand('pdftoppm', 'Install Poppler first. On macOS: brew install poppler.');
    }

    rmSync(outputRoot, { recursive: true, force: true });
    mkdirSync(outputRoot, { recursive: true });
    const lmPath = latinModernPath();
    const failures = [];

    for (const layout of layouts) {
        const spec = BUNDLED_FICTION_SPECS[layout.id];
        const layoutDir = join(outputRoot, layout.slug);
        mkdirSync(layoutDir, { recursive: true });
        const texPath = join(layoutDir, `${layout.slug}.tex`);
        const mdPath = join(layoutDir, `${layout.slug}.md`);
        const pdfPath = join(layoutDir, `${layout.slug}.pdf`);
        const expandedTexPath = join(layoutDir, `${layout.slug}.expanded.tex`);
        writeFileSync(texPath, generateDesignedStyleTex(spec, {
            bundledLayoutId: layout.id,
            bundledFontPath: fontRoot,
            ...(lmPath ? { latinModernPath: lmPath } : {}),
        }));
        writeFileSync(mdPath, layout.body);

        try {
            if (layout.id === 'bundled-fiction-modern-classic') {
                assertModernClassicNoBadLatinModernFallback(spec, fontRoot, layoutDir);
            }
            run('pandoc', [
                mdPath,
                '--from=markdown',
                '--pdf-engine=xelatex',
                `--template=${texPath}`,
                '-V',
                'title=Audit Book',
                '-V',
                'author=Audit Author',
                '-o',
                pdfPath,
            ]);
            if (layout.expectedLatexText?.length || layout.forbiddenLatexText?.length) {
                run('pandoc', [
                    mdPath,
                    '--from=markdown',
                    '--to=latex',
                    '--standalone',
                    `--template=${texPath}`,
                    '-V',
                    'title=Audit Book',
                    '-V',
                    'author=Audit Author',
                    '-o',
                    expandedTexPath,
                ]);
                const expandedTex = readFileSync(expandedTexPath, 'utf8');
                const missingLatex = (layout.expectedLatexText || []).filter(text => !expandedTex.includes(text));
                if (missingLatex.length > 0) {
                    throw new Error(`${layout.slug} expanded LaTeX is missing expected macro text: ${missingLatex.join(', ')}`);
                }
                const forbiddenLatex = (layout.forbiddenLatexText || []).filter(text => expandedTex.includes(text));
                if (forbiddenLatex.length > 0) {
                    throw new Error(`${layout.slug} expanded LaTeX contains forbidden macro expansion: ${forbiddenLatex.join(', ')}`);
                }
            }
            const info = pdfInfo(pdfPath);
            if (info.pages !== layout.expectedPages) {
                throw new Error(`${layout.slug} expected ${layout.expectedPages} pages, got ${info.pages}`);
            }
            if (!/432 x 648 pts/.test(info.pageSize)) {
                throw new Error(`${layout.slug} expected 6x9 page size (432 x 648 pts), got "${info.pageSize}"`);
            }
            if (layout.expectedPageText?.length) {
                const missing = layout.expectedPageText.filter(({ page, text }) => !pdfText(pdfPath, page).includes(text));
                if (missing.length > 0) {
                    throw new Error(`${layout.slug} PDF page text is missing expected header/body text: ${missing.map(({ page, text }) => `page ${page}: ${text}`).join(', ')}`);
                }
            }
            if (layout.forbiddenPageText?.length) {
                const present = layout.forbiddenPageText.filter(({ page, text }) => pdfText(pdfPath, page).includes(text));
                if (present.length > 0) {
                    throw new Error(`${layout.slug} PDF page text contains forbidden text: ${present.map(({ page, text }) => `page ${page}: ${text}`).join(', ')}`);
                }
            }
            if (visual) {
                const actualPages = rasterize(pdfPath, join(layoutDir, 'pages'));
                if (updateBaselines) {
                    updateBaseline(layout.slug, actualPages);
                } else {
                    const diffPixels = compareBaseline(layout.slug, actualPages, join(layoutDir, 'diffs'));
                    if (diffPixels > 0) {
                        throw new Error(`${layout.slug} visual baseline differs by ${diffPixels} pixels. Diffs: ${join(layoutDir, 'diffs')}`);
                    }
                }
            }
            console.log(`✓ ${layout.slug}: ${layout.expectedPages} pages`);
        } catch (error) {
            failures.push(error instanceof Error ? error.message : String(error));
            console.error(`✗ ${layout.slug}: ${failures[failures.length - 1]}`);
        }
    }

    if (updateBaselines) writeReadme();

    if (failures.length > 0) {
        if (!keepOutput) console.error(`Artifacts preserved for debugging: ${outputRoot}`);
        process.exitCode = 1;
        return;
    }

    if (!keepOutput && !updateBaselines) {
        rmSync(outputRoot, { recursive: true, force: true });
    }

    console.log(updateBaselines
        ? `Updated PDF visual baselines in ${baselineRoot}`
        : `Publishing PDF QA passed.${keepOutput ? ` Artifacts: ${outputRoot}` : ''}`);
}

main();
