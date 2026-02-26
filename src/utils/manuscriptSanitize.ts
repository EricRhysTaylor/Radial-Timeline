import type { ManuscriptExportCleanupOptions } from '../types';

export type ManuscriptCleanupFormat = 'markdown' | 'pdf';

const MARKDOWN_CLEANUP_DEFAULTS: ManuscriptExportCleanupOptions = {
    stripComments: false,
    stripLinks: false,
    stripCallouts: false,
    stripBlockIds: false
};

const PDF_CLEANUP_DEFAULTS: ManuscriptExportCleanupOptions = {
    stripComments: true,
    stripLinks: true,
    stripCallouts: true,
    stripBlockIds: false
};

const YAML_KEY_PATTERN = /^\s*[A-Za-z0-9_"'.-]+\s*:/;
const CODE_FENCE_PATTERN = /^\s*(```|~~~)/;

function normalizeLineEndings(text: string): string {
    return text.replace(/\r\n?/g, '\n');
}

function stripYamlFrontmatterBlocks(content: string): string {
    const lines = content.split('\n');
    const output: string[] = [];
    let inCodeFence = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (CODE_FENCE_PATTERN.test(line)) {
            inCodeFence = !inCodeFence;
            output.push(line);
            continue;
        }

        if (inCodeFence || line.trim() !== '---') {
            output.push(line);
            continue;
        }

        let end = i + 1;
        while (end < lines.length && lines[end].trim() !== '---') {
            end += 1;
        }

        if (end >= lines.length) {
            output.push(line);
            continue;
        }

        const candidate = lines.slice(i + 1, end);
        const hasYamlKeys = candidate.some(candidateLine => YAML_KEY_PATTERN.test(candidateLine));
        const hasCodeFence = candidate.some(candidateLine => CODE_FENCE_PATTERN.test(candidateLine));
        if (!hasYamlKeys || hasCodeFence) {
            output.push(line);
            continue;
        }

        i = end;
        if (i + 1 < lines.length && lines[i + 1].trim() === '') {
            i += 1;
        }
    }

    return output.join('\n');
}

function stripComments(content: string): string {
    return content
        .replace(/%%[\s\S]*?%%/g, '')
        .replace(/<!--[\s\S]*?-->/g, '');
}

function extractWikilinkLabel(inner: string): string {
    const [targetRaw, aliasRaw] = inner.split('|', 2);
    const alias = aliasRaw?.trim();
    if (alias) return alias;

    const target = (targetRaw || '').trim();
    if (!target) return '';

    const hashIndex = target.lastIndexOf('#');
    const targetWithoutAnchor = hashIndex >= 0 ? target.slice(0, hashIndex) : target;
    const anchor = hashIndex >= 0 ? target.slice(hashIndex + 1) : '';
    const displaySource = anchor || targetWithoutAnchor;
    const pathParts = displaySource.split('/');
    return (pathParts[pathParts.length - 1] || displaySource).trim();
}

function stripLinks(content: string): string {
    const withoutMarkdownLinks = content.replace(/!?\[([^\]]+)\]\((?:\\.|[^)\n\\])+\)/g, (_match, label: string) => label);
    return withoutMarkdownLinks.replace(/!?\[\[([^\]]+)\]\]/g, (_match, inner: string) => extractWikilinkLabel(inner));
}

function stripCallouts(content: string): string {
    const lines = content.split('\n');
    const output: string[] = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!/^\s*>\s*\[![^\]]+\]/i.test(line)) {
            output.push(line);
            continue;
        }

        i += 1;
        while (i < lines.length && /^\s*>/.test(lines[i])) {
            i += 1;
        }
        while (i < lines.length && lines[i].trim() === '') {
            i += 1;
        }
        i -= 1;
    }

    return output.join('\n');
}

function stripBlockIds(content: string): string {
    const withoutInline = content.replace(/[ \t]+\^[A-Za-z0-9][A-Za-z0-9_-]*(?=\s*$)/gm, '');
    return withoutInline.replace(/^\^[A-Za-z0-9][A-Za-z0-9_-]*\s*$/gm, '');
}

export function getDefaultManuscriptCleanupOptions(format: ManuscriptCleanupFormat): ManuscriptExportCleanupOptions {
    return format === 'pdf'
        ? { ...PDF_CLEANUP_DEFAULTS }
        : { ...MARKDOWN_CLEANUP_DEFAULTS };
}

export function normalizeManuscriptCleanupOptions(
    options: Partial<ManuscriptExportCleanupOptions> | undefined,
    format: ManuscriptCleanupFormat
): ManuscriptExportCleanupOptions {
    const defaults = getDefaultManuscriptCleanupOptions(format);
    return {
        stripComments: options?.stripComments ?? defaults.stripComments,
        stripLinks: options?.stripLinks ?? defaults.stripLinks,
        stripCallouts: options?.stripCallouts ?? defaults.stripCallouts,
        stripBlockIds: options?.stripBlockIds ?? defaults.stripBlockIds
    };
}

export function sanitizeCompiledManuscript(
    text: string,
    opts: Partial<ManuscriptExportCleanupOptions> = {}
): string {
    let cleaned = normalizeLineEndings(text);
    cleaned = stripYamlFrontmatterBlocks(cleaned);

    if (opts.stripComments) cleaned = stripComments(cleaned);
    if (opts.stripLinks) cleaned = stripLinks(cleaned);
    if (opts.stripCallouts) cleaned = stripCallouts(cleaned);
    if (opts.stripBlockIds) cleaned = stripBlockIds(cleaned);

    return cleaned.trim();
}

