import { describe, expect, it } from 'vitest';
import { TFile, TFolder, normalizePath } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import type { RadialTimelineSettings } from '../types/settings';
import { DEFAULT_SETTINGS } from '../settings/defaults';
import { validatePandocLayout } from './exportFormats';
import { ensureBundledLayoutInstalledForExport, ensureBundledPandocLayoutsRegistered, getBundledPandocLayouts } from './pandocBundledLayouts';

function createPluginWithBundledLayout(layoutId: string): { plugin: RadialTimelinePlugin; layout: ReturnType<typeof getBundledPandocLayouts>[number] } {
    const layout = getBundledPandocLayouts().find(item => item.id === layoutId);
    if (!layout) throw new Error(`Missing bundled layout: ${layoutId}`);

    const files = new Map<string, { file: TFile; content: string }>();
    const folders = new Set<string>();

    const vault = {
        getAbstractFileByPath: (input: string) => {
            const key = normalizePath(input);
            const entry = files.get(key);
            if (entry) return entry.file;
            if (folders.has(key)) return new TFolder(key);
            return null;
        },
        createFolder: async (input: string) => {
            const key = normalizePath(input);
            folders.add(key);
            return new TFolder(key);
        },
        create: async (input: string, content: string) => {
            const key = normalizePath(input);
            const file = new TFile(key);
            files.set(key, { file, content });
            return file;
        },
        read: async (file: TFile) => {
            const key = normalizePath(file.path);
            return files.get(key)?.content || '';
        },
        modify: async (file: TFile, content: string) => {
            const key = normalizePath(file.path);
            const existing = files.get(key);
            if (existing) {
                existing.content = content;
            } else {
                files.set(key, { file, content });
            }
        }
    } as unknown as RadialTimelinePlugin['app']['vault'];

    const settings: RadialTimelineSettings = {
        ...DEFAULT_SETTINGS,
        pandocFolder: 'Radial Timeline/Pandoc',
        pandocLayouts: [layout]
    };

    const plugin = {
        settings,
        app: { vault }
    } as unknown as RadialTimelinePlugin;

    return { plugin, layout };
}

describe('bundled pandoc layout export auto-install', () => {
    it('registers a four-layout bundled fiction set', () => {
        const fictionLayouts = getBundledPandocLayouts().filter(layout => layout.preset === 'novel');
        expect(fictionLayouts).toHaveLength(4);
        expect(fictionLayouts.map(layout => layout.name)).toEqual([
            'Signature Literary',
            'Basic Manuscript',
            'Contemporary Literary',
            'Modern Classic'
        ]);
        expect(fictionLayouts.map(layout => layout.path)).toEqual([
            'rt_signature_literary.tex',
            'rt_classic_manuscript.tex',
            'rt_contemporary_literary.tex',
            'rt_modern_classic.tex'
        ]);
        const modernClassic = fictionLayouts.find(layout => layout.id === 'bundled-fiction-modern-classic');
        expect(modernClassic?.usesModernClassicStructure).toBe(true);
        expect(modernClassic?.hasEpigraphs).toBe(true);
        const signature = fictionLayouts.find(layout => layout.id === 'bundled-fiction-signature-literary');
        expect(signature?.hasSceneOpenerHeadingOptions).toBe(true);
    });

    it('installs missing bundled .tex template and then validates successfully', async () => {
        const { plugin, layout } = createPluginWithBundledLayout('bundled-fiction-signature-literary');

        const before = validatePandocLayout(plugin, layout);
        expect(before.valid).toBe(false);

        const install = await ensureBundledLayoutInstalledForExport(plugin, layout);
        expect(install.installed).toBe(true);
        expect(install.failed).toBe(false);

        const after = validatePandocLayout(plugin, layout);
        expect(after.valid).toBe(true);
    });

    it('hotfixes legacy signature literary spacing in existing bundled template files', async () => {
        const { plugin, layout } = createPluginWithBundledLayout('bundled-fiction-signature-literary');
        const target = normalizePath(`${plugin.settings.pandocFolder}/${layout.path}`);
        const legacy = [
            '\\titlespacing*{\\section}{0pt}{\\dimexpr\\textheight/5\\relax}{\\dimexpr\\textheight/5\\relax}',
            '\\titlespacing*{\\subsection}{0pt}{\\dimexpr\\textheight/5\\relax}{\\dimexpr\\textheight/5\\relax}'
        ].join('\n');

        await (plugin.app.vault as any).createFolder(plugin.settings.pandocFolder);
        await (plugin.app.vault as any).create(target, legacy);

        const result = await ensureBundledLayoutInstalledForExport(plugin, layout);
        expect(result.installed).toBe(false);
        expect(result.failed).toBe(false);

        const file = plugin.app.vault.getAbstractFileByPath(target) as TFile;
        const updated = await (plugin.app.vault as any).read(file);
        expect(updated).toContain('\\titlespacing*{\\section}{0pt}{0.2\\textheight}{0.2\\textheight}');
        expect(updated).toContain('\\titlespacing*{\\subsection}{0pt}{0.2\\textheight}{0.2\\textheight}');
        expect(updated).not.toContain('\\dimexpr\\textheight/5\\relax');
    });

    it('migrates legacy bundled signature ids/paths and avoids duplicate bundled entries', () => {
        const { plugin } = createPluginWithBundledLayout('bundled-fiction-signature-literary');
        plugin.settings.pandocLayouts = [
            {
                id: 'bundled-novel',
                name: 'Novel Manuscript (ST)',
                preset: 'novel',
                path: 'signature_literary_rt.tex',
                bundled: true
            },
            {
                id: 'bundled-fiction-signature-literary',
                name: 'Signature Literary',
                preset: 'novel',
                path: 'rt_signature_literary.tex',
                bundled: true
            }
        ];

        const changed = ensureBundledPandocLayoutsRegistered(plugin);
        expect(changed).toBe(true);

        const bundledFiction = (plugin.settings.pandocLayouts || [])
            .filter(layout => layout.bundled && layout.preset === 'novel');
        expect(bundledFiction).toHaveLength(4);
        expect(bundledFiction.map(layout => layout.id).sort()).toEqual([
            'bundled-fiction-classic-manuscript',
            'bundled-fiction-contemporary-literary',
            'bundled-fiction-modern-classic',
            'bundled-fiction-signature-literary'
        ]);

        const signature = bundledFiction.find(layout => layout.id === 'bundled-fiction-signature-literary');
        expect(signature?.name).toBe('Signature Literary');
        expect(signature?.path).toBe('rt_signature_literary.tex');
    });
});
