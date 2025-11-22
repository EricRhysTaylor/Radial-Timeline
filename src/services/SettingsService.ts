import { normalizePath, TFolder } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { DEFAULT_SETTINGS } from '../main';
import type { AiContextTemplate } from '../types/settings';

export class SettingsService {
    constructor(private plugin: RadialTimelinePlugin) {}

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

    normalizeModelIds(): void {
        const defaultGeminiModel = DEFAULT_SETTINGS.geminiModelId || 'gemini-3-pro-preview';
        const normalize = (prov: 'anthropic' | 'openai' | 'gemini', id: string | undefined): string => {
            if (!id) return id as unknown as string;
            if (prov === 'anthropic') {
                if (id === 'claude-4.1-opus' || id === 'claude-opus-4-1' || id === 'claude-3-opus-20240229' || id === 'claude-opus-4-0' || id === 'claude-opus-4-1@20250805') return 'claude-opus-4-1-20250805';
                if (id === 'claude-4-sonnet' || id === 'claude-sonnet-4-1' || id === 'claude-3-7-sonnet-20250219' || id === 'claude-sonnet-4-0' || id === 'claude-sonnet-4-1@20250805' || id === 'claude-sonnet-4-20250514') return 'claude-sonnet-4-5-20250929';
                return id;
            }
            if (prov === 'openai') {
                if (id === 'gpt-5' || id === 'o3' || id === 'gpt-4o') return 'gpt-4.1';
                return id;
            }
            if (prov === 'gemini') {
                let trimmed = id.trim();
                // Strip 'models/' prefix if present
                if (trimmed.startsWith('models/')) {
                    trimmed = trimmed.slice(7);
                }
                const legacyGeminiIds = new Set([
                    'gemini-ultra',
                    'gemini-creative',
                    'gemini-1.0-pro',
                    'gemini-1.5-pro',
                    'gemini-2.5-pro',
                    'gemini-2.0-flash-exp'
                ]);
                if (legacyGeminiIds.has(trimmed)) {
                    return defaultGeminiModel;
                }
                return trimmed;
            }
            return id;
        };

        const settings = this.plugin.settings;
        settings.anthropicModelId = normalize('anthropic', settings.anthropicModelId);
        settings.openaiModelId = normalize('openai', settings.openaiModelId);
        settings.geminiModelId = normalize('gemini', settings.geminiModelId);
    }

    async migrateAiContextTemplates(): Promise<boolean> {
        const settings = this.plugin.settings;
        let migrated = false;
        const oldBuiltInIds = new Set(['generic-editor', 'ya-biopunk-scifi', 'adult-thriller', 'adult-romance']);

        const cloneBuiltInTemplates = (): AiContextTemplate[] =>
            (DEFAULT_SETTINGS.aiContextTemplates ?? []).map(template => ({ ...template }));

        if (!settings.aiContextTemplates || settings.aiContextTemplates.length === 0) {
            settings.aiContextTemplates = cloneBuiltInTemplates();
            migrated = true;
        } else {
            const builtInTemplates = cloneBuiltInTemplates();
            settings.aiContextTemplates = settings.aiContextTemplates.filter(template => !template.isBuiltIn || !oldBuiltInIds.has(template.id));
            const existingIds = new Set(settings.aiContextTemplates.map(t => t.id));
            for (const builtIn of builtInTemplates) {
                if (!existingIds.has(builtIn.id)) {
                    settings.aiContextTemplates.push({ ...builtIn });
                    migrated = true;
                }
            }
        }

        if (!settings.activeAiContextTemplateId || oldBuiltInIds.has(settings.activeAiContextTemplateId)) {
            settings.activeAiContextTemplateId = DEFAULT_SETTINGS.activeAiContextTemplateId;
            migrated = true;
        }

        return migrated;
    }
}
