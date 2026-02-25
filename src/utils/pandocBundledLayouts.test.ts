import { describe, expect, it } from 'vitest';
import { TFile, TFolder, normalizePath } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import type { RadialTimelineSettings } from '../types/settings';
import { DEFAULT_SETTINGS } from '../settings/defaults';
import { validatePandocLayout } from './exportFormats';
import { ensureBundledLayoutInstalledForExport, getBundledPandocLayouts } from './pandocBundledLayouts';

function createPluginWithBundledLayout(layoutId: string): { plugin: RadialTimelinePlugin; layout: ReturnType<typeof getBundledPandocLayouts>[number] } {
    const layout = getBundledPandocLayouts().find(item => item.id === layoutId);
    if (!layout) throw new Error(`Missing bundled layout: ${layoutId}`);

    const files = new Map<string, TFile>();
    const folders = new Set<string>();

    const vault = {
        getAbstractFileByPath: (input: string) => {
            const key = normalizePath(input);
            const file = files.get(key);
            if (file) return file;
            if (folders.has(key)) return new TFolder(key);
            return null;
        },
        createFolder: async (input: string) => {
            const key = normalizePath(input);
            folders.add(key);
            return new TFolder(key);
        },
        create: async (input: string, _content: string) => {
            const key = normalizePath(input);
            const file = new TFile(key);
            files.set(key, file);
            return file;
        }
    } as unknown as RadialTimelinePlugin['app']['vault'];

    const settings: RadialTimelineSettings = {
        ...DEFAULT_SETTINGS,
        pandocFolder: 'Pandoc',
        pandocLayouts: [layout]
    };

    const plugin = {
        settings,
        app: { vault }
    } as unknown as RadialTimelinePlugin;

    return { plugin, layout };
}

describe('bundled pandoc layout export auto-install', () => {
    it('installs missing bundled .tex template and then validates successfully', async () => {
        const { plugin, layout } = createPluginWithBundledLayout('bundled-novel-signature-literary-rt');

        const before = validatePandocLayout(plugin, layout);
        expect(before.valid).toBe(false);

        const install = await ensureBundledLayoutInstalledForExport(plugin, layout);
        expect(install.installed).toBe(true);
        expect(install.failed).toBe(false);

        const after = validatePandocLayout(plugin, layout);
        expect(after.valid).toBe(true);
    });
});
