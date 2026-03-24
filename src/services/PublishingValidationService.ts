import * as fs from 'fs';
import * as path from 'path';
import type RadialTimelinePlugin from '../main';
import type {
    BookMeta,
    BookProfile,
    OutputIntent,
    PandocLayoutTemplate,
    PublishingValidationSnapshot,
    TemplateProfile,
    UsageContext,
    ValidationIssue,
    ValidationSummary,
} from '../types';
import { getAutoPdfEngineSelection, resolveTemplatePath, validatePandocLayout } from '../utils/exportFormats';
import { normalizeFrontmatterKeys } from '../utils/frontmatter';
import { parseMatterMetaFromFrontmatter } from '../utils/matterMeta';
import { isPathInFolderScope } from '../utils/pathScope';
import { adaptPandocLayoutsToPublishingModel } from '../utils/publishingModel';

type ValidationScope = ValidationIssue['scope'];

interface PublishingValidationContext {
    exportType?: 'manuscript' | 'outline';
    outputFormat?: 'pdf' | 'markdown' | 'csv' | 'json';
    manuscriptPreset?: UsageContext;
    selectedLayoutId?: string;
}

const CONSTRAINED_MATTER_ROLES = new Set(['title-page', 'copyright', 'about-author']);
const FALLBACK_ONLY_MATTER_ROLES = new Set(['title-page', 'dedication', 'epigraph', 'acknowledgments', 'about-author']);

function pushIssue(
    target: ValidationIssue[],
    scope: ValidationScope,
    level: ValidationIssue['level'],
    code: string,
    message: string,
    extras: Partial<Omit<ValidationIssue, 'scope' | 'level' | 'code' | 'message'>> = {}
): void {
    target.push({
        scope,
        level,
        code,
        message,
        ...extras,
    });
}

function getIssueState(issues: ValidationIssue[]): ValidationSummary['state'] {
    if (issues.some(issue => issue.level === 'error')) return 'blocked';
    if (issues.some(issue => issue.level === 'warning')) return 'warning';
    return 'ready';
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
            year: Number.isFinite(year) ? year : undefined,
        } : undefined,
        identifiers: identifiers ? {
            isbn_paperback: (identifiers.isbn_paperback as string) || undefined,
        } : undefined,
        publisher: publisher ? {
            name: (publisher.name as string) || undefined,
        } : undefined,
        sourcePath,
    };
}

function readTemplateFile(templatePath: string): { text: string; error?: string } {
    if (!templatePath.trim()) return { text: '', error: 'No template path configured.' };
    if (!path.isAbsolute(templatePath) || !fs.existsSync(templatePath)) {
        return { text: '', error: `Template file not found: ${templatePath}` };
    }
    try {
        return { text: fs.readFileSync(templatePath, 'utf8') };
    } catch (error) {
        return {
            text: '',
            error: (error as Error)?.message || `Unable to read template: ${templatePath}`,
        };
    }
}

export class PublishingValidationService {
    constructor(private readonly plugin: RadialTimelinePlugin) {}

    summarize(issues: ValidationIssue[]): ValidationSummary {
        const errorCount = issues.filter(issue => issue.level === 'error').length;
        const warningCount = issues.filter(issue => issue.level === 'warning').length;
        return {
            state: getIssueState(issues),
            errorCount,
            warningCount,
            topMessage: issues[0]?.message,
        };
    }

