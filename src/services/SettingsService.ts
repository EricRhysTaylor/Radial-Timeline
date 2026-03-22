import { normalizePath, TFolder } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { DEFAULT_SETTINGS } from '../settings/defaults';

export class SettingsService {
    constructor(private plugin: RadialTimelinePlugin) { }

    async validateAndRememberPath(path: string): Promise<boolean> {
        if (!path || path.trim() === '') return false;

        const normalizedPath = normalizePath(path.trim());
        const file = this.plugin.app.vault.getAbstractFileByPath(normalizedPath);
        const isValid = file instanceof TFolder && file.path === normalizedPath;

        if (isValid) {
            const { validFolderPaths } = this.plugin.settings;
            if (!validFolderPaths.includes(normalizedPath)) {
                validFolderPaths.unshift(normalizedPath);
                if (validFolderPaths.length > 10) {
                    this.plugin.settings.validFolderPaths = validFolderPaths.slice(0, 10);
                }
                await this.plugin.saveSettings();
            }
            return true;
        }

        return false;
    }

    migrateInquiryActionNotesTargetField(): boolean {
        const current = this.plugin.settings.inquiryActionNotesTargetField;
        if (!current) return false;
        const normalized = current.trim().toLowerCase();
        if (normalized !== 'revision' && normalized !== 'revisions') return false;
        this.plugin.settings.inquiryActionNotesTargetField = DEFAULT_SETTINGS.inquiryActionNotesTargetField || 'Pending Edits';
        return true;
    }
}
