/*
 * Radial Timeline Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 * 
 * Professional License Settings Section
 */

import { App, Setting, setIcon, normalizePath, Notice, TFile, TFolder, Modal, ButtonComponent, AbstractInputSuggest, TextComponent } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { ERT_CLASSES } from '../../ui/classes';
import { addHeadingIcon, addWikiLink, applyErtHeaderLayout } from '../wikiLink';
import { execFile } from 'child_process'; // SAFE: Node child_process for system path scanning
import { generateSceneContent } from '../../utils/sceneGenerator';
import { DEFAULT_SETTINGS } from '../defaults';
import { validatePandocLayout, slugifyToFileStem } from '../../utils/exportFormats';
import type { PandocLayoutTemplate } from '../../types';
import type { BookMeta } from '../../types';
import { normalizeFrontmatterKeys } from '../../utils/frontmatter';
import { getActiveBookExportContext } from '../../utils/exportContext';
import { isPathInFolderScope } from '../../utils/pathScope';

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM PATH SCANNING
// ═══════════════════════════════════════════════════════════════════════════════

interface ScanResult {
    pandocPath: string | null;
    latexPath: string | null;
    latexEngine: string | null;
}

/**
 * Check if a file exists and is executable at the given absolute path.
 */
function fileExistsSync(absPath: string): boolean {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const fs = require('fs') as typeof import('fs');
        fs.accessSync(absPath, fs.constants.X_OK);
        return true;
    } catch {
        return false;
    }
}

/**
 * Build platform-specific known paths for Pandoc and LaTeX.
 * macOS: Homebrew (Apple Silicon + Intel), MacTeX
 * Windows: Default installer paths, Chocolatey, Scoop, MiKTeX, TeX Live
 * Linux: Standard package-manager locations, TeX Live
 */
function getKnownPandocPaths(): string[] {
    const isWin = process.platform === 'win32';
    if (isWin) {
        const localAppData = process.env.LOCALAPPDATA || 'C:\\Users\\Default\\AppData\\Local';
        const appData = process.env.APPDATA || 'C:\\Users\\Default\\AppData\\Roaming';
        const userProfile = process.env.USERPROFILE || 'C:\\Users\\Default';
        return [
            'C:\\Program Files\\Pandoc\\pandoc.exe',                       // Default installer
            'C:\\Program Files (x86)\\Pandoc\\pandoc.exe',                 // 32-bit installer
            `${localAppData}\\Pandoc\\pandoc.exe`,                         // User install
            'C:\\ProgramData\\chocolatey\\bin\\pandoc.exe',                // Chocolatey
            `${userProfile}\\scoop\\shims\\pandoc.exe`,                    // Scoop
            `${userProfile}\\scoop\\apps\\pandoc\\current\\pandoc.exe`,    // Scoop direct
        ];
    }
    // macOS + Linux
    return [
        '/opt/homebrew/bin/pandoc',        // Homebrew Apple Silicon
        '/usr/local/bin/pandoc',           // Homebrew Intel / manual install
        '/usr/bin/pandoc',                 // System / package-manager install
        '/snap/bin/pandoc',                // Snap (Linux)
    ];
}

function getKnownLatexPaths(): { engine: string; paths: string[] }[] {
    const isWin = process.platform === 'win32';
    if (isWin) {
        const localAppData = process.env.LOCALAPPDATA || 'C:\\Users\\Default\\AppData\\Local';
        // MiKTeX and TeX Live common install locations on Windows
        const miktexBins = [
            'C:\\Program Files\\MiKTeX\\miktex\\bin\\x64',
            `${localAppData}\\Programs\\MiKTeX\\miktex\\bin\\x64`,
            'C:\\miktex\\miktex\\bin\\x64',
        ];
        // TeX Live: year-based folders (check recent years)
        const texliveBins: string[] = [];
        for (let year = new Date().getFullYear(); year >= 2020; year--) {
            texliveBins.push(`C:\\texlive\\${year}\\bin\\windows`);
            texliveBins.push(`C:\\texlive\\${year}\\bin\\win32`);
        }
        const allWinBins = [...miktexBins, ...texliveBins];
        return [
            { engine: 'xelatex',  paths: allWinBins.map(b => `${b}\\xelatex.exe`) },
            { engine: 'pdflatex', paths: allWinBins.map(b => `${b}\\pdflatex.exe`) },
            { engine: 'lualatex', paths: allWinBins.map(b => `${b}\\lualatex.exe`) },
        ];
    }
    // macOS + Linux
    return [
        { engine: 'xelatex',  paths: ['/Library/TeX/texbin/xelatex',  '/opt/homebrew/bin/xelatex',  '/usr/local/bin/xelatex',  '/usr/bin/xelatex']  },
        { engine: 'pdflatex', paths: ['/Library/TeX/texbin/pdflatex', '/opt/homebrew/bin/pdflatex', '/usr/local/bin/pdflatex', '/usr/bin/pdflatex'] },
        { engine: 'lualatex', paths: ['/Library/TeX/texbin/lualatex', '/opt/homebrew/bin/lualatex', '/usr/local/bin/lualatex', '/usr/bin/lualatex'] },
    ];
}

/**
 * Build an enriched PATH string for the fallback `which`/`where` lookup.
 * Includes common binary directories for the current platform.
 */
function getEnrichedPath(): string {
    const isWin = process.platform === 'win32';
    const sep = isWin ? ';' : ':';
    const existing = process.env.PATH || '';

    if (isWin) {
        const localAppData = process.env.LOCALAPPDATA || '';
        const userProfile = process.env.USERPROFILE || '';
        const extra = [
            'C:\\Program Files\\Pandoc',
            'C:\\Program Files (x86)\\Pandoc',
            `${localAppData}\\Pandoc`,
            'C:\\ProgramData\\chocolatey\\bin',
            `${userProfile}\\scoop\\shims`,
            'C:\\Program Files\\MiKTeX\\miktex\\bin\\x64',
            `${localAppData}\\Programs\\MiKTeX\\miktex\\bin\\x64`,
        ];
        // Add recent TeX Live years
        for (let year = new Date().getFullYear(); year >= 2020; year--) {
            extra.push(`C:\\texlive\\${year}\\bin\\windows`);
        }
        return [...extra, existing].join(sep);
    }

    // macOS + Linux
    return [
        '/opt/homebrew/bin',
        '/usr/local/bin',
        '/Library/TeX/texbin',
        '/usr/bin',
        '/snap/bin',
        existing
    ].join(sep);
}

/**
 * Scan the system for Pandoc and LaTeX installations.
 * Phase 1: probes well-known platform-specific paths directly (works in Electron's empty PATH).
 * Phase 2: falls back to `which`/`where` with an enriched PATH if direct probing missed anything.
 */
async function scanSystemPaths(): Promise<ScanResult> {
    const result: ScanResult = { pandocPath: null, latexPath: null, latexEngine: null };

    // ── Phase 1: Direct path probing (reliable in Electron) ─────────────────
    for (const p of getKnownPandocPaths()) {
        if (fileExistsSync(p)) { result.pandocPath = p; break; }
    }

    for (const { engine, paths } of getKnownLatexPaths()) {
        if (result.latexPath) break;
        for (const p of paths) {
            if (fileExistsSync(p)) {
                result.latexPath = p;
                result.latexEngine = engine;
                break;
            }
        }
    }

    // ── Phase 2: Fallback `which`/`where` with enriched PATH ────────────────
    if (!result.pandocPath || !result.latexPath) {
        const env = { ...process.env, PATH: getEnrichedPath() };
        const whichCmd = process.platform === 'win32' ? 'where' : 'which';

        if (!result.pandocPath) {
            await new Promise<void>((resolve) => {
                execFile(whichCmd, ['pandoc'], { timeout: 5000, env }, (error, stdout) => {
                    if (!error && stdout && stdout.trim()) {
                        result.pandocPath = stdout.trim().split(/[\r\n]/)[0];
                    }
                    resolve();
                });
            });
        }

        if (!result.latexPath) {
            for (const engine of ['xelatex', 'pdflatex', 'lualatex']) {
                if (result.latexPath) break;
                await new Promise<void>((resolve) => {
                    execFile(whichCmd, [engine], { timeout: 5000, env }, (error, stdout) => {
                        if (!error && stdout && stdout.trim()) {
                            result.latexPath = stdout.trim().split(/[\r\n]/)[0];
                            result.latexEngine = engine;
                        }
                        resolve();
                    });
                });
            }
        }
    }

    return result;
}

