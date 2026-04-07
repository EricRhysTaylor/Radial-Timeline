import { App, TFile, TFolder, getFrontMatterInfo, normalizePath, parseYaml, stringifyYaml } from 'obsidian';
import { formatLogTimestamp, resolveAiLogFolder, resolveAvailableLogPath } from '../ai/log';

const GOSSAMER_LOG_FOLDER_NAME = 'Gossamer';
const GOSSAMER_CONTENT_LOG_FOLDER_NAME = 'Content Logs';

function sanitizeSegment(value: string | null | undefined): string {
    if (!value) return '';
    return value
        .replace(/[<>:"/\\|?*]+/g, '-')
        .replace(/\s+/g, ' ')
        .replace(/-+/g, '-')
        .trim()
        .replace(/^-+|-+$/g, '');
}

function resolveLogRoot(logRoot?: string): string {
    const fallback = resolveAiLogFolder();
    return normalizePath((logRoot || fallback).trim() || fallback);
}

async function ensureFolder(app: App, folderPath: string): Promise<TFolder | null> {
    const normalized = normalizePath(folderPath);
    const existing = app.vault.getAbstractFileByPath(normalized);
    if (existing && !(existing instanceof TFolder)) {
        return null;
    }
    try {
        await app.vault.createFolder(normalized);
    } catch {
        // Folder may already exist.
    }
    const folder = app.vault.getAbstractFileByPath(normalized);
    return folder instanceof TFolder ? folder : null;
}

async function readFrontmatterFromFile(app: App, file: TFile): Promise<Record<string, unknown> | null> {
    const content = await app.vault.read(file);
    const info = getFrontMatterInfo(content);
    if (!info?.exists || !info.frontmatter) return null;
    const parsed = parseYaml(info.frontmatter);
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
}

function humanizeOperation(operation: string): string {
    return operation
        .replace(/^gossamer-/, '')
        .split(/[-_]+/)
        .filter(Boolean)
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(' ') || 'Archive';
}

function formatMeta(meta: Record<string, unknown> | undefined): string[] {
    if (!meta) return [];
    return Object.entries(meta)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => `- ${key}: ${String(value)}`);
}

export function resolveGossamerLogFolder(logRoot?: string): string {
    return normalizePath(`${resolveLogRoot(logRoot)}/${GOSSAMER_LOG_FOLDER_NAME}`);
}

export function resolveGossamerContentLogFolder(logRoot?: string): string {
    return normalizePath(`${resolveGossamerLogFolder(logRoot)}/${GOSSAMER_CONTENT_LOG_FOLDER_NAME}`);
}

export async function ensureGossamerLogFolder(app: App, logRoot?: string): Promise<TFolder | null> {
    return ensureFolder(app, resolveGossamerLogFolder(logRoot));
}

export async function ensureGossamerContentLogFolder(app: App, logRoot?: string): Promise<TFolder | null> {
    return ensureFolder(app, resolveGossamerContentLogFolder(logRoot));
}

export async function archiveGossamerFrontmatterFields(
    app: App,
    files: TFile[],
    options: {
        operation: string;
        logRoot?: string;
        selectFields: (frontmatter: Record<string, unknown>, file: TFile) => Record<string, unknown>;
        meta?: Record<string, unknown>;
    }
): Promise<string | null> {
    const uniqueFiles = [...new Map(files.map((file) => [file.path, file])).values()];
    const entries: Array<{ path: string; basename: string; fields: Record<string, unknown> }> = [];

    for (const file of uniqueFiles) {
        try {
            const frontmatter = await readFrontmatterFromFile(app, file);
            if (!frontmatter) continue;
            const selected = options.selectFields(frontmatter, file);
            if (Object.keys(selected).length === 0) continue;
            entries.push({
                path: file.path,
                basename: file.basename,
                fields: selected
            });
        } catch {
            continue;
        }
    }

    if (entries.length === 0) return null;

    const folder = await ensureGossamerLogFolder(app, options.logRoot);
    if (!folder) return null;

    const now = new Date();
    const readableTimestamp = formatLogTimestamp(now);
    const operationLabel = humanizeOperation(options.operation);
    const title = `Gossamer Archive — ${operationLabel} ${readableTimestamp}`;
    const baseName = `Gossamer Archive — ${sanitizeSegment(operationLabel)} ${sanitizeSegment(readableTimestamp)}`;

    const lines: string[] = [
        `# ${title}`,
        '',
        `- Created: ${now.toISOString()}`,
        `- Operation: ${operationLabel}`,
        `- Files: ${entries.length}`,
        ...formatMeta(options.meta),
        '',
        '## Archived fields'
    ];

    for (const entry of entries) {
        lines.push('');
        lines.push(`### ${entry.basename}`);
        lines.push(`- Path: \`${entry.path}\``);
        lines.push('```yaml');
        lines.push(stringifyYaml(entry.fields).trim());
        lines.push('```');
    }

    const filePath = resolveAvailableLogPath(app.vault, resolveGossamerLogFolder(options.logRoot), baseName);
    await app.vault.create(filePath, lines.join('\n').trim());
    return filePath;
}
