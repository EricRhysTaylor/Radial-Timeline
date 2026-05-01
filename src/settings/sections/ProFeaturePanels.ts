/*
 * Radial Timeline Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 * 
 * Pro Feature Panels
 */

import { App, Setting, setIcon, normalizePath, Notice, TFile, TFolder, Modal, ButtonComponent, TextComponent } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { ERT_CLASSES, ERT_DATA } from '../../ui/classes';
import { addHeadingIcon, addWikiLink, applyErtHeaderLayout } from '../wikiLink';
import { execFile } from 'child_process'; // SAFE: Node child_process for system path scanning
import * as path from 'path'; // SAFE: Node path for absolute-path detection in layout input normalization
import { generateSceneContent } from '../../utils/sceneGenerator';
import { DEFAULT_SETTINGS } from '../defaults';
import { validatePandocLayout, slugifyToFileStem } from '../../utils/exportFormats';
import type { BookLayoutOptions, BookMeta, BookProfile, ManuscriptSceneHeadingMode, PandocLayoutTemplate, PublishingValidationSnapshot, TemplateProfile, ValidationIssue, ValidationSummary } from '../../types';
import { getActiveFrontmatterMappings, normalizeFrontmatterKeys } from '../../utils/frontmatter';
import { ImportTemplateModal, type ImportedTemplateCommit } from '../../modals/ImportTemplateModal';
import { confirmWithErtModal } from '../../modals/ErtConfirmModal';
import { getActiveBookExportContext } from '../../utils/exportContext';
import { getActiveBook } from '../../utils/books';
import { isPathInFolderScope } from '../../utils/pathScope';
import { normalizeMatterClassValue } from '../../utils/matterMeta';
import { extractBodyText, getSceneFilesByOrder } from '../../utils/manuscript';
import { resolveManuscriptOutputFolder } from '../../utils/aiOutput';
import { updateBookMetaField, type EditableBookMetaFieldKey } from '../../utils/bookMetaEditing';
import { isProActive } from '../proEntitlement';
import {
    SHARED_CHAPTER_FIELD_SOURCE_LABEL_TITLE
} from '../../utils/timelineChapters';
import {
    describeMatterReadiness
} from '../../services/PublishingValidationService';
import { adaptPandocLayoutsToPublishingModel } from '../../utils/publishingModel';
import { buildPublishingProgressStages, type PublishingStageId } from '../../utils/publishingProgress';
import {
    ensureBundledLayoutInstalledForExport,
    ensureBundledPandocLayoutsRegistered,
    getBundledPandocLayouts,
    installBundledPandocLayouts,
    isBundledPandocLayoutInstalled
} from '../../utils/pandocBundledLayouts';
import { getPandocLayoutTier } from '../../publishing/templateTiering';
import { replayTransientClass } from '../../utils/domClassEffects';

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

const STARTER_PUBLISHING_SETUP_TITLE = 'Create starter publishing setup';
const STARTER_PUBLISHING_SETUP_BUTTON = 'Create starter publishing setup';
const STARTER_PUBLISHING_SETUP_BUSY = 'Creating starter publishing setup…';
const STARTER_PUBLISHING_SETUP_ALREADY_EXISTS = 'Starter publishing files already exist.';

const AUTO_CONFIGURE_BUTTON = 'Auto configure publishing';
const AUTO_CONFIGURE_BUSY = 'Configuring publishing…';

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

function buildTemplatePathCandidates(plugin: RadialTimelinePlugin, rawPath: string): string[] {
    const trimmed = rawPath.trim();
    if (!trimmed) return [];
    if (path.isAbsolute(trimmed) || /^[A-Za-z]:[\\/]/.test(trimmed)) return [];

    const normalized = normalizePath(trimmed.replace(/^\/+/, ''));
    if (!normalized) return [];

    const pandocFolder = getConfiguredPandocFolder(plugin);
    const prefixed = normalizePath(`${pandocFolder}/${normalized}`);
    if (!normalized.startsWith(`${pandocFolder}/`) && prefixed !== normalized) {
        return [prefixed, normalized];
    }
    return [normalized];
}

function resolveExistingTemplateVaultPath(plugin: RadialTimelinePlugin, rawPath: string): string | null {
    const candidates = buildTemplatePathCandidates(plugin, rawPath);
    for (const candidate of candidates) {
        if (plugin.app.vault.getAbstractFileByPath(candidate) instanceof TFile) {
            return candidate;
        }
    }
    return null;
}

function resolveTargetTemplateVaultPath(plugin: RadialTimelinePlugin, rawPath: string): string | null {
    const trimmed = rawPath.trim();
    if (!trimmed) return null;
    if (path.isAbsolute(trimmed) || /^[A-Za-z]:[\\/]/.test(trimmed)) return null;

    const normalized = normalizePath(trimmed.replace(/^\/+/, ''));
    if (!normalized) return null;

    const pandocFolder = getConfiguredPandocFolder(plugin);
    if (normalized.startsWith(`${pandocFolder}/`)) return normalized;
    if (normalized.includes('/')) return normalized;
    return normalizePath(`${pandocFolder}/${normalized}`);
}

