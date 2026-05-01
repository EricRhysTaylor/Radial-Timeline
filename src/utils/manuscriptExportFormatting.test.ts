import { describe, expect, it } from 'vitest';
import type { TFile, Vault } from 'obsidian';
import { assembleManuscript } from './manuscript';

function makeFile(path: string, basename: string): TFile {
    return { path, basename } as TFile;
}

function makeVault(contents: Record<string, string>): Vault {
    return {
        read: async (file: TFile) => contents[file.path] || ''
    } as unknown as Vault;
}

describe('assembleManuscript scene heading formatting', () => {
    it('renders title-only scene headings when requested', async () => {
        const file = makeFile('Scenes/10 Opening Beat.md', '10 Opening Beat');
        const vault = makeVault({
            [file.path]: '---\nClass: Scene\n---\n\nBody text.'
        });

        const assembled = await assembleManuscript(
            [file],
            vault,
            undefined,
            false,
            undefined,
            false,
            undefined,
            undefined,
            { sceneHeadingMode: 'title-only' }
        );

        expect(assembled.text).toContain('## Opening Beat');
        expect(assembled.text).not.toContain('## 10 Opening Beat');
    });

    it('renders scene-number-only headings when requested', async () => {
        const file = makeFile('Scenes/22 Break-in.md', '22 Break-in');
        const vault = makeVault({
            [file.path]: 'Action.'
        });

        const assembled = await assembleManuscript(
            [file],
            vault,
            undefined,
            false,
            undefined,
            false,
            undefined,
            undefined,
            { sceneHeadingMode: 'scene-number' }
        );

        expect(assembled.text).toContain('## 22');
        expect(assembled.text).not.toContain('## 22 Break-in');
    });

    it('uses raw LaTeX section openers for latex-section render mode', async () => {
        const file = makeFile('Scenes/3 Arrival.md', '3 Arrival');
        const vault = makeVault({
            [file.path]: 'Paragraph.'
        });

        const assembled = await assembleManuscript(
            [file],
            vault,
            undefined,
            false,
            undefined,
            false,
            undefined,
            undefined,
            {
                sceneHeadingMode: 'scene-number-title',
                sceneHeadingRenderMode: 'latex-section-starred'
            }
        );

        expect(assembled.text).toContain('\\section*{3\\\\[0.25em]{\\normalsize\\itshape (Arrival)}}');
        expect(assembled.text).toContain('\\thispagestyle{empty}');
        expect(assembled.text).not.toContain('## 3 Arrival');
    });

    it('can render Standard Manuscript scene opener pages as number-only raw LaTeX', async () => {
        const file = makeFile('Scenes/1 Training at Academy Field.md', '1 Training at Academy Field');
        const vault = makeVault({
            [file.path]: 'First paragraph.'
        });

        const assembled = await assembleManuscript(
            [file],
            vault,
            undefined,
            false,
            undefined,
            false,
            undefined,
            undefined,
            {
                sceneHeadingMode: 'scene-number',
                sceneHeadingRenderMode: 'latex-section-starred'
            }
        );

        expect(assembled.text).toContain('\\section*{1}\n\\thispagestyle{empty}');
        expect(assembled.text).toContain('First paragraph.');
        expect(assembled.text).not.toContain('Training at Academy Field');
        expect(assembled.text).not.toContain('## 1');
    });

    it('omits chapter marker headings when chapter markers are not passed to assembly', async () => {
        const file = makeFile('Scenes/1 Training at Academy Field.md', '1 Training at Academy Field');
        const vault = makeVault({
            [file.path]: 'First paragraph.'
        });

        const assembled = await assembleManuscript(
            [file],
            vault,
            undefined,
            false,
            undefined,
            false,
            undefined,
            undefined,
            {
                sceneHeadingMode: 'scene-number',
                sceneHeadingRenderMode: 'latex-section-starred',
                chapterMarkersByScenePath: {}
            }
        );

        expect(assembled.text).not.toContain('# Shail + Trisan');
        expect(assembled.text).not.toContain('\\section*{Shail + Trisan}');
        expect(assembled.text).toContain('\\section*{1}');
    });

    it('injects shared Chapter field headings before scene content and suppresses scene headings in Modern Classic mode', async () => {
        const scene1 = makeFile('Scenes/1 Opening.md', '1 Opening');
        const scene2 = makeFile('Scenes/2 Midpoint.md', '2 Midpoint');
        const scene3 = makeFile('Scenes/3 Turn.md', '3 Turn');
        const vault = makeVault({
            [scene1.path]: '---\nClass: Scene\nBeat: Opening Image\n---\n\nFirst body.',
            [scene2.path]: '---\nClass: Scene\nBeat: Midpoint\n---\n\nSecond body.',
            [scene3.path]: '---\nClass: Scene\nBeat: Break into 3\n---\n\nThird body.'
        });

        const assembled = await assembleManuscript(
            [scene1, scene2, scene3],
            vault,
            undefined,
            false,
            undefined,
            false,
            undefined,
            undefined,
            {
                sceneHeadingMode: 'scene-number-title',
                sceneHeadingRenderMode: 'markdown-h2',
                chapterMarkersByScenePath: {
                    [scene1.path]: [{
                        sourcePath: 'Beats/1 Opening Image.md',
                        sourceType: 'Beat',
                        title: 'Boy with a Skull',
                        resolvedScenePath: scene1.path,
                        resolvedTimelinePosition: 1,
                    }],
                    [scene3.path]: [{
                        sourcePath: 'Backdrop/2 Turn.md',
                        sourceType: 'Backdrop',
                        title: 'Everything of Possibility.',
                        resolvedScenePath: scene3.path,
                        resolvedTimelinePosition: 3,
                    }]
                },
                modernClassicStructure: {
                    enabled: true,
                    actEpigraphs: ['The beginning of all things.', 'A turn into possibility.'],
                    actEpigraphAttributions: ['Anonymous', 'The Narrator'],
                    beatDefinitions: [
                        { name: 'Opening Image', actIndex: 1 },
                        { name: 'Midpoint', actIndex: 1 },
                        { name: 'Break into 3', actIndex: 2 }
                    ]
                }
            }
        );

        expect(assembled.text).toContain('\\rtPart{I}');
        expect(assembled.text).toContain('\\rtPart{II}');
        expect(assembled.text).toContain('\\rtEpigraph{The beginning of all things.}{Anonymous}');
        expect(assembled.text).toContain('\\rtEpigraph{A turn into possibility.}{The Narrator}');
        expect(assembled.text).toContain('\\rtChapter{1}{Boy with a Skull}');
        expect(assembled.text).toContain('\\rtChapter{2}{Everything of Possibility.}');

        const partOneIndex = assembled.text.indexOf('\\rtPart{I}');
        const partTwoIndex = assembled.text.indexOf('\\rtPart{II}');
        const partOneEpigraphIndex = assembled.text.indexOf('\\rtEpigraph{The beginning of all things.}{Anonymous}');
        const partTwoEpigraphIndex = assembled.text.indexOf('\\rtEpigraph{A turn into possibility.}{The Narrator}');
        const chapterTwoIndex = assembled.text.indexOf('\\rtChapter{2}{Everything of Possibility.}');
        expect(partOneEpigraphIndex).toBeGreaterThan(partOneIndex);
        expect(partTwoEpigraphIndex).toBeGreaterThan(partTwoIndex);
        expect(partTwoIndex).toBeGreaterThanOrEqual(0);
        expect(chapterTwoIndex).toBeGreaterThan(partTwoIndex);

        const sceneSepCount = (assembled.text.match(/\\rtSceneSep/g) || []).length;
        expect(sceneSepCount).toBe(1);

        const emittedRtMacros = Array.from(new Set(
            Array.from(assembled.text.matchAll(/\\(rt[A-Za-z]+)/g)).map(match => match[1])
        )).sort();
        expect(emittedRtMacros).toEqual([
            'rtChapter',
            'rtEpigraph',
            'rtPart',
            'rtSceneSep',
        ]);

        expect(assembled.text).not.toContain('## 1 Opening');
        expect(assembled.text).not.toContain('## 2 Midpoint');
        expect(assembled.text).not.toContain('## 3 Turn');
        expect(assembled.text).toContain('First body.');
        expect(assembled.text).toContain('Second body.');
        expect(assembled.text).toContain('Third body.');
    });

    it('suppresses headers and footers across matter runs when enabled', async () => {
        const matter = makeFile('Matter/0.1 Title Page.md', '0.1 Title Page');
        const scene = makeFile('Scenes/1 Opening.md', '1 Opening');
        const vault = makeVault({
            [matter.path]: '---\nClass: Frontmatter\nRole: title-page\nBodyMode: plain\n---\n\nMatter body.',
            [scene.path]: 'Scene body.'
        });

        const assembled = await assembleManuscript(
            [matter, scene],
            vault,
            undefined,
            false,
            undefined,
            false,
            undefined,
            undefined,
            {
                sceneHeadingMode: 'scene-number-title',
                sceneHeadingRenderMode: 'markdown-h2',
                suppressMatterPageChrome: true
            }
        );

        expect(assembled.text).toContain('\\clearpage\\pagestyle{empty}\\thispagestyle{empty}');
        expect(assembled.text).toContain('\\clearpage\\pagestyle{fancy}');
        expect(assembled.text).toContain('Matter body.');
        expect(assembled.text).toContain('Scene body.');
    });

    it('keeps standard manuscript-style assembly on the existing $body$ path', async () => {
        const file = makeFile('Scenes/1 Opening.md', '1 Opening');
        const vault = makeVault({
            [file.path]: 'First paragraph.\n\nSecond paragraph.'
        });

        const assembled = await assembleManuscript(
            [file],
            vault,
            undefined,
            false,
            undefined,
            false,
            undefined,
            undefined,
            {
                sceneHeadingMode: 'scene-number-title',
                sceneHeadingRenderMode: 'markdown-h2'
            }
        );

        expect(assembled.text).toBe('## 1 Opening\n\nFirst paragraph.\n\nSecond paragraph.\n\n');
        expect(assembled.totalScenes).toBe(1);
        expect(assembled.scenes[0]).toMatchObject({
            title: '1 Opening',
            bodyText: 'First paragraph.\n\nSecond paragraph.',
        });
    });
});