    collect(bookId?: string, context: PublishingValidationContext = {}): PublishingValidationSnapshot {
        const snapshot: PublishingValidationSnapshot = {
            assetIssues: {},
            profileIssues: {},
            exportProfileIssues: {},
            activeBookMetaIssues: [],
            matterIssues: [],
            preflightIssues: [],
        };

        const layouts = Array.isArray(this.plugin.settings.pandocLayouts) ? this.plugin.settings.pandocLayouts : [];
        const { assets, profiles } = adaptPandocLayoutsToPublishingModel(layouts);
        const book = this.resolveBook(bookId);
        const sourceFolder = (book?.sourceFolder || '').trim();
        const selectedProfile = this.resolveSelectedProfile(layouts, profiles, book, context);
        const selectedLayout = selectedProfile
            ? layouts.find(layout => layout.id === selectedProfile.legacyLayoutId)
            : undefined;
        const bookMetaResolution = sourceFolder ? this.resolveBookMetaForBook(sourceFolder) : { bookMeta: null as BookMeta | null };
        const matterFiles = sourceFolder ? this.getMatterFiles(sourceFolder) : [];

        assets.forEach(asset => {
            const issues: ValidationIssue[] = [];
            const layout = layouts.find(item => item.id === asset.id.replace(/::asset$/, ''));
            if (!layout) {
                pushIssue(issues, 'asset', 'error', 'asset_layout_missing', 'Template asset is missing its source layout record.');
                snapshot.assetIssues[asset.id] = issues;
                return;
            }

            const layoutValidation = validatePandocLayout(this.plugin, layout);
            if (!layoutValidation.valid) {
                pushIssue(issues, 'asset', 'error', 'asset_invalid', layoutValidation.error || 'Template asset is invalid.', {
                    actionable: true,
                    field: 'path',
                });
            }
            if (!layout.path.trim().toLowerCase().endsWith('.tex')) {
                pushIssue(issues, 'asset', 'error', 'asset_extension_invalid', 'Template assets must use a .tex extension.', {
                    actionable: true,
                    field: 'path',
                });
            }

            const resolvedPath = resolveTemplatePath(this.plugin, layout.path);
            const templateRead = readTemplateFile(resolvedPath);
            if (templateRead.error && layoutValidation.valid) {
                pushIssue(issues, 'asset', 'error', 'asset_unreadable', templateRead.error, {
                    actionable: true,
                    field: 'path',
                });
            }
            if (templateRead.text && !/\$body\$/i.test(templateRead.text)) {
                pushIssue(issues, 'asset', 'error', 'asset_missing_body', 'Template is missing the required $body$ placeholder.', {
                    actionable: true,
                });
            }
            if (templateRead.text && /\\usepackage\s*\{fontspec\}|\\setmainfont|\\newfontface/i.test(templateRead.text)) {
                const engineSelection = getAutoPdfEngineSelection(resolvedPath);
                if (!engineSelection.path) {
                    pushIssue(
                        issues,
                        'asset',
                        'warning',
                        'asset_unicode_engine_missing',
                        'Template uses fontspec, but no XeLaTeX or LuaLaTeX engine was detected.',
                        { actionable: true }
                    );
                }
            }

            snapshot.assetIssues[asset.id] = issues;
        });

        profiles.forEach(profile => {
            const issues: ValidationIssue[] = [];
            const assetIssues = snapshot.assetIssues[profile.assetId] || [];
            const outputIntentAllowed = this.isOutputIntentAllowed(profile.outputIntent, profile.usageContexts[0]);

            if (!outputIntentAllowed) {
                pushIssue(issues, 'profile', 'error', 'profile_output_intent_invalid', 'Template profile declares an incompatible output intent.');
            }
            if (profile.status === 'invalid') {
                pushIssue(issues, 'profile', 'error', 'profile_status_invalid', 'Template profile is not ready for export.');
            }
            if (profile.capabilities.some(capability => capability.key === 'semanticMatter') && profile.usageContexts[0] !== 'novel') {
                pushIssue(issues, 'profile', 'warning', 'profile_semantic_matter_scope', 'Semantic matter support is only expected on novel profiles.');
            }
            if (profile.supportedMatterRoles.some(role => !role.trim())) {
                pushIssue(issues, 'profile', 'warning', 'profile_matter_role_blank', 'Template profile contains a blank matter role mapping.');
            }
            if (assetIssues.some(issue => issue.level === 'error')) {
                pushIssue(issues, 'profile', 'warning', 'profile_blocked_by_asset', 'Template profile depends on an invalid template asset.');
            }

            snapshot.profileIssues[profile.id] = issues;
        });

        if (bookMetaResolution.warning) {
            pushIssue(snapshot.activeBookMetaIssues, 'book-meta', 'warning', 'book_meta_ambiguous', bookMetaResolution.warning);
        }

        if (selectedProfile) {
            const missingRequired = this.collectMissingBookMetaFields(bookMetaResolution.bookMeta, selectedProfile.requiredBookMetaFields);
            missingRequired.forEach(field => {
                pushIssue(snapshot.activeBookMetaIssues, 'book-meta', 'error', 'book_meta_required_missing', `Missing required publishing metadata: ${field}.`, {
                    actionable: true,
                    field,
                });
            });

            const missingRecommended = this.collectMissingBookMetaFields(bookMetaResolution.bookMeta, selectedProfile.recommendedBookMetaFields);
            missingRecommended.forEach(field => {
                pushIssue(snapshot.activeBookMetaIssues, 'book-meta', 'warning', 'book_meta_recommended_missing', `Recommended publishing metadata is missing: ${field}.`, {
                    actionable: true,
                    field,
                });
            });
        }

        const seenRoles = new Map<string, string[]>();
        matterFiles.forEach(file => {
            const parsedMeta = parseMatterMetaFromFrontmatter(file.frontmatter);
            if (!parsedMeta) return;

            const role = (parsedMeta.role || '').trim().toLowerCase();
            if (role) {
                const paths = seenRoles.get(role) || [];
                paths.push(file.path);
                seenRoles.set(role, paths);
            }

            if (parsedMeta.usesBookMeta && !bookMetaResolution.bookMeta) {
                pushIssue(snapshot.matterIssues, 'matter', 'warning', 'matter_book_meta_missing', `Matter note "${file.path}" expects BookMeta, but no BookMeta note was found.`, {
                    actionable: true,
                    field: role || file.path,
                });
            }

            if (role && FALLBACK_ONLY_MATTER_ROLES.has(role) && parsedMeta.usesBookMeta) {
                pushIssue(snapshot.matterIssues, 'matter', 'info', 'matter_semantic_fallback', `Matter role "${role}" currently falls back to generic body rendering.`, {
                    field: role,
                });
            }

            if (role && selectedProfile && selectedProfile.supportedMatterRoles.length > 0 && !selectedProfile.supportedMatterRoles.includes(role)) {
                pushIssue(snapshot.matterIssues, 'matter', 'warning', 'matter_role_unsupported', `Matter role "${role}" is outside the selected profile's declared role set.`, {
                    field: role,
                });
            }
        });

        for (const [role, paths] of seenRoles.entries()) {
            if (CONSTRAINED_MATTER_ROLES.has(role) && paths.length > 1) {
                pushIssue(snapshot.matterIssues, 'matter', 'warning', 'matter_role_duplicate', `Multiple "${role}" matter notes found. Using filename order may be ambiguous.`, {
                    detail: paths.join('\n'),
                    field: role,
                    actionable: true,
                });
            }
        }

        if (context.exportType === 'manuscript' && context.outputFormat === 'pdf') {
            if (!selectedLayout) {
                pushIssue(snapshot.preflightIssues, 'export', 'error', 'export_layout_missing', 'Select a PDF layout before exporting.', {
                    actionable: true,
                });
            }
            if (selectedProfile && snapshot.profileIssues[selectedProfile.id]?.some(issue => issue.level === 'error')) {
                pushIssue(snapshot.preflightIssues, 'export', 'error', 'export_profile_invalid', 'Selected publishing profile is not valid for export.', {
                    actionable: true,
                });
            }
            if (selectedLayout) {
                const assetIssues = snapshot.assetIssues[`${selectedLayout.id}::asset`] || [];
                if (assetIssues.some(issue => issue.level === 'error')) {
                    pushIssue(snapshot.preflightIssues, 'export', 'error', 'export_template_invalid', 'Selected PDF template is not valid for export.', {
                        actionable: true,
                    });
                }
            }
            const pandocPath = (this.plugin.settings.pandocPath || '').trim();
            if (pandocPath && (path.isAbsolute(pandocPath) || pandocPath.includes('/')) && !fs.existsSync(pandocPath)) {
                pushIssue(snapshot.preflightIssues, 'export', 'error', 'export_pandoc_missing', 'Configured Pandoc binary could not be found.', {
                    actionable: true,
                    field: 'pandocPath',
                });
            }
            if (selectedLayout) {
                const engineSelection = getAutoPdfEngineSelection(resolveTemplatePath(this.plugin, selectedLayout.path));
                if (!engineSelection.path) {
                    pushIssue(snapshot.preflightIssues, 'export', 'warning', 'export_latex_engine_missing', 'No supported LaTeX PDF engine was detected for the selected template.', {
                        actionable: true,
                    });
                }
            }
        }

        return snapshot;
    }

