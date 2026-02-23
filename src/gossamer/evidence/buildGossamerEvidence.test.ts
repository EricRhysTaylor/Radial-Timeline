import { describe, expect, it } from 'vitest';
import type { MetadataCache, Vault } from 'obsidian';
import { TFile } from 'obsidian';
import { buildGossamerEvidenceDocument } from './buildGossamerEvidence';

describe('buildGossamerEvidenceDocument', () => {
    const sceneFile = new TFile('Book 1/01 Scene.md');

    const makeVault = (rawByPath: Record<string, string>): Vault => ({
        read: async (target: TFile) => rawByPath[target.path] || '',
    } as unknown as Vault);

    const makeMetadataCache = (frontmatterByPath: Record<string, Record<string, unknown>>): MetadataCache => ({
        getFileCache: (target: TFile) => ({ frontmatter: frontmatterByPath[target.path] || {} }),
    } as unknown as MetadataCache);

    it('uses Summary fields in summaries mode', async () => {
        const raw = `---
Class: Scene
id: scn_a1b2c3d4
Summary: Frontmatter summary
---
This body should not appear in summaries mode.`;

        const result = await buildGossamerEvidenceDocument({
            sceneFiles: [sceneFile],
            vault: makeVault({ [sceneFile.path]: raw }),
            metadataCache: makeMetadataCache({
                [sceneFile.path]: {
                    Class: 'scene',
                    id: 'scn_a1b2c3d4',
                    Summary: 'Frontmatter summary'
                }
            }),
            evidenceMode: 'summaries'
        });

        expect(result.text).toContain('Frontmatter summary');
        expect(result.text).not.toContain('This body should not appear in summaries mode.');
        expect(result.text).toContain('(scn_a1b2c3d4)');
    });

    it('uses cleaned scene bodies in bodies mode', async () => {
        const raw = `---
Class: Scene
id: scn_deadbeef
Summary: Frontmatter summary
---
Visible body.
<!-- hidden -->
%% remove %%
More body.`;

        const result = await buildGossamerEvidenceDocument({
            sceneFiles: [sceneFile],
            vault: makeVault({ [sceneFile.path]: raw }),
            metadataCache: makeMetadataCache({
                [sceneFile.path]: {
                    Class: 'scene',
                    id: 'scn_deadbeef',
                    Summary: 'Frontmatter summary'
                }
            }),
            evidenceMode: 'bodies'
        });

        expect(result.text).toContain('Visible body.');
        expect(result.text).toContain('More body.');
        expect(result.text).not.toContain('Class: Scene');
        expect(result.text).not.toContain('hidden');
        expect(result.text).not.toContain('remove');
        expect(result.text).toContain('(scn_deadbeef)');
    });
});
