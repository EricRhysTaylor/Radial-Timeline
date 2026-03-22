import { describe, expect, it } from 'vitest';
import type { App, TFile } from 'obsidian';
import { SceneDataService } from './SceneDataService';
import { DEFAULT_SETTINGS } from '../settings/defaults';

function makeFile(path: string): TFile {
    const basename = path.split('/').pop()?.replace(/\.md$/i, '') ?? path;
    return {
        path,
        basename,
    } as TFile;
}

describe('SceneDataService beat ingest', () => {
    it('loads legacy Description as canonical Purpose without carrying Description internally', async () => {
        const beatFile = makeFile('Story/1 Cold Open.md');
        const app = {
            vault: {
                getMarkdownFiles: () => [beatFile],
            },
            metadataCache: {
                getFileCache: () => ({
                    frontmatter: {
                        Class: 'Beat',
                        Description: 'Legacy purpose',
                        'Beat Model': 'Custom',
                        Act: 1,
                    }
                })
            }
        } as unknown as App;

        const service = new SceneDataService(app, {
            ...DEFAULT_SETTINGS,
            beatSystem: 'Custom',
            sourcePath: 'Story',
        });

        const items = await service.getSceneData();
        const beat = items.find((item) => item.itemType === 'Beat');

        expect(beat).toBeDefined();
        expect(beat?.Purpose).toBe('Legacy purpose');
        expect('Description' in (beat ?? {})).toBe(false);
    });
});