describe('assembleManuscript SceneId surfacing', () => {
    it('appends SceneId to each TOC entry when includeSceneIdInToc is on', async () => {
        const a = makeFile('Scenes/1 Opening.md', '1 Opening');
        const b = makeFile('Scenes/2 Hallway.md', '2 Hallway');
        const c = makeFile('Scenes/3 Therapist.md', '3 Therapist');
        const vault = makeVault({
            [a.path]: '---\nClass: Scene\nSceneId: scn_a1b2c3\n---\n\nA body.',
            [b.path]: '---\nClass: Scene\nSceneId: scn_d4e5f6\n---\n\nB body.',
            [c.path]: '---\nClass: Scene\n---\n\nC body.', // no SceneId
        });

        const assembled = await assembleManuscript(
            [a, b, c],
            vault,
            undefined,
            false, // useObsidianLinks → plain text TOC
            undefined,
            true, // includeToc
            undefined,
            undefined,
            { includeSceneIdInToc: true }
        );

        expect(assembled.text).toContain('# TABLE OF CONTENTS');
        expect(assembled.text).toMatch(/1\.\s.*\(\d+ words\)\s+`scn_a1b2c3`/);
        expect(assembled.text).toMatch(/2\.\s.*\(\d+ words\)\s+`scn_d4e5f6`/);
        expect(assembled.text).toMatch(/3\.\s.*\(\d+ words\)\s+`\(no SceneId\)`/);
    });

    it('omits SceneId from TOC when includeSceneIdInToc is off', async () => {
        const a = makeFile('Scenes/1 Opening.md', '1 Opening');
        const vault = makeVault({
            [a.path]: '---\nClass: Scene\nSceneId: scn_a1b2c3\n---\n\nBody.',
        });

        const assembled = await assembleManuscript(
            [a],
            vault,
            undefined,
            false,
            undefined,
            true,
            undefined,
            undefined,
            { includeSceneIdInToc: false }
        );

        // Backtick-wrapped SceneId is only emitted by the TOC formatter.
        // (extractBodyText leaves raw frontmatter inside the body, so a bare-string assertion
        // would false-positive on the literal "SceneId: scn_..." line.)
        expect(assembled.text).not.toContain('`scn_a1b2c3`');
    });

    it('appends SceneId to scene heading body when includeSceneIdInHeading is on', async () => {
        const a = makeFile('Scenes/6 Trisan Therapist.md', '6 Trisan Therapist');
        const vault = makeVault({
            [a.path]: '---\nClass: Scene\nSceneId: scn_xyz789\n---\n\nScene body.',
        });

        const assembled = await assembleManuscript(
            [a],
            vault,
            undefined,
            false,
            undefined,
            false,
            undefined,
            undefined,
            { includeSceneIdInHeading: true }
        );

        expect(assembled.text).toContain('## 6 Trisan Therapist `scn_xyz789`');
    });

    it('can append plain SceneId text for Pandoc PDF headings', async () => {
        const a = makeFile('Scenes/6 Trisan Therapist.md', '6 Trisan Therapist');
        const vault = makeVault({
            [a.path]: '---\nClass: Scene\nSceneId: scn_xyz789\n---\n\nScene body.',
        });

        const assembled = await assembleManuscript(
            [a],
            vault,
            undefined,
            false,
            undefined,
            true,
            undefined,
            undefined,
            { includeSceneIdInToc: true, includeSceneIdInHeading: true, sceneIdFormat: 'plain' }
        );

        expect(assembled.text).toContain('## 6 Trisan Therapist scn_xyz789');
        expect(assembled.text).toMatch(/1\.\s.*\(\d+ words\)\s+scn_xyz789/);
        expect(assembled.text).not.toContain('`scn_xyz789`');
    });

    it('does not append SceneId to scene heading when missing from frontmatter', async () => {
        const a = makeFile('Scenes/6 Trisan Therapist.md', '6 Trisan Therapist');
        const vault = makeVault({
            [a.path]: '---\nClass: Scene\n---\n\nBody.',
        });

        const assembled = await assembleManuscript(
            [a],
            vault,
            undefined,
            false,
            undefined,
            false,
            undefined,
            undefined,
            { includeSceneIdInHeading: true }
        );

        // No backtick suffix when SceneId is absent.
        expect(assembled.text).toContain('## 6 Trisan Therapist\n');
        expect(assembled.text).not.toMatch(/Therapist\s+`/);
    });

    it('keeps SceneIds in TOC out of scene body headings by default', async () => {
        const a = makeFile('Scenes/1 Opening.md', '1 Opening');
        const vault = makeVault({
            [a.path]: '---\nClass: Scene\nSceneId: scn_a1b2c3\n---\n\nBody.',
        });

        const assembled = await assembleManuscript(
            [a],
            vault,
            undefined,
            false,
            undefined,
            true,
            undefined,
            undefined,
            { includeSceneIdInToc: true /* heading default off */ }
        );

        expect(assembled.text).toContain('`scn_a1b2c3`'); // in TOC
        expect(assembled.text).toContain('## 1 Opening\n'); // heading clean
    });
});
