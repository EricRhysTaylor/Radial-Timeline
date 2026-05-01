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
        expect(updated).toContain('\\titlespacing*{\\section}{0pt}{0.2\\textheight}{0.2\\textheight}');
        expect(updated).toContain('\\titlespacing*{\\subsection}{0pt}{0.2\\textheight}{0.2\\textheight}');
        expect(updated).not.toContain('\\dimexpr\\textheight/5\\relax');
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

    it('bundled core templates define numbered section and subsection scene openers', async () => {
        for (const layoutId of ['bundled-fiction-classic-manuscript', 'bundled-fiction-contemporary-literary']) {
            const { plugin, layout } = createPluginWithBundledLayout(layoutId);
            const install = await ensureBundledLayoutInstalledForExport(plugin, layout);
            expect(install.installed).toBe(true);

            const target = normalizePath(`${plugin.settings.pandocFolder}/${layout.path}`);
            const file = plugin.app.vault.getAbstractFileByPath(target) as TFile;
            const content = await (plugin.app.vault as any).read(file);
            expect(content).toContain('\\newcommand{\\rtSceneOpenerTitle}[1]');
            expect(content).toContain('\\setcounter{secnumdepth}{0}');
            expect(content).toContain('\\titleformat{\\section}[display]');
            expect(content).toContain('\\titleformat{name=\\section,numberless}[display]');
            expect(content).toContain('\\titleformat{\\section}[display]{\\normalfont\\bfseries\\centering\\Large}{}{0pt}{}');
            expect(content).toContain('\\titleformat{\\subsection}[display]{\\normalfont\\bfseries\\centering\\Large}{}{0pt}{\\rtSceneOpenerTitle}');
            expect(content).toContain('\\titleformat{name=\\subsection,numberless}[display]{\\normalfont\\bfseries\\centering\\Large}{}{0pt}{\\rtSceneOpenerTitle}');
            expect(content).toContain('\\preto\\section{\\clearpage\\thispagestyle{empty}}');
            expect(content).toContain('\\preto\\subsection{\\clearpage\\thispagestyle{empty}}');
            if (layoutId === 'bundled-fiction-contemporary-literary') {
                expect(content).toContain('\\newcommand{\\rtSceneRunningTitle}{}');
                expect(content).toContain('\\newcommand{\\rtSetSceneRunningTitle}[1]{\\gdef\\rtSceneRunningTitle{#1}\\markboth{\\BookTitle}{#1}}');
                expect(content).toContain('\\fancyhead[RO]{\\sffamily\\footnotesize\\nouppercase{\\rtSceneRunningTitle}}');
                expect(content).toContain('\\titlespacing*{\\chapter}{0pt}{0.46\\textheight}{0.08\\textheight}');
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
        expect(updated).toContain('\\titleformat{\\section}[display]');
        expect(updated).toContain('\\titleformat{\\subsection}[display]');
        expect(updated).toContain('\\preto\\subsection{\\clearpage\\thispagestyle{empty}}');
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
        expect(updated).toContain('\\titleformat{\\subsection}[display]');
        expect(updated).toContain('\\preto\\subsection{\\clearpage\\thispagestyle{empty}}');
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
        expect(updated).toContain('\\titleformat{\\section}[display]');
        expect(updated).toContain('\\titleformat{\\subsection}[display]');
        expect(updated).toContain('\\preto\\subsection{\\clearpage\\thispagestyle{empty}}');
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
        expect(content).toContain('\\newcommand{\\rtBookTitle}{$if(title)$$title$$else$Untitled Manuscript$endif$}');
        expect(content).toContain('\\newcommand{\\rtBookAuthor}{$if(author)$$for(author)$$author$$sep$, $endfor$$else$Author$endif$}');
        expect(content).toContain('\\titleformat{\\chapter}{\\normalfont}{}{0pt}{}');
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
});
