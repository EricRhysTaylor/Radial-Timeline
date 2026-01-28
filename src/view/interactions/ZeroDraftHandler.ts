import { App, TFile } from 'obsidian';
import { normalizeFrontmatterKeys } from '../../utils/frontmatter';
import { normalizeStatus } from '../../utils/text';

type ZeroDraftOptions = {
    app: App;
    file: TFile;
    enableZeroDraftMode?: boolean;
    sceneTitle?: string;
    onOverrideOpen: () => Promise<void>;
};

const normalizeYamlValue = (value: unknown): string | undefined => {
    if (value === null || value === undefined) return undefined;
    if (Array.isArray(value)) {
        return value.length > 0 ? String(value[0]).trim() : undefined;
    }
    if (typeof value === 'string') {
        return value.trim() || undefined;
    }
    return String(value).trim() || undefined;
};

const isStageZero = (value: string | undefined): boolean => {
    if (!value) return true;
    return value.trim().toLowerCase() === 'zero';
};

const isStatusComplete = (value: unknown): boolean => {
    const normalized = normalizeStatus(value);
    if (normalized) {
        return normalized === 'Completed';
    }
    const raw = normalizeYamlValue(value) ?? '';
    return raw.trim().toLowerCase() === 'complete';
};

export async function maybeHandleZeroDraftClick(options: ZeroDraftOptions): Promise<boolean> {
    const { app, file, enableZeroDraftMode, sceneTitle, onOverrideOpen } = options;
    if (!enableZeroDraftMode) return false;

    const cache = app.metadataCache.getFileCache(file);
    const rawFrontmatter = (cache?.frontmatter ?? {}) as Record<string, unknown>;
    const frontmatter = normalizeFrontmatterKeys(rawFrontmatter);
    const stageValue = normalizeYamlValue(frontmatter['Publish Stage']);
    const statusValue = frontmatter['Status'];

    if (!isStageZero(stageValue) || !isStatusComplete(statusValue)) {
        return false;
    }

    const pendingEdits = normalizeYamlValue(frontmatter['Pending Edits']) ?? '';
    const title = sceneTitle || file.basename || 'Scene';
    const { default: ZeroDraftModal } = await import('../../modals/ZeroDraftModal');
    const modal = new ZeroDraftModal(app, {
        titleText: `Pending Edits — ${title}`,
        initialText: pendingEdits,
        onOk: async (nextText: string) => {
            try {
                await app.fileManager.processFrontMatter(file, (yaml: Record<string, unknown>) => {
                    yaml['Pending Edits'] = nextText;
                });
            } catch (e) {
                // SAFE: Notice suppressed here to avoid UI noise; modal informs user on failure
            }
        },
        onOverride: async () => {
            await onOverrideOpen();
        }
    });
    modal.open();
    return true;
}
