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

        expect(assembled.text).toContain('\\section*{3 Arrival}');
        expect(assembled.text).toContain('\\thispagestyle{empty}');
        expect(assembled.text).not.toContain('## 3 Arrival');
    });
});
