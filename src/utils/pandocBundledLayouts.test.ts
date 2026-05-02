import { describe, expect, it } from 'vitest';
import { TFile, TFolder, normalizePath } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import type { RadialTimelineSettings } from '../types/settings';
import { DEFAULT_SETTINGS } from '../settings/defaults';
import { validatePandocLayout } from './exportFormats';
import {
    HOTFIX_ID_SPEC_DRIFT_OVERWRITE,
    ensureBundledLayoutInstalledForExport,
    ensureBundledPandocLayoutsRegistered,
    getBundledPandocLayoutContent,
    getBundledPandocLayouts,
    installBundledPandocLayouts,
} from './pandocBundledLayouts';

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
            'Standard Manuscript',
            'Contemporary Literary',
            'Signature Literary',
            'Modern Classic'
        ]);
        expect(fictionLayouts.map(layout => layout.path)).toEqual([
            'rt_classic_manuscript.tex',
            'rt_contemporary_literary.tex',
            'rt_signature_literary.tex',
            'rt_modern_classic.tex'
        ]);
        expect(fictionLayouts.map(layout => layout.tier)).toEqual(['free', 'free', 'pro', 'pro']);
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

    it('canonical spec-driven content for each bundled fiction layout has the spec-generator semantic markers', () => {
        // Standard Manuscript / Contemporary Literary: scene-opener macro contract.
        for (const layoutId of ['bundled-fiction-classic-manuscript', 'bundled-fiction-contemporary-literary']) {
            const content = getBundledPandocLayoutContent(layoutId);
            expect(content).toBeTruthy();
            expect(content!).toContain('\\newcommand{\\rtSceneOpenerTitle}[1]');
            expect(content!).toContain('\\newcommand{\\rtSceneOpener}[1]');
            // Old hooks must not regress — they don't fire on \section*{}.
            expect(content!).not.toContain('\\preto\\section{\\clearpage\\thispagestyle{empty}}');
        }

        // Contemporary Literary: macro-driven running headers, no literal labels.
        const contemporary = getBundledPandocLayoutContent('bundled-fiction-contemporary-literary')!;
        expect(contemporary).toMatch(/\\fancyhead\[LE\]\{[^}]*\\BookTitle\}/);
        expect(contemporary).toMatch(/\\fancyhead\[RO\]\{[^}]*\\rtSceneRunningTitle\}/);
        expect(contemporary).not.toContain('\\nouppercase{title}');
        expect(contemporary).not.toContain('\\nouppercase{scene}');
        // Spec-driven chapter spacing now lives inside \rtChapter as
        // \vspace*{0.46\textheight} (the old \titlespacing*{\chapter} hook never
        // fired — assembler emits \rtChapter, not \chapter).
        expect(contemporary).toMatch(/\\newcommand\{\\rtChapter\}[^]*\\vspace\*\{0\.46\\textheight\}/);

        // Signature Literary / Contemporary Literary use symmetric margins.
        for (const layoutId of ['bundled-fiction-signature-literary', 'bundled-fiction-contemporary-literary']) {
            const content = getBundledPandocLayoutContent(layoutId)!;
            expect(content).toContain('  left=0.9in,');
            expect(content).toContain('  right=0.9in');
        }

        // Modern Classic: symmetric margins + assembled-macro contract.
        const modernClassic = getBundledPandocLayoutContent('bundled-fiction-modern-classic')!;
        expect(modernClassic).toContain('  left=0.98in,');
        expect(modernClassic).toContain('  right=0.98in');
        expect(modernClassic).toContain('\\newcommand{\\rtPart}[1]');
        expect(modernClassic).toContain('\\newcommand{\\rtEpigraph}[2]');
        expect(modernClassic).toContain('\\newcommand{\\rtChapter}[2]');
        expect(modernClassic).toContain('\\newcommand{\\rtSceneSep}');
        expect(modernClassic).toContain('\\newcommand{\\BookTitle}{$if(title)$$title$$else$Untitled Manuscript$endif$}');
        expect(modernClassic).toContain('\\newcommand{\\AuthorName}{$if(author)$$for(author)$$author$$sep$, $endfor$$else$Author$endif$}');
        // Unsafe legacy chapter titleformat must not regress.
        expect(modernClassic).not.toContain('\\titleformat{\\chapter}[display]{\\normalfont}{}{0pt}{%');
        expect(modernClassic).not.toContain('Chapter~\\thechapter');
    });

    /**
     * Drift-detect: stale on-disk content for a spec-driven fiction layout is
     * overwritten with the canonical generator output on plugin load. The
     * single hotfix-history entry under id `spec-drift-overwrite-v1` triggers
     * the synthetic 'PDF Templates Updated' alert.
     */
    it('drift-detect: overwrites stale on-disk content with canonical spec output and records one history entry', async () => {
        const { plugin, layout } = createPluginWithBundledLayout('bundled-fiction-contemporary-literary');
        const target = normalizePath(`${plugin.settings.pandocFolder}/${layout.path}`);
        const stale = '% stale\n';

        await (plugin.app.vault as any).createFolder(plugin.settings.pandocFolder);
        await (plugin.app.vault as any).create(target, stale);

        const result = await ensureBundledLayoutInstalledForExport(plugin, layout);
        expect(result.installed).toBe(false);
        expect(result.failed).toBe(false);

        const file = plugin.app.vault.getAbstractFileByPath(target) as TFile;
        const updated = await (plugin.app.vault as any).read(file);
        const canonical = getBundledPandocLayoutContent(layout.id);
        expect(updated).toBe(canonical);

        const history = plugin.settings.templateHotfixHistory ?? [];
        expect(history).toHaveLength(1);
        expect(history[0].layoutId).toBe(layout.id);
        expect(history[0].hotfixId).toBe(HOTFIX_ID_SPEC_DRIFT_OVERWRITE);
        expect(history[0].acknowledged).toBe(false);
    });

    it('drift-detect no-op: on-disk content already matches canonical → no rewrite, no history entry', async () => {
        const { plugin, layout } = createPluginWithBundledLayout('bundled-fiction-contemporary-literary');
        const target = normalizePath(`${plugin.settings.pandocFolder}/${layout.path}`);
        const canonical = getBundledPandocLayoutContent(layout.id)!;

        await (plugin.app.vault as any).createFolder(plugin.settings.pandocFolder);
        await (plugin.app.vault as any).create(target, canonical);

        const result = await ensureBundledLayoutInstalledForExport(plugin, layout);
        expect(result.installed).toBe(false);
        expect(result.failed).toBe(false);

        const file = plugin.app.vault.getAbstractFileByPath(target) as TFile;
        const after = await (plugin.app.vault as any).read(file);
        expect(after).toBe(canonical);

        expect(plugin.settings.templateHotfixHistory ?? []).toEqual([]);
    });

    it('drift-detect per-layout: stale Contemporary + up-to-date Standard yields exactly one history entry', async () => {
        const { plugin, layout: contemporary } = createPluginWithBundledLayout('bundled-fiction-contemporary-literary');
        const standard = getBundledPandocLayouts().find(item => item.id === 'bundled-fiction-classic-manuscript')!;
        // Register both layouts in the plugin so the orchestrator can see both.
        plugin.settings.pandocLayouts = [contemporary, standard];

        const contemporaryTarget = normalizePath(`${plugin.settings.pandocFolder}/${contemporary.path}`);
        const standardTarget = normalizePath(`${plugin.settings.pandocFolder}/${standard.path}`);
        const standardCanonical = getBundledPandocLayoutContent(standard.id)!;

        await (plugin.app.vault as any).createFolder(plugin.settings.pandocFolder);
        await (plugin.app.vault as any).create(contemporaryTarget, '% stale\n');
        await (plugin.app.vault as any).create(standardTarget, standardCanonical);

        await ensureBundledLayoutInstalledForExport(plugin, contemporary);
        await ensureBundledLayoutInstalledForExport(plugin, standard);

        const history = plugin.settings.templateHotfixHistory ?? [];
        expect(history).toHaveLength(1);
        expect(history[0].layoutId).toBe(contemporary.id);
        expect(history[0].hotfixId).toBe(HOTFIX_ID_SPEC_DRIFT_OVERWRITE);
    });

    it('hand-coded non-spec layouts (screenplay, podcast) are not drift-detected: on-disk content is preserved', async () => {
        for (const layoutId of ['bundled-screenplay', 'bundled-podcast']) {
            const { plugin, layout } = createPluginWithBundledLayout(layoutId);
            const target = normalizePath(`${plugin.settings.pandocFolder}/${layout.path}`);
            const userEdit = '% user-edited content for ' + layoutId + '\n';

            await (plugin.app.vault as any).createFolder(plugin.settings.pandocFolder);
            await (plugin.app.vault as any).create(target, userEdit);

            await ensureBundledLayoutInstalledForExport(plugin, layout);

            const file = plugin.app.vault.getAbstractFileByPath(target) as TFile;
            const after = await (plugin.app.vault as any).read(file);
            // Drift-detect skipped: hand-coded layouts are not in the spec-driven set.
            expect(after).toBe(userEdit);
            expect(plugin.settings.templateHotfixHistory ?? []).toEqual([]);
        }
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

    /**
     * Regression: when the on-disk `.tex` for a spec-driven fiction template
     * diverged from the canonical generator output (legacy literal `title`
     * /`scene` running-header text, stale chapter spacing, anything an
     * in-flight session edit may have left behind), `installBundledPandocLayouts`
     * used to skip with `alreadyPresent` and leave the corruption in place.
     * The drift-detect path overwrites stale fiction templates so install
     * is self-healing — users don't need to manually delete vault files.
     */
    it('installBundledPandocLayouts drift-detects and overwrites stale on-disk content for spec-driven fiction templates', async () => {
        const { plugin, layout } = createPluginWithBundledLayout('bundled-fiction-contemporary-literary');
        const target = normalizePath(`${plugin.settings.pandocFolder}/${layout.path}`);
        const stale = [
            '% Pandoc LaTeX Template - Contemporary Literary',
            '\\fancyhead[LE]{\\sffamily\\footnotesize\\nouppercase{title}}',
            '\\fancyhead[RO]{\\sffamily\\footnotesize\\nouppercase{scene}}',
            '\\titlespacing*{\\chapter}{0pt}{0.18\\textheight}{0.14\\textheight}',
        ].join('\n');

        await (plugin.app.vault as any).createFolder(plugin.settings.pandocFolder);
        await (plugin.app.vault as any).create(target, stale);

        const result = await installBundledPandocLayouts(plugin, [layout.id]);
        expect(result.failed).toEqual([]);
        // Should have overwritten (counted as installed), not skipped as alreadyPresent.
        expect(result.installed).toContain(layout.name);
        expect(result.alreadyPresent).not.toContain(layout.name);

        const file = plugin.app.vault.getAbstractFileByPath(target) as TFile;
        const updated = await (plugin.app.vault as any).read(file);
        const canonical = getBundledPandocLayoutContent(layout.id);
        expect(updated).toBe(canonical);
    });

    it('installBundledPandocLayouts does NOT overwrite when on-disk content already matches the canonical spec output', async () => {
        const { plugin, layout } = createPluginWithBundledLayout('bundled-fiction-contemporary-literary');
        const target = normalizePath(`${plugin.settings.pandocFolder}/${layout.path}`);

        // Install once to land canonical content.
        await (plugin.app.vault as any).createFolder(plugin.settings.pandocFolder);
        const first = await installBundledPandocLayouts(plugin, [layout.id]);
        expect(first.installed).toContain(layout.name);

        // Re-install — should report alreadyPresent (no drift, no overwrite).
        const second = await installBundledPandocLayouts(plugin, [layout.id]);
        expect(second.installed).toEqual([]);
        expect(second.alreadyPresent).toContain(layout.name);

        // File still exists.
        expect(plugin.app.vault.getAbstractFileByPath(target)).toBeInstanceOf(TFile);
    });

    it('seeds the registry so install-all leaves all bundled fiction layouts validating', async () => {
        const { plugin } = createPluginWithBundledLayout('bundled-fiction-signature-literary');
        plugin.settings.pandocLayouts = [];

        const result = await installBundledPandocLayouts(plugin);
        expect(result.failed).toEqual([]);
        expect(result.installed.length).toBeGreaterThan(0);

        const changed = ensureBundledPandocLayoutsRegistered(plugin);
        expect(changed).toBe(true);

        const fictionLayouts = (plugin.settings.pandocLayouts || []).filter(layout => layout.preset === 'novel');
        expect(fictionLayouts).toHaveLength(4);

        for (const layout of fictionLayouts) {
            expect(validatePandocLayout(plugin, layout).valid).toBe(true);
        }
    });
});
