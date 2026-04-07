import { App, TAbstractFile, TFile, getFrontMatterInfo, normalizePath, parseYaml } from 'obsidian';
import { resolveLogsRoot } from '../ai/log';

export interface TrashFilesOptions {
    operation: string;
    snapshotBeforeTrash?: boolean;
}

export interface SnapshotFrontmatterFieldsOptions {
    operation: string;
    fields?: string[];
    selectFields?: (frontmatter: Record<string, unknown>, file: TFile) => Record<string, unknown>;
    meta?: Record<string, unknown>;
}

export interface SnapshotFileBeforeOverwriteOptions {
    operation: string;
    meta?: Record<string, unknown>;
}

export interface ManagedOutputOverwriteCheckOptions {
    managedMarkers?: string[];
    isManagedContent?: (content: string, file: TFile) => boolean;
}

export interface ManagedOutputWriteOptions extends ManagedOutputOverwriteCheckOptions {
    operation: string;
    managedMarker?: string;
    unmanagedOverwritePrompt?: string | ((file: TFile) => string);
    snapshotOnManagedOverwrite?: boolean;
    meta?: Record<string, unknown>;
}

export interface ManagedOutputWriteResult {
    path: string;
    created: boolean;
    overwritten: boolean;
    confirmedUnmanagedOverwrite: boolean;
    snapshotPath: string | null;
    skipped: boolean;
}

/**
 * Reads the user's Obsidian "Deleted files" preference and returns whether
 * to use the OS system trash (macOS Trash / Windows Recycle Bin) or the
 * vault-local `.trash/` folder. Falls back to `.trash/` when the setting
 * is missing or set to anything other than `'system'`.
 */
export function useSystemTrash(app: App): boolean {
    try {
        const trashOption = (app.vault as any).getConfig?.('trashOption');
        return trashOption === 'system';
    } catch {
        return false;
    }
}

function resolveArchiveLogFolder(): string {
    return resolveLogsRoot();
}

async function ensureFolder(app: App, folderPath: string): Promise<void> {
    const normalized = normalizePath(folderPath.trim());
    if (!normalized) return;

    const parts = normalized.split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
        current = current ? `${current}/${part}` : part;
        const existing = app.vault.getAbstractFileByPath(current);
        if (existing) continue;
        await app.vault.createFolder(current);
    }
}

function createSnapshotFileName(operation: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeOperation = operation.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'snapshot';
    return `${timestamp}-${safeOperation}.json`;
}

async function writeSnapshotPayload(app: App, payload: Record<string, unknown>, options: { operation: string }): Promise<string> {
    const logsFolder = resolveArchiveLogFolder();
    await ensureFolder(app, logsFolder);
    const snapshotPath = normalizePath(`${logsFolder}/${createSnapshotFileName(options.operation)}`);
    await app.vault.create(snapshotPath, JSON.stringify(payload, null, 2));
    return snapshotPath;
}

async function readFrontmatterFromFile(app: App, file: TFile): Promise<Record<string, unknown> | null> {
    const content = await app.vault.read(file);
    const info = getFrontMatterInfo(content);
    if (!info?.exists || !info.frontmatter) return null;
    const parsed = parseYaml(info.frontmatter);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
}

function selectFields(frontmatter: Record<string, unknown>, file: TFile, options: SnapshotFrontmatterFieldsOptions): Record<string, unknown> {
    if (options.selectFields) {
        return options.selectFields(frontmatter, file);
    }
    if (options.fields?.length) {
        const selected: Record<string, unknown> = {};
        for (const key of options.fields) {
            if (Object.prototype.hasOwnProperty.call(frontmatter, key)) {
                selected[key] = frontmatter[key];
            }
        }
        return selected;
    }
    return { ...frontmatter };
}

function wrapManagedContent(content: string, marker?: string): string {
    if (!marker) return content;
    if (content.includes(marker)) return content;
    return `${marker}\n${content}`;
}

async function readTextFile(app: App, file: TFile): Promise<string> {
    return app.vault.read(file);
}