function listAvailableLatexEngines(): Array<{ engine: string; path: string }> {
    const available: Array<{ engine: string; path: string }> = [];
    for (const { engine, paths } of getKnownLatexPaths()) {
        const found = paths.find(p => fileExistsSync(p));
        if (found) {
            available.push({ engine, path: found });
        }
    }
    return available;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SAMPLE TEMPLATE GENERATION
// ═══════════════════════════════════════════════════════════════════════════════

type MatterSampleLane = 'guided' | 'advanced' | 'mixed';

class PandocTemplatePathSuggest extends AbstractInputSuggest<string> {
    private readonly plugin: RadialTimelinePlugin;
    private readonly inputRef: HTMLInputElement;
    private readonly onChoose: (path: string) => void;

    constructor(
        app: App,
        input: HTMLInputElement,
        plugin: RadialTimelinePlugin,
        onChoose: (path: string) => void
    ) {
        super(app, input);
        this.plugin = plugin;
        this.inputRef = input;
        this.onChoose = onChoose;
    }

    getSuggestions(query: string): string[] {
        const rawQuery = (query || '').trim();
        const normalizedQuery = rawQuery ? normalizePath(rawQuery.replace(/^\/+/, '')) : '';
        const lowered = normalizedQuery.toLowerCase();
        const candidateSet = new Set<string>();
        const addCandidate = (path: string) => {
            const trimmed = path.trim();
            if (!trimmed) return;
            candidateSet.add(normalizePath(trimmed));
        };
        const texPattern = /\.(tex|ltx|latex)$/i;

        this.app.vault.getFiles()
            .filter(file => texPattern.test(file.path))
            .forEach(file => addCandidate(file.path));

        (this.plugin.settings.pandocLayouts || [])
            .forEach(layout => addCandidate(layout.path));

        const pandocFolder = normalizePath((this.plugin.settings.pandocFolder || 'Pandoc').trim() || 'Pandoc');
        if (normalizedQuery) {
            if (texPattern.test(normalizedQuery)) {
                addCandidate(normalizedQuery);
                addCandidate(`${pandocFolder}/${normalizedQuery}`);
            } else {
                addCandidate(`${normalizedQuery}.tex`);
                addCandidate(`${pandocFolder}/${normalizedQuery}.tex`);
            }
        }

        const ordered = Array.from(candidateSet).sort((a, b) => a.localeCompare(b));
        if (!lowered) return ordered.slice(0, 40);
        return ordered.filter(path => path.toLowerCase().includes(lowered)).slice(0, 40);
    }

    renderSuggestion(path: string, el: HTMLElement): void {
        const row = el.createDiv({ cls: 'ert-template-path-suggest' });
        row.createDiv({ cls: 'ert-template-path-suggest-path', text: path });
        const exists = !!this.app.vault.getAbstractFileByPath(path);
        row.createDiv({
            cls: 'ert-template-path-suggest-meta',
            text: exists ? 'Existing file' : 'Suggested path'
        });
    }

    selectSuggestion(path: string, _evt: MouseEvent | KeyboardEvent): void {
        const normalized = normalizePath(path);
        this.inputRef.value = normalized;
        this.onChoose(normalized);
        try { this.close(); } catch {}
        try { this.inputRef.focus(); } catch {}
    }
}

class MatterSampleLaneModal extends Modal {
    private selected: MatterSampleLane;
    private readonly onPick: (lane: MatterSampleLane | null) => void;
    private resolved = false;

    constructor(app: App, onPick: (lane: MatterSampleLane | null) => void, defaultLane: MatterSampleLane) {
        super(app);
        this.onPick = onPick;
        this.selected = defaultLane;
    }

    onOpen(): void {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        if (modalEl) {
            modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell', 'ert-modal--template-pack');
            modalEl.style.width = '560px'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxWidth = '92vw';
        }
        contentEl.addClass('ert-modal-container', 'ert-stack', 'ert-template-pack-modal');

        const header = contentEl.createDiv({ cls: 'ert-modal-header' });
        const badge = header.createSpan({ cls: `${ERT_CLASSES.MODAL_BADGE} ert-modal-badge-pro` });
        const badgeIcon = badge.createSpan({ cls: ERT_CLASSES.MODAL_BADGE_ICON });
        setIcon(badgeIcon, 'star');
        badge.createSpan({ text: 'Pro' });
        header.createDiv({ cls: 'ert-modal-title', text: 'Generate Template Pack' });
        header.createDiv({
            cls: 'ert-modal-subtitle',
            text: 'Create publishing templates and choose how front/back matter pages should be managed.'
        });

        const createdBlock = contentEl.createDiv({ cls: 'ert-template-pack-created ert-stack--tight' });
        const createdHeading = createdBlock.createDiv({ cls: 'ert-template-pack-subtitle' });
        const createdHeadingIcon = createdHeading.createSpan({ cls: 'ert-template-pack-subtitle-icon' });
        setIcon(createdHeadingIcon, 'list-checks');
        createdHeading.createSpan({ text: 'What Will Be Created' });
        const createdList = createdBlock.createEl('ul', { cls: 'ert-template-pack-list' });
        const renderCreatedList = () => {
            createdList.empty();
            const items = this.selected === 'guided'
                ? [
                    '000 BookMeta.md (master publishing metadata file)',
                    'Front matter stubs (Title Page, Copyright, Dedication, etc.)',
                    'Back matter stubs (Acknowledgments, About the Author)',
                    'Scene examples',
                    'PDF layout templates'
                ]
                : this.selected === 'advanced'
                    ? [
                    'Front/back matter examples with working LaTeX bodies',
                    'Scene examples',
                    'PDF layout templates'
                    ]
                    : [
                        '000 BookMeta.md (master publishing metadata file)',
                        'Front/back matter stubs set to bodyMode: auto (mix semantic + inline LaTeX)',
                        'Scene examples',
                        'PDF layout templates'
                    ];
            items.forEach(item => {
                const listItem = createdList.createEl('li', { cls: 'ert-template-pack-list-item' });
                const itemIcon = listItem.createSpan({ cls: 'ert-template-pack-list-icon' });
                setIcon(itemIcon, 'dot');
                listItem.createSpan({ text: item });
            });
        };

        const optionsEl = contentEl.createDiv({ cls: 'ert-template-pack-options ert-stack--tight' });
        const optionButtons: Partial<Record<MatterSampleLane, HTMLButtonElement>> = {};
        const laneRadios: Partial<Record<MatterSampleLane, HTMLInputElement>> = {};
        const refreshOptionState = () => {
            (Object.keys(optionButtons) as MatterSampleLane[]).forEach((lane) => {
                const active = this.selected === lane;
                const optionButton = optionButtons[lane];
                const laneRadio = laneRadios[lane];
                if (!optionButton || !laneRadio) return;
                optionButton.toggleClass(ERT_CLASSES.IS_ACTIVE, active);
                optionButton.setAttr('aria-pressed', active ? 'true' : 'false');
                laneRadio.checked = active;
            });
            renderCreatedList();
        };

        const makeOption = (
            lane: MatterSampleLane,
            title: string,
            desc: string,
            iconName: string
        ) => {
            const option = optionsEl.createEl('button', {
                cls: 'ert-template-pack-option',
                attr: { type: 'button' }
            });
            const optionHeader = option.createDiv({ cls: 'ert-template-pack-option-header' });
            const radio = optionHeader.createEl('input', {
                type: 'radio',
                cls: 'ert-template-pack-option-radio',
                attr: { name: 'ert-matter-lane', value: lane }
            }) as HTMLInputElement;
            const optionIcon = optionHeader.createSpan({ cls: 'ert-template-pack-option-icon' });
            setIcon(optionIcon, iconName);
            optionHeader.createSpan({ cls: 'ert-template-pack-option-title', text: title });
            option.createDiv({ cls: 'ert-template-pack-option-desc', text: desc });
            radio.addEventListener('change', () => {
                this.selected = lane;
                refreshOptionState();
            });
            option.addEventListener('click', () => {
                this.selected = lane;
                refreshOptionState();
            });

            optionButtons[lane] = option;
            laneRadios[lane] = radio;
        };

        makeOption(
            'guided',
            'Guided Matter (Recommended)',
            'Uses a single BookMeta file for title, copyright, ISBN, and other publishing details. Matter pages are rendered by templates. Best for most authors.',
            'book-open'
        );
        makeOption(
            'advanced',
            'Advanced (LaTeX in Body)',
            'Write raw LaTeX directly inside front/back matter notes. Radial Timeline passes this content through unchanged. Best for advanced users comfortable with LaTeX.',
            'code'
        );
        makeOption(
            'mixed',
            'Mixed (Semantic + LaTeX)',
            'Uses matter metadata with bodyMode:auto so each page can be plain frontmatter-driven content or inline LaTeX.',
            'blend'
        );
        refreshOptionState();

        const actions = contentEl.createDiv({ cls: 'ert-modal-actions ert-template-pack-actions' });
        new ButtonComponent(actions)
            .setButtonText('Generate Template Pack')
            .setCta()
            .onClick(() => {
                this.resolved = true;
                this.close();
                this.onPick(this.selected);
            });
        new ButtonComponent(actions)
            .setButtonText('Cancel')
            .onClick(() => {
                this.resolved = true;
                this.close();
                this.onPick(null);
            });
    }

    onClose(): void {
        if (!this.resolved) {
            this.resolved = true;
            this.onPick(null);
        }
        this.contentEl.empty();
    }
}

async function chooseMatterSampleLane(app: App, defaultLane: MatterSampleLane): Promise<MatterSampleLane | null> {
    return new Promise((resolve) => {
        new MatterSampleLaneModal(app, resolve, defaultLane).open();
    });
}

function attachTemplatePathSuggest(
    plugin: RadialTimelinePlugin,
    text: TextComponent,
    onSelect: (path: string) => void
): void {
    new PandocTemplatePathSuggest(plugin.app, text.inputEl, plugin, (path) => {
        try { text.setValue(path); } catch {}
        onSelect(path);
    });
}

interface ActiveBookMetaStatus {
    found: boolean;
    path?: string;
    warning?: string;
    sourceFolder?: string;
    bookMeta?: BookMeta;
}

function normalizeMatterSideFromContext(classValue: string, filename: string, existingSide?: unknown): 'front' | 'back' {
    if (typeof existingSide === 'string') {
        const normalized = existingSide.trim().toLowerCase();
        if (normalized === 'front' || normalized === 'frontmatter') return 'front';
        if (normalized === 'back' || normalized === 'backmatter') return 'back';
    }
    if (classValue === 'backmatter') return 'back';
    if (classValue === 'frontmatter') return 'front';
    if (/^200(?:\.|$)/.test(filename.trim())) return 'back';
    if (/^0(?:\.|$)/.test(filename.trim())) return 'front';
    return 'front';
}

async function applyMatterWorkflowToActiveBook(
    plugin: RadialTimelinePlugin,
    workflow: MatterSampleLane
): Promise<{ scanned: number; updated: number; sourceFolder: string }> {
    const sourceFolder = getActiveBookExportContext(plugin).sourceFolder.trim();
    if (!sourceFolder) {
        throw new Error('Active book source folder is not set.');
    }

    const mappings = plugin.settings.enableCustomMetadataMapping
        ? plugin.settings.frontmatterMappings
        : undefined;

    const files = plugin.app.vault.getMarkdownFiles()
        .filter(file => isPathInFolderScope(file.path, sourceFolder));

    let scanned = 0;
    let updated = 0;

    for (const file of files) {
        const cache = plugin.app.metadataCache.getFileCache(file);
        const rawFrontmatter = cache?.frontmatter as Record<string, unknown> | undefined;
        if (!rawFrontmatter) continue;
        const normalized = normalizeFrontmatterKeys(rawFrontmatter, mappings);
        const classRaw = normalized.Class;
        const classValue = typeof classRaw === 'string' ? classRaw.trim().toLowerCase() : '';
        if (classValue !== 'matter' && classValue !== 'frontmatter' && classValue !== 'backmatter') continue;

        scanned += 1;
        let changed = false;

        await plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
            const fm = frontmatter as Record<string, unknown>;
            const currentMatter = fm.Matter && typeof fm.Matter === 'object'
                ? { ...(fm.Matter as Record<string, unknown>) }
                : {};

            const side = normalizeMatterSideFromContext(classValue, file.basename, currentMatter.side);
            const nextMatter: Record<string, unknown> = {
                ...currentMatter,
                side
            };

            if (workflow === 'guided') {
                nextMatter.bodyMode = 'plain';
            } else if (workflow === 'advanced') {
                nextMatter.bodyMode = 'latex';
                nextMatter.usesBookMeta = false;
            } else {
                nextMatter.bodyMode = 'auto';
            }

            if (JSON.stringify(currentMatter) !== JSON.stringify(nextMatter)) {
                fm.Matter = nextMatter;
                changed = true;
            }
        });

        if (changed) updated += 1;
    }

    return { scanned, updated, sourceFolder };
}

