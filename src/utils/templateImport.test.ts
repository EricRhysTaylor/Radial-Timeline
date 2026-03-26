import { describe, expect, it } from 'vitest';
import { normalizePath, TFile, TFolder } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import type { RadialTimelineSettings } from '../types';
import { DEFAULT_SETTINGS } from '../settings/defaults';
import { buildImportedTemplateCandidate, buildImportedTemplateId, compactTemplatePathForStorage } from './templateImport';

function createPluginWithFiles(files: Record<string, string>): RadialTimelinePlugin {
    const fileMap = new Map<string, { file: TFile; content: string }>();
    const folders = new Set<string>();
    const vault = {
        getAbstractFileByPath: (input: string) => {
            const key = normalizePath(input);
            const entry = fileMap.get(key);
            if (entry) return entry.file;
            if (folders.has(key)) return new TFolder(key);
            return null;
        },
        getFiles: () => Array.from(fileMap.values()).map(entry => entry.file),
        read: async (file: TFile) => fileMap.get(normalizePath(file.path))?.content || '',
        modify: async () => undefined,
        create: async (input: string, content: string) => {
            const key = normalizePath(input);
            const file = new TFile(key);
            fileMap.set(key, { file, content });
            return file;
        },
        createFolder: async (input: string) => {
            folders.add(normalizePath(input));
            return new TFolder(normalizePath(input));
        },
    } as unknown as RadialTimelinePlugin['app']['vault'];

    Object.entries(files).forEach(([path, content]) => {
        const key = normalizePath(path);
        fileMap.set(key, { file: new TFile(key), content });
    });

    const settings: RadialTimelineSettings = {
        ...DEFAULT_SETTINGS,
        pandocFolder: 'Radial Timeline/Pandoc',
        pandocLayouts: [],
    };

    return {
        settings,
        app: { vault } as RadialTimelinePlugin['app'],
    } as unknown as RadialTimelinePlugin;
}

describe('templateImport helper', () => {
    it('infers screenplay classification and preserves profile IDs', async () => {
        const plugin = createPluginWithFiles({
            'Templates/screenplay.tex': [
                '\\documentclass{article}',
                '\\begin{document}',
                'INT. OFFICE - DAY',
                'CHARACTER',
                'Dialogue line',
                '$body$',
                '\\end{document}',
            ].join('\n'),
        });

        const candidate = await buildImportedTemplateCandidate(plugin, { sourcePath: 'Templates/screenplay.tex' });

        expect(candidate.layout.preset).toBe('screenplay');
        expect(candidate.profile.id).toBe(candidate.layout.id);
        expect(candidate.profile.usageContexts).toEqual(['screenplay']);
        expect(candidate.profile.outputIntent).toBe('screenplay-pdf');
        expect(candidate.detectedTemplate.usageContext).toBe('screenplay');
        expect(candidate.canActivate).toBe(true);
    });

    it('blocks activation when the template is missing $body$', async () => {
        const plugin = createPluginWithFiles({
            'Templates/bad.tex': [
                '\\documentclass{book}',
                '\\begin{document}',
                'No body marker here',
                '\\end{document}',
            ].join('\n'),
        });

        const candidate = await buildImportedTemplateCandidate(plugin, { sourcePath: 'Templates/bad.tex' });

        expect(candidate.canActivate).toBe(false);
        expect(candidate.issues.some(issue => issue.code === 'import_missing_body')).toBe(true);
    });

    it('keeps pandoc-folder storage compact for relative paths', () => {
        const plugin = createPluginWithFiles({});
        const stored = compactTemplatePathForStorage(plugin, 'Radial Timeline/Pandoc/custom.tex');
        expect(stored).toBe('custom.tex');
        expect(buildImportedTemplateId('My Template', 'novel', ['imported-my-template-novel'])).toBe('imported-my-template-novel-2');
    });
});