    private resolveBook(bookId?: string): BookProfile | null {
        const books = Array.isArray(this.plugin.settings.books) ? this.plugin.settings.books : [];
        if (!books.length) return null;
        if (bookId) {
            return books.find(book => book.id === bookId) || null;
        }
        const activeId = this.plugin.settings.activeBookId;
        return (activeId ? books.find(book => book.id === activeId) : books[0]) || books[0] || null;
    }

    private resolveSelectedProfile(
        layouts: PandocLayoutTemplate[],
        profiles: TemplateProfile[],
        book: BookProfile | null,
        context: PublishingValidationContext
    ): TemplateProfile | undefined {
        const selectedLayoutId = context.selectedLayoutId
            || (context.manuscriptPreset && book?.lastUsedPandocLayoutByPreset?.[context.manuscriptPreset])
            || undefined;
        if (selectedLayoutId) {
            return profiles.find(profile => profile.legacyLayoutId === selectedLayoutId);
        }

        if (context.manuscriptPreset) {
            const layout = layouts.find(item => item.preset === context.manuscriptPreset);
            if (layout) return profiles.find(profile => profile.legacyLayoutId === layout.id);
        }

        return profiles[0];
    }

    private isOutputIntentAllowed(outputIntent: OutputIntent, usageContext: string): boolean {
        if (usageContext === 'screenplay') return outputIntent === 'screenplay-pdf';
        if (usageContext === 'podcast') return outputIntent === 'podcast-script';
        return outputIntent === 'print-book' || outputIntent === 'submission-manuscript';
    }

