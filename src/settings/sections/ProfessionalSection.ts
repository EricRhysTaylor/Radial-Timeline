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
import * as path from 'path'; // SAFE: Node path for absolute-path detection in layout input normalization
import { generateSceneContent } from '../../utils/sceneGenerator';
import { DEFAULT_SETTINGS } from '../defaults';
import { validatePandocLayout, slugifyToFileStem } from '../../utils/exportFormats';
import type { PandocLayoutTemplate } from '../../types';
import type { BookMeta } from '../../types';
import { normalizeFrontmatterKeys } from '../../utils/frontmatter';
import { getActiveBookExportContext } from '../../utils/exportContext';
import { isPathInFolderScope } from '../../utils/pathScope';
import { normalizeMatterClassValue } from '../../utils/matterMeta';
import { extractBodyText, getSceneFilesByOrder } from '../../utils/manuscript';
import {
    getProEntitlementState,
    isEarlyAccessWindow
} from '../proEntitlement';
export { isProfessionalLicenseValid } from '../proEntitlement';
import {
    ensureBundledPandocLayoutsRegistered,
    getBundledPandocLayouts,
    installBundledPandocLayouts,
    isBundledPandocLayoutInstalled
} from '../../utils/pandocBundledLayouts';

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

type MatterSampleLane = 'guided' | 'advanced';

interface TemplatePathSuggestion {
    fullPath: string;
    storedPath: string;
    exists: boolean;
    inPandocFolder: boolean;
}

function getConfiguredPandocFolder(plugin: RadialTimelinePlugin): string {
    const defaultPandocFolder = normalizePath(DEFAULT_SETTINGS.pandocFolder || 'Radial Timeline/Pandoc');
    return normalizePath((plugin.settings.pandocFolder || defaultPandocFolder).trim() || defaultPandocFolder);
}

function compactTemplatePathForStorage(plugin: RadialTimelinePlugin, rawPath: string): string {
    const trimmed = rawPath.trim();
    if (!trimmed) return '';
    if (path.isAbsolute(trimmed) || /^[A-Za-z]:[\\/]/.test(trimmed)) {
        return trimmed;
    }

    const normalized = normalizePath(trimmed.replace(/^\/+/, ''));
    if (!normalized) return '';

    const pandocFolder = getConfiguredPandocFolder(plugin);
    const prefix = `${pandocFolder}/`;
    if (normalized.startsWith(prefix)) {
        return normalized.slice(prefix.length);
    }
    return normalized;
}

class PandocTemplatePathSuggest extends AbstractInputSuggest<TemplatePathSuggestion> {
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

    getSuggestions(query: string): TemplatePathSuggestion[] {
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

        const pandocFolder = getConfiguredPandocFolder(this.plugin);
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
        const dedupedByStored = new Map<string, TemplatePathSuggestion>();
        for (const fullPath of ordered) {
            const normalized = normalizePath(fullPath);
            const storedPath = compactTemplatePathForStorage(this.plugin, normalized);
            const inPandocFolder = storedPath !== normalized;
            const exists = this.app.vault.getAbstractFileByPath(normalized) instanceof TFile;
            const suggestion: TemplatePathSuggestion = {
                fullPath: normalized,
                storedPath,
                exists,
                inPandocFolder
            };
            const key = suggestion.storedPath.toLowerCase();
            const current = dedupedByStored.get(key);
            if (!current) {
                dedupedByStored.set(key, suggestion);
                continue;
            }
            if (!current.exists && suggestion.exists) {
                dedupedByStored.set(key, suggestion);
                continue;
            }
            if (!current.inPandocFolder && suggestion.inPandocFolder) {
                dedupedByStored.set(key, suggestion);
            }
        }

        const suggestions = Array.from(dedupedByStored.values());
        if (!lowered) return suggestions.slice(0, 40);
        return suggestions
            .filter(suggestion => {
                const haystack = `${suggestion.storedPath} ${suggestion.fullPath}`.toLowerCase();
                return haystack.includes(lowered);
            })
            .slice(0, 40);
    }

    renderSuggestion(suggestion: TemplatePathSuggestion, el: HTMLElement): void {
        const row = el.createDiv({ cls: 'ert-template-path-suggest' });
        row.createDiv({ cls: 'ert-template-path-suggest-path', text: suggestion.storedPath });
        const metaParts = [suggestion.exists ? 'Existing file' : 'Suggested path'];
        metaParts.push(suggestion.inPandocFolder ? 'Pandoc folder' : 'Custom path');
        row.createDiv({
            cls: 'ert-template-path-suggest-meta',
            text: metaParts.join(' · ')
        });
    }

    selectSuggestion(suggestion: TemplatePathSuggestion, _evt: MouseEvent | KeyboardEvent): void {
        this.inputRef.value = suggestion.storedPath;
        this.onChoose(suggestion.storedPath);
        try { this.close(); } catch {}
        try { this.inputRef.focus(); } catch {}
    }
}

class MatterSampleLaneModal extends Modal {
    private selected: MatterSampleLane;
    private readonly onPick: (lane: MatterSampleLane | null) => void;
    private readonly includeScriptExamples: boolean;
    private resolved = false;

    constructor(app: App, onPick: (lane: MatterSampleLane | null) => void, defaultLane: MatterSampleLane, includeScriptExamples: boolean) {
        super(app);
        this.onPick = onPick;
        this.selected = defaultLane;
        this.includeScriptExamples = includeScriptExamples;
    }

