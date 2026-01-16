import { App, normalizePath, TFile, TFolder, TAbstractFile } from 'obsidian';
import type { RadialTimelineSettings } from '../../types';
import { DEFAULT_INQUIRY_ARTIFACT_FOLDER } from '../constants';

export function resolveInquiryArtifactFolder(settings: RadialTimelineSettings): string {
    const raw = settings.inquiryArtifactFolder?.trim() || DEFAULT_INQUIRY_ARTIFACT_FOLDER;
    return normalizePath(raw);
}

export async function ensureInquiryArtifactFolder(
    app: App,
    settings: RadialTimelineSettings
): Promise<TFolder | null> {
    const folderPath = resolveInquiryArtifactFolder(settings);
    const existing = app.vault.getAbstractFileByPath(folderPath);
    if (existing && !(existing instanceof TFolder)) {
        return null;
    }
    try {
        await app.vault.createFolder(folderPath);
    } catch {
        // Folder may already exist.
    }
    const folder = app.vault.getAbstractFileByPath(folderPath);
    return folder instanceof TFolder ? folder : null;
}

export function getMostRecentArtifactFile(
    app: App,
    settings: RadialTimelineSettings
): TFile | null {
    const folderPath = resolveInquiryArtifactFolder(settings);
    const folder = app.vault.getAbstractFileByPath(folderPath);
    if (!folder || !(folder instanceof TFolder)) return null;

    let latest: TFile | null = null;

    const scan = (node: TAbstractFile) => {
        if (node instanceof TFile) {
            if (node.extension === 'md') {
                if (!latest || node.stat.mtime > latest.stat.mtime) {
                    latest = node;
                }
            }
            return;
        }
        if (node instanceof TFolder) {
            node.children.forEach(child => scan(child));
        }
    };

    scan(folder);
    return latest;
}
