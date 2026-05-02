import { describe, expect, it } from 'vitest';
import { TFile, TFolder, normalizePath } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import type { RadialTimelineSettings } from '../types/settings';
import { DEFAULT_SETTINGS } from '../settings/defaults';
import { validatePandocLayout } from './exportFormats';
import { ensureBundledLayoutInstalledForExport, ensureBundledPandocLayoutsRegistered, getBundledPandocLayouts, installBundledPandocLayouts } from './pandocBundledLayouts';

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
        expect(updated).toContain('\\titlespacing*{\\section}{0pt}{0.2\\textheight}{0.1\\textheight}');
        expect(updated).toContain('\\titlespacing*{\\subsection}{0pt}{0.2\\textheight}{0.1\\textheight}');
        expect(updated).not.toContain('\\dimexpr\\textheight/5\\relax');
    });

    it('hotfixes pre-tightened (0.2/0.2) signature literary spacing to the new 0.2/0.1 spacing', async () => {
        const { plugin, layout } = createPluginWithBundledLayout('bundled-fiction-signature-literary');
        const target = normalizePath(`${plugin.settings.pandocFolder}/${layout.path}`);
        const preTightened = [
            '\\titlespacing*{\\section}{0pt}{0.2\\textheight}{0.2\\textheight}',
            '\\titlespacing*{\\subsection}{0pt}{0.2\\textheight}{0.2\\textheight}'
        ].join('\n');

        await (plugin.app.vault as any).createFolder(plugin.settings.pandocFolder);
        await (plugin.app.vault as any).create(target, preTightened);

        const result = await ensureBundledLayoutInstalledForExport(plugin, layout);
        expect(result.installed).toBe(false);
        expect(result.failed).toBe(false);

        const file = plugin.app.vault.getAbstractFileByPath(target) as TFile;
        const updated = await (plugin.app.vault as any).read(file);
        expect(updated).toContain('\\titlespacing*{\\section}{0pt}{0.2\\textheight}{0.1\\textheight}');
        expect(updated).toContain('\\titlespacing*{\\subsection}{0pt}{0.2\\textheight}{0.1\\textheight}');
    });

    it('bundled Signature Literary uses symmetric margins', async () => {
        const { plugin, layout } = createPluginWithBundledLayout('bundled-fiction-signature-literary');

        const install = await ensureBundledLayoutInstalledForExport(plugin, layout);
        expect(install.installed).toBe(true);

        const target = normalizePath(`${plugin.settings.pandocFolder}/${layout.path}`);
        const file = plugin.app.vault.getAbstractFileByPath(target) as TFile;
        const content = await (plugin.app.vault as any).read(file);
        expect(content).toContain('  left=0.9in,');
        expect(content).toContain('  right=0.9in');
        expect(content).not.toContain('  inner=1.05in,');
        expect(content).not.toContain('  outer=0.75in');
    });

    it('bundled Contemporary Literary uses symmetric margins', async () => {
        const { plugin, layout } = createPluginWithBundledLayout('bundled-fiction-contemporary-literary');

        const install = await ensureBundledLayoutInstalledForExport(plugin, layout);
        expect(install.installed).toBe(true);

        const target = normalizePath(`${plugin.settings.pandocFolder}/${layout.path}`);
        const file = plugin.app.vault.getAbstractFileByPath(target) as TFile;
        const content = await (plugin.app.vault as any).read(file);
        expect(content).toContain('  left=0.9in,');
        expect(content).toContain('  right=0.9in');
        expect(content).not.toContain('  inner=1.05in,');
        expect(content).not.toContain('  outer=0.75in');
    });

    it('bundled Modern Classic uses symmetric margins', async () => {
        const { plugin, layout } = createPluginWithBundledLayout('bundled-fiction-modern-classic');

        const install = await ensureBundledLayoutInstalledForExport(plugin, layout);
        expect(install.installed).toBe(true);

        const target = normalizePath(`${plugin.settings.pandocFolder}/${layout.path}`);
        const file = plugin.app.vault.getAbstractFileByPath(target) as TFile;
        const content = await (plugin.app.vault as any).read(file);
        expect(content).toContain('  left=0.98in,');
        expect(content).toContain('  right=0.98in');
        expect(content).not.toContain('  inner=1.10in,');
        expect(content).not.toContain('  outer=0.85in');
    });

    it('hotfixes legacy Signature Literary mirrored margins in existing bundled template files', async () => {
        const { plugin, layout } = createPluginWithBundledLayout('bundled-fiction-signature-literary');
        const target = normalizePath(`${plugin.settings.pandocFolder}/${layout.path}`);
        const legacy = [
            '% Pandoc LaTeX Template - Signature Literary',
            '\\geometry{',
            '  paperwidth=6in,',
            '  paperheight=9in,',
            '  top=0.85in,',
            '  bottom=1.05in,',
            '  inner=1.05in,',
            '  outer=0.75in',
            '}',
            '$body$',
        ].join('\n');

        await (plugin.app.vault as any).createFolder(plugin.settings.pandocFolder);
        await (plugin.app.vault as any).create(target, legacy);

        const result = await ensureBundledLayoutInstalledForExport(plugin, layout);
        expect(result.installed).toBe(false);
        expect(result.failed).toBe(false);

        const file = plugin.app.vault.getAbstractFileByPath(target) as TFile;
        const updated = await (plugin.app.vault as any).read(file);
        expect(updated).toContain('  left=0.9in,');
        expect(updated).toContain('  right=0.9in');
        expect(updated).not.toContain('  inner=1.05in,');
        expect(updated).not.toContain('  outer=0.75in');
    });

    it('hotfixes legacy Contemporary Literary mirrored margins in existing bundled template files', async () => {
        const { plugin, layout } = createPluginWithBundledLayout('bundled-fiction-contemporary-literary');
        const target = normalizePath(`${plugin.settings.pandocFolder}/${layout.path}`);
        const legacy = [
            '% Pandoc LaTeX Template - Contemporary Literary',
            '\\geometry{',
            '  paperwidth=6in,',
            '  paperheight=9in,',
            '  top=0.9in,',
            '  bottom=1.0in,',
            '  inner=1.05in,',
            '  outer=0.75in',
            '}',
            '$body$',
        ].join('\n');

        await (plugin.app.vault as any).createFolder(plugin.settings.pandocFolder);
        await (plugin.app.vault as any).create(target, legacy);

        const result = await ensureBundledLayoutInstalledForExport(plugin, layout);
        expect(result.installed).toBe(false);
        expect(result.failed).toBe(false);

        const file = plugin.app.vault.getAbstractFileByPath(target) as TFile;
        const updated = await (plugin.app.vault as any).read(file);
        expect(updated).toContain('  left=0.9in,');
        expect(updated).toContain('  right=0.9in');
        expect(updated).not.toContain('  inner=1.05in,');
        expect(updated).not.toContain('  outer=0.75in');
    });

    it('hotfixes legacy Modern Classic mirrored margins in existing bundled template files', async () => {
        const { plugin, layout } = createPluginWithBundledLayout('bundled-fiction-modern-classic');
        const target = normalizePath(`${plugin.settings.pandocFolder}/${layout.path}`);
        const legacy = [
            '% rt_modern_classic.tex',
            '% Modern Classic fiction layout for 6x9 trade',
            '\\usepackage[',
            '  paperwidth=6in,',
            '  paperheight=9in,',
            '  top=0.95in,',
            '  bottom=1.15in,',
            '  inner=1.10in,',
            '  outer=0.85in',
            ']{geometry}',
            '\\newcommand{\\rtPart}[1]{%}',
            '$body$',
        ].join('\n');

        await (plugin.app.vault as any).createFolder(plugin.settings.pandocFolder);
        await (plugin.app.vault as any).create(target, legacy);

        const result = await ensureBundledLayoutInstalledForExport(plugin, layout);
        expect(result.installed).toBe(false);
        expect(result.failed).toBe(false);

        const file = plugin.app.vault.getAbstractFileByPath(target) as TFile;
        const updated = await (plugin.app.vault as any).read(file);
        expect(updated).toContain('  left=0.98in,');
        expect(updated).toContain('  right=0.98in');
        expect(updated).not.toContain('  inner=1.10in,');
        expect(updated).not.toContain('  outer=0.85in');
    });

    it('bundled core templates define a \\rtSceneOpener macro driven by the spec generator', async () => {
        // Contract: the assembler emits \rtSceneOpener{HEADING} for each scene
        // (latex-section-starred path), so the .tex must define \rtSceneOpener.
        // The first-word-emphasis helper macro and secnumdepth=0 reset still apply.
        // Old \titleformat{\section} + \preto\section hooks must NOT be present —
        // they only fired on \section{} (NOT \section*{}, which the assembler
        // previously emitted), leaving formatting dead.
        for (const layoutId of ['bundled-fiction-classic-manuscript', 'bundled-fiction-contemporary-literary']) {
            const { plugin, layout } = createPluginWithBundledLayout(layoutId);
            const install = await ensureBundledLayoutInstalledForExport(plugin, layout);
            expect(install.installed).toBe(true);

            const target = normalizePath(`${plugin.settings.pandocFolder}/${layout.path}`);
            const file = plugin.app.vault.getAbstractFileByPath(target) as TFile;
            const content = await (plugin.app.vault as any).read(file);
            expect(content).toContain('\\newcommand{\\rtSceneOpenerTitle}[1]');
            expect(content).toContain('\\setcounter{secnumdepth}{0}');
            expect(content).toContain('\\newcommand{\\rtSceneOpener}[1]');
            expect(content).toContain('\\cleardoublepage');
            expect(content).toContain('\\thispagestyle{empty}');
            expect(content).toMatch(/\\rtSceneOpenerTitle\{#1\}/);
            // Old hooks must not regress — they don't fire on \section*{}.
            expect(content).not.toMatch(/\\titleformat\{\\section\}\[display\][^\n]*\{[^}]*\}\{0pt\}\{\\rtSceneOpenerTitle\}/);
            expect(content).not.toContain('\\preto\\section{\\clearpage\\thispagestyle{empty}}');
            if (layoutId === 'bundled-fiction-contemporary-literary') {
                expect(content).toContain('\\providecommand{\\rtSceneRunningTitle}{}');
                expect(content).toContain('\\providecommand{\\rtSetSceneRunningTitle}[1]{\\gdef\\rtSceneRunningTitle{#1}\\markboth{\\BookTitle}{#1}}');
                expect(content).toContain('\\fancyhead[RO]{\\sffamily\\footnotesize\\nouppercase{\\rtSceneRunningTitle}}');
                // Spec-driven chapter spacing now lives inside \rtChapter as
                // \vspace*{0.46\textheight}; the old \titlespacing*{\chapter}
                // hook never fired because the assembler emits \rtChapter, not
                // \chapter. The macro body should contain the textheight-fraction
                // vspace that drives the deep-page layout.
                expect(content).toMatch(/\\newcommand\{\\rtChapter\}[^]*\\vspace\*\{0\.46\\textheight\}/);
                expect(content).toMatch(/\\newcommand\{\\rtChapter\}[^]*\\vspace\*\{0\.08\\textheight\}/);
            }
        }
    });

    it('hotfixes legacy Standard Manuscript scene opener formatting in existing bundled template files', async () => {
        const { plugin, layout } = createPluginWithBundledLayout('bundled-fiction-classic-manuscript');
        const target = normalizePath(`${plugin.settings.pandocFolder}/${layout.path}`);
        const legacy = [
            '% Pandoc LaTeX Template - Standard Manuscript',
            '\\titleformat{name=\\section,numberless}[display]{\\normalfont\\bfseries\\centering\\Large}{}{0pt}{}',
            '\\titlespacing*{\\section}{0pt}{0.16\\textheight}{0.12\\textheight}',
            '\\preto\\section{\\clearpage\\thispagestyle{empty}}',
            '$body$',
        ].join('\n');

        await (plugin.app.vault as any).createFolder(plugin.settings.pandocFolder);
        await (plugin.app.vault as any).create(target, legacy);

        const result = await ensureBundledLayoutInstalledForExport(plugin, layout);
        expect(result.installed).toBe(false);
        expect(result.failed).toBe(false);

        const file = plugin.app.vault.getAbstractFileByPath(target) as TFile;
        const updated = await (plugin.app.vault as any).read(file);
        expect(updated).toContain('\\newcommand{\\rtSceneOpenerTitle}[1]');
        // Contract: defines \rtSceneOpener macro that the assembler invokes.
        expect(updated).toContain('\\newcommand{\\rtSceneOpener}[1]');
        // Old hacks (subsection hooks, preto section, titleformat-only) must
        // be evicted — they only fired on \section{} not \section*{}.
        expect(updated).not.toContain('\\titleformat{\\subsection}');
        expect(updated).not.toContain('\\preto\\subsection');
        expect(updated).not.toContain('\\preto\\section{\\clearpage\\thispagestyle{empty}}');
    });

    it('hotfixes partially updated Standard Manuscript scene opener formatting in existing bundled template files', async () => {
        const { plugin, layout } = createPluginWithBundledLayout('bundled-fiction-classic-manuscript');
        const target = normalizePath(`${plugin.settings.pandocFolder}/${layout.path}`);
        const stale = [
            '% Pandoc LaTeX Template - Standard Manuscript',
            '\\setcounter{secnumdepth}{0}',
            '\\titleformat{\\section}[display]{\\normalfont\\bfseries\\centering\\Large}{}{0pt}{}',
            '\\titleformat{name=\\section,numberless}[display]{\\normalfont\\bfseries\\centering\\Large}{}{0pt}{}',
            '\\titlespacing*{\\section}{0pt}{0.16\\textheight}{0.12\\textheight}',
            '\\preto\\section{\\clearpage\\thispagestyle{empty}}',
            '$body$',
        ].join('\n');

        await (plugin.app.vault as any).createFolder(plugin.settings.pandocFolder);
        await (plugin.app.vault as any).create(target, stale);

        const result = await ensureBundledLayoutInstalledForExport(plugin, layout);
        expect(result.installed).toBe(false);
        expect(result.failed).toBe(false);

        const file = plugin.app.vault.getAbstractFileByPath(target) as TFile;
        const updated = await (plugin.app.vault as any).read(file);
        expect(updated).toContain('\\newcommand{\\rtSceneOpenerTitle}[1]');
        expect(updated).toContain('\\newcommand{\\rtSceneOpener}[1]');
        expect(updated).not.toContain('\\titleformat{\\subsection}');
        expect(updated).not.toContain('\\preto\\section{\\clearpage\\thispagestyle{empty}}');
    });

    it('hotfixes legacy Contemporary Literary scene opener formatting in existing bundled template files', async () => {
        const { plugin, layout } = createPluginWithBundledLayout('bundled-fiction-contemporary-literary');
        const target = normalizePath(`${plugin.settings.pandocFolder}/${layout.path}`);
        const legacy = [
            '% Pandoc LaTeX Template - Contemporary Literary',
            '\\titleformat{name=\\section,numberless}[display]{\\normalfont\\bfseries\\centering\\Large}{}{0pt}{}',
            '\\titlespacing*{\\section}{0pt}{0.18\\textheight}{0.14\\textheight}',
            '\\preto\\chapter{\\clearpage\\thispagestyle{empty}}',
            '\\preto\\section{\\clearpage\\thispagestyle{empty}}',
            '$body$',
        ].join('\n');

        await (plugin.app.vault as any).createFolder(plugin.settings.pandocFolder);
        await (plugin.app.vault as any).create(target, legacy);

        const result = await ensureBundledLayoutInstalledForExport(plugin, layout);
        expect(result.installed).toBe(false);
        expect(result.failed).toBe(false);

        const file = plugin.app.vault.getAbstractFileByPath(target) as TFile;
        const updated = await (plugin.app.vault as any).read(file);
        expect(updated).toContain('\\titleformat{\\chapter}[display]');
        expect(updated).toContain('\\newcommand{\\rtSceneOpener}[1]');
        expect(updated).not.toContain('\\titleformat{\\subsection}');
        expect(updated).not.toContain('\\preto\\subsection');
        expect(updated).not.toContain('\\preto\\section{\\clearpage\\thispagestyle{empty}}');
        expect(updated).toContain('\\titlespacing*{\\chapter}{0pt}{0.46\\textheight}{0.08\\textheight}');
    });

    it('hotfixes Contemporary Literary running headers to use scene context', async () => {
        const { plugin, layout } = createPluginWithBundledLayout('bundled-fiction-contemporary-literary');
        const target = normalizePath(`${plugin.settings.pandocFolder}/${layout.path}`);
        const stale = [
            '% Pandoc LaTeX Template - Contemporary Literary',
            '\\newcommand{\\BookTitle}{$if(title)$$title$$else$Untitled Manuscript$endif$}',
            '\\fancyhead[LE]{\\sffamily\\footnotesize\\nouppercase{title}}',
            '\\fancyhead[RO]{\\sffamily\\footnotesize\\nouppercase{\\rightmark}}',
            '\\titleformat{\\chapter}[display]{\\normalfont\\bfseries\\centering\\Large}{}{0pt}{}',
            '\\titlespacing*{\\chapter}{0pt}{0.18\\textheight}{0.14\\textheight}',
            '$body$',
        ].join('\n');

        await (plugin.app.vault as any).createFolder(plugin.settings.pandocFolder);
        await (plugin.app.vault as any).create(target, stale);

        const result = await ensureBundledLayoutInstalledForExport(plugin, layout);
        expect(result.installed).toBe(false);
        expect(result.failed).toBe(false);

        const file = plugin.app.vault.getAbstractFileByPath(target) as TFile;
        const updated = await (plugin.app.vault as any).read(file);
        expect(updated).toContain('\\newcommand{\\rtSceneRunningTitle}{}');
        expect(updated).toContain('\\newcommand{\\rtSetSceneRunningTitle}[1]{\\gdef\\rtSceneRunningTitle{#1}\\markboth{\\BookTitle}{#1}}');
        expect(updated).toContain('\\fancyhead[LE]{\\sffamily\\footnotesize\\nouppercase{\\BookTitle}}');
        expect(updated).not.toContain('\\fancyhead[LE]{\\sffamily\\footnotesize\\nouppercase{title}}');
        expect(updated).toContain('\\fancyhead[RO]{\\sffamily\\footnotesize\\nouppercase{\\rtSceneRunningTitle}}');
        expect(updated).not.toContain('\\fancyhead[RO]{\\sffamily\\footnotesize\\nouppercase{\\rightmark}}');
        expect(updated).toContain('\\titlespacing*{\\chapter}{0pt}{0.46\\textheight}{0.08\\textheight}');
    });

    it('hotfixes Contemporary Literary running header that leaks literal "scene" label', async () => {
        const { plugin, layout } = createPluginWithBundledLayout('bundled-fiction-contemporary-literary');
        const target = normalizePath(`${plugin.settings.pandocFolder}/${layout.path}`);
        const stale = [
            '% Pandoc LaTeX Template - Contemporary Literary',
            '\\newcommand{\\BookTitle}{$if(title)$$title$$else$Untitled Manuscript$endif$}',
            '\\fancyhead[LE]{\\sffamily\\footnotesize\\nouppercase{title}}',
            '\\fancyhead[RO]{\\sffamily\\footnotesize\\nouppercase{scene}}',
            '$body$',
        ].join('\n');

        await (plugin.app.vault as any).createFolder(plugin.settings.pandocFolder);
        await (plugin.app.vault as any).create(target, stale);

        const result = await ensureBundledLayoutInstalledForExport(plugin, layout);
        expect(result.installed).toBe(false);
        expect(result.failed).toBe(false);

        const file = plugin.app.vault.getAbstractFileByPath(target) as TFile;
        const updated = await (plugin.app.vault as any).read(file);
        expect(updated).toContain('\\fancyhead[LE]{\\sffamily\\footnotesize\\nouppercase{\\BookTitle}}');
        expect(updated).toContain('\\fancyhead[RO]{\\sffamily\\footnotesize\\nouppercase{\\rtSceneRunningTitle}}');
        expect(updated).not.toContain('\\fancyhead[RO]{\\sffamily\\footnotesize\\nouppercase{scene}}');
        expect(updated).not.toContain('\\fancyhead[LE]{\\sffamily\\footnotesize\\nouppercase{title}}');
    });

    it('bundled Contemporary Literary canonical .tex content does not leak literal title/scene labels in running headers', async () => {
        const { getBundledPandocLayoutContent } = await import('./pandocBundledLayouts');
        const content = getBundledPandocLayoutContent('bundled-fiction-contemporary-literary');
        expect(content).toBeTruthy();
        // Pictogram declares headerLeft: 'title' / headerRight: 'scene' as label data;
        // the .tex template MUST consume the macros, never the literal words.
        expect(content!).toMatch(/\\fancyhead\[LE\]\{[^}]*\\BookTitle\}/);
        expect(content!).toMatch(/\\fancyhead\[RO\]\{[^}]*\\rtSceneRunningTitle\}/);
        expect(content!).not.toContain('\\nouppercase{title}');
        expect(content!).not.toContain('\\nouppercase{scene}');
    });

    it('bundled Modern Classic template defines all macros emitted by assembly', async () => {
        const { plugin, layout } = createPluginWithBundledLayout('bundled-fiction-modern-classic');

        const install = await ensureBundledLayoutInstalledForExport(plugin, layout);
        expect(install.installed).toBe(true);

        const target = normalizePath(`${plugin.settings.pandocFolder}/${layout.path}`);
        const file = plugin.app.vault.getAbstractFileByPath(target) as TFile;
        const content = await (plugin.app.vault as any).read(file);

        expect(content).toContain('\\newcommand{\\rtPart}[1]');
        expect(content).toContain('\\newcommand{\\rtEpigraph}[2]');
        expect(content).toContain('\\newcommand{\\rtChapter}[2]');
        expect(content).toContain('\\newcommand{\\rtSceneSep}');
        // Spec-driven generator unifies on \BookTitle / \AuthorName across all
        // bundled fiction templates (Modern Classic no longer needs its own
        // \rtBookTitle / \rtBookAuthor pair). The manuscript pipeline never
        // emits the rt-prefixed macros literally.
        expect(content).toContain('\\newcommand{\\BookTitle}{$if(title)$$title$$else$Untitled Manuscript$endif$}');
        expect(content).toContain('\\newcommand{\\AuthorName}{$if(author)$$for(author)$$author$$sep$, $endfor$$else$Author$endif$}');
        // Unsafe legacy chapter titleformat must not regress.
        expect(content).not.toContain('\\titleformat{\\chapter}[display]{\\normalfont}{}{0pt}{%');
        expect(content).not.toContain('Chapter~\\thechapter');
    });

    it('hotfixes legacy Modern Classic bundled template macro contracts', async () => {
        const { plugin, layout } = createPluginWithBundledLayout('bundled-fiction-modern-classic');
        const target = normalizePath(`${plugin.settings.pandocFolder}/${layout.path}`);
        const legacy = [
            '% rt_modern_classic.tex',
            '% Modern Classic fiction layout for 6x9 trade',
            '% --- capture Pandoc title/author ---',
            '\\makeatletter',
            '\\newcommand{\\rtBookTitle}{\\@title}',
            '\\newcommand{\\rtBookAuthor}{\\@author}',
            '\\makeatother',
            '\\newcommand{\\rtPart}[1]{%',
            '  \\cleardoublepage',
            '  \\thispagestyle{rtEmpty}%',
            '  \\vspace*{2.1in}%',
            '  \\begin{center}',
            '    {\\sffamily\\bfseries\\Large PART~#1}',
            '  \\end{center}',
            '  \\vspace*{1.2in}%',
            '  \\cleardoublepage',
            '}',
            '\\newcommand{\\rtSceneSep}{\\par}',
            '$body$',
        ].join('\n');

        await (plugin.app.vault as any).createFolder(plugin.settings.pandocFolder);
        await (plugin.app.vault as any).create(target, legacy);

        const result = await ensureBundledLayoutInstalledForExport(plugin, layout);
        expect(result.installed).toBe(false);
        expect(result.failed).toBe(false);

        const file = plugin.app.vault.getAbstractFileByPath(target) as TFile;
        const updated = await (plugin.app.vault as any).read(file);
        expect(updated).toContain('\\newcommand{\\rtEpigraph}[2]');
        expect(updated).toContain('\\newcommand{\\rtChapter}[2]');
        expect(updated).toContain('\\newcommand{\\rtBookTitle}{$if(title)$$title$$else$Untitled Manuscript$endif$}');
        expect(updated).toContain('\\newcommand{\\rtBookAuthor}{$if(author)$$for(author)$$author$$sep$, $endfor$$else$Author$endif$}');
        expect(updated).not.toContain('\\newcommand{\\rtBookTitle}{\\@title}');
        expect(updated).not.toContain('\\makeatletter');
    });

    it('hotfixes unsafe Modern Classic chapter title formatting in existing bundled template files', async () => {
        const { plugin, layout } = createPluginWithBundledLayout('bundled-fiction-modern-classic');
        const target = normalizePath(`${plugin.settings.pandocFolder}/${layout.path}`);
        const unsafe = [
            '% rt_modern_classic.tex',
            '% Modern Classic fiction layout for 6x9 trade',
            '\\newcommand{\\rtPart}[1]{%}',
            '\\titleformat{\\chapter}[display]{\\normalfont}{}{0pt}{%',
            '  \\thispagestyle{rtEmpty}%',
            '  \\vspace*{1.9in}%',
            '  \\begin{center}',
            '    {\\sffamily\\bfseries\\large Chapter~\\thechapter}\\par',
            '    \\vspace{0.35in}%',
            '    {\\rmfamily\\itshape\\Large #1}\\par',
            '  \\end{center}',
            '  \\vspace*{0.9in}%',
            '}',
            '\\titlespacing*{\\chapter}{0pt}{0pt}{0pt}',
            '$body$',
        ].join('\n');

        await (plugin.app.vault as any).createFolder(plugin.settings.pandocFolder);
        await (plugin.app.vault as any).create(target, unsafe);

        const result = await ensureBundledLayoutInstalledForExport(plugin, layout);
        expect(result.installed).toBe(false);
        expect(result.failed).toBe(false);

        const file = plugin.app.vault.getAbstractFileByPath(target) as TFile;
        const updated = await (plugin.app.vault as any).read(file);
        expect(updated).toContain('\\titleformat{\\chapter}{\\normalfont}{}{0pt}{}');
        expect(updated).not.toContain('\\titleformat{\\chapter}[display]{\\normalfont}{}{0pt}{%');
        expect(updated).not.toContain('Chapter~\\thechapter');
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
     * Regression: clicking "Install all" with an empty pandocLayouts registry
     * (e.g. user trashed all bundled entries) used to leave the PDF Style
     * publishing stage stuck on "Below" because the validation snapshot only
     * sees layouts present in `plugin.settings.pandocLayouts`. The handler
     * now mirrors Auto-configure and calls ensureBundledPandocLayoutsRegistered
     * after the file install — verify both pieces (files-on-disk +
     * registered settings entries + validates) line up.
     */
    /**
     * Regression: when the on-disk `.tex` for a spec-driven fiction template
     * diverged from the canonical generator output (legacy literal `title`
     * /`scene` running-header text, stale chapter spacing, anything an
     * in-flight session edit may have left behind), `installBundledPandocLayouts`
     * used to skip with `alreadyPresent` and leave the corruption in place.
     * The drift-detect path overwrites stale fiction templates so install
     * is self-healing — users don't need to manually delete vault files.
     */
    it('drift-detects and overwrites stale on-disk content for spec-driven fiction templates', async () => {
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
        // Canonical spec-driven content: macros, not literal labels.
        expect(updated).toContain('\\fancyhead[LE]{\\sffamily\\footnotesize\\nouppercase{\\BookTitle}}');
        expect(updated).toContain('\\fancyhead[RO]{\\sffamily\\footnotesize\\nouppercase{\\rtSceneRunningTitle}}');
        // Spec-driven chapter spacing now lives inside \rtChapter as
        // \vspace*{0.46\textheight} (the old \titlespacing*{\chapter} hook never
        // fired — assembler emits \rtChapter, not \chapter).
        expect(updated).toMatch(/\\newcommand\{\\rtChapter\}[^]*\\vspace\*\{0\.46\\textheight\}/);
        expect(updated).not.toMatch(/\\fancyhead\[LE\]\{[^}]*\bnouppercase\{title\}/);
        expect(updated).not.toMatch(/\\fancyhead\[RO\]\{[^}]*\bnouppercase\{scene\}/);
    });

    it('does NOT overwrite when on-disk content already matches the canonical spec output', async () => {
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

    // Page-numbering hierarchy hotfix: spec-driven .tex files installed before
    // \rtBeginMainArabic / \ifrtMainStarted were introduced get rewritten to
    // canonical content on next install pass. Pre-cutover legacy files remain
    // owned by the older normalizers and are NOT touched here.
    it('hotfixes spec-driven bundled template files lacking the page-numbering hierarchy', async () => {
        const { plugin, layout } = createPluginWithBundledLayout('bundled-fiction-classic-manuscript');
        const target = normalizePath(`${plugin.settings.pandocFolder}/${layout.path}`);
        // Synthetic spec-driven file (carries the generator header) that
        // predates the page-numbering hierarchy.
        const stale = [
            '% Generated from DesignedStyleSpec v2 — bundled-fiction-classic-manuscript',
            '\\documentclass{book}',
            '\\newcommand{\\rtSceneOpener}[1]{\\section*{#1}}',
            '$body$',
        ].join('\n');

        await (plugin.app.vault as any).createFolder(plugin.settings.pandocFolder);
        await (plugin.app.vault as any).create(target, stale);

        const result = await ensureBundledLayoutInstalledForExport(plugin, layout);
        expect(result.installed).toBe(false);
        expect(result.failed).toBe(false);

        const file = plugin.app.vault.getAbstractFileByPath(target) as TFile;
        const updated = await (plugin.app.vault as any).read(file);
        expect(updated).toMatch(/\\newcommand\{\\rtBeginMainArabic\}/);
        expect(updated).toMatch(/\\newif\\ifrtMainStarted/);
        expect(updated).toMatch(/\\ifrtMainStarted\\else\\rtBeginMainArabic\\fi/);
    });

    it('does NOT rewrite pre-cutover legacy bundled files (those are repaired by the older normalizers)', async () => {
        const { plugin, layout } = createPluginWithBundledLayout('bundled-fiction-classic-manuscript');
        const target = normalizePath(`${plugin.settings.pandocFolder}/${layout.path}`);
        // Hand-authored legacy file (no spec-driven header, no rtBeginMainArabic).
        const legacy = [
            '% Pandoc LaTeX Template - Standard Manuscript',
            '\\documentclass{book}',
            '$body$',
        ].join('\n');

        await (plugin.app.vault as any).createFolder(plugin.settings.pandocFolder);
        await (plugin.app.vault as any).create(target, legacy);

        await ensureBundledLayoutInstalledForExport(plugin, layout);

        const file = plugin.app.vault.getAbstractFileByPath(target) as TFile;
        const updated = await (plugin.app.vault as any).read(file);
        // The page-numbering normalizer is gated to spec-driven files, so
        // hand-authored legacy stubs are NOT auto-rewritten here.
        expect(updated).not.toMatch(/\\rtBeginMainArabic/);
    });
});