export async function trashFiles(app: App, files: TFile[], options: TrashFilesOptions): Promise<{
    trashed: number;
    failed: number;
    errors: string[];
    snapshotPath: string | null;
}> {
    const uniqueFiles = [...new Map(files.map((file) => [file.path, file])).values()];
    const snapshotPath = options.snapshotBeforeTrash
        ? await snapshotFileCollection(app, uniqueFiles, {
            operation: options.operation,
            meta: { mode: 'pre-trash' }
        })
        : null;

    let trashed = 0;
    let failed = 0;
    const errors: string[] = [];

    const systemTrash = useSystemTrash(app);
    for (const file of uniqueFiles) {
        try {
            await app.vault.trash(file, systemTrash);
            trashed += 1;
        } catch (error) {
            failed += 1;
            errors.push(`${file.path}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    return { trashed, failed, errors, snapshotPath };
}

export async function snapshotFrontmatterFields(
    app: App,
    files: TFile[],
    options: SnapshotFrontmatterFieldsOptions
): Promise<string | null> {
    const uniqueFiles = [...new Map(files.map((file) => [file.path, file])).values()];
    const entries: Array<Record<string, unknown>> = [];

    for (const file of uniqueFiles) {
        try {
            const frontmatter = await readFrontmatterFromFile(app, file);
            if (!frontmatter) continue;
            const selected = selectFields(frontmatter, file, options);
            if (Object.keys(selected).length === 0) continue;
            entries.push({
                path: file.path,
                basename: file.basename,
                extension: file.extension,
                fields: selected
            });
        } catch {
            continue;
        }
    }

    if (entries.length === 0) return null;

    return writeSnapshotPayload(app, {
        version: 1,
        kind: 'frontmatter-fields',
        operation: options.operation,
        createdAt: new Date().toISOString(),
        fileCount: entries.length,
        entries,
        meta: options.meta ?? {}
    }, { operation: options.operation });
}

export async function snapshotFileBeforeOverwrite(
    app: App,
    file: TFile,
    options: SnapshotFileBeforeOverwriteOptions
): Promise<string | null> {
    const content = await readTextFile(app, file);
    return writeSnapshotPayload(app, {
        version: 1,
        kind: 'file-overwrite',
        operation: options.operation,
        createdAt: new Date().toISOString(),
        fileCount: 1,
        entries: [{
            path: file.path,
            basename: file.basename,
            extension: file.extension,
            content
        }],
        meta: options.meta ?? {}
    }, { operation: options.operation });
}

async function snapshotFileCollection(
    app: App,
    files: TFile[],
    options: SnapshotFileBeforeOverwriteOptions
): Promise<string | null> {
    const uniqueFiles = [...new Map(files.map((file) => [file.path, file])).values()];
    const entries: Array<Record<string, unknown>> = [];
    for (const file of uniqueFiles) {
        try {
            entries.push({
                path: file.path,
                basename: file.basename,
                extension: file.extension,
                content: await readTextFile(app, file)
            });
        } catch {
            continue;
        }
    }
    if (entries.length === 0) return null;
    return writeSnapshotPayload(app, {
        version: 1,
        kind: 'file-overwrite',
        operation: options.operation,
        createdAt: new Date().toISOString(),
        fileCount: entries.length,
        entries,
        meta: options.meta ?? {}
    }, { operation: options.operation });
}

export async function canOverwriteManagedOutput(
    app: App,
    file: TFile,
    options: ManagedOutputOverwriteCheckOptions = {}
): Promise<{ allowed: boolean; reason: string; content: string }> {
    const content = await readTextFile(app, file);
    const markers = (options.managedMarkers ?? []).filter(Boolean);
    if (markers.some((marker) => content.includes(marker))) {
        return { allowed: true, reason: 'managed-marker', content };
    }
    if (options.isManagedContent?.(content, file)) {
        return { allowed: true, reason: 'managed-predicate', content };
    }
    return { allowed: false, reason: 'unmanaged', content };
}

export async function writeManagedOutput(
    app: App,
    fileOrPath: TFile | string,
    content: string,
    options: ManagedOutputWriteOptions
): Promise<ManagedOutputWriteResult> {
    const path = typeof fileOrPath === 'string' ? normalizePath(fileOrPath) : fileOrPath.path;
    const existing = app.vault.getAbstractFileByPath(path);
    const finalContent = wrapManagedContent(content, options.managedMarker);

    if (existing && !(existing instanceof TFile)) {
        throw new Error(`Cannot write managed output because a folder exists at ${path}.`);
    }

    if (!(existing instanceof TFile)) {
        await app.vault.create(path, finalContent);
        return {
            path,
            created: true,
            overwritten: false,
            confirmedUnmanagedOverwrite: false,
            snapshotPath: null,
            skipped: false
        };
    }

    const overwriteCheck = await canOverwriteManagedOutput(app, existing, {
        managedMarkers: [options.managedMarker ?? '', ...(options.managedMarkers ?? [])].filter(Boolean),
        isManagedContent: options.isManagedContent
    });

    let snapshotPath: string | null = null;
    let confirmedUnmanagedOverwrite = false;
    if (!overwriteCheck.allowed) {
        const prompt = typeof options.unmanagedOverwritePrompt === 'function'
            ? options.unmanagedOverwritePrompt(existing)
            : options.unmanagedOverwritePrompt
                ?? `Overwrite existing output "${existing.path}"? Existing content will be archived to a log snapshot first.`;
        const confirmed = typeof window !== 'undefined' ? window.confirm(prompt) : false;
        if (!confirmed) {
            return {
                path,
                created: false,
                overwritten: false,
                confirmedUnmanagedOverwrite: false,
                snapshotPath: null,
                skipped: true
            };
        }
        snapshotPath = await snapshotFileBeforeOverwrite(app, existing, {
            operation: options.operation,
            meta: {
                reason: 'overwrite-unmanaged-output',
                ...(options.meta ?? {})
            }
        });
        confirmedUnmanagedOverwrite = true;
    } else if (options.snapshotOnManagedOverwrite) {
        snapshotPath = await snapshotFileBeforeOverwrite(app, existing, {
            operation: options.operation,
            meta: {
                reason: 'overwrite-managed-output',
                ...(options.meta ?? {})
            }
        });
    }

    await app.vault.modify(existing, finalContent);
    return {
        path,
        created: false,
        overwritten: true,
        confirmedUnmanagedOverwrite,
        snapshotPath,
        skipped: false
    };
}

export function isTFile(value: TAbstractFile | null): value is TFile {
    return value instanceof TFile;
}
