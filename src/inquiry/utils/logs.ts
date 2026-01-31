import { App, normalizePath, TFolder } from 'obsidian';
import { DEFAULT_INQUIRY_CONTENT_LOG_FOLDER, DEFAULT_INQUIRY_LOG_FOLDER } from '../constants';

export function resolveInquiryLogFolder(): string {
    return normalizePath(DEFAULT_INQUIRY_LOG_FOLDER);
}

export function resolveInquiryContentLogFolder(): string {
    return normalizePath(DEFAULT_INQUIRY_CONTENT_LOG_FOLDER);
}

export async function ensureInquiryLogFolder(app: App): Promise<TFolder | null> {
    const folderPath = resolveInquiryLogFolder();
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

export async function ensureInquiryContentLogFolder(app: App): Promise<TFolder | null> {
    const folderPath = resolveInquiryContentLogFolder();
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