function parseBookMetaFromFrontmatter(frontmatter: Record<string, unknown>, sourcePath: string): BookMeta {
    const book = frontmatter.Book as Record<string, unknown> | undefined;
    const rights = frontmatter.Rights as Record<string, unknown> | undefined;
    const identifiers = frontmatter.Identifiers as Record<string, unknown> | undefined;
    const publisher = frontmatter.Publisher as Record<string, unknown> | undefined;

    const rawYear = rights?.year;
    const year = typeof rawYear === 'number'
        ? rawYear
        : typeof rawYear === 'string'
            ? Number(rawYear)
            : NaN;

    return {
        title: (book?.title as string) || undefined,
        author: (book?.author as string) || undefined,
        rights: rights ? {
            copyright_holder: (rights.copyright_holder as string) || undefined,
            year: Number.isFinite(year) ? year : undefined
        } : undefined,
        identifiers: identifiers ? {
            isbn_paperback: (identifiers.isbn_paperback as string) || undefined
        } : undefined,
        publisher: publisher ? {
            name: (publisher.name as string) || undefined
        } : undefined,
        sourcePath
    };
}

function getActiveBookMetaStatus(plugin: RadialTimelinePlugin): ActiveBookMetaStatus {
    const sourceFolder = getActiveBookExportContext(plugin).sourceFolder.trim();
    if (!sourceFolder) return { found: false, sourceFolder };

    const mappings = plugin.settings.enableCustomMetadataMapping
        ? plugin.settings.frontmatterMappings
        : undefined;

    const candidates = plugin.app.vault.getMarkdownFiles()
        .filter(file => isPathInFolderScope(file.path, sourceFolder))
        .map(file => {
            const cache = plugin.app.metadataCache.getFileCache(file);
            if (!cache?.frontmatter) return null;
            const normalized = normalizeFrontmatterKeys(cache.frontmatter as Record<string, unknown>, mappings);
            if (normalized.Class !== 'BookMeta') return null;
            return {
                path: file.path,
                meta: parseBookMetaFromFrontmatter(normalized, file.path)
            };
        })
        .filter((entry): entry is { path: string; meta: BookMeta } => !!entry)
        .sort((a, b) => a.path.localeCompare(b.path));

    if (!candidates.length) return { found: false, sourceFolder };

    const selected = candidates[0];
    if (candidates.length > 1) {
        return {
            found: true,
            path: selected.path,
            sourceFolder,
            bookMeta: selected.meta,
            warning: `Multiple BookMeta notes found. Using: ${selected.path}`
        };
    }
    return { found: true, path: selected.path, sourceFolder, bookMeta: selected.meta };
}

/**
 * Generate sample scene files and LaTeX templates in the user's vault.
 * Skips files that already exist. Auto-configures template paths in settings.
 */