    private collectMissingBookMetaFields(bookMeta: BookMeta | null, fields: string[]): string[] {
        return fields.filter(field => {
            switch (field) {
                case 'Book.title':
                    return !(bookMeta?.title || '').trim();
                case 'Book.author':
                    return !(bookMeta?.author || '').trim();
                case 'Rights.year':
                    return !bookMeta?.rights?.year;
                case 'Rights.copyright_holder':
                    return !(bookMeta?.rights?.copyright_holder || '').trim();
                case 'Publisher.name':
                    return !(bookMeta?.publisher?.name || '').trim();
                case 'Identifiers.isbn_paperback':
                    return !(bookMeta?.identifiers?.isbn_paperback || '').trim();
                default:
                    return false;
            }
        });
    }

    private resolveBookMetaForBook(sourceFolder: string): { bookMeta: BookMeta | null; warning?: string } {
        const mappings = this.plugin.settings.enableCustomMetadataMapping
            ? this.plugin.settings.frontmatterMappings
            : undefined;

        const candidates = this.plugin.app.vault.getMarkdownFiles()
            .filter(file => isPathInFolderScope(file.path, sourceFolder))
            .map(file => {
                const cache = this.plugin.app.metadataCache.getFileCache(file);
                if (!cache?.frontmatter) return null;
                const normalized = normalizeFrontmatterKeys(cache.frontmatter as Record<string, unknown>, mappings);
                if (normalized.Class !== 'BookMeta') return null;
                return {
                    path: file.path,
                    meta: parseBookMetaFromFrontmatter(normalized, file.path),
                };
            })
            .filter((entry): entry is { path: string; meta: BookMeta } => !!entry)
            .sort((a, b) => a.path.localeCompare(b.path));

        if (candidates.length === 0) {
            return { bookMeta: this.plugin.getBookMeta() };
        }

        const current = this.plugin.getBookMeta();
        const preferred = current?.sourcePath
            ? candidates.find(candidate => candidate.path === current.sourcePath)
            : undefined;
        const selected = preferred || candidates[0];

        if (candidates.length > 1) {
            return {
                bookMeta: selected.meta,
                warning: `Multiple BookMeta notes found. Using: ${selected.path}`,
            };
        }

        return { bookMeta: selected.meta };
    }

    private getMatterFiles(sourceFolder: string): Array<{ path: string; frontmatter: Record<string, unknown> }> {
        const mappings = this.plugin.settings.enableCustomMetadataMapping
            ? this.plugin.settings.frontmatterMappings
            : undefined;

        return this.plugin.app.vault.getMarkdownFiles()
            .filter(file => isPathInFolderScope(file.path, sourceFolder))
            .map(file => {
                const cache = this.plugin.app.metadataCache.getFileCache(file);
                if (!cache?.frontmatter) return null;
                const normalized = normalizeFrontmatterKeys(cache.frontmatter as Record<string, unknown>, mappings);
                const parsed = parseMatterMetaFromFrontmatter(normalized);
                if (!parsed) return null;
                return {
                    path: file.path,
                    frontmatter: normalized,
                };
            })
            .filter((entry): entry is { path: string; frontmatter: Record<string, unknown> } => !!entry);
    }
}
