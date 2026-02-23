import { describe, expect, it } from 'vitest';
import type { MetadataCache, Vault } from 'obsidian';
import { TFile } from 'obsidian';
import { cleanEvidenceBody } from '../../inquiry/utils/evidenceCleaning';
import {
    FORECAST_CHARS_PER_TOKEN,
    FORECAST_PROMPT_OVERHEAD_TOKENS,
    estimateInquiryTokens
} from './estimateTokensFromVault';

describe('estimateInquiryTokens', () => {
    const file = new TFile('Book 1/01 Scene.md');

    const makeVault = (rawByPath: Record<string, string>): Vault => ({
        getMarkdownFiles: () => [file],
        read: async (target: TFile) => rawByPath[target.path] || '',
    } as unknown as Vault);

    const makeMetadataCache = (frontmatterByPath: Record<string, Record<string, unknown>>): MetadataCache => ({
        getFileCache: (target: TFile) => ({ frontmatter: frontmatterByPath[target.path] || {} }),
    } as unknown as MetadataCache);

    it('applies cleanEvidenceBody before counting body evidence', async () => {
        const raw = `---
Class: Scene
Summary: A short summary
---
Before.
<!-- hidden -->
%% remove %%
After.`;
        const cleaned = cleanEvidenceBody(raw);
        const label = `scene: ${file.path}`;
        const expectedChars = label.length + cleaned.length + 6;
        const expectedTokens = Math.ceil(expectedChars / FORECAST_CHARS_PER_TOKEN) + FORECAST_PROMPT_OVERHEAD_TOKENS;

        const result = await estimateInquiryTokens({
            vault: makeVault({ [file.path]: raw }),
            metadataCache: makeMetadataCache({
                [file.path]: { Class: 'scene', Summary: 'A short summary' }
            }),
            inquirySources: {
                scanRoots: ['/Book 1/'],
                resolvedScanRoots: ['/Book 1/'],
                classScope: ['/'],
                classes: [{
                    className: 'scene',
                    enabled: true,
                    bookScope: 'full',
                    sagaScope: 'none',
                    referenceScope: 'none'
                }]
            }
        });

        expect(result.evidenceLabel).toBe('Bodies');
        expect(result.evidenceChars).toBe(expectedChars);
        expect(result.estimatedInputTokens).toBe(expectedTokens);
    });

    it('counts only Summary field content when summaries mode is active', async () => {
        const raw = `---
Class: Scene
Summary: Summary only evidence.
---
This very long body should not be counted when summary mode is selected.`;
        const summary = 'Summary only evidence.';
        const label = `scene: ${file.path}`;
        const expectedChars = label.length + summary.length + 6;
        const expectedTokens = Math.ceil(expectedChars / FORECAST_CHARS_PER_TOKEN) + FORECAST_PROMPT_OVERHEAD_TOKENS;

        const result = await estimateInquiryTokens({
            vault: makeVault({ [file.path]: raw }),
            metadataCache: makeMetadataCache({
                [file.path]: { Class: 'scene', Summary: summary }
            }),
            inquirySources: {
                scanRoots: ['/Book 1/'],
                resolvedScanRoots: ['/Book 1/'],
                classScope: ['/'],
                classes: [{
                    className: 'scene',
                    enabled: true,
                    bookScope: 'summary',
                    sagaScope: 'none',
                    referenceScope: 'none'
                }]
            }
        });

        expect(result.evidenceLabel).toBe('Summaries');
        expect(result.evidenceChars).toBe(expectedChars);
        expect(result.estimatedInputTokens).toBe(expectedTokens);
    });
});