async function generateSampleTemplates(plugin: RadialTimelinePlugin, matterLane: MatterSampleLane): Promise<string[]> {
    const vault = plugin.app.vault;
    const baseFolder = plugin.settings.manuscriptOutputFolder || 'Radial Timeline/Export';
    const templatesFolder = normalizePath(`${baseFolder}/Templates`);
    const pandocFolder = normalizePath(plugin.settings.pandocFolder || 'Pandoc');

    // Ensure folders exist
    for (const folder of [baseFolder, templatesFolder, pandocFolder]) {
        const normalized = normalizePath(folder);
        if (!vault.getAbstractFileByPath(normalized)) {
            await vault.createFolder(normalized);
        }
    }

    const createdFiles: string[] = [];

    // ── Sample Scene Files (using canonical base YAML template) ────────────
    // Get the canonical base template (single source of truth)
    const templates = plugin.settings.sceneYamlTemplates || DEFAULT_SETTINGS.sceneYamlTemplates;
    const baseTemplate = templates?.base || DEFAULT_SETTINGS.sceneYamlTemplates!.base;

    // Helper: generate YAML frontmatter from the canonical template, then
    // patch individual field values that differ per format.
    const patchYaml = (yaml: string, overrides: Record<string, string>): string => {
        let result = yaml;
        for (const [field, value] of Object.entries(overrides)) {
            // Replace "FieldName:" or "FieldName: <existing>" with "FieldName: <value>"
            result = result.replace(
                new RegExp(`^(${field}:).*$`, 'm'),
                value ? `$1 ${value}` : `$1`
            );
        }
        return result;
    };

    // Generate canonical YAML for each format, then patch format-specific defaults
    const screenplayData = {
        act: 1, when: '2024-01-15', sceneNumber: 1,
        subplots: ['Main Plot'], character: 'JANE, MIKE', place: ''
    };
    const screenplayYaml = patchYaml(
        generateSceneContent(baseTemplate, screenplayData),
        {
            Synopsis: 'Jane meets detective Mike at a coffee shop to discuss the Henderson case.',
            POV: 'Jane',
            Runtime: '3:00',
            Status: 'Working'
        }
    );

    const podcastData = {
        act: 1, when: '2024-01-15', sceneNumber: 1,
        subplots: ['Main Plot'], character: 'HOST, GUEST', place: ''
    };
    const podcastYaml = patchYaml(
        generateSceneContent(baseTemplate, podcastData),
        {
            Synopsis: 'Introduction and interview with Dr. Sarah Chen about AI and creativity.',
            Runtime: '8:00',
            Status: 'Working'
        }
    );

    const novelData = {
        act: 1, when: '2024-01-15', sceneNumber: 1,
        subplots: ['Main Plot'], character: 'Emma, Thomas', place: ''
    };
    const novelYaml = patchYaml(
        generateSceneContent(baseTemplate, novelData),
        {
            Synopsis: 'Emma discovers a hidden key inside a hollowed-out book in the old library.',
            POV: 'Emma',
            Status: 'Working'
        }
    );

    // Body text for each format (unchanged — only YAML generation was canonicalized)
    const screenplayBody = [
        'INT. COFFEE SHOP - DAY',
        '',
        'A bustling downtown coffee shop. Morning rush hour. JANE (30s, determined) sits at a corner table with her laptop open.',
        '',
        'MIKE (40s, world-weary detective) enters, scans the room, spots her.',
        '',
        '                    MIKE',
        '          You Jane?',
        '',
        '                    JANE',
        '              (without looking up)',
        '          Depends who\'s asking.',
        '',
        'Mike slides into the seat across from her.',
        '',
        '                    MIKE',
        '          I\'m the guy with answers.',
        '',
        '                    JANE',
        '          Then you\'re exactly who I need.',
        '',
        'She closes the laptop, meets his eyes for the first time.',
        '',
        '                    JANE (CONT\'D)',
        '          Tell me about the Henderson case.',
        '',
        'Mike\'s expression darkens.',
        '',
        '                    MIKE',
        '          That\'s not a door you want to open.',
        '',
        '                    JANE',
        '              (leaning forward)',
        '          Try me.',
        '',
        'BEAT. Mike glances around, lowers his voice.',
        '',
        '                    MIKE',
        '          Alright. But not here.',
        '',
        'He stands, drops a business card on the table.',
        '',
        '                    MIKE (CONT\'D)',
        '          Warehouse district. Pier 9. Tomorrow',
        '          at midnight.',
        '',
        'He walks out. Jane picks up the card, studies it.',
        '',
        'FADE OUT.'
    ].join('\n');

    const podcastBody = [
        '[SEGMENT: INTRODUCTION - 0:00]',
        '',
        'HOST: Welcome back to The Deep Dive, where we explore the stories behind the headlines. I\'m your host, Alex Rivera.',
        '',
        '[SFX: Theme music fades]',
        '',
        'HOST: Today we\'re talking about the rise of artificial intelligence in creative industries. With me is Dr. Sarah Chen, author of "The Algorithmic Muse."',
        '',
        'GUEST: Thanks for having me, Alex.',
        '',
        'HOST: So, Sarah, let\'s start with the big question everyone\'s asking — can AI really be creative?',
        '',
        'GUEST: That\'s the million-dollar question, isn\'t it? But I think we\'re asking it wrong.',
        '',
        'HOST: How so?',
        '',
        'GUEST: Instead of asking "can AI be creative," we should ask "what kind of creativity are we talking about?"',
        '',
        '[TIMING: 2:30]',
        '',
        '[SEGMENT: MAIN DISCUSSION - 2:30]',
        '',
        'HOST: Walk us through that distinction.',
        '',
        'GUEST: Well, there\'s creativity as originality — making something genuinely new. And then there\'s creativity as craft — executing an idea with skill. AI excels at the second, but the first? That\'s still very much a human domain.',
        '',
        'HOST: Give us an example.',
        '',
        'GUEST: An AI can generate a sonnet in seconds. Technically perfect. But ask it to capture the feeling of watching your child leave for college? That emotional truth — that\'s where humans still reign supreme.',
        '',
        '[TIMING: 5:00]',
        '',
        '[SEGMENT: CLOSING - 5:00]',
        '',
        'HOST: We\'re almost out of time, but I have to ask — what keeps you up at night about AI and creativity?',
        '',
        'GUEST: That we\'ll mistake efficiency for artistry. That we\'ll prioritize the quick over the meaningful.',
        '',
        'HOST: A perfect note to end on. Dr. Sarah Chen, thank you.',
        '',
        'GUEST: Thank you, Alex.',
        '',
        '[SFX: Theme music]',
        '',
        'HOST: That\'s it for this episode. Join us next week when we explore the ethics of synthetic media. Until then, keep diving deep.',
        '',
        '[END]'
    ].join('\n');

    const novelBody = [
        'The late afternoon sun filtered through the dusty windows of the old library, casting long shadows across the wooden floors. Emma ran her fingers along the spine of a leather-bound volume, feeling the familiar comfort of aged paper and binding glue.',
        '',
        '"You know you can\'t stay here forever," Thomas said from the doorway.',
        '',
        'She didn\'t turn around. "Watch me."',
        '',
        'He walked closer, his footsteps echoing in the empty reading room. "The demolition crew arrives Monday. This place will be rubble by Wednesday."',
        '',
        '"Then I have until Monday." Emma pulled the book from the shelf, opened it to reveal hollowed-out pages. Inside: a small brass key.',
        '',
        'Thomas leaned over her shoulder. "What is that?"',
        '',
        '"The reason they want this building torn down." She held the key up to the light, watching it glint. "The reason my grandfather died."',
        '',
        '"Emma—"',
        '',
        '"Don\'t." She closed the book, tucked it under her arm. "Don\'t tell me to let it go. Don\'t tell me it\'s not worth it."',
        '',
        'Thomas studied her face: the determined set of her jaw, the fire in her eyes that had been absent for so long. He sighed.',
        '',
        '"What do you need me to do?"',
        '',
        'She smiled for the first time in weeks. "Help me find what this key opens."',
        '',
        'Outside, the shadows grew longer. Somewhere in the building, old floorboards creaked. Emma and Thomas didn\'t notice. They were already lost in the hunt, following a trail of clues that would lead them into the heart of a decades-old conspiracy.',
        '',
        'The library held its secrets close, but not for much longer.'
    ].join('\n');

    const sampleScenes: { name: string; content: string }[] = [
        {
            name: 'Sample Screenplay Scene.md',
            content: `---\n${screenplayYaml}\n---\n\n${screenplayBody}`
        },
        {
            name: 'Sample Podcast Scene.md',
            content: `---\n${podcastYaml}\n---\n\n${podcastBody}`
        },
        {
            name: 'Sample Novel Scene.md',
            content: `---\n${novelYaml}\n---\n\n${novelBody}`
        }
    ];

    const currentYear = new Date().getFullYear();
    const bookMetaSample = {
        name: '000 BookMeta.md',
        content: [
            '---',
            'Class: BookMeta',
            'Book:',
            '  title: "Your Title"',
            '  author: "Author Name"',
            'Rights:',
            '  copyright_holder: "Author Name"',
            `  year: ${currentYear}`,
            'Identifiers:',
            '  isbn_paperback: "000-0-00-000000-0"',
            'Publisher:',
            '  name: "Publisher Name"',
            'Production:',
            '  imprint: "Imprint Name"',
            '  edition: "1"',
            '  print_location: "City, Country"',
            '---',
            ''
        ].join('\n')
    };

    const guidedMatterComment = [
        '<!--',
        'Guided Matter Page',
        'Rendered using BookMeta and the selected PDF template.',
        'Add plain text below only if this page needs custom prose.',
        '-->'
    ];

    const advancedMatterComment = [
        '<!--',
        'Advanced Matter Page',
        'Raw LaTeX is used below.',
        'Radial Timeline will not escape this content.',
        '-->'
    ];

    const guidedMatterSamples: { name: string; content: string }[] = [
        {
            name: '0.2 Title Page (Semantic).md',
            content: [
                '---',
                'Class: Matter',
                'Matter:',
                '  side: front',
                '  role: title-page',
                '  usesBookMeta: true',
                '  bodyMode: plain',
                '---',
                '',
                ...guidedMatterComment,
                '',
            ].join('\n')
        },
        {
            name: '0.3 Copyright (Semantic).md',
            content: [
                '---',
                'Class: Matter',
                'Matter:',
                '  side: front',
                '  role: copyright',
                '  usesBookMeta: true',
                '  bodyMode: plain',
                '---',
                '',
                ...guidedMatterComment,
                '',
                'Rights notice and legal disclaimer text can be written here in plain language.',
            ].join('\n')
        },
        {
            name: '0.04 Dedication (Semantic).md',
            content: [
                '---',
                'Class: Matter',
                'Matter:',
                '  side: front',
                '  role: dedication',
                '  usesBookMeta: false',
                '  bodyMode: plain',
                '---',
                '',
                ...guidedMatterComment,
                '',
                'For the ones who stayed.',
            ].join('\n')
        },
        {
            name: '0.05 Epigraph (Semantic).md',
            content: [
                '---',
                'Class: Matter',
                'Matter:',
                '  side: front',
                '  role: epigraph',
                '  usesBookMeta: false',
                '  bodyMode: plain',
                '---',
                '',
                ...guidedMatterComment,
                '',
                '"Your quote here."',
            ].join('\n')
        },
        {
            name: '200.01 Acknowledgments (Semantic).md',
            content: [
                '---',
                'Class: Matter',
                'Matter:',
                '  side: back',
                '  role: acknowledgments',
                '  usesBookMeta: false',
                '  bodyMode: plain',
                '---',
                '',
                ...guidedMatterComment,
                '',
                'Thank you to everyone who helped shape this manuscript.',
            ].join('\n')
        },
        {
            name: '200.02 About the Author (Semantic).md',
            content: [
                '---',
                'Class: Matter',
                'Matter:',
                '  side: back',
                '  role: about-author',
                '  usesBookMeta: true',
                '  bodyMode: plain',
                '---',
                '',
                ...guidedMatterComment,
                '',
                'Author bio goes here.',
            ].join('\n')
        }
    ];

    const advancedMatterSamples: { name: string; content: string }[] = [
        {
            name: '0.02 Title Page (Body LaTeX).md',
            content: [
                '---',
                'Class: Matter',
                'Matter:',
                '  side: front',
                '  role: title-page',
                '  usesBookMeta: false',
                '  bodyMode: latex',
                '---',
                '',
                ...advancedMatterComment,
                '',
                '\\begin{center}',
                '\\vspace*{\\fill}',
                '{\\Huge Your Title}\\\\[1em]',
                '{\\Large Author Name}',
                '\\vspace*{\\fill}',
                '\\end{center}',
            ].join('\n')
        },
        {
            name: '0.03 Copyright (Body LaTeX).md',
            content: [
                '---',
                'Class: Matter',
                'Matter:',
                '  side: front',
                '  role: copyright',
                '  usesBookMeta: false',
                '  bodyMode: latex',
                '---',
                '',
                ...advancedMatterComment,
                '',
                '\\begin{center}',
                '\\vspace*{\\fill}',
                'Copyright \\textcopyright{} 2026 Author Name',
                '\\vspace*{\\fill}',
                '\\end{center}',
            ].join('\n')
        },
        {
            name: '0.04 Dedication (Body LaTeX).md',
            content: [
                '---',
                'Class: Matter',
                'Matter:',
                '  side: front',
                '  role: dedication',
                '  usesBookMeta: false',
                '  bodyMode: latex',
                '---',
                '',
                ...advancedMatterComment,
                '',
                '\\begin{center}',
                '\\vspace*{\\fill}',
                'For the ones who stayed.',
                '\\vspace*{\\fill}',
                '\\end{center}',
            ].join('\n')
        },
        {
            name: '0.05 Epigraph (Body LaTeX).md',
            content: [
                '---',
                'Class: Matter',
                'Matter:',
                '  side: front',
                '  role: epigraph',
                '  usesBookMeta: false',
                '  bodyMode: latex',
                '---',
                '',
                ...advancedMatterComment,
                '',
                '\\begin{flushright}',
                '\\emph{"Your quote here."}',
                '\\end{flushright}',
            ].join('\n')
        },
        {
            name: '200.01 Acknowledgments (Body LaTeX).md',
            content: [
                '---',
                'Class: Matter',
                'Matter:',
                '  side: back',
                '  role: acknowledgments',
                '  usesBookMeta: false',
                '  bodyMode: latex',
                '---',
                '',
                ...advancedMatterComment,
                '',
                '\\section*{Acknowledgments}',
                'Thank you to everyone who helped shape this manuscript.',
            ].join('\n')
        },
        {
            name: '200.02 About the Author (Body LaTeX).md',
            content: [
                '---',
                'Class: Matter',
                'Matter:',
                '  side: back',
                '  role: about-author',
                '  usesBookMeta: false',
                '  bodyMode: latex',
                '---',
                '',
                ...advancedMatterComment,
                '',
                '\\section*{About the Author}',
                'Author bio goes here.',
            ].join('\n')
        }
    ];

    const mixedMatterSamples: { name: string; content: string }[] = guidedMatterSamples.map((sample) => ({
        name: sample.name,
        content: sample.content
            .replace(/bodyMode:\s*plain/g, 'bodyMode: auto')
            .replace(/Guided Matter Page/g, 'Mixed Matter Page')
            .replace(
                /Rendered using BookMeta and the selected PDF template\./g,
                'Uses bodyMode:auto so each page can be semantic plain content or inline LaTeX.'
            )
    }));

    const matterSamples = matterLane === 'advanced'
        ? advancedMatterSamples
        : matterLane === 'mixed'
            ? mixedMatterSamples
            : guidedMatterSamples;

    // ── LaTeX Templates ─────────────────────────────────────────────────────
    const latexTemplates: { name: string; content: string }[] = [
        {
            name: 'screenplay_template.tex',
            content: [
                '% Pandoc LaTeX Template — Screenplay Format',
                '% US industry standard: Courier 12pt, specific margins',
                '\\documentclass[12pt,letterpaper]{article}',
                '',
                '\\usepackage[top=1in,bottom=1in,left=1.5in,right=1in]{geometry}',
                '\\usepackage{fontspec}',
                '\\usepackage{parskip}',
                '',
                '% Courier is the screenplay standard',
                '\\setmainfont{Courier New}[',
                '  BoldFont={Courier New Bold},',
                '  ItalicFont={Courier New Italic}',
                ']',
                '',
                '\\pagestyle{plain}',
                '\\setlength{\\parindent}{0pt}',
                '\\setlength{\\parskip}{12pt}',
                '',
                '% Disable hyphenation (screenplay convention)',
                '\\hyphenpenalty=10000',
                '\\exhyphenpenalty=10000',
                '',
                '\\begin{document}',
                '',
                '$body$',
                '',
                '\\end{document}'
            ].join('\n')
        },
        {
            name: 'podcast_template.tex',
            content: [
                '% Pandoc LaTeX Template — Podcast Script Format',
                '% Clean sans-serif for audio production scripts',
                '\\documentclass[11pt,letterpaper]{article}',
                '',
                '\\usepackage[top=1in,bottom=1in,left=1in,right=1in]{geometry}',
                '\\usepackage{fontspec}',
                '\\usepackage{parskip}',
                '',
                '% Clean sans-serif for readability',
                '\\setmainfont{Helvetica Neue}[',
                '  BoldFont={Helvetica Neue Bold},',
                '  ItalicFont={Helvetica Neue Italic}',
                ']',
                '',
                '\\pagestyle{plain}',
                '\\setlength{\\parindent}{0pt}',
                '\\setlength{\\parskip}{8pt}',
                '',
                '\\begin{document}',
                '',
                '$body$',
                '',
                '\\end{document}'
            ].join('\n')
        },
        {
            name: 'novel_template.tex',
            content: [
                '% Pandoc LaTeX Template — Novel Manuscript Format',
                '% Traditional publishing format: Times 12pt, double-spaced',
                '\\documentclass[12pt,letterpaper]{article}',
                '',
                '\\usepackage[top=1in,bottom=1in,left=1in,right=1in]{geometry}',
                '\\usepackage{fontspec}',
                '\\usepackage{setspace}',
                '',
                '% Times New Roman is the publishing standard',
                '\\setmainfont{Times New Roman}[',
                '  BoldFont={Times New Roman Bold},',
                '  ItalicFont={Times New Roman Italic}',
                ']',
                '',
                '% Double spacing (standard for manuscript submissions)',
                '\\doublespacing',
                '',
                '% First line indent',
                '\\setlength{\\parindent}{0.5in}',
                '\\setlength{\\parskip}{0pt}',
                '',
                '% Page numbers top right',
                '\\usepackage{fancyhdr}',
                '\\pagestyle{fancy}',
                '\\fancyhf{}',
                '\\fancyhead[R]{\\thepage}',
                '\\renewcommand{\\headrulewidth}{0pt}',
                '',
                '\\begin{document}',
                '',
                '$body$',
                '',
                '\\end{document}'
            ].join('\n')
        },
        {
            name: 'ajfinn_rt.tex',
            content: [
                '% Pandoc LaTeX Template — AJ Finn (Radial Timeline native)',
                '% Sophisticated print styling without external JS compile layer.',
                '\\documentclass[11pt,letterpaper,twoside]{book}',
                '',
                '\\usepackage{fontspec}',
                '\\usepackage{amssymb}',
                '\\usepackage{fancyhdr}',
                '\\usepackage{titlesec}',
                '\\usepackage{geometry}',
                '\\usepackage{setspace}',
                '\\usepackage{graphicx}',
                '\\usepackage{etoolbox}',
                '',
                '% Pandoc compatibility macro for compact lists',
                '\\providecommand{\\tightlist}{%',
                '  \\setlength{\\itemsep}{0pt}\\setlength{\\parskip}{0pt}',
                '}',
                '',
                '% Print trim-style page geometry',
                '\\geometry{paperwidth=6in,paperheight=9in,top=1in,bottom=1in,left=1in,right=1in}',
                '',
                '\\defaultfontfeatures{Ligatures=TeX}',
                '\\IfFontExistsTF{Sorts Mill Goudy}{',
                '  \\setmainfont{Sorts Mill Goudy}[ItalicFont={Sorts Mill Goudy Italic}]',
                '  \\newfontface\\headerfont{Sorts Mill Goudy}[LetterSpace=15.0]',
                '}{',
                '  \\setmainfont{TeX Gyre Pagella}',
                '  \\newfontface\\headerfont{TeX Gyre Pagella}[LetterSpace=12.0]',
                '}',
                '',
                '\\newcommand{\\BookTitle}{$if(title)$$title$$else$Untitled Manuscript$endif$}',
                '\\newcommand{\\AuthorName}{$if(author)$$for(author)$$author$$sep$, $endfor$$else$Author$endif$}',
                '',
                '\\fancyhf{}',
                '\\renewcommand{\\headrulewidth}{0pt}',
                '\\renewcommand{\\footrulewidth}{0pt}',
                '\\setlength{\\parskip}{0pt}',
                '\\setlength{\\headsep}{24pt}',
                '\\setlength{\\headheight}{14pt}',
                '',
                '\\newcommand{\\KernedText}[1]{{\\headerfont\\MakeUppercase{#1}}}',
                '\\newcommand{\\PageNumber}[1]{\\raisebox{0.2ex}{#1}}',
                '\\newcommand{\\HeaderSeparator}{\\raisebox{0.2ex}{\\textbar}}',
                '',
                '\\fancyhead[CE]{%',
                '  \\PageNumber{\\thepage}\\hspace{1em}\\HeaderSeparator\\hspace{1em}\\KernedText{\\AuthorName}',
                '}',
                '\\fancyhead[CO]{%',
                '  \\KernedText{\\BookTitle}\\hspace{1em}\\HeaderSeparator\\hspace{1em}\\PageNumber{\\thepage}',
                '}',
                '\\fancyfoot{}',
                '\\pagestyle{fancy}',
                '',
                '\\setcounter{secnumdepth}{1}',
                '',
                '% Scene opener pages (new scene starts): headerless, centered, cinematic spacing',
                '\\titleformat{\\section}[display]{\\normalfont\\bfseries\\centering\\fontsize{30}{34}\\selectfont}{\\arabic{section}}{0.2em}{}',
                '\\titleformat{name=\\section,numberless}[display]{\\normalfont\\bfseries\\centering\\fontsize{30}{34}\\selectfont}{}{0pt}{}',
                '\\titlespacing*{\\section}{0pt}{\\dimexpr\\textheight/5\\relax}{\\dimexpr\\textheight/5\\relax}',
                '\\preto\\section{\\clearpage\\thispagestyle{empty}}',
                '',
                '% Pandoc may emit subsection headings depending on markdown level/template defaults',
                '\\titleformat{\\subsection}[display]{\\normalfont\\bfseries\\centering\\fontsize{30}{34}\\selectfont}{\\arabic{subsection}}{0.2em}{}',
                '\\titleformat{name=\\subsection,numberless}[display]{\\normalfont\\bfseries\\centering\\fontsize{30}{34}\\selectfont}{}{0pt}{}',
                '\\titlespacing*{\\subsection}{0pt}{\\dimexpr\\textheight/5\\relax}{\\dimexpr\\textheight/5\\relax}',
                '\\preto\\subsection{\\clearpage\\thispagestyle{empty}}',
                '',
                '\\onehalfspacing',
                '\\setlength{\\parindent}{1.5em}',
                '',
                '\\begin{document}',
                '\\setcounter{page}{1}',
                '',
                '$body$',
                '',
                '\\end{document}'
            ].join('\n')
        }
    ];

    // Create all files (skip existing)
    for (const scene of sampleScenes) {
        const filePath = normalizePath(`${templatesFolder}/${scene.name}`);
        if (!vault.getAbstractFileByPath(filePath)) {
            await vault.create(filePath, scene.content);
            createdFiles.push(scene.name);
        }
    }

    if (matterLane === 'guided' || matterLane === 'mixed') {
        const bookMetaPath = normalizePath(`${templatesFolder}/${bookMetaSample.name}`);
        if (!vault.getAbstractFileByPath(bookMetaPath)) {
            await vault.create(bookMetaPath, bookMetaSample.content);
            createdFiles.push(bookMetaSample.name);
        }
    }

    for (const matter of matterSamples) {
        const filePath = normalizePath(`${templatesFolder}/${matter.name}`);
        if (!vault.getAbstractFileByPath(filePath)) {
            await vault.create(filePath, matter.content);
            createdFiles.push(matter.name);
        }
    }

    for (const template of latexTemplates) {
        const filePath = normalizePath(`${pandocFolder}/${template.name}`);
        if (!vault.getAbstractFileByPath(filePath)) {
            await vault.create(filePath, template.content);
            createdFiles.push(template.name);
        }
    }

    // Auto-register generated .tex files as bundled pandoc layouts
    const existingLayouts = plugin.settings.pandocLayouts || [];
    const existingIds = new Set(existingLayouts.map(l => l.id));
    const sampleLayouts: PandocLayoutTemplate[] = [
        { id: 'bundled-screenplay', name: 'Screenplay', preset: 'screenplay', path: normalizePath(`${pandocFolder}/screenplay_template.tex`), bundled: true },
        { id: 'bundled-podcast', name: 'Podcast Script', preset: 'podcast', path: normalizePath(`${pandocFolder}/podcast_template.tex`), bundled: true },
        { id: 'bundled-novel', name: 'Novel Manuscript', preset: 'novel', path: normalizePath(`${pandocFolder}/novel_template.tex`), bundled: true },
        { id: 'bundled-novel-ajfinn-rt', name: 'AJ Finn RT', preset: 'novel', path: normalizePath(`${pandocFolder}/ajfinn_rt.tex`), bundled: true },
    ];
    for (const layout of sampleLayouts) {
        if (!existingIds.has(layout.id)) {
            existingLayouts.push(layout);
        }
    }
    plugin.settings.pandocLayouts = existingLayouts;
    await plugin.saveSettings();

    return createdFiles;
}

