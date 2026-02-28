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

    it('injects Modern Classic part/chapter/scene markers and suppresses scene headings', async () => {
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
                modernClassicStructure: {
                    enabled: true,
                    actEpigraphs: ['The beginning of all things.', 'A turn into possibility.'],
                    actEpigraphAttributions: ['Anonymous', 'The Narrator'],
                    beatDefinitions: [
                        { name: 'Opening Image', actIndex: 1, chapterBreak: true, chapterTitle: 'Boy {with a} \\Skull' },
                        { name: 'Midpoint', actIndex: 1, chapterBreak: false },
                        { name: 'Break into 3', actIndex: 2, chapterBreak: true, chapterTitle: 'Everything of Possibility.' }
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
});