    onOpen(): void {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        if (modalEl) {
            modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell', 'ert-modal--template-pack', ERT_CLASSES.SKIN_PRO);
            modalEl.style.width = '560px'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxWidth = '92vw';
        }
        contentEl.addClass('ert-modal-container', 'ert-stack', 'ert-template-pack-modal');

        const header = contentEl.createDiv({ cls: 'ert-modal-header' });
        const badge = header.createSpan({ cls: `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_PRO}` });
        const badgeIcon = badge.createSpan({ cls: ERT_CLASSES.BADGE_PILL_ICON });
        setIcon(badgeIcon, 'signature');
        badge.createSpan({ cls: ERT_CLASSES.BADGE_PILL_TEXT, text: 'PRO' });
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
        const createdList = createdBlock.createEl('ol', { cls: 'ert-template-pack-list ert-template-pack-list--ordered' });
        const renderCreatedList = () => {
            createdList.empty();
            const items = this.selected === 'guided'
                ? [
                    '000 BookMeta.md (master publishing metadata file)',
                    'Front matter stubs (Title Page, Copyright, Dedication, etc.)',
                    'Back matter stubs (Acknowledgments, About the Author)',
                    'PDF layout templates'
                ]
                : [
                    'Front/back matter examples with working LaTeX bodies',
                    'PDF layout templates'
                ];
            if (this.includeScriptExamples) {
                items.splice(items.length - 1, 0, 'Script examples (screenplay + podcast)');
            }
            items.forEach(item => {
                const listItem = createdList.createEl('li', { cls: 'ert-template-pack-list-item' });
                listItem.setText(item);
            });
        };

        const optionsEl = contentEl.createDiv({ cls: 'ert-template-pack-options ert-stack--tight' });
        optionsEl.setAttr('role', 'radiogroup');
        optionsEl.setAttr('aria-label', 'Matter workflow');
        const optionButtons: Partial<Record<MatterSampleLane, HTMLDivElement>> = {};
        const refreshOptionState = () => {
            (Object.keys(optionButtons) as MatterSampleLane[]).forEach((lane) => {
                const active = this.selected === lane;
                const optionButton = optionButtons[lane];
                if (!optionButton) return;
                optionButton.toggleClass(ERT_CLASSES.IS_ACTIVE, active);
                optionButton.setAttr('aria-checked', active ? 'true' : 'false');
                optionButton.setAttr('tabindex', active ? '0' : '-1');
            });
            renderCreatedList();
        };

        const makeOption = (
            lane: MatterSampleLane,
            title: string,
            desc: string,
            iconName: string
        ) => {
            const option = optionsEl.createDiv({
                cls: 'ert-template-pack-option',
                attr: {
                    role: 'radio',
                    tabindex: '-1',
                    'aria-checked': 'false'
                }
            });
            const radioCol = option.createDiv({ cls: 'ert-template-pack-option-radio-col' });
            radioCol.createSpan({ cls: 'ert-template-pack-option-radio' });
            const optionContent = option.createDiv({ cls: 'ert-template-pack-option-content' });
            const optionHeader = optionContent.createDiv({ cls: 'ert-template-pack-option-header' });
            const optionIcon = optionHeader.createSpan({ cls: 'ert-template-pack-option-icon' });
            setIcon(optionIcon, iconName);
            optionHeader.createSpan({ cls: 'ert-template-pack-option-title', text: title });
            optionContent.createDiv({ cls: 'ert-template-pack-option-desc', text: desc });
            option.addEventListener('keydown', (evt: KeyboardEvent) => {
                if (evt.key !== 'Enter' && evt.key !== ' ') return;
                evt.preventDefault();
                this.selected = lane;
                refreshOptionState();
            });
            option.addEventListener('click', () => {
                this.selected = lane;
                refreshOptionState();
            });

            optionButtons[lane] = option;
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
            'Canonical inline-LaTeX front/back matter pages for the ST (Signature Literary) template. Best for advanced users comfortable with LaTeX.',
            'code'
        );
        refreshOptionState();

        const actions = contentEl.createDiv({ cls: 'ert-modal-actions ert-template-pack-actions' });
        const generateButton = new ButtonComponent(actions)
            .setButtonText('Generate Template Pack');
        generateButton.buttonEl.addClass('ert-btn', 'ert-btn--standard-pro');
        generateButton.onClick(() => {
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

async function chooseMatterSampleLane(app: App, defaultLane: MatterSampleLane, includeScriptExamples: boolean): Promise<MatterSampleLane | null> {
    return new Promise((resolve) => {
        new MatterSampleLaneModal(app, resolve, defaultLane, includeScriptExamples).open();
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

interface MatterRepairIssue {
    file: TFile;
    reasons: string[];
    nextClass?: 'Frontmatter' | 'Backmatter';
    nextRole?: 'other';
    nextBodyMode?: 'auto';
}

interface MatterRepairPlan {
    sourceFolder: string;
    issues: MatterRepairIssue[];
    repairableIssues: MatterRepairIssue[];
    unresolvedIssues: MatterRepairIssue[];
}

const VALID_MATTER_ROLES = new Set([
    'title-page',
    'copyright',
    'dedication',
    'epigraph',
    'acknowledgments',
    'about-author',
    'other'
]);

function normalizeFrontmatterLookupKey(key: string): string {
    return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getFrontmatterField(
    source: Record<string, unknown>,
    aliases: string[]
): { key: string; value: unknown } | null {
    const aliasSet = new Set(aliases.map(normalizeFrontmatterLookupKey));
    for (const [key, value] of Object.entries(source)) {
        if (aliasSet.has(normalizeFrontmatterLookupKey(key))) {
            return { key, value };
        }
    }
    return null;
}

function deleteFrontmatterAliases(frontmatter: Record<string, unknown>, aliases: string[]): void {
    const aliasSet = new Set(aliases.map(normalizeFrontmatterLookupKey));
    for (const key of Object.keys(frontmatter)) {
        if (aliasSet.has(normalizeFrontmatterLookupKey(key))) {
            delete frontmatter[key];
        }
    }
}

function normalizeMatterSideToken(value: unknown): 'front' | 'back' | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase().replace(/[^a-z]/g, '');
    if (normalized === 'front' || normalized === 'frontmatter') return 'front';
    if (normalized === 'back' || normalized === 'backmatter') return 'back';
    return null;
}

function resolveLegacyMatterSide(
    normalizedFrontmatter: Record<string, unknown>,
    legacyMatterValue: unknown
): 'front' | 'back' | null {
    const directSide = normalizeMatterSideToken(getFrontmatterField(normalizedFrontmatter, ['Side'])?.value);
    if (directSide) return directSide;

    const directClass = normalizeMatterSideToken(getFrontmatterField(normalizedFrontmatter, ['MatterClass'])?.value);
    if (directClass) return directClass;

    if (!legacyMatterValue || typeof legacyMatterValue !== 'object' || Array.isArray(legacyMatterValue)) {
        return normalizeMatterSideToken(legacyMatterValue);
    }

    const legacy = legacyMatterValue as Record<string, unknown>;
    return normalizeMatterSideToken(legacy.side)
        || normalizeMatterSideToken(legacy.Side)
        || normalizeMatterSideToken(legacy.class)
        || normalizeMatterSideToken(legacy.Class);
}

function normalizeRoleForRepair(value: unknown): { invalid: boolean; nextRole?: 'other' } {
    if (value === undefined || value === null) return { invalid: false };
    if (typeof value !== 'string') return { invalid: true, nextRole: 'other' };
    const normalized = value.trim().toLowerCase();
    if (!normalized.length) return { invalid: true, nextRole: 'other' };
    if (VALID_MATTER_ROLES.has(normalized)) return { invalid: false };
    return { invalid: true, nextRole: 'other' };
}

function normalizeBodyModeForRepair(value: unknown): { invalid: boolean; nextBodyMode?: 'auto' } {
    if (value === undefined || value === null) return { invalid: false };
    if (typeof value !== 'string') return { invalid: true, nextBodyMode: 'auto' };
    const normalized = value.trim().toLowerCase();
    if (normalized === 'plain' || normalized === 'latex' || normalized === 'auto') {
        return { invalid: false };
    }
    return { invalid: true, nextBodyMode: 'auto' };
}

function buildMatterRepairPlan(plugin: RadialTimelinePlugin): MatterRepairPlan {
    const sourceFolder = getActiveBookExportContext(plugin).sourceFolder.trim();
    if (!sourceFolder) {
        return { sourceFolder: '', issues: [], repairableIssues: [], unresolvedIssues: [] };
    }

    const mappings = plugin.settings.enableCustomMetadataMapping
        ? plugin.settings.frontmatterMappings
        : undefined;

    const files = plugin.app.vault.getMarkdownFiles()
        .filter(file => isPathInFolderScope(file.path, sourceFolder));

    const issues: MatterRepairIssue[] = [];

    for (const file of files) {
        const cache = plugin.app.metadataCache.getFileCache(file);
        const rawFrontmatter = cache?.frontmatter as Record<string, unknown> | undefined;
        if (!rawFrontmatter) continue;
        const normalized = normalizeFrontmatterKeys(rawFrontmatter, mappings);
        const classValue = normalizeMatterClassValue(getFrontmatterField(normalized, ['Class'])?.value);
        const legacyMatterValue = getFrontmatterField(normalized, ['Matter', 'matter'])?.value;
        const roleValue = getFrontmatterField(normalized, ['Role'])?.value;
        const bodyModeValue = getFrontmatterField(normalized, ['BodyMode'])?.value;
        const legacyBodyModeValue = getFrontmatterField(normalized, ['MatterBodyMode'])?.value;
        const useBookMetaValue = getFrontmatterField(normalized, ['UseBookMeta', 'UsesBookMeta'])?.value;

        const hasMatterSignal = !!classValue
            || legacyMatterValue !== undefined
            || roleValue !== undefined
            || bodyModeValue !== undefined
            || legacyBodyModeValue !== undefined
            || useBookMetaValue !== undefined;
        if (!hasMatterSignal) continue;

        const reasons: string[] = [];
        let nextClass: MatterRepairIssue['nextClass'];
        if (classValue === 'frontmatter') {
            nextClass = 'Frontmatter';
        } else if (classValue === 'backmatter') {
            nextClass = 'Backmatter';
        } else {
            reasons.push('missing-class');
            const sideFromLegacy = resolveLegacyMatterSide(normalized, legacyMatterValue);
            if (sideFromLegacy === 'front') nextClass = 'Frontmatter';
            if (sideFromLegacy === 'back') nextClass = 'Backmatter';
        }

        if (legacyMatterValue !== undefined) {
            reasons.push('legacy-matter');
        }

        const roleRepair = normalizeRoleForRepair(roleValue);
        if (roleRepair.invalid) {
            reasons.push('invalid-role');
        }

        const bodyModeRepair = normalizeBodyModeForRepair(bodyModeValue ?? legacyBodyModeValue);
        if (bodyModeRepair.invalid) {
            reasons.push('invalid-bodymode');
        }

        if (reasons.length === 0) continue;
        issues.push({
            file,
            reasons,
            nextClass,
            nextRole: roleRepair.nextRole,
            nextBodyMode: bodyModeRepair.nextBodyMode
        });
    }

    const repairableIssues = issues.filter(issue => !!issue.nextClass);
    const unresolvedIssues = issues.filter(issue => !issue.nextClass);
    return { sourceFolder, issues, repairableIssues, unresolvedIssues };
}

async function applyMatterRepairPlan(
    plugin: RadialTimelinePlugin,
    plan: MatterRepairPlan
): Promise<{ updated: number; attempted: number; unresolved: number; sourceFolder: string; repairedPaths: string[] }> {
    let updated = 0;
    const repairedPaths: string[] = [];

    for (const issue of plan.repairableIssues) {
        if (!issue.nextClass) continue;
        let changed = false;
        await plugin.app.fileManager.processFrontMatter(issue.file, (frontmatter) => {
            const fm = frontmatter as Record<string, unknown>;
            const before = JSON.stringify(fm);

            deleteFrontmatterAliases(fm, ['Class']);
            fm.Class = issue.nextClass;

            if (issue.nextRole) {
                deleteFrontmatterAliases(fm, ['Role']);
                fm.Role = issue.nextRole;
            }

            if (issue.nextBodyMode) {
                deleteFrontmatterAliases(fm, ['BodyMode', 'MatterBodyMode']);
                fm.BodyMode = issue.nextBodyMode;
            }

            deleteFrontmatterAliases(fm, ['Matter', 'matter']);

            if (before !== JSON.stringify(fm)) {
                changed = true;
            }
        });

        if (changed) {
            updated += 1;
            repairedPaths.push(issue.file.path);
        }
    }

    return {
        updated,
        attempted: plan.repairableIssues.length,
        unresolved: plan.unresolvedIssues.length,
        sourceFolder: plan.sourceFolder,
        repairedPaths
    };
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

interface ActiveBookMatterSummary {
    sourceFolder: string;
    frontCount: number;
    backCount: number;
    totalCount: number;
}

interface PdfLayoutSummary {
    validCount: number;
    totalCount: number;
}

function getActiveBookMatterSummary(plugin: RadialTimelinePlugin): ActiveBookMatterSummary {
    const sourceFolder = getActiveBookExportContext(plugin).sourceFolder.trim();
    if (!sourceFolder) {
        return { sourceFolder: '', frontCount: 0, backCount: 0, totalCount: 0 };
    }

    const mappings = plugin.settings.enableCustomMetadataMapping
        ? plugin.settings.frontmatterMappings
        : undefined;

    let frontCount = 0;
    let backCount = 0;
    for (const file of plugin.app.vault.getMarkdownFiles()) {
        if (!isPathInFolderScope(file.path, sourceFolder)) continue;
        const cache = plugin.app.metadataCache.getFileCache(file);
        const raw = cache?.frontmatter as Record<string, unknown> | undefined;
        if (!raw) continue;
        const normalized = normalizeFrontmatterKeys(raw, mappings);
        const matterClass = normalizeMatterClassValue(normalized.Class);
        if (!matterClass) continue;
        if (matterClass === 'backmatter') {
            backCount += 1;
        } else {
            frontCount += 1;
        }
    }

    return {
        sourceFolder,
        frontCount,
        backCount,
        totalCount: frontCount + backCount
    };
}

function isConfiguredPandocPathValid(plugin: RadialTimelinePlugin): boolean {
    const candidate = (plugin.settings.pandocPath || '').trim();
    if (!candidate) return false;
    if (path.isAbsolute(candidate) || /^[A-Za-z]:[\\/]/.test(candidate)) {
        return fileExistsSync(candidate);
    }
    if (candidate.includes('/') || candidate.includes('\\')) {
        return false;
    }
    // Command-name value (e.g. "pandoc") relies on PATH resolution at runtime.
    return true;
}

function getPdfLayoutSummary(plugin: RadialTimelinePlugin): PdfLayoutSummary {
    const fictionLayouts = (plugin.settings.pandocLayouts || [])
        .filter(layout => layout.preset === 'novel');
    const validCount = fictionLayouts
        .filter(layout => validatePandocLayout(plugin, layout).valid)
        .length;
    return {
        validCount,
        totalCount: fictionLayouts.length
    };
}

interface MatterPreviewItem {
    file: TFile;
    side: 'front' | 'back';
    role?: string;
    modeLabel: string;
    modeTone: 'plain' | 'latex' | 'auto';
}

interface MatterPreviewSummary {
    front: MatterPreviewItem[];
    back: MatterPreviewItem[];
}

function detectAutoMatterBodyMode(bodyText: string): 'latex' | 'plain' {
    const latexSignature = /\\begin\{|\\vspace|\\textcopyright|\\newpage|\\thispagestyle|\\chapter\*?|\\centering|\\[A-Za-z]+(?:\*|\b)/;
    return latexSignature.test(bodyText) ? 'latex' : 'plain';
}

async function getMatterPreviewSummary(plugin: RadialTimelinePlugin): Promise<MatterPreviewSummary> {
    const selection = await getSceneFilesByOrder(plugin.app, plugin, 'narrative', undefined, true);
    const matterMetaByPath = selection.matterMetaByPath;
    const front: MatterPreviewItem[] = [];
    const back: MatterPreviewItem[] = [];

    for (const file of selection.files) {
        const matterMeta = matterMetaByPath?.get(file.path);
        if (!matterMeta) continue;

        const side: 'front' | 'back' = matterMeta.side === 'back' ? 'back' : 'front';
        const role = typeof matterMeta.role === 'string' && matterMeta.role.trim().length > 0
            ? matterMeta.role.trim()
            : undefined;
        const declaredMode = matterMeta.bodyMode === 'latex' || matterMeta.bodyMode === 'plain'
            ? matterMeta.bodyMode
            : 'auto';

        let modeLabel = 'Auto';
        let modeTone: MatterPreviewItem['modeTone'] = 'auto';
        if (declaredMode === 'latex') {
            modeLabel = 'LaTeX';
            modeTone = 'latex';
        } else if (declaredMode === 'plain') {
            modeLabel = 'Plain';
            modeTone = 'plain';
        } else {
            try {
                const content = await plugin.app.vault.cachedRead(file);
                const effective = detectAutoMatterBodyMode(extractBodyText(content));
                modeLabel = effective === 'latex' ? 'Auto -> LaTeX' : 'Auto -> Plain';
            } catch {
                modeLabel = 'Auto';
            }
        }

        const item: MatterPreviewItem = {
            file,
            side,
            role,
            modeLabel,
            modeTone
        };
        if (side === 'back') {
            back.push(item);
        } else {
            front.push(item);
        }
    }

    return { front, back };
}

async function createBookMetaOnly(plugin: RadialTimelinePlugin): Promise<{ created: boolean; path?: string; reason?: string }> {
    const sourceFolder = getActiveBookExportContext(plugin).sourceFolder.trim();
    if (!sourceFolder) {
        return { created: false, reason: 'Active book source folder is not set.' };
    }

    const vault = plugin.app.vault;
    const normalizedFolder = normalizePath(sourceFolder);
    const ensureFolderPath = async (folderPath: string): Promise<void> => {
        const parts = normalizePath(folderPath).split('/').filter(Boolean);
        let current = '';
        for (const part of parts) {
            current = current ? `${current}/${part}` : part;
            if (!vault.getAbstractFileByPath(current)) {
                await vault.createFolder(current);
            }
        }
    };

    if (!vault.getAbstractFileByPath(normalizedFolder)) {
        await ensureFolderPath(normalizedFolder);
    }

    const bookMetaPath = normalizePath(`${normalizedFolder}/000 BookMeta.md`);
    if (vault.getAbstractFileByPath(bookMetaPath)) {
        return { created: false, path: bookMetaPath, reason: 'BookMeta already exists.' };
    }

    const year = new Date().getFullYear();
    const content = [
        '---',
        'Class: BookMeta',
        'Book:',
        '  title: "Your Title"',
        '  author: "Author Name"',
        'Rights:',
        '  copyright_holder: "Author Name"',
        `  year: ${year}`,
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
    ].join('\n');
    await vault.create(bookMetaPath, content);
    return { created: true, path: bookMetaPath };
}

/**
 * Generate sample scene files and LaTeX templates in the user's vault.
 * Skips files that already exist. Auto-configures template paths in settings.
 */
async function generateSampleTemplates(
    plugin: RadialTimelinePlugin,
    matterLane: MatterSampleLane,
    includeScriptExamples: boolean
): Promise<string[]> {
    const vault = plugin.app.vault;
    const baseFolder = plugin.settings.manuscriptOutputFolder || 'Radial Timeline/Export';
    const templatesFolder = normalizePath(`${baseFolder}/Templates`);
    const pandocFolder = getConfiguredPandocFolder(plugin);
    const activeSourceFolderRaw = getActiveBookExportContext(plugin).sourceFolder.trim();
    const activeSourceFolder = activeSourceFolderRaw ? normalizePath(activeSourceFolderRaw) : '';
    const matterTargetFolder = activeSourceFolder || templatesFolder;

    const ensureFolderPath = async (folderPath: string): Promise<void> => {
        const parts = normalizePath(folderPath).split('/').filter(Boolean);
        let current = '';
        for (const part of parts) {
            current = current ? `${current}/${part}` : part;
            if (!vault.getAbstractFileByPath(current)) {
                await vault.createFolder(current);
            }
        }
    };

    // Ensure folders exist
    for (const folder of [baseFolder, templatesFolder, pandocFolder, matterTargetFolder]) {
        const normalized = normalizePath(folder);
        if (!vault.getAbstractFileByPath(normalized)) {
            await ensureFolderPath(normalized);
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

    const sampleScenes: { name: string; content: string }[] = [
        {
            name: 'Sample Screenplay Scene.md',
            content: `---\n${screenplayYaml}\n---\n\n${screenplayBody}`
        },
        {
            name: 'Sample Podcast Scene.md',
            content: `---\n${podcastYaml}\n---\n\n${podcastBody}`
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
        'Advanced Matter Page (ST - Signature Literary)',
        'Raw LaTeX is used below.',
        'This is the canonical inline-LaTeX matter format for ST exports.',
        'Radial Timeline will not escape this content.',
        '-->'
    ];

    const guidedMatterSamples: { name: string; content: string }[] = [
        {
            name: '0.2 Title Page (Semantic).md',
            content: [
                '---',
                'Class: Frontmatter',
                'Role: title-page',
                'UseBookMeta: true',
                'BodyMode: plain',
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
                'Class: Frontmatter',
                'Role: copyright',
                'UseBookMeta: true',
                'BodyMode: plain',
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
                'Class: Frontmatter',
                'Role: dedication',
                'BodyMode: plain',
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
                'Class: Frontmatter',
                'Role: epigraph',
                'BodyMode: plain',
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
                'Class: Backmatter',
                'Role: acknowledgments',
                'BodyMode: plain',
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
                'Class: Backmatter',
                'Role: about-author',
                'UseBookMeta: true',
                'BodyMode: plain',
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
                'Class: Frontmatter',
                'Role: title-page',
                'BodyMode: latex',
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
                'Class: Frontmatter',
                'Role: copyright',
                'BodyMode: latex',
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
                'Class: Frontmatter',
                'Role: dedication',
                'BodyMode: latex',
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
                'Class: Frontmatter',
                'Role: epigraph',
                'BodyMode: latex',
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
                'Class: Backmatter',
                'Role: acknowledgments',
                'BodyMode: latex',
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
                'Class: Backmatter',
                'Role: about-author',
                'BodyMode: latex',
                '---',
                '',
                ...advancedMatterComment,
                '',
                '\\section*{About the Author}',
                'Author bio goes here.',
            ].join('\n')
        }
    ];

    const matterSamples = matterLane === 'advanced'
        ? advancedMatterSamples
        : guidedMatterSamples;

    // Create all files (skip existing)
    if (includeScriptExamples) {
        for (const scene of sampleScenes) {
            const filePath = normalizePath(`${templatesFolder}/${scene.name}`);
            if (!vault.getAbstractFileByPath(filePath)) {
                await vault.create(filePath, scene.content);
                createdFiles.push(scene.name);
            }
        }
    }

    if (matterLane === 'guided') {
        const bookMetaPath = normalizePath(`${matterTargetFolder}/${bookMetaSample.name}`);
        if (!vault.getAbstractFileByPath(bookMetaPath)) {
            await vault.create(bookMetaPath, bookMetaSample.content);
            createdFiles.push(bookMetaSample.name);
        }
    }

    for (const matter of matterSamples) {
        const filePath = normalizePath(`${matterTargetFolder}/${matter.name}`);
        if (!vault.getAbstractFileByPath(filePath)) {
            await vault.create(filePath, matter.content);
            createdFiles.push(matter.name);
        }
    }

    const bundledInstall = await installBundledPandocLayouts(plugin);
    const installedBundledFilenames = getBundledPandocLayouts()
        .filter(layout => bundledInstall.installed.includes(layout.name))
        .map(layout => layout.path);
    createdFiles.push(...installedBundledFilenames);
    ensureBundledPandocLayoutsRegistered(plugin);
    await plugin.saveSettings();

    return createdFiles;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROFESSIONAL SECTION FLAGS
// ═══════════════════════════════════════════════════════════════════════════════
const SHOW_SCREENPLAY_LAYOUT_CATEGORY = false;
const SHOW_PODCAST_LAYOUT_CATEGORY = false;

interface SectionParams {
    app: App;
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
    renderHero?: (containerEl: HTMLElement) => void;
    onProToggle?: () => void;
}

/**
 * Check if the professional tier is active
 */
export function isProfessionalActive(plugin: RadialTimelinePlugin): boolean {
    const entitlement = getProEntitlementState(plugin);
    return entitlement === 'beta_active' || entitlement === 'licensed_active';
}

/**
 * Check if the early-access window is still active
 */
export function isOpenBeta(): boolean {
    return isEarlyAccessWindow();
}

export function renderProfessionalSection({ plugin, containerEl, renderHero, onProToggle }: SectionParams): HTMLElement {
    const needsKey = getProEntitlementState(plugin) === 'needs_key';
    const earlyAccessActive = isEarlyAccessWindow();
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

    const rerender = () => {
        if (onProToggle) {
            onProToggle();
            return;
        }
        containerEl.empty();
        renderProfessionalSection({ app: plugin.app, plugin, containerEl, renderHero, onProToggle });
    };

    if (ensureBundledPandocLayoutsRegistered(plugin)) {
        void plugin.saveSettings();
    }

    const proStatusPanel = section.createDiv({ cls: `${ERT_CLASSES.PANEL} ${ERT_CLASSES.STACK_TIGHT}` });
    if (earlyAccessActive) {
        const statusRow = proStatusPanel.createDiv({ cls: 'ert-pro-status-inline' });
        statusRow.createSpan({ cls: 'ert-pro-status-label', text: 'Pro (Early Access)' });

        const toggleContainer = statusRow.createDiv({ cls: `${ERT_CLASSES.SECTION_ACTIONS} ${ERT_CLASSES.CHIP}` });
        toggleContainer.createSpan({
            cls: `ert-toggle-label ${(plugin.settings.devProActive !== false) ? ERT_CLASSES.IS_ACTIVE : ''}`,
            text: (plugin.settings.devProActive !== false) ? 'ACTIVE' : 'INACTIVE'
        });
        const checkbox = toggleContainer.createEl('input', {
            type: 'checkbox',
            cls: 'ert-toggle-input'
        });
        checkbox.checked = plugin.settings.devProActive !== false;
        plugin.registerDomEvent(checkbox, 'change', async () => {
            plugin.settings.devProActive = checkbox.checked;
            await plugin.saveSettings();
            rerender();
        });
    } else if (needsKey) {
        const proStatusSetting = new Setting(proStatusPanel)
            .setName('Pro Subscription')
            .setDesc('Pro subscription required')
            .addText(text => {
                text.setPlaceholder('XXXX-XXXX-XXXX-XXXX');
                text.setValue(plugin.settings.professionalLicenseKey || '');
                text.inputEl.addClass('ert-input--lg');
                text.inputEl.type = 'password';

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

        const nameEl = proStatusSetting.nameEl;
        nameEl.createEl('a', {
            text: ' Get key →',
            href: 'https://radial-timeline.com/signature',
            cls: 'ert-link-accent',
            attr: { target: '_blank', rel: 'noopener' }
        });
    } else {
        const licensedRow = proStatusPanel.createDiv({ cls: 'ert-pro-status-inline' });
        const licensedBadge = licensedRow.createSpan({
            cls: `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_PRO}`
        });
        const licensedBadgeIcon = licensedBadge.createSpan({ cls: ERT_CLASSES.BADGE_PILL_ICON });
        setIcon(licensedBadgeIcon, 'signature');
        licensedBadge.createSpan({ cls: ERT_CLASSES.BADGE_PILL_TEXT, text: 'PRO SUBSCRIPTION ACTIVE' });
    }

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
    let refreshPublishingStatusCard: () => void = () => {};

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

    const systemConfigPanel = pandocPanel.createDiv({ cls: `${ERT_CLASSES.STACK} ${ERT_CLASSES.STACK_TIGHT}` });
    systemConfigPanel.style.order = '50';
    const systemConfigHeading = addProRow(new Setting(systemConfigPanel))
        .setName('System Configuration')
        .setDesc('Configure Pandoc for PDF export.')
        .setHeading();
    addHeadingIcon(systemConfigHeading, 'settings');
    applyErtHeaderLayout(systemConfigHeading);

    // Settings
    let pandocPathInputEl: HTMLInputElement | null = null;
    const defaultDesc = 'Path to your Pandoc executable. Required for PDF rendering. Leave blank to use your system PATH, or click Auto locate.';
    const pandocSetting = addProRow(new Setting(systemConfigPanel))
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
                refreshPublishingStatusCard();
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
                            refreshPublishingStatusCard();
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

    // ── Pandoc Folder ──────────────────────────────────────────────────────
    const defaultPandocFolder = normalizePath(DEFAULT_SETTINGS.pandocFolder || 'Radial Timeline/Pandoc');
    let pandocFolderText: TextComponent | null = null;
    let pandocFolderInputEl: HTMLInputElement | null = null;
    const saveAndValidatePandocFolder = async (): Promise<void> => {
        if (!pandocFolderText || !pandocFolderInputEl) return;
        const raw = pandocFolderText.getValue().trim();
        const normalized = normalizePath(raw || defaultPandocFolder);
        pandocFolderText.setValue(normalized);
        plugin.settings.pandocFolder = normalized;
        await plugin.saveSettings();

        pandocFolderInputEl.removeClass('ert-input--flash-success', 'ert-input--flash-error');
        void pandocFolderInputEl.offsetWidth;
        const folder = plugin.app.vault.getAbstractFileByPath(normalized);
        const cls = (folder && folder instanceof TFolder)
            ? 'ert-input--flash-success'
            : 'ert-input--flash-error';
        pandocFolderInputEl.addClass(cls);
        setTimeout(() => { pandocFolderInputEl?.removeClass(cls); }, 1700);
    };

    const pandocFolderSetting = addProRow(new Setting(systemConfigPanel))
        .setName('Pandoc folder')
        .setDesc('Global folder for PDF layout templates (.tex) and compile helpers. Used during PDF rendering. Final exports are saved to the Export folder.')
        .addText(text => {
            pandocFolderText = text;
            pandocFolderInputEl = text.inputEl;
            text.inputEl.addClass('ert-input--lg');
            text.setPlaceholder(defaultPandocFolder);
            text.setValue(normalizePath(plugin.settings.pandocFolder || defaultPandocFolder));
            plugin.registerDomEvent(text.inputEl, 'blur', () => { void saveAndValidatePandocFolder(); });
            plugin.registerDomEvent(text.inputEl, 'keydown', (e: KeyboardEvent) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    void saveAndValidatePandocFolder();
                }
            });
        });
    pandocFolderSetting.addExtraButton(button => {
        button.setIcon('rotate-ccw');
        button.setTooltip('Reset to default (Radial Timeline/Pandoc)');
        button.extraSettingsEl.addClass('ert-iconBtn');
        button.onClick(async () => {
            if (pandocFolderText) {
                pandocFolderText.setValue(defaultPandocFolder);
            }
            plugin.settings.pandocFolder = defaultPandocFolder;
            await plugin.saveSettings();
            if (pandocFolderInputEl) {
                pandocFolderInputEl.removeClass('ert-input--flash-success', 'ert-input--flash-error');
                pandocFolderInputEl.addClass('ert-input--flash-success');
                setTimeout(() => pandocFolderInputEl?.removeClass('ert-input--flash-success'), 1700);
            }
        });
    });

    // ── Layout Registry Subsection ──────────────────────────────────────────
    const layoutPanel = pandocPanel.createDiv({ cls: `${ERT_CLASSES.STACK} ${ERT_CLASSES.STACK_TIGHT}` });
    layoutPanel.style.order = '20';
    const layoutHeading = addProRow(new Setting(layoutPanel))
        .setName('Export Layouts (PDF)')
        .setDesc('Manage built-in and custom LaTeX layouts used for manuscript PDF rendering.')
        .setHeading();
    addHeadingIcon(layoutHeading, 'book-open');
    applyErtHeaderLayout(layoutHeading);

    const normalizeVersionLabels = (label: string): string =>
        label.replace(/\bv(?:ersion)?\s*\d+(?:\.\d+)?\b/gi, '').replace(/\s{2,}/g, ' ').trim();

    type FictionLayoutVariant = 'classic' | 'modernClassic' | 'signature' | 'contemporary' | 'generic';
    const getFictionVariant = (layout: PandocLayoutTemplate): FictionLayoutVariant => {
        const source = `${layout.id} ${layout.name} ${layout.path}`.toLowerCase();
        if (source.includes('modern classic') || source.includes('modern-classic') || source.includes('modern_classic') || source.includes('rt_modern_classic') || layout.id === 'bundled-fiction-modern-classic') return 'modernClassic';
        if (source.includes('classic') || source.includes('traditional')) return 'classic';
        if (source.includes('contemporary')) return 'contemporary';
        if (source.includes('signature') || source.includes('signature_literary_rt') || source.includes('rt_signature_literary') || layout.id === 'bundled-fiction-signature-literary' || layout.id === 'bundled-novel') return 'signature';
        return 'generic';
    };
    const getLayoutDisplayName = (layout: PandocLayoutTemplate): string => {
        if (layout.preset === 'novel') {
            const variant = getFictionVariant(layout);
            if (variant === 'classic') return 'Classic Manuscript';
            if (variant === 'modernClassic') return 'Modern Classic';
            if (variant === 'signature') return 'Signature Literary';
            if (variant === 'contemporary') return 'Contemporary Literary';
        }
        if (layout.preset === 'screenplay' && layout.bundled) return 'Screenplay';
        return normalizeVersionLabels(layout.name || 'Custom Layout');
    };
    const buildLayoutDescription = (layout: PandocLayoutTemplate): string => {
        if (layout.preset === 'screenplay') {
            return 'Industry screenplay format with uppercase sluglines, dialogue-first spacing, and production-safe margins. Page numbers run in the header with a Courier-family typewriter look.';
        }
        if (layout.preset === 'novel') {
            const variant = getFictionVariant(layout);
            if (variant === 'classic') {
                return 'Traditional manuscript treatment with restrained running headers and centered folios for clean draft review. Uses classic serif body typography with minimal decorative styling.';
            }
            if (variant === 'modernClassic') {
                return '6x9 trade-book design with RT-driven part/chapter openers and structured scene-break handling. Headers are balanced for long-form fiction, with folios placed for print-first readability and modern serif text.';
            }
            if (variant === 'signature') {
                return 'Literary-forward composition with alternating verso/recto headers and carefully tuned vertical rhythm. Folios and heading treatments are spaced to support long reads, paired with elevated serif typography.';
            }
            if (variant === 'contemporary') {
                return 'Running-header system: book title on left pages, section/chapter context on right for quick navigation. Chapter openers suppress header and page number marks, with contemporary serif styling and generous white space.';
            }
            return 'Refined fiction layout with chapter-first pacing, polished header structure, and print-friendly folio placement. Built around readable serif typography for manuscript and proof workflows.';
        }
        if (layout.preset === 'podcast') {
            return 'Narration-first script format with speaker/segment clarity, timing-friendly spacing, and clean cue separation. Header metadata and page numbering are positioned for fast booth or desk reference.';
        }
        return 'Custom PDF layout.';
    };
    const getLayoutInstalledState = (layout: PandocLayoutTemplate): boolean => {
        if (layout.bundled) return isBundledPandocLayoutInstalled(plugin, layout);
        return validatePandocLayout(plugin, layout).valid;
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

    const layoutRowsContainer = layoutPanel.createDiv({ cls: 'ert-layout-rows' });

    const duplicateBundledLayout = async (layout: PandocLayoutTemplate): Promise<void> => {
        const installResult = await installBundledPandocLayouts(plugin, [layout.id]);
        if (installResult.installed.length > 0) {
            new Notice(`Installed bundled layout '${layout.name}' to Pandoc folder.`);
        }

        const pandocFolder = getConfiguredPandocFolder(plugin);
        const sourceRelativePath = normalizePath(layout.path.replace(/^\/+/, ''));
        const sourceVaultPath = normalizePath(`${pandocFolder}/${sourceRelativePath}`);
        const sourceFile = plugin.app.vault.getAbstractFileByPath(sourceVaultPath);
        if (!(sourceFile instanceof TFile)) {
            new Notice(`Could not duplicate '${layout.name}' because template file is missing.`);
            return;
        }

        const sourceContent = await plugin.app.vault.read(sourceFile);
        const sourceFilename = path.basename(layout.path || 'layout.tex');
        const sourceExt = path.extname(sourceFilename) || '.tex';
        const sourceStem = sourceFilename.slice(0, -sourceExt.length) || 'layout';
        let copyIndex = 1;
        let copyFilename = `${sourceStem}-copy${sourceExt}`;
        let copyVaultPath = normalizePath(`${pandocFolder}/${copyFilename}`);
        while (plugin.app.vault.getAbstractFileByPath(copyVaultPath)) {
            copyFilename = `${sourceStem}-copy-${copyIndex}${sourceExt}`;
            copyVaultPath = normalizePath(`${pandocFolder}/${copyFilename}`);
            copyIndex += 1;
        }

        await plugin.app.vault.create(copyVaultPath, sourceContent);

        const existing = plugin.settings.pandocLayouts || [];
        let copyName = `${layout.name} Copy`;
        let copyNameIndex = 2;
        while (existing.some(item => item.name === copyName && item.preset === layout.preset)) {
            copyName = `${layout.name} Copy ${copyNameIndex}`;
            copyNameIndex += 1;
        }

        const idBase = `${slugifyToFileStem(copyName).toLowerCase()}-${layout.preset}`;
        let nextId = idBase;
        let idSuffix = 2;
        while (existing.some(item => item.id === nextId)) {
            nextId = `${idBase}-${idSuffix}`;
            idSuffix += 1;
        }

        existing.push({
            id: nextId,
            name: copyName,
            preset: layout.preset,
            path: compactTemplatePathForStorage(plugin, copyFilename),
            bundled: false
        });
        plugin.settings.pandocLayouts = existing;
        await plugin.saveSettings();
        new Notice(`Created editable copy '${copyName}'.`);
    };

    const getVisibleLayouts = (): PandocLayoutTemplate[] => {
        const all = plugin.settings.pandocLayouts || [];
        return all.filter(layout => {
            if (layout.preset === 'novel') return true;
            if (layout.preset === 'screenplay') return SHOW_SCREENPLAY_LAYOUT_CATEGORY;
            if (layout.preset === 'podcast') return SHOW_PODCAST_LAYOUT_CATEGORY;
            return false;
        });
    };

    /** Render category groups with layout rows. */
    const renderLayoutRows = () => {
        layoutRowsContainer.empty();

        const layouts = getVisibleLayouts();

        if (layouts.length === 0) {
            const emptyEl = layoutRowsContainer.createDiv({ cls: 'ert-layout-row setting-item' });
            emptyEl.createSpan({ text: 'No layouts configured yet.', cls: 'setting-item-description' });
            return;
        }

        const fictionVariantOrder: Record<FictionLayoutVariant, number> = {
            classic: 1,
            modernClassic: 2,
            signature: 3,
            contemporary: 4,
            generic: 5
        };
        const fictionLayouts = layouts
            .filter(layout => layout.preset === 'novel')
            .sort((a, b) => {
                const variantDiff = fictionVariantOrder[getFictionVariant(a)] - fictionVariantOrder[getFictionVariant(b)];
                if (variantDiff !== 0) return variantDiff;
                return getLayoutDisplayName(a).localeCompare(getLayoutDisplayName(b));
            });
        const renderLayoutRow = (parent: HTMLElement, layout: PandocLayoutTemplate) => {
            const row = parent.createDiv({ cls: 'ert-layout-row' });
            const isBundled = layout.bundled === true;
            const installed = getLayoutInstalledState(layout);

            const s = addProRow(new Setting(row))
                .setName(getLayoutDisplayName(layout))
                .setDesc(buildLayoutDescription(layout));
            s.settingEl.addClass('ert-layout-row-setting');
            s.descEl?.addClass('ert-layout-row-desc');
            if (s.nameEl) {
                s.nameEl.addClass('ert-layout-row-name');
                const pill = s.nameEl.createSpan({
                    cls: `ert-layout-status-pill ${installed ? 'is-installed' : 'is-not-installed'}`,
                    text: installed ? 'Installed' : 'Not installed'
                });
                pill.setAttr('aria-label', installed ? 'Installed' : 'Not installed');
            }

            if (!isBundled) {
                s.addText(text => {
                    text.inputEl.addClass('ert-input--lg');
                    text.setPlaceholder('template.tex or path/to/template.tex');
                    text.setValue(layout.path);
                    const saveAndValidate = async () => {
                        const normalizedPath = compactTemplatePathForStorage(plugin, text.getValue());
                        layout.path = normalizedPath;
                        try { text.setValue(normalizedPath); } catch {}
                        await plugin.saveSettings();
                        flashValidateLayoutPath(text.inputEl, layout);
                        s.setDesc(buildLayoutDescription(layout));
                        refreshPublishingStatusCard();
                    };
                    attachTemplatePathSuggest(plugin, text, (selectedPath) => {
                        layout.path = selectedPath.trim();
                        void saveAndValidate();
                    });

                    text.inputEl.addEventListener('blur', saveAndValidate);
                    text.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
                        if (e.key === 'Enter') { e.preventDefault(); void saveAndValidate(); }
                    });
                });
            }

            if (isBundled && !installed) {
                s.addButton(btn => {
                    btn.setButtonText('Install');
                    btn.setTooltip('Install bundled layout');
                    btn.onClick(async () => {
                        const result = await installBundledPandocLayouts(plugin, [layout.id]);
                        if (result.installed.length > 0) {
                            new Notice(`Installed bundled layout: ${getLayoutDisplayName(layout)}`);
                        } else if (result.failed.length > 0) {
                            new Notice(`Failed to install bundled layout: ${getLayoutDisplayName(layout)}`);
                        }
                        renderLayoutRows();
                        refreshPublishingStatusCard();
                    });
                });
            }

            if (isBundled) {
                s.addButton(btn => {
                    btn.setButtonText('Duplicate');
                    btn.onClick(async () => {
                        await duplicateBundledLayout(layout);
                        renderLayoutRows();
                        refreshPublishingStatusCard();
                    });
                });
            }

            if (!isBundled) {
                s.addExtraButton(btn => {
                    btn.setIcon('trash');
                    btn.setTooltip('Remove layout');
                    btn.onClick(async () => {
                        plugin.settings.pandocLayouts = (plugin.settings.pandocLayouts || []).filter(item => item.id !== layout.id);
                        await plugin.saveSettings();
                        renderLayoutRows();
                        refreshPublishingStatusCard();
                    });
                });
            }
        };

        const rows = layoutRowsContainer.createDiv({ cls: 'ert-layout-category-rows' });
        fictionLayouts.forEach(layout => renderLayoutRow(rows, layout));
    };

    renderLayoutRows();

    // ── Add Layout inline form ───────────────────────────────────────────────
    let addFormVisible = false;
    const addFormContainer = layoutPanel.createDiv({ cls: 'ert-layout-add-form ert-hidden' });

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
        if (SHOW_SCREENPLAY_LAYOUT_CATEGORY) {
            dd.addOption('screenplay', 'Screenplay');
        }
        if (SHOW_PODCAST_LAYOUT_CATEGORY) {
            dd.addOption('podcast', 'Podcast');
        }
        dd.onChange(v => { newPreset = v as typeof newPreset; });
    });
    addFormSetting.addText(text => {
        text.setPlaceholder('template.tex or path/to/template.tex');
        text.inputEl.addClass('ert-input--lg');
        text.onChange(v => { newPath = v; });
        attachTemplatePathSuggest(plugin, text, (path) => {
            newPath = path;
        });
    });
    const addFormHint = addFormContainer.createDiv({
        cls: ERT_CLASSES.SECTION_DESC,
        text: 'Tip: autocomplete finds .tex files in your vault. Files from your Pandoc folder are saved as filename-only references.'
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
            existing.push({
                id,
                name: trimName,
                preset: newPreset,
                path: compactTemplatePathForStorage(plugin, newPath),
                bundled: false
            });
            plugin.settings.pandocLayouts = existing;
            await plugin.saveSettings();
            // Reset form
            newName = ''; newPreset = 'novel'; newPath = '';
            addFormContainer.addClass('ert-hidden');
            addFormVisible = false;
            renderLayoutRows();
            refreshPublishingStatusCard();
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

    const layoutManageSetting = addProRow(new Setting(layoutPanel));
    layoutManageSetting.addButton(button => {
        button.setButtonText('Add Layout');
        button.onClick(() => {
            addFormVisible = !addFormVisible;
            addFormContainer.toggleClass('ert-hidden', !addFormVisible);
        });
    });
    layoutManageSetting.addButton(button => {
        button.setButtonText('Install all');
        button.onClick(async () => {
            const bundledIds = getBundledPandocLayouts()
                .filter(layout => {
                    if (layout.preset === 'novel') return true;
                    if (layout.preset === 'screenplay') return SHOW_SCREENPLAY_LAYOUT_CATEGORY;
                    if (layout.preset === 'podcast') return SHOW_PODCAST_LAYOUT_CATEGORY;
                    return false;
                })
                .map(layout => layout.id);
            const result = await installBundledPandocLayouts(plugin, bundledIds);
            if (result.installed.length > 0) {
                new Notice(`Installed ${result.installed.length} bundled layout template(s) in ${getConfiguredPandocFolder(plugin)}/.`);
            } else if (result.failed.length > 0) {
                new Notice('Some bundled layouts failed to install.');
            } else {
                new Notice('Bundled layouts are already installed.');
            }
            renderLayoutRows();
            refreshPublishingStatusCard();
        });
    });

    const getSavedWorkflowMode = (): MatterSampleLane => {
        const saved = plugin.settings.matterWorkflowMode;
        if (saved === 'advanced') return 'advanced';
        return 'guided';
    };
    let selectedMatterWorkflow = getSavedWorkflowMode();
    const includeScriptExamples = false;
    let setupInFlight = false;
    let setupButtonComponent: ButtonComponent | null = null;
    const setSetupButtonState = (busy: boolean) => {
        if (!setupButtonComponent) return;
        setupButtonComponent.setDisabled(busy);
        setupButtonComponent.setButtonText(busy ? 'Setting up publishing…' : 'Set up publishing for active book');
    };
    const runPublishingSetup = async () => {
        if (setupInFlight) return;
        setupInFlight = true;
        setSetupButtonState(true);
        try {
            const lane = await chooseMatterSampleLane(plugin.app, selectedMatterWorkflow, includeScriptExamples);
            if (!lane) return;
            if (plugin.settings.matterWorkflowMode !== lane) {
                plugin.settings.matterWorkflowMode = lane;
                selectedMatterWorkflow = lane;
                await plugin.saveSettings();
            }
            const created = await generateSampleTemplates(plugin, lane, includeScriptExamples);
            const scriptTargetLabel = `${plugin.settings.manuscriptOutputFolder || 'Radial Timeline/Export'}/Templates`;
            const sourceFolder = getActiveBookExportContext(plugin).sourceFolder.trim();
            const matterTargetLabel = sourceFolder || scriptTargetLabel;
            if (created.length > 0) {
                const laneLabel = lane === 'guided' ? 'guided' : 'advanced';
                new Notice(`Created ${created.length} ${laneLabel} setup files. Matter + BookMeta → ${matterTargetLabel}, Layouts → ${getConfiguredPandocFolder(plugin)}/.`);
            } else {
                new Notice('Publishing setup already exists. Bundled layouts are registered.');
            }
            renderLayoutRows();
            rerender();
        } catch (e) {
            const msg = (e as Error).message || String(e);
            new Notice(`Error setting up publishing: ${msg}`);
        } finally {
            setupInFlight = false;
            setSetupButtonState(false);
        }
    };

    const bookMetaPreviewPanel = pandocPanel.createDiv({ cls: `${ERT_CLASSES.STACK} ${ERT_CLASSES.STACK_TIGHT}` });
    bookMetaPreviewPanel.style.order = '10';
    const previewFrame = bookMetaPreviewPanel.createDiv({ cls: `${ERT_CLASSES.PREVIEW_FRAME} ert-previewFrame--center ert-previewFrame--flush` });
    const previewBody = previewFrame.createDiv({ cls: 'ert-bookmeta-preview-body' });
    const renderBookMetaPreview = () => {
        previewBody.empty();
        const activeBookMetaStatus = getActiveBookMetaStatus(plugin);

        if (!activeBookMetaStatus.found || !activeBookMetaStatus.bookMeta) {
            const empty = previewBody.createDiv({ cls: 'ert-bookmeta-preview-empty' });
            empty.createDiv({ cls: 'ert-bookmeta-preview-empty-title', text: 'BookMeta not found for active book' });
            if (activeBookMetaStatus.sourceFolder) {
                empty.createDiv({ cls: 'ert-bookmeta-preview-empty-desc', text: `Expected in: ${activeBookMetaStatus.sourceFolder}` });
            }
            const actions = empty.createDiv({ cls: 'ert-bookmeta-preview-empty-actions' });
            new ButtonComponent(actions)
                .setButtonText('Set up publishing for active book')
                .setCta()
                .onClick(() => {
                    void runPublishingSetup();
                });
            new ButtonComponent(actions)
                .setButtonText('Create BookMeta only')
                .onClick(async () => {
                    const created = await createBookMetaOnly(plugin);
                    if (created.created) {
                        new Notice(`Created BookMeta note: ${created.path}`);
                    } else {
                        new Notice(created.reason || 'BookMeta note was not created.');
                    }
                    rerender();
                });
            return;
        }

        if (activeBookMetaStatus.warning) {
            const warningRow = previewBody.createDiv({ cls: 'ert-bookmeta-status is-warning' });
            const warningIcon = warningRow.createSpan({ cls: 'ert-bookmeta-status-icon' });
            setIcon(warningIcon, 'alert-circle');
            warningRow.createSpan({ text: activeBookMetaStatus.warning });
        }

        const normalizeValue = (value?: string | number | null): string =>
            value === undefined || value === null || String(value).trim().length === 0
                ? 'Not set'
                : String(value);

        const meta = activeBookMetaStatus.bookMeta;
        const titleCard = previewBody.createDiv({ cls: 'ert-bookmeta-title-card' });
        titleCard.createDiv({ cls: 'ert-planetary-preview-heading', text: 'PREVIEW (BookMeta)' });

        const primary = previewBody.createDiv({ cls: 'ert-bookmeta-primary' });
        const addPrimaryField = (label: string, value?: string | number | null) => {
            const field = primary.createDiv({ cls: 'ert-bookmeta-primary-field' });
            const normalized = normalizeValue(value);
            const valueEl = field.createDiv({ cls: 'ert-bookmeta-primary-value', text: normalized });
            valueEl.toggleClass('ert-bookmeta-preview-value--empty', normalized === 'Not set');
            field.createDiv({ cls: 'ert-bookmeta-primary-label', text: label });
        };
        addPrimaryField('Title', meta.title);
        addPrimaryField('Author', meta.author);

        const details = previewBody.createDiv({ cls: 'ert-bookmeta-detail-grid' });
        const leftCol = details.createDiv({ cls: 'ert-bookmeta-detail-col ert-bookmeta-detail-col--left' });
        const rightCol = details.createDiv({ cls: 'ert-bookmeta-detail-col ert-bookmeta-detail-col--right' });
        const addDetailField = (target: HTMLElement, label: string, value?: string | number | null) => {
            const field = target.createDiv({ cls: 'ert-bookmeta-detail-field' });
            const normalized = normalizeValue(value);
            const valueEl = field.createDiv({ cls: 'ert-bookmeta-detail-value', text: normalized });
            valueEl.toggleClass('ert-bookmeta-preview-value--empty', normalized === 'Not set');
            field.createDiv({ cls: 'ert-bookmeta-detail-label', text: label });
        };
        addDetailField(leftCol, 'Copyright holder', meta.rights?.copyright_holder);
        addDetailField(leftCol, 'ISBN', meta.identifiers?.isbn_paperback);
        addDetailField(rightCol, 'Rights year', meta.rights?.year);
        addDetailField(rightCol, 'Publisher', meta.publisher?.name);

        const sourcePath = (meta.sourcePath || activeBookMetaStatus.path || '').trim();
        if (sourcePath.length > 0) {
            const sourceRow = previewBody.createDiv({ cls: 'ert-bookmeta-source-row' });
            sourceRow.createSpan({ cls: 'ert-bookmeta-source-label', text: 'Source' });
            const sourceLink = sourceRow.createEl('a', {
                cls: 'ert-bookmeta-source-link',
                text: sourcePath,
                attr: { href: '#', title: sourcePath }
            });
            sourceLink.addEventListener('click', (evt) => {
                evt.preventDefault();
                void plugin.app.workspace.openLinkText(sourcePath, '', false);
            });
        }
    };
    renderBookMetaPreview();

    // ── Publishing Setup ────────────────────────────────────────────────────
    const publishingSetupPanel = pandocPanel.createDiv({ cls: `${ERT_CLASSES.STACK} ${ERT_CLASSES.STACK_TIGHT}` });
    publishingSetupPanel.style.order = '30';
    const publishingHeading = addProRow(new Setting(publishingSetupPanel))
        .setName('Publishing Setup')
        .setDesc('Set up front and back matter for the active book.')
        .setHeading();
    addHeadingIcon(publishingHeading, 'book-open-text');
    applyErtHeaderLayout(publishingHeading);

    const statusShell = publishingSetupPanel.createDiv({ cls: 'ert-publishing-status-shell' });
    const statusGrid = statusShell.createDiv({ cls: 'ert-publishing-status-grid' });
    const buildStatusColumn = (
        iconName: string,
        title: string,
        value: string,
        desc: string,
        tone: 'success' | 'warning' | 'error',
        onClick?: () => void
    ): void => {
        const col = statusGrid.createDiv({ cls: `ert-publishing-status-col is-${tone}` });
        if (onClick) {
            col.setAttr('role', 'button');
            col.setAttr('tabindex', '0');
            col.addEventListener('click', onClick);
            col.addEventListener('keydown', (evt: KeyboardEvent) => {
                if (evt.key !== 'Enter' && evt.key !== ' ') return;
                evt.preventDefault();
                onClick();
            });
        }
        const header = col.createDiv({ cls: 'ert-publishing-status-col-header' });
        const icon = header.createSpan({ cls: 'ert-publishing-status-col-icon' });
        setIcon(icon, iconName);
        header.createSpan({ cls: 'ert-publishing-status-col-title', text: title });
        col.createDiv({ cls: 'ert-publishing-status-col-value', text: value });
        col.createDiv({ cls: 'ert-publishing-status-col-desc', text: desc });
    };
    const renderPublishingStatusCard = () => {
        statusGrid.empty();

        const activeBookMetaStatus = getActiveBookMetaStatus(plugin);
        const activeBookMatter = getActiveBookMatterSummary(plugin);
        const layoutSummary = getPdfLayoutSummary(plugin);
        const pandocPathValid = isConfiguredPandocPathValid(plugin);
        const exportReady = pandocPathValid && layoutSummary.validCount > 0;
        const pdfFailure = !pandocPathValid ? 'pandoc' : layoutSummary.validCount === 0 ? 'layout' : null;

        buildStatusColumn(
            'file-output',
            'PDF Export',
            exportReady ? 'Ready' : 'Blocked',
            exportReady
                ? 'Ready for manuscript PDF export.'
                : pdfFailure === 'pandoc'
                    ? 'Pandoc not configured. Update System Configuration.'
                    : 'No valid PDF layout. Install or fix a layout.',
            exportReady ? 'success' : 'error',
            () => {
                if (exportReady) return;
                if (!pandocPathValid) {
                    systemConfigPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    return;
                }
                layoutPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        );

        const layoutTone: 'success' | 'warning' | 'error' = layoutSummary.validCount === 0
            ? 'error'
            : layoutSummary.validCount < layoutSummary.totalCount
                ? 'warning'
                : 'success';
        buildStatusColumn(
            'book-open',
            'Layouts',
            `${layoutSummary.validCount} valid (${layoutSummary.totalCount} total)`,
            layoutSummary.totalCount === 0
                ? 'No manuscript PDF layouts configured.'
                : layoutTone === 'warning'
                    ? 'Some manuscript layouts need attention.'
                    : 'Manuscript PDF layouts are ready.',
            layoutTone,
            () => {
                layoutPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        );

        const matterTone: 'success' | 'warning' = activeBookMetaStatus.found && activeBookMatter.totalCount > 0 ? 'success' : 'warning';
        buildStatusColumn(
            'library',
            'Matter',
            `Front: ${activeBookMatter.frontCount} / Back: ${activeBookMatter.backCount}`,
            activeBookMetaStatus.found ? 'BookMeta found' : 'BookMeta not found',
            matterTone,
            () => {
                if (matterTone === 'warning') {
                    void runPublishingSetup();
                }
            }
        );
    };
    refreshPublishingStatusCard = renderPublishingStatusCard;
    renderPublishingStatusCard();

    const setupActionRow = statusShell.createDiv({ cls: 'ert-publishing-status-action' });
    setupButtonComponent = new ButtonComponent(setupActionRow);
    setupButtonComponent
        .setButtonText('Set up publishing for active book')
        .onClick(() => {
            void runPublishingSetup();
        });
    setupButtonComponent.buttonEl.addClass('ert-pillBtn', 'ert-pillBtn--pro');

    const matterPreviewFrame = publishingSetupPanel.createDiv({ cls: `${ERT_CLASSES.PREVIEW_FRAME} ert-previewFrame--flush` });
    const matterPreviewHeader = matterPreviewFrame.createDiv({ cls: 'ert-previewFrame__header' });
    matterPreviewHeader.createDiv({ cls: 'ert-planetary-preview-heading ert-previewFrame__title', text: 'Preview (Matter)' });
    const matterPreviewBody = matterPreviewFrame.createDiv({ cls: 'ert-matter-preview-body' });
    const formatRoleLabel = (role: string): string => role.replace(/[_-]+/g, ' ').trim();
    const renderMatterPreview = async () => {
        matterPreviewBody.empty();
        try {
            const preview = await getMatterPreviewSummary(plugin);
            if (preview.front.length === 0 && preview.back.length === 0) {
                const empty = matterPreviewBody.createDiv({ cls: 'ert-matter-preview-empty' });
                empty.createDiv({ cls: 'ert-matter-preview-empty-title', text: 'No matter pages found' });
                const actions = empty.createDiv({ cls: 'ert-matter-preview-empty-actions' });
                new ButtonComponent(actions)
                    .setButtonText('Set up publishing for active book')
                    .setCta()
                    .onClick(() => {
                        void runPublishingSetup();
                    });
                return;
            }

            const list = matterPreviewBody.createDiv({ cls: 'ert-matter-preview-list' });
            let rowIndex = 0;
            const renderMatterRows = (items: MatterPreviewItem[]) => {
                items.forEach(item => {
                    const row = list.createDiv({ cls: 'ert-matter-preview-row' });
                    row.toggleClass('is-alt', rowIndex % 2 === 1);
                    rowIndex += 1;
                    const titleLink = row.createEl('a', {
                        cls: 'ert-matter-preview-link',
                        text: item.file.basename,
                        attr: { href: '#', title: item.file.path }
                    });
                    titleLink.addEventListener('click', (evt) => {
                        evt.preventDefault();
                        void plugin.app.workspace.openLinkText(item.file.path, '', false);
                    });

                    const badges = row.createDiv({ cls: 'ert-matter-preview-badges' });
                    badges.createSpan({ cls: `ert-matter-preview-badge ert-matter-preview-badge--${item.modeTone}`, text: item.modeLabel });
                    const role = (item.role || '').trim();
                    if (role && role.toLowerCase() !== 'other') {
                        badges.createSpan({
                            cls: 'ert-matter-preview-badge ert-matter-preview-badge--role',
                            text: formatRoleLabel(role)
                        });
                    }
                });
            };

            renderMatterRows(preview.front);
            list.createDiv({ cls: 'ert-matter-preview-divider', text: 'Manuscript' });
            renderMatterRows(preview.back);
        } catch (e) {
            const message = (e as Error).message || String(e);
            matterPreviewBody.createDiv({ cls: 'ert-matter-preview-empty-line', text: `Matter preview unavailable: ${message}` });
        }
    };
    void renderMatterPreview();

    // ── System Configuration: Repair tools (only when mismatches exist) ────
    const repairPlan = buildMatterRepairPlan(plugin);
    if (repairPlan.issues.length > 0) {
        const repairHeading = addProRow(new Setting(systemConfigPanel))
            .setName('Repair tools')
            .setDesc('Repair detected metadata mismatches for matter notes in the active book.')
            .setHeading();
        addHeadingIcon(repairHeading, 'wrench');
        applyErtHeaderLayout(repairHeading);

        const repairSetting = addProRow(new Setting(systemConfigPanel))
            .setName('Repair matter metadata')
            .setDesc('Updates frontmatter only on detected matter notes. No file moves. No note body edits.');
        repairSetting.addButton(button => {
            button.setButtonText('Repair active book');
            button.setTooltip('Repairs metadata mismatches and removes legacy Matter/matter fields.');
            if (repairPlan.repairableIssues.length === 0) {
                button.setDisabled(true);
            }
            button.onClick(async () => {
                const currentPlan = buildMatterRepairPlan(plugin);
                const targetCount = currentPlan.repairableIssues.length;
                if (targetCount === 0) {
                    new Notice('No repairable matter metadata mismatches found.');
                    return;
                }
                const proceed = window.confirm(
                    `This will update frontmatter on ${targetCount} notes in the active book. Continue?`
                );
                if (!proceed) return;

                button.setDisabled(true);
                button.setButtonText('Repairing…');
                try {
                    const result = await applyMatterRepairPlan(plugin, currentPlan);
                    console.info('[Matter Repair]', {
                        sourceFolder: result.sourceFolder,
                        repaired: result.updated,
                        attempted: result.attempted,
                        unresolved: result.unresolved,
                        repairedPaths: result.repairedPaths
                    });
                    new Notice(`Repaired ${result.updated} notes. See logs for details.`);
                    rerender();
                } catch (e) {
                    const msg = (e as Error).message || String(e);
                    new Notice(`Failed to repair matter metadata: ${msg}`);
                } finally {
                    button.setDisabled(false);
                    button.setButtonText('Repair active book');
                }
            });
        });

        const changeList = repairSetting.settingEl.createEl('ul', { cls: 'ert-migration-change-list' });
        changeList.createEl('li', {
            text: `Detected on ${repairPlan.issues.length} note${repairPlan.issues.length === 1 ? '' : 's'} in the active book.`
        });
        changeList.createEl('li', {
            text: `Repairable now: ${repairPlan.repairableIssues.length}`
        });
        if (repairPlan.unresolvedIssues.length > 0) {
            changeList.createEl('li', {
                text: `${repairPlan.unresolvedIssues.length} note${repairPlan.unresolvedIssues.length === 1 ? '' : 's'} require Class to be set to Frontmatter or Backmatter.`
            });
        }
    }

    return section;
}
