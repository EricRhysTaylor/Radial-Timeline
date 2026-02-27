import { describe, expect, it } from 'vitest';
import type { App, TFile } from 'obsidian';
import { runBeatDescriptionToPurposeMigration } from './yamlBackfill';

function makeFile(path: string): TFile {
    const parts = path.split('/');
    const basename = (parts[parts.length - 1] || path).replace(/\.md$/i, '');
    return { path, basename } as TFile;
}

function makeApp(frontmatterByPath: Record<string, Record<string, unknown>>): App {
    return {
        fileManager: {
            processFrontMatter: async (file: TFile, cb: (fm: Record<string, unknown>) => void) => {
                const fm = frontmatterByPath[file.path] ?? {};
                frontmatterByPath[file.path] = fm;
                cb(fm);
            }
        }
    } as unknown as App;
}

describe('runBeatDescriptionToPurposeMigration', () => {
    it('moves Description to Purpose when Purpose is empty and removes Description', async () => {
        const file = makeFile('Story/10.01 Beat.md');
        const frontmatterByPath: Record<string, Record<string, unknown>> = {
            [file.path]: { Class: 'Beat', Description: 'Legacy value', Purpose: '' }
        };
        const app = makeApp(frontmatterByPath);

        const result = await runBeatDescriptionToPurposeMigration({ app, files: [file] });

        expect(result.updated).toBe(1);
        expect(result.movedToPurpose).toBe(1);
        expect(result.removedDescription).toBe(1);
        expect(frontmatterByPath[file.path].Purpose).toBe('Legacy value');
        expect(frontmatterByPath[file.path].Description).toBeUndefined();
    });

    it('removes empty Description without changing non-empty Purpose', async () => {
        const file = makeFile('Story/11.01 Beat.md');
        const frontmatterByPath: Record<string, Record<string, unknown>> = {
            [file.path]: { Class: 'Beat', Description: '   ', Purpose: 'Keep purpose' }
        };
        const app = makeApp(frontmatterByPath);

        const result = await runBeatDescriptionToPurposeMigration({ app, files: [file] });

        expect(result.updated).toBe(1);
        expect(result.movedToPurpose).toBe(0);
        expect(result.removedDescription).toBe(1);
        expect(frontmatterByPath[file.path].Purpose).toBe('Keep purpose');
        expect(frontmatterByPath[file.path].Description).toBeUndefined();
    });

    it('preserves non-empty Description when Purpose already has content', async () => {
        const file = makeFile('Story/12.01 Beat.md');
        const frontmatterByPath: Record<string, Record<string, unknown>> = {
            [file.path]: { Class: 'Beat', Description: 'Legacy note', Purpose: 'Existing purpose' }
        };
        const app = makeApp(frontmatterByPath);

        const result = await runBeatDescriptionToPurposeMigration({ app, files: [file] });

        expect(result.updated).toBe(0);
        expect(result.skipped).toBe(1);
        expect(result.movedToPurpose).toBe(0);
        expect(result.removedDescription).toBe(0);
        expect(frontmatterByPath[file.path].Purpose).toBe('Existing purpose');
        expect(frontmatterByPath[file.path].Description).toBe('Legacy note');
    });
});