// ═══════════════════════════════════════════════════════════════════════════════
// OPEN BETA CONFIGURATION
// Set to false when transitioning to paid licensing
// ═══════════════════════════════════════════════════════════════════════════════
const OPEN_BETA_ACTIVE = true;

interface SectionParams {
    app: App;
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
    renderHero?: (containerEl: HTMLElement) => void;
    onProToggle?: () => void;
}

/**
 * Check if a professional license key is valid
 */
export function isProfessionalLicenseValid(key: string | undefined): boolean {
    if (!key || key.trim().length === 0) {
        return false;
    }
    // TODO(#SAN-1): Connect to license validation API when beta ends.
    return key.trim().length >= 16;
}

/**
 * Check if the professional tier is active
 * During Open Beta, Pro features are enabled for everyone (unless dev toggle is off)
 */
export function isProfessionalActive(plugin: RadialTimelinePlugin): boolean {
    // Check dev toggle for testing (defaults to true if undefined)
    if (plugin.settings.devProActive === false) {
        return false;
    }

    // During Open Beta, everyone gets Pro access
    if (OPEN_BETA_ACTIVE) {
        return true;
    }
    return isProfessionalLicenseValid(plugin.settings.professionalLicenseKey);
}

/**
 * Check if we're in Open Beta mode
 */
