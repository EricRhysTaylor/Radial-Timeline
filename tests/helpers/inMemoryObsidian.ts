import { TFile, TFolder, parseYaml, stringifyYaml } from 'obsidian';

type FileRecord = {
    file: TFile;
    content: string;
};

export interface InMemoryApp {
    metadataCache: {
        getFileCache: (file: TFile) => { frontmatter?: Record<string, unknown> } | null;
    };
    vault: {
        getMarkdownFiles: () => TFile[];
        getAbstractFileByPath: (path: string) => TFile | TFolder | null;
        read: (file: TFile) => Promise<string>;
        modify: (file: TFile, content: string) => Promise<void>;
        create: (path: string, content: string) => Promise<TFile>;
        createFolder: (path: string) => Promise<void>;
    };
    fileManager: {
        processFrontMatter: (file: TFile, cb: (fm: Record<string, unknown>) => void) => Promise<void>;
    };
}

function normalizeVaultPath(path: string): string {
    return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
}

function splitFrontmatter(content: string): {
    hasFrontmatter: boolean;
    frontmatter: string;
    body: string;
} {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!match) {
        return { hasFrontmatter: false, frontmatter: '', body: content };
    }
    const body = content.slice(match[0].length);
    return {
        hasFrontmatter: true,
        frontmatter: match[1],
        body
    };
}

function buildFrontmatterDocument(frontmatter: Record<string, unknown>, body: string): string {
    const yaml = stringifyYaml(frontmatter);
    const normalizedYaml = yaml.endsWith('\n') ? yaml : `${yaml}\n`;
    const normalizedBody = body.startsWith('\n') || body.length === 0 ? body : `\n${body}`;
    return `---\n${normalizedYaml}---${normalizedBody}`;
}

function toFrontmatterObject(frontmatter: string): Record<string, unknown> {
    const parsed = parseYaml(frontmatter);
    if (!parsed || typeof parsed !== 'object') return {};
    return { ...(parsed as Record<string, unknown>) };
}

function collectParentFolders(path: string): string[] {
    const normalized = normalizeVaultPath(path);
    const segments = normalized.split('/').filter(Boolean);
    const folders: string[] = [];
    for (let idx = 0; idx < segments.length - 1; idx += 1) {
        folders.push(segments.slice(0, idx + 1).join('/'));
    }
    return folders;
}

export function createInMemoryApp(initialFiles: Record<string, string>): InMemoryApp {
    const records = new Map<string, FileRecord>();
    const folders = new Set<string>();

    const addFile = (path: string, content: string): TFile => {
        const normalized = normalizeVaultPath(path);
        const file = new TFile(normalized);
        records.set(normalized, { file, content });
        collectParentFolders(normalized).forEach(folder => folders.add(folder));
        return file;
    };

    Object.entries(initialFiles).forEach(([path, content]) => addFile(path, content));

    const app: InMemoryApp = {
        metadataCache: {
            getFileCache(file: TFile) {
                const record = records.get(normalizeVaultPath(file.path));
                if (!record) return null;
                const parsed = splitFrontmatter(record.content);
                if (!parsed.hasFrontmatter) return {};
                return {
                    frontmatter: toFrontmatterObject(parsed.frontmatter)
                };
            }
        },
        vault: {
            getMarkdownFiles(): TFile[] {
                return Array.from(records.values()).map(entry => entry.file);
            },
            getAbstractFileByPath(path: string): TFile | TFolder | null {
                const normalized = normalizeVaultPath(path);
                const record = records.get(normalized);
                if (record) return record.file;
                if (folders.has(normalized)) return new TFolder(normalized);
                return null;
            },
            async read(file: TFile): Promise<string> {
                const record = records.get(normalizeVaultPath(file.path));
                if (!record) throw new Error(`File not found: ${file.path}`);
                return record.content;
            },
            async modify(file: TFile, content: string): Promise<void> {
                const key = normalizeVaultPath(file.path);
                const record = records.get(key);
                if (!record) throw new Error(`File not found: ${file.path}`);
                record.content = content;
            },
            async create(path: string, content: string): Promise<TFile> {
                return addFile(path, content);
            },
            async createFolder(path: string): Promise<void> {
                const normalized = normalizeVaultPath(path);
                if (normalized) folders.add(normalized);
            }
        },
        fileManager: {
            async processFrontMatter(file: TFile, cb: (fm: Record<string, unknown>) => void): Promise<void> {
                const key = normalizeVaultPath(file.path);
                const record = records.get(key);
                if (!record) throw new Error(`File not found: ${file.path}`);
                const parsed = splitFrontmatter(record.content);
                const fm = parsed.hasFrontmatter ? toFrontmatterObject(parsed.frontmatter) : {};
                cb(fm);
                const body = parsed.hasFrontmatter ? parsed.body : record.content;
                record.content = buildFrontmatterDocument(fm, body);
            }
        }
    };

    return app;
}