async function ensureVaultFolderPath(plugin: RadialTimelinePlugin, folderPath: string): Promise<void> {
    const normalized = normalizePath(folderPath.trim().replace(/^\/+/, ''));
    if (!normalized) return;

    const segments = normalized.split('/').filter(Boolean);
    let current = '';
    for (const segment of segments) {
        current = current ? `${current}/${segment}` : segment;
        const existing = plugin.app.vault.getAbstractFileByPath(current);
        if (existing instanceof TFolder) continue;
        if (existing) throw new Error(`Cannot create folder "${current}" because a file exists at that path.`);
        await plugin.app.vault.createFolder(current);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTO-CONFIGURE PUBLISHING ENVIRONMENT
// ═══════════════════════════════════════════════════════════════════════════════

interface PublishingEnvironmentResult {
    pandocFound: boolean;
    latexFound: boolean;
    templatesInstalled: number;
    folderReady: boolean;
    issues: string[];
}

async function ensurePublishingEnvironment(plugin: RadialTimelinePlugin): Promise<PublishingEnvironmentResult> {
    const issues: string[] = [];
    let pandocFound = false;
    let latexFound = false;
    let templatesInstalled = 0;
    let folderReady = false;

    // ── Resolve Pandoc & LaTeX paths (respect existing valid config) ──────
    const existingPandocPath = (plugin.settings.pandocPath || '').trim();
    const pandocAlreadyValid = existingPandocPath.length > 0 && isConfiguredPandocPathValid(plugin);

    const scan = await scanSystemPaths();

    if (!pandocAlreadyValid) {
        if (scan.pandocPath) {
            plugin.settings.pandocPath = scan.pandocPath;
            pandocFound = true;
        } else {
            issues.push('Pandoc not found — install from pandoc.org');
        }
    } else {
        pandocFound = true;
    }

    if (scan.latexPath) {
        latexFound = true;
    } else {
        issues.push('LaTeX not found — install to enable PDF export');
    }

    // ── Ensure Pandoc folder exists ──────────────────────────────────────
    const pandocFolder = getConfiguredPandocFolder(plugin);
    try {
        await ensureVaultFolderPath(plugin, pandocFolder);
        folderReady = true;
    } catch (e) {
        issues.push(`Could not create Pandoc folder: ${(e as Error).message}`);
    }

    // ── Install bundled templates ────────────────────────────────────────
    if (folderReady) {
        const result = await installBundledPandocLayouts(plugin);
        templatesInstalled = result.installed.length;
        if (result.failed.length > 0) {
            issues.push(`Failed to install templates: ${result.failed.join(', ')}`);
        }
        for (const layout of getBundledPandocLayouts()) {
            const refresh = await ensureBundledLayoutInstalledForExport(plugin, layout);
            if (refresh.failed) {
                issues.push(`Failed to refresh template: ${layout.name}`);
            }
        }
    }

    // ── Register templates in settings ───────────────────────────────────
    ensureBundledPandocLayoutsRegistered(plugin);

    // ── Persist ──────────────────────────────────────────────────────────
    await plugin.saveSettings();

    return { pandocFound, latexFound, templatesInstalled, folderReady, issues };
}

async function maybeRenameTemplateFileForPathChange(
    plugin: RadialTimelinePlugin,
    previousStoredPath: string,
    nextStoredPath: string
): Promise<boolean> {
    const previous = compactTemplatePathForStorage(plugin, previousStoredPath);
    const next = compactTemplatePathForStorage(plugin, nextStoredPath);
    if (!previous || !next || previous === next) return false;

    if (path.extname(next).toLowerCase() !== '.tex') return false;

    const sourceVaultPath = resolveExistingTemplateVaultPath(plugin, previous);
    if (!sourceVaultPath) return false;

    const targetVaultPath = resolveTargetTemplateVaultPath(plugin, next);
    if (!targetVaultPath) return false;
    if (normalizePath(targetVaultPath) === normalizePath(sourceVaultPath)) return false;
    if (plugin.app.vault.getAbstractFileByPath(targetVaultPath)) return false;

    const sourceFile = plugin.app.vault.getAbstractFileByPath(sourceVaultPath);
    if (!(sourceFile instanceof TFile)) return false;

    const slashIndex = targetVaultPath.lastIndexOf('/');
    const targetFolder = slashIndex > 0 ? targetVaultPath.slice(0, slashIndex) : '';
    if (targetFolder) {
        await ensureVaultFolderPath(plugin, targetFolder);
    }

    await plugin.app.fileManager.renameFile(sourceFile, targetVaultPath);
    return true;
}

class StarterPublishingSetupModal extends Modal {
    private readonly onConfirm: (confirmed: boolean) => void;
    private readonly includeScriptExamples: boolean;
    private resolved = false;

    constructor(app: App, onConfirm: (confirmed: boolean) => void, includeScriptExamples: boolean) {
        super(app);
        this.onConfirm = onConfirm;
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
        header.createDiv({ cls: 'ert-modal-title', text: AUTO_CONFIGURE_BUTTON });
        header.createDiv({
            cls: 'ert-modal-subtitle',
            text: 'Configure your publishing environment, book details, pages, and PDF style in one step.'
        });

        const createdBlock = contentEl.createDiv({ cls: 'ert-template-pack-created ert-stack--tight' });
        const createdHeading = createdBlock.createDiv({ cls: 'ert-template-pack-subtitle' });
        const createdHeadingIcon = createdHeading.createSpan({ cls: 'ert-template-pack-subtitle-icon' });
        setIcon(createdHeadingIcon, 'list-checks');
        createdHeading.createSpan({ text: 'What this setup creates' });
        const createdList = createdBlock.createEl('ol', { cls: 'ert-template-pack-list ert-template-pack-list--ordered' });
        const items = [
            'Book Details note',
            'Book page stubs (Title Page, Copyright, Dedication, and more)',
            'PDF style files',
        ];
        if (this.includeScriptExamples) {
            items.splice(items.length - 1, 0, 'Writing samples (screenplay and podcast)');
        }
        items.forEach(item => {
            const listItem = createdList.createEl('li', { cls: 'ert-template-pack-list-item' });
            listItem.setText(item);
        });

        const actions = contentEl.createDiv({ cls: 'ert-modal-actions ert-template-pack-actions' });
        const generateButton = new ButtonComponent(actions)
            .setButtonText(AUTO_CONFIGURE_BUTTON);
        generateButton.buttonEl.addClass('ert-btn', 'ert-btn--standard-pro');
        generateButton.onClick(() => {
                this.resolved = true;
                this.close();
                this.onConfirm(true);
            });
        new ButtonComponent(actions)
            .setButtonText('Cancel')
            .onClick(() => {
                this.resolved = true;
                this.close();
                this.onConfirm(false);
            });
    }

    onClose(): void {
        if (!this.resolved) {
            this.resolved = true;
            this.onConfirm(false);
        }
        this.contentEl.empty();
    }
}

async function confirmStarterPublishingSetup(app: App, includeScriptExamples: boolean): Promise<boolean> {
    return new Promise((resolve) => {
        new StarterPublishingSetupModal(app, resolve, includeScriptExamples).open();
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
    clearRole?: boolean;
    nextBodyMode?: 'plain';
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

function normalizeRoleForRepair(value: unknown): { invalid: boolean; clearRole?: boolean } {
    if (value === undefined || value === null) return { invalid: false };
    if (typeof value !== 'string') return { invalid: true, clearRole: true };
    const normalized = value.trim().toLowerCase();
    if (!normalized.length) return { invalid: true, clearRole: true };
    if (VALID_MATTER_ROLES.has(normalized)) return { invalid: false };
    return { invalid: true, clearRole: true };
}

function normalizeBodyModeForRepair(value: unknown): { invalid: boolean; nextBodyMode?: 'plain' } {
    if (value === undefined || value === null) return { invalid: false };
    if (typeof value !== 'string') return { invalid: true, nextBodyMode: 'plain' };
    const normalized = value.trim().toLowerCase();
    if (normalized === 'plain' || normalized === 'latex') {
        return { invalid: false };
    }
    return { invalid: true, nextBodyMode: 'plain' };
}

function buildMatterRepairPlan(plugin: RadialTimelinePlugin): MatterRepairPlan {
    const sourceFolder = getActiveBookExportContext(plugin).sourceFolder.trim();
    if (!sourceFolder) {
        return { sourceFolder: '', issues: [], repairableIssues: [], unresolvedIssues: [] };
    }

    const mappings = getActiveFrontmatterMappings(plugin.settings);

    const files = plugin.app.vault.getMarkdownFiles()
        .filter(file => isPathInFolderScope(file.path, sourceFolder));

    const issues: MatterRepairIssue[] = [];

    for (const file of files) {
        const cache = plugin.app.metadataCache.getFileCache(file);
        const rawFrontmatter = cache?.frontmatter as Record<string, unknown> | undefined;
        if (!rawFrontmatter) continue;
        const normalized = normalizeFrontmatterKeys(rawFrontmatter, mappings);
        const classValue = normalizeMatterClassValue(normalized.Class);
        const legacyMatterValue = getFrontmatterField(normalized, ['Matter', 'matter'])?.value;
        const roleValue = normalized.Role;
        const bodyModeValue = normalized.BodyMode;
        const useBookMetaValue = normalized.UseBookMeta;

        const hasMatterSignal = !!classValue
            || legacyMatterValue !== undefined
            || roleValue !== undefined
            || bodyModeValue !== undefined
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

        const bodyModeRepair = normalizeBodyModeForRepair(bodyModeValue);
        if (bodyModeRepair.invalid) {
            reasons.push('invalid-bodymode');
        }

        if (reasons.length === 0) continue;
        issues.push({
            file,
            reasons,
            nextClass,
            clearRole: roleRepair.clearRole,
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

            if (issue.clearRole) {
                deleteFrontmatterAliases(fm, ['Role']);
            }

            if (issue.nextBodyMode) {
                deleteFrontmatterAliases(fm, ['BodyMode']);
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
    const frontmatterBlocks = frontmatter.Frontmatter as Record<string, unknown> | undefined;
    const backmatterBlocks = frontmatter.Backmatter as Record<string, unknown> | undefined;

    const rawYear = rights?.year;
    const year = typeof rawYear === 'number'
        ? rawYear
        : typeof rawYear === 'string'
            ? Number(rawYear)
            : NaN;

    return {
        title: (book?.title as string) || undefined,
        subtitle: (book?.subtitle as string) || undefined,
        author: (book?.author as string) || undefined,
        rights: rights ? {
            copyright_holder: (rights.copyright_holder as string) || undefined,
            year: Number.isFinite(year) ? year : undefined
        } : undefined,
        identifiers: identifiers ? {
            isbn_paperback: (identifiers.isbn_paperback as string) || undefined
        } : undefined,
        publisher: publisher ? {
            name: (publisher.name as string) || undefined,
            imprint: (publisher.imprint as string) || undefined,
            edition: (publisher.edition as string) || undefined
        } : undefined,
        frontmatter: frontmatterBlocks ? {
            title_page_note: (frontmatterBlocks.title_page_note as string) || undefined,
            dedication: (frontmatterBlocks.dedication as string) || undefined,
            epigraph_quote: (frontmatterBlocks.epigraph_quote as string) || undefined,
            epigraph_attribution: (frontmatterBlocks.epigraph_attribution as string) || undefined
        } : undefined,
        backmatter: backmatterBlocks ? {
            acknowledgments: (backmatterBlocks.acknowledgments as string) || undefined,
            about_author: (backmatterBlocks.about_author as string) || undefined,
            author_note: (backmatterBlocks.author_note as string) || undefined,
            other_works: (backmatterBlocks.other_works as string) || undefined
        } : undefined,
        sourcePath
    };
}

function getActiveBookMetaStatus(plugin: RadialTimelinePlugin): ActiveBookMetaStatus {
    const sourceFolder = getActiveBookExportContext(plugin).sourceFolder.trim();
    if (!sourceFolder) return { found: false, sourceFolder };

    const mappings = getActiveFrontmatterMappings(plugin.settings);

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
            warning: `Multiple Book Details notes found. Using: ${selected.path}`
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
    state: 'ready' | 'warning' | 'blocked';
    errorCount: number;
    warningCount: number;
    topMessage?: string;
}

interface PublishingProgressContext {
    activeBookMetaStatus: ActiveBookMetaStatus;
    validationSnapshot: PublishingValidationSnapshot;
    bookMetaSummary: ValidationSummary;
    matterSummary: ValidationSummary;
    layoutSummary: PdfLayoutSummary;
    matterCount: number;
    pandocPathValid: boolean;
}

function getActiveBookMatterSummary(plugin: RadialTimelinePlugin): ActiveBookMatterSummary {
    const sourceFolder = getActiveBookExportContext(plugin).sourceFolder.trim();
    if (!sourceFolder) {
        return { sourceFolder: '', frontCount: 0, backCount: 0, totalCount: 0 };
    }

    const mappings = getActiveFrontmatterMappings(plugin.settings);

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
    const layouts = (plugin.settings.pandocLayouts || [])
        .filter(layout => layout.preset === 'novel');
    const validation = getPublishingValidationSnapshot(plugin);
    const relevantIssues: ValidationIssue[] = [];
    layouts.forEach(layout => {
        relevantIssues.push(...(validation.assetIssues[`${layout.id}::asset`] || []));
        relevantIssues.push(...(validation.profileIssues[layout.id] || []));
    });
    relevantIssues.push(...validation.preflightIssues);
    relevantIssues.push(...validation.templateAccessIssues);
    if (layouts.length === 0) {
        relevantIssues.push({
            scope: 'profile',
            level: 'error',
            code: 'pdf_layout_missing',
            message: 'No PDF styles are configured.',
        });
    }
    const summary = plugin.getPublishingValidationService().summarize(relevantIssues);
    const validCount = layouts.filter(layout => {
        const assetIssues = validation.assetIssues[`${layout.id}::asset`] || [];
        const profileIssues = validation.profileIssues[layout.id] || [];
        return !assetIssues.some(issue => issue.level === 'error') && !profileIssues.some(issue => issue.level === 'error');
    }).length;
    return {
        validCount,
        totalCount: layouts.length,
        state: summary.state,
        errorCount: summary.errorCount,
        warningCount: summary.warningCount,
        topMessage: summary.topMessage
    };
}

function getPublishingValidationSnapshot(plugin: RadialTimelinePlugin): PublishingValidationSnapshot {
    const activeBook = getActiveBook(plugin.settings);
    return plugin.getPublishingValidationService().collect(activeBook?.id, {
        exportType: 'manuscript',
        outputFormat: 'pdf'
    });
}

function getPublishingProgressContext(plugin: RadialTimelinePlugin): PublishingProgressContext {
    const activeBookMetaStatus = getActiveBookMetaStatus(plugin);
    const validationSnapshot = getPublishingValidationSnapshot(plugin);
    const activeBookMetaIssues = [...validationSnapshot.activeBookMetaIssues];
    if (!activeBookMetaStatus.found || !activeBookMetaStatus.bookMeta) {
        activeBookMetaIssues.push({
            scope: 'book-meta',
            level: 'error',
            code: 'book_meta_missing',
            message: 'Book Details not found for active book.'
        });
    }

    return {
        activeBookMetaStatus,
        validationSnapshot,
        bookMetaSummary: plugin.getPublishingValidationService().summarize(activeBookMetaIssues),
        matterSummary: plugin.getPublishingValidationService().summarize(validationSnapshot.matterIssues),
        layoutSummary: getPdfLayoutSummary(plugin),
        matterCount: getActiveBookMatterSummary(plugin).totalCount,
        pandocPathValid: isConfiguredPandocPathValid(plugin)
    };
}

interface MatterPreviewItem {
    file: TFile;
    side: 'front' | 'back';
    role?: string;
    usesBookMeta?: boolean;
    modeLabel: string;
    modeTone: 'plain' | 'latex';
}

interface MatterPreviewSummary {
    front: MatterPreviewItem[];
    back: MatterPreviewItem[];
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
        const bodyMode: 'latex' | 'plain' = matterMeta.bodyMode === 'latex' ? 'latex' : 'plain';

        const item: MatterPreviewItem = {
            file,
            side,
            role,
            usesBookMeta: matterMeta.usesBookMeta === true,
            modeLabel: bodyMode === 'latex' ? 'LaTeX' : 'Plain',
            modeTone: bodyMode
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
        return { created: false, path: bookMetaPath, reason: 'Book Details already exists.' };
    }

    const year = new Date().getFullYear();
    const content = [
        '---',
        'Class: BookMeta',
        'Book:',
        '  title: "Untitled Manuscript"',
        '  subtitle: ""',
        '  author: "Author"',
        'Rights:',
        '  copyright_holder: "Copyright Holder"',
        `  year: ${year}`,
        'Identifiers:',
        '  isbn_paperback: "000-0-00-000000-0"',
        'Publisher:',
        '  name: "Publisher"',
        '  imprint: "Imprint"',
        '  edition: "1"',
        'Frontmatter:',
        '  title_page_note: ""',
        '  dedication: ""',
        '  epigraph_quote: ""',
        '  epigraph_attribution: ""',
        'Backmatter:',
        '  acknowledgments: ""',
        '  about_author: ""',
        '  author_note: ""',
        '  other_works: ""',
        'Production:',
        '  imprint: "Imprint"',
        '  edition: "1"',
        '  print_location: "City, Country"',
        '---',
        ''
    ].join('\n');
    await vault.create(bookMetaPath, content);
    return { created: true, path: bookMetaPath };
}

/**
 * Generate the starter publishing setup in the user's vault:
 * Book Details note, template-managed page stubs, and bundled PDF style files.
 * Skips files that already exist. Auto-configures template paths in settings.
 */
async function generateSampleTemplates(
    plugin: RadialTimelinePlugin,
    includeScriptExamples: boolean
): Promise<string[]> {
    const vault = plugin.app.vault;
    const baseFolder = resolveManuscriptOutputFolder(plugin);
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
            '  title: "Untitled Manuscript"',
            '  subtitle: ""',
            '  author: "Author"',
            'Rights:',
            '  copyright_holder: "Copyright Holder"',
            `  year: ${currentYear}`,
            'Identifiers:',
            '  isbn_paperback: "000-0-00-000000-0"',
            'Publisher:',
            '  name: "Publisher"',
            '  imprint: "Imprint"',
            '  edition: "1"',
            'Frontmatter:',
            '  title_page_note: ""',
            '  dedication: ""',
            '  epigraph_quote: ""',
            '  epigraph_attribution: ""',
            'Backmatter:',
            '  acknowledgments: ""',
            '  about_author: ""',
            '  author_note: ""',
            '  other_works: ""',
            'Production:',
            '  imprint: "Imprint"',
            '  edition: "1"',
            '  print_location: "City, Country"',
            '---',
            ''
        ].join('\n')
    };

    const matterPageComment = [
        '<!--',
        'Publishing Setup Page',
        'Rendered using your Book Details and the selected PDF style.',
        'Add plain text below only if this page needs custom prose.',
        '-->'
    ];

    const matterSamples: { name: string; content: string }[] = [
        {
            name: '0.2 Title Page.md',
            content: [
                '---',
                'Class: Frontmatter',
                'Role: title-page',
                'UseBookMeta: true',
                'BodyMode: plain',
                '---',
                '',
                ...matterPageComment,
                '',
            ].join('\n')
        },
        {
            name: '0.3 Copyright.md',
            content: [
                '---',
                'Class: Frontmatter',
                'Role: copyright',
                'UseBookMeta: true',
                'BodyMode: plain',
                '---',
                '',
                ...matterPageComment,
                '',
                'Additional rights notice or legal disclaimer text goes here.',
            ].join('\n')
        },
        {
            name: '0.4 Dedication.md',
            content: [
                '---',
                'Class: Frontmatter',
                'Role: dedication',
                'UseBookMeta: true',
                'BodyMode: plain',
                '---',
                '',
                ...matterPageComment,
                '',
                'Dedication text goes here.',
            ].join('\n')
        },
        {
            name: '0.5 Epigraph.md',
            content: [
                '---',
                'Class: Frontmatter',
                'Role: epigraph',
                'UseBookMeta: true',
                'BodyMode: plain',
                '---',
                '',
                ...matterPageComment,
                '',
                'Epigraph text goes here.',
            ].join('\n')
        },
        {
            name: '200.1 Acknowledgments.md',
            content: [
                '---',
                'Class: Backmatter',
                'Role: acknowledgments',
                'UseBookMeta: true',
                'BodyMode: plain',
                '---',
                '',
                ...matterPageComment,
                '',
                'Acknowledgments text goes here.',
            ].join('\n')
        },
        {
            name: '200.2 About the Author.md',
            content: [
                '---',
                'Class: Backmatter',
                'Role: about-author',
                'UseBookMeta: true',
                'BodyMode: plain',
                '---',
                '',
                ...matterPageComment,
                '',
                'Author bio text goes here.',
            ].join('\n')
        }
    ];

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

    const bookMetaPath = normalizePath(`${matterTargetFolder}/${bookMetaSample.name}`);
    if (!vault.getAbstractFileByPath(bookMetaPath)) {
        await vault.create(bookMetaPath, bookMetaSample.content);
        createdFiles.push(bookMetaSample.name);
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

export interface ProFeaturePanelsParams {
    app: App;
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
}

export function renderProFeaturePanels({ app, plugin, containerEl }: ProFeaturePanelsParams): HTMLElement {
    const isActive = isProActive(plugin);
    const section = containerEl;

    const rerender = () => {
        containerEl.empty();
        renderProFeaturePanels({ app, plugin, containerEl });
    };

    if (ensureBundledPandocLayoutsRegistered(plugin)) {
        void plugin.saveSettings();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CONTENT STACK
    // ─────────────────────────────────────────────────────────────────────────
    const addProRow = (setting: Setting) => setting;
    let refreshPublishingStatusCard: () => void = () => {};

    // ─────────────────────────────────────────────────────────────────────────
    // PANDOC & EXPORT SETTINGS
    // ─────────────────────────────────────────────────────────────────────────
    const publishingStagesPanel = section.createDiv({ cls: `${ERT_CLASSES.STACK}` });
    publishingStagesPanel.style.order = '5';
    const statusShell = publishingStagesPanel.createDiv({ cls: 'ert-publishing-status-shell' });
    const statusGrid = statusShell.createDiv({ cls: 'ert-publishing-status-grid' });
    const setupActionRow = publishingStagesPanel.createDiv({ cls: 'ert-publishing-status-action' });

    const pandocPanel = section.createDiv({ cls: `${ERT_CLASSES.PANEL} ${ERT_CLASSES.STACK}` });
    pandocPanel.style.order = '10';
    const pandocHeading = addProRow(new Setting(pandocPanel))
        .setName('Export & publishing')
        .setDesc('Assemble your manuscript in Markdown or render a print-ready PDF using Pandoc and LaTeX. Configure templates, layouts, and publishing tools below.')
        .setHeading();
    addHeadingIcon(pandocHeading, 'book-open-text');
    addWikiLink(pandocHeading, 'Settings#publish');
    applyErtHeaderLayout(pandocHeading);

    const systemConfigPanel = pandocPanel.createDiv({
        cls: ERT_CLASSES.STACK,
        attr: { [ERT_DATA.SECTION]: 'export-check' }
    });
    systemConfigPanel.style.order = '50';
    // Hidden by default — revealed when validation fails or user expands Advanced
    systemConfigPanel.addClass('is-hidden');
    const revealSystemConfig = () => {
        systemConfigPanel.removeClass('is-hidden');
        systemConfigPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    const systemConfigHeading = addProRow(new Setting(systemConfigPanel))
        .setName('System configuration')
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

        const folder = plugin.app.vault.getAbstractFileByPath(normalized);
        const cls = (folder && folder instanceof TFolder)
            ? 'ert-input--flash-success'
            : 'ert-input--flash-error';
        replayTransientClass(pandocFolderInputEl, cls, {
            removeClasses: ['ert-input--flash-success', 'ert-input--flash-error'],
            durationMs: 1700
        });
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
                replayTransientClass(pandocFolderInputEl, 'ert-input--flash-success', {
                    removeClasses: ['ert-input--flash-success', 'ert-input--flash-error'],
                    durationMs: 1700
                });
            }
        });
    });

    // ── Layout Registry Subsection ──────────────────────────────────────────
    const layoutPanel = pandocPanel.createDiv({
        cls: ERT_CLASSES.STACK,
        attr: { [ERT_DATA.SECTION]: 'pdf-style' }
    });
    layoutPanel.style.order = '30';
    const layoutHeading = addProRow(new Setting(layoutPanel))
        .setName('PDF Style')
        .setDesc('Choose the style used for exported PDFs. Built-in and custom styles are listed below.')
        .setHeading();
    addHeadingIcon(layoutHeading, 'book-open');
    applyErtHeaderLayout(layoutHeading);

    const normalizeVersionLabels = (label: string): string =>
        label.replace(/\bv(?:ersion)?\s*\d+(?:\.\d+)?\b/gi, '').replace(/\s{2,}/g, ' ').trim();

    let layoutProfilesById = new Map<string, TemplateProfile>();

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
        if (layout.preset === 'novel' && layout.bundled) {
            const variant = getFictionVariant(layout);
            if (variant === 'classic') return 'Standard Manuscript';
            if (variant === 'modernClassic') return 'Modern Classic';
            if (variant === 'signature') return 'Signature Literary';
            if (variant === 'contemporary') return 'Contemporary Literary';
        }
        if (layout.preset === 'screenplay' && layout.bundled) return 'Screenplay';
        return normalizeVersionLabels(layout.name || 'Custom Layout');
    };
    // Single source of truth: descriptions are authored on the template itself.
    // Bundled templates carry their description in pandocBundledLayouts.ts.
    // Duplicated templates inherit at duplicate time. Imports set their own on import.
    const buildLayoutDescription = (layout: PandocLayoutTemplate): string => {
        return layout.description?.trim() || '';
    };

    // ── Layout Visual: Types ──────────────────────────────────────────────
    type LayoutFeatureRow = { label: string; value: string };

    type PictogramPageSide = {
        headerLeft?: string;
        headerCenter?: string;
        headerRight?: string;
        folioBottom?: string;
        bodyLines: number;
        suppressHeader?: boolean;
        suppressFooter?: boolean;
        specialText?: string;
        specialSubtext?: string;
        /** Short rule rendered below specialText (like scene separator rule) */
        specialRule?: boolean;
        /** Italic epigraph quote below the special block */
        epigraphText?: string;
        /** Attribution line below epigraph — rendered all-caps with em-dash prefix */
        epigraphAttribution?: string;
        /** Body lines before a scene separator, followed by separator, then more lines */
        separatorText?: string;
        linesBeforeSeparator?: number;
        linesAfterSeparator?: number;
    };

    type PictogramSpread = {
        label: string;
        leftPage: PictogramPageSide | null;
        rightPage: PictogramPageSide | null;
        /** When set, this spread represents a selectable scene heading mode */
        sceneMode?: ManuscriptSceneHeadingMode;
    };

    // ── Layout Visual: Feature Data ───────────────────────────────────────
    // RT terminology → export structure:
    //   Parts    = Acts (determined by Act count in settings; emit \rtPart{I})
    //   Chapters = Timeline notes with a Chapter field (rendered as chapter openers/headings)
    //   Scenes   = Scene notes (the primary content unit; scene separators via \rtSceneSep)
    const getLayoutFeatures = (variant: FictionLayoutVariant): LayoutFeatureRow[] => {
        switch (variant) {
            case 'classic':
                return [
                    { label: 'Headers', value: 'Title centered (both pages)' },
                    { label: 'Folios', value: 'Bottom center' },
                    { label: 'Font', value: 'Sorts Mill Goudy (serif)' },
                    { label: 'Spacing', value: '1.5 lines' },
                    { label: 'Scenes', value: 'New page — centered scene number only' },
                ];
            case 'modernClassic':
                return [
                    { label: 'Headers', value: 'Centered: Page|Author (even) · Title|Page (odd)' },
                    { label: 'Folios', value: 'In headers' },
                    { label: 'Font', value: 'Latin Modern (serif)' },
                    { label: 'Spacing', value: '1.18×' },
                    { label: 'Parts', value: 'Act opener — Roman numeral with optional epigraph' },
                    { label: 'Chapters', value: SHARED_CHAPTER_FIELD_SOURCE_LABEL_TITLE },
                    { label: 'Scenes', value: 'Lowercase Roman numeral (i. ii.) with short rule' },
                ];
            case 'signature':
                return [
                    { label: 'Headers', value: 'Centered: Page|Author (even) · Title|Page (odd)' },
                    { label: 'Folios', value: 'Header-only, letter-spaced' },
                    { label: 'Font', value: 'Sorts Mill Goudy (serif)' },
                    { label: 'Spacing', value: '1.5 lines' },
                    { label: 'Scenes', value: 'Opener page — 30pt bold, suppresses headers' },
                    { label: 'Scene #', value: 'Number only' },
                    { label: 'Scene #+T', value: 'Number + title (in parentheses)' },
                    { label: 'Scene T', value: 'Title only' },
                ];
            case 'contemporary':
                return [
                    { label: 'Headers', value: 'Book title (left) · Section (right), sans' },
                    { label: 'Folios', value: 'Bottom center (serif)' },
                    { label: 'Font', value: 'Sorts Mill Goudy body, sans headers' },
                    { label: 'Spacing', value: '1.5 lines' },
                    { label: 'Scenes', value: 'New page — centered scene number only' },
                    { label: 'Chapters', value: SHARED_CHAPTER_FIELD_SOURCE_LABEL_TITLE },
                ];
            default:
                return [];
        }
    };

    // ── Layout Visual: Pictogram Spread Configs ───────────────────────────
    // Pictograms represent the physical PDF page layout for each template.
    // Scene separators appear inline within body text (not on dedicated pages).
    // "Special" spreads show dedicated opener pages:
    //   PART    = Act opener page (RT Acts → LaTeX \rtPart)
    //   CHAPTER = Chapter heading from the shared Chapter field
    //   SCENE # / #+TITLE / TITLE = Scene heading modes (Signature only)
    const BODY_LINES = 14;

    type LayoutPictogramRows = {
        /** Primary row: scene separator page (optional) + body spread — always right-aligned */
        scene: PictogramSpread | null;
        body: PictogramSpread;
        /** Special row: Part, Chapter, or Scene heading mode variants */
        special: PictogramSpread[];
    };

    const getLayoutPictogramRows = (variant: FictionLayoutVariant): LayoutPictogramRows => {
        switch (variant) {
            case 'classic':
                return {
                    // Scene opener: suppresses headers/footers (\thispagestyle{empty})
                    scene: {
                        label: 'SCENE',
                        leftPage: null,
                        rightPage: {
                            bodyLines: 5,
                            suppressHeader: true,
                            suppressFooter: true,
                            specialText: '3',
                        },
                    },
                    body: {
                        label: 'BODY',
                        leftPage: { headerCenter: 'TITLE', folioBottom: '12', bodyLines: BODY_LINES },
                        rightPage: { headerCenter: 'TITLE', folioBottom: '13', bodyLines: BODY_LINES },
                    },
                    special: [],
                };
            case 'modernClassic':
                return {
                    scene: {
                        label: 'SCENE',
                        leftPage: null,
                        rightPage: {
                            bodyLines: 0,
                            separatorText: 'ii.',
                            linesBeforeSeparator: 0,
                            linesAfterSeparator: 5,
                        },
                    },
                    body: {
                        label: 'BODY',
                        leftPage: { headerCenter: '12 | AUTH', bodyLines: BODY_LINES },
                        rightPage: { headerCenter: 'TITLE | 13', bodyLines: BODY_LINES },
                    },
                    special: [
                        {
                            label: 'PART',
                            leftPage: null,
                            rightPage: {
                                bodyLines: 0,
                                suppressHeader: true,
                                suppressFooter: true,
                                specialText: 'I',
                                specialRule: true,
                                epigraphText: 'a quote',
                                epigraphAttribution: '\u2014J. Name',
                            },
                        },
                        {
                            label: 'CHAPTER',
                            leftPage: null,
                            rightPage: {
                                bodyLines: 0,
                                suppressHeader: true,
                                suppressFooter: true,
                                specialText: 'Chapter 1',
                                specialSubtext: 'Boy with a Skull',
                            },
                        },
                    ],
                };
            case 'signature':
                return {
                    scene: null,
                    body: {
                        label: 'BODY',
                        leftPage: { headerCenter: '12 | AUTH', bodyLines: BODY_LINES },
                        rightPage: { headerCenter: 'TITLE | 13', bodyLines: BODY_LINES },
                    },
                    special: [
                        {
                            label: 'SCENE #',
                            sceneMode: 'scene-number',
                            leftPage: null,
                            rightPage: {
                                bodyLines: 4,
                                suppressHeader: true,
                                suppressFooter: true,
                                specialText: '3',
                            },
                        },
                        {
                            label: '#+TITLE',
                            sceneMode: 'scene-number-title',
                            leftPage: null,
                            rightPage: {
                                bodyLines: 4,
                                suppressHeader: true,
                                suppressFooter: true,
                                specialText: '3',
                                specialSubtext: '(The Escape)',
                            },
                        },
                        {
                            label: 'TITLE',
                            sceneMode: 'title-only',
                            leftPage: null,
                            rightPage: {
                                bodyLines: 4,
                                suppressHeader: true,
                                suppressFooter: true,
                                specialText: 'The Escape',
                            },
                        },
                    ],
                };
            case 'contemporary':
                return {
                    // Scene opener: suppresses headers/footers (\thispagestyle{empty})
                    scene: {
                        label: 'SCENE',
                        leftPage: null,
                        rightPage: {
                            bodyLines: 5,
                            suppressHeader: true,
                            suppressFooter: true,
                            specialText: '3',
                        },
                    },
                    body: {
                        label: 'BODY',
                        leftPage: { headerLeft: 'title', folioBottom: '12', bodyLines: BODY_LINES },
                        rightPage: { headerRight: 'section', folioBottom: '13', bodyLines: BODY_LINES },
                    },
                    special: [
                        {
                            label: 'CHAPTER',
                            leftPage: null,
                            rightPage: {
                                bodyLines: 5,
                                suppressHeader: true,
                                suppressFooter: true,
                                specialText: 'Chapter',
                            },
                        },
                    ],
                };
            default:
                return {
                    scene: null,
                    body: {
                        label: '',
                        leftPage: { bodyLines: BODY_LINES },
                        rightPage: { bodyLines: BODY_LINES },
                    },
                    special: [],
                };
        }
    };

    // ── Layout Visual: DOM Builders ───────────────────────────────────────
    const renderLayoutPage = (parent: HTMLElement, side: PictogramPageSide, sideClass: string): void => {
        const page = parent.createDiv({ cls: `ert-layout-page ${sideClass}` });

        // Header
        const hdr = page.createDiv({ cls: 'ert-layout-page-header' });
        if (side.suppressHeader) hdr.addClass('is-suppressed');
        if (side.headerCenter) {
            hdr.addClass('is-centered');
            hdr.createSpan({ cls: 'ert-layout-page-hdr-center', text: side.headerCenter });
        } else {
            if (side.headerLeft) hdr.createSpan({ cls: 'ert-layout-page-hdr-left', text: side.headerLeft });
            if (side.headerRight) hdr.createSpan({ cls: 'ert-layout-page-hdr-right', text: side.headerRight });
        }

        // Body
        const body = page.createDiv({ cls: 'ert-layout-page-body' });

        if (side.separatorText != null) {
            // Scene separator mode: lines → separator → lines
            // Use ?? (not ||) so that 0 is respected as "no lines above"
            for (let i = 0; i < (side.linesBeforeSeparator ?? 3); i++) {
                body.createDiv({ cls: 'ert-layout-page-line' });
            }
            const sep = body.createDiv({ cls: 'ert-layout-page-separator' });
            sep.createSpan({ cls: 'ert-layout-page-separator-text', text: side.separatorText });
            sep.createDiv({ cls: 'ert-layout-page-separator-rule' });
            for (let i = 0; i < (side.linesAfterSeparator ?? 3); i++) {
                body.createDiv({ cls: 'ert-layout-page-line' });
            }
        } else if (side.specialText) {
            // Special text mode: centered Part/Chapter/Scene text
            body.addClass('is-special');
            body.createSpan({ cls: 'ert-layout-page-special-text', text: side.specialText });
            if (side.specialRule) {
                body.createDiv({ cls: 'ert-layout-page-separator-rule' });
            }
            if (side.specialSubtext) {
                body.createSpan({ cls: 'ert-layout-page-special-subtext', text: side.specialSubtext });
            }
            if (side.epigraphText) {
                body.createSpan({ cls: 'ert-layout-page-epigraph-text', text: side.epigraphText });
            }
            if (side.epigraphAttribution) {
                body.createSpan({ cls: 'ert-layout-page-epigraph-attr', text: side.epigraphAttribution });
            }
            // Add body lines below special text if specified
            if (side.bodyLines > 0) {
                const bodyBelow = page.createDiv({ cls: 'ert-layout-page-body' });
                bodyBelow.style.flex = '0 0 auto';
                for (let i = 0; i < side.bodyLines; i++) {
                    bodyBelow.createDiv({ cls: 'ert-layout-page-line' });
                }
            }
        } else {
            // Normal body lines
            for (let i = 0; i < side.bodyLines; i++) {
                body.createDiv({ cls: 'ert-layout-page-line' });
            }
        }

        // Footer
        const ftr = page.createDiv({ cls: 'ert-layout-page-footer' });
        if (side.suppressFooter) ftr.addClass('is-suppressed');
        if (side.folioBottom) {
            ftr.createSpan({ cls: 'ert-layout-page-folio', text: side.folioBottom });
        }
    };

    const renderLayoutSpread = (parent: HTMLElement, spread: PictogramSpread): HTMLElement => {
        const spreadEl = parent.createDiv({ cls: 'ert-layout-spread' });
        const pagesEl = spreadEl.createDiv({ cls: 'ert-layout-spread-pages' });

        if (spread.leftPage && spread.rightPage) {
            renderLayoutPage(pagesEl, spread.leftPage, 'is-left');
            pagesEl.createDiv({ cls: 'ert-layout-spread-spine' });
            renderLayoutPage(pagesEl, spread.rightPage, 'is-right');
        } else if (spread.rightPage) {
            renderLayoutPage(pagesEl, spread.rightPage, 'is-single');
        } else if (spread.leftPage) {
            renderLayoutPage(pagesEl, spread.leftPage, 'is-single');
        }

        if (spread.label) {
            spreadEl.createSpan({ cls: 'ert-layout-spread-label', text: spread.label });
        }
        return spreadEl;
    };

    const renderLayoutFeatureList = (parent: HTMLElement, features: LayoutFeatureRow[]): HTMLElement => {
        const featureCol = parent.createDiv({ cls: 'ert-layout-visual-features' });
        for (const feat of features) {
            const row = featureCol.createDiv({ cls: 'ert-layout-feature-row' });
            row.createSpan({ cls: 'ert-layout-feature-label', text: feat.label });
            row.createSpan({ cls: 'ert-layout-feature-value', text: feat.value });
        }
        return featureCol;
    };

    /**
     * Click-to-edit inline text. Displays as plain text until clicked, then swaps to an
     * input/textarea. Enter commits, Escape cancels, blur commits.
     */
    type InlineEditableOptions = {
        placeholder?: string;
        multiline?: boolean;
        onSave: (next: string) => Promise<void> | void;
        fallbackText?: string;
        displayClass?: string;
        inputClass?: string;
    };
    const renderInlineEditable = (
        container: HTMLElement,
        initialValue: string,
        options: InlineEditableOptions
    ): void => {
        const display = container.createSpan({
            cls: `ert-editable-display ${options.displayClass || ''}`.trim(),
            text: initialValue || options.fallbackText || ''
        });
        display.setAttr('role', 'button');
        display.setAttr('tabindex', '0');
        display.setAttr('aria-label', 'Click to edit');
        display.setAttr('title', 'Click to edit');

        const swapToEditor = () => {
            const current = display.textContent || '';
            display.hide();
            const inputCls = `ert-editable-input ${options.inputClass || ''}`.trim();
            const input = options.multiline
                ? container.createEl('textarea', {
                    cls: `ert-textarea ${inputCls}`,
                    attr: { rows: '2' }
                })
                : container.createEl('input', {
                    type: 'text',
                    cls: `ert-input ${inputCls}`
                });
            input.value = current.trim() === (options.fallbackText || '').trim() ? '' : current;
            if (options.placeholder) input.placeholder = options.placeholder;

            let committed = false;
            const commit = async () => {
                if (committed) return;
                committed = true;
                const next = input.value.trim();
                input.remove();
                display.show();
                display.textContent = next || options.fallbackText || '';
                if (next !== current.trim()) {
                    try { await options.onSave(next); } catch (err) {
                        const msg = err instanceof Error ? err.message : String(err);
                        new Notice(`Update failed: ${msg}`);
                    }
                }
            };

            input.addEventListener('blur', () => { void commit(); });
            input.addEventListener('keydown', (e: KeyboardEvent) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    input.blur();
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    committed = true;
                    input.remove();
                    display.show();
                }
            });

            input.focus();
            if (typeof (input as HTMLInputElement).select === 'function') {
                (input as HTMLInputElement).select();
            }
        };

        display.addEventListener('click', swapToEditor);
        display.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                swapToEditor();
            }
        });
    };

    const renderLayoutPictograms = (
        parent: HTMLElement,
        rows: LayoutPictogramRows,
        activeSceneMode?: ManuscriptSceneHeadingMode,
    ): void => {
        const pictoCol = parent.createDiv({ cls: 'ert-layout-visual-pictograms' });

        // Primary row: scene (optional, left) + body spread (right)
        const primaryRow = pictoCol.createDiv({ cls: 'ert-layout-picto-row' });
        if (rows.scene) renderLayoutSpread(primaryRow, rows.scene);
        renderLayoutSpread(primaryRow, rows.body);

        // Special row: Part, Chapter, Scene mode variants
        // When spreads have sceneMode, highlight the active one and dim the rest
        const hasSceneModes = rows.special.some(s => s.sceneMode);
        if (rows.special.length > 0) {
            const specialRow = pictoCol.createDiv({ cls: 'ert-layout-picto-row' });
            for (const spread of rows.special) {
                const spreadEl = renderLayoutSpread(specialRow, spread);
                if (hasSceneModes && spread.sceneMode && activeSceneMode) {
                    if (spread.sceneMode === activeSceneMode) {
                        spreadEl.addClass('is-scene-active');
                    } else {
                        spreadEl.addClass('is-scene-dimmed');
                    }
                }
            }
        }
    };

    type LayoutVisualOptions = {
        layoutId?: string;
        description?: string;
        editableDescription?: { onSave: (next: string) => Promise<void> | void };
    };
    const buildLayoutVisual = (
        container: HTMLElement,
        variant: FictionLayoutVariant,
        options: LayoutVisualOptions = {}
    ): void => {
        const visual = container.createDiv({ cls: 'ert-layout-visual' });
        const cols = visual.createDiv({ cls: 'ert-layout-visual-cols' });

        const features = getLayoutFeatures(variant);
        const featureCol = renderLayoutFeatureList(cols, features);

        // Description row: appended below feature rows, separated by a subtle rule.
        // Read-only for bundled templates; click-to-edit for duplicated templates.
        if (options.description || options.editableDescription) {
            featureCol.createDiv({ cls: 'ert-layout-feature-divider' });
            const descRow = featureCol.createDiv({ cls: 'ert-layout-feature-description' });
            if (options.editableDescription) {
                renderInlineEditable(descRow, options.description || '', {
                    placeholder: 'Describe this layout…',
                    multiline: true,
                    onSave: options.editableDescription.onSave,
                    displayClass: 'ert-layout-feature-description-display',
                    inputClass: 'ert-layout-feature-description-input'
                });
            } else {
                descRow.textContent = options.description || '';
            }
        }

        // Resolve the active scene heading mode for this layout (Signature only)
        const activeSceneMode = options.layoutId
            ? (getLayoutOptionsForActiveBook(options.layoutId).sceneHeadingMode || 'scene-number-title')
            : undefined;

        const rows = getLayoutPictogramRows(variant);
        renderLayoutPictograms(cols, rows, activeSceneMode);
    };

    /**
     * Rename a non-bundled (duplicated/legacy-custom) layout, auto-renaming its .tex file
     * in the Pandoc folder so filename tracks display name. Collisions are avoided by
     * appending `-2`, `-3`, etc. Fails quietly if the file cannot be moved.
     */
    const renameLayoutAndFile = async (layout: PandocLayoutTemplate, nextName: string): Promise<void> => {
        const trimmed = nextName.trim();
        if (!trimmed || trimmed === layout.name) {
            layout.name = trimmed || layout.name;
            await plugin.saveSettings();
            return;
        }
        layout.name = trimmed;

        const ext = '.tex';
        const stem = slugifyToFileStem(trimmed).toLowerCase().replace(/-/g, '_') || 'layout';
        const pandocFolder = getConfiguredPandocFolder(plugin);
        const currentStored = compactTemplatePathForStorage(plugin, layout.path);

        const makeStored = (filename: string): string => compactTemplatePathForStorage(plugin, filename);
        const vaultPathFor = (filename: string): string => normalizePath(`${pandocFolder}/${filename}`);

        let candidate = `rt_${stem}${ext}`;
        let candidateStored = makeStored(candidate);
        let index = 2;
        while (
            candidateStored !== currentStored &&
            plugin.app.vault.getAbstractFileByPath(vaultPathFor(candidate))
        ) {
            candidate = `rt_${stem}-${index}${ext}`;
            candidateStored = makeStored(candidate);
            index += 1;
        }

        if (candidateStored !== currentStored) {
            try {
                await maybeRenameTemplateFileForPathChange(plugin, layout.path, candidateStored);
                layout.path = candidateStored;
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                new Notice(`Could not rename template file: ${message}`);
            }
        }

        await plugin.saveSettings();
    };

    const getLayoutInstalledState = (layout: PandocLayoutTemplate): boolean => {
        if (layout.bundled) return isBundledPandocLayoutInstalled(plugin, layout);
        return validatePandocLayout(plugin, layout).valid;
    };
    type LayoutSpecialCapabilities = {
        usesModernClassicStructure: boolean;
        hasEpigraphs: boolean;
        hasSceneOpenerHeadingOptions: boolean;
    };
    const getLayoutSpecialCapabilities = (layout: PandocLayoutTemplate): LayoutSpecialCapabilities => {
        const profile = layoutProfilesById.get(layout.id);
        if (profile) {
            const capabilityKeys = new Set(profile.capabilities.map(capability => capability.key));
            const usesModernClassicStructure = capabilityKeys.has('modernClassicStructure');
            const hasEpigraphs = capabilityKeys.has('actEpigraphs') || usesModernClassicStructure;
            const hasSceneOpenerHeadingOptions = capabilityKeys.has('sceneHeadingMode');
            return { usesModernClassicStructure, hasEpigraphs, hasSceneOpenerHeadingOptions };
        }
        const usesModernClassicStructure = layout.usesModernClassicStructure === true;
        const hasEpigraphs = layout.hasEpigraphs === true || usesModernClassicStructure;
        const variant = getFictionVariant(layout);
        const hasSceneOpenerHeadingOptions = layout.hasSceneOpenerHeadingOptions === true || variant === 'signature';
        return { usesModernClassicStructure, hasEpigraphs, hasSceneOpenerHeadingOptions };
    };
    const hasLayoutSpecialOptions = (layout: PandocLayoutTemplate): boolean => {
        const caps = getLayoutSpecialCapabilities(layout);
        return caps.usesModernClassicStructure || caps.hasEpigraphs || caps.hasSceneOpenerHeadingOptions;
    };
    const toRomanNumeral = (value: number): string => {
        if (!Number.isFinite(value) || value <= 0) return '';
        const table: Array<[number, string]> = [
            [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
            [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
            [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
        ];
        let remainder = Math.floor(value);
        let output = '';
        for (const [numeric, roman] of table) {
            while (remainder >= numeric) {
                output += roman;
                remainder -= numeric;
            }
        }
        return output;
    };
    const getActCount = (): number => {
        const parsed = Math.floor(Number(plugin.settings.actCount ?? 3));
        return Number.isFinite(parsed) && parsed > 0 ? parsed : 3;
    };
    const getActiveBookReference = (): BookProfile | null => {
        const active = getActiveBook(plugin.settings);
        if (!active) return null;
        const index = (plugin.settings.books || []).findIndex(book => book.id === active.id);
        if (index < 0) return null;
        return plugin.settings.books[index];
    };
    const normalizeLayoutOptionList = (values: unknown): string[] => {
        if (!Array.isArray(values)) return [];
        return values.map(value => (typeof value === 'string' ? value : ''));
    };
    const getLayoutOptionsForActiveBook = (layoutId: string): BookLayoutOptions => {
        const activeBook = getActiveBookReference();
        if (!activeBook) return {};
        const scoped = activeBook.layoutOptions?.[layoutId];
        if (!scoped) return {};
        const sceneHeadingMode = scoped.sceneHeadingMode === 'scene-number'
            || scoped.sceneHeadingMode === 'scene-number-title'
            || scoped.sceneHeadingMode === 'title-only'
            ? scoped.sceneHeadingMode
            : undefined;
        return {
            actEpigraphs: normalizeLayoutOptionList(scoped.actEpigraphs),
            actEpigraphAttributions: normalizeLayoutOptionList(scoped.actEpigraphAttributions),
            ...(sceneHeadingMode ? { sceneHeadingMode } : {})
        };
    };
    const saveLayoutOptionsForActiveBook = async (layoutId: string, next: BookLayoutOptions): Promise<void> => {
        const activeBook = getActiveBookReference();
        if (!activeBook) return;
        if (!activeBook.layoutOptions) activeBook.layoutOptions = {};
        const trimTrailingEmpty = (values: string[]): string[] => {
            const normalized = values.map(value => value.trim());
            let lastNonEmptyIndex = -1;
            for (let i = 0; i < normalized.length; i++) {
                if (normalized[i].length > 0) lastNonEmptyIndex = i;
            }
            if (lastNonEmptyIndex < 0) return [];
            return normalized.slice(0, lastNonEmptyIndex + 1);
        };
        const hasEpigraphText = (next.actEpigraphs || []).some(value => value.trim().length > 0);
        const hasAttributionText = (next.actEpigraphAttributions || []).some(value => value.trim().length > 0);
        const sceneHeadingMode = next.sceneHeadingMode === 'scene-number'
            || next.sceneHeadingMode === 'scene-number-title'
            || next.sceneHeadingMode === 'title-only'
            ? next.sceneHeadingMode
            : undefined;
        const hasSceneHeadingModeOverride = !!sceneHeadingMode && sceneHeadingMode !== 'scene-number-title';
        if (!hasEpigraphText && !hasAttributionText && !hasSceneHeadingModeOverride) {
            delete activeBook.layoutOptions[layoutId];
            if (Object.keys(activeBook.layoutOptions).length === 0) {
                delete activeBook.layoutOptions;
            }
        } else {
            const trimmedEpigraphs = trimTrailingEmpty(next.actEpigraphs || []);
            const trimmedAttributions = trimTrailingEmpty(next.actEpigraphAttributions || []);
            activeBook.layoutOptions[layoutId] = {
                ...(trimmedEpigraphs.length > 0 ? { actEpigraphs: trimmedEpigraphs } : {}),
                ...(trimmedAttributions.length > 0 ? { actEpigraphAttributions: trimmedAttributions } : {}),
                ...(hasSceneHeadingModeOverride ? { sceneHeadingMode } : {})
            };
        }
        await plugin.saveSettings();
    };

    const layoutRowsContainer = layoutPanel.createDiv({ cls: 'ert-layout-rows' });
    let expandedSpecialLayoutId: string | null = null;

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
            tier: 'pro',
            templateKind: 'custom',
            // Seed the copy with the parent's visible description so bundled and duplicate
            // render the same text. Bundled resolves via profile.summary; the copy has no
            // profile match, so we capture the resolved text into layout.description.
            description: buildLayoutDescription(layout),
            bundled: false,
            ...(layout.usesModernClassicStructure === true ? { usesModernClassicStructure: true } : {}),
            ...(layout.hasEpigraphs === true ? { hasEpigraphs: true } : {}),
            ...(layout.hasSceneOpenerHeadingOptions === true ? { hasSceneOpenerHeadingOptions: true } : {})
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

    const getVisibleBundledLayouts = (): PandocLayoutTemplate[] => {
        return getBundledPandocLayouts().filter(layout => {
            if (layout.preset === 'novel') return true;
            if (layout.preset === 'screenplay') return SHOW_SCREENPLAY_LAYOUT_CATEGORY;
            if (layout.preset === 'podcast') return SHOW_PODCAST_LAYOUT_CATEGORY;
            return false;
        });
    };

    const getVisibleBundledInstallSummary = (): { total: number; installed: number } => {
        const bundledLayouts = getVisibleBundledLayouts();
        const installed = bundledLayouts.filter(layout => isBundledPandocLayoutInstalled(plugin, layout)).length;
        return { total: bundledLayouts.length, installed };
    };

    const getImportedLayoutTraits = (layout: PandocLayoutTemplate): string[] => {
        const traits = layout.importDetection?.traits
            ?.map(trait => trait.trim())
            .filter(trait => trait.length > 0)
            .slice(0, 4);
        if (traits && traits.length > 0) return traits;

        if (layout.importDetection?.styleHint === 'chaptered') return ['Chapter-based structure', 'Book-style typography'];
        if (layout.importDetection?.styleHint === 'literary') return ['Refined chapter styling', 'Book-style typography'];
        if (layout.importDetection?.styleHint === 'book') return ['Book-style page structure', 'Running headers detected'];
        if (layout.importDetection?.styleHint === 'manuscript') return ['Minimal manuscript formatting', 'Wide page spacing'];
        return ['Custom formatting'];
    };

    const getImportedLayoutTraitLabel = (trait: string): string => {
        const normalized = trait.toLowerCase();
        if (normalized.includes('header')) return 'Headers';
        if (normalized.includes('chapter') || normalized.includes('structure') || normalized.includes('part')) return 'Structure';
        if (normalized.includes('typography') || normalized.includes('font')) return 'Font';
        if (normalized.includes('metadata') || normalized.includes('front-page')) return 'Metadata';
        if (normalized.includes('spacing')) return 'Spacing';
        if (normalized.includes('dialogue') || normalized.includes('scene')) return 'Scenes';
        return 'Format';
    };

    const getImportedLayoutPreviewKind = (layout: PandocLayoutTemplate): 'manuscript' | 'book' | 'literary' | 'chaptered' | 'generic' => {
        return layout.importDetection?.mockPreviewKind || 'generic';
    };

    const renderImportedLayoutMockPreview = (
        container: HTMLElement,
        kind: 'manuscript' | 'book' | 'literary' | 'chaptered' | 'generic',
    ): void => {
        const page = container.createDiv({ cls: `ert-import-template-mock-page ert-import-template-mock-page--${kind}` });
        if (kind === 'book' || kind === 'chaptered') {
            page.createDiv({ cls: 'ert-import-template-mock-header-line' });
        }

        page.createDiv({
            cls: 'ert-import-template-mock-kicker',
            text: kind === 'chaptered'
                ? 'Chapter opener'
                : kind === 'literary'
                    ? 'Literary layout'
                    : kind === 'manuscript'
                        ? 'Submission format'
                        : kind === 'book'
                            ? 'Book layout'
                            : 'Custom layout',
        });

        page.createDiv({
            cls: `ert-import-template-mock-title ert-import-template-mock-title--${kind}`,
            text: kind === 'chaptered'
                ? 'Chapter One'
                : kind === 'literary'
                    ? 'Winter Light'
                    : kind === 'manuscript'
                        ? 'Manuscript Page'
                        : kind === 'book'
                            ? 'Book Page'
                            : 'Template Preview',
        });

        if (kind === 'literary') {
            page.createDiv({ cls: 'ert-import-template-mock-subtitle', text: 'A quiet opening line' });
        }

        const lines = page.createDiv({ cls: 'ert-import-template-mock-lines' });
        ['', ' is-mid', '', ' is-short', '', ''].forEach((suffix) => {
            lines.createDiv({ cls: `ert-import-template-mock-line${suffix}`.trim() });
        });
    };

    const renderImportedLayoutSummary = (container: HTMLElement, layout: PandocLayoutTemplate): void => {
        const shell = container.createDiv({ cls: 'ert-layout-imported' });
        const copy = shell.createDiv({ cls: 'ert-layout-imported-copy' });

        getImportedLayoutTraits(layout).forEach((trait) => {
            const traitRow = copy.createDiv({ cls: 'ert-layout-imported-row' });
            traitRow.createDiv({ cls: 'ert-layout-imported-label', text: getImportedLayoutTraitLabel(trait) });
            traitRow.createDiv({
                cls: 'ert-layout-imported-value',
                text: trait,
            });
        });

        copy.createDiv({
            cls: 'ert-layout-imported-description',
            text: buildLayoutDescription(layout),
        });

        const preview = shell.createDiv({ cls: 'ert-layout-imported-preview' });
        renderImportedLayoutMockPreview(preview, getImportedLayoutPreviewKind(layout));
    };

    /** Render category groups with layout rows. */
    const renderLayoutRows = () => {
        layoutRowsContainer.empty();

        const layouts = getVisibleLayouts();
        const publishingModel = adaptPandocLayoutsToPublishingModel(layouts);
        layoutProfilesById = new Map(publishingModel.profiles.map(profile => [profile.legacyLayoutId, profile]));
        if (expandedSpecialLayoutId && !layouts.some(layout => layout.id === expandedSpecialLayoutId)) {
            expandedSpecialLayoutId = null;
        }

        if (layouts.length === 0) {
            const emptyEl = layoutRowsContainer.createDiv({ cls: 'ert-layout-row setting-item' });
            emptyEl.createSpan({ text: 'No layouts configured yet.', cls: 'setting-item-description' });
            return;
        }

        const fictionVariantOrder: Record<FictionLayoutVariant, number> = {
            classic: 1,
            contemporary: 2,
            signature: 3,
            modernClassic: 4,
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
            const isImported = layout.origin === 'imported';
            const installed = getLayoutInstalledState(layout);
            const tier = getPandocLayoutTier(layout);
            const isProLayout = tier === 'pro';
            const specialCapabilities = getLayoutSpecialCapabilities(layout);
            const showsSpecialOptions = hasLayoutSpecialOptions(layout);
            const expanded = expandedSpecialLayoutId === layout.id;
            if (expanded) row.addClass('is-special-expanded');
            row.toggleClass(ERT_CLASSES.SKIN_PRO, isProLayout);
            row.toggleClass('ert-layout-row--pro', isProLayout);
            if (isProLayout) {
                row.addClass(ERT_CLASSES.ELEMENT_BLOCK);
            }
            if (isProLayout && !isActive) {
                row.addClass('ert-pro-locked');
            }

            const variant = getFictionVariant(layout);
            const useVisual = layout.preset === 'novel' && variant !== 'generic';

            const isEditableLayout = !isBundled && !isImported;

            const s = addProRow(new Setting(row))
                .setName('')
                .setDesc('');
            s.settingEl.addClass('ert-layout-row-setting');
            s.descEl?.addClass('ert-layout-row-desc');

            // Build the title (inline-editable for duplicated layouts, static for bundled)
            if (s.nameEl) {
                s.nameEl.empty();
                s.nameEl.addClass('ert-layout-row-name');
                const displayName = getLayoutDisplayName(layout);
                if (isEditableLayout) {
                    const titleHost = s.nameEl.createSpan({ cls: 'ert-layout-row-title' });
                    renderInlineEditable(titleHost, displayName, {
                        placeholder: 'Layout name',
                        onSave: async (nextName) => {
                            if (!nextName) {
                                new Notice('Layout name is required.');
                                return;
                            }
                            await renameLayoutAndFile(layout, nextName);
                            renderLayoutRows();
                            refreshPublishingStatusCard();
                        },
                        fallbackText: displayName,
                        displayClass: 'ert-layout-row-title-display',
                        inputClass: 'ert-layout-row-title-input'
                    });
                } else {
                    s.nameEl.createSpan({ cls: 'ert-layout-row-title', text: displayName });
                }
                const pill = s.nameEl.createSpan({
                    cls: `ert-layout-status-pill ${installed ? 'is-installed' : 'is-not-installed'}`,
                    text: installed ? 'Installed' : 'Not installed'
                });
                pill.setAttr('aria-label', installed ? 'Installed' : 'Not installed');
                const tierPill = s.nameEl.createSpan({
                    cls: `ert-badgePill ert-badgePill--sm ${isProLayout ? ERT_CLASSES.BADGE_PILL_PRO : ERT_CLASSES.BADGE_PILL_NEUTRAL}`,
                });
                tierPill.createSpan({
                    cls: 'ert-badgePill__text',
                    text: isProLayout ? 'Pro' : 'Core',
                });
            }

            if (useVisual && s.descEl) {
                buildLayoutVisual(s.descEl, variant, {
                    layoutId: layout.id,
                    description: buildLayoutDescription(layout),
                    editableDescription: isEditableLayout
                        ? {
                            onSave: async (nextDescription) => {
                                const trimmed = nextDescription.trim();
                                if (trimmed) {
                                    layout.description = trimmed;
                                } else {
                                    delete layout.description;
                                }
                                await plugin.saveSettings();
                            }
                        }
                        : undefined
                });
            } else if (isImported && s.descEl) {
                renderImportedLayoutSummary(s.descEl, layout);
            } else {
                s.setDesc(buildLayoutDescription(layout));
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

            if (showsSpecialOptions) {
                s.addExtraButton(btn => {
                    btn.extraSettingsEl.addClass('ert-iconBtn', 'ert-layout-special-toggle');
                    btn.setIcon(expanded ? 'minus' : 'plus');
                    btn.setTooltip(expanded ? 'Hide special features' : 'Show special features');
                    btn.onClick(() => {
                        expandedSpecialLayoutId = expandedSpecialLayoutId === layout.id ? null : layout.id;
                        renderLayoutRows();
                    });
                });
            }

            if (isBundled) {
                s.addExtraButton(btn => {
                    btn.extraSettingsEl.addClass('ert-iconBtn', 'ert-layout-duplicate');
                    btn.setIcon('copy-plus');
                    btn.setTooltip('Duplicate');
                    btn.onClick(async () => {
                        await duplicateBundledLayout(layout);
                        renderLayoutRows();
                        refreshPublishingStatusCard();
                    });
                });
            }

            if (!isBundled) {
                s.addExtraButton(btn => {
                    if (isImported) {
                        btn.extraSettingsEl.addClass('ert-iconBtn', 'ert-layout-imported-trash');
                    }
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

            if (showsSpecialOptions && expanded) {
                const panel = row.createDiv({ cls: 'ert-layout-special-panel' });
                panel.createDiv({ cls: 'ert-layout-special-divider' });

                // Parts = Acts: determined by Act count in settings.
                // Epigraphs are optional quotes printed after each PART page.
                if (specialCapabilities.hasEpigraphs) {
                    const epigraphTitle = panel.createDiv({ cls: 'ert-layout-special-title', text: 'Act epigraphs (optional)' });
                    epigraphTitle.setAttr('role', 'heading');
                    panel.createDiv({ cls: 'ert-layout-special-helper', text: 'Printed after PART pages.' });

                    const activeBook = getActiveBookReference();
                    if (!activeBook) {
                        panel.createDiv({ cls: 'ert-layout-special-empty', text: 'Select an active book to edit layout-specific options.' });
                    } else {
                        const actCount = getActCount();
                        const scopedOptions = getLayoutOptionsForActiveBook(layout.id);
                        const actEpigraphs = scopedOptions.actEpigraphs || [];
                        const actEpigraphAttributions = scopedOptions.actEpigraphAttributions || [];
                        const rows = panel.createDiv({ cls: 'ert-layout-epigraph-rows' });

                        for (let actIndex = 0; actIndex < actCount; actIndex++) {
                            const epigraphRow = rows.createDiv({ cls: 'ert-layout-epigraph-row' });
                            epigraphRow.createDiv({
                                cls: 'ert-layout-epigraph-act',
                                text: `Act ${toRomanNumeral(actIndex + 1) || String(actIndex + 1)}`
                            });

                            const fields = epigraphRow.createDiv({ cls: 'ert-layout-epigraph-fields' });

                            const quoteLabel = fields.createDiv({ cls: 'ert-layout-epigraph-label', text: 'Quote' });
                            quoteLabel.setAttr('role', 'note');
                            const quoteInput = fields.createEl('textarea', {
                                cls: 'ert-input ert-layout-epigraph-quote',
                                attr: { rows: '2' }
                            });
                            quoteInput.value = actEpigraphs[actIndex] || '';
                            plugin.registerDomEvent(quoteInput, 'change', () => {
                                const nextQuotes = [...(getLayoutOptionsForActiveBook(layout.id).actEpigraphs || [])];
                                const nextAttributions = [...(getLayoutOptionsForActiveBook(layout.id).actEpigraphAttributions || [])];
                                nextQuotes[actIndex] = quoteInput.value;
                                void saveLayoutOptionsForActiveBook(layout.id, {
                                    actEpigraphs: nextQuotes,
                                    actEpigraphAttributions: nextAttributions
                                });
                            });

                            const attributionLabel = fields.createDiv({ cls: 'ert-layout-epigraph-label', text: 'Attribution' });
                            attributionLabel.setAttr('role', 'note');
                            const attributionInput = fields.createEl('input', {
                                type: 'text',
                                cls: 'ert-input ert-layout-epigraph-attribution'
                            });
                            attributionInput.value = actEpigraphAttributions[actIndex] || '';
                            plugin.registerDomEvent(attributionInput, 'change', () => {
                                const nextQuotes = [...(getLayoutOptionsForActiveBook(layout.id).actEpigraphs || [])];
                                const nextAttributions = [...(getLayoutOptionsForActiveBook(layout.id).actEpigraphAttributions || [])];
                                nextAttributions[actIndex] = attributionInput.value;
                                void saveLayoutOptionsForActiveBook(layout.id, {
                                    actEpigraphs: nextQuotes,
                                    actEpigraphAttributions: nextAttributions
                                });
                            });
                        }
                    }
                }

                // Scenes = scene notes. Scene opener heading mode controls how
                // each scene's dedicated opener page renders its heading.
                if (specialCapabilities.hasSceneOpenerHeadingOptions) {
                    const headingPanel = panel.createDiv({ cls: 'ert-layout-special-mode' });
                    const headingTitle = headingPanel.createDiv({ cls: 'ert-layout-special-title', text: 'Opener scene heading' });
                    headingTitle.setAttr('role', 'heading');
                    const modeRow = headingPanel.createDiv({ cls: 'ert-layout-special-mode-row' });
                    modeRow.createDiv({ cls: 'ert-layout-epigraph-label', text: 'Style' });
                    const modeSelect = modeRow.createEl('select', { cls: 'ert-input ert-input--xl ert-layout-special-mode-select' });

                    const options: Array<{ value: ManuscriptSceneHeadingMode; label: string }> = [
                        { value: 'scene-number', label: 'Scene number only' },
                        { value: 'scene-number-title', label: 'Scene number + title (title in parentheses)' },
                        { value: 'title-only', label: 'Title only' }
                    ];
                    options.forEach(option => {
                        modeSelect.createEl('option', { value: option.value, text: option.label });
                    });

                    const activeMode = getLayoutOptionsForActiveBook(layout.id).sceneHeadingMode || 'scene-number-title';
                    modeSelect.value = activeMode;
                    plugin.registerDomEvent(modeSelect, 'change', () => {
                        const scoped = getLayoutOptionsForActiveBook(layout.id);
                        const nextMode = modeSelect.value as ManuscriptSceneHeadingMode;
                        void saveLayoutOptionsForActiveBook(layout.id, {
                            actEpigraphs: scoped.actEpigraphs,
                            actEpigraphAttributions: scoped.actEpigraphAttributions,
                            sceneHeadingMode: nextMode
                        });
                        // Re-render so pictogram highlight updates to match
                        renderLayoutRows();
                    });
                }
            }
        };

        const rows = layoutRowsContainer.createDiv({ cls: 'ert-layout-category-rows' });
        fictionLayouts.forEach(layout => renderLayoutRow(rows, layout));
    };

    renderLayoutRows();

    const commitImportedTemplate = async (commit: ImportedTemplateCommit): Promise<void> => {
        const existing = plugin.settings.pandocLayouts || [];
        const nextLayout = {
            ...commit.layout,
            draft: commit.draft,
            origin: 'imported' as const,
            tier: 'pro' as const,
            templateKind: 'custom' as const,
            importDetection: {
                styleHint: commit.candidate.detectedTemplate.styleHint,
                mockPreviewKind: commit.candidate.detectedTemplate.mockPreviewKind,
                traits: commit.candidate.detectedTemplate.traits.slice(0, 5),
                confidence: commit.candidate.detectedTemplate.confidence,
            },
        };
        const currentIndex = existing.findIndex(layout => layout.id === nextLayout.id);
        if (currentIndex >= 0) {
            existing[currentIndex] = nextLayout;
        } else {
            existing.push(nextLayout);
        }
        plugin.settings.pandocLayouts = existing;
        await plugin.saveSettings();
        new Notice(commit.activate
            ? `Activated template '${nextLayout.name}'.`
            : `Saved draft template '${nextLayout.name}'.`);
        renderLayoutRows();
        refreshPublishingStatusCard();
    };

    const layoutManageSetting = addProRow(new Setting(layoutPanel));
    let installAllButtonEl: HTMLButtonElement | null = null;
    const refreshInstallAllButtonState = (): void => {
        if (!installAllButtonEl) return;
        const { installed } = getVisibleBundledInstallSummary();
        installAllButtonEl.toggleClass('ert-layout-install-all-button--muted', installed > 0);
    };
    layoutManageSetting.addButton(button => {
        button.setButtonText('Import Template');
        button.buttonEl.addClass(ERT_CLASSES.PILL_BTN, ERT_CLASSES.PILL_BTN_PRO);
        if (!isActive) {
            button.buttonEl.addClass('ert-pro-locked');
            button.setTooltip('Importing custom templates requires Pro.');
        }
        button.onClick(() => {
            if (!isActive) {
                new Notice('Importing custom templates requires Pro.');
                return;
            }
            new ImportTemplateModal(app, plugin, commitImportedTemplate).open();
        });
    });
    layoutManageSetting.addButton(button => {
        button.setButtonText('Install all');
        installAllButtonEl = button.buttonEl;
        installAllButtonEl.addClass('ert-layout-install-all-button');
        refreshInstallAllButtonState();
        button.onClick(async () => {
            const bundledLayouts = getVisibleBundledLayouts();
            const bundledIds = bundledLayouts.map(layout => layout.id);
            const result = await installBundledPandocLayouts(plugin, bundledIds);
            const refreshResults = await Promise.all(bundledLayouts.map(layout => ensureBundledLayoutInstalledForExport(plugin, layout)));
            const refreshFailures = refreshResults.filter(item => item.failed).length;
            if (refreshFailures > 0) {
                new Notice('Some bundled layouts failed to refresh.');
            } else if (result.installed.length > 0) {
                new Notice(`Installed ${result.installed.length} bundled layout template(s) in ${getConfiguredPandocFolder(plugin)}/.`);
            } else if (result.failed.length > 0) {
                new Notice('Some bundled layouts failed to install.');
            } else {
                new Notice('Bundled layouts are installed and refreshed.');
            }
            renderLayoutRows();
            refreshPublishingStatusCard();
            refreshInstallAllButtonState();
        });
    });

    const includeScriptExamples = false;
    let setupInFlight = false;
    let setupButtonComponent: ButtonComponent | null = null;
    let exportOptionsButtonComponent: ButtonComponent | null = null;
    const setSetupButtonState = (busy: boolean) => {
        if (!setupButtonComponent) return;
        setupButtonComponent.setDisabled(busy);
        setupButtonComponent.setButtonText(busy ? AUTO_CONFIGURE_BUSY : AUTO_CONFIGURE_BUTTON);
        if (exportOptionsButtonComponent) {
            exportOptionsButtonComponent.setDisabled(busy);
        }
    };
    const runAutoConfigurePublishing = async () => {
        if (setupInFlight) return;
        setupInFlight = true;
        setSetupButtonState(true);
        try {
            // ── Phase 1: Environment (paths, folders, templates) ─────────
            const envResult = await ensurePublishingEnvironment(plugin);

            // Update Pandoc path input if it was auto-filled
            if (envResult.pandocFound && pandocPathInputEl) {
                pandocPathInputEl.value = plugin.settings.pandocPath || '';
            }

            // Refresh status cards after environment changes
            refreshPublishingStatusCard();

            // Show environment issues as partial-success guidance
            const blockingIssues = envResult.issues.filter(i => i.startsWith('Pandoc not found'));
            if (blockingIssues.length > 0) {
                // Pandoc missing — cannot proceed with full setup
                new Notice(blockingIssues[0]);
                revealSystemConfig();
                return;
            }

            // Non-blocking issues (e.g. LaTeX missing) — show but continue
            const warnings = envResult.issues.filter(i => !i.startsWith('Pandoc not found'));
            if (warnings.length > 0) {
                new Notice(warnings.join('\n'));
            }

            // ── Phase 2: Starter publishing setup ─────────────────────────
            const confirmed = await confirmStarterPublishingSetup(plugin.app, includeScriptExamples);
            if (!confirmed) return;
            const created = await generateSampleTemplates(plugin, includeScriptExamples);
            const scriptTargetLabel = `${resolveManuscriptOutputFolder(plugin)}/Templates`;
            const sourceFolder = getActiveBookExportContext(plugin).sourceFolder.trim();
            const matterTargetLabel = sourceFolder || scriptTargetLabel;
            if (created.length > 0) {
                new Notice(`Publishing configured. Created ${created.length} starter setup files. Book details + pages → ${matterTargetLabel}, PDF styles → ${getConfiguredPandocFolder(plugin)}/.`);
            } else {
                new Notice(STARTER_PUBLISHING_SETUP_ALREADY_EXISTS);
            }
            renderLayoutRows();
            rerender();
        } catch (e) {
            const msg = (e as Error).message || String(e);
            new Notice(`Error configuring publishing: ${msg}`);
        } finally {
            setupInFlight = false;
            setSetupButtonState(false);
        }
    };

    let matterPreviewFrame: HTMLElement | null = null;
    let activeBookMetaEditField: EditableBookMetaFieldKey | null = null;
    let activeBookMetaDraft = '';
    let activeBookMetaEditSourcePath: string | null = null;
    let activeBookMetaPreviewOverride: BookMeta | null = null;
    let activeBookMetaEditBusy = false;
    const expandedBookMetaSections = new Set<string>();
    const bookMetaPreviewPanel = pandocPanel.createDiv({
        cls: ERT_CLASSES.STACK,
        attr: { [ERT_DATA.SECTION]: 'book-details' }
    });
    bookMetaPreviewPanel.style.order = '10';
    const previewFrame = bookMetaPreviewPanel.createDiv({ cls: `${ERT_CLASSES.PREVIEW_FRAME} ert-previewFrame--center ert-previewFrame--flush` });
    const previewBody = previewFrame.createDiv({ cls: 'ert-bookmeta-preview-body' });
    const renderBookMetaPreview = () => {
        previewBody.empty();
        const activeBookMetaStatus = getActiveBookMetaStatus(plugin);
        const meta = activeBookMetaPreviewOverride ?? activeBookMetaStatus.bookMeta ?? null;
        const sourcePath = (activeBookMetaEditSourcePath || meta?.sourcePath || activeBookMetaStatus.path || '').trim();
        const hasSourcePath = sourcePath.length > 0;
        const openOrCreateBookMetaNote = async () => {
            if (hasSourcePath) {
                void plugin.app.workspace.openLinkText(sourcePath, '', false);
                return;
            }
            const created = await createBookMetaOnly(plugin);
            if (created.created && created.path) {
                void plugin.app.workspace.openLinkText(created.path, '', false);
            } else {
                new Notice(created.reason || 'Book Details note was not created.');
            }
            rerender();
        };

        const ensureBookMetaNoteForEditing = async (): Promise<string | null> => {
            if (hasSourcePath) return sourcePath;
            const created = await createBookMetaOnly(plugin);
            if (created.path) {
                activeBookMetaEditSourcePath = created.path;
                return created.path;
            }
            new Notice(created.reason || 'Book Details note was not created.');
            return null;
        };

        const beginBookMetaFieldEdit = async (
            field: EditableBookMetaFieldKey,
            currentValue: string | number | null | undefined
        ) => {
            if (activeBookMetaEditBusy) return;
            const editPath = await ensureBookMetaNoteForEditing();
            if (!editPath) return;
            activeBookMetaEditField = field;
            activeBookMetaDraft = currentValue === undefined || currentValue === null ? '' : String(currentValue);
            renderBookMetaPreview();
        };

        const cancelBookMetaFieldEdit = () => {
            activeBookMetaEditField = null;
            activeBookMetaDraft = '';
            renderBookMetaPreview();
        };

        const applyBookMetaEditToPreview = (
            currentMeta: BookMeta | null,
            field: EditableBookMetaFieldKey,
            normalizedValue: string | number | null,
            nextSourcePath: string
        ): BookMeta => {
            const nextMeta: BookMeta = {
                ...(currentMeta || {}),
                sourcePath: nextSourcePath,
            };

            const assignString = (
                target: Record<string, unknown>,
                key: string,
                value: string | number | null
            ): void => {
                if (typeof value === 'string' && value.trim()) target[key] = value;
                else if (typeof value === 'number') target[key] = value;
                else delete target[key];
            };

            if (field === 'title') {
                if (typeof normalizedValue === 'string') nextMeta.title = normalizedValue;
                else delete nextMeta.title;
                return nextMeta;
            }

            if (field === 'subtitle') {
                if (typeof normalizedValue === 'string') nextMeta.subtitle = normalizedValue;
                else delete nextMeta.subtitle;
                return nextMeta;
            }

            if (field === 'author') {
                if (typeof normalizedValue === 'string') nextMeta.author = normalizedValue;
                else delete nextMeta.author;
                return nextMeta;
            }

            if (field === 'copyright-holder') {
                const rights = { ...(nextMeta.rights || {}) };
                if (typeof normalizedValue === 'string') rights.copyright_holder = normalizedValue;
                else delete rights.copyright_holder;
                nextMeta.rights = Object.keys(rights).length > 0 ? rights : undefined;
                return nextMeta;
            }

            if (field === 'rights-year') {
                const rights = { ...(nextMeta.rights || {}) };
                if (typeof normalizedValue === 'number') rights.year = normalizedValue;
                else delete rights.year;
                nextMeta.rights = Object.keys(rights).length > 0 ? rights : undefined;
                return nextMeta;
            }

            if (field === 'isbn') {
                const identifiers = { ...(nextMeta.identifiers || {}) };
                if (typeof normalizedValue === 'string') identifiers.isbn_paperback = normalizedValue;
                else delete identifiers.isbn_paperback;
                nextMeta.identifiers = Object.keys(identifiers).length > 0 ? identifiers : undefined;
                return nextMeta;
            }

            if (field === 'publisher' || field === 'imprint' || field === 'edition') {
                const publisher = { ...(nextMeta.publisher || {}) };
                const key = field === 'publisher' ? 'name' : field;
                assignString(publisher, key, normalizedValue);
                nextMeta.publisher = Object.keys(publisher).length > 0 ? publisher : undefined;
                return nextMeta;
            }

            if (
                field === 'title-page-note'
                || field === 'dedication'
                || field === 'epigraph-quote'
                || field === 'epigraph-attribution'
            ) {
                const frontmatter = { ...(nextMeta.frontmatter || {}) };
                const key = field === 'title-page-note'
                    ? 'title_page_note'
                    : field === 'epigraph-quote'
                        ? 'epigraph_quote'
                        : field === 'epigraph-attribution'
                            ? 'epigraph_attribution'
                            : 'dedication';
                assignString(frontmatter, key, normalizedValue);
                nextMeta.frontmatter = Object.keys(frontmatter).length > 0 ? frontmatter : undefined;
                return nextMeta;
            }

            const backmatter = { ...(nextMeta.backmatter || {}) };
            const key = field === 'about-author'
                ? 'about_author'
                : field === 'author-note'
                    ? 'author_note'
                    : field === 'other-works'
                        ? 'other_works'
                        : 'acknowledgments';
            assignString(backmatter, key, normalizedValue);
            nextMeta.backmatter = Object.keys(backmatter).length > 0 ? backmatter : undefined;
            return nextMeta;
        };

        const saveBookMetaFieldEdit = async (
            field: EditableBookMetaFieldKey,
            mode: 'enter' | 'blur'
        ) => {
            if (activeBookMetaEditBusy) return;
            const editPath = sourcePath || activeBookMetaEditSourcePath || '';
            const file = plugin.app.vault.getAbstractFileByPath(editPath);
            if (!(file instanceof TFile)) {
                new Notice('Book Details note could not be found.');
                cancelBookMetaFieldEdit();
                return;
            }

            activeBookMetaEditBusy = true;
            const result = await updateBookMetaField(plugin.app, file, field, activeBookMetaDraft);
            activeBookMetaEditBusy = false;

            if (!result.ok) {
                new Notice(result.error || 'Book Details could not be updated.');
                if (mode === 'enter') {
                    renderBookMetaPreview();
                    return;
                }
                cancelBookMetaFieldEdit();
                return;
            }

            activeBookMetaEditField = null;
            activeBookMetaDraft = '';
            activeBookMetaEditSourcePath = file.path;
            activeBookMetaPreviewOverride = applyBookMetaEditToPreview(meta, field, result.normalizedValue, file.path);
            renderBookMetaPreview();
        };

        const normalizeValue = (value?: string | number | null): string | null => {
            if (value === undefined || value === null) return null;
            const normalized = String(value).trim();
            return normalized.length > 0 ? normalized : null;
        };

        const renderBookMetaValue = (
            target: HTMLElement,
            field: EditableBookMetaFieldKey,
            label: string,
            value: string | number | null | undefined,
            placeholder: string,
            required: boolean,
            className: 'ert-bookmeta-primary-value' | 'ert-bookmeta-detail-value'
        ) => {
            if (activeBookMetaEditField === field) {
                const multilineFields = new Set<EditableBookMetaFieldKey>([
                    'title-page-note',
                    'dedication',
                    'epigraph-quote',
                    'acknowledgments',
                    'about-author',
                    'author-note',
                    'other-works',
                ]);
                const input = multilineFields.has(field)
                    ? target.createEl('textarea', {
                        cls: `${className} ert-bookmeta-inline-input ert-bookmeta-inline-input--textarea`,
                        attr: {
                            rows: '3',
                            'aria-label': label,
                        }
                    })
                    : target.createEl('input', {
                        cls: `${className} ert-bookmeta-inline-input ${className === 'ert-bookmeta-primary-value' ? 'ert-bookmeta-inline-input--primary' : 'ert-bookmeta-inline-input--detail'}`,
                        attr: {
                            type: 'text',
                            'aria-label': label,
                        }
                    });
                input.value = activeBookMetaDraft;
                window.setTimeout(() => {
                    input.focus();
                    input.select();
                }, 0);
                let handled = false;
                input.addEventListener('input', () => {
                    activeBookMetaDraft = input.value;
                });
                input.addEventListener('keydown', (evt: KeyboardEvent) => {
                    if (evt.key === 'Enter') {
                        evt.preventDefault();
                        handled = true;
                        activeBookMetaDraft = input.value;
                        void saveBookMetaFieldEdit(field, 'enter');
                    } else if (evt.key === 'Escape') {
                        evt.preventDefault();
                        handled = true;
                        cancelBookMetaFieldEdit();
                    }
                });
                input.addEventListener('blur', () => {
                    if (handled) return;
                    handled = true;
                    activeBookMetaDraft = input.value;
                    void saveBookMetaFieldEdit(field, 'blur');
                });
                return input;
            }

            const normalized = normalizeValue(value);
            const missing = !normalized;
            const valueEl = target.createDiv({
                cls: `${className} ert-bookmeta-preview-value--clickable${missing ? ' ert-bookmeta-preview-value--empty ert-bookmeta-preview-value--missing' : ''}`,
                text: normalized || placeholder,
                attr: {
                    role: 'button',
                    tabindex: '0',
                    'aria-label': `${normalized ? 'Edit' : 'Add'} ${label.toLowerCase()}`,
                    title: `${normalized ? 'Edit' : 'Add'} ${label.toLowerCase()}`
                }
            });

            valueEl.classList.toggle('ert-bookmeta-preview-value--required', missing && required);
            valueEl.classList.toggle('ert-bookmeta-preview-value--optional', missing && !required);
            valueEl.addEventListener('click', (evt) => {
                evt.preventDefault();
                void beginBookMetaFieldEdit(field, normalized || value);
            });
            valueEl.addEventListener('keydown', (evt: KeyboardEvent) => {
                if (evt.key !== 'Enter' && evt.key !== ' ') return;
                evt.preventDefault();
                void beginBookMetaFieldEdit(field, normalized || value);
            });
            return valueEl;
        };

        const renderPageIntent = (
            target: HTMLElement,
            kind: 'title' | 'dedication' | 'epigraph' | 'copyright' | 'prose' | 'list',
            caption: string
        ): void => {
            const page = target.createDiv({ cls: `ert-bookmeta-intent-page ert-bookmeta-intent-page--${kind}` });
            page.createDiv({ cls: 'ert-bookmeta-intent-block ert-bookmeta-intent-block--primary' });
            if (kind === 'title' || kind === 'epigraph') {
                page.createDiv({ cls: 'ert-bookmeta-intent-block ert-bookmeta-intent-block--secondary' });
            }
            if (kind === 'prose' || kind === 'list') {
                const lines = page.createDiv({ cls: 'ert-bookmeta-intent-lines' });
                for (let index = 0; index < (kind === 'list' ? 4 : 5); index++) {
                    lines.createDiv({ cls: `ert-bookmeta-intent-line${index === 3 ? ' is-short' : ''}` });
                }
            }
            target.createDiv({ cls: 'ert-bookmeta-intent-caption', text: caption });
        };

        const titleCard = previewBody.createDiv({ cls: 'ert-bookmeta-title-card' });
        titleCard.createDiv({ cls: 'ert-planetary-preview-heading', text: 'Book Details' });

        const primary = previewBody.createDiv({ cls: 'ert-bookmeta-primary' });
        const addPrimaryField = (
            label: string,
            fieldKey: EditableBookMetaFieldKey,
            value: string | number | null | undefined,
            placeholder: string,
            required = true
        ) => {
            const field = primary.createDiv({ cls: 'ert-bookmeta-primary-field' });
            renderBookMetaValue(
                field,
                fieldKey,
                label,
                value,
                placeholder,
                required,
                'ert-bookmeta-primary-value'
            );
            field.createDiv({ cls: 'ert-bookmeta-primary-label', text: label });
        };
        addPrimaryField('Title', 'title', meta?.title, 'Add title');
        addPrimaryField('Subtitle', 'subtitle', meta?.subtitle, 'Add subtitle', false);
        addPrimaryField('Author', 'author', meta?.author, 'Add author');

        const details = previewBody.createDiv({ cls: 'ert-bookmeta-detail-grid' });
        const leftCol = details.createDiv({ cls: 'ert-bookmeta-detail-col ert-bookmeta-detail-col--left' });
        const rightCol = details.createDiv({ cls: 'ert-bookmeta-detail-col ert-bookmeta-detail-col--right' });
        const addDetailField = (
            target: HTMLElement,
            label: string,
            value: string | number | null | undefined,
            placeholder: string,
            required: boolean
        ) => {
            const field = target.createDiv({ cls: 'ert-bookmeta-detail-field' });
            const fieldKey: EditableBookMetaFieldKey =
                label === 'Copyright holder'
                    ? 'copyright-holder'
                    : label === 'ISBN'
                        ? 'isbn'
                        : label === 'Rights year'
                            ? 'rights-year'
                            : label === 'Imprint'
                                ? 'imprint'
                                : label === 'Edition'
                                    ? 'edition'
                                    : 'publisher';
            renderBookMetaValue(field, fieldKey, label, value, placeholder, required, 'ert-bookmeta-detail-value');
            field.createDiv({ cls: 'ert-bookmeta-detail-label', text: label });
        };
        addDetailField(leftCol, 'Copyright holder', meta?.rights?.copyright_holder, 'Add copyright', true);
        addDetailField(leftCol, 'ISBN', meta?.identifiers?.isbn_paperback, 'Add ISBN (optional)', false);
        addDetailField(leftCol, 'Imprint', meta?.publisher?.imprint, 'Add imprint', false);
        addDetailField(rightCol, 'Rights year', meta?.rights?.year, 'Add year', true);
        addDetailField(rightCol, 'Publisher', meta?.publisher?.name, 'Add publisher', false);
        addDetailField(rightCol, 'Edition', meta?.publisher?.edition, 'Add edition', false);

        type MatterBookMetaField = {
            field: EditableBookMetaFieldKey;
            label: string;
            value: string | undefined;
            placeholder: string;
            kind: 'title' | 'dedication' | 'epigraph' | 'copyright' | 'prose' | 'list';
            caption: string;
        };

        const renderMatterBookMetaSection = (
            key: string,
            title: string,
            description: string,
            fields: MatterBookMetaField[]
        ): void => {
            const detailsEl = previewBody.createEl('details', { cls: 'ert-bookmeta-matter-fold' });
            detailsEl.open = expandedBookMetaSections.has(key);
            detailsEl.addEventListener('toggle', () => {
                if (detailsEl.open) expandedBookMetaSections.add(key);
                else expandedBookMetaSections.delete(key);
            });
            const summary = detailsEl.createEl('summary', { cls: 'ert-bookmeta-matter-summary' });
            const copy = summary.createDiv({ cls: 'ert-bookmeta-matter-summary-copy' });
            copy.createDiv({ cls: 'ert-bookmeta-matter-summary-title', text: title });
            copy.createDiv({ cls: 'ert-bookmeta-matter-summary-desc', text: description });
            const count = fields.filter(field => normalizeValue(field.value)).length;
            summary.createDiv({ cls: 'ert-bookmeta-matter-summary-count', text: `${count} filled` });

            const list = detailsEl.createDiv({ cls: 'ert-bookmeta-matter-list' });
            fields.forEach(fieldDef => {
                const row = list.createDiv({ cls: 'ert-bookmeta-matter-row' });
                const textCol = row.createDiv({ cls: 'ert-bookmeta-matter-field' });
                renderBookMetaValue(
                    textCol,
                    fieldDef.field,
                    fieldDef.label,
                    fieldDef.value,
                    fieldDef.placeholder,
                    false,
                    'ert-bookmeta-detail-value'
                );
                textCol.createDiv({ cls: 'ert-bookmeta-detail-label', text: fieldDef.label });
                const intent = row.createDiv({ cls: 'ert-bookmeta-intent' });
                renderPageIntent(intent, fieldDef.kind, fieldDef.caption);
            });
        };

        renderMatterBookMetaSection('frontmatter', 'Frontmatter', 'Optional pages that appear before the manuscript body.', [
            {
                field: 'title-page-note',
                label: 'Title page note',
                value: meta?.frontmatter?.title_page_note,
                placeholder: 'Add title page note',
                kind: 'title',
                caption: 'Centered title page',
            },
            {
                field: 'dedication',
                label: 'Dedication',
                value: meta?.frontmatter?.dedication,
                placeholder: 'Add dedication',
                kind: 'dedication',
                caption: 'Centered one-third down',
            },
            {
                field: 'epigraph-quote',
                label: 'Epigraph quote',
                value: meta?.frontmatter?.epigraph_quote,
                placeholder: 'Add quote',
                kind: 'epigraph',
                caption: 'Centered quote block',
            },
            {
                field: 'epigraph-attribution',
                label: 'Epigraph attribution',
                value: meta?.frontmatter?.epigraph_attribution,
                placeholder: 'Add attribution',
                kind: 'epigraph',
                caption: 'Right-aligned attribution',
            },
        ]);

        renderMatterBookMetaSection('backmatter', 'Backmatter', 'Optional prose pages after the manuscript body.', [
            {
                field: 'acknowledgments',
                label: 'Acknowledgments',
                value: meta?.backmatter?.acknowledgments,
                placeholder: 'Add acknowledgments',
                kind: 'prose',
                caption: 'Heading + prose',
            },
            {
                field: 'about-author',
                label: 'About the author',
                value: meta?.backmatter?.about_author,
                placeholder: 'Add author bio',
                kind: 'prose',
                caption: 'Bio paragraph',
            },
            {
                field: 'author-note',
                label: 'Author note',
                value: meta?.backmatter?.author_note,
                placeholder: 'Add author note',
                kind: 'prose',
                caption: 'Heading + prose',
            },
            {
                field: 'other-works',
                label: 'Other works',
                value: meta?.backmatter?.other_works,
                placeholder: 'Add other works',
                kind: 'list',
                caption: 'Heading + list',
            },
        ]);

        if (hasSourcePath) {
            const previewActions = previewBody.createDiv({ cls: 'ert-bookmeta-preview-actions' });
            const infoIcon = previewActions.createSpan({ cls: 'ert-bookmeta-preview-actions-icon' });
            infoIcon.setAttr('aria-hidden', 'true');
            setIcon(infoIcon, 'info');
            previewActions.createSpan({ cls: 'ert-bookmeta-preview-actions-text', text: 'Click any field to edit.' });
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

        if (!meta) {
            const actions = previewBody.createDiv({ cls: 'ert-bookmeta-preview-empty-actions' });
            new ButtonComponent(actions)
                .setButtonText('Create Book Details')
                .setCta()
                .onClick(async () => {
                    await openOrCreateBookMetaNote();
                });
            new ButtonComponent(actions)
                .setButtonText('Jump to Book Pages')
                .onClick(() => {
                    matterPreviewFrame?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                });
        }
    };
    renderBookMetaPreview();

    // ── Publishing Setup ────────────────────────────────────────────────────
    const publishingSetupPanel = pandocPanel.createDiv({
        cls: ERT_CLASSES.STACK,
        attr: { [ERT_DATA.SECTION]: 'book-pages' }
    });
    publishingSetupPanel.style.order = '20';
    const publishingHeading = addProRow(new Setting(publishingSetupPanel))
        .setName('Book Pages')
        .setDesc('Review the pages before and after the manuscript.')
        .setHeading();
    addHeadingIcon(publishingHeading, 'book-open-text');
    applyErtHeaderLayout(publishingHeading);

    const buildStatusColumn = (
        iconName: string,
        title: string,
        value: string,
        desc: string,
        statusKey: 'needs-setup' | 'attention' | 'blocked' | 'ready',
        onClick?: () => void
    ): void => {
        const col = statusGrid.createDiv({ cls: `ert-publishing-status-col ert-publishing-status-col--${statusKey}` });
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
        const glyph = col.createDiv({ cls: 'ert-publishing-status-col-glyph' });
        glyph.setAttr('aria-hidden', 'true');
        setIcon(glyph, iconName);

        const header = col.createDiv({ cls: 'ert-publishing-status-col-header' });
        const icon = header.createSpan({ cls: 'ert-publishing-status-col-icon' });
        icon.setAttr('aria-hidden', 'true');
        setIcon(icon, iconName);
        header.createSpan({ cls: 'ert-publishing-status-col-title', text: title });
        col.createDiv({ cls: 'ert-publishing-status-col-value', text: value });
        col.createDiv({ cls: 'ert-publishing-status-col-desc', text: desc });
    };

    const renderPublishingStripActions = (stages: ReturnType<typeof buildPublishingProgressStages>) => {
        setupActionRow.empty();
        setupButtonComponent = null;
        exportOptionsButtonComponent = null;

        const exportStage = stages.find(stage => stage.id === 'export-check');
        const showExportButton = !!exportStage && exportStage.statusKey !== 'needs-setup';
        const exportPrimary = exportStage?.statusKey === 'ready';
        const allReady = stages.every(stage => stage.statusKey === 'ready');

        // Auto configure — rendered first (left position)
        setupButtonComponent = new ButtonComponent(setupActionRow)
            .setButtonText(AUTO_CONFIGURE_BUTTON)
            .onClick(() => {
                void runAutoConfigurePublishing();
            });
        if (allReady) {
            // Nothing left to configure — mute the button
            setupButtonComponent.buttonEl.addClass('ert-pillBtn', 'ert-pillBtn--muted');
        } else if (!showExportButton || !exportPrimary) {
            setupButtonComponent.setCta();
            setupButtonComponent.buttonEl.addClass('ert-pillBtn');
        } else {
            setupButtonComponent.buttonEl.addClass('ert-pillBtn');
        }

        if (setupInFlight) {
            setSetupButtonState(true);
        }

        // Export now — rendered second (right position)
        if (showExportButton) {
            exportOptionsButtonComponent = new ButtonComponent(setupActionRow)
                .setButtonText('Export now')
                .onClick(() => {
                    plugin.openManuscriptExportModal();
                });
            if (exportPrimary) {
                exportOptionsButtonComponent.setCta();
            }
            exportOptionsButtonComponent.buttonEl.addClass('ert-pillBtn');
            exportOptionsButtonComponent.buttonEl.empty();
            exportOptionsButtonComponent.buttonEl.createSpan({
                cls: ERT_CLASSES.PILL_BTN_LABEL,
                text: 'Export now'
            });
            const exportIcon = exportOptionsButtonComponent.buttonEl.createSpan({ cls: ERT_CLASSES.PILL_BTN_ICON });
            setIcon(exportIcon, 'arrow-right');
        }
    };

    const renderPublishingStatusCard = () => {
        statusGrid.empty();
        const progress = getPublishingProgressContext(plugin);
        const stages = buildPublishingProgressStages({
            hasBookMeta: !!progress.activeBookMetaStatus.bookMeta,
            bookMetaSummary: progress.bookMetaSummary,
            matterSummary: progress.matterSummary,
            matterCount: progress.matterCount,
            layoutSummary: progress.layoutSummary,
            pandocPathValid: progress.pandocPathValid
        });

        const targetByStage: Record<PublishingStageId, HTMLElement | null> = {
            'book-details': bookMetaPreviewPanel,
            'book-pages': publishingSetupPanel,
            'pdf-style': layoutPanel,
            'export-check': systemConfigPanel
        };
        const iconByStage: Record<PublishingStageId, string> = {
            'book-details': 'file-text',
            'book-pages': 'book-open-text',
            'pdf-style': 'book-open',
            'export-check': 'check-circle-2'
        };

        stages.forEach((stage) => {
            buildStatusColumn(
                iconByStage[stage.id],
                stage.title,
                stage.statusLabel,
                stage.detail,
                stage.statusKey,
                () => {
                    if (stage.id === 'export-check' && systemConfigPanel.hasClass('is-hidden')) {
                        revealSystemConfig();
                    } else {
                        targetByStage[stage.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }
            );
        });

        renderPublishingStripActions(stages);
    };
    refreshPublishingStatusCard = renderPublishingStatusCard;

    matterPreviewFrame = publishingSetupPanel.createDiv({ cls: `${ERT_CLASSES.PREVIEW_FRAME} ert-previewFrame--flush` });
    const matterPreviewHeader = matterPreviewFrame.createDiv({ cls: 'ert-previewFrame__header' });
    matterPreviewHeader.createDiv({ cls: 'ert-planetary-preview-heading ert-previewFrame__title', text: 'Book Pages preview' });
    const matterPreviewBody = matterPreviewFrame.createDiv({ cls: 'ert-matter-preview-body' });
    const formatRoleLabel = (role: string): string => role.replace(/[_-]+/g, ' ').trim();
    const renderMatterPreview = async () => {
        matterPreviewBody.empty();
        try {
            const activeBookMetaStatus = getActiveBookMetaStatus(plugin);
            const validationSnapshot = getPublishingValidationSnapshot(plugin);
            const bookMetaAvailable = !!activeBookMetaStatus.bookMeta;
            const preview = await getMatterPreviewSummary(plugin);
            if (preview.front.length === 0 && preview.back.length === 0) {
                const empty = matterPreviewBody.createDiv({ cls: 'ert-matter-preview-empty' });
                empty.createDiv({ cls: 'ert-matter-preview-empty-title', text: 'No Book Pages found yet' });
                empty.createDiv({
                    cls: 'ert-matter-preview-empty-desc',
                    text: 'Create Book Details first, then add the pages you need.'
                });
                const actions = empty.createDiv({ cls: 'ert-matter-preview-empty-actions' });
                new ButtonComponent(actions)
                    .setButtonText('Jump to Publishing Setup')
                    .onClick(() => {
                        publishingStagesPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    });
                new ButtonComponent(actions)
                    .setButtonText('Jump to Book Details')
                    .onClick(() => {
                        bookMetaPreviewPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    });
                return;
            }

            const allItems = [...preview.front, ...preview.back];
            const descriptors = allItems.map(item => {
                const issueCodes = validationSnapshot.matterIssues
                    .filter(issue => issue.field === item.role || issue.field === item.file.path)
                    .map(issue => issue.code);
                return {
                    item,
                    descriptor: describeMatterReadiness({
                        role: item.role,
                        usesBookMeta: item.usesBookMeta,
                        bookMetaAvailable,
                        issueCodes
                    })
                };
            });
            const overallDescriptor = descriptors.reduce((winner, entry) => {
                const rank: Record<string, number> = {
                    Ready: 0,
                    'Uses page content': 1,
                    'Excluded by layout': 2,
                    'Needs repair': 3,
                    'Needs metadata': 4
                };
                return rank[entry.descriptor.label] > rank[winner.label] ? entry.descriptor : winner;
            }, descriptors[0].descriptor);
            const statusRow = matterPreviewBody.createDiv({ cls: `ert-bookmeta-status is-${overallDescriptor.tone === 'error' ? 'missing' : overallDescriptor.tone === 'warning' ? 'warning' : 'found'}` });
            const statusIcon = statusRow.createSpan({ cls: 'ert-bookmeta-status-icon' });
            setIcon(statusIcon, overallDescriptor.tone === 'error' ? 'alert-circle' : overallDescriptor.tone === 'warning' ? 'alert-triangle' : 'check-circle-2');
            statusRow.createSpan({ text: `${overallDescriptor.label}: ${overallDescriptor.detail}` });

            const list = matterPreviewBody.createDiv({ cls: 'ert-matter-preview-list' });
            let rowIndex = 0;
            const renderMatterRows = (items: MatterPreviewItem[]) => {
                items.forEach(item => {
                    const issueCodes = validationSnapshot.matterIssues
                        .filter(issue => issue.field === item.role || issue.field === item.file.path)
                        .map(issue => issue.code);
                    const readiness = describeMatterReadiness({
                        role: item.role,
                        usesBookMeta: item.usesBookMeta,
                        bookMetaAvailable,
                        issueCodes
                    });
                    const row = list.createDiv({ cls: 'ert-matter-preview-row' });
                    row.toggleClass('is-alt', rowIndex % 2 === 1);
                    rowIndex += 1;
                    const titleLink = row.createEl('a', {
                        cls: 'ert-matter-preview-link',
                        text: item.file.basename,
                        attr: { href: '#', title: item.file.path }
                    });
                    titleLink.addEventListener('click', (evt: MouseEvent) => {
                        evt.preventDefault();
                        void plugin.app.workspace.openLinkText(item.file.path, '', false);
                    });

                    const badges = row.createDiv({ cls: 'ert-matter-preview-badges' });
                    badges.createSpan({ cls: `ert-matter-preview-badge ert-matter-preview-badge--${item.modeTone}`, text: item.modeLabel });
                    const readinessBadge = badges.createSpan({ cls: 'ert-matter-preview-badge ert-matter-preview-badge--state', text: readiness.label });
                    readinessBadge.setAttr('title', readiness.detail);
                    const role = (item.role || '').trim();
                    if (role) {
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

    renderPublishingStatusCard();

    // ── System Configuration visibility: show when pandoc path is invalid ──
    if (!isConfiguredPandocPathValid(plugin)) {
        systemConfigPanel.removeClass('is-hidden');
    }

    // ── "Advanced configuration" disclosure toggle ─────────────────────────
    const advancedToggle = pandocPanel.createDiv({ cls: 'ert-advanced-config-toggle' });
    advancedToggle.style.order = '49';
    const advancedLink = advancedToggle.createEl('a', {
        cls: 'ert-advanced-config-link',
        text: 'Advanced configuration',
        attr: { href: '#' }
    });
    const advancedIcon = advancedToggle.createSpan({ cls: 'ert-advanced-config-icon' });
    setIcon(advancedIcon, 'chevron-right');
    advancedToggle.prepend(advancedIcon);
    // Hide toggle if system config is already visible
    if (!systemConfigPanel.hasClass('is-hidden')) {
        advancedToggle.addClass('is-hidden');
    }
    advancedLink.addEventListener('click', (evt: MouseEvent) => {
        evt.preventDefault();
        advancedToggle.addClass('is-hidden');
        revealSystemConfig();
    });

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
                const proceed = await confirmWithErtModal(plugin.app, {
                    title: 'Repair matter metadata',
                    message: `This will update frontmatter on ${targetCount} note${targetCount === 1 ? '' : 's'} in the active book. Note bodies and filenames are not changed.`,
                    confirmText: 'Repair now',
                    cancelText: 'Cancel',
                    badge: { text: 'Repair', icon: 'wrench' }
                });
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