export function isOpenBeta(): boolean {
    return OPEN_BETA_ACTIVE;
}

export function renderProfessionalSection({ plugin, containerEl, renderHero, onProToggle }: SectionParams): HTMLElement {
    const hasValidKey = isProfessionalLicenseValid(plugin.settings.professionalLicenseKey);
    const isActive = isProfessionalActive(plugin);

    // ─────────────────────────────────────────────────────────────────────────
    // ROOT CONTAINER (Pro Skin)
    // ─────────────────────────────────────────────────────────────────────────
    const section = containerEl.createDiv({ cls: ERT_CLASSES.STACK });

    // ─────────────────────────────────────────────────────────────────────────
    // HERO / HEADER
    // ─────────────────────────────────────────────────────────────────────────
    // Render external hero hook (if any)
    renderHero?.(section);

    // ─────────────────────────────────────────────────────────────────────────
    // HERO / HEADER (Legacy Layout Restored)
    // ─────────────────────────────────────────────────────────────────────────
    const hero = section.createDiv({ cls: `${ERT_CLASSES.CARD} ${ERT_CLASSES.CARD_HERO} ${ERT_CLASSES.STACK}` });

    // Badge Row
    const badgeRow = hero.createDiv({ cls: ERT_CLASSES.INLINE });

    // Status Badge (Standardized Pill)
    const badge = badgeRow.createSpan({ cls: `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_PRO}` });

    const iconSpan = badge.createSpan({ cls: ERT_CLASSES.BADGE_PILL_ICON });
    setIcon(iconSpan, 'signature');

    badge.createSpan({
        cls: ERT_CLASSES.BADGE_PILL_TEXT,
        text: isActive ? 'PRO FEATURES ACTIVE' : 'PRO INACTIVE'
    });

    // Wiki Link Icon
    const wikiLink = badge.createEl('a', {
        href: 'https://github.com/EricRhysTaylor/radial-timeline/wiki/Settings#professional',
        cls: 'ert-badgePill__rightIcon',
        attr: {
            'aria-label': 'Read more in the Wiki',
            'target': '_blank',
            'rel': 'noopener'
        }
    });
    setIcon(wikiLink, 'external-link');

    // Beta Badge
    if (OPEN_BETA_ACTIVE) {
        const betaBadge = badgeRow.createSpan({
            cls: `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_NEUTRAL} ${ERT_CLASSES.BADGE_PILL_SM}`
        });
        betaBadge.createSpan({ cls: ERT_CLASSES.BADGE_PILL_TEXT, text: 'EARLY ACCESS BETA' });
    }

    // Toggle (Moved to Top Right)
    const toggleContainer = badgeRow.createDiv({ cls: `${ERT_CLASSES.SECTION_ACTIONS} ${ERT_CLASSES.CHIP}` });

    toggleContainer.createSpan({
        cls: `ert-toggle-label ${isActive ? ERT_CLASSES.IS_ACTIVE : ''}`,
        text: isActive ? 'Active' : 'Inactive'
    });

    const checkbox = toggleContainer.createEl('input', {
        type: 'checkbox',
        cls: 'ert-toggle-input'
    });
    checkbox.checked = plugin.settings.devProActive !== false;
    const rerender = () => {
        if (onProToggle) {
            onProToggle();
            return;
        }
        containerEl.empty();
        renderProfessionalSection({ app: plugin.app, plugin, containerEl, renderHero, onProToggle });
    };

    checkbox.onchange = async () => {
        plugin.settings.devProActive = checkbox.checked;
        await plugin.saveSettings();
        rerender();
    };

    // ─────────────────────────────────────────────────────────────────────────
    // CONTENT STACK
    // ─────────────────────────────────────────────────────────────────────────
    const addProRow = (setting: Setting) => setting;
    const lockPanel = (panel: HTMLElement) => {
        if (!isActive) {
            panel.addClass('ert-pro-locked');
        }
        return panel;
    };

    // Open Beta Banner
    if (OPEN_BETA_ACTIVE) {
        const betaPanel = lockPanel(section.createDiv({ cls: `${ERT_CLASSES.PANEL} ${ERT_CLASSES.STACK}` }));

        const bannerHeader = betaPanel.createDiv({ cls: ERT_CLASSES.INLINE });
        const bannerIcon = bannerHeader.createSpan({ cls: 'ert-setting-heading-icon' });
        setIcon(bannerIcon, 'shell');
        bannerHeader.createEl('strong', { text: 'Thank you for supporting the future of Radial Timeline [RT].' });

        betaPanel.createEl('p', {
            cls: ERT_CLASSES.SECTION_DESC,
            text: 'Pro features are currently free during the Open Beta.'
        });

        const rewardBox = betaPanel.createDiv({ cls: [ERT_CLASSES.PREVIEW_FRAME, 'ert-previewFrame--flush'] });
        const p = rewardBox.createEl('p', { attr: { style: 'margin: 0; line-height: 1.5;' } });
        p.createEl('strong', { text: 'A new phase in development begins. ' });
        p.createSpan({ text: 'During this phase, bug fixes, stability, and workflow optimization are top priorities. Reproducible technical issues and clear usability problems are actively reviewed and addressed as part of iterative development. Your feedback helps shape what gets refined and improved next.' });

        const feedbackLink = betaPanel.createEl('a', {
            text: 'Share feedback →',
            href: 'https://radial-timeline.com/feedback',
            cls: 'ert-link-accent',
            attr: { target: '_blank', rel: 'noopener' }
        });
    }

    // License Key (Post-Beta)
    if (!OPEN_BETA_ACTIVE) {
        const licensePanel = lockPanel(section.createDiv({ cls: `${ERT_CLASSES.PANEL} ${ERT_CLASSES.STACK}` }));
        const licenseSetting = addProRow(new Setting(licensePanel))
            .setName('License Key')
            .setDesc('Enter your Pro license key to unlock advanced features.')
            .addText(text => {
                text.setPlaceholder('XXXX-XXXX-XXXX-XXXX');
                text.setValue(plugin.settings.professionalLicenseKey || '');
                text.inputEl.addClass('ert-input--lg');
                text.inputEl.type = 'password';

                // Show/Hide Toggle
                const toggleVis = text.inputEl.parentElement?.createEl('button', {
                    cls: 'ert-clickable-icon clickable-icon', // SAFE: clickable-icon used for Obsidian icon button styling
                    attr: { type: 'button', 'aria-label': 'Show/hide license key' }
                });
                if (toggleVis) {
                    setIcon(toggleVis, 'eye');
                    plugin.registerDomEvent(toggleVis, 'click', () => {
                        if (text.inputEl.type === 'password') {
                            text.inputEl.type = 'text';
                            setIcon(toggleVis, 'eye-off');
                        } else {
                            text.inputEl.type = 'password';
                            setIcon(toggleVis, 'eye');
                        }
                    });
                }

                plugin.registerDomEvent(text.inputEl, 'blur', async () => {
                    const value = text.getValue().trim();
                    plugin.settings.professionalLicenseKey = value || undefined;
                    await plugin.saveSettings();
                    rerender();
                });
            });

        // "Get key" link
        const nameEl = licenseSetting.nameEl;
        nameEl.createEl('a', {
            text: ' Get key →',
            href: 'https://radial-timeline.com/signature',
            cls: 'ert-link-accent',
            attr: { target: '_blank', rel: 'noopener' }
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PANDOC & EXPORT SETTINGS
    // ─────────────────────────────────────────────────────────────────────────
    const pandocPanel = lockPanel(section.createDiv({ cls: `${ERT_CLASSES.PANEL} ${ERT_CLASSES.STACK}` }));
    const pandocHeading = addProRow(new Setting(pandocPanel))
        .setName('Export & Publishing')
        .setDesc('Assemble your manuscript in Markdown or render a print-ready PDF using Pandoc and LaTeX. Configure templates, layouts, and publishing tools below.')
        .setHeading();
    addHeadingIcon(pandocHeading, 'book-open-text');
    addWikiLink(pandocHeading, 'Settings#professional');
    applyErtHeaderLayout(pandocHeading);

    const systemConfigSection = pandocPanel.createDiv({
        cls: `${ERT_CLASSES.SECTION} ${ERT_CLASSES.SECTION_TIGHT}`
    });
    systemConfigSection.createEl('h5', { text: 'System Configuration', cls: ERT_CLASSES.SECTION_TITLE });

    // Settings
    let pandocPathInputEl: HTMLInputElement | null = null;
    const defaultDesc = 'Path to your Pandoc executable. Required for PDF rendering. Leave blank to use your system PATH, or click Auto locate.';
    const pandocSetting = addProRow(new Setting(systemConfigSection))
        .setName('Pandoc & LaTeX')
        .setDesc(defaultDesc)
        .addText(text => {
            text.inputEl.addClass('ert-input--lg');
            text.setPlaceholder('/usr/local/bin/pandoc');
            text.setValue(plugin.settings.pandocPath || '');
            pandocPathInputEl = text.inputEl;
            plugin.registerDomEvent(text.inputEl, 'blur', async () => {
                const value = text.getValue().trim();
                plugin.settings.pandocPath = value;
                await plugin.saveSettings();
            });
        })
        .addButton(button => {
            button.setButtonText('Auto locate');
            button.onClick(async () => {
                button.setDisabled(true);
                button.setButtonText('Locating…');
                try {
                    const scan = await scanSystemPaths();
                    const msgs: string[] = [];

                    if (scan.pandocPath) {
                        msgs.push(`✓ Pandoc found at ${scan.pandocPath}`);
                        // Auto-fill path if currently empty
                        if (!plugin.settings.pandocPath) {
                            plugin.settings.pandocPath = scan.pandocPath;
                            await plugin.saveSettings();
                            if (pandocPathInputEl) {
                                pandocPathInputEl.value = scan.pandocPath;
                                pandocPathInputEl.addClass('ert-setting-input-success');
                                window.setTimeout(() => pandocPathInputEl?.removeClass('ert-setting-input-success'), 1200);
                            }
                        }
                    } else {
                        msgs.push('⚠ Pandoc not found — install from pandoc.org');
                    }

                    if (scan.latexPath) {
                        msgs.push(`✓ LaTeX found (${scan.latexEngine})`);
                        const availableEngines = listAvailableLatexEngines();
                        if (availableEngines.length > 0) {
                            msgs.push(`Available engines: ${availableEngines.map(item => item.engine).join(', ')}`);
                        }
                        msgs.push('Auto PDF engine: xelatex/lualatex for fontspec templates, otherwise pdflatex.');
                    } else {
                        msgs.push('⚠ LaTeX not found — needed for PDF export');
                    }

                    pandocSetting.setDesc(msgs.join(' · '));
                    new Notice(msgs.join('\n'));

                    // Revert description after 8 seconds
                    window.setTimeout(() => {
                        pandocSetting.setDesc(defaultDesc);
                    }, 8000);
                } catch (e) {
                    const msg = (e as Error).message || String(e);
                    pandocSetting.setDesc(`Error: ${msg}`);
                    window.setTimeout(() => {
                        pandocSetting.setDesc(defaultDesc);
                    }, 5000);
                } finally {
                    button.setDisabled(false);
                    button.setButtonText('Auto locate');
                }
            });
        });

    addProRow(new Setting(systemConfigSection))
        .setName('Pandoc fallback')
        .setDesc('Optional path to a secondary Pandoc binary. Used if the primary path cannot be found.')
        .addText(text => {
            text.inputEl.addClass('ert-input--lg');
            text.setPlaceholder('/path/to/pandoc');
            text.setValue(plugin.settings.pandocFallbackPath || '');
            plugin.registerDomEvent(text.inputEl, 'blur', async () => {
                const value = text.getValue().trim();
                plugin.settings.pandocFallbackPath = value;
                await plugin.saveSettings();
            });
        })
        .addToggle(toggle => {
            toggle.setValue(!!plugin.settings.pandocEnableFallback);
            toggle.onChange(async (value) => {
                plugin.settings.pandocEnableFallback = value;
                await plugin.saveSettings();
            });
        });

    // ── Pandoc Folder ─────────────────────────────────────────────────────
    addProRow(new Setting(systemConfigSection))
        .setName('Pandoc folder')
        .setDesc('Vault folder where Radial Timeline stores PDF templates and compile scripts (.tex, .js). This folder is used when rendering PDF exports.')
        .addText(text => {
            text.inputEl.addClass('ert-input--lg');
            text.setPlaceholder('Pandoc');
            text.setValue(plugin.settings.pandocFolder || 'Pandoc');

            const saveAndValidateFolder = async () => {
                const raw = text.getValue().trim();
                const normalized = raw ? normalizePath(raw) : '';
                plugin.settings.pandocFolder = normalized;
                await plugin.saveSettings();

                // Flash validate: check if folder exists in the vault
                text.inputEl.removeClass('ert-input--flash-success', 'ert-input--flash-error');
                void text.inputEl.offsetWidth;
                if (normalized) {
                    const folder = plugin.app.vault.getAbstractFileByPath(normalized);
                    const cls = (folder && folder instanceof TFolder)
                        ? 'ert-input--flash-success'
                        : 'ert-input--flash-error';
                    text.inputEl.addClass(cls);
                    setTimeout(() => { text.inputEl.removeClass(cls); }, 1700);
                }
            };

            plugin.registerDomEvent(text.inputEl, 'blur', saveAndValidateFolder);
            plugin.registerDomEvent(text.inputEl, 'keydown', (e: KeyboardEvent) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    saveAndValidateFolder();
                }
            });
        });

    // ── Layout Registry Subsection ──────────────────────────────────────────
    const layoutSubSection = pandocPanel.createDiv({
        cls: `${ERT_CLASSES.SECTION} ${ERT_CLASSES.SECTION_TIGHT}`
    });
    layoutSubSection.createEl('h5', { text: 'Export Layouts (PDF)', cls: ERT_CLASSES.SECTION_TITLE });
    layoutSubSection.createEl('p', {
        cls: ERT_CLASSES.SECTION_DESC,
        text: 'Choose which LaTeX layout to use when rendering your manuscript to PDF.'
    });
    layoutSubSection.createEl('p', {
        cls: ERT_CLASSES.SECTION_DESC,
        text: 'Matter workflow is selected when generating a Template Pack:'
    });
    const workflowList = layoutSubSection.createEl('ul', { cls: ERT_CLASSES.SECTION_DESC });
    workflowList.createEl('li', {
        text: 'Guided (Recommended) — Uses a single BookMeta file and template-driven front/back matter pages.'
    });
    workflowList.createEl('li', {
        text: 'Advanced (LaTeX in Body) — Write raw LaTeX directly inside matter note bodies.'
    });
    workflowList.createEl('li', {
        text: 'Mixed — Keep semantic metadata and allow per-note bodyMode:auto (plain or inline LaTeX).'
    });

    const presetDescriptions: Record<string, string> = {
        novel: 'Traditional novel manuscript layout. Scenes become chapters or sections. Suitable for print-ready PDF.',
        screenplay: 'Screenplay formatting for industry-standard PDF scripts.',
        podcast: 'Structured podcast script layout for narration-based formats.'
    };
    const buildLayoutDescription = (layout: PandocLayoutTemplate): string => {
        const base = presetDescriptions[layout.preset] || 'Custom PDF layout.';
        const pathLabel = layout.path || '(no path)';
        return `${base} Template path: ${pathLabel}`;
    };

    /** Flash-validate a layout path input using the centralized helper. */
    const flashValidateLayoutPath = (inputEl: HTMLInputElement, layout: PandocLayoutTemplate) => {
        inputEl.removeClass('ert-input--flash-success', 'ert-input--flash-error');
        void inputEl.offsetWidth; // force reflow
        if (!layout.path.trim()) return;
        const result = validatePandocLayout(plugin, layout);
        const cls = result.valid ? 'ert-input--flash-success' : 'ert-input--flash-error';
        inputEl.addClass(cls);
        setTimeout(() => inputEl.removeClass(cls), 1700);
    };

    const layoutRowsContainer = layoutSubSection.createDiv({ cls: 'ert-layout-rows' });

    /** Render one row per existing layout. */
    const renderLayoutRows = () => {
        // Clear previous rows (keep header)
        const existingRows = layoutRowsContainer.querySelectorAll('.ert-layout-row');
        existingRows.forEach(el => el.remove());

        const layouts = plugin.settings.pandocLayouts || [];

        if (layouts.length === 0) {
            const emptyEl = layoutRowsContainer.createDiv({ cls: 'ert-layout-row setting-item' });
            emptyEl.createSpan({ text: 'No layouts configured. Add one below or generate a Template Pack.', cls: 'setting-item-description' });
        }

        for (const layout of layouts) {
            const row = layoutRowsContainer.createDiv({ cls: 'ert-layout-row' });

            const s = addProRow(new Setting(row))
                .setName(layout.name)
                .setDesc(buildLayoutDescription(layout))
                .addText(text => {
                    text.inputEl.addClass('ert-input--lg');
                    text.setPlaceholder('path/to/template.tex');
                    text.setValue(layout.path);

                    const saveAndValidate = async () => {
                        layout.path = text.getValue().trim();
                        await plugin.saveSettings();
                        flashValidateLayoutPath(text.inputEl, layout);
                        s.setDesc(buildLayoutDescription(layout));
                    };
                    attachTemplatePathSuggest(plugin, text, (path) => {
                        layout.path = path.trim();
                        void saveAndValidate();
                    });

                    // SAFE: direct addEventListener; Modal/Settings lifecycle manages cleanup
                    text.inputEl.addEventListener('blur', saveAndValidate);
                    text.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
                        if (e.key === 'Enter') { e.preventDefault(); saveAndValidate(); }
                    });
                })
                .addExtraButton(btn => {
                    btn.setIcon('trash');
                    btn.setTooltip('Remove layout');
                    btn.onClick(async () => {
                        plugin.settings.pandocLayouts = (plugin.settings.pandocLayouts || []).filter(l => l.id !== layout.id);
                        await plugin.saveSettings();
                        renderLayoutRows();
                    });
                });
        }
    };

    renderLayoutRows();

    // ── Add Layout inline form ───────────────────────────────────────────────
    let addFormVisible = false;
    const addFormContainer = layoutSubSection.createDiv({ cls: 'ert-layout-add-form ert-hidden' });

    let newName = '';
    let newPreset: 'novel' | 'screenplay' | 'podcast' = 'novel';
    let newPath = '';

    const addFormSetting = addProRow(new Setting(addFormContainer))
        .setName('New layout');
    addFormSetting.settingEl.addClass('ert-layout-add-form-setting');

    addFormSetting.addText(text => {
        text.setPlaceholder('Layout name');
        text.inputEl.addClass('ert-input--md');
        text.onChange(v => { newName = v; });
    });
    addFormSetting.addDropdown(dd => {
        dd.addOption('novel', 'Novel');
        dd.addOption('screenplay', 'Screenplay');
        dd.addOption('podcast', 'Podcast');
        dd.onChange(v => { newPreset = v as typeof newPreset; });
    });
    addFormSetting.addText(text => {
        text.setPlaceholder('path/to/template.tex');
        text.inputEl.addClass('ert-input--lg');
        text.onChange(v => { newPath = v; });
        attachTemplatePathSuggest(plugin, text, (path) => {
            newPath = path;
        });
    });
    const addFormHint = addFormContainer.createDiv({
        cls: ERT_CLASSES.SECTION_DESC,
        text: 'Tip: start typing to autocomplete existing .tex templates in your vault.'
    });
    addFormHint.addClass('ert-layout-add-form-hint');
    addFormSetting.addExtraButton(btn => {
        btn.setIcon('checkmark');
        btn.setTooltip('Confirm');
        btn.onClick(async () => {
            const trimName = newName.trim();
            if (!trimName) { new Notice('Layout name is required.'); return; }
            const id = `${slugifyToFileStem(trimName).toLowerCase()}-${newPreset}`;
            const existing = (plugin.settings.pandocLayouts || []);
            if (existing.some(l => l.id === id)) {
                new Notice('A layout with this name and preset already exists.');
                return;
            }
            existing.push({ id, name: trimName, preset: newPreset, path: newPath.trim(), bundled: false });
            plugin.settings.pandocLayouts = existing;
            await plugin.saveSettings();
            // Reset form
            newName = ''; newPreset = 'novel'; newPath = '';
            addFormContainer.addClass('ert-hidden');
            addFormVisible = false;
            renderLayoutRows();
        });
    });
    addFormSetting.addExtraButton(btn => {
        btn.setIcon('cross');
        btn.setTooltip('Cancel');
        btn.onClick(() => {
            addFormContainer.addClass('ert-hidden');
            addFormVisible = false;
        });
    });

    const templatePackSection = pandocPanel.createDiv({
        cls: `${ERT_CLASSES.SECTION} ${ERT_CLASSES.SECTION_TIGHT}`
    });
    templatePackSection.createEl('h5', { text: 'Template Pack Generation', cls: ERT_CLASSES.SECTION_TITLE });
    templatePackSection.createEl('p', {
        cls: ERT_CLASSES.SECTION_DESC,
        text: 'Creates scene examples, Pandoc PDF templates, and front/back matter scaffolds. Set workflow below, then generate or migrate active-book matter notes.'
    });

    const getSavedWorkflowMode = (): MatterSampleLane => {
        const saved = plugin.settings.matterWorkflowMode;
        if (saved === 'guided' || saved === 'advanced' || saved === 'mixed') return saved;
        return 'guided';
    };

    let selectedMatterWorkflow = getSavedWorkflowMode();
    const workflowSetting = addProRow(new Setting(templatePackSection))
        .setName('Matter workflow')
        .setDesc('Guided = frontmatter plain text. Advanced = inline LaTeX. Mixed = bodyMode:auto per note.')
        .addDropdown(dd => {
            dd.addOption('guided', 'Guided (frontmatter)');
            dd.addOption('advanced', 'Advanced (LaTeX body)');
            dd.addOption('mixed', 'Mixed');
            dd.setValue(selectedMatterWorkflow);
            dd.onChange(async (value) => {
                const next = value as MatterSampleLane;
                selectedMatterWorkflow = next;
                plugin.settings.matterWorkflowMode = next;
                await plugin.saveSettings();
            });
        });
    workflowSetting.addButton(button => {
        button.setButtonText('Apply to active book');
        button.setTooltip('Updates Matter.bodyMode for front/back matter notes in the active book source folder.');
        button.onClick(async () => {
            button.setDisabled(true);
            button.setButtonText('Applying…');
            try {
                const result = await applyMatterWorkflowToActiveBook(plugin, selectedMatterWorkflow);
                if (result.scanned === 0) {
                    new Notice(`No matter notes found in active book folder: ${result.sourceFolder}`);
                } else {
                    new Notice(`Applied "${selectedMatterWorkflow}" workflow to ${result.updated}/${result.scanned} matter notes.`);
                }
            } catch (e) {
                const msg = (e as Error).message || String(e);
                new Notice(`Failed to apply workflow: ${msg}`);
            } finally {
                button.setDisabled(false);
                button.setButtonText('Apply to active book');
            }
        });
    });

    const activeBookMetaStatus = getActiveBookMetaStatus(plugin);
    const activeBookMetaSetting = addProRow(new Setting(templatePackSection))
        .setName('Active book BookMeta')
        .setDesc('');
    if (activeBookMetaSetting.descEl) {
        activeBookMetaSetting.descEl.empty();
        const statusRow = activeBookMetaSetting.descEl.createDiv({
            cls: `ert-bookmeta-status ${activeBookMetaStatus.found ? 'is-found' : 'is-missing'}`
        });
        const statusIcon = statusRow.createSpan({ cls: 'ert-bookmeta-status-icon' });
        setIcon(statusIcon, activeBookMetaStatus.found ? 'check-circle' : 'alert-triangle');
        statusRow.createSpan({
            text: activeBookMetaStatus.found
                ? 'BookMeta detected in active book folder.'
                : 'No BookMeta found for active book. Guided Matter pages may render incomplete.'
        });
        if (activeBookMetaStatus.warning) {
            const warningRow = activeBookMetaSetting.descEl.createDiv({ cls: 'ert-bookmeta-status is-warning' });
            const warningIcon = warningRow.createSpan({ cls: 'ert-bookmeta-status-icon' });
            setIcon(warningIcon, 'alert-circle');
            warningRow.createSpan({ text: activeBookMetaStatus.warning });
        }
    }

    const previewFrame = templatePackSection.createDiv({ cls: `${ERT_CLASSES.PREVIEW_FRAME} ert-bookmeta-preview` });
    const previewHeader = previewFrame.createDiv({ cls: 'ert-bookmeta-preview-header' });
    const previewHeaderIcon = previewHeader.createSpan({ cls: 'ert-bookmeta-preview-header-icon' });
    setIcon(previewHeaderIcon, 'book-copy');
    previewHeader.createSpan({ text: 'BookMeta preview' });

    const previewGrid = previewFrame.createDiv({ cls: 'ert-bookmeta-preview-grid' });
    const addPreviewField = (label: string, value?: string | number | null) => {
        const item = previewGrid.createDiv({ cls: 'ert-bookmeta-preview-item' });
        item.createDiv({ cls: 'ert-bookmeta-preview-label', text: label });
        const normalized = value === undefined || value === null || String(value).trim().length === 0
            ? 'Not set'
            : String(value);
        const valueEl = item.createDiv({ cls: 'ert-bookmeta-preview-value', text: normalized });
        valueEl.toggleClass('ert-bookmeta-preview-value--empty', normalized === 'Not set');
    };

    if (activeBookMetaStatus.found && activeBookMetaStatus.bookMeta) {
        const meta = activeBookMetaStatus.bookMeta;
        addPreviewField('Title', meta.title);
        addPreviewField('Author', meta.author);
        addPreviewField('Copyright holder', meta.rights?.copyright_holder);
        addPreviewField('Rights year', meta.rights?.year);
        addPreviewField('ISBN paperback', meta.identifiers?.isbn_paperback);
        addPreviewField('Publisher', meta.publisher?.name);
        addPreviewField('Source note', meta.sourcePath || activeBookMetaStatus.path);
        if (activeBookMetaStatus.sourceFolder) {
            addPreviewField('Active book folder', activeBookMetaStatus.sourceFolder);
        }
    } else {
        addPreviewField('Status', 'No BookMeta note detected yet');
        if (activeBookMetaStatus.sourceFolder) {
            addPreviewField('Expected folder', activeBookMetaStatus.sourceFolder);
        }
        addPreviewField('Suggested file', '000 BookMeta.md');
    }

    // Add Layout + Generate Template Pack buttons row
    const layoutActionsSetting = addProRow(new Setting(templatePackSection));
    layoutActionsSetting.addButton(button => {
        button.setButtonText('Add Layout');
        button.onClick(() => {
            addFormVisible = !addFormVisible;
            addFormContainer.toggleClass('ert-hidden', !addFormVisible);
        });
    });
    layoutActionsSetting.addButton(button => {
        button.setButtonText('Generate Template Pack');
        button.setTooltip('Creates scene samples, Pandoc templates, and matter workflow scaffolds (Guided, Advanced, or Mixed).');
        button.setCta();
        button.onClick(async () => {
            const lane = await chooseMatterSampleLane(plugin.app, selectedMatterWorkflow);
            if (!lane) return;
            button.setDisabled(true);
            button.setButtonText('Generating Pack…');
            try {
                if (plugin.settings.matterWorkflowMode !== lane) {
                    plugin.settings.matterWorkflowMode = lane;
                    selectedMatterWorkflow = lane;
                    await plugin.saveSettings();
                }
                const created = await generateSampleTemplates(plugin, lane);
                if (created.length > 0) {
                    const laneLabel = lane === 'guided' ? 'guided' : lane === 'advanced' ? 'advanced' : 'mixed';
                    new Notice(`Created ${created.length} ${laneLabel} template-pack files. Scenes → Export/Templates, LaTeX → ${plugin.settings.pandocFolder || 'Pandoc'}/. Layouts registered.`);
                } else {
                    new Notice('All template-pack files already exist. Layouts updated.');
                }
                renderLayoutRows();
            } catch (e) {
                const msg = (e as Error).message || String(e);
                new Notice(`Error generating template pack: ${msg}`);
            } finally {
                button.setDisabled(false);
                button.setButtonText('Generate Template Pack');
            }
        });
    });
    const templatePackHelp = templatePackSection.createEl('ul', { cls: ERT_CLASSES.SECTION_DESC });
    templatePackHelp.createEl('li', { text: 'Scene examples' });
    templatePackHelp.createEl('li', { text: 'Pandoc PDF templates' });
    templatePackHelp.createEl('li', { text: 'Front/back matter scaffolds' });
    templatePackSection.createEl('p', {
        cls: ERT_CLASSES.SECTION_DESC,
        text: 'Use Matter workflow + Apply to active book to migrate existing notes; Generate Template Pack creates new scaffolds.'
    });

    return section;
}
